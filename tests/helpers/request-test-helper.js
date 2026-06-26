import supertest from 'supertest';
import { getTestApp } from './app-test-helper.js';

export async function createRequest(options = {}) {
  const { app } = await getTestApp(options);
  return supertest(app);
}

export function withAuth(requestBuilder, authorization) {
  return requestBuilder.set('Authorization', authorization);
}

export function withJson(requestBuilder) {
  return requestBuilder.set('Accept', 'application/json');
}

export function asJson(requestBuilder) {
  return requestBuilder
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json');
}

export function attachBearerToken(requestBuilder, token) {
  return requestBuilder.set('Authorization', `Bearer ${token}`);
}

export function attachAuthHeaders(requestBuilder, headers = {}) {
  let next = requestBuilder;

  Object.entries(headers).forEach(([key, value]) => {
    next = next.set(key, value);
  });

  return next;
}

export async function postJson(url, payload, options = {}) {
  const request = await createRequest(options);
  return asJson(request.post(url)).send(payload);
}

export async function putJson(url, payload, options = {}) {
  const request = await createRequest(options);
  return asJson(request.put(url)).send(payload);
}

export async function patchJson(url, payload, options = {}) {
  const request = await createRequest(options);
  return asJson(request.patch(url)).send(payload);
}

export async function getJson(url, options = {}) {
  const request = await createRequest(options);
  return withJson(request.get(url));
}

export async function deleteJson(url, options = {}) {
  const request = await createRequest(options);
  return withJson(request.delete(url));
}
