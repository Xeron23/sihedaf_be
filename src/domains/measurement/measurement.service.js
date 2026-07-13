import prisma from "../../config/db.js";
import BaseError from "../../base_classes/base-error.js";
import logger from "../../utils/logger.js";

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

        // Lempar ke AI (Import ditarik dari IotService / mockup)
        let isAfib = false;
        try {
            // Untuk prototipe, AI selalu mengembalikan false (Bisa dihubungkan ke Python API nanti)
            isAfib = false;
        } catch (error) {
            logger.error("[AI Error]: " + error.message);
        }

        // Update database untuk menutup sesi (bukan di-delete)
        await prisma.$transaction(async (tx) => {
            await tx.measurement.update({
                where: { id: activeMeasure.id },
                data: { status: "COMPLETED", completedAt: new Date() }
            });

            // Hanya buat notifikasi jika ada data yang sempat terekam
            if (fullArray.length > 0) {
                if (isAfib) {
                    await tx.notification.create({
                        data: {
                            userId: activeMeasure.userId,
                            title: "Medical Alert!",
                            message: "AI system detected an indication of Atrial Fibrillation (AF) pattern.",
                            type: "AF_DETECTED"
                        }
                    });
                } else {
                    await tx.notification.create({
                        data: {
                            userId: activeMeasure.userId,
                            title: "Measurement Completed",
                            message: "Your heart rate analysis result is within normal limits.",
                            type: "SYSTEM_INFO"
                        }
                    });
                }
            }
        });

        return { 
            message: "Measurement stopped successfully. Data has been saved and analyzed.",
            afibDetected: isAfib, 
            totalDataSaved: fullArray.length 
        };
    }

    async getHistory(userId) {
        return await prisma.measurement.findMany({
            where: { userId },
            include: { ppgResult: true, device: true },
            orderBy: { requestedAt: "desc" }
        });
    }
}
export default new MeasurementService();
