import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import crypto from 'crypto';
import { cleanupDatabase, connectTestDatabase, disconnectTestDatabase, getTestDatabaseUrl, testPrisma } from '../helpers/db-test-helper.js';
import { createGym, createMember, createMembership, createMembershipPackage, createOwner } from '../helpers/seed-factory.js';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || 'midtrans-test-server-key';

const createTransactionMock = jest.fn();

jest.unstable_mockModule('../../src/config/midtrans.js', () => ({
  snap: {
    createTransaction: createTransactionMock
  }
}));

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
    createTransactionMock.mockReset();
    await cleanupDatabase();
  });

  test('createSnap should create pending transaction and persist generated orderId', async () => {
    const owner = await createOwner();
    const member = await createMember();
    const gym = await createGym(owner.id, { verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, {
      name: 'Monthly Membership',
      price: '150000.00',
      durationDays: 30
    });

    createTransactionMock.mockResolvedValue({
      token: 'snap-token-123',
      redirect_url: 'https://snap.test/redirect'
    });

    const result = await MembershipTransactionService.createSnap(
      membershipPackage.id,
      member.id,
      gym.id
    );

    const transaction = await testPrisma.transaction.findUnique({
      where: { id: result.transactionId }
    });

    expect(createTransactionMock).toHaveBeenCalledTimes(1);
    expect(result.token).toBe('snap-token-123');
    expect(result.redirectUrl).toBe('https://snap.test/redirect');
    expect(result.adminFee).toBe(2000);
    expect(result.grossAmount).toBe(152000);
    expect(result.orderId).toMatch(new RegExp(`^GYM-${gym.id}-${result.transactionId}-`));
    expect(transaction).not.toBeNull();
    expect(transaction.userId).toBe(member.id);
    expect(transaction.gymId).toBe(gym.id);
    expect(transaction.status).toBe('PENDING');
    expect(transaction.orderId).toBe(result.orderId);
    expect(Number(transaction.amount)).toBe(152000);
  });

  test('createSnap should allow when user still has active membership (Queue System)', async () => {
    const owner = await createOwner();
    const member = await createMember();
    const gym = await createGym(owner.id);
    const membershipPackage = await createMembershipPackage(gym.id);

    await createMembership(member.id, gym.id, membershipPackage.id, {
      endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      status: 'AKTIF'
    });

    createTransactionMock.mockResolvedValue({
      token: 'snap-token-queue',
      redirect_url: 'https://snap.test/redirect-queue'
    });

    const result = await MembershipTransactionService.createSnap(membershipPackage.id, member.id, gym.id);
    expect(result).toHaveProperty('token');
    expect(result).toHaveProperty('redirectUrl');
  });

  test('updateTransactionStatus should mark settlement as PAID, create membership, and create gym cashflow', async () => {
    const owner = await createOwner();
    const member = await createMember();
    const gym = await createGym(owner.id);
    const membershipPackage = await createMembershipPackage(gym.id, {
      name: 'Quarterly Membership',
      durationDays: 90,
      price: '300000.00'
    });

    const transaction = await testPrisma.transaction.create({
      data: {
        gymId: gym.id,
        userId: member.id,
        date: new Date(),
        amount: '302000.00',
        type: 'PENDAPATAN',
        note: 'Membership package purchase: Quarterly Membership',
        orderId: 'GYM-TEST-ORDER-1'
      }
    });

    const result = await MembershipTransactionService.updateTransactionStatus({
      order_id: transaction.orderId,
      transaction_status: 'settlement',
      payment_type: 'bank_transfer',
      fraud_status: 'accept',
      metadata: {
        type: 'membership',
        packageId: membershipPackage.id,
        gymId: gym.id,
        userId: member.id,
        transactionId: transaction.id
      }
    });

    const updatedTransaction = await testPrisma.transaction.findUnique({
      where: { id: transaction.id }
    });
    const memberships = await testPrisma.membership.findMany({
      where: { userId: member.id, gymId: gym.id }
    });
    const cashflows = await testPrisma.gymCashflow.findMany({
      where: { gymId: gym.id }
    });

    expect(result).toBe(true);
    expect(updatedTransaction.status).toBe('PAID');
    expect(updatedTransaction.paymentMethod).toBe('bank_transfer');
    expect(updatedTransaction.membershipId).not.toBeNull();
    expect(memberships).toHaveLength(1);
    expect(memberships[0].packageId).toBe(membershipPackage.id);
    expect(memberships[0].status).toBe('AKTIF');
    expect(cashflows).toHaveLength(1);
    expect(cashflows[0].name).toBe('Pembayaran Membership - Quarterly Membership');
    expect(Number(cashflows[0].amount)).toBe(302000);
    expect(cashflows[0].transactionType).toBe('PENDAPATAN');
    expect(cashflows[0].cashflowType).toBe('CASHLESS');
  });

  test('updateTransactionStatus should extend active membership duration when renewal payment succeeds', async () => {
    const owner = await createOwner();
    const member = await createMember();
    const gym = await createGym(owner.id);
    const currentPackage = await createMembershipPackage(gym.id, {
      name: 'Current Membership',
      durationDays: 30,
      price: '100000.00'
    });
    const renewalPackage = await createMembershipPackage(gym.id, {
      name: 'Renewal Membership',
      durationDays: 30,
      price: '120000.00'
    });

    const currentEndDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const existingMembership = await createMembership(member.id, gym.id, currentPackage.id, {
      startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      endDate: currentEndDate,
      status: 'AKTIF'
    });

    const transaction = await testPrisma.transaction.create({
      data: {
        gymId: gym.id,
        userId: member.id,
        date: new Date(),
        amount: '122000.00',
        type: 'PENDAPATAN',
        note: 'Membership package purchase: Renewal Membership',
        orderId: 'GYM-TEST-RENEWAL-1'
      }
    });

    const result = await MembershipTransactionService.updateTransactionStatus({
      order_id: transaction.orderId,
      transaction_status: 'settlement',
      payment_type: 'qris',
      fraud_status: 'accept',
      metadata: {
        type: 'membership',
        packageId: renewalPackage.id,
        gymId: gym.id,
        userId: member.id,
        transactionId: transaction.id
      }
    });

    const updatedTransaction = await testPrisma.transaction.findUnique({
      where: { id: transaction.id }
    });
    const updatedMembership = await testPrisma.membership.findUnique({
      where: { id: existingMembership.id }
    });
    const allMemberships = await testPrisma.membership.findMany({
      where: { userId: member.id, gymId: gym.id }
    });
    const expectedEndDate = new Date(currentEndDate);
    expectedEndDate.setDate(expectedEndDate.getDate() + renewalPackage.durationDays);

    expect(result).toBe(true);
    expect(updatedTransaction.status).toBe('PAID');
    expect(updatedTransaction.membershipId).not.toBe(existingMembership.id);
    expect(allMemberships).toHaveLength(2); // History is kept
    
    // Find the new membership created
    const newMembership = allMemberships.find(m => m.id === updatedTransaction.membershipId);
    expect(newMembership.packageId).toBe(renewalPackage.id);
    expect(newMembership.status).toBe('TIDAK'); // Queue mode (pending start date)
    expect(newMembership.endDate.getTime()).toBe(expectedEndDate.getTime());
    expect(newMembership.endDate.getTime()).toBeGreaterThan(currentEndDate.getTime());
  });

  test('notificationSnap should process valid membership webhook using signature verification', async () => {
    const owner = await createOwner();
    const member = await createMember();
    const gym = await createGym(owner.id);
    const membershipPackage = await createMembershipPackage(gym.id, {
      name: 'Weekly Membership',
      durationDays: 7,
      price: '50000.00'
    });

    await testPrisma.transaction.create({
      data: {
        gymId: gym.id,
        userId: member.id,
        date: new Date(),
        amount: '52000.00',
        type: 'PENDAPATAN',
        note: 'Membership package purchase: Weekly Membership',
        orderId: 'GYM-TEST-ORDER-2'
      }
    });

    const grossAmount = '52000.00';
    const statusCode = '200';
    const signatureKey = crypto
      .createHash('sha512')
      .update(`GYM-TEST-ORDER-2${statusCode}${grossAmount}${process.env.MIDTRANS_SERVER_KEY}`)
      .digest('hex');

    const result = await MembershipTransactionService.notificationSnap({
      order_id: 'GYM-TEST-ORDER-2',
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: signatureKey,
      transaction_status: 'settlement',
      payment_type: 'qris',
      fraud_status: 'accept',
      metadata: {
        type: 'membership',
        packageId: membershipPackage.id,
        gymId: gym.id,
        userId: member.id
      }
    });

    const transaction = await testPrisma.transaction.findUnique({
      where: { orderId: 'GYM-TEST-ORDER-2' }
    });
    const cashflows = await testPrisma.gymCashflow.findMany({ where: { gymId: gym.id } });

    expect(result).toBe(true);
    expect(transaction.status).toBe('PAID');
    expect(transaction.paymentMethod).toBe('qris');
    expect(transaction.membershipId).not.toBeNull();
    expect(cashflows).toHaveLength(1);
  });
});
