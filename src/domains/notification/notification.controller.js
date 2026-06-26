import { successResponse } from "../../utils/response.js";
import NotificationService from "./notification.service.js";

class NotificationController {
    async getNotifications(req, res) {
        const data = await NotificationService.getNotifications(req.user.id);
        return successResponse(res, data);
    }
    
    async markAsRead(req, res) {
        const data = await NotificationService.markAsRead(req.params.id, req.user.id);
        return successResponse(res, data);
    }
}
export default new NotificationController();
