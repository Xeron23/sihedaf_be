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
  createAuthenticatedOwner,
  createAuthHeaderForUser
} from '../helpers/auth-test-helper.js';
import { createCashflow, createGym, createPenjaga } from '../helpers/seed-factory.js';
import { createRequest } from '../helpers/request-test-helper.js';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.DATABASE_URL_TEST = getTestDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.NODE_ENV = 'test';

jest.setTimeout(30000);

describe('Cashflow HTTP integration', () => {
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

  test('POST /api/v1/gym/:id/cashflow should create cashflow for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Create Cashflow Gym' });

    const request = await createRequest();
    const response = await request
      .post(`/api/v1/gym/${gym.id}/cashflow`)
      .set('Authorization', createAuthHeaderForUser(owner))
      .send({
        name: 'Pembelian alat gym',
        amount: 250000,
        date: '2026-05-09T07:00:00.000Z',
        note: 'Beli dumbbell baru',
        transactionType: 'PENGELUARAN',
        cashflowType: 'CASHLESS'
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('Created');
    expect(response.body.data.name).toBe('Pembelian alat gym');
    expect(response.body.data.amount).toBe('250000');
    expect(response.body.data.gymId).toBe(gym.id);

    const createdCashflow = await testPrisma.gymCashflow.findUnique({ where: { id: response.body.data.id } });
    expect(createdCashflow).not.toBeNull();
    expect(createdCashflow.name).toBe('Pembelian alat gym');
    expect(createdCashflow.transactionType).toBe('PENGELUARAN');
  });

  test('GET /api/v1/gym/:id/cashflow should return cashflows for owner and support search', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'List Cashflow Gym' });
    await createCashflow(gym.id, { name: 'Servis treadmill', amount: '500000.00', updatedById: owner.id });
    await createCashflow(gym.id, { name: 'Pembayaran membership', amount: '150000.00', updatedById: owner.id });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/gym/${gym.id}/cashflow?search=treadmill&page=1&limit=10`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('Servis treadmill');
  });

  test('GET /api/v1/gym/:id/cashflow/:cashflowId should return cashflow detail for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Detail Cashflow Gym' });
    const cashflow = await createCashflow(gym.id, {
      name: 'Detail Cashflow',
      amount: '100000.00',
      updatedById: owner.id
    });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/gym/${gym.id}/cashflow/${cashflow.id}`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.id).toBe(cashflow.id);
    expect(response.body.data.name).toBe('Detail Cashflow');
  });

  test('PUT /api/v1/gym/:id/cashflow/:cashflowId should update cashflow and set updatedById', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Update Cashflow Gym' });
    const cashflow = await createCashflow(gym.id, {
      name: 'Old Cashflow Name',
      amount: '100000.00',
      updatedById: owner.id
    });

    const request = await createRequest();
    const response = await request
      .put(`/api/v1/gym/${gym.id}/cashflow/${cashflow.id}`)
      .set('Authorization', createAuthHeaderForUser(owner))
      .send({
        name: 'Updated Cashflow Name',
        amount: 175000,
        note: 'Updated note',
        transactionType: 'PENGELUARAN',
        cashflowType: 'CASH',
        date: '2026-05-10T08:00:00.000Z'
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.name).toBe('Updated Cashflow Name');

    const updatedCashflow = await testPrisma.gymCashflow.findUnique({ where: { id: cashflow.id } });
    expect(updatedCashflow.name).toBe('Updated Cashflow Name');
    expect(String(updatedCashflow.amount)).toContain('175000');
    expect(updatedCashflow.updatedById).toBe(owner.id);
  });

  test('GET /api/v1/gym/:id/cashflow should allow penjaga to access gym cashflow', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Penjaga Cashflow Gym' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'cashflow_staff',
      email: 'cashflow_staff@example.com',
      password: 'Password123!'
    });
    await createCashflow(gym.id, { name: 'Cashflow Staff Visible', amount: '200000.00', updatedById: owner.id });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/gym/${gym.id}/cashflow`)
      .set('Authorization', createAuthHeaderForUser(penjaga));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('Cashflow Staff Visible');
  });

  test('DELETE /api/v1/gym/:id/cashflow/:cashflowId should soft delete cashflow', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Delete Cashflow Gym' });
    const cashflow = await createCashflow(gym.id, {
      name: 'Soft Delete Cashflow',
      amount: '300000.00',
      updatedById: owner.id
    });

    const request = await createRequest();
    const response = await request
      .delete(`/api/v1/gym/${gym.id}/cashflow/${cashflow.id}`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');

    const deletedCashflow = await testPrisma.gymCashflow.findUnique({ where: { id: cashflow.id } });
    expect(deletedCashflow.isDeleted).toBe(true);
    expect(deletedCashflow.deletedById).toBe(owner.id);

    const getResponse = await request
      .get(`/api/v1/gym/${gym.id}/cashflow/${cashflow.id}`)
      .set('Authorization', createAuthHeaderForUser(owner));
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.status).toBe('OK');
    expect(getResponse.body.data).toBeNull();
  });
});
