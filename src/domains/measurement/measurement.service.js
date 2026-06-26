import prisma from "../../config/db.js";
import BaseError from "../../base_classes/base-error.js";
import { getMqttClient } from "../../config/mqtt.js";
import logger from "../../utils/logger.js";

class MeasurementService {
    async startMeasurement(userId, deviceNumber) {
        let device = await prisma.device.findUnique({ where: { deviceNumber }});
        if (!device) {
            device = await prisma.device.create({
                data: { deviceNumber, status: "ONLINE" }
            });
        }

        const activeMeasure = await prisma.measurement.findFirst({
            where: { deviceId: device.id, status: "IN_PROGRESS" }
        });

        if (activeMeasure) {
            throw BaseError.badRequest("Jam masih memproses pengukuran lain. Harap tunggu.");
        }

        const measurement = await prisma.measurement.create({
            data: {
                userId: userId,
                deviceId: device.id,
                status: "IN_PROGRESS"
            }
        });

        try {
            const mqttClient = getMqttClient();
            if (mqttClient) {
                // Sesuai handbook: kirim text "START" ke watch/<MAC_ADDRESS>/status
                mqttClient.publish(`watch/${deviceNumber}/status`, "START");
                logger.info(`[MQTT] Published START command to watch/${deviceNumber}/status`);
            }
        } catch (error) {
            logger.error(`[MQTT] Failed to publish start command: ${error.message}`);
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

        try {
            const mqttClient = getMqttClient();
            if (mqttClient) {
                // Sesuai handbook: kirim text "STOP" ke watch/<MAC_ADDRESS>/status
                mqttClient.publish(`watch/${deviceNumber}/status`, "STOP");
                logger.info(`[MQTT] Published STOP command to watch/${deviceNumber}/status`);
            }
        } catch (error) {
            logger.error(`[MQTT] Failed to publish stop command: ${error.message}`);
        }

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
