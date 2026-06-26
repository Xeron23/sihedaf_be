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
  createAuthenticatedOwner,
  createAuthHeaderForUser
} from '../helpers/auth-test-helper.js';
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

describe('Gym create HTTP integration', () => {
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

  test('POST /api/v1/gym should create gym and upload image to MinIO', async () => {
    const { user: owner } = await createAuthenticatedOwner({
      username: 'gym_create_owner',
      email: 'gym_create_owner@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .post('/api/v1/gym')
      .set('Authorization', createAuthHeaderForUser(owner))
      .field('namaGym', 'Gym MinIO Test')
      .field('maxCapacity', '120')
      .field('address', 'Jl. Testing No. 123')
      .field('jamOperasional', '06:00-22:00')
      .field('lat', '-6.200000')
      .field('long', '106.816666')
      .field('facility', JSON.stringify(['Sauna', 'Locker']))
      .field('tag', 'premium-test')
      .field('description', 'Gym created from HTTP integration test')
      .attach('image', TEST_IMAGE_BUFFER, {
        filename: 'test-gym-image.png',
        contentType: 'image/png'
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('Created');
    expect(response.body.data.name).toBe('Gym MinIO Test');
    expect(response.body.data.ownerId).toBe(owner.id);

    const createdGym = await testPrisma.gym.findUnique({
      where: { id: response.body.data.id },
      include: { gymImage: true }
    });

    expect(createdGym).not.toBeNull();
    expect(createdGym.gymImage).toHaveLength(1);
    expect(createdGym.gymImage[0].url).toContain(process.env.IS3_BUCKET_NAME);
    expect(createdGym.gymImage[0].url).toContain(`${process.env.IS3_PREFIX}/image-profile/${owner.id}/${createdGym.id}`);

    const objectKey = extractObjectKeyFromUrl(createdGym.gymImage[0].url);
    expect(objectKey).toBeTruthy();

    const prefix = `${process.env.IS3_PREFIX}/image-profile/${owner.id}/${createdGym.id}/`;
    const listResult = await s3.send(new ListObjectsV2Command({
      Bucket: process.env.IS3_BUCKET_NAME,
      Prefix: prefix
    }));

    expect((listResult.Contents || []).length).toBe(1);
    expect(listResult.Contents[0].Key).toBe(objectKey);
    uploadedObjectKeys.push(objectKey);
  });

  test('POST /api/v1/gym should fail when image is missing', async () => {
    const { user: owner } = await createAuthenticatedOwner({
      username: 'gym_create_owner_no_image',
      email: 'gym_create_owner_no_image@example.com',
      password: 'Password123!'
    });

    const request = await createRequest();
    const response = await request
      .post('/api/v1/gym')
      .set('Authorization', createAuthHeaderForUser(owner))
      .field('namaGym', 'Gym Without Image')
      .field('maxCapacity', '100')
      .field('address', 'Jl. No Image No. 1')
      .field('jamOperasional', '06:00-22:00')
      .field('lat', '-6.210000')
      .field('long', '106.820000')
      .field('facility', JSON.stringify(['Locker']))
      .field('tag', 'basic-test')
      .field('description', 'Should fail because image is required');

    expect(response.status).toBe(500);
    expect(response.body.status).toBe('Internal Server Error');
    expect(response.body.errors.message).toBe('failed to upload image');

    const gyms = await testPrisma.gym.findMany({ where: { ownerId: owner.id } });
    expect(gyms).toHaveLength(0);
  });
});
