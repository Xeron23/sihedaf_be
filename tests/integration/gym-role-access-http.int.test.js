import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  cleanupDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
  getTestDatabaseUrl,
  resetTestDatabase
} from '../helpers/db-test-helper.js';
import {
  createAuthenticatedAdmin,
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

describe('Gym role access HTTP integration', () => {
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

  test('GET /api/v1/gym/me/memberships should allow MEMBER and reject other roles', async () => {
    const { user: member } = await createAuthenticatedMember({
      username: 'member_access',
      email: 'member_access@example.com',
      password: 'Password123!'
    });
    const { user: owner } = await createAuthenticatedOwner();
    const { user: admin } = await createAuthenticatedAdmin();
    const gym = await createGym(owner.id, { name: 'Role Access Gym' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'Role Access Package' });
    const penjaga = await createPenjaga(gym.id, { password: 'Password123!' });
    await createMembership(member.id, gym.id, membershipPackage.id);

    const request = await createRequest();

    const memberResponse = await request
      .get('/api/v1/gym/me/memberships')
      .set('Authorization', createAuthHeaderForUser(member));
    expect(memberResponse.status).toBe(200);
    expect(memberResponse.body.status).toBe('OK');

    const ownerResponse = await request
      .get('/api/v1/gym/me/memberships')
      .set('Authorization', createAuthHeaderForUser(owner));
    expect(ownerResponse.status).toBe(403);
    expect(ownerResponse.body.errors.message).toBe('access denied');

    const adminResponse = await request
      .get('/api/v1/gym/me/memberships')
      .set('Authorization', createAuthHeaderForUser(admin));
    expect(adminResponse.status).toBe(403);
    expect(adminResponse.body.errors.message).toBe('access denied');

    const penjagaResponse = await request
      .get('/api/v1/gym/me/memberships')
      .set('Authorization', createAuthHeaderForUser(penjaga));
    expect(penjagaResponse.status).toBe(403);
    expect(penjagaResponse.body.errors.message).toBe('access denied');

    const unauthenticatedResponse = await request.get('/api/v1/gym/me/memberships');
    expect(unauthenticatedResponse.status).toBe(401);
  });

  test('GET /api/v1/gym/:id/gym-staff should allow OWNER and reject other roles', async () => {
    const { user: owner } = await createAuthenticatedOwner({
      username: 'owner_access',
      email: 'owner_access@example.com',
      password: 'Password123!'
    });
    const { user: member } = await createAuthenticatedMember();
    const { user: admin } = await createAuthenticatedAdmin();
    const gym = await createGym(owner.id, { name: 'Owner Route Gym' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'staff_owner_route',
      email: 'staff_owner_route@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();

    const ownerResponse = await request
      .get(`/api/v1/gym/${gym.id}/gym-staff`)
      .set('Authorization', createAuthHeaderForUser(owner));
    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.status).toBe('OK');
    expect(Array.isArray(ownerResponse.body.data)).toBe(true);

    const memberResponse = await request
      .get(`/api/v1/gym/${gym.id}/gym-staff`)
      .set('Authorization', createAuthHeaderForUser(member));
    expect(memberResponse.status).toBe(403);
    expect(memberResponse.body.errors.message).toBe('access denied');

    const adminResponse = await request
      .get(`/api/v1/gym/${gym.id}/gym-staff`)
      .set('Authorization', createAuthHeaderForUser(admin));
    expect(adminResponse.status).toBe(403);
    expect(adminResponse.body.errors.message).toBe('access denied');

    const penjagaResponse = await request
      .get(`/api/v1/gym/${gym.id}/gym-staff`)
      .set('Authorization', createAuthHeaderForUser(penjaga));
    expect(penjagaResponse.status).toBe(403);
    expect(penjagaResponse.body.errors.message).toBe('access denied');

    const unauthenticatedResponse = await request.get(`/api/v1/gym/${gym.id}/gym-staff`);
    expect(unauthenticatedResponse.status).toBe(401);
  });

  test('GET /api/v1/gym/verified-gym should allow ADMIN and reject non-admin roles', async () => {
    const { user: admin } = await createAuthenticatedAdmin({
      username: 'admin_access',
      email: 'admin_access@example.com',
      password: 'Password123!'
    });
    const { user: owner } = await createAuthenticatedOwner();
    const { user: member } = await createAuthenticatedMember();
    const gym = await createGym(owner.id, { verified: 'PENDING' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'staff_admin_route',
      email: 'staff_admin_route@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();

    const adminResponse = await request
      .get('/api/v1/gym/verified-gym')
      .set('Authorization', createAuthHeaderForUser(admin));
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.status).toBe('OK');

    const ownerResponse = await request
      .get('/api/v1/gym/verified-gym')
      .set('Authorization', createAuthHeaderForUser(owner));
    expect(ownerResponse.status).toBe(403);
    expect(ownerResponse.body.errors.message).toBe('access denied');

    const memberResponse = await request
      .get('/api/v1/gym/verified-gym')
      .set('Authorization', createAuthHeaderForUser(member));
    expect(memberResponse.status).toBe(403);
    expect(memberResponse.body.errors.message).toBe('access denied');

    const penjagaResponse = await request
      .get('/api/v1/gym/verified-gym')
      .set('Authorization', createAuthHeaderForUser(penjaga));
    expect(penjagaResponse.status).toBe(403);
    expect(penjagaResponse.body.errors.message).toBe('access denied');

    const unauthenticatedResponse = await request.get('/api/v1/gym/verified-gym');
    expect(unauthenticatedResponse.status).toBe(401);
  });

  test('GET /api/v1/gym/:id/memberships should allow OWNER and PENJAGA only', async () => {
    const { user: owner } = await createAuthenticatedOwner({
      username: 'shared_owner',
      email: 'shared_owner@example.com',
      password: 'Password123!'
    });
    const { user: member } = await createAuthenticatedMember({
      username: 'shared_member',
      email: 'shared_member@example.com',
      password: 'Password123!'
    });
    const { user: admin } = await createAuthenticatedAdmin({
      username: 'shared_admin',
      email: 'shared_admin@example.com',
      password: 'Password123!'
    });

    const gym = await createGym(owner.id, { name: 'Shared Access Gym' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'Shared Access Package' });
    const penjaga = await createPenjaga(gym.id, {
      username: 'shared_staff',
      email: 'shared_staff@example.com',
      password: 'Password123!'
    });
    await createMembership(member.id, gym.id, membershipPackage.id);

    const request = await createRequest();

    const ownerResponse = await request
      .get(`/api/v1/gym/${gym.id}/memberships`)
      .set('Authorization', createAuthHeaderForUser(owner));
    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.status).toBe('OK');

    const penjagaResponse = await request
      .get(`/api/v1/gym/${gym.id}/memberships`)
      .set('Authorization', createAuthHeaderForUser(penjaga));
    expect(penjagaResponse.status).toBe(200);
    expect(penjagaResponse.body.status).toBe('OK');

    const memberResponse = await request
      .get(`/api/v1/gym/${gym.id}/memberships`)
      .set('Authorization', createAuthHeaderForUser(member));
    expect(memberResponse.status).toBe(403);
    expect(memberResponse.body.errors.message).toBe('access denied');

    const adminResponse = await request
      .get(`/api/v1/gym/${gym.id}/memberships`)
      .set('Authorization', createAuthHeaderForUser(admin));
    expect(adminResponse.status).toBe(403);
    expect(adminResponse.body.errors.message).toBe('access denied');

    const unauthenticatedResponse = await request.get(`/api/v1/gym/${gym.id}/memberships`);
    expect(unauthenticatedResponse.status).toBe(401);
  });
});
