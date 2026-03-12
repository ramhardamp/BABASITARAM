// Simple Vault - Fast & Reliable
'use strict';

let masterPassword = null;
let entries = [];
let currentTab = 'all';
let editingId = null;
let settings = {};
let clipboardTimer = null;
let currentGenType = 'random'; // 'random' or 'passphrase'

// ── Dashboard State ──
let currentView = 'grouped';  // 'grouped' | 'flat'
let currentFilter = 'all';
let selectMode = false;
let selectedIds = new Set();
let displayEntries = [];
let _pendingDeleteId = null;

// Common weak passwords list
const WEAK_PASSWORDS = new Set([
  '123456', 'password', '12345678', 'qwerty', '123456789', '12345', '1234', '111111', '1234567',
  'dragon', '123123', 'baseball', 'iloveyou', '1234567890', '1q2w3e4r', '000000', 'qwertyuiop',
  'monkey', '1234qwer', 'qwerty123', 'abc123', 'password1', 'admin', 'letmein', 'welcome'
]);

// Init
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  bindEvents();
  bindPinEvents();

  // ══════════════════════════════════════════════════════════════
  // FAST STARTUP: Background se seedha session check karo
  // background.js ne Chrome start par already remember-me se
  // session restore kar liya hoga — popup ko kuch karna hi nahi
  // ══════════════════════════════════════════════════════════════
  // Auto-start: Agar SW still restoring session, thoda wait karo
  // (Chrome start pe SW ko ~800ms lagti hai remember-me restore karne mein)
  let session = await sendMsg({ type: 'GET_SESSION' });
  if (!session?.ok || !session.masterPassword) {
    // SW still restoring — 900ms wait karke dobara check
    await new Promise(r => setTimeout(r, 900));
    session = await sendMsg({ type: 'GET_SESSION' });
  }
  if (!session?.ok || !session.masterPassword) {
    // 2nd retry — slow machine ke liye
    await new Promise(r => setTimeout(r, 1200));
    session = await sendMsg({ type: 'GET_SESSION' });
  }

  if (session && session.ok && session.masterPassword) {
    // ✅ Session active — directly main screen dikhao
    masterPassword = session.masterPassword;
    await loadEntries();
    showScreen('mainScreen');
    generatePassword();
    checkCurrentTabForAutofill();

    // Check for pending edit
    const pendingEdit = await getStorage('vault_pending_edit');
    if (pendingEdit) {
      await setStorage('vault_pending_edit', null);
      const entry = entries.find(e => e.id === pendingEdit);
      if (entry) setTimeout(() => openAddPanel(entry), 300);
    }
    return;
  }

  // Session nahi hai — PIN/Remember-me/Lock screen check
  const showPin = await initPinUnlock();
  if (showPin) return;

  // Remember me check (agar background ne restore nahi kiya — fallback)
  const rememberUntil = await getStorage('vault_remember_until');
  if (rememberUntil && Date.now() < rememberUntil) {
    document.getElementById('rememberCheckbox').checked = true;
    const rememberedEnc = await getStorage('vault_remembered_mp');
    const hash = await getStorage('vault_hash');
    if (rememberedEnc && hash) {
      try {
        const mp    = await VaultCrypto.decrypt(rememberedEnc, chrome.runtime.id);
        const valid = await VaultCrypto.verifyMaster(hash, mp);
        if (valid) {
          masterPassword = mp;
          showScreen('mainScreen');
          await sendMsg({ type: 'SET_SESSION', masterPassword: mp });
          await loadEntries();
          generatePassword();
          checkCurrentTabForAutofill();
          return;
        }
      } catch (e) {
        await setStorage('vault_remembered_mp', null);
        await setStorage('vault_remember_until', null);
      }
    }
  }

  // Koi session/remember-me nahi — lock screen dikhao
  await setStorage('vault_entries', null);
  const hasVault = await getStorage('vault_hash');
  if (!hasVault) {
    showScreen('setupScreen');
  } else {
    const pinEnabled = await getStorage('vault_pin_enabled');
    showScreen(pinEnabled ? 'pinScreen' : 'lockScreen');
    const rc = document.getElementById('rememberCheckbox');
    if (rc) {
      const remembered = await getStorage('vault_remember_until');
      const remMp = await getStorage('vault_remembered_mp');
      // Auto-check if: still within window, OR setting is ON
      const shouldCheck = (remembered && Date.now() < remembered && remMp) || settings.rememberMe;
      rc.checked = !!shouldCheck;

      // Show auto-start status banner
      const autoStartBanner = document.getElementById('autoStartBanner');
      if (autoStartBanner) {
        if (settings.rememberMe && (!remMp || !remembered || Date.now() >= remembered)) {
          // Setting ON but data missing — prompt unlock
          autoStartBanner.style.display = 'flex';
          autoStartBanner.textContent = '🚀 Auto-Start ON — unlock karo, phir Chrome band/kholo';
        } else if (settings.rememberMe && remMp) {
          autoStartBanner.style.display = 'flex';
          autoStartBanner.textContent = '✅ Auto-Start Active — next restart pe auto-unlock hoga';
          autoStartBanner.style.background = 'rgba(34,211,165,.12)';
          autoStartBanner.style.borderColor = 'rgba(34,211,165,.3)';
          autoStartBanner.style.color = '#22d3a5';
        } else {
          autoStartBanner.style.display = 'none';
        }
      }
    }
  }
});

