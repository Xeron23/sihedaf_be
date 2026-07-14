import { initSocket } from '../../../src/config/socket.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import IotService from '../../../src/domains/iot/iot.service.js';
import { testPrisma } from '../../helpers/db-test-helper.js';

async function safeCleanup() {
    await testPrisma.ppgResult.deleteMany({});
    await testPrisma.measurement.deleteMany({});
    await testPrisma.device.deleteMany({});
    await testPrisma.user.deleteMany({});
}

describe('IoT Service Integration Test', () => {
    let deviceId;

    beforeAll(async () => {
        const { default: http } = await import("http");
        const server = http.createServer();
        initSocket(server);
        await safeCleanup();
    });

    afterAll(async () => {
        await safeCleanup();
    });

    beforeEach(async () => {
        await safeCleanup();

        const device = await testPrisma.device.create({
            data: {
                deviceNumber: 'WATCH-IOT-1',
                status: 'ONLINE'
            }
        });
        deviceId = device.id;
    });

    it('checkPendingTask should upsert device and return no task if none active', async () => {
        const result = await IotService.checkPendingTask('WATCH-NEW-1');
        
        expect(result.hasTask).toBe(false);
        expect(result.measurementId).toBeUndefined();

        const newDevice = await testPrisma.device.findUnique({ where: { deviceNumber: 'WATCH-NEW-1' } });
        expect(newDevice).toBeDefined();
        expect(newDevice.status).toBe('ONLINE');
    });

    it('checkPendingTask should return task if IN_PROGRESS measurement exists', async () => {
        const user = await testPrisma.user.create({
            data: { fullname: 'IoT User', email: 'iot@test.com', password: 'pwd' }
        });

        const measure = await testPrisma.measurement.create({
            data: {
                userId: user.id,
                deviceId: deviceId,
                status: 'IN_PROGRESS'
            }
        });

        const result = await IotService.checkPendingTask('WATCH-IOT-1');
        
        expect(result.hasTask).toBe(true);
        expect(result.measurementId).toBe(measure.id);
    });

    it('submitData should throw error if device not found', async () => {
        await expect(IotService.submitData('WATCH-NOT-EXIST', [], false)).rejects.toThrow('Device not registered');
    });

    it('submitData should return STOP if no active measurement', async () => {
        const result = await IotService.submitData('WATCH-IOT-1', [1, 2, 3], false);
        expect(result.status).toBe('STOP');
        expect(result.message).toBe('No active measurement, stop sensor.');
    });

    it('submitData should store data and return CONTINUE if isFinished is false', async () => {
        const user = await testPrisma.user.create({
            data: { fullname: 'IoT User 2', email: 'iot2@test.com', password: 'pwd' }
        });

        const measure = await testPrisma.measurement.create({
            data: {
                userId: user.id,
                deviceId: deviceId,
                status: 'IN_PROGRESS'
            }
        });

        const result = await IotService.submitData('WATCH-IOT-1', [1, 2, 3], false);
        
        expect(result.status).toBe('CONTINUE');

        const ppg = await testPrisma.ppgResult.findUnique({ where: { measurementId: measure.id } });
        expect(ppg).toBeDefined();
        expect(ppg.rawPpgData).toEqual([1, 2, 3]);

        // Submit lagi untuk cek append
        const result2 = await IotService.submitData('WATCH-IOT-1', [4, 5], false);
        expect(result2.status).toBe('CONTINUE');
        
        const ppgUpdated = await testPrisma.ppgResult.findUnique({ where: { measurementId: measure.id } });
        expect(ppgUpdated.rawPpgData).toEqual([1, 2, 3, 4, 5]);
    });

    it('submitData should store data, mark COMPLETED and return STOP with result if isFinished is true', async () => {
        const user = await testPrisma.user.create({
            data: { fullname: 'IoT User 3', email: 'iot3@test.com', password: 'pwd' }
        });

        const measure = await testPrisma.measurement.create({
            data: {
                userId: user.id,
                deviceId: deviceId,
                status: 'IN_PROGRESS'
            }
        });

        const result = await IotService.submitData('WATCH-IOT-1', [10, 11, 12], true);
        
        expect(result.status).toBe('STOP');
        expect(result.message).toBe('Measurement completed');
        expect(result.afibDetected).toBeDefined();
        expect(result.totalData).toBe(3);

        const updatedMeasure = await testPrisma.measurement.findUnique({ where: { id: measure.id } });
        expect(updatedMeasure.status).toBe('COMPLETED');
        expect(updatedMeasure.completedAt).toBeDefined();
        
        const notifications = await testPrisma.notification.findMany({ where: { userId: user.id } });
        expect(notifications.length).toBe(1);
    });
});
