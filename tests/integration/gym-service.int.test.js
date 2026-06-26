import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { cleanupDatabase, connectTestDatabase, disconnectTestDatabase, getTestDatabaseUrl, testPrisma } from '../helpers/db-test-helper.js';
import { createGym, createOwner } from '../helpers/seed-factory.js';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';

const uploadFileMock = jest.fn();

jest.unstable_mockModule('../../src/utils/saveImage.js', () => ({
  uploadFile: uploadFileMock
}));

const { default: GymService } = await import('../../src/domains/gym/gym.service.js');

jest.setTimeout(30000);

describe('GymService integration (MySQL/Prisma)', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await cleanupDatabase();
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    uploadFileMock.mockReset();
    await cleanupDatabase();
  });

  test('createGym should persist gym and gym images in sandbox database', async () => {
    const owner = await createOwner();
    uploadFileMock.mockResolvedValue([
      'https://files.test/gym-1.png',
      'https://files.test/gym-2.png'
    ]);

    const gym = await GymService.createGym(
      {
        ownerId: owner.id,
        namaGym: 'Sandbox Gym',
        maxCp: 120,
        latitude: -6.2,
        longitude: 106.8,
        jamOperasional: '06:00-22:00',
        address: 'Jl. Sandbox 1',
        fac: ['WiFi', 'Locker'],
        tag: 'premium',
        description: 'Sandbox integration gym'
      },
      [{ originalname: 'gym.png' }]
    );

    const persistedGym = await testPrisma.gym.findUnique({
      where: { id: gym.id },
      include: { gymImage: true }
    });

    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    expect(persistedGym).not.toBeNull();
    expect(persistedGym.ownerId).toBe(owner.id);
    expect(persistedGym.name).toBe('Sandbox Gym');
    expect(persistedGym.gymImage).toHaveLength(2);
    expect(persistedGym.gymImage.map((image) => image.url)).toEqual([
      'https://files.test/gym-1.png',
      'https://files.test/gym-2.png'
    ]);
  });

  test('updateGym should update gym data without requiring a new image', async () => {
    const owner = await createOwner();
    const gym = await createGym(owner.id, {
      name: 'Editable Service Gym',
      address: 'Old Address',
      verified: 'APPROVED',
      gymImages: ['https://files.test/old-gym.png']
    });

    const result = await GymService.updateGym(
      {
        name: 'Updated Service Gym',
        maxCapacity: 200,
        address: 'New Address',
        jamOperasional: '05:00-23:00',
        latitude: -6.21,
        longitude: 106.82,
        facility: ['WiFi', 'Cafe'],
        tag: 'updated-tag',
        description: 'Updated from service integration test'
      },
      owner.id,
      gym.id
    );

    const persistedGym = await testPrisma.gym.findUnique({
      where: { id: gym.id },
      include: { gymImage: true }
    });

    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(result.name).toBe('Updated Service Gym');
    expect(result.gymImage).toHaveLength(1);
    expect(result.gymImage[0].url).toBe('https://files.test/old-gym.png');
    expect(persistedGym.name).toBe('Updated Service Gym');
    expect(persistedGym.address).toBe('New Address');
    expect(persistedGym.gymImage).toHaveLength(1);
    expect(persistedGym.gymImage[0].url).toBe('https://files.test/old-gym.png');
  });

  test('updateGym should replace gym images when a new image is uploaded', async () => {
    const owner = await createOwner();
    const gym = await createGym(owner.id, {
      name: 'Replace Image Gym',
      verified: 'APPROVED',
      gymImages: ['https://files.test/old-gym.png']
    });

    uploadFileMock.mockResolvedValue([
      'https://files.test/new-gym-1.png',
      'https://files.test/new-gym-2.png'
    ]);

    const result = await GymService.updateGym(
      {
        name: 'Replace Image Gym Updated'
      },
      owner.id,
      gym.id,
      [{ originalname: 'new-gym.png', buffer: Buffer.from('1'), mimetype: 'image/png' }]
    );

    const persistedGym = await testPrisma.gym.findUnique({
      where: { id: gym.id },
      include: { gymImage: true }
    });

    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    expect(result.name).toBe('Replace Image Gym Updated');
    expect(result.gymImage).toHaveLength(2);
    expect(result.gymImage.map((image) => image.url)).toEqual([
      'https://files.test/new-gym-1.png',
      'https://files.test/new-gym-2.png'
    ]);
    expect(persistedGym.gymImage).toHaveLength(2);
    expect(persistedGym.gymImage.map((image) => image.url)).toEqual([
      'https://files.test/new-gym-1.png',
      'https://files.test/new-gym-2.png'
    ]);
  });

  test('getAllGym should return only approved gyms and support search filter', async () => {
    const owner = await createOwner();
    const approvedGym = await createGym(owner.id, {
      name: 'Alpha Fitness',
      verified: 'APPROVED'
    });
    await createGym(owner.id, {
      name: 'Pending Fitness',
      verified: 'PENDING'
    });

    const gyms = await GymService.getAllGym('Alpha');

    expect(gyms).toHaveLength(1);
    expect(gyms[0].id).toBe(approvedGym.id);
    expect(gyms[0].name).toBe('Alpha Fitness');
  });

  test('getGymById should return approved gym with its images', async () => {
    const owner = await createOwner();
    const gym = await createGym(owner.id, {
      name: 'Image Gym',
      verified: 'APPROVED'
    });
    await testPrisma.gymImage.createMany({
      data: [
        { gymId: gym.id, url: 'https://files.test/1.png' },
        { gymId: gym.id, url: 'https://files.test/2.png' }
      ]
    });

    const result = await GymService.getGymById(gym.id);

    expect(result.id).toBe(gym.id);
    expect(result.name).toBe('Image Gym');
    expect(result.gymImage).toHaveLength(2);
  });

  test('verifedGym should update pending gym status to APPROVED', async () => {
    const owner = await createOwner();
    const gym = await createGym(owner.id, {
      verified: 'PENDING'
    });

    const response = await GymService.verifedGym(gym.id, 'APPROVED');
    const updatedGym = await testPrisma.gym.findUnique({ where: { id: gym.id } });

    expect(response).toBe('Successfully verified gym');
    expect(updatedGym.verified).toBe('APPROVED');
  });

  test('createPenjagaGym should create a penjaga linked to owner gym', async () => {
    const owner = await createOwner();
    const gym = await createGym(owner.id, {
      verified: 'APPROVED'
    });

    const response = await GymService.createPenjagaGym(
      {
        name: 'Penjaga One',
        username: 'penjaga_one',
        email: 'penjaga_one@example.com',
        password: 'securepass'
      },
      owner.id
    );

    const persistedPenjaga = await testPrisma.user.findUnique({
      where: { email: 'penjaga_one@example.com' }
    });

    expect(response.message).toBe('Succefully create penjaga');
    expect(response.data).toEqual({
      username: 'penjaga_one',
      name: 'Penjaga One'
    });
    expect(persistedPenjaga).not.toBeNull();
    expect(persistedPenjaga.role).toBe('PENJAGA');
    expect(persistedPenjaga.gymId).toBe(gym.id);
  });

  test('deletePenjagaGym should remove penjaga belonging to owner gym', async () => {
    const owner = await createOwner();
    const gym = await createGym(owner.id);
    const penjaga = await testPrisma.user.create({
      data: {
        name: 'Delete Me',
        username: 'delete_me',
        email: 'delete_me@example.com',
        password: 'hashed-password',
        role: 'PENJAGA',
        gymId: gym.id
      }
    });

    const response = await GymService.deletePenjagaGym(penjaga.id, owner.id);
    const deletedPenjaga = await testPrisma.user.findUnique({ where: { id: penjaga.id } });

    expect(response).toEqual({ message: 'Succesfully delete penjaga' });
    expect(deletedPenjaga).toBeNull();
  });
});
