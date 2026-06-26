import { hashPassword } from '../../src/utils/passwordConfig.js';
import { testPrisma } from './db-test-helper.js';

const counters = {
  owner: 1,
  member: 1,
  admin: 1,
  penjaga: 1,
  gym: 1,
  package: 1,
  membership: 1,
  transaction: 1,
  equipment: 1,
  cashflow: 1
};

function nextCounter(name) {
  const current = counters[name];
  counters[name] += 1;
  return current;
}

export function resetSeedCounters() {
  Object.keys(counters).forEach((key) => {
    counters[key] = 1;
  });
}

async function resolvePassword(password = 'Password123!') {
  if (typeof password === 'string' && password.startsWith('$2')) {
    return password;
  }

  return hashPassword(password);
}

async function createUser(role, overrides = {}) {
  const suffix = nextCounter(role.toLowerCase());
  const password = await resolvePassword(overrides.password);

  return testPrisma.user.create({
    data: {
      name: overrides.name ?? `${role} ${suffix}`,
      username: overrides.username ?? `${role.toLowerCase()}_${suffix}`,
      email: overrides.email ?? `${role.toLowerCase()}_${suffix}@example.com`,
      password,
      role,
      profileImage: overrides.profileImage ?? null,
      gymId: overrides.gymId ?? undefined
    }
  });
}

export async function createOwner(overrides = {}) {
  return createUser('OWNER', overrides);
}

export async function createMember(overrides = {}) {
  return createUser('MEMBER', overrides);
}

export async function createAdmin(overrides = {}) {
  return createUser('ADMIN', overrides);
}

export async function createPenjaga(gymId = null, overrides = {}) {
  return createUser('PENJAGA', {
    ...overrides,
    gymId: overrides.gymId ?? gymId ?? undefined
  });
}

export async function createGym(ownerId, overrides = {}) {
  const counter = nextCounter('gym');

  return testPrisma.gym.create({
    data: {
      name: overrides.name ?? `Test Gym ${counter}`,
      description: overrides.description ?? 'Integration test gym',
      maxCapacity: overrides.maxCapacity ?? 100,
      latitude: overrides.latitude ?? '1.234567',
      longitude: overrides.longitude ?? '2.345678',
      address: overrides.address ?? 'Jl. Test No. 1',
      jamOperasional: overrides.jamOperasional ?? '06:00-22:00',
      facility: overrides.facility ?? ['WiFi', 'Locker'],
      tag: overrides.tag ?? 'test',
      verified: overrides.verified ?? 'APPROVED',
      ownerId,
      gymImage: overrides.gymImages
        ? {
            create: overrides.gymImages.map((url) => ({ url }))
          }
        : undefined
    },
    include: {
      gymImage: true
    }
  });
}

export async function createMembershipPackage(gymId, overrides = {}) {
  const counter = nextCounter('package');

  return testPrisma.membershipPackage.create({
    data: {
      name: overrides.name ?? `Package ${counter}`,
      price: overrides.price ?? '100000.00',
      durationDays: overrides.durationDays ?? 30,
      benefit: overrides.benefit ?? ['Gym Access'],
      gymId
    }
  });
}

export async function createMembership(userId, gymId, packageId, overrides = {}) {
  const now = overrides.startDate ?? new Date();
  const defaultEndDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  nextCounter('membership');

  return testPrisma.membership.create({
    data: {
      userId,
      gymId,
      packageId,
      startDate: now,
      endDate: overrides.endDate ?? defaultEndDate,
      status: overrides.status ?? 'AKTIF'
    }
  });
}

export async function createTransaction({ gymId, userId = null, membershipId = null, ...overrides }) {
  const counter = nextCounter('transaction');

  return testPrisma.transaction.create({
    data: {
      gymId,
      userId,
      membershipId,
      date: overrides.date ?? new Date(),
      amount: overrides.amount ?? '100000.00',
      type: overrides.type ?? 'PENDAPATAN',
      note: overrides.note ?? `Test transaction ${counter}`,
      status: overrides.status ?? 'PENDING',
      paymentMethod: overrides.paymentMethod ?? 'midtrans',
      orderId: overrides.orderId ?? `ORDER-TEST-${counter}`
    }
  });
}

export async function createEquipment(gymId, overrides = {}) {
  const counter = nextCounter('equipment');

  return testPrisma.equipment.create({
    data: {
      gymId,
      name: overrides.name ?? `Equipment ${counter}`,
      healthStatus: overrides.healthStatus ?? 'BAIK',
      photo: overrides.photo ?? null,
      videoURL: overrides.videoURL ?? null,
      description: overrides.description ?? 'Test equipment',
      jumlah: overrides.jumlah ?? 1
    }
  });
}

export async function createCashflow(gymId, overrides = {}) {
  const counter = nextCounter('cashflow');

  return testPrisma.gymCashflow.create({
    data: {
      gymId,
      name: overrides.name ?? `Cashflow ${counter}`,
      amount: overrides.amount ?? '50000.00',
      transactionType: overrides.transactionType ?? 'PENDAPATAN',
      cashflowType: overrides.cashflowType ?? 'CASH',
      date: overrides.date ?? new Date(),
      note: overrides.note ?? 'Test cashflow',
      updatedById: overrides.updatedById ?? null,
      deletedById: overrides.deletedById ?? null,
      isDeleted: overrides.isDeleted ?? false
    }
  });
}

export async function createAuthFixture() {
  const owner = await createOwner();
  const member = await createMember();
  const gym = await createGym(owner.id);
  const membershipPackage = await createMembershipPackage(gym.id);
  const membership = await createMembership(member.id, gym.id, membershipPackage.id);

  return { owner, member, gym, membershipPackage, membership };
}
