import prisma from "../../config/db.js";
import BaseError from "../../base_classes/base-error.js";
import { getMqttClient } from "../../config/mqtt.js";
import logger from "../../utils/logger.js";

class MeasurementService {
    async startMeasurement(userId, deviceNumber) {
        // 1. Pastikan device ada di database (Otomatis daftar untuk prototipe jika belum ada)
        let device = await prisma.device.findUnique({ where: { deviceNumber }});
        if (!device) {
            device = await prisma.device.create({
                data: { deviceNumber, status: "ONLINE" }
            });
        }

        // 2. Cek apakah jam tersebut sedang sibuk / dipakai mengukur
        const activeMeasure = await prisma.measurement.findFirst({
            where: { deviceId: device.id, status: "IN_PROGRESS" }
        });

        if (activeMeasure) {
            throw BaseError.badRequest("Jam masih memproses pengukuran lain. Harap tunggu.");
        }

        // 3. Buat sesi pengukuran baru
        const measurement = await prisma.measurement.create({
            data: {
                userId: userId,
                deviceId: device.id,
                status: "IN_PROGRESS"
            }
        });

        // 4. Kirim trigger MQTT ke Jam Hardware (Metode MQTT Publish "Opsi 2")
        try {
            const mqttClient = getMqttClient();
            if (mqttClient) {
                // Command dikirim ke topic: watch/{deviceNumber}/command
                // Payload: {"cmd": "START"}
                mqttClient.publish(`watch/${deviceNumber}/command`, JSON.stringify({ cmd: "START" }));
                logger.info(`[MQTT] Published START command to watch/${deviceNumber}/command`);
            }
        } catch (error) {
            logger.error(`[MQTT] Failed to publish start command: ${error.message}`);
            // Kita tidak throw error agar web tetap mengembalikan success ke mobile app, 
            // jam bisa fallback pakai HTTP Polling jika hardwarenya mensupport hybrid.
        }

        return measurement;
    }

    async stopMeasurement(userId, deviceNumber) {
        let device = await prisma.device.findUnique({ where: { deviceNumber }});
        if (!device) throw BaseError.notFound("Device not found");

        const activeMeasure = await prisma.measurement.findFirst({
            where: { deviceId: device.id, status: "IN_PROGRESS", userId: userId }
        });

        if (!activeMeasure) {
            throw BaseError.badRequest("Anda tidak sedang melakukan pengukuran.");
        }

        // Kirim trigger MQTT Stop ke Hardware
        try {
            const mqttClient = getMqttClient();
            if (mqttClient) {
                mqttClient.publish(`watch/${deviceNumber}/command`, JSON.stringify({ cmd: "STOP" }));
                logger.info(`[MQTT] Published STOP command to watch/${deviceNumber}/command`);
            }
        } catch (error) {
            logger.error(`[MQTT] Failed to publish stop command: ${error.message}`);
        }

        // NOTE: Status diubah menjadi COMPLETED saat jam membalas MQTT "FINISHED" di iot.service, 
        // bukan di sini agar datanya tidak terputus di tengah jalan.
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
