import { s3,  PutObjectCommand} from "../config/minioS3.js";

async function uploadImageUpload(req, res, next) {
    
    if (!req.files || !req.files.image || req.files.image.length === 0) {
        return res.status(400).json({ message: "Foto wajib diupload" });
    }

    const file = req.files.image[0];
    try {
        const userId = req.user?.id || "guest";
        const date = new Date().getTime();

        const command = new PutObjectCommand({
            Bucket: process.env.IS3_BUCKET_NAME,
            Key: `${userId}/${date}-${file.originalname}`,
            Body: file.buffer,
            ContentType: file.mimetype || "application/octet-stream",
        });

        await s3.send(command);

        req.fileUrl = `${process.env.IS3_END_POINT}/${process.env.IS3_BUCKET_NAME}/${userId}/${date}-${file.originalname}`;

        next();
    } catch (error) {
        console.error("Upload error:", error.message);
        return res.status(500).json({ message: "Gagal upload file" });
    }
}

export default uploadImageUpload;
