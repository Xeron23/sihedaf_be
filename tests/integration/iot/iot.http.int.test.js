import { initSocket } from '../../../src/config/socket.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import supertest from 'supertest';
import { setupHttpIntegrationTest, teardownHttpIntegrationTest } from '../../helpers/app-test-helper.js';
import { testPrisma } from '../../helpers/db-test-helper.js';

async function safeCleanup() {
    await testPrisma.ppgResult.deleteMany({});
    await testPrisma.notification.deleteMany({});
    await testPrisma.measurement.deleteMany({});
    await testPrisma.device.deleteMany({});
    await testPrisma.user.deleteMany({});
}

describe('IoT API Integration Test', () => {
    let app;
    let deviceId;

    beforeAll(async () => {
        const testSetup = await setupHttpIntegrationTest();
        const { default: http } = await import("http");
        const server = http.createServer(app);
        initSocket(server);
        app = testSetup.app;
        await safeCleanup();
    });

    afterAll(async () => {
        await safeCleanup();
        await teardownHttpIntegrationTest();
    });

    beforeEach(async () => {
        await safeCleanup();

        const device = await testPrisma.device.create({
            data: {
                deviceNumber: 'WATCH-HTTP-1',
                status: 'ONLINE'
            }
        });
        deviceId = device.id;
    });

    it('GET /api/v1/iot/device/:deviceNumber/poll should return hasTask=false if no measurement active', async () => {
        const response = await supertest(app)
            .get('/api/v1/iot/device/WATCH-HTTP-1/poll');

        expect(response.status).toBe(200);
        expect(response.body.data.hasTask).toBe(false);
    });

    it('GET /api/v1/iot/device/:deviceNumber/poll should return hasTask=true if measurement IN_PROGRESS', async () => {
        const user = await testPrisma.user.create({
            data: { fullname: 'H1', email: 'h1@test.com', password: 'pwd' }
        });

        await testPrisma.measurement.create({
            data: { userId: user.id, deviceId: deviceId, status: 'IN_PROGRESS' }
        });

        const response = await supertest(app)
            .get('/api/v1/iot/device/WATCH-HTTP-1/poll');

        expect(response.status).toBe(200);
        expect(response.body.data.hasTask).toBe(true);
        expect(response.body.data.measurementId).toBeDefined();
    });

    it('POST /api/v1/iot/device/:deviceNumber/submit should return STOP if no active measurement', async () => {
        const response = await supertest(app)
            .post('/api/v1/iot/device/WATCH-HTTP-1/submit')
            .send({
                rawPpgData: [1, 2, 3],
                isFinished: false
            });

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('STOP');
    });

    it('POST /api/v1/iot/device/:deviceNumber/submit should append data and return CONTINUE', async () => {
        const user = await testPrisma.user.create({
            data: { fullname: 'H2', email: 'h2@test.com', password: 'pwd' }
        });

        await testPrisma.measurement.create({
            data: { userId: user.id, deviceId: deviceId, status: 'IN_PROGRESS' }
        });

        const response = await supertest(app)
            .post('/api/v1/iot/device/WATCH-HTTP-1/submit')
            .send({
                rawPpgData: [1, 2],
                isFinished: false
            });

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('CONTINUE');
    });

    it('POST /api/v1/iot/device/:deviceNumber/submit should complete and return STOP if isFinished=true', async () => {
        const user = await testPrisma.user.create({
            data: { fullname: 'H3', email: 'h3@test.com', password: 'pwd' }
        });

        await testPrisma.measurement.create({
            data: { userId: user.id, deviceId: deviceId, status: 'IN_PROGRESS' }
        });

        const response = await supertest(app)
            .post('/api/v1/iot/device/WATCH-HTTP-1/submit')
            .send({
                rawPpgData: [1, 2, 3],
                isFinished: true
            });

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('STOP');
        expect(response.body.data.message).toBe('Measurement completed');
    });
});