async function loadSettings() {
  const stored = await getStorage('vault_settings');
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
    autoSubmit: false,
    silentAutoSave: false,
    autoPromptSave: true
  };

  const s = stored || {};
  settings = {
    rememberMe: s.rememberMe ?? DEFAULTS.rememberMe,
    rememberDuration: (s.rememberDuration !== undefined && !isNaN(Number(s.rememberDuration))) ? Number(s.rememberDuration) : DEFAULTS.rememberDuration,
    autoLockTime: (s.autoLockTime !== undefined && !isNaN(Number(s.autoLockTime))) ? Number(s.autoLockTime) : DEFAULTS.autoLockTime,
    clipboardClear: (s.clipboardClear !== undefined && !isNaN(Number(s.clipboardClear))) ? Number(s.clipboardClear) : DEFAULTS.clipboardClear,
    blockWeak: s.blockWeak ?? DEFAULTS.blockWeak,
    encryptBackup: s.encryptBackup ?? DEFAULTS.encryptBackup,
    theme: s.theme || DEFAULTS.theme,
    excludeSimilar: s.excludeSimilar ?? DEFAULTS.excludeSimilar,
    defaultLength: (s.defaultLength !== undefined && !isNaN(Number(s.defaultLength))) ? Number(s.defaultLength) : DEFAULTS.defaultLength,
    passwordSuggestion: s.passwordSuggestion ?? DEFAULTS.passwordSuggestion,
    autoSubmit: s.autoSubmit ?? DEFAULTS.autoSubmit,
    silentAutoSave: s.silentAutoSave ?? DEFAULTS.silentAutoSave,
    autoPromptSave: s.autoPromptSave ?? DEFAULTS.autoPromptSave
  };
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function bindEvents() {
  // Lock screen eye button — was missing!
  const lockEyeBtn = document.getElementById('lockEyeBtn');
  if (lockEyeBtn) {
    lockEyeBtn.addEventListener('click', () => {
      const inp = document.getElementById('masterInput');
      inp.type = inp.type === 'password' ? 'text' : 'password';
      lockEyeBtn.textContent = inp.type === 'password' ? '👁' : '🙈';
    });
  }

  // Lock
  document.getElementById('unlockBtn').addEventListener('click', doUnlock);
  document.getElementById('masterInput').addEventListener('keypress', e => { if (e.key === 'Enter') doUnlock(); });
  document.getElementById('setupLink').addEventListener('click', () => showScreen('setupScreen'));

  // Setup
  document.getElementById('createBtn').addEventListener('click', doCreateVault);
  document.getElementById('backToLock').addEventListener('click', () => showScreen('lockScreen'));
  document.getElementById('newMaster').addEventListener('input', checkSetupStrength);

  // Main
  document.getElementById('lockBtn').addEventListener('click', doLock);
  document.getElementById('testBackupBtn').addEventListener('click', async () => {
    const result = await sendMsg({ type: 'AUTO_BACKUP' });
    showToast(result.ok ? 'Backup created!' : 'Backup failed: ' + (result.error || 'Unknown'));
  });
  document.getElementById('addBtn').addEventListener('click', () => openAddPanel(null));
  document.getElementById('genOpenBtn').addEventListener('click', () => openPanel('genPanel'));
  document.getElementById('ioOpenBtn').addEventListener('click', () => openPanel('ioPanel'));
  document.getElementById('settingsBtn').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') }));
  document.getElementById('autofillBtn').addEventListener('click', doAutofillFromBar);
  document.getElementById('sidePanelBtn').addEventListener('click', () => {
    chrome.sidePanel.setOptions({
      path: 'sidepanel.html',
      enabled: true
    });
    chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  });
  // Search with Debounce (Speed Fix)
  let searchT;
  document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(searchT);
    searchT = setTimeout(() => renderEntries(e.target.value), 100);
  });

  // Tabs
  document.querySelectorAll('.tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab[data-tab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      renderEntries();
    });
  });

  // Detail
  document.getElementById('detailBack').addEventListener('click', () => closePanel('detailPanel'));
  document.getElementById('detailStarBtn').addEventListener('click', toggleStar);

  // Add/Edit
  document.getElementById('addBack').addEventListener('click', () => closePanel('addPanel'));
  document.getElementById('saveEntryBtn').addEventListener('click', doSaveEntry);

  const _totpTog=document.getElementById('fTotpToggle');
  if(_totpTog) _totpTog.addEventListener('click',()=>{
    const f=document.getElementById('fTotp');
    if(f.type==='password'){f.type='text';_totpTog.textContent='🙈';}
    else{f.type='password';_totpTog.textContent='👁';}
  });

  document.getElementById('deleteEntryBtn').addEventListener('click', doDeleteEntry);
  document.getElementById('fPassToggle').addEventListener('click', togglePasswordVisibility);
  document.getElementById('quickGenBtn').addEventListener('click', quickGen);
  document.getElementById('fPass').addEventListener('input', updateAddStrength);

  // Generator
  document.getElementById('genBack').addEventListener('click', () => closePanel('genPanel'));
  document.getElementById('regenBtn').addEventListener('click', generatePassword);
  document.getElementById('copyGenBtn').addEventListener('click', copyGeneratedPassword);
  document.getElementById('lenSlider').addEventListener('input', e => {
    document.getElementById('lenVal').textContent = e.target.value;
    generatePassword();
  });
  document.getElementById('wordCountSlider').addEventListener('input', e => {
    document.getElementById('wordCountVal').textContent = e.target.value;
    generatePassword();
  });
  document.getElementById('separatorInput').addEventListener('input', () => generatePassword());

  // Generator type tabs (random / passphrase / manual)
  document.querySelectorAll('#genPanel .io-tab[data-gen]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#genPanel .io-tab[data-gen]').forEach(t => t.classList.toggle('active', t.dataset.gen === tab.dataset.gen));
      currentGenType = tab.dataset.gen;
      document.getElementById('randomGenView').style.display = currentGenType === 'random' ? 'block' : 'none';
      document.getElementById('passphraseGenView').style.display = currentGenType === 'passphrase' ? 'block' : 'none';
      const manualView = document.getElementById('manualGenView');
      if (manualView) manualView.style.display = currentGenType === 'manual' ? 'block' : 'none';
      // Hide "Generate New" in manual mode — user types their own
      const regenBtn = document.getElementById('regenBtn');
      if (regenBtn) regenBtn.style.display = currentGenType === 'manual' ? 'none' : '';
      if (currentGenType !== 'manual') generatePassword();
    });
  });

  // Manual password strength meter
  const manualPwInput = document.getElementById('manualPwInput');
  if (manualPwInput) {
    manualPwInput.addEventListener('input', () => {
      const pw = manualPwInput.value;
      const str = calcStrength(pw);
      const fill = { weak: 1, medium: 2, strong: 4 };
      const cls = { weak: 's', medium: 'm', strong: 'g' };
      [1, 2, 3, 4].forEach(i => {
        const el = document.getElementById('mgs' + i);
        if (!el) return;
        el.className = 'str-seg';
        if (i <= fill[str]) el.classList.add('filled', cls[str]);
      });
      const lbl = document.getElementById('manualStrLabel');
      if (lbl) {
        const labels = { weak: '⚠ Weak — aur characters add karo', medium: '👍 Theek hai', strong: '✅ Strong password!' };
        const colors = { weak: '#f87171', medium: '#fbbf24', strong: '#22d3a5' };
        lbl.textContent = pw ? labels[str] : 'Type karo to strength dikhe';
        lbl.style.color = pw ? colors[str] : '#555';
      }
    });
  }

  ['cUpper', 'cLower', 'cNums', 'cSyms'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      document.getElementById(id).classList.toggle('on');
      generatePassword();
    });
  });

  // Prefix input — har keystroke par naya password banao
  const prefixInputEl = document.getElementById('prefixInput');
  if (prefixInputEl) {
    prefixInputEl.addEventListener('input', () => {
      // Uppercase enforce karo
      prefixInputEl.value = prefixInputEl.value.toUpperCase().replace(/[^A-Z0-9!@#$%]/g, '');
      generatePassword();
    });
  }

  // IO
  document.getElementById('ioBack').addEventListener('click', () => closePanel('ioPanel'));
  new ImportExportUI(() => entries, async (newEntries) => { entries = newEntries; await saveEntries(); }, calcStrength, genId, showToast, closePanel);

  // ★ FIX 4: Bookmark tab in IO panel
  document.querySelectorAll('.io-tab[data-io]').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.io;
      document.querySelectorAll('.io-tab[data-io]').forEach(t => t.classList.toggle('active', t === tab));
      document.getElementById('ioImportView').style.display  = target === 'import'    ? '' : 'none';
      document.getElementById('ioExportView').style.display  = target === 'export'    ? '' : 'none';
      document.getElementById('ioBookmarkView').style.display = target === 'bookmarks' ? '' : 'none';
    });
  });
  initBookmarkIO();

  // ── View Toggle ──
  document.getElementById('viewGroupBtn')?.addEventListener('click', () => {
    currentView = 'grouped';
    document.getElementById('viewGroupBtn').classList.add('active');
    document.getElementById('viewFlatBtn').classList.remove('active');
    applyFilterSearch();
  });
  document.getElementById('viewFlatBtn')?.addEventListener('click', () => {
    currentView = 'flat';
    document.getElementById('viewFlatBtn').classList.add('active');
    document.getElementById('viewGroupBtn').classList.remove('active');
    applyFilterSearch();
  });

  // ── Stat Pills ──
  document.querySelectorAll('.stat-pill[data-f]').forEach(pill => {
    pill.addEventListener('click', () => setFilter(pill.dataset.f));
  });

  // ── Select Mode ──
  document.getElementById('selectModeBtn')?.addEventListener('click', () => {
    if (selectMode) exitSelectMode(); else enterSelectMode();
  });
  document.getElementById('cancelSelectBtn')?.addEventListener('click', exitSelectMode);
  document.getElementById('selectAllChk')?.addEventListener('change', function() {
    if (this.checked) displayEntries.forEach(e => selectedIds.add(e.id));
    else selectedIds.clear();
    updateSelBar(); renderAll();
  });

  // ── Bulk Delete ──
  document.getElementById('bulkDeleteBtn')?.addEventListener('click', () => {
    const n = selectedIds.size; if (!n) return;
    const desc = document.getElementById('bulkDeleteDesc');
    if (desc) desc.textContent = n + ' passwords permanently delete ho jayenge!';
    const bm = document.getElementById('bulkDeleteModal');
    if (bm) bm.style.display = 'flex';
  });
  document.getElementById('bulkDelCancelBtn')?.addEventListener('click', () => {
    const bm = document.getElementById('bulkDeleteModal');
    if (bm) bm.style.display = 'none';
  });
  document.getElementById('bulkDelConfirmBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('bulkDelConfirmBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Deleting...'; }
    const n = selectedIds.size;
    entries = entries.filter(e => !selectedIds.has(e.id));
    await saveEntries();
    const bm = document.getElementById('bulkDeleteModal');
    if (bm) bm.style.display = 'none';
    exitSelectMode();
    showToast('🗑 ' + n + ' entries deleted!');
    if (btn) { btn.disabled = false; btn.textContent = 'Delete All'; }
  });

  // ── Single Delete Modal ──
  document.getElementById('deleteCancelBtn')?.addEventListener('click', closeDeleteConfirm);
  document.getElementById('deleteConfirmBtn')?.addEventListener('click', async () => {
    if (!_pendingDeleteId) return;
    const btn = document.getElementById('deleteConfirmBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Deleting...'; }
    entries = entries.filter(e => e.id !== _pendingDeleteId);
    await saveEntries();
    closeDeleteConfirm();
    showToast('🗑 Deleted!');
    if (btn) { btn.disabled = false; btn.textContent = 'Delete'; }
  });

  // ESC to close modals
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeDeleteConfirm();
    const bm = document.getElementById('bulkDeleteModal');
    if (bm) bm.style.display = 'none';
  });
} // end bindEvents

