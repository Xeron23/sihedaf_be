import prisma from "../config/db.js";
import logger from "../utils/logger.js";

export async function sweepOfflineDevices() {
    try {
        // Toleransi waktu: 15 detik (jika tidak ada polling selama 15 detik, anggap offline)
        const threshold = new Date(Date.now() - 15 * 1000);

        // Update status menjadi OFFLINE untuk device yang lastSeen-nya lebih lama dari threshold
        // Tapi HANYA jika status saat ini masih ONLINE (menghindari update database berulang yang tidak perlu)
        const result = await prisma.device.updateMany({
            where: {
                status: "ONLINE",
                lastSeen: {
                    lt: threshold
                }
            },
            data: {
                status: "OFFLINE"
            }
        });

        if (result.count > 0) {
            logger.info(`[JOB] sweepOfflineDevices: Set ${result.count} device(s) to OFFLINE.`);
        }

        return { success: true, count: result.count };
    } catch (error) {
        logger.error(`[JOB] sweepOfflineDevices error: ${error.message}`);
        return { success: false, error: error.message };
    }
}
