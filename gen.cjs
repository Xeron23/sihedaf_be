const fs = require('fs');
const path = require('path');

const files = {
// ------------------------------------------------------------------
// NOTIFICATION DOMAIN
// ------------------------------------------------------------------
"src/domains/notification/notification.service.js": `
import prisma from "../../config/db.js";

class NotificationService {
    async getNotifications(userId) {
        return await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" }
        });
    }

    async markAsRead(notificationId, userId) {
        const notif = await prisma.notification.findFirst({
            where: { id: parseInt(notificationId), userId }
        });
        if(!notif) throw new Error("Notification not found");

        return await prisma.notification.update({
            where: { id: notif.id },
            data: { isRead: true }
        });
    }
}
export default new NotificationService();
`,
"src/domains/notification/notification.controller.js": `
import { successResponse } from "../../utils/response.js";
import NotificationService from "./notification.service.js";

class NotificationController {
    async getNotifications(req, res) {
        const data = await NotificationService.getNotifications(req.user.id);
        return successResponse(res, data);
    }
    async markAsRead(req, res) {
        const data = await NotificationService.markAsRead(req.params.id, req.user.id);
        return successResponse(res, data, "Notification marked as read");
    }
}
export default new NotificationController();
`,
"src/domains/notification/notification.route.js": `
import BaseRoutes from "../../base_classes/base-route.js";
import NotificationController from "./notification.controller.js";
import tryCatch from "../../utils/tryCatcher.js";
import AuthMiddleware from "../../middlewares/auth-token-middleware.js";

class NotificationRoutes extends BaseRoutes {
    routes() {
        this.router.use(AuthMiddleware.authenticate);
        this.router.get("/", tryCatch(NotificationController.getNotifications));
        this.router.patch("/:id/read", tryCatch(NotificationController.markAsRead));
    }
}
export default new NotificationRoutes().router;
`,

// ------------------------------------------------------------------
// MEASUREMENT DOMAIN
// ------------------------------------------------------------------
"src/domains/measurement/measurement.service.js": `
import prisma from "../../config/db.js";
import BaseError from "../../base_classes/base-error.js";

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

        // 3. Buat sesi pengukuran baru (App -> IoT)
        const measurement = await prisma.measurement.create({
            data: {
                userId: userId,
                deviceId: device.id,
                status: "IN_PROGRESS"
            }
        });

        return measurement;
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
`,
"src/domains/measurement/measurement.controller.js": `
import { successResponse } from "../../utils/response.js";
import MeasurementService from "./measurement.service.js";

class MeasurementController {
    async startMeasurement(req, res) {
        const { deviceNumber } = req.body;
        if(!deviceNumber) throw new Error("deviceNumber is required");
        const data = await MeasurementService.startMeasurement(req.user.id, deviceNumber);
        return successResponse(res, data, "Measurement request sent. Menunggu jam...");
    }
    async getHistory(req, res) {
        const data = await MeasurementService.getHistory(req.user.id);
        return successResponse(res, data);
    }
}
export default new MeasurementController();
`,
"src/domains/measurement/measurement.route.js": `
import BaseRoutes from "../../base_classes/base-route.js";
import MeasurementController from "./measurement.controller.js";
import tryCatch from "../../utils/tryCatcher.js";
import AuthMiddleware from "../../middlewares/auth-token-middleware.js";

class MeasurementRoutes extends BaseRoutes {
    routes() {
        this.router.use(AuthMiddleware.authenticate);
        this.router.post("/start", tryCatch(MeasurementController.startMeasurement));
        this.router.get("/history", tryCatch(MeasurementController.getHistory));
    }
}
export default new MeasurementRoutes().router;
`,

// ------------------------------------------------------------------
// IOT DOMAIN (Hardware Facing)
// ------------------------------------------------------------------
"src/domains/iot/iot.service.js": `
import prisma from "../../config/db.js";
import BaseError from "../../base_classes/base-error.js";

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

        // Analisis Algoritma (Expert Layering)
        const isAfib = this.detectAfibAlgorithm(rawPpgData);

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
                        message: "Abnormal Afib pattern terdeteksi dari pengukuran terakhir Anda. Harap segera periksakan diri ke dokter.",
                        type: "AF_DETECTED"
                    }
                });
            } else {
                await tx.notification.create({
                    data: {
                        userId: activeMeasure.userId,
                        title: "Pengukuran Selesai",
                        message: "Hasil pengukuran detak jantung Anda berada dalam batas normal. Tetap jaga kesehatan!",
                        type: "SYSTEM_INFO"
                    }
                });
            }

            return { ppgId: ppg.id, afibDetected: isAfib };
        });

        return result;
    }

    detectAfibAlgorithm(rawPpgData) {
        // Enkapsulasi: Di sinilah algoritma AI Python Anda akan dipanggil nantinya.
        // Untuk mock prototype: Jika jam mengirim property 'forceAfib: true', akan AFIB.
        if(rawPpgData && rawPpgData.forceAfib !== undefined) return rawPpgData.forceAfib === true;
        
        // Random 10% chance untuk demo jika tidak ada flag.
        return Math.random() < 0.1; 
    }
}
export default new IotService();
`,
"src/domains/iot/iot.controller.js": `
import { successResponse } from "../../utils/response.js";
import IotService from "./iot.service.js";

class IotController {
    async pollTask(req, res) {
        const { deviceNumber } = req.params;
        const data = await IotService.checkPendingTask(deviceNumber);
        return successResponse(res, data);
    }

    async submitData(req, res) {
        const { deviceNumber } = req.params;
        const { rawPpgData } = req.body;
        if(!rawPpgData) throw new Error("rawPpgData is required in body payload");
        
        const data = await IotService.submitData(deviceNumber, rawPpgData);
        return successResponse(res, data, "Data from Watch submitted and processed successfully");
    }
}
export default new IotController();
`,
"src/domains/iot/iot.route.js": `
import BaseRoutes from "../../base_classes/base-route.js";
import IotController from "./iot.controller.js";
import tryCatch from "../../utils/tryCatcher.js";

// IoT routes tidak menggunakan AuthMiddleware (JWT) karena IoT biasanya menggunakan MAC Whitelisting / Token Statis.
// Pada prototipe ini, pengamanan menggunakan deviceNumber di URL Parameter.
class IotRoutes extends BaseRoutes {
    routes() {
        this.router.get("/device/:deviceNumber/poll", tryCatch(IotController.pollTask));
        this.router.post("/device/:deviceNumber/submit", tryCatch(IotController.submitData));
    }
}
export default new IotRoutes().router;
`
};

for (const [filepath, content] of Object.entries(files)) {
    const fullPath = path.join("/opt/projects/sihedaf_be", filepath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content.trim() + "\n");
}
console.log("Semua file domain selesai dibuat.");
