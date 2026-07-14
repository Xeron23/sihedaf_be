import cron from "node-cron";
import logger from "../utils/logger.js";
import { sweepOfflineDevices } from "./device-offline.jobs.js";

export function startSchedulers() {
    logger.info("[JOB] Device Offline Sweeper started (Cron: Tiap 2 Menit)");
    
    // Sweeper berjalan setiap 2 menit untuk membersihkan label database
    cron.schedule("*/2 * * * *", async () => {
        try {
            await sweepOfflineDevices();
        } catch (e) {
            logger.error("[JOB] Cron sweepOfflineDevices error:", e);
        }
    });
}
