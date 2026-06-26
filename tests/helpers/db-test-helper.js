import { PrismaClient } from '@prisma/client';

const DEFAULT_TEST_DB_URL = 'mysql://root:rootpass@127.0.0.1:3307/gym_be_test';

export function getTestDatabaseUrl() {
  return process.env.DATABASE_URL_TEST || process.env.DATABASE_URL || DEFAULT_TEST_DB_URL;
}

export function applyTestEnvironment(overrides = {}) {
  process.env.NODE_ENV = overrides.NODE_ENV ?? process.env.NODE_ENV ?? 'test';
  process.env.JWT_SECRET = overrides.JWT_SECRET ?? process.env.JWT_SECRET ?? 'integration-test-secret';
  process.env.DATABASE_URL = overrides.DATABASE_URL ?? getTestDatabaseUrl();
  process.env.DATABASE_URL_TEST = overrides.DATABASE_URL_TEST ?? process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  process.env.PORT = overrides.PORT ?? process.env.PORT ?? '3999';
  process.env.FE_URL = overrides.FE_URL ?? process.env.FE_URL ?? 'http://localhost:5173';
  process.env.BE_URL = overrides.BE_URL ?? process.env.BE_URL ?? 'http://localhost:3000';

  return {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_TEST: process.env.DATABASE_URL_TEST,
    PORT: process.env.PORT,
    FE_URL: process.env.FE_URL,
    BE_URL: process.env.BE_URL
  };
}

export function createTestPrismaClient(databaseUrl = getTestDatabaseUrl()) {
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    }
  });
}

applyTestEnvironment();

export const testPrisma = createTestPrismaClient();

const cleanupOrder = [
  'systemLog',
  'attendance',
  'equipmentHistory',
  'gymCashflow',
  'transaction',
  'membership',
  'equipment',
  'membershipPackage',
  'gymImage',
  'gym',
  'user'
];

export async function cleanupDatabase(prisma = testPrisma) {
  for (const model of cleanupOrder) {
    await prisma[model].deleteMany();
  }
}

export async function connectTestDatabase(prisma = testPrisma) {
  await prisma.$connect();
}

export async function disconnectTestDatabase(prisma = testPrisma) {
  await prisma.$disconnect();
}

export async function resetTestDatabase(prisma = testPrisma) {
  await cleanupDatabase(prisma);
}

export async function databaseHealthcheck(prisma = testPrisma) {
  const result = await prisma.$queryRaw`SELECT 1 AS ok`;
  return Array.isArray(result) ? result[0] : result;
}

export function getCleanupOrder() {
  return [...cleanupOrder];
}
