// settings.js - Settings Page Logic
'use strict';

let settings = {};

// ── TOAST SYSTEM ────────────────────────────────────────────────────────────
function showToast(msg, color = 'var(--accent)') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const t = document.createElement('div');
  t.className = 'toast';
  t.style.background = color === 'success' ? '#10b981' : (color === 'error' ? '#f43f5e' : color);
  t.innerHTML = `<span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2500);
  setTimeout(() => t.remove(), 3000);
}

// Load settings on page load
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  bindEvents();
});

async function loadSettings() {
  const stored = await getStorage('vault_settings');

  // FIX: पुरानी settings में नए keys नहीं होते (जैसे defaultLength)
  // stored || defaults ✗ — stored truthy हो तो defaults ignore हो जाते हैं
  // Object.assign merge ✓ — हर missing key को default मिलती है
  const DEFAULTS = {
    rememberMe: false,
    rememberDuration: 7,
    autoLockTime: 10,
    clipboardClear: 30,
    blockWeak: true,
    encryptBackup: true,
    theme: 'dark',
    excludeSimilar: false,
    defaultLength: 16,
    passwordSuggestion: true,
    silentAutoSave: false,
    autoPromptSave: true,
    autoSubmit: false,
    autoBackup: false
  };

  // FIX: Purani storage mein shayad `undefined`, `NaN`, ya invalid strings save ho gaye the
  // Isliye numeric values ko explicitly check karke default numbers par fall-back karenge
  const s = stored || {};
  settings = {
    rememberMe: s.rememberMe ?? DEFAULTS.rememberMe,
    rememberDuration: s.rememberDuration ?? DEFAULTS.rememberDuration,
    autoLockTime: (s.autoLockTime !== undefined && !isNaN(Number(s.autoLockTime))) ? Number(s.autoLockTime) : DEFAULTS.autoLockTime,
    clipboardClear: (s.clipboardClear !== undefined && !isNaN(Number(s.clipboardClear))) ? Number(s.clipboardClear) : DEFAULTS.clipboardClear,
    blockWeak: s.blockWeak ?? DEFAULTS.blockWeak,
    encryptBackup: s.encryptBackup ?? DEFAULTS.encryptBackup,
    theme: s.theme || DEFAULTS.theme,
    excludeSimilar: s.excludeSimilar ?? DEFAULTS.excludeSimilar,
    defaultLength: (s.defaultLength !== undefined && !isNaN(Number(s.defaultLength))) ? Number(s.defaultLength) : DEFAULTS.defaultLength,
    passwordSuggestion: s.passwordSuggestion ?? DEFAULTS.passwordSuggestion,
    silentAutoSave: s.silentAutoSave ?? DEFAULTS.silentAutoSave,
    autoPromptSave: s.autoPromptSave ?? DEFAULTS.autoPromptSave,
    autoSubmit:        s.autoSubmit        ?? DEFAULTS.autoSubmit,
    autoBackup: s.autoBackup ?? DEFAULTS.autoBackup
  };

  // Apply to UI
  document.getElementById('rememberToggle').classList.toggle('on', settings.rememberMe);

  // Duration dropdown — set value from settings (no event registration here)
  const _durSel = document.getElementById('rememberDuration');
  if (_durSel) _durSel.value = String(settings.rememberDuration ?? 7);
  const _durRow = document.getElementById('rememberDurationRow');
  if (_durRow) _durRow.style.display = settings.rememberMe ? 'block' : 'none';
  document.getElementById('autoLockTime').value = settings.autoLockTime;
  document.getElementById('clipboardClear').value = settings.clipboardClear;
  document.getElementById('blockWeakToggle').classList.toggle('on', settings.blockWeak);
  document.getElementById('encryptBackupToggle').classList.toggle('on', settings.encryptBackup);
  document.getElementById('themeSelect').value = settings.theme || 'dark';
  document.getElementById('excludeSimilarToggle').classList.toggle('on', settings.excludeSimilar);
  document.getElementById('defaultLength').value = settings.defaultLength;
  const autoSubEl = document.getElementById('autoSubmitToggle');
  if (autoSubEl) autoSubEl.classList.toggle('on', !!settings.autoSubmit);
  const pSugEl = document.getElementById('passwordSuggestionToggle');
  if (pSugEl) pSugEl.classList.toggle('on', settings.passwordSuggestion !== false);
  const silentSaveEl = document.getElementById('silentAutoSaveToggle');
  if (silentSaveEl) silentSaveEl.classList.toggle('on', !!settings.silentAutoSave);
  const autoSaveEl = document.getElementById('autoPromptSaveToggle');
  if (autoSaveEl) autoSaveEl.classList.toggle('on', settings.autoPromptSave !== false);
  const autoBkpEl = document.getElementById('autoBackupToggle');
  if (autoBkpEl) autoBkpEl.classList.toggle('on', !!settings.autoBackup);

  // Show last backup time
  try {
    const bd = await new Promise(r => chrome.storage.local.get(['vault_last_backup_time'], r));
    const lastTime = bd.vault_last_backup_time;
    const lastRow  = document.getElementById('lastBackupRow');
    const lastEl   = document.getElementById('lastBackupTime');
    if (lastRow && lastEl) {
      if (lastTime) {
        lastRow.style.display = 'flex';
        lastEl.textContent = new Date(lastTime).toLocaleString('hi-IN', {
          day:'2-digit', month:'short', year:'numeric',
          hour:'2-digit', minute:'2-digit'
        }) + ' — vault-backup-latest.vaultbak';
      } else {
        lastRow.style.display = 'none';
      }
    }
  } catch {}
}

function bindEvents() {

  // ── Duration dropdown: Save value BEFORE any loadSettings call ──────────
  const _remDurSel = document.getElementById('rememberDuration');
  if (_remDurSel) {
    _remDurSel.addEventListener('change', async () => {
      // CRITICAL: save selected value FIRST — loadSettings() would reset the dropdown
      const selectedDays = parseInt(_remDurSel.value);
      settings.rememberDuration = selectedDays;
      await saveSettings();
      // Update vault_remember_until live if auto-start already active
      const enc = await getStorage('vault_remembered_mp');
      if (enc) {
        const until = selectedDays === 0
          ? Date.now() + 36500 * 86400000
          : Date.now() + selectedDays * 86400000;
        await setStorage('vault_remember_until', until);
        showToast('✅ Duration updated!', 'success');
      }
    });
  }

  // ── Duration row show/hide when rememberToggle is clicked ──────────────
  const _remTog = document.getElementById('rememberToggle');
  const _remDurRow = document.getElementById('rememberDurationRow');
  if (_remTog && _remDurRow) {
    _remTog.addEventListener('click', () => {
      setTimeout(() => {
        _remDurRow.style.display = _remTog.classList.contains('on') ? 'block' : 'none';
      }, 60);
    });
  }

  // Toggles with Ripple Effect
  const toggles = [
    'rememberToggle', 'blockWeakToggle', 'encryptBackupToggle',
    'excludeSimilarToggle', 'autoSubmitToggle', 'passwordSuggestionToggle',
    'silentAutoSaveToggle', 'autoPromptSaveToggle', 'autoBackupToggle',
  ];

  toggles.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function () {
      this.classList.toggle('on');
      // FIX: id.replace('Toggle','') produces wrong key for 'rememberToggle' → 'remember'
      // but settings object uses 'rememberMe'. Use explicit map instead.
      const KEY_MAP = {
        rememberToggle: 'rememberMe',
        blockWeakToggle: 'blockWeak',
        encryptBackupToggle: 'encryptBackup',
        excludeSimilarToggle: 'excludeSimilar',
        autoSubmitToggle: 'autoSubmit',
        passwordSuggestionToggle: 'passwordSuggestion',
        silentAutoSaveToggle: 'silentAutoSave',
        autoPromptSaveToggle: 'autoPromptSave',
        autoBackupToggle: 'autoBackup',
      };
      const key = KEY_MAP[id] || id.replace('Toggle', '');
      settings[key] = this.classList.contains('on');

      // Visual feedback
      const ripple = document.createElement('div');
      ripple.style.cssText = 'position:absolute;width:100%;height:100%;background:rgba(255,255,255,0.2);border-radius:30px;transform:scale(0);opacity:1;';
      this.appendChild(ripple);
      ripple.animate([{ transform: 'scale(0)', opacity: 1 }, { transform: 'scale(2)', opacity: 0 }], { duration: 400, easing: 'ease-out' }).onfinish = () => ripple.remove();
    });
  });

  // Manual backup button with status
  const manualBackupBtn = document.getElementById('manualBackupBtn');
  if (manualBackupBtn) {
    manualBackupBtn.addEventListener('click', async () => {
      manualBackupBtn.innerHTML = '<span>⏳ Backing up...</span>';
      manualBackupBtn.disabled = true;
      try {
        const res = await chrome.runtime.sendMessage({ type: 'AUTO_BACKUP' });
        if (res && res.ok) {
          const cnt = res.count ? ` (${res.count} entries)` : '';
          showToast('✅ Backup ho gaya!' + cnt + ' → vault-backup-latest.vaultbak', 'success');
          manualBackupBtn.innerHTML = '<span>✅ Done</span>';
          // Refresh last backup time display
          await loadSettings();
        } else {
          showToast('❌ Backup fail: ' + (res?.error || 'Unknown error'), 'error');
          manualBackupBtn.innerHTML = '<span>❌ Failed</span>';
        }
      } catch(e) {
        showToast('❌ Error: ' + e.message, 'error');
      }
      setTimeout(() => { manualBackupBtn.innerHTML = '<span>📥 Export Now</span>'; manualBackupBtn.disabled = false; }, 2500);
    });
  }

  // Selects
  ['autoLockTime', 'clipboardClear', 'themeSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', (e) => {
      // FIX: 'themeSelect' element id → must map to settings.theme (not settings.themeSelect)
      if (id === 'themeSelect') {
        settings.theme = e.target.value;
        document.documentElement.setAttribute('data-theme',
          e.target.value === 'auto'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : e.target.value);
      } else {
        settings[id] = parseInt(e.target.value);
      }
    });
  });

  // Default length
  document.getElementById('defaultLength')?.addEventListener('change', (e) => {
    settings.defaultLength = parseInt(e.target.value);
  });

  // Chrome Guide with Smooth Slide
  const chromeSyncBtn = document.getElementById('chromeSyncBtn');
  const chromeImportGuide = document.getElementById('chromeImportGuide');
  if (chromeSyncBtn && chromeImportGuide) {
    chromeSyncBtn.addEventListener('click', () => {
      const isOpen = chromeImportGuide.style.display !== 'none';
      if (isOpen) {
        chromeImportGuide.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-10px)' }], { duration: 200, easing: 'ease-in' }).onfinish = () => chromeImportGuide.style.display = 'none';
        chromeSyncBtn.innerHTML = '<span>📥 Import Guide</span>';
      } else {
        chromeImportGuide.style.display = 'block';
        chromeImportGuide.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 300, easing: 'ease-out' });
        chromeSyncBtn.innerHTML = '<span>✕ Band Karo</span>';
      }
    });
  }

  // Links
  document.getElementById('openChromePassBtn')?.addEventListener('click', () => chrome.tabs.create({ url: 'chrome://settings/passwords' }));
  document.getElementById('openChromeExportBtn')?.addEventListener('click', () => chrome.tabs.create({ url: 'chrome://password-manager/passwords' }));
  document.getElementById('openVaultImportBtn')?.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') }));
  document.getElementById('changeMasterBtn')?.addEventListener('click', changeMasterPassword);

  // --- Universal Importer ---
  const triggerBtn = document.getElementById('triggerImportBtn');
  const importFileInp = document.getElementById('universalImportFile');
  if (triggerBtn && importFileInp) {
    triggerBtn.addEventListener('click', () => importFileInp.click());
    importFileInp.addEventListener('change', handleUniversalImport);
  }
  document.getElementById('confirmImportVaultBtn')?.addEventListener('click', handleVaultbakUnlock);

  // Save button with feedback
  const saveAllBtn = document.getElementById('saveSettingsBtn');
  if (saveAllBtn) {
    saveAllBtn.addEventListener('click', async () => {
      saveAllBtn.disabled = true;
      const originalText = saveAllBtn.innerHTML;
      saveAllBtn.innerHTML = '🚀 Saving...';

      const success = await saveSettings();
      if (success) {
        saveAllBtn.innerHTML = '✅ SAVED SUCCESSFULLY';
        saveAllBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';

        if (settings.rememberMe) {
          // Auto-start ON: try to write vault_remembered_mp NOW
          try {
            const sess = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
            if (sess && sess.ok && sess.masterPassword) {
              // Vault unlocked hai — abhi hi save karo
              const days  = settings.rememberDuration ?? 7;
              const until = days === 0
                ? Date.now() + 36500 * 86400000
                : Date.now() + days * 86400000;
              const encMp = await VaultCrypto.encrypt(sess.masterPassword, chrome.runtime.id);
              await setStorage('vault_remember_until', until);
              await setStorage('vault_remembered_mp', encMp);
              const label = days === 0 ? 'hamesha' : days + ' din';
              showToast('✅ Auto-start ON! ' + label + ' tak Chrome restart pe auto-unlock hoga', 'success');
            } else {
              // Vault locked hai — setting save ho gayi, user ko inform karo
              // Jab bhi user next time unlock karega, remember-me auto-apply hoga
              await setStorage('vault_remember_until', null);
              await setStorage('vault_remembered_mp', null);
              showToast('⚠️ Auto-start save hua. Ek baar unlock karo → phir Chrome band/kholo → auto-unlock!');
            }
          } catch(e) {
            showToast('✅ Settings saved! Ek baar unlock karo for auto-start.');
          }
        } else {
          // Auto-start OFF — stored credentials clear karo
          await setStorage('vault_remember_until', null);
          await setStorage('vault_remembered_mp', null);
          showToast('✅ Auto-start band kar diya.');
        }
      } else {
        saveAllBtn.innerHTML = '❌ SAVE FAILED';
        saveAllBtn.style.background = 'linear-gradient(135deg, #f43f5e, #dc2626)';
      }

      setTimeout(() => {
        saveAllBtn.disabled = false;
        saveAllBtn.innerHTML = originalText;
        saveAllBtn.style.background = '';
      }, 2000);
    });
  }
}

async function changeMasterPassword() {
  const oldPw = prompt('Current master password daalo:');
  if (!oldPw) return;

  // ✅ VaultCrypto.verifyMaster se verify karo (canary-based)
  const storedHash = await getStorage('vault_hash');
  if (!storedHash) { alert('❌ Vault hash nahi mila — pehle setup karo'); return; }

  const valid = await VaultCrypto.verifyMaster(storedHash, oldPw);
  if (!valid) { alert('❌ Current password galat hai!'); return; }

  const newPw = prompt('Naya master password daalo (min 12 characters):');
  // BUG-04 FIX: Enforce 12-char minimum (same as vault setup screen, not 6)
  if (!newPw || newPw.length < 12) { alert('❌ Password kam se kam 12 characters ka hona chahiye'); return; }

  const confirmPw = prompt('Naya password confirm karo:');
  if (newPw !== confirmPw) { alert('❌ Passwords match nahi kar rahe!'); return; }

  try {
    // FIX #3: oldPw se directly decrypt karo — GET_ALL_ENTRIES session ke bina fail ho sakta tha
    // Agar session expire ho gaya tha, naya hash save hota tha lekin blob re-encrypt nahi hota
    // = vault inaccessible. Ab oldPw se blob padho, newPw se encrypt karo — session independent.
    const existingBlob = await getStorage('vault_encrypted_blob');
    let entries = [];
    if (existingBlob) {
      const json = await VaultCrypto.decrypt(existingBlob, oldPw);
      entries = JSON.parse(json);
    }

    const newHash = await VaultCrypto.hashMaster(newPw);
    await setStorage('vault_hash', newHash);

    if (entries.length > 0) {
      const newBlob = await VaultCrypto.encrypt(JSON.stringify(entries), newPw);
      await setStorage('vault_encrypted_blob', newBlob);
    }

    await chrome.runtime.sendMessage({ type: 'SET_SESSION', masterPassword: newPw });

    // Remember me bhi update karo
    const remUntil = await getStorage('vault_remember_until');
    if (remUntil && Date.now() < remUntil) {
      const encMp = await VaultCrypto.encrypt(newPw, chrome.runtime.id);
      await setStorage('vault_remembered_mp', encMp);
    }

    alert('✅ Master password successfully badal gaya!');
  } catch (err) {
    alert('❌ Password change failed: ' + err.message);
  }
}

async function saveSettings() {
  // ✅ FIX: Function pehle kuch bhi return nahi karta tha (undefined = falsy)
  // Caller 'success' check karta tha — hamesha false milta tha → "SAVE FAILED" hamesha
  // Ab: try mein true return, catch mein false return
  try {
    await setStorage('vault_settings', settings);
    return true;
  } catch (err) {
    console.error('saveSettings error:', err);
    return false;
  }
}


// hashPassword (old SHA-256) REMOVED — use VaultCrypto.hashMaster (PBKDF2+AES-GCM)

function getStorage(key) {
  return new Promise(resolve => {
    chrome.storage.local.get([key], res => {
      resolve(res[key] !== undefined ? res[key] : null);
    });
  });
}

function setStorage(key, value) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

// ── Dashboard PIN ──────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════
// ── VAULT UNLOCK PIN SETTINGS ──────────────────
// ═══════════════════════════════════════════════
(async function initVaultPinSettings() {
  const toggle = document.getElementById('vaultPinToggle');
  const setupArea = document.getElementById('vaultPinSetupArea');
  const activeArea = document.getElementById('vaultPinActiveArea');
  const pinNew = document.getElementById('vaultPinNew');
  const pinConf = document.getElementById('vaultPinConfirm');
  const masterPw = document.getElementById('vaultPinMasterPw');
  const saveBtn = document.getElementById('vaultPinSaveBtn');
  const removeBtn = document.getElementById('vaultPinRemoveBtn');
  const msgEl = document.getElementById('vaultPinMsg');
  if (!toggle) return;

  function getS(key) {
    return new Promise(res => chrome.storage.local.get([key], r => res(r[key] !== undefined ? r[key] : null)));
  }
  function setS(key, value) {
    return new Promise(res => chrome.storage.local.set({ [key]: value }, res));
  }

  async function refreshUI() {
    const enabled = await getS('vault_pin_enabled');
    if (enabled) {
      toggle.classList.add('on');
      setupArea.style.display = 'none';
      activeArea.style.display = 'block';
    } else {
      toggle.classList.remove('on');
      setupArea.style.display = 'none';
      activeArea.style.display = 'none';
    }
  }
  await refreshUI();

  toggle.addEventListener('click', () => {
    const isOn = toggle.classList.contains('on');
    if (!isOn) {
      setupArea.style.display = 'block';
      activeArea.style.display = 'none';
    } else {
      setupArea.style.display = 'none';
    }
  });

  saveBtn.addEventListener('click', async () => {
    const pin1 = pinNew.value.trim();
    const pin2 = pinConf.value.trim();
    msgEl.style.color = '#ef4444';
    if (!pin1 || pin1.length !== 4) { msgEl.textContent = '❌ Pura 4 digits ka PIN daalo'; return; }
    if (!/^\d+$/.test(pin1)) { msgEl.textContent = '❌ Sirf numbers allowed hain'; return; }
    if (pin1 !== pin2) { msgEl.textContent = '❌ PIN match nahi kiya'; return; }

    const hash = await getS('vault_hash');
    if (!hash) { msgEl.textContent = '❌ Vault nahi mili'; return; }

    // ✅ FIX: Pehle active session se master password fetch karo
    // Agar session active hai to user ko dobara type nahi karna padega
    let mp = masterPw.value;
    if (!mp) {
      try {
        const sessionRes = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
        if (sessionRes && sessionRes.ok && sessionRes.masterPassword) {
          mp = sessionRes.masterPassword;
          // Auto-fill kar do (read-only show)
          masterPw.value = '••••••••••••';
          masterPw.dataset.autoFetched = 'true';
        }
      } catch (e) { /* session unavailable */ }
    }
    if (masterPw.dataset.autoFetched === 'true') {
      // Session se mila — directly use kar sakte hain, re-verify zaroori nahi
      // (session exist karna hi proof hai ki master password sahi tha)
    } else {
      if (!mp) { msgEl.textContent = '❌ Master password daalo ya vault unlock karo pehle'; return; }
      // Manual entry — verify karo
      const valid = await VaultCrypto.verifyMaster(hash, mp);
      if (!valid) { msgEl.textContent = '❌ Galat master password'; return; }
    }

    // Session se actual master password lo (auto-fetched case)
    if (masterPw.dataset.autoFetched === 'true') {
      try {
        const sr = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
        if (sr && sr.ok) mp = sr.masterPassword;
      } catch (e) { msgEl.textContent = '❌ Session expire ho gayi — pehle vault unlock karo'; return; }
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ PIN Save ho raha hai...';
    try {
      // ✅ SPEED FIX: hashMaster sirf ek baar — pehle settings aur popup dono alag-alag hash banate the
      // Ab sirf encMp save hota hai — verify decrypt se hota hai (no extra hash needed)
      const encMp = await VaultCrypto.encrypt(mp, pin1 + chrome.runtime.id);
      // Store a verify token too (for settings page display, not for unlock)
      const pinHash = await VaultCrypto.hashMaster(pin1);
      await setS('vault_pin_hash', pinHash);
      await setS('vault_pin_enc_mp', encMp);
      await setS('vault_pin_enabled', true);

      pinNew.value = '';
      pinConf.value = '';
      masterPw.value = '';
      masterPw.dataset.autoFetched = '';
      msgEl.style.color = '#22d3a5';
      msgEl.textContent = '✅ PIN set ho gaya! Ab lock screen pe PIN se unlock hoga';
      await refreshUI();
    } catch(err) {
      msgEl.textContent = '❌ PIN save failed: ' + err.message;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 PIN Save Karo';
    }
  });

  removeBtn.addEventListener('click', async () => {
    await setS('vault_pin_hash', null);
    await setS('vault_pin_enc_mp', null);
    await setS('vault_pin_enabled', false);
    showToast('Vault PIN disabled successfully', '#f43f5e');
    await refreshUI();
  });

  // Numeric-only input enforcement
  [pinNew, pinConf].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '').slice(0, 4);
    });
  });
})();

// ── UNIVERSAL IMPORTER LOGIC ───────────────────────────────────────────────
let _pendingImportFiles = [];
let _importedResults = [];

async function handleUniversalImport(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const statusArea = document.getElementById('importStatusArea');
  const loading = document.getElementById('importLoading');
  const resMsg = document.getElementById('importResultMsg');
  const pPrompt = document.getElementById('importPasswordPrompt');

  statusArea.style.display = 'block';
  loading.style.display = 'flex';
  resMsg.textContent = '';
  pPrompt.style.display = 'none';

  _pendingImportFiles = files;
  _importedResults = [];

  let count = 0;
  let hasVaultbak = false;

  for (const f of files) {
    if (f.name.toLowerCase().endsWith('.vaultbak')) {
      hasVaultbak = true;
      continue;
    }
    try {
      const text = await readFile(f);
      const items = await Importer.smartParse(text, f.name);
      if (items && items.length) {
        _importedResults.push(...items);
        count += items.length;
      }
    } catch (err) {
      console.warn('Import fail:', f.name, err);
    }
  }

  loading.style.display = 'none';

  if (hasVaultbak) {
    resMsg.textContent = (count > 0 ? `✅ ${count} entries found. ` : '') + '🔐 .vaultbak detect hua — password daalo:';
    pPrompt.style.display = 'block';
  } else if (count > 0) {
    await mergeAndSave(count);
  } else {
    resMsg.textContent = '❌ Koi valid password data nahi mila.';
    setTimeout(() => { statusArea.style.display = 'none'; }, 3000);
  }
}

async function handleVaultbakUnlock() {
  const pw = document.getElementById('importVaultPass').value;
  if (!pw) return alert('Password zaroori hai');

  const vFiles = _pendingImportFiles.filter(f => f.name.toLowerCase().endsWith('.vaultbak'));
  let total = 0;

  for (const f of vFiles) {
    try {
      const buf = await readFileAsBuffer(f);
      const rawText = new TextDecoder().decode(buf).trim();
      let encryptedData = null;

      // Robust check matches setup.js
      try {
        const p = JSON.parse(rawText);
        if (p.vault_backup && p.data) encryptedData = p.data;
      } catch (e) {}

      if (!encryptedData) {
        try {
          const d = atob(rawText);
          if (d.startsWith('{')) {
            const p = JSON.parse(d);
            if (p.vault_backup && p.data) encryptedData = p.data;
          }
        } catch (e) {}
      }
      
      if (!encryptedData) encryptedData = rawText; // Fallback to raw

      const dec = await VaultCrypto.decrypt(encryptedData, pw);
      const data = JSON.parse(dec);
      const entries = data.entries || data.items || (Array.isArray(data) ? data : []);
      if (entries.length) {
        _importedResults.push(...entries.map(Importer.norm));
        total += entries.length;
      }
    } catch (err) {
      console.error('Vaultbak error:', err);
    }
  }

  if (total > 0 || _importedResults.length > 0) {
    await mergeAndSave(_importedResults.length);
  } else {
    alert('❌ Decryption failed ya file khali hai. Password check karein.');
  }
}

async function mergeAndSave(count) {
  const statusArea = document.getElementById('importStatusArea');
  const resMsg = document.getElementById('importResultMsg');
  const pPrompt = document.getElementById('importPasswordPrompt');

  resMsg.textContent = `⏳ ${count} entries vault mein merge ho rahi hain...`;
  pPrompt.style.display = 'none';

  try {
    const sess = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
    if (!sess || !sess.ok) {
      resMsg.textContent = '❌ Vault Locked! Pehle extension unlock karein phir import karein.';
      return;
    }

    // Get current entries
    const blob = await getStorage('vault_encrypted_blob');
    let current = [];
    if (blob) {
      const json = await VaultCrypto.decrypt(blob, sess.masterPassword);
      current = JSON.parse(json);
    }

    let added = 0;
    _importedResults.forEach(n => {
      const dup = current.find(x => 
        (x.url || '').toLowerCase() === (n.url || '').toLowerCase() && 
        (x.username || '').toLowerCase() === (n.username || '').toLowerCase()
      );
      if (!dup) {
        const now = Date.now();
        current.push({
          id: 'v_' + Math.random().toString(36).substr(2),
          title: n.title || (n.url ? n.url.split('/')[0] : 'Imported'),
          url: n.url || '',
          username: n.username || '',
          password: n.password,
          mobile: n.mobile || '',
          notes: n.notes || '',
          totp: n.totp || '',
          createdAt: now,
          updatedAt: now
        });
        added++;
      }
    });

    const newBlob = await VaultCrypto.encrypt(JSON.stringify(current), sess.masterPassword);
    await setStorage('vault_encrypted_blob', newBlob);
    chrome.runtime.sendMessage({ type: 'INVALIDATE_CACHE' }).catch(() => {});

    resMsg.textContent = `✅ Success! ${added} naye items add kiye gaye.`;
    setTimeout(() => { statusArea.style.display = 'none'; }, 4000);
    showToast(`✅ ${added} items successfully imported!`, 'success');

  } catch (err) {
    resMsg.textContent = '❌ Import failed: ' + err.message;
  }
}

function readFile(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.readAsText(file);
  });
}

function readFileAsBuffer(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.readAsArrayBuffer(file);
  });
}

