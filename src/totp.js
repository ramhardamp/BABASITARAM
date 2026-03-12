// totp.js — TOTP (Time-based OTP) Engine v1.0
// RFC 6238 compliant — HMAC-SHA1, Web Crypto API — no external dependencies

const VaultTOTP = (() => {

  function base32Decode(encoded) {
    const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    encoded = encoded.replace(/[\s\-]/g, '').toUpperCase().replace(/=+$/, '');
    let bits = 0, value = 0;
    const output = [];
    for (const char of encoded) {
      const idx = alpha.indexOf(char);
      if (idx < 0) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return new Uint8Array(output);
  }

  async function hotp(secretBytes, counter, digits = 6) {
    const cb = new Uint8Array(8);
    const dv = new DataView(cb.buffer);
    dv.setUint32(0, Math.floor(counter / 0x100000000), false);
    dv.setUint32(4, counter >>> 0, false);
    const key = await crypto.subtle.importKey(
      'raw', secretBytes,
      { name: 'HMAC', hash: { name: 'SHA-1' } },
      false, ['sign']
    );
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, cb));
    const offset = sig[19] & 0xf;
    const code = (
      ((sig[offset]     & 0x7f) << 24) |
      ((sig[offset + 1] & 0xff) << 16) |
      ((sig[offset + 2] & 0xff) << 8)  |
       (sig[offset + 3] & 0xff)
    );
    return String(code % Math.pow(10, digits)).padStart(digits, '0');
  }

  async function generate(secret, digits = 6, period = 30) {
    if (!secret || secret.length < 8) throw new Error('TOTP secret too short');
    const secretBytes = base32Decode(secret);
    if (!secretBytes.length) throw new Error('Invalid base32 secret');
    const counter   = Math.floor(Date.now() / 1000 / period);
    const code      = await hotp(secretBytes, counter, digits);
    const remaining = period - (Math.floor(Date.now() / 1000) % period);
    return { code, remaining, period };
  }

  function isValidSecret(secret) {
    if (!secret || typeof secret !== 'string') return false;
    const cleaned = secret.replace(/[\s\-]/g, '').toUpperCase().replace(/=+$/, '');
    return /^[A-Z2-7]{8,}$/.test(cleaned);
  }

  function formatSecret(secret) {
    const cleaned = secret.replace(/[\s\-]/g, '').toUpperCase();
    return cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;
  }

  return { generate, isValidSecret, formatSecret, base32Decode };
})();
