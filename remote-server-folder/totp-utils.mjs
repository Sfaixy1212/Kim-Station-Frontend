import crypto from 'crypto';

// Simple Base32 decoder (RFC 4648, no padding required)
function base32ToBuffer(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(base32 || '')
    .toUpperCase()
    .replace(/=+$/g, '')
    .replace(/\s+/g, '');
  let bits = '';
  for (const c of clean) {
    const val = alphabet.indexOf(c);
    if (val === -1) continue; // skip invalid chars
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function verifyTOTP(code, secret, {
  step = 30,
  digits = 6,
  window = 1, // allow +/- 1 time step
  algorithm = 'sha1'
} = {}) {
  if (!code || !secret) return false;
  const token = String(code).trim();
  if (!/^\d{6}$/.test(token)) return false;

  const key = base32ToBuffer(secret);
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / step);

  const matchAt = (ctr) => {
    const buf = Buffer.alloc(8);
    // write big-endian counter
    for (let i = 7; i >= 0; i--) {
      buf[i] = ctr & 0xff;
      ctr = ctr >> 8;
    }
    const hmac = crypto.createHmac(algorithm, key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binCode = ((hmac[offset] & 0x7f) << 24) |
                    ((hmac[offset + 1] & 0xff) << 16) |
                    ((hmac[offset + 2] & 0xff) << 8) |
                    (hmac[offset + 3] & 0xff);
    const otp = (binCode % (10 ** digits)).toString().padStart(digits, '0');
    return otp === token;
  };

  if (matchAt(counter)) return true;
  for (let w = 1; w <= window; w++) {
    if (matchAt(counter + w)) return true;
    if (matchAt(counter - w)) return true;
  }
  return false;
}
