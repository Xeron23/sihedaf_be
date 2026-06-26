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