async function doUnlock() {
  const input = document.getElementById('masterInput');
  const btn = document.getElementById('unlockBtn');
  const errEl = document.getElementById('lockErr');
  const rememberCheckbox = document.getElementById('rememberCheckbox');
  const pw = input.value.trim();

  if (!pw) { errEl.textContent = 'Enter password'; return; }

  btn.disabled = true;
  btn.textContent = 'तिजोरी खोली जा रही है...';
  errEl.textContent = '';

  try {
    const hash = await getStorage('vault_hash');
    if (!hash) { errEl.textContent = '⚠️ Koi vault nahi mili — pehle setup karo'; return; }

    // ✅ FIX: Use PBKDF2-based verifyMaster (not SHA-256)
    const valid = await VaultCrypto.verifyMaster(hash, pw);
    if (!valid) { errEl.textContent = '❌ Galat password — dobara try karo'; return; }

    masterPassword = pw;
    await sendMsg({ type: 'SET_SESSION', masterPassword: pw });

    // Handle remember me — use settings.rememberMe OR checkbox
    // If settings.rememberMe is ON, auto-save even without checkbox
    const shouldRemember = (rememberCheckbox && rememberCheckbox.checked) || settings.rememberMe;
    if (shouldRemember) {
      const _days = settings.rememberDuration ?? 7;
      const until = _days === 0
        ? Date.now() + 36500 * 86400000
        : Date.now() + _days * 86400000;
      const encMp = await VaultCrypto.encrypt(pw, chrome.runtime.id);
      await setStorage('vault_remember_until', until);
      await setStorage('vault_remembered_mp', encMp);
    } else {
      await setStorage('vault_remember_until', null);
      await setStorage('vault_remembered_mp', null);
    } // end shouldRemember

    input.value = '';
    await loadEntries();
    showScreen('mainScreen');
    generatePassword();
    checkCurrentTabForAutofill(); // FIX #1: Pehle yeh missing tha — autofill bar kabhi nahi dikhti thi
  } catch (e) {
    errEl.textContent = '❌ Unlock fail hua: ' + (e.message || 'Unknown error') + ' — Extension reload karo aur try karo';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Unlock Vault';
  }
}

async function doCreateVault() {
  const pw = document.getElementById('newMaster').value;
  const confirm = document.getElementById('confirmMaster').value;
  const errEl = document.getElementById('setupErr');
  const btn = document.getElementById('createBtn');

  errEl.textContent = '';
  if (pw.length < 12) { errEl.textContent = 'Minimum 12 characters required'; return; }
  if (pw !== confirm) { errEl.textContent = 'Passwords do not match'; return; }

  btn.disabled = true;
  btn.textContent = 'तिजोरी बनाई जा रही है...';

  try {
    // ✅ FIX: Use PBKDF2-based hashMaster (not SHA-256)
    const hash = await VaultCrypto.hashMaster(pw);
    await setStorage('vault_hash', hash);

    masterPassword = pw;
    entries = [];
    // vault_entries se IMPORT NAHI — woh purana/deleted data ho sakta hai
    // Naya vault hamesha fresh start karta hai
    await setStorage('vault_encrypted_blob', null); // fresh start
    await setStorage('vault_entries', null);         // purana data nuke
    await setStorage('vault_setup_complete', true);  // prevent setup.html re-open on reinstall
    await sendMsg({ type: 'SET_SESSION', masterPassword: pw });

    document.getElementById('newMaster').value = '';
    document.getElementById('confirmMaster').value = '';

    showScreen('mainScreen');
    await loadEntries();   // loadEntries already calls applyFilterSearch internally
    generatePassword();
    showToast('Vault created! 🎉');
  } catch (e) {
    errEl.textContent = '❌ Vault nahi bana: ' + (e.message || 'Unknown error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Vault';
  }
}

async function doLock() {
  await sendMsg({ type: 'CLEAR_SESSION' });
  masterPassword = null;
  entries = [];
  displayEntries = [];
  selectedIds.clear();
  selectMode = false;
  // Close any open panels/modals before locking
  ['detailPanel','addPanel','genPanel','ioPanel'].forEach(id => closePanel(id));
  closeDeleteConfirm();
  const bm = document.getElementById('bulkDeleteModal');
  if (bm) bm.style.display = 'none';
  showScreen('lockScreen');
}

async function loadEntries() {
  if (!masterPassword) {
    entries = [];
    showScreen('lockScreen');
    return;
  }
  try {
    const blob = await getStorage('vault_encrypted_blob');
    if (!blob) {
      entries = [];
    } else {
      const json = await VaultCrypto.decrypt(blob, masterPassword);
      entries = JSON.parse(json);
    }
  } catch (e) {
    console.error('Decrypt failed — session lost:', e);
    masterPassword = null;
    entries = [];
    showScreen('lockScreen');
    const errEl = document.getElementById('lockErr');
    // Descriptive reason: DOMException = wrong key, SyntaxError = corrupt data
    const reason = (e.name === 'OperationError')
      ? '🔑 Session expire ho gai — dobara unlock karo'
      : (e instanceof SyntaxError)
        ? '⚠️ Vault data corrupt lag raha hai — backup se restore karo'
        : '⏱ Session expire ho gai — dobara unlock karo';
    if (errEl) errEl.textContent = reason;
    return;
  }
  console.log('Loaded', entries.length, 'entries');
  displayEntries = [...entries];
  applyFilterSearch();
}

async function saveEntries() {
  if (!masterPassword) { console.error('No masterPassword!'); return; }
  // ★ FIX 2: Background ke SAVE_ALL_ENTRIES use karo — auto-backup trigger hoga
  // Pehle popup direct storage likhta tha, auto-backup kabhi fire nahi hoti thi
  let savedOk = false;
  try {
    const result = await sendMsg({ type: 'SAVE_ALL_ENTRIES', entries }, 3, 300);
    savedOk = !!(result && result.ok);
  } catch(e) { savedOk = false; }

  if (!savedOk) {
    // Fallback: direct save if background unreachable
    try {
      const blob = await VaultCrypto.encrypt(JSON.stringify(entries), masterPassword);
      await setStorage('vault_encrypted_blob', blob);
      await setStorage('vault_entries', null);
      chrome.runtime.sendMessage({ type: 'INVALIDATE_CACHE' }).catch(() => {});
    } catch(e) { console.error('saveEntries fallback failed', e); }
  }
  displayEntries = [...entries];
  applyFilterSearch();
}

let _cachedBmCount = null;
let _bmCountTimer = null;

// ══════════════════════════════════════════════════════════
// ── DASHBOARD RENDERING SYSTEM (merged from passwords.js) ──
// ══════════════════════════════════════════════════════════

// ── Helpers ──
function isBreach(pw) {
  if (!pw) return false;
  const common = ['password','123456','12345678','qwerty','abc123','password123',
    '111111','123123','admin','letmein','welcome','monkey','1234567890'];
  return common.includes((pw||'').toLowerCase()) || pw.length < 6;
}

function normDomain(url) {
  if (!url) return '(no url)';
  try {
    if (!url.includes('://')) url = 'https://' + url;
    return new URL(url).hostname.replace(/^www\./,'').toLowerCase();
  } catch { return url.toLowerCase().split('/')[0] || url; }
}

function getStrength(pw) {
  if (!pw) return 'weak';
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s >= 4 ? 'strong' : s >= 2 ? 'medium' : 'weak';
}

const _COLORS = ['#4f46e5','#059669','#dc2626','#d97706','#7c3aed','#0891b2','#ea580c','#475569'];
function avatarColor(str) {
  let h = 0;
  for (let i = 0; i < (str||'').length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return _COLORS[h % _COLORS.length];
}

// ── Stats Update ──
function updateCounts() {
  // Tabs
  document.getElementById('cntAll').textContent = entries.length;
  document.getElementById('cntStar').textContent = entries.filter(e=>e.starred).length;
  document.getElementById('cntWeak').textContent = entries.filter(e=>getStrength(e.password)==='weak').length;
  document.getElementById('cntMobiles').textContent = entries.filter(e=>e.mobile).length;
  if (_cachedBmCount !== null) document.getElementById('cntBookmarks').textContent = _cachedBmCount;
  clearTimeout(_bmCountTimer);
  _bmCountTimer = setTimeout(() => {
    chrome.bookmarks.getTree(nodes => {
      let c = 0; const cnt = ns => ns.forEach(n => { if (n.url) c++; if (n.children) cnt(n.children); }); cnt(nodes);
      _cachedBmCount = c;
      const el = document.getElementById('cntBookmarks'); if (el) el.textContent = c;
    });
  }, 300);

  // Stat pills
  const breach = entries.filter(e=>isBreach(e.password)).length;
  const weak   = entries.filter(e=>getStrength(e.password)==='weak').length;
  const med    = entries.filter(e=>getStrength(e.password)==='medium').length;
  const strong = entries.filter(e=>getStrength(e.password)==='strong').length;
  const mobs   = entries.filter(e=>e.mobile).length;
  const _s = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  _s('spCntAll', entries.length); _s('spCntBreach', breach); _s('spCntWeak', weak);
  _s('spCntMed', med); _s('spCntStrong', strong); _s('spCntMobiles', mobs);

  // Breach banner
  const bb = document.getElementById('breachBanner');
  const bt = document.getElementById('breachBannerTxt');
  if (bb) bb.style.display = breach > 0 ? 'flex' : 'none';
  if (bt) bt.textContent = breach + ' breach passwords';

  // Entry count label
  const lbl = document.getElementById('entryCountLbl');
  if (lbl) lbl.textContent = displayEntries.length + ' entries';
}

// ── Filter + Search ──
function applyFilterSearch(query) {
  const q = (query || document.getElementById('searchInput').value || '').trim().toLowerCase();
  const qDom = q ? normDomain(q) || q : '';

  if (currentTab === 'bookmarks') { renderEntries(q); return; }

  let base = [...entries];
  if (currentTab === 'starred') base = base.filter(e => e.starred);
  else if (currentTab === 'mobiles') base = base.filter(e => e.mobile);
  else if (currentTab === 'weak') base = base.filter(e => getStrength(e.password) === 'weak');

  if (currentFilter === 'breach') base = base.filter(e => isBreach(e.password));
  else if (currentFilter === 'weak') base = base.filter(e => getStrength(e.password) === 'weak');
  else if (currentFilter === 'medium') base = base.filter(e => getStrength(e.password) === 'medium');
  else if (currentFilter === 'strong') base = base.filter(e => getStrength(e.password) === 'strong');
  else if (currentFilter === 'mobiles') base = base.filter(e => e.mobile);

  if (q) base = base.filter(e => {
    const eDom = normDomain(e.url);
    return (e.title||'').toLowerCase().includes(q) ||
      (e.username||'').toLowerCase().includes(q) ||
      (e.url||'').toLowerCase().includes(q) ||
      (e.mobile||'').toLowerCase().includes(q) ||
      (qDom && eDom && (eDom.includes(qDom) || qDom.includes(eDom)));
  });

  displayEntries = base;
  renderAll();
}

function setFilter(f) {
  currentFilter = f;
  // ★ FIX 3: Breach "Fix Now" — 'all' tab par switch karo taaki breach entries dikh sakein
  if (f === 'breach' || f === 'weak') {
    if (currentTab !== 'all') {
      currentTab = 'all';
      document.querySelectorAll('.tab[data-tab]').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === 'all')
      );
    }
  }
  document.querySelectorAll('.stat-pill[data-f]').forEach(p => p.classList.toggle('active', p.dataset.f === f));
  applyFilterSearch();
  // Show a helpful toast for breach filter
  if (f === 'breach') {
    const bc = entries.filter(e => isBreach(e.password)).length;
    if (bc > 0) showToast('⚠ ' + bc + ' breach entries — entry click kar ke password change karo!', true);
  }
}

