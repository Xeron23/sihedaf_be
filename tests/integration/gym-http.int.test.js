import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

import {
  cleanupDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
  getTestDatabaseUrl,
  resetTestDatabase,
  testPrisma
} from '../helpers/db-test-helper.js';
import {
  createAuthenticatedAdmin,
  createAuthenticatedMember,
  createAuthenticatedOwner,
  createAuthenticatedPenjaga,
  createAuthHeaderForUser
} from '../helpers/auth-test-helper.js';
import { createGym } from '../helpers/seed-factory.js';
import { createRequest } from '../helpers/request-test-helper.js';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.DATABASE_URL_TEST = getTestDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.NODE_ENV = 'test';

const TEST_IMAGE_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0KQAAAAASUVORK5CYII=',
  'base64'
);
const uploadedObjectKeys = [];

const s3 = new S3Client({
  endpoint: process.env.IS3_END_POINT,
  region: process.env.IS3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.IS3_ACCESS_KEY_ID,
    secretAccessKey: process.env.IS3_SECRET_ACCESS_KEY_ID
  }
});

function extractObjectKeyFromUrl(url) {
  const base = `${process.env.IS3_END_POINT}/${process.env.IS3_BUCKET_NAME}/`;
  return url.startsWith(base) ? url.slice(base.length) : null;
}

jest.setTimeout(30000);

