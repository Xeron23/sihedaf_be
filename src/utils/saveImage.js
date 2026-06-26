import {s3, PutObjectCommand } from '../config/minioS3.js';

export const uploadFile = async (folder, img = []) => {
    
    if (!Array.isArray(img)) {
        img = [img];
    }

    let results = [];

    for (const image of img) { 
        const fileBuffer = image.buffer;
        const contentType = image.mimetype;
        const key = `${folder}/${new Date().getTime()}-${image.originalname}`;

        try {
            const command = new PutObjectCommand({
                Bucket: process.env.IS3_BUCKET_NAME,
                Key: `${process.env.IS3_PREFIX}/${key}`,
                Body: fileBuffer,
                ContentType: contentType || "application/octet-stream",
                ACL: "public-read",
            });

            await s3.send(command);

            // URL publik (sesuai setup kamu)
            const url = `${process.env.IS3_END_POINT}/${process.env.IS3_BUCKET_NAME}/${process.env.IS3_PREFIX}/${key}`;
            results.push(url);
        } catch (error) {
            console.log("error", error.message);
            throw new Error(error.message);
        }
    }

    return results;
};