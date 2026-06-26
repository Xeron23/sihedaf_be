import prisma from "../../config/db.js";
import BaseError from "../../base_classes/base-error.js";
import axios from "axios";

class IotService {
    // Dipanggil oleh Jam Pintar untuk mengecek apakah ada user yang menekan tombol "Measure Now"
    async checkPendingTask(deviceNumber) {
        const device = await prisma.device.findUnique({ where: { deviceNumber }});
        if (!device) throw BaseError.notFound("Device not registered in system.");

        // Heartbeat update (Tandai jam sedang online)
        await prisma.device.update({
            where: { id: device.id },
            data: { status: "ONLINE", lastSeen: new Date() }
        });

        // Cari pengukuran IN_PROGRESS
        const pendingMeasure = await prisma.measurement.findFirst({
            where: { deviceId: device.id, status: "IN_PROGRESS" },
            orderBy: { requestedAt: "desc" }
        });

        return { hasTask: !!pendingMeasure, measurementId: pendingMeasure?.id };
    }

    // Dipanggil oleh Jam Pintar setelah selesai mengukur (Uplink PPG Data)
    async submitData(deviceNumber, rawPpgData) {
        const device = await prisma.device.findUnique({ where: { deviceNumber }});
        if (!device) throw BaseError.notFound("Device not registered");

        const activeMeasure = await prisma.measurement.findFirst({
            where: { deviceId: device.id, status: "IN_PROGRESS" },
            orderBy: { requestedAt: "desc" }
        });

        if (!activeMeasure) throw BaseError.badRequest("Tidak ada sesi pengukuran aktif untuk jam ini.");

        // Analisis Algoritma dengan AI Eksternal
        const isAfib = await this.detectAfibAlgorithm(rawPpgData);

        // Menggunakan Database Transaction (ACID) agar PpgResult, Measurement, dan Notification tersimpan sempurna
        const result = await prisma.$transaction(async (tx) => {
            const ppg = await tx.ppgResult.create({
                data: {
                    measurementId: activeMeasure.id,
                    deviceId: device.id,
                    rawPpgData: rawPpgData
                }
            });

            await tx.measurement.update({
                where: { id: activeMeasure.id },
                data: { status: "COMPLETED", completedAt: new Date() }
            });

            if (isAfib) {
                await tx.notification.create({
                    data: {
                        userId: activeMeasure.userId,
                        title: "Peringatan Medis!",
                        message: "Sistem AI mendeteksi adanya indikasi pola Atrial Fibrillation (AF) dari pengukuran Anda. Harap segera periksakan diri ke dokter.",
                        type: "AF_DETECTED"
                    }
                });
            } else {
                await tx.notification.create({
                    data: {
                        userId: activeMeasure.userId,
                        title: "Pengukuran Selesai",
                        message: "Hasil analisis detak jantung Anda berada dalam batas normal. Tetap jaga kesehatan!",
                        type: "SYSTEM_INFO"
                    }
                });
            }

            return { ppgId: ppg.id, afibDetected: isAfib };
        });

        return result;
    }

    async detectAfibAlgorithm(rawPpgData) {
        try {
            // Setup Scaffolding API untuk AI
            // NOTE: Uncomment blok di bawah ini jika endpoint AI sudah tersedia
            
            /*
            const aiEndpoint = process.env.AI_SERVICE_URL || "http://localhost:5000/api/predict";
            const response = await axios.post(aiEndpoint, {
                data: rawPpgData // Payload body ke model AI Python
            }, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // Timeout 10 detik agar sistem tidak hang jika AI lambat
            });

            // Asumsi AI mengembalikan { is_afib: boolean, confidence: number }
            return response.data.is_afib === true;
            */

            // Untuk saat ini (Base Prototype): Selalu kembalikan normal (false)
            return false;

        } catch (error) {
            console.error("[AI Analysis Error]:", error.message);
            // Fallback fail-safe: Jika AI mati, anggap normal dulu agar flow tidak putus, 
            // atau bisa diset true jika butuh false-positive (tergantung kebutuhan medis).
            return false; 
        }
    }
}
export default new IotService();
