import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { cleanupDatabase, connectTestDatabase, disconnectTestDatabase, getTestDatabaseUrl, testPrisma } from '../helpers/db-test-helper.js';
import { createGym, createMember, createMembership, createMembershipPackage, createOwner } from '../helpers/seed-factory.js';
import { hashPassword } from '../../src/utils/passwordConfig.js';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';

const uploadFileMock = jest.fn();

jest.unstable_mockModule('../../src/utils/saveImage.js', () => ({
  uploadFile: uploadFileMock
}));

const { default: EquipmentService } = await import('../../src/domains/equipment/equipment.service.js');

jest.setTimeout(30000);

describe('EquipmentService integration (MySQL/Prisma)', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await cleanupDatabase();
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    uploadFileMock.mockReset();
    await cleanupDatabase();
  });

  async function setupEquipmentFlow() {
    const owner = await createOwner();
    const member = await createMember();
    const gym = await createGym(owner.id, { verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, {
      name: 'Equipment Package'
    });
    await createMembership(member.id, gym.id, membershipPackage.id, {
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'AKTIF'
    });
    const staff = await testPrisma.user.create({
      data: {
        name: 'Equipment Staff',
        username: 'equipment_staff',
        email: 'equipment_staff@example.com',
        password: await hashPassword('password123'),
        role: 'PENJAGA',
        gymId: gym.id
      }
    });

    return { owner, member, gym, membershipPackage, staff };
  }

  test('createEquipment should persist equipment and uploaded photo for owner', async () => {
    const { owner, gym } = await setupEquipmentFlow();
    uploadFileMock.mockResolvedValue(['https://files.test/equipment-1.png']);

    const equipment = await EquipmentService.createEquipment(
      gym.id,
      owner.id,
      {
        name: 'Bench Press',
        videoURL: 'https://video.test/bench',
        jumlah: 2,
        description: 'Chest equipment'
      },
      [{ originalname: 'bench.png' }]
    );

    const persistedEquipment = await testPrisma.equipment.findUnique({
      where: { id: equipment.id }
    });

    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    expect(persistedEquipment).not.toBeNull();
    expect(persistedEquipment.gymId).toBe(gym.id);
    expect(persistedEquipment.name).toBe('Bench Press');
    expect(persistedEquipment.photo).toBe('https://files.test/equipment-1.png');
    expect(persistedEquipment.jumlah).toBe(2);
  });

  test('getAllEquipments should return gym equipments for authorized owner', async () => {
    const { owner, gym } = await setupEquipmentFlow();
    await testPrisma.equipment.createMany({
      data: [
        {
          gymId: gym.id,
          name: 'Bench Press',
          jumlah: 2,
          description: 'Chest equipment'
        },
        {
          gymId: gym.id,
          name: 'Treadmill',
          jumlah: 4,
          description: 'Cardio equipment'
        }
      ]
    });

    const equipments = await EquipmentService.getAllEquipments(gym.id, owner.id, {
      search: undefined,
      healthStatus: undefined
    });

    expect(equipments).toHaveLength(2);
    expect(equipments.map((item) => item.name)).toEqual(
      expect.arrayContaining(['Bench Press', 'Treadmill'])
    );
  });

  test('updateEquipment should create history when health status changes', async () => {
    const { owner, gym } = await setupEquipmentFlow();
    const equipment = await testPrisma.equipment.create({
      data: {
        gymId: gym.id,
        name: 'Cable Machine',
        healthStatus: 'BAIK',
        jumlah: 1,
        description: 'Pulley machine'
      }
    });

    const updatedEquipment = await EquipmentService.updateEquipment(
      equipment.id,
      gym.id,
      owner.id,
      {
        name: 'Cable Machine',
        healthStatus: 'RUSAK',
        videoURL: 'https://video.test/cable',
        jumlah: 1,
        description: 'Needs repair'
      },
      undefined
    );

    const histories = await testPrisma.equipmentHistory.findMany({
      where: { equipmentId: equipment.id, gymId: gym.id }
    });

    expect(updatedEquipment.healthStatus).toBe('RUSAK');
    expect(histories).toHaveLength(1);
    expect(histories[0].type).toBe('KERUSAKAN');
    expect(histories[0].reportedById).toBe(owner.id);
  });

  test('getEquipmentHistory and getEquipmentHistoryById should return persisted history for authorized owner', async () => {
    const { owner, gym } = await setupEquipmentFlow();
    const equipment = await testPrisma.equipment.create({
      data: {
        gymId: gym.id,
        name: 'Leg Press',
        healthStatus: 'BAIK',
        jumlah: 1,
        description: 'Leg machine'
      }
    });
    const history = await testPrisma.equipmentHistory.create({
      data: {
        equipmentId: equipment.id,
        gymId: gym.id,
        date: new Date('2026-05-09T00:00:00.000Z'),
        type: 'PERBAIKAN',
        description: 'Routine maintenance',
        reportedById: owner.id
      }
    });

    const allHistory = await EquipmentService.getEquipmentHistory(equipment.id, gym.id, owner.id);
    const historyById = await EquipmentService.getEquipmentHistoryById(history.id, equipment.id, gym.id, owner.id);

    expect(allHistory).toHaveLength(1);
    expect(allHistory[0].id).toBe(history.id);
    expect(historyById).not.toBeNull();
    expect(historyById.id).toBe(history.id);
    expect(historyById.type).toBe('PERBAIKAN');
  });

  test('searchEquipmentsForMember should return only healthy equipments from member gyms', async () => {
    const { member, gym } = await setupEquipmentFlow();
    await testPrisma.equipment.createMany({
      data: [
        {
          gymId: gym.id,
          name: 'Healthy Dumbbell',
          healthStatus: 'BAIK',
          jumlah: 10,
          description: 'Ready to use'
        },
        {
          gymId: gym.id,
          name: 'Broken Row Machine',
          healthStatus: 'RUSAK',
          jumlah: 1,
          description: 'Out of service'
        }
      ]
    });

    const result = await EquipmentService.searchEquipmentsForMember('Healthy', gym.id, member.id);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Healthy Dumbbell');
    expect(result[0].healthStatus).toBe('BAIK');
  });

  test('deleteEquipment should remove equipment for authorized staff', async () => {
    const { staff, gym } = await setupEquipmentFlow();
    const equipment = await testPrisma.equipment.create({
      data: {
        gymId: gym.id,
        name: 'Delete Equipment',
        healthStatus: 'BAIK',
        jumlah: 1,
        description: 'To be removed'
      }
    });

    const response = await EquipmentService.deleteEquipment(equipment.id, gym.id, staff.id);
    const deletedEquipment = await testPrisma.equipment.findUnique({
      where: { id: equipment.id }
    });

    expect(response).toEqual({ message: 'Equipment deleted successfully' });
    expect(deletedEquipment).toBeNull();
  });
});
