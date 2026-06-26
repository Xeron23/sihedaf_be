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
  createGym,
  createMembershipPackage,
  createPenjaga
} from '../helpers/seed-factory.js';
import { createRequest } from '../helpers/request-test-helper.js';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.DATABASE_URL_TEST = getTestDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.NODE_ENV = 'test';

jest.setTimeout(30000);

describe('Paket member HTTP integration', () => {
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

  test('POST /api/v1/gym/:id/paket-member should create membership packages for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Create Paket Gym' });

    const request = await createRequest();
    const response = await request
      .post(`/api/v1/gym/${gym.id}/paket-member`)
      .set('Authorization', createAuthHeaderForUser(owner))
      .send([
        {
          name: 'Paket Bulanan',
          price: 150000,
          durationDays: 30,
          benefit: ['Akses gym bebas', 'Loker']
        },
        {
          name: 'Paket Mingguan',
          price: 50000,
          durationDays: 7,
          benefit: ['Akses gym bebas']
        }
      ]);

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('Created');
    expect(response.body.data.message).toBe('Succesfully add data');

    const createdPackages = await testPrisma.membershipPackage.findMany({ where: { gymId: gym.id } });
    expect(createdPackages).toHaveLength(2);
    expect(createdPackages.map((item) => item.name).sort()).toEqual(['Paket Bulanan', 'Paket Mingguan']);
  });

  test('GET /api/v1/gym/:id/paket-member should return paket list for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'List Paket Gym' });
    await createMembershipPackage(gym.id, { name: 'Paket Harian', durationDays: 1, price: '20000.00' });
    await createMembershipPackage(gym.id, { name: 'Paket Tahunan', durationDays: 365, price: '1200000.00' });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/gym/${gym.id}/paket-member`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.map((item) => item.name).sort()).toEqual(['Paket Harian', 'Paket Tahunan']);
  });

  test('GET /api/v1/gym/:id/paket-member/:paketId should return paket detail for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Detail Paket Gym' });
    const paket = await createMembershipPackage(gym.id, {
      name: 'Paket Premium',
      durationDays: 90,
      price: '300000.00',
      benefit: ['Akses gym bebas', 'Personal trainer']
    });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/gym/${gym.id}/paket-member/${paket.id}`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.id).toBe(paket.id);
    expect(response.body.data.name).toBe('Paket Premium');
  });

  test('PUT /api/v1/gym/:id/paket-member/:paketId should update paket for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Update Paket Gym' });
    const paket = await createMembershipPackage(gym.id, {
      name: 'Paket Lama',
      durationDays: 30,
      price: '150000.00',
      benefit: ['Akses gym bebas']
    });

    const request = await createRequest();
    const response = await request
      .put(`/api/v1/gym/${gym.id}/paket-member/${paket.id}`)
      .set('Authorization', createAuthHeaderForUser(owner))
      .send({
        name: 'Paket Baru',
        price: 175000,
        durationDays: 45,
        benefit: ['Akses gym bebas', 'Minuman gratis']
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.name).toBe('Paket Baru');
    expect(String(response.body.data.price)).toContain('175000');
    expect(response.body.data.durationDays).toBe(45);

    const updatedPaket = await testPrisma.membershipPackage.findUnique({ where: { id: paket.id } });
    expect(updatedPaket.name).toBe('Paket Baru');
  });

  test('DELETE /api/v1/gym/:id/paket-member/:paketId should delete paket for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Delete Paket Gym' });
    const paket = await createMembershipPackage(gym.id, { name: 'Paket Delete', durationDays: 14, price: '70000.00' });

    const request = await createRequest();
    const response = await request
      .delete(`/api/v1/gym/${gym.id}/paket-member/${paket.id}`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.message).toBe('Succesfully delete package');

    const deletedPaket = await testPrisma.membershipPackage.findUnique({ where: { id: paket.id } });
    expect(deletedPaket).toBeNull();
  });

  test('GET /api/v1/gym/:id/paket-member should allow member to view approved gym packages', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Approved Paket Gym', verified: 'APPROVED' });
    await createMembershipPackage(gym.id, { name: 'Paket Member View', durationDays: 30, price: '150000.00' });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/gym/${gym.id}/paket-member`)
      .set('Authorization', createAuthHeaderForUser(member));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('Paket Member View');
  });

  test('GET /api/v1/gym/:id/paket-member/:paketId should reject member access for pending gym package', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Pending Paket Gym', verified: 'PENDING' });
    const paket = await createMembershipPackage(gym.id, { name: 'Hidden Paket', durationDays: 30, price: '150000.00' });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/gym/${gym.id}/paket-member/${paket.id}`)
      .set('Authorization', createAuthHeaderForUser(member));

    expect(response.status).toBe(404);
    expect(response.body.status).toBe('Not Found');
    expect(response.body.errors.message).toBe('Paket not found');
  });

  test('POST /api/v1/gym/:id/paket-member should allow penjaga to create package for assigned gym', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Penjaga Paket Gym' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'paket_staff',
      email: 'paket_staff@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .post(`/api/v1/gym/${gym.id}/paket-member`)
      .set('Authorization', createAuthHeaderForUser(penjaga))
      .send([
        {
          name: 'Paket Staff Create',
          price: 99000,
          durationDays: 21,
          benefit: ['Akses gym bebas', 'Locker']
        }
      ]);

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('Created');

    const createdPaket = await testPrisma.membershipPackage.findFirst({
      where: { gymId: gym.id, name: 'Paket Staff Create' }
    });
    expect(createdPaket).not.toBeNull();
  });
});
