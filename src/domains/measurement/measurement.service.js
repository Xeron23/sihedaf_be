import prisma from "../../config/db.js";
import BaseError from "../../base_classes/base-error.js";
import logger from "../../utils/logger.js";
import axios from "axios";

class MeasurementService {
    
    async bindDevice(userId, deviceNumber) {
        // Cek apakah device ada (sudah dipanggil /poll setidaknya 1x oleh jam)
        let device = await prisma.device.findUnique({ where: { deviceNumber }});
        
        if (!device) {
            throw BaseError.badRequest("Device not connected to the system. Ensure the watch is turned on.");
        }

        if (device.status === "OFFLINE") {
            throw BaseError.badRequest("Device is offline. Please turn on the watch before binding.");
        }

        // Cek apakah jam sudah dipakai orang lain
        const existingUser = await prisma.user.findFirst({ where: { deviceId: device.id }});
        
        // Cek apakah perangkat sedang melakukan pengukuran (IN_PROGRESS)
        const activeMeasurement = await prisma.measurement.findFirst({
            where: { deviceId: device.id, status: "IN_PROGRESS" }
        });

        if (activeMeasurement) {
            throw BaseError.badRequest("Jam sedang digunakan untuk pengukuran oleh pengguna lain. Harap tunggu hingga selesai.");
        }

        // [PROTOTYPE MODE]
        // Jika sedang presentasi dan hanya ada 1 jam fisik, kita mengizinkan akun B 
        // merebut jam milik akun A. Kita harus melepas jam dari akun A terlebih dahulu.
        if (existingUser && existingUser.id !== userId) {
            // Nanti kalau production, GANTI blok ini dengan:
            // throw BaseError.badRequest("This device is already registered by another account.");
            
            await prisma.user.update({
                where: { id: existingUser.id },
                data: { deviceId: null }
            });
        }

        // Bind device ke User saat ini
        await prisma.user.update({
            where: { id: userId },
            data: { deviceId: device.id }
        });

        return { message: "Device successfully bound to your account." };
    }

    async getMyDevice(userId) {
        const user = await prisma.user.findUnique({ 
            where: { id: userId },
            include: { device: true }
        });
        return user.device;
    }

    async startMeasurement(userId) {
        // 1. Ambil device yang ter-bind di akun ini
        const user = await prisma.user.findUnique({ where: { id: userId }, include: { device: true }});
        if (!user || !user.deviceId) {
            throw BaseError.badRequest("You have not bound any watch device. Please register a device first.");
        }

        const device = user.device;
        const deviceNumber = device.deviceNumber;

        // Toleransi jaringan: Jika jam tidak ngabarin (polling) dalam 30 detik terakhir (6x siklus), tolak START
        const threshold = new Date(Date.now() - 30 * 1000);
        
        if (device.status === "OFFLINE" || !device.lastSeen || device.lastSeen < threshold) {
            throw BaseError.badRequest("Perangkat (Jam Pintar) sedang offline atau koneksi tidak stabil. Pastikan jam menyala dan terhubung ke internet sebelum memulai pengukuran.");
        }

        // 2. Cek apakah perangkat sedang mengukur
        const activeMeasure = await prisma.measurement.findFirst({
            where: { deviceId: device.id, status: "IN_PROGRESS" }
        });

        if (activeMeasure) {
            throw BaseError.badRequest("Jam masih memproses pengukuran lain. Harap tunggu.");
        }

        // 3. Buat sesi
        const measurement = await prisma.measurement.create({
            data: {
                userId: userId,
                deviceId: device.id,
                status: "IN_PROGRESS"
            }
        });

        // 4. Murni Database (Jam akan tahu lewat Polling HTTP)
        logger.info(`[HTTP] Measurement started for watch/${deviceNumber}`);

        return measurement;
    }

