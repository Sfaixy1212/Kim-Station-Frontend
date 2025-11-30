// Script standalone per test upload su S3 con AWS SDK v3
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const bucket = process.env.S3_BUCKET_NAME || 'contrattistation';
const key = 'test-cascade-upload/' + Date.now() + '.txt';
const body = Buffer.from('Test upload S3 standalone via script ' + new Date().toISOString());

async function main() {
  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'text/plain',
    });
    const result = await s3.send(command);
    console.log('[OK] Upload riuscito!', { bucket, key, result });
    console.log('File URL:', `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`);
  } catch (err) {
    console.error('[ERRORE] Upload fallito:', err);
    process.exit(1);
  }
}

main();
