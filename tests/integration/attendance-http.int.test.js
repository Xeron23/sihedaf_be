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

describe('Attendance HTTP integration', () => {
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

  test('POST /api/v1/attendance/:id/qr/me should create attendance token for active member', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Attendance Token Gym', verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'Attendance Package' });
    await createMembership(member.id, gym.id, membershipPackage.id, { status: 'AKTIF' });

    const request = await createRequest();
    const response = await request
      .post(`/api/v1/attendance/${gym.id}/qr/me`)
      .set('Authorization', createAuthHeaderForUser(member));

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('Created');
    expect(response.body.data).toHaveProperty('token');
    expect(typeof response.body.data.token.token).toBe('string');
    expect(response.body.data.token.memberId).toMatch(/^GYM\d+-MEMBERSHIP\d+$/);
  });

  test('POST /api/v1/attendance/check-in should check member in using valid token and penjaga', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Check In Gym', verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'Check In Package' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'attendance_staff',
      email: 'attendance_staff@example.com',
      password: 'Password123!'
    });
    await createMembership(member.id, gym.id, membershipPackage.id, { status: 'AKTIF' });

    const request = await createRequest();
    const tokenResponse = await request
      .post(`/api/v1/attendance/${gym.id}/qr/me`)
      .set('Authorization', createAuthHeaderForUser(member));

    const response = await request
      .post('/api/v1/attendance/check-in')
      .set('Authorization', createAuthHeaderForUser(penjaga))
      .send({
        token: tokenResponse.body.data.token.token
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('Created');
    expect(response.body.data.message).toBe('Check-in successful');
    expect(response.body.data.attendance.id).toBe(member.id);
    expect(response.body.data.attendance.email).toBe(member.email);

    const attendance = await testPrisma.attendance.findFirst({
      where: { gymId: gym.id, createdById: penjaga.id, checkOutAt: null }
    });
    expect(attendance).not.toBeNull();
  });

  test('POST /api/v1/attendance/check-in should reject duplicate active check-in', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Duplicate Check In Gym', verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'Duplicate Package' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'duplicate_staff',
      email: 'duplicate_staff@example.com',
      password: 'Password123!'
    });
    const membership = await createMembership(member.id, gym.id, membershipPackage.id, { status: 'AKTIF' });

    await testPrisma.attendance.create({
      data: {
        gymId: gym.id,
        membershipId: membership.id,
        checkInAt: new Date(),
        createdById: penjaga.id
      }
    });

    const request = await createRequest();
    const tokenResponse = await request
      .post(`/api/v1/attendance/${gym.id}/qr/me`)
      .set('Authorization', createAuthHeaderForUser(member));

    const response = await request
      .post('/api/v1/attendance/check-in')
      .set('Authorization', createAuthHeaderForUser(penjaga))
      .send({ token: tokenResponse.body.data.token.token });

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('Bad Request');
    expect(response.body.errors.message).toBe('User already checked in');
  });

  test('POST /api/v1/attendance/check-out should check member out successfully', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Check Out Gym', verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'Check Out Package' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'checkout_staff',
      email: 'checkout_staff@example.com',
      password: 'Password123!'
    });
    const membership = await createMembership(member.id, gym.id, membershipPackage.id, { status: 'AKTIF' });

    await testPrisma.attendance.create({
      data: {
        gymId: gym.id,
        membershipId: membership.id,
        checkInAt: new Date(),
        createdById: penjaga.id
      }
    });

    const request = await createRequest();
    const response = await request
      .post('/api/v1/attendance/check-out')
      .set('Authorization', createAuthHeaderForUser(penjaga))
      .send({ userId: member.id });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.message).toBe('Check-out successful');

    const attendance = await testPrisma.attendance.findFirst({
      where: { membershipId: membership.id, gymId: gym.id }
    });
    expect(attendance.checkOutAt).not.toBeNull();
  });

  test('GET /api/v1/attendance/:gymId should return active attendance list for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Current Attendance Gym', verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'Current Attendance Package' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'current_staff',
      email: 'current_staff@example.com',
      password: 'Password123!'
    });
    const membership = await createMembership(member.id, gym.id, membershipPackage.id, { status: 'AKTIF' });

    await testPrisma.attendance.create({
      data: {
        gymId: gym.id,
        membershipId: membership.id,
        checkInAt: new Date(),
        createdById: penjaga.id
      }
    });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/attendance/${gym.id}`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].membership.user.id).toBe(member.id);
  });

  test('GET /api/v1/attendance/history/:gymId should return attendance history for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Attendance History Gym', verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'History Package' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'history_staff',
      email: 'history_staff@example.com',
      password: 'Password123!'
    });
    const membership = await createMembership(member.id, gym.id, membershipPackage.id, { status: 'AKTIF' });

    await testPrisma.attendance.create({
      data: {
        gymId: gym.id,
        membershipId: membership.id,
        checkInAt: new Date(Date.now() - 60 * 60 * 1000),
        checkOutAt: new Date(),
        createdById: penjaga.id
      }
    });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/attendance/history/${gym.id}`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].membership.user.email).toBe(member.email);
  });

  test('GET /api/v1/attendance/me/history should return member attendance history', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'My Attendance Gym', verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'My History Package' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'my_history_staff',
      email: 'my_history_staff@example.com',
      password: 'Password123!'
    });
    const membership = await createMembership(member.id, gym.id, membershipPackage.id, { status: 'AKTIF' });

    await testPrisma.attendance.create({
      data: {
        gymId: gym.id,
        membershipId: membership.id,
        checkInAt: new Date(Date.now() - 60 * 60 * 1000),
        checkOutAt: new Date(),
        createdById: penjaga.id
      }
    });

    const request = await createRequest();
    const response = await request
      .get('/api/v1/attendance/me/history')
      .set('Authorization', createAuthHeaderForUser(member));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].membershipId).toBe(membership.id);
  });
});
