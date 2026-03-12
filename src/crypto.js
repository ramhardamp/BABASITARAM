// vault-crypto.js — AES-GCM 256-bit encryption using Web Crypto API
// Used by both popup and background

const VaultCrypto = (() => {
  const ENC = new TextEncoder();
  const DEC = new TextDecoder();

  async function deriveKey(masterPassword, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      ENC.encode(masterPassword),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 600000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encrypt(plaintext, masterPassword) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await deriveKey(masterPassword, salt);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      ENC.encode(plaintext)
    );
    const packed = new Uint8Array(16 + 12 + ciphertext.byteLength);
    packed.set(salt, 0);
    packed.set(iv, 16);
    packed.set(new Uint8Array(ciphertext), 28);
    let _bin = '';
    for (let _i = 0; _i < packed.length; _i += 8192) {
      _bin += String.fromCharCode.apply(null, packed.subarray(_i, _i + 8192));
    }
    return btoa(_bin);
  }

  async function decrypt(b64, masterPassword) {
    const packed     = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const salt       = packed.slice(0, 16);
    const iv         = packed.slice(16, 28);
    const ciphertext = packed.slice(28);
    const key        = await deriveKey(masterPassword, salt);
    const plainBuf   = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    return DEC.decode(plainBuf);
  }

  // FIX #7: Pehle extra wasteful deriveKey (600K iterations) thi — REMOVED.
  // encrypt() khud salt+iv banata hai. Vault creation ~800ms faster.
  async function hashMaster(masterPassword) {
    return encrypt('__VAULT_CANARY__', masterPassword);
  }

  async function verifyMaster(storedHash, masterPassword) {
    try {
      const result = await decrypt(storedHash, masterPassword);
      return result === '__VAULT_CANARY__';
    } catch {
      return false;
    }
  }

  return { encrypt, decrypt, hashMaster, verifyMaster };
})();
