import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// S3Client ora viene creato dinamicamente dentro uploadToS3

export const uploadToS3 = async (file, orderNumber, contractMonth, contractYear, customKey = null, bucketOverride = null) => {
  // DEBUG: stampa variabili ambiente e parametri
  console.log('[DEBUG][AWS] ACCESS_KEY:', process.env.AWS_ACCESS_KEY_ID);
  console.log('[DEBUG][AWS] ACCESS_KEY length:', process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID.length : 0);
  console.log('[DEBUG][AWS] ACCESS_KEY has spaces:', process.env.AWS_ACCESS_KEY_ID && /\s/.test(process.env.AWS_ACCESS_KEY_ID));
  console.log('[DEBUG][AWS] SECRET_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '***' : 'MANCANTE');
  console.log('[DEBUG][AWS] SECRET_KEY length:', process.env.AWS_SECRET_ACCESS_KEY ? process.env.AWS_SECRET_ACCESS_KEY.length : 0);
  console.log('[DEBUG][AWS] SECRET_KEY has spaces:', process.env.AWS_SECRET_ACCESS_KEY && /\s/.test(process.env.AWS_SECRET_ACCESS_KEY));
  console.log('[DEBUG][AWS] REGION:', process.env.AWS_REGION);
  console.log('[DEBUG][AWS] REGION length:', process.env.AWS_REGION ? process.env.AWS_REGION.length : 0);
  console.log('[DEBUG][AWS] REGION has spaces:', process.env.AWS_REGION && /\s/.test(process.env.AWS_REGION));
  console.log('[DEBUG][AWS] BUCKET:', process.env.S3_BUCKET_NAME);
  console.log('[DEBUG][AWS] BUCKET length:', process.env.S3_BUCKET_NAME ? process.env.S3_BUCKET_NAME.length : 0);
  console.log('[DEBUG][AWS] BUCKET has spaces:', process.env.S3_BUCKET_NAME && /\s/.test(process.env.S3_BUCKET_NAME));
  console.log('[DEBUG][S3] orderNumber:', orderNumber, 'contractMonth:', contractMonth, 'contractYear:', contractYear);
  console.log('[DEBUG][S3] file.originalname:', file.originalname, 'file.mimetype:', file.mimetype, 'file.size:', file.size);

  try {
    // Inizializza S3Client DINAMICAMENTE con le variabili d'ambiente correnti
    const s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    let key;
    if (customKey) {
      key = customKey;
    } else {
      const fileExtension = file.originalname.split('.').pop();
      key = `contratti/${contractYear}/${contractMonth.padStart(2, '0')}/${orderNumber}/${uuidv4()}.${fileExtension}`;
    }
    const bucket = bucketOverride || process.env.S3_BUCKET_NAME;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });
    console.log('[DEBUG][S3] PutObjectCommand params:', {
      Bucket: bucket,
      Key: key,
      ContentType: file.mimetype,
      BodyLength: file.buffer ? file.buffer.length : 0
    });

    await s3Client.send(command);
    
    return {
      originalName: file.originalname,
      key,
      url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
    };
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw new Error('Failed to upload file to S3');
  }
};

// Funzione di test upload su entrambi i bucket
export const testS3UploadBothBuckets = async () => {
  const dummyBuffer = Buffer.from('test-cascade-upload', 'utf-8');
  const dummyFile = {
    originalname: 'test-cascade.txt',
    mimetype: 'text/plain',
    size: dummyBuffer.length,
    buffer: dummyBuffer
  };
  // Test upload su bucket di default (.env)
  try {
    const resDefault = await uploadToS3(dummyFile, 'TEST', '07', '2025');
    console.log('[TEST][S3][DEFAULT BUCKET]', resDefault);
  } catch (err) {
    console.error('[TEST][S3][DEFAULT BUCKET][ERROR]', err);
  }
  // Test upload su attivazionistation
  try {
    const resAtt = await uploadToS3(dummyFile, 'TEST', '07', '2025', null, 'attivazionistation');
    console.log('[TEST][S3][ATTIVAZIONISTATION]', resAtt);
  } catch (err) {
    console.error('[TEST][S3][ATTIVAZIONISTATION][ERROR]', err);
  }
};

export const generatePresignedUrl = async (key) => {
  console.log('[DEBUG][S3] Generating presigned URL for key:', key);
  
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  // USA GetObjectCommand per DOWNLOAD, non PutObjectCommand per upload
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
  });

  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  console.log('[DEBUG][S3] Generated signed URL:', signedUrl);
  return signedUrl;
};

// Lista oggetti in una cartella/prefix specifico
export const listS3Folder = async ({ bucket, prefix, maxKeys = 1000, continuationToken = undefined }) => {
  const region = process.env.AWS_REGION || 'eu-west-1';
  const s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const all = [];
  let token = continuationToken || undefined;
  do {
    const cmd = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: Math.min(1000, maxKeys),
      ContinuationToken: token,
    });
    const res = await s3Client.send(cmd);
    (res.Contents || []).forEach((obj) => {
      if (!obj.Key || obj.Key.endsWith('/')) return; // ignore folders
      all.push({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        url: `https://${bucket}.s3.${region}.amazonaws.com/${obj.Key}`,
      });
    });
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token && all.length < maxKeys);

  return all;
};