describe('Gym HTTP integration', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    for (const key of uploadedObjectKeys) {
      try {
        await s3.send(new DeleteObjectCommand({
          Bucket: process.env.IS3_BUCKET_NAME,
          Key: key
        }));
      } catch (_) {
        // noop cleanup best-effort
      }
    }
    await cleanupDatabase();
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  test('GET /api/v1/gym should return only approved gyms for allowed roles', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const approvedGym = await createGym(owner.id, { name: 'Approved Gym', verified: 'APPROVED' });
    await createGym(owner.id, { name: 'Pending Gym', verified: 'PENDING' });

    const request = await createRequest();
    const response = await request
      .get('/api/v1/gym')
      .set('Authorization', createAuthHeaderForUser(member));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(approvedGym.id);
    expect(response.body.data[0].name).toBe('Approved Gym');
  });

  test('GET /api/v1/gym/:id should return approved gym detail', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Detail Gym', verified: 'APPROVED' });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/gym/${gym.id}`)
      .set('Authorization', createAuthHeaderForUser(member));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.id).toBe(gym.id);
    expect(response.body.data.name).toBe('Detail Gym');
  });

  test('GET /api/v1/gym/:id should reject non-approved gym detail', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Pending Detail Gym', verified: 'PENDING' });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/gym/${gym.id}`)
      .set('Authorization', createAuthHeaderForUser(member));

    expect(response.status).toBe(404);
    expect(response.body.status).toBe('Not Found');
    expect(response.body.errors.message).toBe('gym not found');
  });

  test('GET /api/v1/gym/owner should return gyms owned by authenticated owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({
      username: 'owner_with_gyms',
      email: 'owner_with_gyms@example.com',
      password: 'Password123!'
    });
    const { user: anotherOwner } = await createAuthenticatedOwner({
      username: 'another_owner',
      email: 'another_owner@example.com',
      password: 'Password123!'
    });
    await createGym(owner.id, { name: 'Owner Gym 1', verified: 'APPROVED' });
    await createGym(owner.id, { name: 'Owner Gym 2', verified: 'PENDING' });
    await createGym(anotherOwner.id, { name: 'Other Owner Gym', verified: 'APPROVED' });

    const request = await createRequest();
    const response = await request
      .get('/api/v1/gym/owner')
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.map((gym) => gym.name).sort()).toEqual(['Owner Gym 1', 'Owner Gym 2']);
  });

  test('PUT /api/v1/gym/:id should update gym for the owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, {
      name: 'Editable Gym',
      address: 'Jl. Lama No. 1',
      verified: 'APPROVED'
    });

    const request = await createRequest();
    const response = await request
      .put(`/api/v1/gym/${gym.id}`)
      .set('Authorization', createAuthHeaderForUser(owner))
      .send({
        name: 'Updated Gym Name',
        maxCp: 150,
        address: 'Jl. Baru No. 2',
        jamOperasional: '05:00-23:00',
        lat: '-6.200000',
        long: '106.816666',
        fac: JSON.stringify(['WiFi', 'Cafe']),
        tag: 'premium',
        description: 'Updated description'
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.name).toBe('Updated Gym Name');
    expect(response.body.data.maxCapacity).toBe(150);

    const updatedGym = await testPrisma.gym.findUnique({ where: { id: gym.id } });
    expect(updatedGym.name).toBe('Updated Gym Name');
    expect(updatedGym.address).toBe('Jl. Baru No. 2');
    expect(updatedGym.tag).toBe('premium');
  });

  test('PUT /api/v1/gym/:id should update gym and replace image when a new image is uploaded', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, {
      name: 'Image Editable Gym',
      address: 'Jl. Gambar Lama',
      verified: 'APPROVED',
      gymImages: ['https://files.test/old-image.png']
    });

    const request = await createRequest();
    const response = await request
      .put(`/api/v1/gym/${gym.id}`)
      .set('Authorization', createAuthHeaderForUser(owner))
      .field('name', 'Image Updated Gym')
      .field('fac', JSON.stringify(['Studio', 'Cafe']))
      .attach('image', TEST_IMAGE_BUFFER, {
        filename: 'updated-gym-image.png',
        contentType: 'image/png'
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.name).toBe('Image Updated Gym');
    expect(response.body.data.gymImage).toHaveLength(1);

    const updatedGym = await testPrisma.gym.findUnique({
      where: { id: gym.id },
      include: { gymImage: true }
    });

    expect(updatedGym.gymImage).toHaveLength(1);
    expect(updatedGym.gymImage[0].url).toContain(`${process.env.IS3_PREFIX}/image-profile/${owner.id}/${gym.id}`);

    const objectKey = extractObjectKeyFromUrl(updatedGym.gymImage[0].url);
    expect(objectKey).toBeTruthy();

    const prefix = `${process.env.IS3_PREFIX}/image-profile/${owner.id}/${gym.id}/`;
    const listResult = await s3.send(new ListObjectsV2Command({
      Bucket: process.env.IS3_BUCKET_NAME,
      Prefix: prefix
    }));

    expect((listResult.Contents || []).length).toBeGreaterThanOrEqual(1);
    uploadedObjectKeys.push(objectKey);
  });

  test('PUT /api/v1/gym/:id should still update gym when no image is uploaded', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, {
      name: 'No Image Update Gym',
      address: 'Jl. Lama No. 3',
      verified: 'APPROVED',
      gymImages: ['https://files.test/existing-image.png']
    });

    const request = await createRequest();
    const response = await request
      .put(`/api/v1/gym/${gym.id}`)
      .set('Authorization', createAuthHeaderForUser(owner))
      .send({
        name: 'Still Updated Without Image',
        address: 'Jl. Baru No. 3',
        fac: JSON.stringify(['WiFi'])
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.name).toBe('Still Updated Without Image');
    expect(response.body.data.gymImage).toHaveLength(1);
    expect(response.body.data.gymImage[0].url).toBe('https://files.test/existing-image.png');

    const updatedGym = await testPrisma.gym.findUnique({
      where: { id: gym.id },
      include: { gymImage: true }
    });
    expect(updatedGym.address).toBe('Jl. Baru No. 3');
    expect(updatedGym.gymImage).toHaveLength(1);
    expect(updatedGym.gymImage[0].url).toBe('https://files.test/existing-image.png');
  });

  test('PUT /api/v1/gym/:id should reject update by non-owner role', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: member } = await createAuthenticatedMember({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Protected Gym', verified: 'APPROVED' });

    const request = await createRequest();
    const response = await request
      .put(`/api/v1/gym/${gym.id}`)
      .set('Authorization', createAuthHeaderForUser(member))
      .send({ name: 'Should Fail Update' });

    expect(response.status).toBe(403);
    expect(response.body.status).toBe('No Access');
    expect(response.body.errors.message).toBe('access denied');
  });

  test('DELETE /api/v1/gym/:id should delete gym owned by authenticated owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Delete Gym', verified: 'APPROVED' });

    const request = await createRequest();
    const response = await request
      .delete(`/api/v1/gym/${gym.id}`)
      .set('Authorization', createAuthHeaderForUser(owner));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toBe('succesfully delete gym');

    const deletedGym = await testPrisma.gym.findUnique({ where: { id: gym.id } });
    expect(deletedGym).toBeNull();
  });

  test('DELETE /api/v1/gym/:id should reject deleting gym owned by another owner', async () => {
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const { user: anotherOwner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Other Owner Gym', verified: 'APPROVED' });

    const request = await createRequest();
    const response = await request
      .delete(`/api/v1/gym/${gym.id}`)
      .set('Authorization', createAuthHeaderForUser(anotherOwner));

    expect(response.status).toBe(404);
    expect(response.body.status).toBe('Not Found');
    expect(response.body.errors.message).toBe('Gym not found');
  });

  test('GET /api/v1/gym/verified-gym/:id should show pending gym detail for admin', async () => {
    const { user: admin } = await createAuthenticatedAdmin({ password: 'Password123!' });
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Pending Review Gym', verified: 'PENDING' });

    const request = await createRequest();
    const response = await request
      .get(`/api/v1/gym/verified-gym/${gym.id}`)
      .set('Authorization', createAuthHeaderForUser(admin));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data.id).toBe(gym.id);
    expect(response.body.data.verified).toBe('PENDING');
  });

  test('POST /api/v1/gym/verified-gym/:id/verify should approve pending gym for admin', async () => {
    const { user: admin } = await createAuthenticatedAdmin({ password: 'Password123!' });
    const { user: owner } = await createAuthenticatedOwner({ password: 'Password123!' });
    const gym = await createGym(owner.id, { name: 'Verifiable Gym', verified: 'PENDING' });

    const request = await createRequest();
    const response = await request
      .post(`/api/v1/gym/verified-gym/${gym.id}/verify`)
      .set('Authorization', createAuthHeaderForUser(admin))
      .send({ status: 'APPROVED' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.data).toBe('Successfully verified gym');

    const updatedGym = await testPrisma.gym.findUnique({ where: { id: gym.id } });
    expect(updatedGym.verified).toBe('APPROVED');
  });
});
