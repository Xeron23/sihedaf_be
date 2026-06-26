import BaseRoutes from "../../base_classes/base-route.js";
import MeasurementController from "./measurement.controller.js";
import tryCatch from "../../utils/tryCatcher.js";
import AuthMiddleware from "../../middlewares/auth-token-middleware.js";
import validateCredentials from "../../middlewares/validate-credentials-middleware.js";
import { measurementSchema } from "./measurement.schema.js";

class MeasurementRoutes extends BaseRoutes {
    routes() {
        this.router.use(AuthMiddleware.authenticate);
        this.router.post("/start", [
            validateCredentials(measurementSchema, "body"),
            tryCatch(MeasurementController.startMeasurement)
        ]);
        this.router.post("/stop", [
            validateCredentials(measurementSchema, "body"),
            tryCatch(MeasurementController.stopMeasurement)
        ]);
        this.router.get("/history", tryCatch(MeasurementController.getHistory));
    }
}
export default new MeasurementRoutes().router;
