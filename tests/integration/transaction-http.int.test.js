import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import crypto from 'crypto';

jest.unstable_mockModule('../../src/config/midtrans.js', () => ({
  snap: {
    createTransaction: jest.fn(async (parameter) => ({
      token: `snap-token-${parameter.transaction_details.order_id}`,
      redirect_url: `https://midtrans.test/pay/${parameter.transaction_details.order_id}`
    }))
  }
}));

const { snap } = await import('../../src/config/midtrans.js');
const { createRequest } = await import('../helpers/request-test-helper.js');
const {
  cleanupDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
  getTestDatabaseUrl,
  resetTestDatabase,
  testPrisma
} = await import('../helpers/db-test-helper.js');
const {
  createAuthenticatedMember,
  createAuthenticatedOwner,
  createAuthHeaderForUser
} = await import('../helpers/auth-test-helper.js');
const {
  createGym,
  createMembership,
  createMembershipPackage,
  createTransaction
} = await import('../helpers/seed-factory.js');

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.DATABASE_URL_TEST = getTestDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || 'midtrans-server-key-test';
process.env.NODE_ENV = 'test';

jest.setTimeout(30000);

function createMidtransSignature(orderId, statusCode, grossAmount) {
  return crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${process.env.MIDTRANS_SERVER_KEY}`)
    .digest('hex');
}

describe('Transaction HTTP integration', () => {
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

  test('POST /api/v1/transaction/create-snap should create pending transaction and return snap data', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Snap Gym', verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, {
      name: 'Snap Package',
      price: '100000.00',
      durationDays: 30
    });

    const request = await createRequest();
    const response = await request
      .post('/api/v1/transaction/create-snap')
      .set('Authorization', createAuthHeaderForUser(member))
      .send({
        packageId: membershipPackage.id,
        gymId: gym.id
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('Created');
    expect(response.body.data).toHaveProperty('token');
    expect(response.body.data).toHaveProperty('redirectUrl');
    expect(response.body.data).toHaveProperty('transactionId');
    expect(response.body.data).toHaveProperty('orderId');
    expect(response.body.data.grossAmount).toBe(102000);
    expect(snap.createTransaction).toHaveBeenCalledTimes(1);

    const createdTransaction = await testPrisma.transaction.findUnique({
      where: { id: response.body.data.transactionId }
    });
    expect(createdTransaction).not.toBeNull();
    expect(createdTransaction.userId).toBe(member.id);
    expect(createdTransaction.gymId).toBe(gym.id);
    expect(createdTransaction.status).toBe('PENDING');
    expect(createdTransaction.orderId).toBe(response.body.data.orderId);
  });

  test('POST /api/v1/transaction/create-snap should allow member with still-active membership (Queue Mode)', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Active Membership Snap Gym', verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, {
      name: 'Protected Package',
      price: '100000.00',
      durationDays: 30
    });
    await createMembership(member.id, gym.id, membershipPackage.id, { status: 'AKTIF' });

    const request = await createRequest();
    const response = await request
      .post('/api/v1/transaction/create-snap')
      .set('Authorization', createAuthHeaderForUser(member))
      .send({
        packageId: membershipPackage.id,
        gymId: gym.id
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('Created');
    expect(snap.createTransaction).toHaveBeenCalled();
  });

  test('POST /api/v1/transaction/webhook-midtrans should settle payment and create membership + cashflow', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Webhook Gym', verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, {
      name: 'Webhook Package',
      price: '100000.00',
      durationDays: 30
    });
    const transaction = await createTransaction({
      gymId: gym.id,
      userId: member.id,
      amount: '102000.00',
      orderId: 'ORDER-WEBHOOK-1',
      status: 'PENDING',
      paymentMethod: null
    });

    const payload = {
      order_id: transaction.orderId,
      status_code: '200',
      gross_amount: '102000.00',
      signature_key: createMidtransSignature(transaction.orderId, '200', '102000.00'),
      transaction_status: 'settlement',
      payment_type: 'qris',
      fraud_status: 'accept',
      metadata: {
        type: 'membership',
        packageId: membershipPackage.id,
        gymId: gym.id,
        userId: member.id,
        transactionId: transaction.id
      }
    };

    const request = await createRequest();
    const response = await request
      .post('/api/v1/transaction/webhook-midtrans')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toBe(true);

    const updatedTransaction = await testPrisma.transaction.findUnique({ where: { id: transaction.id } });
    expect(updatedTransaction.status).toBe('PAID');
    expect(updatedTransaction.paymentMethod).toBe('qris');
    expect(updatedTransaction.membershipId).not.toBeNull();

    const createdMembership = await testPrisma.membership.findUnique({ where: { id: updatedTransaction.membershipId } });
    expect(createdMembership).not.toBeNull();
    expect(createdMembership.userId).toBe(member.id);
    expect(createdMembership.gymId).toBe(gym.id);
    expect(createdMembership.packageId).toBe(membershipPackage.id);

    const createdCashflow = await testPrisma.gymCashflow.findFirst({
      where: {
        gymId: gym.id,
        name: `Pembayaran Membership - ${membershipPackage.name}`
      }
    });
    expect(createdCashflow).not.toBeNull();
  });

  test('POST /api/v1/transaction/webhook-midtrans should be idempotent for duplicate settlement webhook', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Idempotent Gym', verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, {
      name: 'Idempotent Package',
      price: '150000.00',
      durationDays: 30
    });
    const transaction = await createTransaction({
      gymId: gym.id,
      userId: member.id,
      amount: '152000.00',
      orderId: 'ORDER-IDEMPOTENT-1',
      status: 'PENDING',
      paymentMethod: null
    });

    const payload = {
      order_id: transaction.orderId,
      status_code: '200',
      gross_amount: '152000.00',
      signature_key: createMidtransSignature(transaction.orderId, '200', '152000.00'),
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
    };

    const request = await createRequest();
    const firstResponse = await request.post('/api/v1/transaction/webhook-midtrans').send(payload);
    const secondResponse = await request.post('/api/v1/transaction/webhook-midtrans').send(payload);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    const memberships = await testPrisma.membership.findMany({
      where: { userId: member.id, gymId: gym.id }
    });
    const cashflows = await testPrisma.gymCashflow.findMany({
      where: {
        gymId: gym.id,
        name: `Pembayaran Membership - ${membershipPackage.name}`
      }
    });

    expect(memberships).toHaveLength(1);
    expect(cashflows).toHaveLength(1);
  });

  test('POST /api/v1/transaction/webhook-midtrans should extend active membership when renewal payment succeeds', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Renewal Gym', verified: 'APPROVED' });
    const currentPackage = await createMembershipPackage(gym.id, {
      name: 'Current Package',
      price: '100000.00',
      durationDays: 30
    });
    const renewalPackage = await createMembershipPackage(gym.id, {
      name: 'Renewal Package',
      price: '120000.00',
      durationDays: 30
    });

    const currentEndDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const existingMembership = await createMembership(member.id, gym.id, currentPackage.id, {
      startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      endDate: currentEndDate,
      status: 'AKTIF'
    });

    const transaction = await createTransaction({
      gymId: gym.id,
      userId: member.id,
      amount: '122000.00',
      orderId: 'ORDER-RENEWAL-HTTP-1',
      status: 'PENDING',
      paymentMethod: null,
      note: 'Membership package purchase: Renewal Package'
    });

    const payload = {
      order_id: transaction.orderId,
      status_code: '200',
      gross_amount: '122000.00',
      signature_key: createMidtransSignature(transaction.orderId, '200', '122000.00'),
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
    };

    const request = await createRequest();
    const response = await request
      .post('/api/v1/transaction/webhook-midtrans')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toBe(true);

    const updatedTransaction = await testPrisma.transaction.findUnique({ where: { id: transaction.id } });
    const allMemberships = await testPrisma.membership.findMany({ where: { userId: member.id, gymId: gym.id } });
    const updatedMembership = allMemberships.find(m => m.id === updatedTransaction.membershipId);

    const expectedEndDate = new Date(currentEndDate);
    expectedEndDate.setDate(expectedEndDate.getDate() + renewalPackage.durationDays);

    expect(updatedTransaction.status).toBe('PAID');
    expect(updatedTransaction.paymentMethod).toBe('qris');
    expect(updatedTransaction.membershipId).not.toBe(existingMembership.id);
    expect(allMemberships).toHaveLength(2); // History is kept
    expect(updatedMembership.packageId).toBe(renewalPackage.id);
    expect(updatedMembership.status).toBe('TIDAK'); // Queue system (future start date)
    expect(updatedMembership.endDate.getTime()).toBe(expectedEndDate.getTime());
    expect(updatedMembership.endDate.getTime()).toBeGreaterThan(currentEndDate.getTime());
  });

  test('GET /api/v1/transaction/history should return membership transaction history for authenticated member', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const anotherMember = await createAuthenticatedMember({
      username: 'other_member_transaction_history',
      email: 'other_member_transaction_history@example.com',
      password: 'Password123!'
    });

    const gym = await createGym(owner.id, { name: 'History Gym', verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, {
      name: 'History Package',
      price: '100000.00',
      durationDays: 30
    });

    await createMembership(member.id, gym.id, membershipPackage.id, { status: 'AKTIF' });
    await createMembership(anotherMember.user.id, gym.id, membershipPackage.id, { status: 'AKTIF' });

    const firstTransaction = await createTransaction({
      gymId: gym.id,
      userId: member.id,
      amount: '102000.00',
      orderId: 'ORDER-HISTORY-1',
      status: 'PAID',
      paymentMethod: 'qris',
      note: 'Membership package purchase: History Package'
    });

    const secondTransaction = await createTransaction({
      gymId: gym.id,
      userId: member.id,
      amount: '152000.00',
      orderId: 'ORDER-HISTORY-2',
      status: 'PENDING',
      paymentMethod: 'bank_transfer',
      note: 'Membership package purchase: History Package 2'
    });

    await createTransaction({
      gymId: gym.id,
      userId: anotherMember.user.id,
      amount: '202000.00',
      orderId: 'ORDER-HISTORY-OTHER',
      status: 'PAID',
      paymentMethod: 'qris',
      note: 'Should not be visible to requested member'
    });

    const request = await createRequest();
    const response = await request
      .get('/api/v1/transaction/history')
      .set('Authorization', createAuthHeaderForUser(member));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.recordsTotal).toBe(2);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstTransaction.id,
          userId: member.id,
          gymId: gym.id,
          orderId: 'ORDER-HISTORY-1',
          status: 'PAID'
        }),
        expect.objectContaining({
          id: secondTransaction.id,
          userId: member.id,
          gymId: gym.id,
          orderId: 'ORDER-HISTORY-2',
          status: 'PENDING'
        })
      ])
    );
    expect(response.body.data.every((transaction) => transaction.userId === member.id)).toBe(true);
  });

  test('POST /api/v1/transaction/webhook-midtrans should ignore invalid signature and keep transaction pending', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Invalid Signature Gym', verified: 'APPROVED' });
    const membershipPackage = await createMembershipPackage(gym.id, {
      name: 'Invalid Signature Package',
      price: '100000.00',
      durationDays: 30
    });
    const transaction = await createTransaction({
      gymId: gym.id,
      userId: member.id,
      amount: '102000.00',
      orderId: 'ORDER-INVALID-SIGNATURE',
      status: 'PENDING',
      paymentMethod: null
    });

    const payload = {
      order_id: transaction.orderId,
      status_code: '200',
      gross_amount: '102000.00',
      signature_key: 'invalid-signature',
      transaction_status: 'settlement',
      payment_type: 'qris',
      fraud_status: 'accept',
      metadata: {
        type: 'membership',
        packageId: membershipPackage.id,
        gymId: gym.id,
        userId: member.id,
        transactionId: transaction.id
      }
    };

    const request = await createRequest();
    const response = await request
      .post('/api/v1/transaction/webhook-midtrans')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toBe(true);

    const unchangedTransaction = await testPrisma.transaction.findUnique({ where: { id: transaction.id } });
    expect(unchangedTransaction.status).toBe('PENDING');
    expect(unchangedTransaction.membershipId).toBeNull();

    const memberships = await testPrisma.membership.findMany({ where: { userId: member.id, gymId: gym.id } });
    expect(memberships).toHaveLength(0);
  });
});
