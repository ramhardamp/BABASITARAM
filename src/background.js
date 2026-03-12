// background.js — Service Worker v5.3 FINAL
// KEY FIXES:
// 1. GET_ENTRIES_FOR_URL mein inline session restore → Chrome start pe 0 extra clicks
// 2. _restoreSessionIfNeeded() → onStartup + onAlarm + every message
// 3. chrome.alarms keepalive → SW kabhi 30s timeout nahi hogi
// 4. _rebuildIndex har jagah consistent
// 5. UPDATE_ENTRY_PASS + reloadMemVault dono index rebuild karte hain
// 6. AUTO_BACKUP direct function (self-message nahi)
// 7. Badge ON/OFF (emoji unreliable tha)

'use strict';

let sessionKey      = null;
let autoLockTimeout = null;
let _memVault       = null;
let _memIndex       = new Map();
let _restoring      = false; // Lock: ek baar mein sirf ek restore

// ── Index rebuild helper ──────────────────────────────────────────────────────
function _rebuildIndex(vault) {
  const idx = new Map();
  (vault || []).forEach(e => {
    const dom = (e.url || '').toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (dom) {
      if (!idx.has(dom)) idx.set(dom, []);
      idx.get(dom).push({ id: e.id, title: e.title, username: e.username, url: e.url });
    }
  });
  return idx;
}

// ── Vault loader ─────────────────────────────────────────────────────────────
async function reloadMemVault(key) {
  const data = await chrome.storage.local.get(['vault_encrypted_blob']);
  if (data.vault_encrypted_blob) {
    const { VaultCrypto } = await importCrypto();
    const json = await VaultCrypto.decrypt(data.vault_encrypted_blob, key);
    _memVault = JSON.parse(json);
  } else {
    _memVault = [];
  }
  _memIndex = _rebuildIndex(_memVault);
}

