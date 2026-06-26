import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { cleanupDatabase, connectTestDatabase, disconnectTestDatabase, getTestDatabaseUrl, testPrisma } from '../helpers/db-test-helper.js';
import { createGym, createOwner } from '../helpers/seed-factory.js';
import { hashPassword } from '../../src/utils/passwordConfig.js';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';

const { default: CashflowService } = await import('../../src/domains/gym/cashflow/cashflow.service.js');

jest.setTimeout(30000);

describe('CashflowService integration (MySQL/Prisma)', () => {
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

  async function setupCashflowFlow() {
    const owner = await createOwner();
    const gym = await createGym(owner.id, { verified: 'APPROVED' });
    const staff = await testPrisma.user.create({
      data: {
        name: 'Cashflow Staff',
        username: 'cashflow_staff',
        email: 'cashflow_staff@example.com',
        password: await hashPassword('password123'),
        role: 'PENJAGA',
        gymId: gym.id
      }
    });

    return { owner, gym, staff };
  }

  test('create should persist gym cashflow into sandbox database', async () => {
    const { owner, gym } = await setupCashflowFlow();

    const result = await CashflowService.create(owner.id, {
      gymId: gym.id,
      name: 'Membership Income',
      amount: 150000,
      transactionType: 'PENDAPATAN',
      cashflowType: 'CASHLESS',
      date: new Date('2026-05-09T00:00:00.000Z'),
      note: 'Monthly membership payment'
    });

    const persistedCashflow = await testPrisma.gymCashflow.findUnique({
      where: { id: result.id }
    });

    expect(persistedCashflow).not.toBeNull();
    expect(persistedCashflow.gymId).toBe(gym.id);
    expect(persistedCashflow.name).toBe('Membership Income');
    expect(Number(persistedCashflow.amount)).toBe(150000);
    expect(persistedCashflow.isDeleted).toBe(false);
  });

  test('update should allow owner to update cashflow and set updatedById', async () => {
    const { owner, gym } = await setupCashflowFlow();
    const cashflow = await testPrisma.gymCashflow.create({
      data: {
        gymId: gym.id,
        name: 'Old Cashflow',
        amount: '100000.00',
        transactionType: 'PENDAPATAN',
        cashflowType: 'CASH',
        date: new Date('2026-05-09T00:00:00.000Z'),
        note: 'Old note'
      }
    });

    const result = await CashflowService.update(owner.id, cashflow.id, {
      gymId: gym.id,
      name: 'Updated Cashflow',
      amount: 120000,
      transactionType: 'PENDAPATAN',
      cashflowType: 'CASHLESS',
      date: new Date('2026-05-10T00:00:00.000Z'),
      note: 'Updated note'
    });

    expect(result.name).toBe('Updated Cashflow');
    expect(Number(result.amount)).toBe(120000);
    expect(result.updatedById).toBe(owner.id);
    expect(result.cashflowType).toBe('CASHLESS');
  });

  test('delete should soft delete cashflow and set deletedById', async () => {
    const { owner, gym } = await setupCashflowFlow();
    const cashflow = await testPrisma.gymCashflow.create({
      data: {
        gymId: gym.id,
        name: 'Delete Cashflow',
        amount: '50000.00',
        transactionType: 'PENGELUARAN',
        cashflowType: 'CASH',
        date: new Date('2026-05-09T00:00:00.000Z'),
        note: 'Delete me'
      }
    });

    await CashflowService.delete(owner.id, gym.id, cashflow.id);

    const deletedCashflow = await testPrisma.gymCashflow.findUnique({
      where: { id: cashflow.id }
    });

    expect(deletedCashflow.isDeleted).toBe(true);
    expect(deletedCashflow.deletedById).toBe(owner.id);
  });

  test('getAll should return only non-deleted cashflows accessible by staff', async () => {
    const { gym, staff } = await setupCashflowFlow();

    await testPrisma.gymCashflow.createMany({
      data: [
        {
          gymId: gym.id,
          name: 'Protein Drink Sales',
          amount: '30000.00',
          transactionType: 'PENDAPATAN',
          cashflowType: 'CASH',
          date: new Date('2026-05-09T00:00:00.000Z'),
          note: 'Sales'
        },
        {
          gymId: gym.id,
          name: 'Treadmill Maintenance',
          amount: '80000.00',
          transactionType: 'PENGELUARAN',
          cashflowType: 'CASHLESS',
          date: new Date('2026-05-10T00:00:00.000Z'),
          note: 'Repair'
        },
        {
          gymId: gym.id,
          name: 'Deleted Cashflow',
          amount: '10000.00',
          transactionType: 'PENDAPATAN',
          cashflowType: 'CASH',
          date: new Date('2026-05-11T00:00:00.000Z'),
          note: 'Should not show',
          isDeleted: true
        }
      ]
    });

    const result = await CashflowService.getAll(staff.id, gym.id, undefined, 10, 0);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.name)).toEqual(
      expect.arrayContaining(['Protein Drink Sales', 'Treadmill Maintenance'])
    );
    expect(result.every((item) => item.isDeleted === false)).toBe(true);
  });

  test('getAll with search should return matching accessible non-deleted cashflows', async () => {
    const { gym, staff } = await setupCashflowFlow();

    await testPrisma.gymCashflow.createMany({
      data: [
        {
          gymId: gym.id,
          name: 'Protein Drink Sales',
          amount: '30000.00',
          transactionType: 'PENDAPATAN',
          cashflowType: 'CASH',
          date: new Date('2026-05-09T00:00:00.000Z'),
          note: 'Sales'
        },
        {
          gymId: gym.id,
          name: 'Treadmill Maintenance',
          amount: '150000.00',
          transactionType: 'PENGELUARAN',
          cashflowType: 'CASHLESS',
          date: new Date('2026-05-10T00:00:00.000Z'),
          note: 'Service'
        }
      ]
    });

    const result = await CashflowService.getAll(staff.id, gym.id, 'Protein', 10, 0);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Protein Drink Sales');
    expect(result[0].isDeleted).toBe(false);
  });

  test('getById should return one accessible non-deleted cashflow for owner', async () => {
    const { owner, gym } = await setupCashflowFlow();
    const cashflow = await testPrisma.gymCashflow.create({
      data: {
        gymId: gym.id,
        name: 'Specific Cashflow',
        amount: '99000.00',
        transactionType: 'PENDAPATAN',
        cashflowType: 'CASHLESS',
        date: new Date('2026-05-12T00:00:00.000Z'),
        note: 'Specific lookup'
      }
    });

    const result = await CashflowService.getById(owner.id, gym.id, cashflow.id);

    expect(result).not.toBeNull();
    expect(result.id).toBe(cashflow.id);
    expect(result.name).toBe('Specific Cashflow');
    expect(Number(result.amount)).toBe(99000);
  });
});
