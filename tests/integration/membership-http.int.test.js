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
  createAuthenticatedPenjaga,
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

describe('Membership HTTP integration', () => {
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

  test('GET /api/v1/gym/me/memberships should return active memberships for member', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Member Gym', verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'Monthly Package' });
    await createMembership(member.id, gym.id, membershipPackage.id, { status: 'AKTIF' });

    const request = await createRequest();
    const response = await request
      .get('/api/v1/gym/me/memberships')
      .set('Authorization', createAuthHeaderForUser(member));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].gym.name).toBe('Member Gym');
    expect(response.body.data[0].package.name).toBe('Monthly Package');
  });

  test('GET /api/v1/gym/:id/memberships should return gym memberships for owner and penjaga', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Membership List Gym' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'List Package' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'membership_staff',
      email: 'membership_staff@example.com',
      password: 'Password123!'
    });
    const membership = await createMembership(member.id, gym.id, membershipPackage.id, { status: 'AKTIF' });

    const request = await createRequest();

    const ownerResponse = await request
      .get(`/api/v1/gym/${gym.id}/memberships`)
      .set('Authorization', createAuthHeaderForUser(owner));
    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.status).toBe('OK');
    expect(ownerResponse.body.data[0].id).toBe(membership.id);

    const penjagaResponse = await request
      .get(`/api/v1/gym/${gym.id}/memberships`)
      .set('Authorization', createAuthHeaderForUser(penjaga));
    expect(penjagaResponse.status).toBe(200);
    expect(penjagaResponse.body.status).toBe('OK');
    expect(penjagaResponse.body.data[0].user.email).toBe(member.email);
  });

  test('GET /api/v1/gym/:id/memberships/:membershipId should return membership detail for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Membership Detail Gym' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'Detail Package' });
    const membership = await createMembership(member.id, gym.id, membershipPackage.id, { status: 'AKTIF' });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/gym/${gym.id}/memberships/${membership.id}`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.id).toBe(membership.id);
    expect(response.body.data.gymId).toBe(gym.id);
  });

  test('POST /api/v1/gym/:id/memberships should create membership and cashflow for owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Create Membership Gym' });
    const membershipPackage = await createMembershipPackage(gym.id, {
      name: 'Create Package',
      price: '120000.00',
      durationDays: 30
    });

    const request = await createRequest();
    const response = await request
      .post(`/api/v1/gym/${gym.id}/memberships`)
      .set('Authorization', createAuthHeaderForUser(owner))
      .send({
        name: 'Brand New Member',
        email: 'brand_new_member@example.com',
        paketId: membershipPackage.id
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('Created');
    expect(response.body.data.message).toBe('Successfully create user');
    expect(response.body.data.password).toBeTruthy();

    const createdUser = await testPrisma.user.findUnique({ where: { email: 'brand_new_member@example.com' } });
    expect(createdUser).not.toBeNull();
    expect(createdUser.role).toBe('MEMBER');

    const createdMembership = await testPrisma.membership.findFirst({ where: { userId: createdUser.id, gymId: gym.id } });
    expect(createdMembership).not.toBeNull();
    expect(createdMembership.packageId).toBe(membershipPackage.id);

    const createdCashflow = await testPrisma.gymCashflow.findFirst({
      where: { gymId: gym.id, name: `Pendaftaran gym - ${membershipPackage.name}` }
    });
    expect(createdCashflow).not.toBeNull();
  });

  test('POST /api/v1/gym/:id/memberships should reject existing user email', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({
      email: 'existing_member_membership@example.com',
      password: 'Password123!'
    });
    const gym = await createGym(owner.id, { name: 'Duplicate Member Gym' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'Duplicate Package' });

    const request = await createRequest();
    const response = await request
      .post(`/api/v1/gym/${gym.id}/memberships`)
      .set('Authorization', createAuthHeaderForUser(owner))
      .send({
        name: member.name,
        email: member.email,
        paketId: membershipPackage.id
      });

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('Bad Request');
    expect(response.body.errors.message).toBe('User already registered');
  });

  test('PUT /api/v1/gym/:id/memberships/:membershipId should update membership package and create cashflow', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Update Membership Gym' });
    const oldPackage = await createMembershipPackage(gym.id, { name: 'Old Package', durationDays: 30, price: '100000.00' });
    const newPackage = await createMembershipPackage(gym.id, { name: 'New Package', durationDays: 60, price: '180000.00' });
    const membership = await createMembership(member.id, gym.id, oldPackage.id, { status: 'AKTIF' });

    const request = await createRequest();
    const response = await request
      .put(`/api/v1/gym/${gym.id}/memberships/${membership.id}`)
      .set('Authorization', createAuthHeaderForUser(owner))
      .send({ paketId: newPackage.id });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');

    const updatedMembership = await testPrisma.membership.findUnique({ where: { id: membership.id } });
    expect(updatedMembership.packageId).toBe(newPackage.id);

    const updateCashflow = await testPrisma.gymCashflow.findFirst({
      where: { gymId: gym.id, name: `Update membership - ${member.name}` }
    });
    expect(updateCashflow).not.toBeNull();
  });

  test('DELETE /api/v1/gym/:id/memberships/:membershipId should delete expired membership', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Delete Membership Gym' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'Delete Package' });
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const membership = await createMembership(member.id, gym.id, membershipPackage.id, {
      startDate: twoDaysAgo,
      endDate: yesterday,
      status: 'AKTIF'
    });

    const request = await createRequest();
    const response = await request
      .delete(`/api/v1/gym/${gym.id}/memberships/${membership.id}`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.message).toBe('Succesfully delete membership');

    const deletedMembership = await testPrisma.membership.findUnique({ where: { id: membership.id } });
    expect(deletedMembership).toBeNull();
  });

  test('DELETE /api/v1/gym/:id/memberships/:membershipId should reject active membership deletion', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Active Membership Gym' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'Active Package' });
    const membership = await createMembership(member.id, gym.id, membershipPackage.id, { status: 'AKTIF' });

    const request = await createRequest();
    const response = await request
      .delete(`/api/v1/gym/${gym.id}/memberships/${membership.id}`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('Bad Request');
    expect(response.body.errors.message).toBe('Membership still activated');
  });
});