// ── Render All ──
function renderAll() {
  updateCounts();
  const list = document.getElementById('entryList');
  if (!list) return;
  list.innerHTML = '';

  if (displayEntries.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="em-icon">🔒</div><p>Kuch nahi mila</p></div>`;
    return;
  }

  if (currentView === 'grouped') renderGrouped();
  else renderFlat();
}

// ── Grouped View ──
function renderGrouped() {
  const list = document.getElementById('entryList');
  const groups = {};
  displayEntries.forEach(e => {
    const dom = normDomain(e.url);
    if (!groups[dom]) groups[dom] = [];
    groups[dom].push(e);
  });

  const domains = Object.keys(groups).sort();
  let dIdx = 0;
  const chunkSize = 15;

  function renderNextGroups() {
    const end = Math.min(dIdx + chunkSize, domains.length);
    const frag = document.createDocumentFragment();

    for (let i = dIdx; i < end; i++) {
      const domain = domains[i];
      const grpEntries = groups[domain];
      const color = avatarColor(domain);
      const initial = (domain[0] || '?').toUpperCase();
      const hasBr = grpEntries.some(e => isBreach(e.password));
      const hasWk = grpEntries.some(e => getStrength(e.password) === 'weak');
      const single = grpEntries.length === 1;
      const fUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=https://${domain}&size=32`;

      const grpEl = document.createElement('div');
      grpEl.className = 'grp-wrap';
      grpEl.style.cssText = 'border-bottom:1px solid var(--border);';

      const hdrEl = document.createElement('div');
      hdrEl.className = 'grp-hdr';
      hdrEl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;user-select:none;position:relative;';
      hdrEl.innerHTML = `
        <input type="checkbox" class="g-chk" style="cursor:pointer;" ${selectMode?'':'style="display:none"'}>
        <div style="width:28px;height:28px;border-radius:7px;background:${color};display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;overflow:hidden;">
          <img src="${fUrl}" style="width:16px;height:16px;position:absolute;" onerror="this.style.display='none'">
          <span style="font-size:12px;font-weight:800;color:#fff;z-index:1;">${initial}</span>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:700;color:var(--text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(domain)}</div>
          <div style="font-size:10px;color:var(--text3);">${single ? escHtml(grpEntries[0].username||'—') : grpEntries.length+' accounts'}</div>
        </div>
        <div style="display:flex;gap:4px;align-items:center;">
          ${hasBr?'<span style="font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;background:rgba(239,68,68,0.15);color:#f87171;">⚠ Breach</span>':''}
          ${hasWk&&!hasBr?'<span style="font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;background:rgba(251,191,36,0.15);color:#fbbf24;">Weak</span>':''}
          ${single?`
            <button class="g-copy-btn mini-btn" title="Copy password" style="padding:4px;">📋</button>
            <button class="g-edit-btn mini-btn" title="Edit" style="padding:4px;">✏️</button>
          `:`<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;background:var(--bg3);color:var(--text3);">${grpEntries.length}</span>`}
          <span class="g-chev" style="color:var(--text3);font-size:12px;transition:transform .2s;">▼</span>
        </div>`;

      const bodyEl = document.createElement('div');
      bodyEl.className = 'grp-body';
      bodyEl.style.cssText = 'display:none;background:var(--bg2);';

      let bodyOpen = false;
      const toggleGrp = (e) => {
        if (e && (e.target.closest('.g-copy-btn') || e.target.closest('.g-edit-btn') || e.target.closest('.g-chk'))) return;
        bodyOpen = !bodyOpen;
        bodyEl.style.display = bodyOpen ? 'block' : 'none';
        hdrEl.querySelector('.g-chev').style.transform = bodyOpen ? 'rotate(180deg)' : '';
        if (bodyOpen && !bodyEl.hasChildNodes()) {
          grpEntries.forEach(entry => {
            const rowEl = buildRow(entry);
            bodyEl.appendChild(rowEl);
          });
        }
      };

      hdrEl.addEventListener('click', toggleGrp);

      if (single) {
        hdrEl.querySelector('.g-copy-btn')?.addEventListener('click', e => {
          e.stopPropagation();
          navigator.clipboard.writeText(grpEntries[0].password||'').then(()=>showToast('✓ Password copied!'));
        });
        hdrEl.querySelector('.g-edit-btn')?.addEventListener('click', e => {
          e.stopPropagation();
          openAddPanel(grpEntries[0]);
        });
      }

      const gChk = hdrEl.querySelector('.g-chk');
      gChk.style.display = selectMode ? '' : 'none';
      gChk.addEventListener('change', ev => {
        ev.stopPropagation();
        grpEntries.forEach(en => { if (gChk.checked) selectedIds.add(en.id); else selectedIds.delete(en.id); });
        updateSelBar();
        renderAll();
      });

      grpEl.appendChild(hdrEl);
      grpEl.appendChild(bodyEl);
      frag.appendChild(grpEl);
    }

    list.appendChild(frag);
    dIdx = end;
    if (dIdx < domains.length) requestAnimationFrame(renderNextGroups);
  }
  renderNextGroups();
}

// ── Flat View ──
function renderFlat() {
  const list = document.getElementById('entryList');
  displayEntries.forEach(entry => {
    list.appendChild(buildRow(entry));
  });
}

// ── Build Single Row ──
function buildRow(entry) {
  const str = getStrength(entry.password);
  const breach = isBreach(entry.password);
  const color = avatarColor(entry.title || entry.url || entry.id);
  const letter = ((entry.title||entry.url||'P')[0]).toUpperCase();
  const isSel = selectedIds.has(entry.id);

  const strBadge = str === 'strong'
    ? '<span style="font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;background:rgba(34,211,165,0.15);color:#22d3a5;">Strong</span>'
    : str === 'medium'
    ? '<span style="font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;background:rgba(251,191,36,0.15);color:#fbbf24;">Med</span>'
    : '<span style="font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;background:rgba(239,68,68,0.15);color:#f87171;">Weak</span>';

  const rowEl = document.createElement('div');
  rowEl.className = 'entry' + (isSel ? ' sel-on' : '');
  rowEl.dataset.id = entry.id;
  rowEl.style.cssText = 'border-bottom:1px solid var(--border);position:relative;';
  if (isSel) rowEl.style.background = 'rgba(192,132,252,0.08)';

  rowEl.innerHTML = `
    <input type="checkbox" class="row-chk" style="display:${selectMode?'':'none'};cursor:pointer;flex-shrink:0;" ${isSel?'checked':''}>
    <div class="entry-fav" style="background:${color}">${letter}</div>
    <div class="entry-info">
      <div class="entry-title">${escHtml(entry.title||entry.url||'Untitled')}</div>
      <div class="entry-user">${escHtml(entry.username||'—')}</div>
    </div>
    <div style="display:flex;align-items:center;gap:3px;">
      ${breach?'<span style="font-size:9px;color:#f87171;">⚠</span>':''}
      ${strBadge}
      ${entry.mobile?'<button class="mini-btn cp-mobile" title="Copy mobile">📱</button>':''}
      <button class="mini-btn cp-pass" title="Copy password">📋</button>
      <button class="mini-btn cp-edit" title="Edit">✏️</button>
      <button class="mini-btn cp-del" title="Delete" style="color:#f87171;">🗑</button>
    </div>`;

  const rowChk = rowEl.querySelector('.row-chk');
  rowChk.addEventListener('change', ev => {
    ev.stopPropagation();
    if (rowChk.checked) selectedIds.add(entry.id); else selectedIds.delete(entry.id);
    rowEl.classList.toggle('sel-on', rowChk.checked);
    rowEl.style.background = rowChk.checked ? 'rgba(192,132,252,0.08)' : '';
    updateSelBar();
  });

  rowEl.addEventListener('click', e => {
    if (selectMode) {
      if (e.target !== rowChk) { rowChk.checked = !rowChk.checked; rowChk.dispatchEvent(new Event('change')); }
      return;
    }
    if (e.target.closest('.mini-btn')) return;
    openDetail(entry.id);
  });

  rowEl.querySelector('.cp-pass').addEventListener('click', e => {
    e.stopPropagation();
    navigator.clipboard.writeText(entry.password||'').then(()=>showToast('✓ Password copied!'));
  });
  const mob = rowEl.querySelector('.cp-mobile');
  if (mob) mob.addEventListener('click', e => { e.stopPropagation(); navigator.clipboard.writeText(entry.mobile||'').then(()=>showToast('✓ Mobile copied!')); });
  rowEl.querySelector('.cp-edit').addEventListener('click', e => { e.stopPropagation(); openAddPanel(entry); });
  rowEl.querySelector('.cp-del').addEventListener('click', e => { e.stopPropagation(); openDeleteConfirm(entry.id); });

  return rowEl;
}

function renderEntries(query = '') {
  if (currentTab === 'bookmarks') {
    // Bookmark view stays same
    chrome.bookmarks.getTree(async (bookmarkNodes) => {
      const allBookmarks = [];
      const flatten = (nodes) => nodes.forEach(n => {
        if (n.url) { try { allBookmarks.push({ id:'bm_'+n.id, title:n.title, url:n.url, username:new URL(n.url).hostname }); } catch(e){} }
        if (n.children) flatten(n.children);
      });
      flatten(bookmarkNodes);
      let bmFiltered = allBookmarks;
      if (query) { const q=query.toLowerCase().trim(); bmFiltered=allBookmarks.filter(b=>(b.title||'').toLowerCase().includes(q)||(b.url||'').toLowerCase().includes(q)); }
      const list = document.getElementById('entryList');
      list.innerHTML = '';
      if (!bmFiltered.length) { list.innerHTML=`<div class="empty-state"><div class="em-icon">🔖</div><p>Kuch nahi mila</p></div>`; return; }
      bmFiltered.forEach(item => {
        const el = document.createElement('div');
        el.className = 'entry bookmark-entry';
        el.dataset.url = item.url;
        const fUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(item.url)}&size=32`;
        const color = getColor(item.title);
        const letter = (item.title||'B')[0].toUpperCase();
        el.innerHTML = `<div class="entry-fav" style="background:${color}"><img src="${fUrl}" style="width:16px;height:16px" onerror="this.style.display='none';this.parentElement.textContent='${letter}'"></div><div class="entry-info"><div class="entry-title">${escHtml(item.title||item.url)}</div><div class="entry-user">${escHtml(item.username)}</div></div>`;
        el.addEventListener('click', () => chrome.tabs.create({ url: el.dataset.url }));
        list.appendChild(el);
      });
    });
    return;
  }
  applyFilterSearch(query);
}

