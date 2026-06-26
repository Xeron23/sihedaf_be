import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  cleanupDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
  getTestDatabaseUrl,
  resetTestDatabase,
  testPrisma
} from '../helpers/db-test-helper.js';
import {
  createAuthenticatedMember,
  createAuthenticatedOwner,
  createAuthHeaderForUser
} from '../helpers/auth-test-helper.js';
import {
  createEquipment,
  createGym,
  createMembership,
  createMembershipPackage,
  createPenjaga
} from '../helpers/seed-factory.js';
import { createRequest } from '../helpers/request-test-helper.js';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.DATABASE_URL_TEST = getTestDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.NODE_ENV = 'test';

jest.setTimeout(30000);

describe('Equipment HTTP integration', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await cleanupDatabase();
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  test('POST /api/v1/gym/:id/equipment should create equipment for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Create Equipment Gym' });

    const request = await createRequest();
    const response = await request
      .post(`/api/v1/gym/${gym.id}/equipment`)
      .set('Authorization', createAuthHeaderForUser(owner))
      .send({
        name: 'Treadmill X1',
        videoURL: 'https://example.com/treadmill-x1',
        jum: '3',
        description: 'High quality treadmill'
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.name).toBe('Treadmill X1');
    expect(response.body.data.gymId).toBe(gym.id);
    expect(response.body.data.jumlah).toBe(3);

    const createdEquipment = await testPrisma.equipment.findUnique({ where: { id: response.body.data.id } });
    expect(createdEquipment).not.toBeNull();
    expect(createdEquipment.name).toBe('Treadmill X1');
  });

  test('GET /api/v1/gym/:id/equipment should return gym equipments and support search', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'List Equipment Gym' });
    await createEquipment(gym.id, { name: 'Bench Press', healthStatus: 'BAIK', jumlah: 2 });
    await createEquipment(gym.id, { name: 'Leg Press', healthStatus: 'RUSAK', jumlah: 1 });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/gym/${gym.id}/equipment?search=Bench&healthStatus=BAIK`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('Bench Press');
  });

  test('GET /api/v1/gym/:id/equipment/:equipId should return equipment detail for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Detail Equipment Gym' });
    const equipment = await createEquipment(gym.id, { name: 'Dumbbell Rack', jumlah: 5 });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/gym/${gym.id}/equipment/${equipment.id}`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.id).toBe(equipment.id);
    expect(response.body.data.name).toBe('Dumbbell Rack');
  });

  test('PUT /api/v1/gym/:id/equipment/:equipId should update equipment and create history when health status changes', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Update Equipment Gym' });
    const equipment = await createEquipment(gym.id, {
      name: 'Cable Machine',
      healthStatus: 'BAIK',
      jumlah: 2,
      description: 'Original description'
    });

    const request = await createRequest();
    const response = await request
      .put(`/api/v1/gym/${gym.id}/equipment/${equipment.id}`)
      .set('Authorization', createAuthHeaderForUser(owner))
      .send({
        name: 'Cable Machine Pro',
        healthStatus: 'RUSAK',
        videoURL: 'https://example.com/cable-machine-pro',
        jumlah: '4',
        description: 'Updated description'
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.name).toBe('Cable Machine Pro');
    expect(response.body.data.healthStatus).toBe('RUSAK');

    const updatedEquipment = await testPrisma.equipment.findUnique({ where: { id: equipment.id } });
    expect(updatedEquipment.jumlah).toBe(4);

    const histories = await testPrisma.equipmentHistory.findMany({ where: { equipmentId: equipment.id, gymId: gym.id } });
    expect(histories).toHaveLength(1);
    expect(histories[0].type).toBe('KERUSAKAN');
  });

  test('GET /api/v1/gym/:id/equipment/:equipId/history and /history/:historyId should return equipment history', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'History Equipment Gym' });
    const equipment = await createEquipment(gym.id, { name: 'Rowing Machine', jumlah: 1 });
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

    const request = await createRequest();
    const historyListResponse = await request
      .get(`/api/v1/gym/${gym.id}/equipment/${equipment.id}/history`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(historyListResponse.status).toBe(200);
    expect(historyListResponse.body.status).toBe('OK');
    expect(historyListResponse.body.data).toHaveLength(1);
    expect(historyListResponse.body.data[0].id).toBe(history.id);

    const historyDetailResponse = await request
      .get(`/api/v1/gym/${gym.id}/equipment/${equipment.id}/history/${history.id}`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(historyDetailResponse.status).toBe(200);
    expect(historyDetailResponse.body.status).toBe('OK');
    expect(historyDetailResponse.body.data.id).toBe(history.id);
    expect(historyDetailResponse.body.data.description).toBe('Routine maintenance');
  });

  test('DELETE /api/v1/gym/:id/equipment/:equipId should delete equipment for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Delete Equipment Gym' });
    const equipment = await createEquipment(gym.id, { name: 'Stationary Bike', jumlah: 2 });

    const request = await createRequest();
    const response = await request
      .delete(`/api/v1/gym/${gym.id}/equipment/${equipment.id}`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.message).toBe('Equipment deleted successfully');

    const deletedEquipment = await testPrisma.equipment.findUnique({ where: { id: equipment.id } });
    expect(deletedEquipment).toBeNull();
  });

  test('GET /api/v1/equipment/me should return healthy equipments available to member membership gyms', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Member Equipment Gym', verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'Equipment Access Package' });
    await createMembership(member.id, gym.id, membershipPackage.id, { status: 'AKTIF' });
    await createEquipment(gym.id, { name: 'Lat Pulldown', healthStatus: 'BAIK', jumlah: 1 });
    await createEquipment(gym.id, { name: 'Broken Bike', healthStatus: 'RUSAK', jumlah: 1 });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/equipment/me?search=Lat&filter=${gym.id}`)
      .set('Authorization', createAuthHeaderForUser(member));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('Lat Pulldown');
    expect(response.body.data[0].healthStatus).toBe('BAIK');
  });
});
