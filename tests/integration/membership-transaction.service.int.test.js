import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import {
  cleanupDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
  getTestDatabaseUrl
} from '../helpers/db-test-helper.js';
import {
  createGym,
  createMember,
  createMembership,
  createMembershipPackage,
  createOwner,
  createTransaction
} from '../helpers/seed-factory.js';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';

const { default: MembershipTransactionService } = await import('../../src/domains/transaction/membership-transaction.service.js');

jest.setTimeout(30000);

describe('MembershipTransactionService integration (MySQL/Prisma)', () => {
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

  test('getAllTransaction should return membership transaction history belonging to the member', async () => {
    const owner = await createOwner();
    const member = await createMember({
      username: 'history_member',
      email: 'history_member@example.com'
    });
    const anotherMember = await createMember({
      username: 'another_history_member',
      email: 'another_history_member@example.com'
    });

    const gym = await createGym(owner.id, { name: 'Service History Gym', verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, {
      name: 'Service History Package',
      price: '100000.00',
      durationDays: 30
    });

    await createMembership(member.id, gym.id, membershipPackage.id, { status: 'AKTIF' });
    await createMembership(anotherMember.id, gym.id, membershipPackage.id, { status: 'AKTIF' });

    const memberTransactionOne = await createTransaction({
      gymId: gym.id,
      userId: member.id,
      amount: '102000.00',
      orderId: 'ORDER-SERVICE-HISTORY-1',
      status: 'PAID',
      paymentMethod: 'qris',
      note: 'Membership package purchase: Service History Package'
    });

    const memberTransactionTwo = await createTransaction({
      gymId: gym.id,
      userId: member.id,
      amount: '152000.00',
      orderId: 'ORDER-SERVICE-HISTORY-2',
      status: 'PENDING',
      paymentMethod: 'bank_transfer',
      note: 'Membership package renewal: Service History Package'
    });

    await createTransaction({
      gymId: gym.id,
      userId: anotherMember.id,
      amount: '202000.00',
      orderId: 'ORDER-SERVICE-HISTORY-OTHER',
      status: 'PAID',
      paymentMethod: 'qris',
      note: 'Should not be returned to requested member'
    });

    const result = await MembershipTransactionService.getAllTransaction(member.id);

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: memberTransactionOne.id,
          userId: member.id,
          gymId: gym.id,
          orderId: 'ORDER-SERVICE-HISTORY-1',
          status: 'PAID'
        }),
        expect.objectContaining({
          id: memberTransactionTwo.id,
          userId: member.id,
          gymId: gym.id,
          orderId: 'ORDER-SERVICE-HISTORY-2',
          status: 'PENDING'
        })
      ])
    );
    expect(result.every((transaction) => transaction.userId === member.id)).toBe(true);
  });
});
