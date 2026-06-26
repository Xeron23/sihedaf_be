import { generateToken } from '../../src/utils/jwtTokenConfig.js';
import { createMember, createOwner, createAdmin, createPenjaga } from './seed-factory.js';

export function buildAccessTokenPayload(user) {
  return {
    id: user.id,
    account_type: user.role
  };
}

export function createAccessTokenForUser(user, expiresIn = '1d') {
  return generateToken(buildAccessTokenPayload(user), expiresIn);
}

export function createRefreshTokenForUser(user, expiresIn = '365d') {
  return generateToken(user.id, expiresIn);
}

export function createAuthHeaderForUser(user, expiresIn = '1d') {
  return `Bearer ${createAccessTokenForUser(user, expiresIn)}`;
}

export async function createAuthenticatedMember(overrides = {}) {
  const user = await createMember(overrides);
  return {
    user,
    accessToken: createAccessTokenForUser(user),
    refreshToken: createRefreshTokenForUser(user),
    authorization: createAuthHeaderForUser(user)
  };
}

export async function createAuthenticatedOwner(overrides = {}) {
  const user = await createOwner(overrides);
  return {
    user,
    accessToken: createAccessTokenForUser(user),
    refreshToken: createRefreshTokenForUser(user),
    authorization: createAuthHeaderForUser(user)
  };
}

export async function createAuthenticatedAdmin(overrides = {}) {
  const user = await createAdmin(overrides);
  return {
    user,
    accessToken: createAccessTokenForUser(user),
    refreshToken: createRefreshTokenForUser(user),
    authorization: createAuthHeaderForUser(user)
  };
}

export async function createAuthenticatedPenjaga(gymId = null, overrides = {}) {
  const user = await createPenjaga(gymId, overrides);
  return {
    user,
    accessToken: createAccessTokenForUser(user),
    refreshToken: createRefreshTokenForUser(user),
    authorization: createAuthHeaderForUser(user)
  };
}

export function authHeaders(user, extraHeaders = {}) {
  return {
    Authorization: createAuthHeaderForUser(user),
    ...extraHeaders
  };
}
