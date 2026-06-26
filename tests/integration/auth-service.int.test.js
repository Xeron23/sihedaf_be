import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { cleanupDatabase, connectTestDatabase, disconnectTestDatabase, getTestDatabaseUrl, testPrisma } from '../helpers/db-test-helper.js';
import { createGym, createMember, createMembership, createMembershipPackage, createOwner, createPenjaga, createAdmin } from '../helpers/seed-factory.js';
import { matchPassword } from '../../src/utils/passwordConfig.js';
import { parseJWT } from '../../src/utils/jwtTokenConfig.js';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';

const { default: AuthService } = await import('../../src/domains/auth/auth-service.js');

jest.setTimeout(30000);

describe('AuthService integration (MySQL/Prisma)', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await cleanupDatabase();
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  test('register should persist a new MEMBER user into test database', async () => {
    const plainPassword = 'supersecret';
    const payload = {
      name: 'Integration Member',
      username: 'integration_member',
      email: 'integration_member@example.com',
      password: plainPassword
    };

    const response = await AuthService.register(payload);
    const createdUser = await testPrisma.user.findUnique({
      where: { email: payload.email }
    });

    expect(response).toEqual({ message: 'User registered successfully.' });
    expect(createdUser).not.toBeNull();
    expect(createdUser.name).toBe(payload.name);
    expect(createdUser.username).toBe(payload.username);
    expect(createdUser.role).toBe('MEMBER');
    expect(createdUser.password).not.toBe(plainPassword);

    const passwordMatches = await matchPassword(plainPassword, createdUser.password);
    expect(passwordMatches).toBe(true);
  });

  test('registerOwner should persist a new OWNER user into test database', async () => {
    const payload = {
      name: 'Integration Owner',
      username: 'integration_owner',
      email: 'integration_owner@example.com',
      password: 'ownersecret'
    };

    const response = await AuthService.registerOwner(payload);
    const createdOwner = await testPrisma.user.findUnique({
      where: { email: payload.email }
    });

    expect(response).toEqual({ message: 'User registered successfully.' });
    expect(createdOwner).not.toBeNull();
    expect(createdOwner.role).toBe('OWNER');
  });

  test('register should reject duplicate email or username already stored in test database', async () => {
    await createMember({
      name: 'Existing User',
      username: 'existing_user',
      email: 'existing_user@example.com'
    });

    await expect(
      AuthService.register({
        name: 'Another User',
        username: 'existing_user',
        email: 'existing_user@example.com',
        password: 'password123'
      })
    ).rejects.toMatchObject({
      name: 'ValidationError'
    });
  });

  test('login should return access and refresh tokens for MEMBER credentials', async () => {
    const plainPassword = 'Password123!';
    const member = await createMember({
      username: 'login_member',
      email: 'login_member@example.com',
      password: plainPassword
    });

    const response = await AuthService.login('login_member', plainPassword);
    const accessPayload = parseJWT(response.access_token);
    const refreshPayload = parseJWT(response.refresh_token);

    expect(response).toHaveProperty('access_token');
    expect(response).toHaveProperty('refresh_token');
    expect(accessPayload.id.id).toBe(member.id);
    expect(accessPayload.id.account_type).toBe('MEMBER');
    expect(refreshPayload.id).toBe(member.id);
  });

  test('login should return access and refresh tokens for OWNER credentials', async () => {
    const plainPassword = 'Password123!';
    const owner = await createOwner({
      username: 'login_owner',
      email: 'login_owner@example.com',
      password: plainPassword
    });

    const response = await AuthService.login('login_owner', plainPassword);
    const accessPayload = parseJWT(response.access_token);
    const refreshPayload = parseJWT(response.refresh_token);

    expect(response).toHaveProperty('access_token');
    expect(response).toHaveProperty('refresh_token');
    expect(accessPayload.id.id).toBe(owner.id);
    expect(accessPayload.id.account_type).toBe('OWNER');
    expect(refreshPayload.id).toBe(owner.id);
  });

  test('login should return access and refresh tokens for PENJAGA credentials', async () => {
    const plainPassword = 'Password123!';
    const owner = await createOwner();
    const gym = await createGym(owner.id);
    const penjaga = await createPenjaga(gym.id, {
      username: 'login_penjaga',
      email: 'login_penjaga@example.com',
      password: plainPassword
    });

    const response = await AuthService.login('login_penjaga', plainPassword);
    const accessPayload = parseJWT(response.access_token);
    const refreshPayload = parseJWT(response.refresh_token);

    expect(response).toHaveProperty('access_token');
    expect(response).toHaveProperty('refresh_token');
    expect(accessPayload.id.id).toBe(penjaga.id);
    expect(accessPayload.id.account_type).toBe('PENJAGA');
    expect(refreshPayload.id).toBe(penjaga.id);
  });

  test('login should return access and refresh tokens for ADMIN credentials', async () => {
    const plainPassword = 'Password123!';
    const admin = await createAdmin({
      username: 'login_admin',
      email: 'login_admin@example.com',
      password: plainPassword
    });

    const response = await AuthService.login('login_admin', plainPassword);
    const accessPayload = parseJWT(response.access_token);
    const refreshPayload = parseJWT(response.refresh_token);

    expect(response).toHaveProperty('access_token');
    expect(response).toHaveProperty('refresh_token');
    expect(accessPayload.id.id).toBe(admin.id);
    expect(accessPayload.id.account_type).toBe('ADMIN');
    expect(refreshPayload.id).toBe(admin.id);
  });

  test('updatePasswordProfile should update stored password hash in test database', async () => {
    const member = await createMember({
      password: await (await import('../../src/utils/passwordConfig.js')).hashPassword('old-password')
    });

    const response = await AuthService.updatePasswordProfile(member.id, 'old-password', 'new-password');
    const updatedUser = await testPrisma.user.findUnique({ where: { id: member.id } });

    expect(response).toEqual({ message: 'Password updated successfully' });
    expect(await matchPassword('new-password', updatedUser.password)).toBe(true);
  });

  test('getProfile should resolve member profile with active gym membership relation', async () => {
    const owner = await createOwner();
    const member = await createMember();
    const gym = await createGym(owner.id, { name: 'Integration Gym' });
    const membershipPackage = await createMembershipPackage(gym.id, { name: 'Monthly Access' });
    await createMembership(member.id, gym.id, membershipPackage.id, {
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    const profile = await AuthService.getProfile(member.id);

    expect(profile.user.id).toBe(member.id);
    expect(profile.user.role).toBe('MEMBER');
    expect(profile.gyms).toHaveLength(1);
    expect(profile.gyms[0]).toEqual({ id: gym.id, name: 'Integration Gym' });
    expect(profile.defaultGymId).toBe(gym.id);
  });
});
