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
