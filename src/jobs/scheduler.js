import cron from "node-cron";
import logger from "../utils/logger.js";
import { sweepOfflineDevices } from "./device-offline.jobs.js";

export function startSchedulers() {
    logger.info("[JOB] Device Offline Sweeper started (Cron: Tiap 1 Menit)");
    
    // Karena kita toleransi offline 20 detik, kita bisa menjalankan sweeper ini setiap menit (lebih efisien untuk CPU)
    cron.schedule("* * * * *", async () => {
        try {
            await sweepOfflineDevices();
        } catch (e) {
            logger.error("[JOB] Cron sweepOfflineDevices error:", e);
        }
    });
}
