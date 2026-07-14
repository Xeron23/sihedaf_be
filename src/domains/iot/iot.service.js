import prisma from "../../config/db.js";
import BaseError from "../../base_classes/base-error.js";
import axios from "axios";
import { getIo } from "../../config/socket.js";
import logger from "../../utils/logger.js";

class IotService {
    // Dipanggil oleh Jam Pintar untuk mengecek apakah ada perintah (Polling tiap 5 detik)
    async checkPendingTask(deviceNumber) {
        // Otomatis daftarkan/update status perangkat jika memanggil poll
        const device = await prisma.device.upsert({
            where: { deviceNumber },
            update: { status: "ONLINE", lastSeen: new Date() },
            create: { deviceNumber, status: "ONLINE", lastSeen: new Date() }
        });

        // Cari pengukuran IN_PROGRESS
        const pendingMeasure = await prisma.measurement.findFirst({
            where: { deviceId: device.id, status: "IN_PROGRESS" },
            orderBy: { requestedAt: "desc" }
        });

        return { hasTask: !!pendingMeasure, measurementId: pendingMeasure?.id };
    }

    // Dipanggil oleh Jam Pintar setelah mengumpulkan data 2 detik
    async submitData(deviceNumber, rawPpgData, isFinished) {
        const device = await prisma.device.findUnique({ where: { deviceNumber } });
        if (!device) throw BaseError.notFound("Device not registered");

        const activeMeasure = await prisma.measurement.findFirst({
            where: { deviceId: device.id, status: "IN_PROGRESS" },
            orderBy: { requestedAt: "desc" }
        });

        // Jika user sudah menekan STOP di HP, tapi jam masih ngirim data
        if (!activeMeasure) {
            return { status: "STOP", message: "No active measurement, stop sensor." };
        }

        // ==========================================
        // 1. EMIT WEBSOCKET KE FRONTEND (REALTIME)
        // ==========================================
        const io = getIo();
        if (io && rawPpgData && rawPpgData.length > 0) {
            io.emit(`live_graph_${deviceNumber}`, rawPpgData);
            logger.info(`[Socket] Emitted ${rawPpgData.length} data points to FE for device ${deviceNumber}`);
        }

        // ==========================================
        // 2. SIMPAN/APPEND DATA KE DATABASE (PpgResult)
        // ==========================================
        if (rawPpgData && rawPpgData.length > 0) {
            // Cek apakah PpgResult sudah dibuat sebelumnya di sesi ini
            const existingPpg = await prisma.ppgResult.findUnique({
                where: { measurementId: activeMeasure.id }
            });

            if (existingPpg) {
                // Konversi dari JSON ke Array, gabungkan, simpan lagi
                let currentArray = Array.isArray(existingPpg.rawPpgData) ? existingPpg.rawPpgData : [];
                let newArray = currentArray.concat(rawPpgData);
                
                await prisma.ppgResult.update({
                    where: { measurementId: activeMeasure.id },
                    data: { rawPpgData: newArray }
                });
            } else {
                // Buat PpgResult pertama kali
                await prisma.ppgResult.create({
                    data: {
                        measurementId: activeMeasure.id,
                        deviceId: device.id,
                        rawPpgData: rawPpgData
                    }
                });
            }
        }

        // ==========================================
        // 3. JIKA BELUM SELESAI (isFinished = false)
        // ==========================================
        if (!isFinished) {
            return { status: "CONTINUE" }; // Suruh jam lanjut ngukur 2 detik lagi
        }

        // ==========================================
        // 4. JIKA SELESAI (isFinished = true) -> EKSEKUSI AI
        // ==========================================
        const finalPpg = await prisma.ppgResult.findUnique({ where: { measurementId: activeMeasure.id } });
        const fullArray = finalPpg && Array.isArray(finalPpg.rawPpgData) ? finalPpg.rawPpgData : [];

        // Lempar ke AI
        let predictionClass = 0;
        let predictionLabel = "Normal (N)";
        let confidenceLevel = 0.0;
        let isAfib = false;
        
        try {
            logger.info(`[AI] Mengirim ${fullArray.length} data PPG ke AI...`);
            // Note: Gunakan IP VPN atau localhost jika satu server
            const aiResponse = await axios.post("http://192.168.88.3:8000/predict", {
                raw_ppg: fullArray,
                sampling_rate: 50 // Sesuaikan jika ada sampling rate berbeda dari jam
            }, { timeout: 10000 });
            
            const aiData = aiResponse.data;
            if(aiData && aiData.status === "success") {
                predictionClass = aiData.prediction_class;
                predictionLabel = aiData.prediction_label;
                
                // Ambil confidence level dari key yang berawalan dari label
                const labelKey = predictionLabel.split(" ")[0]; // "Normal", "AFIB", "Atrial"
                confidenceLevel = aiData.confidence[labelKey] || aiData.confidence["Normal"] || 0;
                
                isAfib = (predictionClass === 1); // 1 = AFIB
                logger.info(`[AI] Hasil: ${predictionLabel} (Confidence: ${confidenceLevel})`);
            }
        } catch (error) {
            logger.error(`[AI Error]: Gagal menghubungi layanan AI - ${error.message}`);
            // Fallback default jika AI mati
        }

        // Update database untuk menutup sesi
        const result = await prisma.$transaction(async (tx) => {
            await tx.measurement.update({
                where: { id: activeMeasure.id },
                data: { 
                    status: "COMPLETED", 
                    completedAt: new Date(),
                    resultClass: predictionClass,
                    resultLabel: predictionLabel,
                    confidenceLevel: confidenceLevel
                }
            });

            if (predictionClass === 1) { // AFIB
                await tx.notification.create({
                    data: {
                        userId: activeMeasure.userId,
                        title: "Medical Alert!",
                        message: "Sistem AI mendeteksi indikasi Atrial Fibrillation (AFIB). Silakan konsultasi dengan dokter Anda.",
                        type: "AF_DETECTED"
                    }
                });
            } else if (predictionClass === 2) { // AFL
                await tx.notification.create({
                    data: {
                        userId: activeMeasure.userId,
                        title: "Medical Alert!",
                        message: "Sistem AI mendeteksi indikasi Atrial Flutter (AFL). Silakan perhatikan kondisi Anda.",
                        type: "AF_DETECTED"
                    }
                });
            } else { // Normal (0)
                await tx.notification.create({
                    data: {
                        userId: activeMeasure.userId,
                        title: "Pengukuran Selesai",
                        message: "Hasil analisis detak jantung Anda berada dalam batas Normal.",
                        type: "SYSTEM_INFO"
                    }
                });
            }

            return { 
                status: "STOP", 
                message: "Measurement completed", 
                resultClass: predictionClass, 
                resultLabel: predictionLabel,
                totalData: fullArray.length 
            };
        });

        return result;
    }
}
export default new IotService();