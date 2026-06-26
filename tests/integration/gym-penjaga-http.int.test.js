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
  createAuthenticatedPenjaga,
  createAuthHeaderForUser
} from '../helpers/auth-test-helper.js';
import { createGym, createPenjaga } from '../helpers/seed-factory.js';
import { createRequest } from '../helpers/request-test-helper.js';
import { matchPassword } from '../../src/utils/passwordConfig.js';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.DATABASE_URL_TEST = getTestDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.NODE_ENV = 'test';

jest.setTimeout(30000);

describe('Gym staff/penjaga HTTP integration', () => {
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

  test('GET /api/v1/gym/gym-staff/me should return authenticated penjaga profile', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Staff Profile Gym' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'staff_profile',
      email: 'staff_profile@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .get('/api/v1/gym/gym-staff/me')
      .set('Authorization', createAuthHeaderForUser(penjaga));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.id).toBe(penjaga.id);
    expect(response.body.data.username).toBe('staff_profile');
  });

  test('POST /api/v1/gym/:id/gym-staff should create penjaga for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Create Staff Gym' });

    const request = await createRequest();
    const response = await request
      .post(`/api/v1/gym/${gym.id}/gym-staff`)
      .set('Authorization', createAuthHeaderForUser(owner))
      .send({
        name: 'New Staff Member',
        username: 'new_staff_member',
        email: 'new_staff_member@example.com',
        password: 'Password123!'
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('Created');
    expect(response.body.data.message).toBe('Succefully create penjaga');
    expect(response.body.data.data.username).toBe('new_staff_member');

    const createdPenjaga = await testPrisma.user.findUnique({ where: { email: 'new_staff_member@example.com' } });
    expect(createdPenjaga).not.toBeNull();
    expect(createdPenjaga.role).toBe('PENJAGA');
    expect(createdPenjaga.gymId).toBe(gym.id);
  });

  test('POST /api/v1/gym/:id/gym-staff should reject duplicate username/email', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Duplicate Staff Gym' });
    await createPenjaga(gym.id, {
      username: 'existing_staff',
      email: 'existing_staff@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .post(`/api/v1/gym/${gym.id}/gym-staff`)
      .set('Authorization', createAuthHeaderForUser(owner))
      .send({
        name: 'Existing Staff Member',
        username: 'existing_staff',
        email: 'existing_staff@example.com',
        password: 'Password123!'
      });

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('Bad Request');
    expect(response.body.errors.name).toBe('ValidationError');
    expect(response.body.errors.validation).toHaveProperty('username');
    expect(response.body.errors.validation).toHaveProperty('email');
  });

  test('GET /api/v1/gym/:id/gym-staff should list penjaga for owner gym', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'List Staff Gym' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'listed_staff',
      email: 'listed_staff@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/gym/${gym.id}/gym-staff`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data[0].id).toBe(penjaga.id);
    expect(response.body.data[0].email).toBe('listed_staff@example.com');
  });

  test('GET /api/v1/gym/:id/gym-staff/:userId should show penjaga detail for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Detail Staff Gym' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'detail_staff',
      email: 'detail_staff@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/gym/${gym.id}/gym-staff/${penjaga.id}`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.id).toBe(penjaga.id);
    expect(response.body.data.email).toBe('detail_staff@example.com');
    expect(response.body.data.gym.name).toBe('Detail Staff Gym');
  });

  test('PUT /api/v1/gym/:id/gym-staff/:userId should update penjaga profile for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Update Staff Gym' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'update_staff',
      email: 'update_staff@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .put(`/api/v1/gym/${gym.id}/gym-staff/${penjaga.id}`)
      .set('Authorization', createAuthHeaderForUser(owner))
      .send({
        name: 'Updated Staff Name',
        email: 'updated_staff@example.com'
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.name).toBe('Updated Staff Name');
    expect(response.body.data.email).toBe('updated_staff@example.com');

    const updatedPenjaga = await testPrisma.user.findUnique({ where: { id: penjaga.id } });
    expect(updatedPenjaga.name).toBe('Updated Staff Name');
    expect(updatedPenjaga.email).toBe('updated_staff@example.com');
  });

  test('PATCH /api/v1/gym/:id/gym-staff/:userId/update-password should update penjaga password for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Update Staff Password Gym' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'password_staff',
      email: 'password_staff@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .patch(`/api/v1/gym/${gym.id}/gym-staff/${penjaga.id}/update-password`)
      .set('Authorization', createAuthHeaderForUser(owner))
      .send({
        old_password: 'Password123!',
        new_password: 'NewPassword123!',
        confirm_password: 'NewPassword123!'
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.message).toBe('Password updated successfully');

    const updatedPenjaga = await testPrisma.user.findUnique({ where: { id: penjaga.id } });
    expect(await matchPassword('NewPassword123!', updatedPenjaga.password)).toBe(true);
  });

  test('DELETE /api/v1/gym/:id/gym-staff/:userId should delete penjaga for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Delete Staff Gym' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'delete_staff',
      email: 'delete_staff@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .delete(`/api/v1/gym/${gym.id}/gym-staff/${penjaga.id}`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.message).toBe('Succesfully delete penjaga');

    const deletedPenjaga = await testPrisma.user.findUnique({ where: { id: penjaga.id } });
    expect(deletedPenjaga).toBeNull();
  });
});
