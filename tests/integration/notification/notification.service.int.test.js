import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import NotificationService from '../../../src/domains/notification/notification.service.js';
import { testPrisma } from '../../helpers/db-test-helper.js';

async function safeCleanup() {
    await testPrisma.notification.deleteMany({});
    await testPrisma.user.deleteMany({});
}

describe('Notification Service Integration Test', () => {
    let userId;

    beforeAll(async () => {
        await safeCleanup();
    });

    afterAll(async () => {
        await safeCleanup();
    });

    beforeEach(async () => {
        await safeCleanup();

        const user = await testPrisma.user.create({
            data: { fullname: 'Notif User', email: 'notif@test.com', password: 'pwd' }
        });
        userId = user.id;
    });

    it('should get notifications for user', async () => {
        await testPrisma.notification.createMany({
            data: [
                { userId, title: 'Test 1', message: 'Msg 1', type: 'SYSTEM_INFO' },
                { userId, title: 'Test 2', message: 'Msg 2', type: 'SYSTEM_INFO', isRead: true }
            ]
        });

        const notifs = await NotificationService.getNotifications(userId);
        expect(notifs.length).toBe(2);
        expect(notifs[0].title).toBeDefined();
    });

    it('should mark notification as read', async () => {
        const notif = await testPrisma.notification.create({
            data: { userId, title: 'To Read', message: 'Msg', type: 'SYSTEM_INFO', isRead: false }
        });

        const result = await NotificationService.markAsRead(notif.id, userId);
        expect(result.isRead).toBe(true);

        const updated = await testPrisma.notification.findUnique({ where: { id: notif.id } });
        expect(updated.isRead).toBe(true);
    });

    it('should throw error if marking notif belonging to someone else', async () => {
        const user2 = await testPrisma.user.create({
            data: { fullname: 'Notif User 2', email: 'notif2@test.com', password: 'pwd' }
        });

        const notif = await testPrisma.notification.create({
            data: { userId: user2.id, title: 'To Read', message: 'Msg', type: 'SYSTEM_INFO', isRead: false }
        });

        await expect(NotificationService.markAsRead(notif.id, userId)).rejects.toThrow('Notification not found');
    });
});