// ── Delete Confirm ──
function openDeleteConfirm(id) {
  _pendingDeleteId = id;
  const e = entries.find(x => x.id === id);
  const desc = document.getElementById('deleteModalDesc');
  if (desc) desc.textContent = e ? `"${e.title||e.url||'Entry'}" permanently delete ho jayegi.` : 'Delete ho jayegi.';
  const dm = document.getElementById('deleteModal');
  if (dm) { dm.style.display = 'flex'; }
}
function closeDeleteConfirm() {
  _pendingDeleteId = null;
  const dm = document.getElementById('deleteModal');
  if (dm) dm.style.display = 'none';
}

// ── Bulk Select Bar ──
function updateSelBar() {
  const n = selectedIds.size;
  const sc = document.getElementById('selectCount');
  const bdb = document.getElementById('bulkDeleteBtn');
  const sac = document.getElementById('selectAllChk');
  if (sc) sc.textContent = n === 0 ? '0 selected' : n + ' selected';
  if (bdb) bdb.disabled = n === 0;
  const total = displayEntries.length;
  if (sac) { sac.indeterminate = n > 0 && n < total; sac.checked = total > 0 && n === total; }
}

function enterSelectMode() {
  selectMode = true; selectedIds.clear();
  document.body.classList.add('sel-mode');
  const bb = document.getElementById('bulkBar');
  const sm = document.getElementById('selectModeBtn');
  if (bb) bb.style.display = 'flex';
  if (sm) sm.textContent = '✕ Cancel';
  updateSelBar(); renderAll();
}
function exitSelectMode() {
  selectMode = false; selectedIds.clear();
  document.body.classList.remove('sel-mode');
  const bb = document.getElementById('bulkBar');
  const sm = document.getElementById('selectModeBtn');
  if (bb) bb.style.display = 'none';
  if (sm) sm.textContent = 'Select';
  updateSelBar(); renderAll();
}

function openDetail(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;

  const color = getColor(e.title);
  const letter = (e.title || 'V')[0].toUpperCase();
  document.getElementById('detailFavIcon').style.background = color;
  document.getElementById('detailFavIcon').textContent = letter;
  document.getElementById('detailName').textContent = e.title || 'Unknown';
  document.getElementById('detailSub').textContent = e.url || '';
  document.getElementById('detailStarBtn').textContent = e.starred ? '★' : '☆';
  document.getElementById('detailStarBtn').dataset.id = id;

  const str = e.strength || 'medium';
  const fill = { weak: 1, medium: 2, strong: 4 }[str];
  const cls = { weak: 's', medium: 'm', strong: 'g' }[str];
  const bars = Array(4).fill(0).map((_, i) => `<div class="str-seg ${i < fill ? 'filled ' + cls : ''}"></div>`).join('');

  document.getElementById('detailBody').innerHTML = `
    <div class="fg"><div class="fl">Username</div>
      <div class="fv">
        <span style="flex:1;font-size:12px">${escHtml(e.username || '')}</span>
        <button class="cp-btn" data-copy="${escHtml(e.username || '')}">📋</button>
      </div></div>
    ${e.mobile ? `<div class="fg"><div class="fl">Mobile</div>
      <div class="fv">
        <span style="flex:1;font-size:12px">${escHtml(e.mobile)}</span>
        <button class="cp-btn" data-copy="${escHtml(e.mobile)}">📋</button>
      </div></div>` : ''}
    <div class="fg"><div class="fl">Password</div>
      <div class="fv">
        <span class="pw-display" id="dpw" data-visible="0">••••••••••</span>
        <button class="cp-btn" id="dEye">👁</button>
        <button class="cp-btn" id="dCopyPw">📋</button>
      </div></div>
    <div class="fg"><div class="fl">Strength</div><div class="str-bar">${bars}</div></div>
    ${e.url ? `<div class="fg"><div class="fl">Website</div><div class="fv"><span style="flex:1;font-size:12px">${escHtml(e.url)}</span></div></div>` : ''}
    ${e.notes ? `<div class="fg"><div class="fl">Notes</div><div class="fv"><span style="flex:1;font-size:12px">${escHtml(e.notes)}</span></div></div>` : ''}
        ${e.totp ? `<div class="fg"><div class="fl">🔐 2FA Code (TOTP)</div>
      <div class="fv totp-row">
        <div class="totp-code" id="tc_${e.id}">------</div>
        <div class="totp-timer" id="tt_${e.id}" style="--pct:100%"><span id="ts_${e.id}">30</span></div>
        <button class="cp-btn" style="margin-left:auto" id="tcp_${e.id}">📋</button>
      </div></div>` : ''}
    <button class="btn-primary" id="detailEditBtn">✏️ Edit Entry</button>
    <button class="btn-danger" id="detailDeleteBtn" style="margin-top:8px;">🗑️ Delete Entry</button>`;


  let _tTimer=null;
  async function _startTotp(entryId, secret){
    async function _tick(){
      try{
        const r=await VaultTOTP.generate(secret);
        const ce=document.getElementById('tc_'+entryId);
        const se=document.getElementById('ts_'+entryId);
        const te=document.getElementById('tt_'+entryId);
        const pe=document.getElementById('tcp_'+entryId);
        if(!ce){clearInterval(_tTimer);return;}
        ce.textContent=r.code;
        if(se)se.textContent=r.remaining;
        if(te)te.style.setProperty('--pct',(r.remaining/r.period*100).toFixed(1)+'%');
        if(pe&&!pe.__b){pe.__b=true;pe.addEventListener('click',()=>{
          navigator.clipboard.writeText(r.code).then(()=>showToast('OTP copied!'));});}
      }catch{}
    }
    _tick(); _tTimer=setInterval(_tick,1000);
  }

  document.querySelectorAll('#detailBody .cp-btn[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => copyToClipboard(btn.dataset.copy));
  });
  // FIX #6: data-pw attribute hata diya — password DOM mein expose nahi hoga
  // Closure se directly e.password use karo — koi DOM attribute nahi
  document.getElementById('dEye').addEventListener('click', () => {
    const el  = document.getElementById('dpw');
    const vis = el.dataset.visible === '1';
    el.textContent     = vis ? '••••••••••' : (e.password || '');
    el.dataset.visible = vis ? '0' : '1';
    document.getElementById('dEye').textContent = vis ? '👁' : '🙈';
  });
  // Copy password button — closure se password (no data-copy attribute needed)
  const dCopyPwBtn = document.getElementById('dCopyPw');
  if (dCopyPwBtn) dCopyPwBtn.addEventListener('click', () => copyToClipboard(e.password || ''));
  if(_tTimer){clearInterval(_tTimer);_tTimer=null;}
  if(e.totp) _startTotp(e.id,e.totp);
  document.getElementById('detailEditBtn').addEventListener('click', () => {
    closePanel('detailPanel');
    openAddPanel(e);
  });
  document.getElementById('detailDeleteBtn').addEventListener('click', async () => {
    if (confirm('Delete "' + (e.title || 'Entry') + '"? This cannot be undone.')) {
      entries = entries.filter(x => x.id !== id);
      await saveEntries();
      closePanel('detailPanel');
      showToast('Entry deleted ✓');
    }
  });
  openPanel('detailPanel');
}

