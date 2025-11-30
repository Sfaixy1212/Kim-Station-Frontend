import crypto from 'crypto';

// AES-256-GCM helper using a 32-byte key provided in base64 via TOTP_ENC_KEY
// - encryptGCM(plaintext: Buffer|string) -> { ciphertext, iv, authTag }
// - decryptGCM(ciphertext: Buffer, iv: Buffer, authTag: Buffer) -> Buffer

function getKey() {
  const b64 = process.env.TOTP_ENC_KEY;
  if (!b64) {
    throw new Error('TOTP_ENC_KEY not set');
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error('TOTP_ENC_KEY must be 32 bytes base64 (256-bit)');
  }
  return key;
}

export function encryptGCM(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(String(plaintext), 'utf8')), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: enc, iv, authTag };
}

export function decryptGCM(ciphertext, iv, authTag) {
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec;
}

export default { encryptGCM, decryptGCM };
