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
        
        // [PROTOTYPE MODE]
        // Jika sedang presentasi dan hanya ada 1 jam fisik, kita "memaafkan" kalau akun B 
        // merebut jam milik akun A.
        if (existingUser && existingUser.id !== userId) {
            // Nanti kalau production, UNCOMMENT line di bawah ini:
            // throw BaseError.badRequest("This device is already registered by another account.");
        }

        // Bind device ke User
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

        // Hapus (Cancel) secara silent di DB. Nanti jam akan mendapat balasan { status: "STOP" } pas dia kirim cicilan berikutnya.
        await prisma.measurement.delete({
            where: { id: activeMeasure.id }
        });

        return { message: "Stop command sent to watch." };
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
