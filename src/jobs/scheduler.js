import cron from "node-cron";
import logger from "../utils/logger.js";
import { sweepOfflineDevices } from "./device-offline.jobs.js";

export function startSchedulers() {
    // Karena kita butuh interval tiap 10-15 detik, node-cron standar (min 1 menit) bisa diakali
    // dengan setInterval, atau kita buat loop setInterval khusus agar lebih ringan.
    
    logger.info("[JOB] Device Offline Sweeper started (Interval: 15s)");
    
    setInterval(async () => {
        try {
            await sweepOfflineDevices();
        } catch (e) {
            logger.error("[JOB] Interval sweepOfflineDevices error:", e);
        }
    }, 15000); // Jalan setiap 15 detik
}