// ── Badge helper ──────────────────────────────────────────────────────────────
function _setBadge(state) {
  // state: true=locked, false=unlocked, 'wait'=restoring
  try {
    if (state === 'wait') {
      chrome.action.setBadgeText({ text: '...' });
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    } else if (state === false) {
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#22d3a5' });
    } else {
      chrome.action.setBadgeText({ text: 'OFF' });
      chrome.action.setBadgeBackgroundColor({ color: '#f87171' });
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// KEEPALIVE ALARM — SW ko 25s mein ping karo (MV3 30s kill se bachao)
// ═══════════════════════════════════════════════════════════════════════════════
function _setupKeepalive() {
  chrome.alarms.get('vault_keepalive', (alarm) => {
    if (!alarm) {
      chrome.alarms.create('vault_keepalive', { periodInMinutes: 0.4 }); // ~24s
    }
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'vault_keepalive') return;
  // SW zinda hai — session bhi restore karo agar gaya ho
  if (!sessionKey) _restoreSessionIfNeeded();
});

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION RESTORE — Chrome restart + SW sleep recovery
// Priority: storage.session → remember-me (local storage)
// ═══════════════════════════════════════════════════════════════════════════════
async function _restoreSessionIfNeeded() {
  if (sessionKey) return true;  // Already unlocked
  if (_restoring) {
    // Wait for ongoing restore
    let waited = 0;
    while (_restoring && waited < 3000) {
      await new Promise(r => setTimeout(r, 50));
      waited += 50;
    }
    return !!sessionKey;
  }

  _restoring = true;
  _setBadge('wait'); // Show orange '...' while restoring
  try {
    // Step 1: chrome.storage.session (SW sleep recovery — same Chrome session)
    try {
      const s = await chrome.storage.session.get(['vault_session_key']);
      if (s.vault_session_key) {
        sessionKey = s.vault_session_key;
        _setBadge(false);
        startAutoLockTimer();
        _restoring = false;
        return true;
      }
    } catch {}

    // Step 2: remember-me in chrome.storage.local (Chrome restart recovery)
    const data = await chrome.storage.local.get([
      'vault_remember_until',
      'vault_remembered_mp',
      'vault_hash'
    ]);

    console.log('[Vault] Remember-me check:',
      'until=', data.vault_remember_until ? new Date(data.vault_remember_until).toLocaleDateString() : 'none',
      'hasMP=', !!data.vault_remembered_mp,
      'hasHash=', !!data.vault_hash,
      'expired=', data.vault_remember_until ? Date.now() > data.vault_remember_until : 'n/a'
    );

    if (
      data.vault_remember_until &&
      Date.now() < data.vault_remember_until &&
      data.vault_remembered_mp &&
      data.vault_hash
    ) {
      try {
        const { VaultCrypto } = await importCrypto();
        const mp    = await VaultCrypto.decrypt(data.vault_remembered_mp, chrome.runtime.id);
        const valid = await VaultCrypto.verifyMaster(data.vault_hash, mp);

        if (valid) {
          sessionKey = mp;
          try { await chrome.storage.session.set({ vault_session_key: mp }); } catch {}
          await reloadMemVault(mp);
          _setBadge(false);
          startAutoLockTimer();
          console.log('[Vault] ✅ Auto-start: vault unlocked from remember-me!');
          _restoring = false;
          return true;
        } else {
          console.warn('[Vault] Remember-me: password verify failed — clearing stale data');
          await chrome.storage.local.remove(['vault_remembered_mp', 'vault_remember_until']);
        }
      } catch(decErr) {
        console.warn('[Vault] Remember-me decrypt error:', decErr.message);
        // Don't clear — might be temp error, try again next startup
      }
    } else if (data.vault_remember_until && Date.now() >= data.vault_remember_until) {
      // Expired — clean up
      await chrome.storage.local.remove(['vault_remembered_mp', 'vault_remember_until']);
      console.log('[Vault] Remember-me expired — cleared');
    }

    _setBadge(true);
    _restoring = false;
    return false;
  } catch (e) {
    console.log('[Vault] Auto-restore error:', e.message);
    _setBadge(true);
    _restoring = false;
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHROME STARTUP — pehli baar Chrome khulne par auto-restore
// ═══════════════════════════════════════════════════════════════════════════════
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Vault] Chrome started — auto-restore begin...');
  _setupKeepalive();
  _setBadge('wait');

  // Restore last backup time (SW restart pe _lastAutoBackupTime = 0 ho jaata)
  try {
    const d = await chrome.storage.local.get(['vault_last_backup_time']);
    if (d.vault_last_backup_time) _lastAutoBackupTime = d.vault_last_backup_time;
  } catch {}

  // First attempt
  let restored = await _restoreSessionIfNeeded();

  // Agar pehli baar fail — 800ms baad retry (storage read race condition)
  if (!restored) {
    await new Promise(r => setTimeout(r, 800));
    restored = await _restoreSessionIfNeeded();
  }

  // Second retry at 2s (slow PC / HDD pe storage late load hoti hai)
  if (!restored) {
    await new Promise(r => setTimeout(r, 1200));
    restored = await _restoreSessionIfNeeded();
  }

  if (restored && sessionKey) {
    console.log('[Vault] ✅ Auto-start success — vault unlocked');
    // Vault preload: pehla autofill request instant hoga
    reloadMemVault(sessionKey).catch(() => {});
    _setBadge(false);
  } else {
    console.log('[Vault] Browser start — no remember-me, showing lock screen');
    _setBadge(true);
  }
});

// Auto-lock timer
async function startAutoLockTimer() {
  clearTimeout(autoLockTimeout);
  const data         = await chrome.storage.local.get(['vault_settings']);
  const settings     = data.vault_settings || {};
  const autoLockTime = settings.autoLockTime !== undefined ? Number(settings.autoLockTime) : 10;

  if (autoLockTime > 0) {
    autoLockTimeout = setTimeout(async () => {
      sessionKey = null;
      _memVault  = null;
      _memIndex  = new Map();
      try { await chrome.storage.session.remove(['vault_session_key']); } catch {}
      _setBadge(true);
      chrome.runtime.sendMessage({ type: 'AUTO_LOCKED' }).catch(() => {});
    }, autoLockTime * 60 * 1000);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // ══════════════════════════════════════════════════════════════════════
    // CRITICAL FIX: Har message se pehle session restore karo
    // Chrome start pe SW naya hota hai — sessionKey null hoti hai
    // GET_ENTRIES_FOR_URL inline restore karta hai → 0 extra clicks chahiye
    // ══════════════════════════════════════════════════════════════════════
    if (!sessionKey && msg.type !== 'SET_SESSION' && msg.type !== 'CLEAR_SESSION') {
      await _restoreSessionIfNeeded();
    }

    switch (msg.type) {

      case 'SET_SESSION': {
        sessionKey  = msg.masterPassword;
        _memVault   = null;
        _memIndex   = new Map();
        _setupKeepalive();
        startAutoLockTimer();
        try { await chrome.storage.session.set({ vault_session_key: msg.masterPassword }); } catch {}
        _setBadge(false);
        reloadMemVault(msg.masterPassword).catch(() => {});

        // AUTO-START: Agar rememberMe setting ON hai toh background.js bhi persist kare
        try {
          const sv = await chrome.storage.local.get(['vault_settings', 'vault_hash']);
          if (sv.vault_settings?.rememberMe && sv.vault_hash) {
            const days = sv.vault_settings.rememberDuration ?? 7;
            const until = days === 0
              ? Date.now() + 36500 * 86400000
              : Date.now() + days * 86400000;
            const { VaultCrypto } = await importCrypto();
            const encMp = await VaultCrypto.encrypt(msg.masterPassword, chrome.runtime.id);
            await chrome.storage.local.set({ vault_remember_until: until, vault_remembered_mp: encMp });
            console.log('[Vault] Auto-start persisted on unlock, days:', days === 0 ? 'forever' : days);
          }
        } catch(e) { console.warn('[Vault] Auto-persist warn:', e.message); }
        sendResponse({ ok: true });
        break;
      }

      case 'GET_SESSION': {
        sendResponse({ ok: !!sessionKey, masterPassword: sessionKey });
        break;
      }

      case 'CLEAR_SESSION': {
        sessionKey = null;
        clearTimeout(autoLockTimeout);
        _memVault  = null;
        _memIndex  = new Map();
        try { await chrome.storage.session.remove(['vault_session_key']); } catch {}
        _setBadge(true);
        sendResponse({ ok: true });
        break;
      }

      case 'GET_ENTRIES_FOR_URL': {
        try {
          // Session nahi hai aur restore bhi fail → locked
          if (!sessionKey) {
            sendResponse({ ok: false, locked: true, entries: [] });
            break;
          }

          if (!_memVault) {
            const data = await chrome.storage.local.get(['vault_encrypted_blob']);
            if (data.vault_encrypted_blob) {
              const { VaultCrypto } = await importCrypto();
              const json = await VaultCrypto.decrypt(data.vault_encrypted_blob, sessionKey);
              _memVault = JSON.parse(json);
              _memIndex = _rebuildIndex(_memVault);
            } else {
              _memVault = [];
              _memIndex = new Map();
            }
          }

          const raw    = (msg.url || '').toLowerCase();
          const domain = raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
          const matches = _memIndex.get(domain) || [];
          sendResponse({ ok: true, locked: false, entries: matches });
        } catch (e) {
          sendResponse({ ok: false, locked: false, entries: [] });
        }
        break;
      }

      case 'GET_PASSWORD_FOR_ID': {
        if (!sessionKey) { sendResponse({ ok: false }); break; }
        try {
          if (!_memVault) await reloadMemVault(sessionKey);
          const found = _memVault.find(e => e.id === msg.id);
          if (!found) { sendResponse({ ok: false }); break; }
          sendResponse({ ok: true, password: found.password, username: found.username });
        } catch { sendResponse({ ok: false }); }
        break;
      }

      case 'OPEN_EDIT': {
        await chrome.storage.local.set({ vault_pending_edit: msg.entryId });
        try { chrome.action.openPopup(); } catch (e) {
          console.warn('[Vault] openPopup() not supported:', e.message);
        }
        sendResponse({ ok: true });
        break;
      }

      case 'GET_ALL_ENTRIES': {
        if (!sessionKey) { sendResponse({ ok: false, entries: [] }); break; }
        try {
          if (!_memVault) await reloadMemVault(sessionKey);
          sendResponse({ ok: true, entries: _memVault });
        } catch { sendResponse({ ok: false, entries: [] }); }
        break;
      }

      case 'VERIFY_SAVE_STATUS': {
        if (!sessionKey) { sendResponse({ action: 'NONE' }); break; }
        try {
          if (!_memVault) await reloadMemVault(sessionKey);
          const domain = (msg.url || '').toLowerCase().replace(/^www\./, '').split('/')[0];
          const found  = _memVault.find(e => {
            const eDom = (e.url || '').toLowerCase()
              .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
            return (eDom === domain) && (e.username === msg.username);
          });
          if (!found)                           sendResponse({ action: 'SAVE' });
          else if (found.password === msg.password) sendResponse({ action: 'NONE' });
          else                                  sendResponse({ action: 'UPDATE', entryId: found.id });
        } catch { sendResponse({ action: 'NONE' }); }
        break;
      }

      // VERIFY_AND_SILENT_SAVE: beforeunload path — verify + save in one message
      case 'VERIFY_AND_SILENT_SAVE': {
        if (!sessionKey) { sendResponse({ ok: false, reason: 'locked' }); break; }
        try {
          if (!_memVault) await reloadMemVault(sessionKey);
          const domain = (msg.url || '').toLowerCase().replace(/^www\./, '').split('/')[0];
          const found  = _memVault.find(e => {
            const eDom = (e.url || '').toLowerCase()
              .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
            return (eDom === domain) && (e.username === msg.username);
          });

          // Same password already saved — skip
          if (found && found.password === msg.password) {
            sendResponse({ ok: true, action: 'NONE' }); break;
          }

          if (found) {
            // Update existing
            found.password  = msg.password;
            found.updatedAt = Date.now();
          } else {
            // Save new
            _memVault.push({
              id:        Date.now().toString(36) + Math.random().toString(36).slice(2),
              title:     msg.title || domain,
              url:       msg.fullUrl || 'https://' + domain,
              username:  msg.username || '',
              password:  msg.password,
              mobile:    '',
              notes:     '',
              strength:  'medium',
              starred:   false,
              createdAt: Date.now(),
              updatedAt: Date.now()
            });
          }

          const { VaultCrypto } = await importCrypto();
          const blob = await VaultCrypto.encrypt(JSON.stringify(_memVault), sessionKey);
          await chrome.storage.local.set({ vault_encrypted_blob: blob, vault_entries: null });
          _memIndex = _rebuildIndex(_memVault);
          sendResponse({ ok: true, action: found ? 'UPDATE' : 'SAVE' });
        } catch(e) { sendResponse({ ok: false, error: e.message }); }
        break;
      }

      case 'UPDATE_ENTRY_PASS': {
        if (!sessionKey || !msg.id) { sendResponse({ ok: false }); break; }
        try {
          if (!_memVault) await reloadMemVault(sessionKey);
          const idx = _memVault.findIndex(e => e.id === msg.id);
          if (idx >= 0) {
            _memVault[idx].password  = msg.entry.password;
            _memVault[idx].updatedAt = Date.now();
            const { VaultCrypto } = await importCrypto();
            const blob = await VaultCrypto.encrypt(JSON.stringify(_memVault), sessionKey);
            await chrome.storage.local.set({ vault_encrypted_blob: blob });
            _memIndex = _rebuildIndex(_memVault); // Always rebuild
            sendResponse({ ok: true });
          } else { sendResponse({ ok: false }); }
        } catch { sendResponse({ ok: false }); }
        break;
      }

      case 'SAVE_NEW_ENTRY': {
        if (!sessionKey || !msg.entry) { sendResponse({ ok: false }); break; }
        try {
          if (!_memVault) await reloadMemVault(sessionKey);
          const domain      = (msg.entry.url || '').toLowerCase()
            .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
          const existingIdx = _memVault.findIndex(e => {
            const eDom = (e.url || '').toLowerCase()
              .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
            return eDom === domain && e.username === msg.entry.username;
          });

          if (existingIdx >= 0) {
            _memVault[existingIdx].password  = msg.entry.password;
            _memVault[existingIdx].updatedAt = Date.now();
          } else {
            msg.entry.id        = Date.now().toString() + Math.random().toString(36).substring(2);
            msg.entry.createdAt = Date.now();
            msg.entry.updatedAt = Date.now();
            _memVault.push(msg.entry);
          }

          const { VaultCrypto } = await importCrypto();
          const blob = await VaultCrypto.encrypt(JSON.stringify(_memVault), sessionKey);
          await chrome.storage.local.set({ vault_encrypted_blob: blob, vault_entries: null });
          _memIndex = _rebuildIndex(_memVault);
          sendResponse({ ok: true });
        } catch { sendResponse({ ok: false }); }
        break;
      }

      case 'SAVE_ALL_ENTRIES': {
        if (!sessionKey) { sendResponse({ ok: false }); break; }
        try {
          _memVault = msg.entries;
          _memIndex = _rebuildIndex(_memVault);
          const { VaultCrypto } = await importCrypto();
          const blob = await VaultCrypto.encrypt(JSON.stringify(msg.entries), sessionKey);
          await chrome.storage.local.set({ vault_encrypted_blob: blob, vault_entries: null });

          // Auto-backup — direct function call (not sendMessage to self)
          const settingsData = await chrome.storage.local.get(['vault_settings']);
          if (settingsData.vault_settings?.autoBackup) {
            setTimeout(() => _doAutoBackup(false), 2000); // false = throttled
          }
          sendResponse({ ok: true });
        } catch { sendResponse({ ok: false }); }
        break;
      }

      case 'OPEN_SETTINGS': {
        chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
        sendResponse({ ok: true });
        break;
      }

      case 'OPEN_PASSWORDS': {
        chrome.tabs.create({ url: chrome.runtime.getURL('passwords.html') });
        sendResponse({ ok: true });
        break;
      }

      case 'AUTO_BACKUP': {
        // Manual backup = force=true (no throttle, always runs)
        sendResponse(await _doAutoBackup(true));
        break;
      }

      case 'OPTIMIZE_INDEX': {
        if (_memVault?.length) _memIndex = _rebuildIndex(_memVault);
        sendResponse({ ok: true });
        break;
      }

      case 'INVALIDATE_CACHE': {
        _memVault = null;
        _memIndex = new Map();
        sendResponse({ ok: true });
        break;
      }


      case 'GET_TOTP_CODE': {
        if (!sessionKey) { sendResponse({ ok: false, reason: 'locked' }); break; }
        try {
          if (!_memVault) await reloadMemVault(sessionKey);
          const found = _memVault.find(e => e.id === msg.id);
          if (!found || !found.totp) { sendResponse({ ok: false, reason: 'no_totp' }); break; }
          const secret = found.totp.replace(/[\s\-]/g,'').toUpperCase();
          const secretBytes = _b32Decode(secret);
          const period  = 30;
          const counter = Math.floor(Date.now()/1000/period);
          const code    = await _totpCode(secretBytes, counter, 6);
          const remaining = period-(Math.floor(Date.now()/1000)%period);
          sendResponse({ ok:true, code, remaining, title: found.title });
        } catch(e){ sendResponse({ ok:false, reason:e.message }); }
        break;
      }

      default:
        sendResponse({ ok: false, error: 'Unknown message type' });
    }
  })();
  return true;
});

