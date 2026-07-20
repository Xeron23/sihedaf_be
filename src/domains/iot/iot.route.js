import BaseRoutes from "../../base_classes/base-route.js";
import IotController from "./iot.controller.js";
import tryCatch from "../../utils/tryCatcher.js";
import validateCredentials from "../../middlewares/validate-credentials-middleware.js";
import { iotSubmitSchema, iotParamsSchema, iotQuerySchema } from "./iot.schema.js";

// IoT routes tidak menggunakan AuthMiddleware (JWT) karena IoT biasanya menggunakan MAC Whitelisting / Token Statis.
// Pada prototipe ini, pengamanan menggunakan deviceNumber di URL Parameter.
class IotRoutes extends BaseRoutes {
    routes() {
        this.router.get("/device/:deviceNumber/poll", [
            validateCredentials(iotParamsSchema, "params"),
            validateCredentials(iotQuerySchema, "query"),
            tryCatch(IotController.pollTask)
        ]);
        this.router.post("/device/:deviceNumber/submit", [
            validateCredentials(iotParamsSchema, "params"),
            validateCredentials(iotSubmitSchema, "body"),
            tryCatch(IotController.submitData)
        ]);
    }
}
export default new IotRoutes().router;