    async stopMeasurement(userId) {
        const user = await prisma.user.findUnique({ where: { id: userId }, include: { device: true }});
        if (!user || !user.deviceId) {
            throw BaseError.badRequest("No device connected to your account.");
        }

        const device = user.device;
        const deviceNumber = device.deviceNumber;

        const activeMeasure = await prisma.measurement.findFirst({
            where: { deviceId: device.id, status: "IN_PROGRESS", userId: userId }
        });

        if (!activeMeasure) {
            throw BaseError.badRequest("You do not have any active measurement session.");
        }

        // ==========================================
        // EKSEKUSI AI JIKA DI-STOP MANUAL OLEH FE
        // ==========================================
        const finalPpg = await prisma.ppgResult.findUnique({ where: { measurementId: activeMeasure.id } });
        const fullArray = finalPpg && Array.isArray(finalPpg.rawPpgData) ? finalPpg.rawPpgData : [];

        let predictionClass = 0;
        let predictionLabel = "Normal (N)";
        let confidenceLevel = 0.0;
        
        if (fullArray.length >= 150) { // Butuh minimal 3 detik (50hz x 3 = 150) data untuk dianalisis
            try {
                logger.info(`[AI] Mengirim ${fullArray.length} data PPG ke AI (Manual Stop)...`);
                const aiResponse = await axios.post("http://192.168.88.3:8000/predict", {
                    raw_ppg: fullArray,
                    sampling_rate: 50
                }, { timeout: 10000 });
                
                const aiData = aiResponse.data;
                if(aiData && aiData.status === "success") {
                    predictionClass = aiData.prediction_class;
                    predictionLabel = aiData.prediction_label;
                    const labelKey = predictionLabel.split(" ")[0];
                    confidenceLevel = aiData.confidence[labelKey] || aiData.confidence["Normal"] || 0;
                }
            } catch (error) {
                logger.error(`[AI Error] (Manual Stop): Gagal menghubungi layanan AI - ${error.message}`);
            }
        } else if (fullArray.length > 0) {
            logger.warn(`[AI] Data terlalu pendek (${fullArray.length} titik) untuk dianalisa AI.`);
            predictionLabel = "Not Enough Data";
        }

        // Update database untuk menutup sesi (bukan di-delete)
        await prisma.$transaction(async (tx) => {
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

            // Hanya buat notifikasi jika ada data yang sempat terekam (cukup untuk diolah)
            if (fullArray.length >= 150) {
                if (predictionClass === 1) { // AFIB
                    await tx.notification.create({
                        data: {
                            userId: activeMeasure.userId,
                            title: "Medical Alert!",
                            message: "Sistem AI mendeteksi indikasi Atrial Fibrillation (AFIB).",
                            type: "AF_DETECTED"
                        }
                    });
                } else if (predictionClass === 2) { // AFL
                    await tx.notification.create({
                        data: {
                            userId: activeMeasure.userId,
                            title: "Medical Alert!",
                            message: "Sistem AI mendeteksi indikasi Atrial Flutter (AFL).",
                            type: "AF_DETECTED"
                        }
                    });
                } else {
                    await tx.notification.create({
                        data: {
                            userId: activeMeasure.userId,
                            title: "Pengukuran Selesai",
                            message: "Hasil analisis detak jantung Anda berada dalam batas Normal.",
                            type: "SYSTEM_INFO"
                        }
                    });
                }
            }
        });

        return { 
            message: "Measurement stopped successfully. Data has been saved and analyzed.",
            resultClass: predictionClass, 
            resultLabel: predictionLabel,
            totalDataSaved: fullArray.length 
        };
    }

    async getHistory(userId, filters) {
        const { page, limit, startDate, endDate } = filters;
        
        // Setup pagination
        const skip = (page - 1) * limit;

        // Setup query where clauses
        let whereClause = { userId };

        // Handle date filtering
        if (startDate && endDate) {
            // Jika ada range tanggal start - end
            whereClause.completedAt = {
                gte: new Date(`${startDate}T00:00:00.000Z`),
                lte: new Date(`${endDate}T23:59:59.999Z`)
            };
        } else if (startDate && !endDate) {
            // Jika hanya 1 tanggal spesifik (hanya kirim startDate)
            whereClause.completedAt = {
                gte: new Date(`${startDate}T00:00:00.000Z`),
                lte: new Date(`${startDate}T23:59:59.999Z`)
            };
        }

        // Get total records matching the criteria (for pagination metadata)
        const total = await prisma.measurement.count({
            where: whereClause
        });

        // Get the paginated data
        const data = await prisma.measurement.findMany({
            where: whereClause,
            include: { ppgResult: true, device: true },
            orderBy: { requestedAt: "desc" },
            skip,
            take: limit
        });

        return {
            metadata: {
                totalData: total,
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                limit: limit
            },
            data
        };
    }

    async getLatestMeasurement(userId) {
        // Ambil 1 baris paling baru yang statusnya COMPLETED (supaya dapat result AI)
        const latest = await prisma.measurement.findFirst({
            where: { 
                userId, 
                status: "COMPLETED" 
            },
            include: { ppgResult: true, device: true },
            orderBy: { completedAt: "desc" }
        });

        if (!latest) {
            return null; // Return null jika belum pernah ada riwayat
        }

        return latest;
    }

    async getSignalsByTime(userId, minutes) {
        // 1. Hitung threshold waktu batas mundur
        const thresholdDate = new Date(Date.now() - (minutes * 60 * 1000));

        // 2. Ambil semua measurement milik user yang selesai (COMPLETED) di dalam rentang waktu tersebut
        const measurements = await prisma.measurement.findMany({
            where: {
                userId: userId,
                status: "COMPLETED",
                completedAt: {
                    gte: thresholdDate // Greater than or equal to batas waktu mundur
                }
            },
            include: { ppgResult: true },
            orderBy: { completedAt: "asc" } // Urutkan dari yang paling lama ke yang paling baru
        });

        // 3. Gabungkan (flatten) semua rawPpgData yang didapat di rentang waktu tersebut
        let combinedSignals = [];
        let totalSessions = 0;

        for (const m of measurements) {
            if (m.ppgResult && Array.isArray(m.ppgResult.rawPpgData)) {
                combinedSignals = combinedSignals.concat(m.ppgResult.rawPpgData);
                totalSessions += 1;
            }
        }

        return {
            timeframe_minutes: minutes,
            sessions_found: totalSessions,
            total_points: combinedSignals.length,
            rawPpgData: combinedSignals
        };
    }
}
export default new MeasurementService();