// ── Auto-backup ───────────────────────────────────────────────────────────────
// FIXED: Ek hi file — vault-backup-latest.vaultbak (overwrite, naya file nahi)
// Throttle: minimum 30 min between auto-backups (manual backup pe throttle nahi)
// Folder: BABASITARAM_Backups/ (Downloads ke andar)

let _lastAutoBackupTime = 0;
const AUTO_BACKUP_THROTTLE_MS = 30 * 60 * 1000; // 30 minutes

async function _doAutoBackup(force = false) {
  try {
    if (!sessionKey) return { ok: false, error: 'Vault locked hai — pehle unlock karo' };

    // Throttle: auto-backup baar-baar nahi (manual = force=true, no throttle)
    if (!force) {
      const now = Date.now();
      if (now - _lastAutoBackupTime < AUTO_BACKUP_THROTTLE_MS) {
        const minLeft = Math.ceil((AUTO_BACKUP_THROTTLE_MS - (now - _lastAutoBackupTime)) / 60000);
        console.log(`[Vault] Auto-backup skipped — next in ${minLeft} min`);
        return { ok: true, skipped: true };
      }
    }

    // Entries fetch + decrypt
    const data = await chrome.storage.local.get(['vault_encrypted_blob']);
    if (!data.vault_encrypted_blob) return { ok: false, error: 'No vault data' };

    const { VaultCrypto } = await importCrypto();
    const entries = JSON.parse(await VaultCrypto.decrypt(data.vault_encrypted_blob, sessionKey));
    if (!entries || !entries.length) return { ok: false, error: 'Vault empty hai' };

    // Build .vaultbak content (same format as Chrome extension export)
    const now = new Date();
    const backupInner = JSON.stringify({
      version: '2.0',
      app: 'Vault',
      exportDate: now.toISOString(),
      count: entries.length,
      entries
    });

    const enc      = await VaultCrypto.encrypt(backupInner, sessionKey);
    const wrapData = JSON.stringify({ vault_backup: true, v: 2, data: enc });

    // Base64 encode for data URL
    const bytes = new TextEncoder().encode(wrapData);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192)
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    const b64 = btoa(bin);

    // FIXED FILENAME — always overwrite same file, never create new ones
    await chrome.downloads.download({
      url:            'data:application/octet-stream;base64,' + b64,
      filename:       'BABASITARAM_Backups/vault-backup-latest.vaultbak',
      saveAs:         false,
      conflictAction: 'overwrite'   // Overwrite same file — no duplicates
    });

    _lastAutoBackupTime = Date.now();

    // Save last backup time to storage (survives SW restart)
    await chrome.storage.local.set({ vault_last_backup_time: _lastAutoBackupTime });

    console.log(`[Vault] ✅ Auto-backup done — ${entries.length} entries → vault-backup-latest.vaultbak`);
    return { ok: true, count: entries.length, time: now.toISOString() };

  } catch (err) {
    console.error('[Vault] Auto-backup error:', err);
    return { ok: false, error: err.message };
  }
}