async function toggleStar() {
  const id = document.getElementById('detailStarBtn').dataset.id;
  const e = entries.find(x => x.id === id);
  if (!e) return;
  e.starred = !e.starred;
  e.updatedAt = Date.now();
  document.getElementById('detailStarBtn').textContent = e.starred ? '★' : '☆';
  await saveEntries();
}

function openAddPanel(entry) {
  editingId = entry ? entry.id : null;
  document.getElementById('addPanelTitle').textContent = entry ? 'Edit Login' : 'Add Login';
  document.getElementById('fTitle').value = entry ? (entry.title || '') : '';
  document.getElementById('fUrl').value = entry ? (entry.url || '') : '';
  document.getElementById('fUser').value = entry ? (entry.username || '') : '';
  document.getElementById('fMobile').value = entry ? (entry.mobile || '') : '';
  document.getElementById('fPass').value = entry ? (entry.password || '') : '';
  document.getElementById('fPass').type = 'password';
  document.getElementById('fPassToggle').textContent = '👁';
  document.getElementById('fNotes').value = entry ? (entry.notes || '') : '';
  const totpEl=document.getElementById('fTotp');
  if(totpEl){totpEl.value=entry?(entry.totp||''):''; totpEl.type='password';}
  document.getElementById('deleteEntryBtn').style.display = entry ? 'block' : 'none';
  updateAddStrength();
  openPanel('addPanel');
}

async function doSaveEntry() {
  const title = document.getElementById('fTitle').value.trim();
  const url = document.getElementById('fUrl').value.trim();
  const username = document.getElementById('fUser').value.trim();
  const mobile = document.getElementById('fMobile').value.trim();
  const password = document.getElementById('fPass').value;
  const notes = document.getElementById('fNotes').value.trim();
  const totp=(document.getElementById('fTotp')?.value||'').replace(/[\s\-]/g,'').toUpperCase()||undefined;

  if (!title) { showToast('Title required', true); return; }
  if (!password) { showToast('Password required', true); return; }

  // Check for duplicate (same URL + username)
  if (!editingId) {
    const domain = url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const duplicate = entries.find(e => {
      const eUrl = (e.url || '').toLowerCase();
      const eDomain = eUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      const sameUser = (e.username || '').toLowerCase() === username.toLowerCase();
      const sameMobile = mobile && (e.mobile || '').replace(/\D/g, '') === mobile.replace(/\D/g, '');
      return (eDomain === domain || (eUrl === url.toLowerCase() && url)) && (sameUser || sameMobile);
    });

    if (duplicate) {
      if (confirm(`"${duplicate.title}" already exists.\n\nOverwrite existing entry?`)) {
        editingId = duplicate.id;
      } else if (!confirm("Save anyway as new?")) {
        return;
      }
    }
  }

  // Check weak password
  if (settings.blockWeak && WEAK_PASSWORDS.has(password.toLowerCase())) {
    showToast('This password is too common. Choose a stronger one.', true);
    return;
  }

  const strength = calcStrength(password);
  if (settings.blockWeak && strength === 'weak' && password.length < 10) {
    if (!confirm('This password is weak. Save anyway?')) return;
  }

  const now = Date.now();

  if (editingId) {
    const idx = entries.findIndex(e => e.id === editingId);
    if (idx !== -1) entries[idx] = { ...entries[idx], title, url, username, mobile, password, notes, totp, strength, updatedAt: now };
  } else {
    entries.push({ id: genId(), title, url, username, mobile, password, notes, totp, strength, starred: false, createdAt: now, updatedAt: now });
  }

  await saveEntries();
  closePanel('addPanel');
  showToast(editingId ? 'Updated!' : 'Saved!');
  editingId = null;
}

async function doDeleteEntry() {
  if (!editingId) return;
  if (!confirm('Delete this entry?')) return;
  // RELOAD-FIRST: Storage se latest data lo, phir delete karo
  // Isse purana memory data new data overwrite nahi karega
  await loadEntries();
  entries = entries.filter(e => e.id !== editingId);
  await saveEntries();
  closePanel('addPanel');
  showToast('Deleted ✓');
  editingId = null;
}

function togglePasswordVisibility() {
  const inp = document.getElementById('fPass');
  const btn = document.getElementById('fPassToggle');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

function quickGen() {
  const pw = buildPassword(16);
  document.getElementById('fPass').value = pw;
  document.getElementById('fPass').type = 'text';
  document.getElementById('fPassToggle').textContent = '🙈';
  updateAddStrength();
}

function updateAddStrength() {
  const pw = document.getElementById('fPass').value;
  const str = calcStrength(pw);
  const fill = { weak: 1, medium: 2, strong: 4 };
  const cls = { weak: 's', medium: 'm', strong: 'g' };
  [1, 2, 3, 4].forEach(i => {
    const el = document.getElementById('as' + i);
    if (!el) return;
    el.className = 'str-seg';
    if (i <= fill[str]) el.classList.add('filled', cls[str]);
  });
}

function copyField(id, field) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  copyToClipboard(e[field]);
}

function generatePassword() {
  if (currentGenType === 'passphrase') {
    const wordCount = parseInt(document.getElementById('wordCountSlider').value);
    const separator = document.getElementById('separatorInput').value || '-';
    const pw = generatePassphrase(wordCount, separator, true, true);
    document.getElementById('passphrasePreview').textContent = pw;
  } else {
    const len = parseInt(document.getElementById('lenSlider').value);
    const prefix = (document.getElementById('prefixInput')?.value || '').toUpperCase();
    const pw = buildPassword(len, prefix);
    document.getElementById('genPreview').textContent = pw;
    updateGenStrength(pw);
    // Update prefix length info label
    const lenInfo = document.getElementById('prefixLenInfo');
    if (lenInfo) {
      const autoLen = Math.max(len - prefix.length, 4);
      lenInfo.textContent = prefix.length > 0 ? `${prefix.length} + ${autoLen}` : `0 + ${len}`;
    }
  }
}

