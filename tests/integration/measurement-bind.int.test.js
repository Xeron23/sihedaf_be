import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { setupHttpIntegrationTest, teardownHttpIntegrationTest } from '../helpers/app-test-helper.js';
import { testPrisma } from '../helpers/db-test-helper.js';
import { generateToken } from '../../src/utils/jwtTokenConfig.js';
import bcrypt from 'bcrypt';

async function safeCleanup() {
    await testPrisma.measurement.deleteMany({});
    await testPrisma.device.deleteMany({});
    await testPrisma.user.deleteMany({});
}

describe('Measurement Bind API Integration Test', () => {
    let app;
    let tokenUserA;
    let tokenUserB;
    let userAId;
    let userBId;
    let deviceId;

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

        // 1. Create Users
        const userA = await testPrisma.user.create({
            data: {
                fullname: 'User A',
                email: 'usera@test.com',
                password: await bcrypt.hash('password123', 10),
                role: 'USER'
            }
        });
        userAId = userA.id;
        tokenUserA = generateToken({ id: userAId, account_type: 'USER' }, '1h');

        const userB = await testPrisma.user.create({
            data: {
                fullname: 'User B',
                email: 'userb@test.com',
                password: await bcrypt.hash('password123', 10),
                role: 'USER'
            }
        });
        userBId = userB.id;
        tokenUserB = generateToken({ id: userBId, account_type: 'USER' }, '1h');

        // 2. Create Device
        const device = await testPrisma.device.create({
            data: {
                deviceNumber: 'WATCH-TEST-1',
                status: 'ONLINE'
            }
        });
        deviceId = device.id;
    });

    it('should successfully bind device if device is ONLINE and unowned', async () => {
        const response = await supertest(app)
            .post('/api/v1/measurement/bind')
            .set('Authorization', `Bearer ${tokenUserA}`)
            .send({ deviceNumber: 'WATCH-TEST-1' });

        expect(response.status).toBe(200);
        expect(response.body.data.message).toBe('Device successfully bound to your account.');

        const dbUser = await testPrisma.user.findUnique({ where: { id: userAId } });
        expect(dbUser.deviceId).toBe(deviceId);
    });

    it('should allow User B to takeover the device from User A (Prototype Mode)', async () => {
        await supertest(app)
            .post('/api/v1/measurement/bind')
            .set('Authorization', `Bearer ${tokenUserA}`)
            .send({ deviceNumber: 'WATCH-TEST-1' });

        const response = await supertest(app)
            .post('/api/v1/measurement/bind')
            .set('Authorization', `Bearer ${tokenUserB}`)
            .send({ deviceNumber: 'WATCH-TEST-1' });

        expect(response.status).toBe(200);
        expect(response.body.data.message).toBe('Device successfully bound to your account.');

        const dbUserA = await testPrisma.user.findUnique({ where: { id: userAId } });
        const dbUserB = await testPrisma.user.findUnique({ where: { id: userBId } });

        expect(dbUserA.deviceId).toBeNull();
        expect(dbUserB.deviceId).toBe(deviceId);
    });

    it('should prevent User B from taking over if User A is currently measuring (IN_PROGRESS)', async () => {
        await supertest(app)
            .post('/api/v1/measurement/bind')
            .set('Authorization', `Bearer ${tokenUserA}`)
            .send({ deviceNumber: 'WATCH-TEST-1' });

        await testPrisma.measurement.create({
            data: {
                userId: userAId,
                deviceId: deviceId,
                status: 'IN_PROGRESS'
            }
        });

        const response = await supertest(app)
            .post('/api/v1/measurement/bind')
            .set('Authorization', `Bearer ${tokenUserB}`)
            .send({ deviceNumber: 'WATCH-TEST-1' });

        expect(response.status).toBe(400); // Bad Request
        expect(response.body.errors.message).toBe('Jam sedang digunakan untuk pengukuran oleh pengguna lain. Harap tunggu hingga selesai.');

        const dbUserA = await testPrisma.user.findUnique({ where: { id: userAId } });
        expect(dbUserA.deviceId).toBe(deviceId);
    });
});
