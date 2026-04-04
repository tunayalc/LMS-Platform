
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

interface StorageProvider {
    upload(file: Express.Multer.File, folder: string): Promise<string>;
    delete(key: string): Promise<void>;
    getUrl(key: string): Promise<string>;
}

class S3StorageProvider implements StorageProvider {
    private client: S3Client;
    private bucket: string;

    constructor() {
        this.client = new S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            endpoint: process.env.S3_ENDPOINT, // Optional for MinIO
            forcePathStyle: true, // Required for MinIO
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
            },
        });
        this.bucket = process.env.S3_BUCKET_NAME || 'lms-uploads';
    }

    async upload(file: Express.Multer.File, folder: string): Promise<string> {
        const key = `${folder}/${Date.now()}-${file.originalname}`;

        // For MinIO/S3 upload
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: fs.createReadStream(file.path), // Stream from temp multer path
            ContentType: file.mimetype,
        });

        await this.client.send(command);

        // Clean up temp file if needed (depends on multer config)
        // fs.unlinkSync(file.path); 

        return key;
    }

    async delete(key: string): Promise<void> {
        const command = new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        await this.client.send(command);
    }

    async getUrl(key: string): Promise<string> {
        // Generate Pre-signed URL for private buckets
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        return await getSignedUrl(this.client, command, { expiresIn: 3600 });
    }
}

class LocalStorageProvider implements StorageProvider {
    private uploadDir: string;
    private baseUrl: string;

    constructor() {
        this.uploadDir = path.join(process.cwd(), 'uploads');
        this.baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';

        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
    }

    async upload(file: Express.Multer.File, folder: string): Promise<string> {
        // Since Multer (DiskStorage) already saves it to disk, 
        // we might just need to move it or just return the path relative to uploads.
        // Assuming we want to organize it into folders:

        const targetDir = path.join(this.uploadDir, folder);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const filename = `${Date.now()}-${path.basename(file.originalname)}`;
        const targetPath = path.join(targetDir, filename);

        // If file.path exists (temp), move it. 
        // Note: Multer might act differently depending on config.
        if (file.path && fs.existsSync(file.path)) {
            fs.renameSync(file.path, targetPath);
        } else {
            // If buffer, write it
            if (file.buffer) {
                fs.writeFileSync(targetPath, file.buffer);
            }
        }

        return `${folder}/${filename}`;
    }

    async delete(key: string): Promise<void> {
        const filePath = path.join(this.uploadDir, key);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    async getUrl(key: string): Promise<string> {
        // Return public URL (requires static serve in express)
        return `${this.baseUrl}/uploads/${key}`;
    }
}

// Factory
const isS3Enabled = !!process.env.AWS_ACCESS_KEY_ID && !!process.env.S3_BUCKET_NAME;
export const storageService = isS3Enabled ? new S3StorageProvider() : new LocalStorageProvider();
