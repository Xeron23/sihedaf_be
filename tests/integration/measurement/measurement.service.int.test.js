import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import MeasurementService from '../../../src/domains/measurement/measurement.service.js';
import { testPrisma } from '../../helpers/db-test-helper.js';
import bcrypt from 'bcrypt';

async function safeCleanup() {
    await testPrisma.measurement.deleteMany({});
    await testPrisma.device.deleteMany({});
    await testPrisma.user.deleteMany({});
}

describe('Measurement Service Integration Test', () => {
    let userAId;
    let userBId;
    let deviceId;

    beforeAll(async () => {
        await safeCleanup();
    });

    afterAll(async () => {
        await safeCleanup();
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

        const userB = await testPrisma.user.create({
            data: {
                fullname: 'User B',
                email: 'userb@test.com',
                password: await bcrypt.hash('password123', 10),
                role: 'USER'
            }
        });
        userBId = userB.id;

        // 2. Create Device
        const device = await testPrisma.device.create({
            data: {
                deviceNumber: 'WATCH-TEST-1',
                status: 'ONLINE'
            }
        });
        deviceId = device.id;
    });

    it('should throw error if device is not connected/not found', async () => {
        await expect(MeasurementService.bindDevice(userAId, 'NON-EXISTENT')).rejects.toThrow('Device not connected to the system. Ensure the watch is turned on.');
    });

    it('should throw error if device is OFFLINE', async () => {
        const offlineDevice = await testPrisma.device.create({
            data: {
                deviceNumber: 'WATCH-TEST-OFFLINE',
                status: 'OFFLINE'
            }
        });

        await expect(MeasurementService.bindDevice(userAId, 'WATCH-TEST-OFFLINE')).rejects.toThrow('Device is offline. Please turn on the watch before binding.');
    });

    it('should bind device successfully', async () => {
        const result = await MeasurementService.bindDevice(userAId, 'WATCH-TEST-1');
        expect(result.message).toBe('Device successfully bound to your account.');

        const dbUser = await testPrisma.user.findUnique({ where: { id: userAId } });
        expect(dbUser.deviceId).toBe(deviceId);
    });

    it('should get bound device details', async () => {
        await testPrisma.user.update({
            where: { id: userAId },
            data: { deviceId }
        });

        const userDevice = await MeasurementService.getMyDevice(userAId);
        expect(userDevice).toBeDefined();
        expect(userDevice.id).toBe(deviceId);
        expect(userDevice.deviceNumber).toBe('WATCH-TEST-1');
    });

    it('should start measurement successfully', async () => {
        await testPrisma.user.update({
            where: { id: userAId },
            data: { deviceId }
        });

        const measurement = await MeasurementService.startMeasurement(userAId);
        expect(measurement).toBeDefined();
        expect(measurement.status).toBe('IN_PROGRESS');
        expect(measurement.deviceId).toBe(deviceId);
        expect(measurement.userId).toBe(userAId);
    });

    it('should fail to start measurement if another measurement is active', async () => {
        await testPrisma.user.update({
            where: { id: userAId },
            data: { deviceId }
        });

        await testPrisma.measurement.create({
            data: {
                userId: userAId,
                deviceId: deviceId,
                status: 'IN_PROGRESS'
            }
        });

        await expect(MeasurementService.startMeasurement(userAId)).rejects.toThrow('Jam masih memproses pengukuran lain. Harap tunggu.');
    });

    it('should stop measurement successfully', async () => {
        await testPrisma.user.update({
            where: { id: userAId },
            data: { deviceId }
        });

        await testPrisma.measurement.create({
            data: {
                userId: userAId,
                deviceId: deviceId,
                status: 'IN_PROGRESS'
            }
        });

        const result = await MeasurementService.stopMeasurement(userAId);
        expect(result.message).toBe('Stop command sent to watch.');

        const activeMeasurement = await testPrisma.measurement.findFirst({
            where: { deviceId, status: 'IN_PROGRESS' }
        });
        expect(activeMeasurement).toBeNull();
    });

    it('should get history of measurements', async () => {
        await testPrisma.measurement.createMany({
            data: [
                { userId: userAId, deviceId: deviceId, status: 'COMPLETED' },
                { userId: userAId, deviceId: deviceId, status: 'COMPLETED' },
                { userId: userBId, deviceId: deviceId, status: 'COMPLETED' }
            ]
        });

        const historyA = await MeasurementService.getHistory(userAId);
        expect(historyA.length).toBe(2);

        const historyB = await MeasurementService.getHistory(userBId);
        expect(historyB.length).toBe(1);
    });
});
