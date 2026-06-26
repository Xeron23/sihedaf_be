import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../../src/utils/sendEmail.js', () => ({
  default: jest.fn(async () => undefined)
}));

const { default: sendEmailMock } = await import('../../src/utils/sendEmail.js');
const { generateToken } = await import('../../src/utils/jwtTokenConfig.js');

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
  createAuthHeaderForUser,
  createRefreshTokenForUser
} from '../helpers/auth-test-helper.js';
import { createRequest } from '../helpers/request-test-helper.js';
import { createMember } from '../helpers/seed-factory.js';
import { matchPassword } from '../../src/utils/passwordConfig.js';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.DATABASE_URL_TEST = getTestDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.NODE_ENV = 'test';
process.env.FE_URL = process.env.FE_URL || 'http://localhost:5173';
process.env.BE_URL = process.env.BE_URL || 'http://localhost:3000';

jest.setTimeout(30000);

describe('Auth HTTP integration', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await cleanupDatabase();
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    jest.clearAllMocks();
  });

  test('POST /api/v1/auth/register should create member and return success envelope', async () => {
    const request = await createRequest();
    const payload = {
      name: 'Http Member',
      username: 'http_member',
      email: 'http_member@example.com',
      password: 'Password123!'
    };

    const response = await request
      .post('/api/v1/auth/register')
      .set('Accept', 'application/json')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toEqual({ message: 'User registered successfully.' });

    const createdUser = await testPrisma.user.findUnique({
      where: { email: payload.email }
    });

    expect(createdUser).not.toBeNull();
    expect(createdUser.role).toBe('MEMBER');
    expect(createdUser.password).not.toBe(payload.password);
    expect(await matchPassword(payload.password, createdUser.password)).toBe(true);
  });

  test('POST /api/v1/auth/register should reject invalid payload', async () => {
    const request = await createRequest();
    const response = await request
      .post('/api/v1/auth/register')
      .set('Accept', 'application/json')
      .send({
        name: 'Abc',
        username: 'usr',
        email: 'not-an-email',
        password: 'weak'
      });

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('Bad Request');
    expect(response.body.errors.name).toBe('ValidationError');
    expect(response.body.errors.validation).toHaveProperty('name');
    expect(response.body.errors.validation).toHaveProperty('username');
    expect(response.body.errors.validation).toHaveProperty('email');
    expect(response.body.errors.validation).toHaveProperty('password');
  });

  test('POST /api/v1/auth/register should reject duplicate email or username', async () => {
    await createMember({
      username: 'existing_member',
      email: 'existing_member@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .post('/api/v1/auth/register')
      .set('Accept', 'application/json')
      .send({
        name: 'Duplicate Member',
        username: 'existing_member',
        email: 'existing_member@example.com',
        password: 'Password123!'
      });

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('Bad Request');
    expect(response.body.errors.name).toBe('ValidationError');
    expect(response.body.errors.validation).toHaveProperty('username');
    expect(response.body.errors.validation).toHaveProperty('email');
  });

  test('POST /api/v1/auth/register-owner should create owner user', async () => {
    const request = await createRequest();
    const payload = {
      name: 'Http Owner',
      username: 'http_owner',
      email: 'http_owner@example.com',
      password: 'Password123!'
    };

    const response = await request
      .post('/api/v1/auth/register-owner')
      .set('Accept', 'application/json')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toEqual({ message: 'User registered successfully.' });

    const createdUser = await testPrisma.user.findUnique({ where: { email: payload.email } });
    expect(createdUser.role).toBe('OWNER');
  });

  test('POST /api/v1/auth/login should return access and refresh token for valid credentials', async () => {
    const { user } = await createAuthenticatedMember({
      username: 'login_member',
      email: 'login_member@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .post('/api/v1/auth/login')
      .set('Accept', 'application/json')
      .send({
        username: user.username,
        password: 'Password123!'
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toHaveProperty('access_token');
    expect(response.body.data).toHaveProperty('refresh_token');
    expect(typeof response.body.data.access_token).toBe('string');
    expect(typeof response.body.data.refresh_token).toBe('string');
  });

  test('POST /api/v1/auth/login should reject wrong password', async () => {
    const { user } = await createAuthenticatedMember({
      username: 'wrong_password_member',
      email: 'wrong_password_member@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .post('/api/v1/auth/login')
      .set('Accept', 'application/json')
      .send({
        username: user.username,
        password: 'WrongPassword123!'
      });

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('Bad Request');
    expect(response.body.errors.message).toBe('Invalid credentials');
  });

  test('POST /api/v1/auth/login should reject missing required payload fields', async () => {
    const request = await createRequest();
    const response = await request
      .post('/api/v1/auth/login')
      .set('Accept', 'application/json')
      .send({
        username: ''
      });

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('Bad Request');
    expect(response.body.errors.name).toBe('ValidationError');
    expect(response.body.errors.validation).toHaveProperty('username');
    expect(response.body.errors.validation).toHaveProperty('password');
  });

  test('POST /api/v1/auth/refresh-token should return a new access token', async () => {
    const { user } = await createAuthenticatedMember({
      username: 'refresh_member',
      email: 'refresh_member@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .post('/api/v1/auth/refresh-token')
      .set('Accept', 'application/json')
      .send({
        refresh_token: createRefreshTokenForUser(user)
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toHaveProperty('access_token');
    expect(typeof response.body.data.access_token).toBe('string');
  });

  test('POST /api/v1/auth/refresh-token should reject invalid token', async () => {
    const request = await createRequest();
    const response = await request
      .post('/api/v1/auth/refresh-token')
      .set('Accept', 'application/json')
      .send({
        refresh_token: 'invalid-refresh-token'
      });

    expect(response.status).toBe(401);
    expect(response.body.status).toBe('User Unauthorized');
    expect(response.body.errors.message).toBe('Invalid token');
  });

  test('GET /api/v1/auth/me should return authenticated user profile', async () => {
    const { user } = await createAuthenticatedMember({
      username: 'profile_member',
      email: 'profile_member@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .get('/api/v1/auth/me')
      .set('Accept', 'application/json')
      .set('Authorization', createAuthHeaderForUser(user));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toHaveProperty('user');
    expect(response.body.data.user.id).toBe(user.id);
    expect(response.body.data.user.username).toBe(user.username);
    expect(response.body.data.user.role).toBe('MEMBER');
  });

  test('GET /api/v1/auth/me should reject request without token', async () => {
    const request = await createRequest();
    const response = await request
      .get('/api/v1/auth/me')
      .set('Accept', 'application/json');

    expect(response.status).toBe(401);
    expect(response.body.status).toBe('User Unauthorized');
    expect(response.body.errors.message).toBe('User Have Not Login');
  });

  test('GET /api/v1/auth/me should reject invalid token', async () => {
    const request = await createRequest();
    const response = await request
      .get('/api/v1/auth/me')
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(403);
    expect(response.body.status).toBe('No Access');
    expect(response.body.errors.message).toBe('Token Is Invalid Or No Longer Valid');
  });

  test('GET /api/v1/auth/me should reject token for deleted user', async () => {
    const { user } = await createAuthenticatedMember({
      username: 'deleted_member',
      email: 'deleted_member@example.com',
      password: 'Password123!'
    });

    const authorization = createAuthHeaderForUser(user);
    await testPrisma.user.delete({ where: { id: user.id } });

    const request = await createRequest();
    const response = await request
      .get('/api/v1/auth/me')
      .set('Accept', 'application/json')
      .set('Authorization', authorization);

    expect(response.status).toBe(403);
    expect(response.body.status).toBe('No Access');
    expect(response.body.errors.message).toBe('User Not Found');
  });

  test('PUT /api/v1/auth/me/update should update authenticated profile', async () => {
    const { user } = await createAuthenticatedMember({
      username: 'updatable_member',
      email: 'updatable_member@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .put('/api/v1/auth/me/update')
      .set('Accept', 'application/json')
      .set('Authorization', createAuthHeaderForUser(user))
      .send({
        name: 'Updated Member Name',
        username: 'updated_member_username'
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.name).toBe('Updated Member Name');

    const updatedUser = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(updatedUser.name).toBe('Updated Member Name');
    expect(updatedUser.username).toBe('updated_member_username');
  });

  test('PATCH /api/v1/auth/me/update-password should update password with valid payload', async () => {
    const { user } = await createAuthenticatedMember({
      username: 'password_member',
      email: 'password_member@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .patch('/api/v1/auth/me/update-password')
      .set('Accept', 'application/json')
      .set('Authorization', createAuthHeaderForUser(user))
      .send({
        old_password: 'Password123!',
        new_password: 'NewPassword123!',
        confirm_password: 'NewPassword123!'
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toEqual({ message: 'Password updated successfully' });

    const updatedUser = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(await matchPassword('NewPassword123!', updatedUser.password)).toBe(true);
  });

  test('PATCH /api/v1/auth/me/update-password should reject wrong old password', async () => {
    const { user } = await createAuthenticatedMember({
      username: 'wrong_old_password_member',
      email: 'wrong_old_password_member@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .patch('/api/v1/auth/me/update-password')
      .set('Accept', 'application/json')
      .set('Authorization', createAuthHeaderForUser(user))
      .send({
        old_password: 'BadPassword123!',
        new_password: 'NewPassword123!',
        confirm_password: 'NewPassword123!'
      });

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('Bad Request');
    expect(response.body.errors.name).toBe('ValidationError');
    expect(response.body.errors.validation).toHaveProperty('old_password');
  });

  test('POST /api/v1/auth/email-reset-password should send reset email using mocked sender', async () => {
    const user = await createMember({
      username: 'email_reset_member',
      email: 'email_reset_member@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .post('/api/v1/auth/email-reset-password')
      .set('Accept', 'application/json')
      .send({ email: user.email });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toEqual({
      message: 'Successfully send reset password. Please check your email to reset your password'
    });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      user.email,
      expect.any(String),
      expect.any(String),
      expect.stringContaining('/api/v1/auth/verify-reset-password/')
    );
  });

  test('GET /api/v1/auth/verify-reset-password/:token should redirect success for valid token', async () => {
    const user = await createMember({
      username: 'verify_reset_member',
      email: 'verify_reset_member@example.com',
      password: 'Password123!'
    });
    const token = generateToken(user.id, '5m');

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/auth/verify-reset-password/${token}`)
      .set('Accept', 'application/json');

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain(`${process.env.FE_URL}/#/reset-password?verify=success&token=${token}`);
  });

  test('GET /api/v1/auth/verify-reset-password/:token should redirect failed for invalid token', async () => {
    const request = await createRequest();
    const response = await request
      .get('/api/v1/auth/verify-reset-password/invalid-token')
      .set('Accept', 'application/json');

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain(`${process.env.FE_URL}/#/reset-password?verify=failed&message=Invalid%20token`);
  });

  test('POST /api/v1/auth/reset-password should update password using valid reset token', async () => {
    const user = await createMember({
      username: 'reset_password_member',
      email: 'reset_password_member@example.com',
      password: 'Password123!'
    });
    const token = generateToken(user.id, '5m');

    const request = await createRequest();
    const response = await request
      .post('/api/v1/auth/reset-password')
      .set('Accept', 'application/json')
      .send({
        token,
        new_password: 'ResetPassword123!',
        confirm_password: 'ResetPassword123!'
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toEqual({ message: 'Password reset succesfully' });

    const updatedUser = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(await matchPassword('ResetPassword123!', updatedUser.password)).toBe(true);
  });
});