function buildPassword(len, prefix = '') {
  let chars = '';
  const excludeSimilar = settings.excludeSimilar || false;

  if (document.getElementById('cUpper')?.classList.contains('on')) {
    chars += excludeSimilar ? 'ABCDEFGHJKLMNPQRSTUVWXYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  }
  if (document.getElementById('cLower')?.classList.contains('on')) {
    chars += excludeSimilar ? 'abcdefghjkmnpqrstuvwxyz' : 'abcdefghijklmnopqrstuvwxyz';
  }
  if (document.getElementById('cNums')?.classList.contains('on')) {
    chars += excludeSimilar ? '23456789' : '0123456789';
  }
  if (document.getElementById('cSyms')?.classList.contains('on')) {
    chars += '!@#$%^&*-_+=?';
  }

  if (!chars) chars = 'abcdefghijklmnopqrstuvwxyz0123456789!@#';

  // Prefix ke baad exactly (len - prefix.length) random chars banao
  // Min 4 random chars guarantee karo
  const autoLen = Math.max(len - prefix.length, 4);
  const arr = new Uint8Array(autoLen);
  crypto.getRandomValues(arr);
  const randomPart = Array.from(arr).map(b => chars[b % chars.length]).join('');

  return prefix + randomPart;
}

function updateGenStrength(pw) {
  const str = calcStrength(pw);
  const fill = { weak: 1, medium: 2, strong: 4 };
  const cls = { weak: 's', medium: 'm', strong: 'g' };
  [1, 2, 3, 4].forEach(i => {
    const el = document.getElementById('gs' + i);
    if (!el) return;
    el.className = 'str-seg';
    if (i <= fill[str]) el.classList.add('filled', cls[str]);
  });
}

function copyGeneratedPassword() {
  let pw;
  if (currentGenType === 'manual') {
    const inp = document.getElementById('manualPwInput');
    pw = inp ? inp.value.trim() : '';
    if (!pw) { showToast('Pehle password type karo', true); return; }
  } else if (currentGenType === 'passphrase') {
    // BUG-10 FIX: Guard against empty preview (e.g. if user switched tabs rapidly)
    pw = (document.getElementById('passphrasePreview').textContent || '').trim();
    if (!pw) { generatePassword(); pw = document.getElementById('passphrasePreview').textContent.trim(); }
  } else {
    pw = document.getElementById('genPreview').textContent;
  }
  if (pw) copyToClipboard(pw);
}

function checkSetupStrength() {
  const pw = document.getElementById('newMaster').value;
  const str = calcStrength(pw);
  const fill = { weak: 1, medium: 2, strong: 4 };
  const cls = { weak: 's', medium: 'm', strong: 'g' };
  [1, 2, 3, 4].forEach(i => {
    const el = document.getElementById('ss' + i);
    el.className = 'sb';
    if (i <= fill[str]) el.classList.add(cls[str]);
  });
  const labels = { weak: 'Weak', medium: 'Fair', strong: 'Strong ✓' };
  document.getElementById('setupStrLabel').textContent = pw ? labels[str] : '—';
}

function calcStrength(pw) {
  if (!pw) return 'weak';
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 14) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 2) return 'weak';
  if (score <= 3) return 'medium';
  return 'strong';
}

function genId() {
  return 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

const COLORS = ['#7c5cfc', '#c084fc', '#22d3a5', '#f59e0b', '#3b82f6', '#ef4444', '#10b981', '#6366f1', '#ec4899', '#14b8a6'];
function getColor(str) {
  if (!str) return COLORS[0];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  showToast('Copied!');

  // Auto-clear clipboard
  if (settings.clipboardClear > 0) {
    clearTimeout(clipboardTimer);
    clipboardTimer = setTimeout(async () => {
      try {
        await navigator.clipboard.writeText('');
      } catch { }
    }, settings.clipboardClear * 1000);
  }
}

function showToast(msg, isErr = false) {
  const t = document.getElementById('toast');
  t.textContent = (isErr ? '⚠ ' : '✓ ') + msg;
  t.style.background = isErr ? '#f87171' : '#22d3a5';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function openPanel(id) { document.getElementById(id).classList.add('open'); }
function closePanel(id) { document.getElementById(id).classList.remove('open'); }

// ⚠️ hashPassword REMOVED — replaced by VaultCrypto.hashMaster (PBKDF2 + AES-GCM)
// Old SHA-256 had no salt — vulnerable to rainbow tables. Now uses 600,000 PBKDF2 iterations.

function getStorage(key) {
  return new Promise(resolve => {
    chrome.storage.local.get([key], res => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(res[key] !== undefined ? res[key] : null);
    });
  });
}

function setStorage(key, value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

// sendMsg — SW-sleep ke liye retry built-in
// Chrome MV3 mein SW 30s baad kill hoti hai — pehle sendMessage silently null return karta tha
async function sendMsg(msg, retries = 4, delayMs = 200) {
  // ══════════════════════════════════════════════════════════
  // FAST sendMsg: Chrome alarm se SW alive rahti hai ab,
  // pehli call usually succeed hoti hai — delay kam kiya
  // ══════════════════════════════════════════════════════════
  for (let i = 0; i < retries; i++) {
    try {
      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(msg, res => {
          if (chrome.runtime.lastError) {
            const err = chrome.runtime.lastError.message || '';
            if (err.includes('receiving end does not exist') && i < retries - 1) {
              reject(new Error(err));
            } else {
              resolve(null);
            }
          } else {
            resolve(res);
          }
        });
      });
    } catch (e) {
      if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  return null;
}


// ★ FIX 4: Bookmark Import / Export Logic
function initBookmarkIO() {
  // Export as HTML
  const expHtml = document.getElementById('exportBookmarksHTML');
  if (expHtml) {
    expHtml.addEventListener('click', () => {
      chrome.bookmarks.getTree(tree => {
        const html = buildBookmarkHTML(tree);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'BABASITARAM_bookmarks_' + new Date().toISOString().slice(0,10) + '.html';
        a.click();
        URL.revokeObjectURL(url);
        showToast('📖 Bookmarks HTML export ho gaya!');
      });
    });
  }

  // Export as JSON
  const expJson = document.getElementById('exportBookmarksJSON');
  if (expJson) {
    expJson.addEventListener('click', () => {
      chrome.bookmarks.getTree(tree => {
        const json = JSON.stringify({ app: 'BABASITARAM_Vault', type: 'bookmarks', exportDate: new Date().toISOString(), tree }, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'BABASITARAM_bookmarks_' + new Date().toISOString().slice(0,10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('📦 Bookmarks JSON export ho gaya!');
      });
    });
  }

  // Import - browse click
  const bmBrowse = document.getElementById('bmBrowseLink');
  const bmInput  = document.getElementById('bmImportInput');
  if (bmBrowse && bmInput) {
    bmBrowse.addEventListener('click', () => bmInput.click());
    bmInput.addEventListener('change', e => { if (e.target.files[0]) processBmFile(e.target.files[0]); });
  }

  // Import - drag drop
  const bmDZ = document.getElementById('bmDropZone');
  if (bmDZ) {
    bmDZ.addEventListener('dragover', e => { e.preventDefault(); bmDZ.style.borderColor = '#22d3a5'; });
    bmDZ.addEventListener('dragleave', () => { bmDZ.style.borderColor = ''; });
    bmDZ.addEventListener('drop', e => {
      e.preventDefault(); bmDZ.style.borderColor = '';
      const file = e.dataTransfer.files[0];
      if (file) processBmFile(file);
    });
  }

  // Confirm import
  const confirmBm = document.getElementById('confirmBmImportBtn');
  if (confirmBm) {
    confirmBm.addEventListener('click', () => {
      if (!window._pendingBookmarks || !window._pendingBookmarks.length) return;
      let imported = 0;
      const doImport = (bms) => {
        bms.forEach(bm => {
          if (bm.url) {
            chrome.bookmarks.create({ title: bm.title || bm.url, url: bm.url }, () => imported++);
          }
          if (bm.children && bm.children.length) doImport(bm.children);
        });
      };
      doImport(window._pendingBookmarks);
      setTimeout(() => {
        showToast('✅ ' + imported + ' bookmarks import ho gaye!');
        document.getElementById('confirmBmImportBtn').style.display = 'none';
        document.getElementById('bmPreviewList').style.display = 'none';
        document.getElementById('bmImportResult').style.display = 'none';
        window._pendingBookmarks = null;
      }, 600);
    });
  }
}

function buildBookmarkHTML(nodes) {
  let html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n';
  const walk = (nodes) => {
    nodes.forEach(node => {
      if (node.url) {
        html += `    <DT><A HREF="${node.url}" ADD_DATE="${Math.floor((node.dateAdded||Date.now())/1000)}">${node.title||node.url}</A>\n`;
      } else if (node.children) {
        html += `    <DT><H3>${node.title||'Folder'}</H3>\n<DL><p>\n`;
        walk(node.children);
        html += '</DL><p>\n';
      }
    });
  };
  walk(nodes);
  html += '</DL><p>';
  return html;
}

function processBmFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    let bookmarks = [];
    try {
      if (file.name.endsWith('.json')) {
        const data = JSON.parse(text);
        bookmarks = flattenBmTree(data.tree || data);
      } else {
        // Parse HTML bookmarks
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const links = Array.from(doc.querySelectorAll('a[href]'));
        bookmarks = links.map(a => ({ title: a.textContent.trim() || a.href, url: a.href }))
                         .filter(b => b.url.startsWith('http'));
      }
    } catch(err) {
      showToast('❌ File parse error: ' + err.message, true);
      return;
    }
    window._pendingBookmarks = bookmarks;
    const res = document.getElementById('bmImportResult');
    const pre = document.getElementById('bmPreviewList');
    const btn = document.getElementById('confirmBmImportBtn');
    if (res) { res.style.display = ''; res.textContent = '📊 ' + bookmarks.length + ' bookmarks mili — preview:'; }
    if (pre) {
      pre.style.display = '';
      pre.innerHTML = bookmarks.slice(0, 8).map(b =>
        `<div style="padding:4px 6px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:11px;color:#ccc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">🔗 ${b.title}</div>`
      ).join('') + (bookmarks.length > 8 ? `<div style="padding:4px 6px;font-size:10px;color:#555;">...aur ${bookmarks.length - 8} aur</div>` : '');
    }
    if (btn) btn.style.display = bookmarks.length ? '' : 'none';
  };
  reader.readAsText(file);
}

function flattenBmTree(nodes) {
  const result = [];
  const walk = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach(n => {
      if (n.url) result.push({ title: n.title, url: n.url });
      if (n.children) walk(n.children);
    });
  };
  walk(Array.isArray(nodes) ? nodes : [nodes]);
  return result;
}

// ── Background message listener (session expire / auto-lock) ──
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SESSION_EXPIRED' || msg.type === 'AUTO_LOCKED') {
    masterPassword = null;
    showScreen('lockScreen');
    const errEl = document.getElementById('lockErr');
    if (errEl) {
      errEl.textContent = msg.type === 'AUTO_LOCKED'
        ? '⏱ Auto-lock — dobara unlock karo'
        : '⏱ Session expire ho gaya — dobara unlock karo';
    }
  }
});

