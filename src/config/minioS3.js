import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
    endpoint: process.env.IS3_END_POINT,
    region: process.env.IS3_REGION,
    forcePathStyle: true,
    credentials: {
        accessKeyId: process.env.IS3_ACCESS_KEY_ID,     
        secretAccessKey: process.env.IS3_SECRET_ACCESS_KEY_ID
    }
});

export {s3, PutObjectCommand};