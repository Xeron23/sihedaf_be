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
  createOwner
} from '../helpers/seed-factory.js';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.DATABASE_URL_TEST = getTestDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.NODE_ENV = 'test';

const notifyUserMock = jest.fn();

jest.unstable_mockModule('../../src/domains/notify/notify.service.js', () => ({
  default: {
    notifyUser: notifyUserMock
  }
}));

const { remindMembershipExpiringSoon } = await import('../../src/jobs/membership-expire-reminder.jobs.js');

jest.setTimeout(30000);

describe('Membership expire reminder job integration (MySQL/Prisma)', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await cleanupDatabase();
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    notifyUserMock.mockReset();
    await cleanupDatabase();
  });

  test('remindMembershipExpiringSoon should detect expiring memberships and send reminder notification to member', async () => {
    const owner = await createOwner();
    const remindedMember = await createMember({
      username: 'reminded_member',
      email: 'reminded_member@example.com'
    });
    const safeMember = await createMember({
      username: 'safe_member',
      email: 'safe_member@example.com'
    });
    const expiredMember = await createMember({
      username: 'expired_member',
      email: 'expired_member@example.com'
    });

    const gym = await createGym(owner.id, {
      name: 'Reminder Gym',
      verified: 'APPROVED'
    });
    const membershipPackage = await createMembershipPackage(gym.id, {
      name: 'Reminder Package',
      durationDays: 30,
      price: '100000.00'
    });

    const expiringSoonEndDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    const expiringMembership = await createMembership(
      remindedMember.id,
      gym.id,
      membershipPackage.id,
      {
        status: 'AKTIF',
        endDate: expiringSoonEndDate
      }
    );

    await createMembership(safeMember.id, gym.id, membershipPackage.id, {
      status: 'AKTIF',
      endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    });

    await createMembership(expiredMember.id, gym.id, membershipPackage.id, {
      status: 'AKTIF',
      endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
    });

    const result = await remindMembershipExpiringSoon();

    expect(result).toEqual({
      skipped: false,
      found: 1,
      sent: 1,
      failed: 0
    });

    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    expect(notifyUserMock).toHaveBeenCalledWith(
      remindedMember.id,
      {
        title: 'Membership Akan Berakhir',
        message: `Membership ${gym.name} kamu akan berakhir kurang dari 3 hari lagi.`,
        type: 'membership_expiring_soon',
        data: {
          membershipId: expiringMembership.id,
          gymId: gym.id,
          packageName: membershipPackage.name,
          endDate: expiringSoonEndDate
        }
      },
      {
        channels: ['fcm']
      }
    );
  });
});