// Auto-sync removed: storage.onChanged caused restore loop with stale sessions.
// Popup loads fresh on open via DOMContentLoaded.

// ═══════════════════════════════════════════════
// ── PIN UNLOCK FEATURE ──────────────────────────
// ═══════════════════════════════════════════════

let _pinBuffer = '';
const PIN_MAX = 4;

// Check on load if PIN is enabled → show PIN screen (only if NOT already unlocked)
async function initPinUnlock() {
  const pinEnabled = await getStorage('vault_pin_enabled');
  const pinHash = await getStorage('vault_pin_hash');
  if (!pinEnabled || !pinHash) return false;

  // ✅ KEY FIX: Agar vault pehle se unlocked hai (session active), PIN mat dikhao!
  const session = await sendMsg({ type: 'GET_SESSION' });
  if (session && session.ok) {
    // Session active hai — PIN ki zaroorat nahi
    const row = document.getElementById('pinUnlockRow');
    if (row) row.style.display = 'block'; // show "use PIN" button on lock screen (for future)
    return false; // Don't show PIN screen, continue normal flow
  }

  // Session nahi hai — PIN screen dikhao
  const row = document.getElementById('pinUnlockRow');
  if (row) row.style.display = 'block';

  _pinBuffer = '';
  updatePinDots();
  document.getElementById('pinErr').textContent = '';
  const statusEl = document.getElementById('pinStatusText');
  if (statusEl) statusEl.textContent = '';
  showScreen('pinScreen');
  return true;
}

// Bind PIN numpad events
function bindPinEvents() {
  // Numpad keys
  document.querySelectorAll('.pin-key[data-val]').forEach(btn => {
    btn.addEventListener('click', () => pinInput(btn.dataset.val));
  });
  document.getElementById('pinClearBtn').addEventListener('click', pinBackspace);
  document.getElementById('pinOkBtn').addEventListener('click', pinSubmit);
  document.getElementById('pinBackToPassword').addEventListener('click', () => {
    _pinBuffer = '';
    updatePinDots();
    const statusEl = document.getElementById('pinStatusText');
    if (statusEl) statusEl.textContent = '';
    document.getElementById('pinErr').textContent = '';
    showScreen('lockScreen');
  });
  document.getElementById('pinUnlockBtn').addEventListener('click', () => {
    _pinBuffer = '';
    updatePinDots();
    const statusEl = document.getElementById('pinStatusText');
    if (statusEl) statusEl.textContent = '';
    document.getElementById('pinErr').textContent = '';
    showScreen('pinScreen');
  });

  // Keyboard support on PIN screen
  document.addEventListener('keydown', e => {
    const pinActive = document.getElementById('pinScreen').classList.contains('active');
    if (!pinActive) return;
    if (e.key >= '0' && e.key <= '9') { e.preventDefault(); pinInput(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); pinBackspace(); }
    else if (e.key === 'Enter') { e.preventDefault(); pinSubmit(); }
  });
}

function pinInput(digit) {
  if (_pinBuffer.length >= PIN_MAX) return;
  _pinBuffer += digit;
  updatePinDots();
  if (_pinBuffer.length === PIN_MAX) {
    // Auto-submit when max digits entered
    setTimeout(pinSubmit, 120);
  }
}

function pinBackspace() {
  _pinBuffer = _pinBuffer.slice(0, -1);
  updatePinDots();
}

function updatePinDots() {
  for (let i = 0; i < PIN_MAX; i++) {
    const dot = document.getElementById('pd' + i);
    if (!dot) continue;
    dot.classList.toggle('filled', i < _pinBuffer.length);
  }
}

async function pinSubmit() {
  const pin = _pinBuffer;
  if (pin.length < 4) {
    document.getElementById('pinErr').textContent = 'Kam se kam 4 digits chahiye';
    return;
  }

  const encMp = await getStorage('vault_pin_enc_mp');
  if (!encMp) {
    document.getElementById('pinErr').textContent = 'PIN setup nahi hua. Password use karo.';
    return;
  }

  // ─── LOADING STATE ────────────────────────────────────────────────
  const allDots = document.querySelectorAll('.pin-dot');
  const allKeys = document.querySelectorAll('.pin-key');
  const statusEl = document.getElementById('pinStatusText');
  const errEl    = document.getElementById('pinErr');

  allDots.forEach(d => { d.classList.remove('filled'); d.classList.add('verifying'); });
  allKeys.forEach(k => k.disabled = true);
  errEl.textContent = '';
  if (statusEl) statusEl.textContent = '🔑 Verifying...';

  try {
    // ✅ SPEED FIX: Sirf EK PBKDF2 call — verifyMaster hataya
    // AES-GCM authentication tag khud verify karta hai — wrong PIN → OperationError
    // Pehle 2 calls the: verifyMaster (600k) + decrypt (600k) = 1.2M iterations → 4-5 sec freeze
    // Ab sirf 1 call: decrypt (600k) = ~800ms smooth
    const mp = await VaultCrypto.decrypt(encMp, pin + chrome.runtime.id);

    masterPassword = mp;
    await sendMsg({ type: 'SET_SESSION', masterPassword: mp });
    _pinBuffer = '';
    updatePinDots();
    if (statusEl) statusEl.textContent = '✅ Unlocked!';
    errEl.textContent = '';
    await loadEntries();
    showScreen('mainScreen');
    generatePassword();
    checkCurrentTabForAutofill();

  } catch (e) {
    // Wrong PIN → AES-GCM throws OperationError → shake animation
    allDots.forEach((d, i) => {
      setTimeout(() => {
        d.classList.remove('verifying');
        d.classList.add('shake');
        setTimeout(() => d.classList.remove('shake'), 400);
      }, i * 40);
    });
    _pinBuffer = '';
    updatePinDots();
    errEl.textContent = '❌ Galat PIN — dobara try karo';
    if (statusEl) statusEl.textContent = '';

  } finally {
    // Re-enable keys regardless of success/fail
    setTimeout(() => {
      allDots.forEach(d => d.classList.remove('verifying'));
      allKeys.forEach(k => k.disabled = false);
    }, 300);
  }
}

// Note: setupPin aur disablePin settings.js mein handle hote hain — duplicate code hataya
async function checkCurrentTabForAutofill() {
  const bar = document.getElementById('autofillBar');
  if (!bar) return;
  bar.style.display = 'none';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.startsWith('http')) return;

    const domain = (new URL(tab.url)).hostname.replace(/^www\./, '').toLowerCase();

    // FIX #9: find() ki jagah filter() — ek se zyada accounts handle karo
    const matches = entries.filter(e => {
      if (!e.url) return false;
      try {
        const d = (new URL(e.url.includes('://') ? e.url : 'https://' + e.url)).hostname.replace(/^www\./, '').toLowerCase();
        return d === domain;
      } catch { return false; }
    });

    if (matches.length > 0) {
      bar.style.display = 'flex';
      bar.dataset.entryId = matches[0].id;
      // Multiple accounts badge
      const countEl = document.getElementById('autofillCount');
      if (countEl) {
        countEl.textContent = matches.length > 1 ? matches.length + ' accounts' : (matches[0].username || '');
        countEl.title = matches.map(m => m.username || m.title).join(', ');
      }
      // Store all match ids for cycling
      bar.dataset.entryIds = matches.map(m => m.id).join(',');
      bar.dataset.entryIndex = '0';
    }
  } catch (e) {
    console.error('Autofill check error:', e);
  }
}

async function doAutofillFromBar() {
  const bar = document.getElementById('autofillBar');
  const ids = (bar.dataset.entryIds || bar.dataset.entryId || '').split(',').filter(Boolean);
  if (!ids.length) return;

  // FIX #9: Multiple accounts — index cycle karo
  let idx = parseInt(bar.dataset.entryIndex || '0', 10);
  if (isNaN(idx) || idx >= ids.length) idx = 0;
  const id = ids[idx];
  bar.dataset.entryIndex = String((idx + 1) % ids.length);

  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    await chrome.tabs.sendMessage(tab.id, {
      type:     'FILL_CREDENTIALS',
      username: entry.username || '',
      password: entry.password || '',
      submit:   settings.autoSubmit || false
    });
    const msg = ids.length > 1
      ? `Autofill: ${entry.username || entry.title} (${idx+1}/${ids.length})`
      : 'Autofill request sent!';
    showToast(msg);
    if (ids.length === 1) bar.style.display = 'none';
  } catch (e) {
    showToast('Autofill failed: Content script not ready', true);
  }
}
