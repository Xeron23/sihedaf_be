import BaseRoutes from "../../base_classes/base-route.js";
import MeasurementController from "./measurement.controller.js";
import tryCatch from "../../utils/tryCatcher.js";
import AuthMiddleware from "../../middlewares/auth-token-middleware.js";
import validateCredentials from "../../middlewares/validate-credentials-middleware.js";
import { measurementSchema, bindDeviceSchema } from "./measurement.schema.js";

class MeasurementRoutes extends BaseRoutes {
    routes() {
        this.router.use(AuthMiddleware.authenticate);
        
        // Endpoint baru untuk bind/cek jam
        this.router.post("/bind", [
            validateCredentials(bindDeviceSchema, "body"),
            tryCatch(MeasurementController.bindDevice)
        ]);
        this.router.get("/my-device", tryCatch(MeasurementController.getMyDevice));

        // Start/Stop tidak butuh body deviceNumber lagi
        this.router.post("/start", [
            validateCredentials(measurementSchema, "body"),
            tryCatch(MeasurementController.startMeasurement)
        ]);
        this.router.post("/stop", [
            validateCredentials(measurementSchema, "body"),
            tryCatch(MeasurementController.stopMeasurement)
        ]);
        this.router.get("/history", tryCatch(MeasurementController.getHistory));
        this.router.get("/latest", tryCatch(MeasurementController.getLatestMeasurement));
    }
}
export default new MeasurementRoutes().router;
