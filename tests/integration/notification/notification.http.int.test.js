import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import supertest from 'supertest';
import { setupHttpIntegrationTest, teardownHttpIntegrationTest } from '../../helpers/app-test-helper.js';
import { testPrisma } from '../../helpers/db-test-helper.js';
import { generateToken } from '../../../src/utils/jwtTokenConfig.js';
import bcrypt from 'bcrypt';

async function safeCleanup() {
    await testPrisma.notification.deleteMany({});
    await testPrisma.user.deleteMany({});
}

describe('Notification API Integration Test', () => {
    let app;
    let userToken;
    let userId;

    beforeAll(async () => {
        const testSetup = await setupHttpIntegrationTest();
        app = testSetup.app;
        await safeCleanup();
    });

    afterAll(async () => {
        await safeCleanup();
        await teardownHttpIntegrationTest();
    });

    beforeEach(async () => {
        await safeCleanup();

        const user = await testPrisma.user.create({
            data: {
                fullname: 'Notif Http',
                email: 'notifhttp@test.com',
                password: await bcrypt.hash('pwd', 10),
                role: 'USER'
            }
        });
        userId = user.id;
        userToken = generateToken({ id: userId, account_type: 'USER' }, '1h');
    });

    it('GET /api/v1/notification should return user notifications', async () => {
        await testPrisma.notification.create({
            data: { userId, title: 'Alert', message: 'You have a message', type: 'SYSTEM_INFO' }
        });

        const response = await supertest(app)
            .get('/api/v1/notification')
            .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.length).toBe(1);
        expect(response.body.data[0].title).toBe('Alert');
    });

    it('PATCH /api/v1/notification/:id/read should mark as read', async () => {
        const notif = await testPrisma.notification.create({
            data: { userId, title: 'Read me', message: 'Read this', type: 'SYSTEM_INFO' }
        });

        const response = await supertest(app)
            .patch(`/api/v1/notification/${notif.id}/read`)
            .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(200);

        const updated = await testPrisma.notification.findUnique({ where: { id: notif.id } });
        expect(updated.isRead).toBe(true);
    });
});
