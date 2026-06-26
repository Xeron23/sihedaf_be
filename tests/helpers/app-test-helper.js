import { applyTestEnvironment, connectTestDatabase, disconnectTestDatabase } from './db-test-helper.js';

let cachedExpressApp = null;

export async function createTestApp(options = {}) {
  applyTestEnvironment(options.env);

  const { default: ExpressApplication } = await import('../../src/app.js');
  const expressApplication = new ExpressApplication(options.port ?? 3999);

  return {
    expressApplication,
    app: expressApplication.app
  };
}

export async function getTestApp(options = {}) {
  if (!cachedExpressApp) {
    cachedExpressApp = await createTestApp(options);
  }

  return cachedExpressApp;
}

export function resetCachedTestApp() {
  cachedExpressApp = null;
}

export async function setupHttpIntegrationTest(options = {}) {
  applyTestEnvironment(options.env);
  await connectTestDatabase();
  return getTestApp(options);
}

export async function teardownHttpIntegrationTest() {
  await disconnectTestDatabase();
  resetCachedTestApp();
}
