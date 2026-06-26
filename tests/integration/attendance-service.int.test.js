import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { cleanupDatabase, connectTestDatabase, disconnectTestDatabase, getTestDatabaseUrl, testPrisma } from '../helpers/db-test-helper.js';
import { createGym, createMember, createMembership, createMembershipPackage, createOwner } from '../helpers/seed-factory.js';
import { hashPassword } from '../../src/utils/passwordConfig.js';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';

const { default: AttendanceService } = await import('../../src/domains/attendance/attendance.service.js');

jest.setTimeout(30000);

describe('AttendanceService integration (MySQL/Prisma)', () => {
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

  async function setupAttendanceFlow() {
    const owner = await createOwner();
    const memberUser = await createMember();
    const gym = await createGym(owner.id, { verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, {
      name: 'Attendance Package',
      durationDays: 30
    });
    const membership = await createMembership(memberUser.id, gym.id, membershipPackage.id, {
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'AKTIF'
    });
    const penjaga = await testPrisma.user.create({
      data: {
        name: 'Gym Penjaga',
        username: 'gym_penjaga',
        email: 'gym_penjaga@example.com',
        password: await hashPassword('password123'),
        role: 'PENJAGA',
        gymId: gym.id
      }
    });

    return { owner, memberUser, gym, membershipPackage, membership, penjaga };
  }

  test('getAttendanceToken should return token for active membership in target gym', async () => {
    const { memberUser, gym, membership } = await setupAttendanceFlow();

    const result = await AttendanceService.getAttendanceToken(memberUser.id, gym.id);

    expect(result).toHaveProperty('token');
    expect(result.memberId).toBe(`GYM${gym.id}-MEMBERSHIP${membership.id}`);
  });

  test('checkIn should create active attendance for valid token and penjaga', async () => {
    const { memberUser, gym, penjaga } = await setupAttendanceFlow();
    const tokenResult = await AttendanceService.getAttendanceToken(memberUser.id, gym.id);

    const response = await AttendanceService.checkIn(tokenResult.token, penjaga.id);
    const attendances = await testPrisma.attendance.findMany({
      where: { gymId: gym.id, checkOutAt: null },
      include: {
        membership: {
          include: {
            user: true
          }
        }
      }
    });

    expect(response.message).toBe('Check-in successful');
    expect(response.attendance.id).toBe(memberUser.id);
    expect(response.attendance.email).toBe(memberUser.email);
    expect(attendances).toHaveLength(1);
    expect(attendances[0].createdById).toBe(penjaga.id);
    expect(attendances[0].membership.userId).toBe(memberUser.id);
  });

  test('getAllAttendace should return only active check-ins for a gym', async () => {
    const { memberUser, gym, penjaga } = await setupAttendanceFlow();
    const tokenResult = await AttendanceService.getAttendanceToken(memberUser.id, gym.id);
    await AttendanceService.checkIn(tokenResult.token, penjaga.id);

    const activeAttendance = await AttendanceService.getAllAttendace(gym.id);

    expect(activeAttendance).toHaveLength(1);
    expect(activeAttendance[0].gymId).toBe(gym.id);
    expect(activeAttendance[0].checkOutAt).toBeNull();
    expect(activeAttendance[0].membership.user.id).toBe(memberUser.id);
    expect(activeAttendance[0].membership.user.name).toBe(memberUser.name);
  });

  test('checkOut should update open attendance with checkout timestamp', async () => {
    const { memberUser, gym, penjaga } = await setupAttendanceFlow();
    const tokenResult = await AttendanceService.getAttendanceToken(memberUser.id, gym.id);
    await AttendanceService.checkIn(tokenResult.token, penjaga.id);

    const response = await AttendanceService.checkOut(memberUser.id);
    const attendance = await testPrisma.attendance.findFirst({
      where: {
        membership: { userId: memberUser.id },
        gymId: gym.id
      }
    });

    expect(response).toEqual({ message: 'Check-out successful' });
    expect(attendance.checkOutAt).not.toBeNull();
  });

  test('getAttendanceHistory and getMemberAttendanceHistory should return persisted attendance records', async () => {
    const { memberUser, gym, penjaga } = await setupAttendanceFlow();
    const tokenResult = await AttendanceService.getAttendanceToken(memberUser.id, gym.id);
    await AttendanceService.checkIn(tokenResult.token, penjaga.id);
    await AttendanceService.checkOut(memberUser.id);

    const gymHistory = await AttendanceService.getAttendanceHistory(gym.id);
    const memberHistory = await AttendanceService.getMemberAttendanceHistory(memberUser.id);

    expect(gymHistory).toHaveLength(1);
    expect(gymHistory[0].membership.user.name).toBe(memberUser.name);
    expect(gymHistory[0].checkOutAt).not.toBeNull();
    expect(memberHistory).toHaveLength(1);
    expect(memberHistory[0].gymId).toBe(gym.id);
    expect(memberHistory[0].checkOutAt).not.toBeNull();
  });
});