// ── On install ────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  _setBadge(true);
  _setupKeepalive(); // Alarm install par bhi setup karo
  if (details.reason === 'install') {
    const data = await chrome.storage.local.get(['vault_setup_complete', 'vault_hash']);
    if (!data.vault_setup_complete && !data.vault_hash) {
      chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });
    }
  }
  // Update par bhi session restore try karo
  if (details.reason === 'update') {
    await _restoreSessionIfNeeded();
  }
});

// ── Crypto (inline for service worker) ───────────────────────────────────────
async function importCrypto() {
  const ENC = new TextEncoder();
  const DEC = new TextDecoder();

  async function deriveKey(masterPassword, salt) {
    const km = await crypto.subtle.importKey('raw', ENC.encode(masterPassword),
      { name: 'PBKDF2' }, false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
      km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }

  async function encrypt(plaintext, masterPassword) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await deriveKey(masterPassword, salt);
    const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ENC.encode(plaintext));
    const packed = new Uint8Array(16 + 12 + ct.byteLength);
    packed.set(salt, 0); packed.set(iv, 16); packed.set(new Uint8Array(ct), 28);
    let bin = '';
    for (let i = 0; i < packed.length; i += 8192)
      bin += String.fromCharCode.apply(null, packed.subarray(i, i + 8192));
    return btoa(bin);
  }

  async function decrypt(b64, masterPassword) {
    const packed = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const key    = await deriveKey(masterPassword, packed.slice(0, 16));
    const plain  = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: packed.slice(16, 28) }, key, packed.slice(28));
    return DEC.decode(plain);
  }

  async function verifyMaster(storedHash, masterPassword) {
    try { return (await decrypt(storedHash, masterPassword)) === '__VAULT_CANARY__'; }
    catch { return false; }
  }

  return { VaultCrypto: { encrypt, decrypt, verifyMaster } };
}

// TOTP helpers for service worker
function _b32Decode(encoded){
  const a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  encoded=encoded.replace(/=+$/,'');
  let bits=0,value=0;const out=[];
  for(const ch of encoded){const i=a.indexOf(ch);if(i<0)continue;
    value=(value<<5)|i;bits+=5;
    if(bits>=8){out.push((value>>>(bits-8))&0xff);bits-=8;}}
  return new Uint8Array(out);
}
async function _totpCode(kb,counter,digits){
  const cb=new Uint8Array(8);const dv=new DataView(cb.buffer);
  dv.setUint32(0,Math.floor(counter/0x100000000),false);
  dv.setUint32(4,counter>>>0,false);
  const key=await crypto.subtle.importKey('raw',kb,{name:'HMAC',hash:{name:'SHA-1'}},false,['sign']);
  const sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,cb));
  const off=sig[19]&0xf;
  const code=(((sig[off]&0x7f)<<24)|(sig[off+1]<<16)|(sig[off+2]<<8)|sig[off+3]);
  return String(code%Math.pow(10,digits)).padStart(digits,'0');
}
