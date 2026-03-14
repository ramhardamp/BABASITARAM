// BabaSitaRam Pro Extension — Popup JS
// Origin Lock: .vaultbak sirf BabaSitaRam Pro mein khulegi

const VAULTX_SIG = 'VaultX-Proprietary-v3';
const VAULTX_ORIGIN_HASH = '7a3f9b2e1c8d4f6a';
const APP_NAME = 'BabaSitaRam Pro';

let V = { pw: [], master: '', settings: {}, fpId: null, bin: [], bioKey: null };
let unlocked = false;
let autoLockTimer = null;
let currentSite = '';
let editingId = null;
let showFavOnly = false;
let clipTimer = null;
let pendingExportFmt = null;
const pwHideTimers = {}; // auto-hide timers per card

// ═══ INIT ═══
// ═══ EVENT DELEGATION for dynamic cards ═══
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const idx = btn.dataset.idx !== undefined ? parseInt(btn.dataset.idx) : undefined;
  if (action === 'cpEl') cpEl(btn.dataset.el, btn.dataset.msg);
  else if (action === 'togShow') togShow(btn.dataset.el, idx);
  else if (action === 'cpPw') cpPw(idx);
  else if (action === 'fillPage') fillPage(idx);
  else if (action === 'editPw') openModal(idx);
  else if (action === 'togFav') toggleFav(idx);
  else if (action === 'restorePw') restorePw(idx);
  else if (action === 'permDel') permDel(idx);
});

document.addEventListener('DOMContentLoaded', async () => {
  await loadVault();
  getCurrentSite();

  if (!V.master) {
    document.getElementById('lErr').textContent = '🔑 Pehla use: koi bhi password set karo';
    document.getElementById('lErr').style.display = 'block';
    document.getElementById('lErr').style.color = 'var(--a2)';
    document.getElementById('ulBtn').textContent = '✅ Setup & Unlock';
  }
  document.getElementById('mpI').focus();

  // ── Static event bindings (replaces inline handlers) ──
  document.getElementById('mpI').addEventListener('keydown', e => { if (e.key === 'Enter') doUnlock(); });
  document.getElementById('ulBtn').addEventListener('click', doUnlock);
  document.getElementById('eyeMpI').addEventListener('click', function() { tv('mpI', this); });
  document.getElementById('lockBtn').addEventListener('click', lockVault);
  document.getElementById('autoLockSel').addEventListener('change', function() { setAutoLock(parseInt(this.value)); });
  document.getElementById('bioBtn').addEventListener('click', doBioUnlock);

  // Biometric button dikhao agar registered hai
  initBioBtn();

  // Tabs
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', function() { goTab(this.dataset.tab, this); });
  });

  // Search
  document.getElementById('srchI').addEventListener('input', function() { renderAll(this.value); });

  // Import tab
  document.getElementById('eyeImpPw').addEventListener('click', function() { tv('impPw', this); });
  document.getElementById('selFileBtn').addEventListener('click', () => document.getElementById('fImp').click());
  document.getElementById('fImp').addEventListener('change', function() { handleImp(this); });
  // Format filter buttons
  document.querySelectorAll('.fmt-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('on'));
      this.classList.add('on');
      const fmt = this.dataset.fmt;
      const accept = fmt === 'all' ? '.vaultbak,.json,.csv' : '.' + fmt;
      document.getElementById('fImp').accept = accept;
      // Show/hide password field
      document.getElementById('impPwWrap').style.display = (fmt === 'json' || fmt === 'csv') ? 'none' : '';
    });
  });

  // Generator
  document.getElementById('gOut').addEventListener('click', cpGen);
  document.getElementById('genBtn').addEventListener('click', doGen);
  document.getElementById('cpGenBtn').addEventListener('click', cpGen);
  document.getElementById('lenS').addEventListener('input', function() {
    document.getElementById('lenV').textContent = this.value;
    doGen();
  });

  // All tab toolbar
  document.getElementById('addBtn').addEventListener('click', () => openModal(null));
  document.getElementById('favFilter').addEventListener('click', function() {
    showFavOnly = !showFavOnly;
    this.classList.toggle('on', showFavOnly);
    renderAll(document.getElementById('srchI').value);
  });

  // Modal
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.getElementById('eyeMPw').addEventListener('click', function() { tv('mPw', this); });
  document.getElementById('modalSave').addEventListener('click', savePw);
  document.getElementById('modalDel').addEventListener('click', deletePw);

  // Export buttons
  document.getElementById('expVbBtn').addEventListener('click', () => openExpModal('vaultbak'));
  document.getElementById('expJsonBtn').addEventListener('click', () => exportVault('json'));
  document.getElementById('expCsvBtn').addEventListener('click', () => exportVault('csv'));
  document.getElementById('expModalClose').addEventListener('click', () => { document.getElementById('expModal').style.display = 'none'; });
  document.getElementById('expModal').addEventListener('click', e => { if (e.target.id === 'expModal') document.getElementById('expModal').style.display = 'none'; });
  document.getElementById('eyeExpPw').addEventListener('click', function() { tv('expPwI', this); });
  document.getElementById('expConfirmBtn').addEventListener('click', doExportVaultbak);
  document.getElementById('expPwI').addEventListener('keydown', e => { if (e.key === 'Enter') doExportVaultbak(); });

  // Recycle Bin
  document.getElementById('emptyBinBtn').addEventListener('click', emptyBin);

  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'g') doGen();
    if (e.key === 'Escape') closeModal();
  });
});

async function loadVault() {
  return new Promise(resolve => {
    chrome.storage.local.get('vx3', data => {
      if (data.vx3) { try { V = JSON.parse(data.vx3); } catch (e) {} }
      resolve();
    });
  });
}

function saveVault() {
  chrome.storage.local.set({ vx3: JSON.stringify(V) });
  chrome.runtime.sendMessage({ type: 'BADGE_UPDATE', count: V.pw.length }).catch(() => {});
  // Har save par auto-backup trigger karo (debounced — 2s baad)
  clearTimeout(saveVault._abTimer);
  saveVault._abTimer = setTimeout(() => autoBackup(), 2000);
}

// ═══ AUTO-BACKUP (fixed filename — overwrite) ═══
let autoBackup_running = false;
async function autoBackup() {
  if (!V.master || !V.pw.length || autoBackup_running) return;
  autoBackup_running = true;
  try {
    // V.master (hash) ko directly encryption key ki tarah use karo — no user prompt
    const meta = { app: APP_NAME, version: '3', date: new Date().toISOString(), autoBackup: true };
    const originHash = await signOrigin({ app: meta.app, version: meta.version });
    const enc = await encData({ passwords: V.pw, bin: V.bin || [], meta }, V.master);
    const content = JSON.stringify({
      app: APP_NAME, version: '3', sig: VAULTX_SIG, originHash,
      encrypted: true, vault_backup: true, autoBackup: true,
      savedAt: new Date().toISOString(), data: enc
    });
    // Fixed filename — same file overwrite hogi Downloads mein
    const blob = new Blob([content], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url,
      filename: 'bsr-auto-backup.vaultbak',
      saveAs: false,
      conflictAction: 'overwrite'   // same file overwrite karo
    }, () => {
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
  } catch (e) {
    // Silent fail — auto-backup fail hone par user ko disturb mat karo
  } finally {
    autoBackup_running = false;
  }
}

function getCurrentSite() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]?.url) {
      try {
        currentSite = new URL(tabs[0].url).hostname.replace('www.', '');
        document.getElementById('siteUrl').textContent = currentSite;
      } catch (e) {
        document.getElementById('siteUrl').textContent = 'Unknown site';
      }
    }
  });
}

// ═══ UTILS ═══
function toast(msg, type = 'ok', dur = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + type + ' show';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), dur);
}

function tv(id, btn) {
  const i = document.getElementById(id);
  i.type = i.type === 'password' ? 'text' : 'password';
  btn.textContent = i.type === 'password' ? '👁' : '🙈';
}

function esc(s) {
  return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
}

function cryptoRand(max) { return crypto.getRandomValues(new Uint32Array(1))[0] % max; }

// ═══ CRYPTO ═══
async function hashPw(pw, salt = 'vx_3_salt') {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw + salt));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(pw, salt, it = 100000) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: it, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function decData(b64, pw) {
  const raw = Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0));
  const salt = raw.slice(0, 16), iv = raw.slice(16, 28), ct = raw.slice(28);
  const iters = [100000, 600000, 10000, 5000, 2000, 1000, 1];
  const salts = ['vx_3_salt', 'vx_2_salt', 'vx_salt', ''];
  const passVariants = [pw];
  for (let s of salts) passVariants.push(await hashPw(pw, s));
  for (let p of passVariants) {
    for (let it of iters) {
      try {
        const key = await deriveKey(p, salt, it);
        const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
        return JSON.parse(new TextDecoder().decode(dec));
      } catch (e) {}
    }
  }
  throw new Error('Wrong password or corrupted file');
}

// ═══ ORIGIN LOCK VERIFY ═══
async function verifyOriginLock(obj) {
  if (obj.sig !== VAULTX_SIG) throw new Error('🚫 Yeh file VaultX ke liye nahi hai!\nKisi aur app se open nahi hogi.');
  if (!obj.originHash) throw new Error('🚫 Origin token missing — file invalid ya tampered!');
  const raw = JSON.stringify({ app: obj.app, version: obj.version });
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw + VAULTX_ORIGIN_HASH));
  const expected = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  if (obj.originHash !== expected) throw new Error('🚫 File tampered ya kisi aur app se export ki gayi!');
}

// ═══ UNLOCK ═══
let failCount = 0;
let lockUntil = 0;

async function doUnlock() {
  const pw = document.getElementById('mpI').value;
  const err = document.getElementById('lErr'), btn = document.getElementById('ulBtn');
  if (!pw) { err.textContent = '❌ Password daalo!'; err.style.display = 'block'; return; }

  // Rate limit check
  const now = Date.now();
  if (now < lockUntil) {
    const secs = Math.ceil((lockUntil - now) / 1000);
    err.textContent = `⏳ ${secs}s baad try karo`; err.style.display = 'block'; return;
  }

  // No master set — first time setup
  if (!V.master) {
    V.master = await hashPw(pw);
    saveVault();
    enterApp();
    return;
  }

  btn.disabled = true; btn.textContent = '⏳...';
  try {
    const salts = ['vx_3_salt', 'vx_2_salt', 'vx_salt', ''];
    let ok = false;
    for (let s of salts) { if (await hashPw(pw, s) === V.master) { ok = true; break; } }
    if (ok) {
      failCount = 0; lockUntil = 0;
      enterApp();
    } else {
      failCount++;
      // Exponential backoff: 3 fails=5s, 5 fails=30s, 10 fails=5min
      if (failCount >= 10) lockUntil = Date.now() + 5 * 60 * 1000;
      else if (failCount >= 5) lockUntil = Date.now() + 30 * 1000;
      else if (failCount >= 3) lockUntil = Date.now() + 5 * 1000;
      err.textContent = `❌ Galat password! (${failCount} attempt${failCount >= 3 ? ' — wait required' : ''})`;
      err.style.display = 'block';
      document.getElementById('mpI').style.border = '1px solid var(--er)';
      setTimeout(() => document.getElementById('mpI').style.border = '', 600);
    }
  } finally { btn.disabled = false; btn.textContent = '🔓 Unlock'; }
}

function enterApp() {
  unlocked = true;
  if (!V.bin) V.bin = [];
  document.getElementById('lockScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('lockBtn').style.display = 'block';
  document.getElementById('autoLockSel').style.display = 'block';
  renderFill(); renderAll(); doGen(); updateBinBadge();
  // Biometric register karo agar pehli baar unlock ho raha hai
  setTimeout(() => registerBio(), 1000);
}

function lockVault() {
  unlocked = false;
  clearTimeout(autoLockTimer); autoLockTimer = null;
  document.getElementById('lockScreen').style.display = 'block';
  document.getElementById('app').style.display = 'none';
  document.getElementById('lockBtn').style.display = 'none';
  document.getElementById('autoLockSel').style.display = 'none';
  document.getElementById('autoLockSel').value = '0';
  document.getElementById('mpI').value = '';
  document.getElementById('lErr').style.display = 'none';
  initBioBtn();
}

function setAutoLock(mins) {
  clearTimeout(autoLockTimer); autoLockTimer = null;
  if (!mins || mins <= 0) return;
  autoLockTimer = setTimeout(() => { toast('⏰ Auto-lock!', 'wn', 2000); lockVault(); }, mins * 60 * 1000);
}

// ═══ MODAL (Add/Edit) ═══
function openModal(idx) {
  editingId = idx !== null ? V.pw[idx]?.id : null;
  const p = idx !== null ? V.pw[idx] : null;
  document.getElementById('modalTitle').textContent = p ? '✏️ Password Edit करें' : '➕ Password Add करें';
  document.getElementById('mSite').value = p?.site || '';
  document.getElementById('mUser').value = p?.user || '';
  document.getElementById('mPw').value = p?.pw || '';
  document.getElementById('mUrl').value = p?.url || '';
  document.getElementById('mCat').value = p?.cat || 'Other';
  document.getElementById('mNotes').value = p?.notes || '';
  document.getElementById('mFav').checked = p?.fav || false;
  document.getElementById('modalDel').style.display = p ? '' : 'none';
  document.getElementById('modal').style.display = 'flex';
  document.getElementById('mSite').focus();
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
  editingId = null;
}

function savePw() {
  const site = document.getElementById('mSite').value.trim();
  const user = document.getElementById('mUser').value.trim();
  const pw   = document.getElementById('mPw').value;
  if (!site || !user || !pw) { toast('❌ Site, User, Password zaroori hai!', 'er'); return; }
  const entry = {
    id: editingId || uid(),
    site, user, pw,
    url: document.getElementById('mUrl').value.trim(),
    cat: document.getElementById('mCat').value,
    notes: document.getElementById('mNotes').value.trim(),
    fav: document.getElementById('mFav').checked,
    created: editingId ? (V.pw.find(p => p.id === editingId)?.created || new Date().toISOString()) : new Date().toISOString(),
    updated: new Date().toISOString()
  };
  if (editingId) {
    const i = V.pw.findIndex(p => p.id === editingId);
    if (i >= 0) V.pw[i] = entry;
  } else {
    V.pw.push(entry);
  }
  saveVault();
  renderAll(document.getElementById('srchI').value);
  renderFill();
  closeModal();
  toast(editingId ? '✅ Updated!' : '✅ Password saved!', 'ok');
}

function deletePw() {
  if (!editingId) return;
  if (!confirm('Delete this password? (Recycle Bin mein jayega)')) return;
  const i = V.pw.findIndex(p => p.id === editingId);
  if (i >= 0) {
    const entry = { ...V.pw[i], deletedAt: new Date().toISOString() };
    if (!V.bin) V.bin = [];
    V.bin.unshift(entry);
    V.pw.splice(i, 1);
  }
  saveVault();
  renderAll(document.getElementById('srchI').value);
  renderFill();
  updateBinBadge();
  closeModal();
  toast('🗑️ Bin mein gaya!', 'wn');
}

function toggleFav(idx) {
  V.pw[idx].fav = !V.pw[idx].fav;
  saveVault();
  renderAll(document.getElementById('srchI').value);
  renderFill();
}

// ═══ RECYCLE BIN ═══
function renderBin() {
  if (!V.bin) V.bin = [];
  const g = document.getElementById('binList');
  if (!V.bin.length) {
    g.innerHTML = '<div class="empty"><div class="empty-ic">🗑️</div><div class="empty-t">Bin khaali hai</div></div>';
    return;
  }
  g.innerHTML = V.bin.map((p, i) => {
    const daysAgo = Math.floor((Date.now() - new Date(p.deletedAt)) / 86400000);
    const ct = catCls[p.cat] || 'other';
    const em = catEm[p.cat] || '🔑';
    return `<div class="pwc" style="opacity:.85">
      <div class="pwc-top">
        <div class="pwc-ic fav-${ct}">${em}</div>
        <div class="pwc-site">${esc(p.site)}</div>
        <span style="font-size:8px;color:var(--t3)">${daysAgo}d ago</span>
      </div>
      <div style="font-size:10px;color:var(--t2);margin-bottom:6px">👤 ${esc(p.user)}</div>
      <div class="card-actions">
        <button class="card-act-btn" style="color:var(--ok);border-color:rgba(16,185,129,.3)" data-action="restorePw" data-idx="${i}">↩️ Restore</button>
        <button class="card-act-btn del-btn" data-action="permDel" data-idx="${i}">🗑️ Delete</button>
      </div>
    </div>`;
  }).join('');
}

function restorePw(idx) {
  if (!V.bin) return;
  const entry = { ...V.bin[idx] };
  delete entry.deletedAt;
  V.pw.push(entry);
  V.bin.splice(idx, 1);
  saveVault();
  renderBin();
  renderAll();
  renderFill();
  updateBinBadge();
  toast('↩️ Restored!', 'ok');
}

function permDel(idx) {
  if (!V.bin) return;
  if (!confirm('Permanently delete? Wapas nahi aayega!')) return;
  V.bin.splice(idx, 1);
  saveVault();
  renderBin();
  updateBinBadge();
  toast('🗑️ Permanently deleted', 'er');
}

function emptyBin() {
  if (!V.bin || !V.bin.length) { toast('Bin already khaali hai', 'wn'); return; }
  if (!confirm(`${V.bin.length} passwords permanently delete honge!`)) return;
  V.bin = [];
  saveVault();
  renderBin();
  updateBinBadge();
  toast('🧹 Bin empty!', 'wn');
}

function updateBinBadge() {
  const tab = document.querySelector('[data-tab="bin"]');
  if (!tab) return;
  const count = V.bin?.length || 0;
  tab.textContent = count > 0 ? `🗑️ Bin (${count})` : '🗑️ Bin';
}

// ═══ EXPORT ═══
function openExpModal(fmt) {
  if (!V.pw.length) { toast('❌ Koi password nahi!', 'er'); return; }
  pendingExportFmt = fmt;
  document.getElementById('expPwI').value = '';
  document.getElementById('expModal').style.display = 'flex';
  document.getElementById('expPwI').focus();
}

async function doExportVaultbak() {
  const pw = document.getElementById('expPwI').value;
  if (!pw) { toast('❌ Password daalo!', 'er'); return; }
  const salts = ['vx_3_salt', 'vx_2_salt', 'vx_salt', ''];
  let ok = false;
  for (let s of salts) { if (await hashPw(pw, s) === V.master) { ok = true; break; } }
  if (!ok) { toast('❌ Galat Master Password!', 'er'); return; }
  document.getElementById('expModal').style.display = 'none';
  toast('⏳ Encrypting...', 'ok');
  try {
    const meta = { app: APP_NAME, version: '3', date: new Date().toISOString() };
    const originHash = await signOrigin({ app: meta.app, version: meta.version });
    const enc = await encData({ passwords: V.pw, meta }, pw);
    const content = JSON.stringify({ app: APP_NAME, version: '3', sig: VAULTX_SIG, originHash, encrypted: true, vault_backup: true, data: enc });
    dlFile(content, 'bsr-backup-' + new Date().toISOString().slice(0,10) + '.vaultbak', 'application/octet-stream');
    toast('🔐 .vaultbak exported!', 'ok');
  } catch (e) { toast('❌ Encryption failed: ' + e.message, 'er'); }
}

async function exportVault(fmt) {
  if (!V.pw.length) { toast('❌ Koi password nahi!', 'er'); return; }
  if (fmt === 'json') {
    const data = JSON.stringify({ app: APP_NAME, version: '3', exported: new Date().toISOString(), passwords: V.pw }, null, 2);
    dlFile(data, 'bsr-export-' + new Date().toISOString().slice(0,10) + '.json', 'application/json');
    toast('📋 .json exported!', 'ok');
  } else if (fmt === 'csv') {
    const hdr = 'name,url,username,password,notes,category\n';
    const rows = V.pw.map(p => `"${esc2(p.site)}","${esc2(p.url)}","${esc2(p.user)}","${esc2(p.pw)}","${esc2(p.notes)}","${esc2(p.cat)}"`).join('\n');
    dlFile(hdr + rows, 'bsr-export-' + new Date().toISOString().slice(0,10) + '.csv', 'text/csv');
    toast('📊 .csv exported!', 'ok');
  }
}

function dlFile(content, name, mime) {
  try {
    // Force correct mime so browser doesn't rename .vaultbak → .json
    const safeMime = name.endsWith('.vaultbak') ? 'application/octet-stream' : mime;
    const blob = new Blob([content], { type: safeMime });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: name, saveAs: false, conflictAction: 'uniquify' }, () => {
      if (chrome.runtime.lastError) {
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
  } catch (e) { toast('❌ Download failed: ' + e.message, 'er'); }
}

function esc2(s) { return s ? String(s).replace(/"/g, '""') : ''; }

async function signOrigin(data) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data) + VAULTX_ORIGIN_HASH));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,32);
}

async function encData(data, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(pw, salt);
  const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  const buf  = new Uint8Array(16 + 12 + ct.byteLength);
  buf.set(salt, 0); buf.set(iv, 16); buf.set(new Uint8Array(ct), 28);
  let bin = ''; buf.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}

// ═══ TABS ═══
function goTab(name, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('pg' + name.charAt(0).toUpperCase() + name.slice(1)).classList.add('on');
  if (name === 'fill') renderFill();
  if (name === 'all') renderAll();
  if (name === 'gen') doGen();
  if (name === 'bin') renderBin();
}

// ═══ STRENGTH ═══
function strSc(pw) {
  if (!pw) return { s: 0, l: '', c: '#ef4444', lv: 0 };
  let sc = 0;
  if (pw.length >= 8) sc++; if (pw.length >= 12) sc++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) sc++;
  if (/[0-9]/.test(pw)) sc++;
  if (/[^a-zA-Z0-9]/.test(pw)) sc++;
  const lv = Math.min(3, Math.floor(sc * 3 / 5));
  return { s: lv + 1, l: ['Weak', 'Fair', 'Good', 'Strong'][lv], c: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'][lv], lv };
}

const catEm = { Social: '💬', Banking: '🏦', Email: '📧', Work: '💼', Shopping: '🛒', Games: '🎮', Other: '📁' };
const catCls = { Social: 'social', Banking: 'banking', Email: 'email', Work: 'work', Shopping: 'shopping', Games: 'games', Other: 'other' };

function pwCard(p, showFill = false) {
  const { l, c } = strSc(p.pw);
  const ct = catCls[p.cat] || 'other';
  const em = catEm[p.cat] || '🔑';
  const idx = V.pw.findIndex(x => x.id === p.id);
  const favCls = p.fav ? 'fav-on' : '';
  return `<div class="pwc">
    <div class="pwc-top">
      <div class="pwc-ic fav-${ct}">${em}</div>
      <div class="pwc-site">${esc(p.site)}${p.fav ? ' ⭐' : ''}</div>
      <span class="pwc-cat cat-${ct}">${esc(p.cat)}</span>
    </div>
    <div class="pwc-row">
      <span class="pwc-lbl">👤</span>
      <span class="pwc-val" id="eu_${idx}">${esc(p.user)}</span>
      <button class="cp-btn" data-action="cpEl" data-el="eu_${idx}" data-msg="User copied!">📋</button>
    </div>
    <div class="pwc-row">
      <span class="pwc-lbl">🔑</span>
      <span class="pwc-val hide" id="ep_${idx}">••••••••••</span>
      <button class="cp-btn" data-action="togShow" data-el="ep_${idx}" data-idx="${idx}">👁</button>
      <button class="cp-btn" data-action="cpPw" data-idx="${idx}">📋</button>
    </div>
    <div class="str-bar"><div class="str-fill" style="width:${strSc(p.pw).s*20}%;background:${c}"></div></div>
    <div class="str-lbl" style="color:${c}">${l}</div>
    ${p.notes ? `<div class="pwc-notes">📝 ${esc(p.notes)}</div>` : ''}
    <div class="card-actions">
      <button class="card-act-btn ${favCls}" data-action="togFav" data-idx="${idx}">${p.fav ? '⭐' : '☆'} Fav</button>
      <button class="card-act-btn" data-action="editPw" data-idx="${idx}">✏️ Edit</button>
      ${showFill ? `<button class="card-act-btn" data-action="fillPage" data-idx="${idx}">🤖 Fill</button>` : ''}
    </div>
  </div>`;
}

// ═══ AUTOFILL TAB ═══
function renderFill() {
  const g = document.getElementById('fillList');
  if (!currentSite) { g.innerHTML = '<div class="empty"><div class="empty-ic">🌐</div><div class="empty-t">Site detect नहीं हुई</div></div>'; return; }
  const matches = V.pw.filter(p =>
    p.site.toLowerCase().includes(currentSite) ||
    currentSite.includes(p.site.toLowerCase()) ||
    (p.url && p.url.includes(currentSite))
  );
  g.innerHTML = matches.length
    ? matches.map(p => pwCard(p, true)).join('')
    : `<div class="empty"><div class="empty-ic">🔍</div><div class="empty-t">${esc(currentSite)} ke liye koi password nahi</div><div style="font-size:10px;color:var(--t2);margin-top:4px">All tab mein dekhen</div></div>`;
}

// ═══ ALL PASSWORDS TAB ═══
function renderAll(q = '') {
  const g = document.getElementById('allList');
  let pws = [...V.pw];
  if (showFavOnly) pws = pws.filter(p => p.fav);
  if (q) { const ql = q.toLowerCase(); pws = pws.filter(p => p.site.toLowerCase().includes(ql) || p.user.toLowerCase().includes(ql)); }
  pws.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || a.site.localeCompare(b.site));
  g.innerHTML = pws.length ? pws.map(p => pwCard(p, false)).join('') : '<div class="empty"><div class="empty-ic">🔒</div><div class="empty-t">' + (showFavOnly ? 'Koi favorite nahi' : 'Koi password nahi') + '</div></div>';
}

// ═══ CARD ACTIONS ═══
function togShow(elId, idx) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (el.classList.contains('hide')) {
    el.textContent = V.pw[idx].pw;
    el.classList.remove('hide');
    // Auto-hide after 15s
    clearTimeout(pwHideTimers[idx]);
    pwHideTimers[idx] = setTimeout(() => {
      el.textContent = '••••••••••';
      el.classList.add('hide');
    }, 15000);
  } else {
    clearTimeout(pwHideTimers[idx]);
    el.textContent = '••••••••••';
    el.classList.add('hide');
  }
}

function cpEl(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => toast('📋 ' + msg));
}

function cpPw(idx) {
  navigator.clipboard.writeText(V.pw[idx].pw).then(() => {
    toast('📋 Password copied! (30s mein clear)');
    clearTimeout(clipTimer);
    clipTimer = setTimeout(() => navigator.clipboard.writeText(''), 30000);
  });
}

function fillPage(idx) {
  const p = V.pw[idx];
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (user, pw) => {
        const setVal = (el, v) => {
          const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (s) s.call(el, v); else el.value = v;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const pwF = document.querySelector('input[type="password"]');
        if (pwF) setVal(pwF, pw);
        const form = pwF?.closest('form') || pwF?.parentElement;
        const uF = form?.querySelector('input[type="email"],input[type="text"],input[name*="user"],input[name*="email"]');
        if (uF) setVal(uF, user);
      },
      args: [p.user, p.pw]
    });
    toast('✅ ' + p.site + ' filled!');
  });
}

// ═══ IMPORT (ALL FORMATS) ═══
async function handleImp(input) {
  const file = input.files[0]; if (!file) return;
  const pw = document.getElementById('impPw').value;
  const warn = document.getElementById('impWarn');
  const result = document.getElementById('impResult');
  warn.style.display = 'none'; result.style.display = 'none';

  try {
    const text = await file.text();
    const ext = file.name.split('.').pop().toLowerCase();
    let passwords = [];

    if (ext === 'vaultbak') {
      passwords = await parseVB(text, pw);
    } else if (ext === 'json') {
      passwords = parseJ(text);
    } else if (ext === 'csv') {
      passwords = parseC(text);
    } else {
      // Auto-detect
      try { passwords = await parseVB(text, pw); } catch {
        try { passwords = parseJ(text); } catch {
          passwords = parseC(text);
        }
      }
    }

    if (!passwords.length) throw new Error('Koi password nahi mila file mein');

    const existing = new Set(V.pw.map(p => p.id));
    let added = 0;
    passwords.forEach(p => { if (!existing.has(p.id)) { V.pw.push(p); added++; } });
    saveVault();
    renderAll(); renderFill();
    result.textContent = '✅ ' + added + ' passwords imported! (' + passwords.length + ' total found)';
    result.style.display = 'block';
    toast('✅ ' + added + ' imported!', 'ok');
  } catch (e) {
    warn.textContent = '❌ ' + e.message;
    warn.style.display = 'block';
  }
  input.value = '';
}

async function parseVB(text, pw) {
  let obj; try { obj = JSON.parse(text); } catch { throw new Error('Invalid file format'); }
  if ((obj.encrypted || obj.vault_backup) && obj.data) {
    if (obj.sig || obj.originHash) await verifyOriginLock(obj);
    // Auto-backup file: agar pw nahi diya toh V.master se try karo
    const decPw = pw || (obj.autoBackup ? V.master : null);
    if (!decPw) throw new Error('🔑 .vaultbak ke liye Master Password zaroori hai');
    const dec = await decData(obj.data, decPw);
    const list = findList(dec);
    if (!list) throw new Error('Decrypted data mein koi password nahi');
    return list.map(normP);
  }
  const list = findList(obj);
  if (!list) throw new Error('Unknown backup format');
  return list.map(normP);
}

function parseJ(text) {
  const obj = JSON.parse(text);
  // Bitwarden format
  if (obj.items) return obj.items.filter(i => i.type === 1).map(i => normP({
    site: i.name, user: i.login?.username, pw: i.login?.password,
    url: i.login?.uris?.[0]?.uri, notes: i.notes, fav: i.favorite
  }));
  if (obj.passwords) return obj.passwords.map(normP);
  if (Array.isArray(obj)) return obj.map(normP);
  // Try finding any array
  const list = findList(obj);
  if (list) return list.map(normP);
  throw new Error('Unknown JSON format');
}

function parseC(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('Empty CSV');
  const hdr = lines[0].toLowerCase().replace(/"/g, '').split(',');
  const fi = keys => keys.reduce((f, k) => { const i = hdr.findIndex(h => h.includes(k)); return i >= 0 ? i : f; }, -1);
  const si = fi(['name','title','site']), ui = fi(['username','user','email','login']),
        pi = fi(['password','pass']), uri = fi(['url','uri','link']), ni = fi(['notes','note']);
  const res = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = csvLine(lines[i]); if (!cols.length) continue;
    const site = cols[si >= 0 ? si : 0] || '';
    const user = cols[ui >= 0 ? ui : 2] || '';
    const pw   = cols[pi >= 0 ? pi : 3] || '';
    if (!site && !user && !pw) continue;
    res.push(normP({ site, user, pw, url: uri >= 0 ? cols[uri] : '', notes: ni >= 0 ? cols[ni] : '' }));
  }
  return res;
}

function findList(o) {
  if (!o || typeof o !== 'object') return null;
  if (Array.isArray(o) && o.length) return o;
  for (let k of ['passwords','items','entries','data','list','vault']) {
    if (o[k] && Array.isArray(o[k]) && o[k].length) return o[k];
  }
  return null;
}

function normP(p) {
  return { id: p.id || uid(), site: p.site || p.name || p.title || '', user: p.user || p.username || p.email || p.login || '', pw: p.pw || p.password || p.pass || '', url: p.url || p.uri || '', cat: p.cat || p.category || 'Other', notes: p.notes || p.note || '', fav: p.fav || p.favorite || false, created: p.created || new Date().toISOString(), updated: p.updated || new Date().toISOString() };
}

function csvLine(line) {
  const r = []; let c = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { c += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { r.push(c.trim()); c = ''; }
    else c += ch;
  }
  r.push(c.trim()); return r;
}

// ═══ GENERATOR ═══
function doGen() {
  const len = parseInt(document.getElementById('lenS').value);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
  let pw = '';
  for (let i = 0; i < len; i++) pw += chars[cryptoRand(chars.length)];
  const o = document.getElementById('gOut');
  o.textContent = pw;
  o.style.color = strSc(pw).c;
}

function cpGen() {
  const pw = document.getElementById('gOut').textContent;
  if (!pw || pw === 'Click Generate!') return;
  navigator.clipboard.writeText(pw).then(() => toast('📋 Copied!'));
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ═══ BIOMETRIC (WebAuthn) ═══
// Check karo agar browser WebAuthn support karta hai
function bioSupported() {
  return !!(window.PublicKeyCredential && navigator.credentials);
}

// Lock screen par biometric button dikhao/chhupao
async function initBioBtn() {
  const btn = document.getElementById('bioBtn');
  const hint = document.getElementById('bioHint');
  if (!bioSupported()) {
    hint.textContent = '⚠️ Biometric is browser mein supported nahi';
    return;
  }
  // Agar credential registered hai toh button dikhao
  if (V.bioCredId) {
    btn.style.display = 'block';
    hint.textContent = '👍 Fingerprint/Face se unlock karo ya Master Password use karo';
  } else if (V.master) {
    // Master set hai but bio not registered — hint dikhao
    hint.textContent = '💡 Pehli baar unlock karo, phir biometric setup hoga';
  }
}

// Master password se unlock hone ke baad biometric register karo (ek baar)
async function registerBio() {
  if (!bioSupported() || V.bioCredId) return;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = new TextEncoder().encode(V.master.slice(0, 16).padEnd(16, '0'));
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: APP_NAME, id: location.hostname || 'localhost' },
        user: { id: userId, name: 'vault-user', displayName: 'BabaSitaRam User' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // sirf device ka built-in (fingerprint/face)
          userVerification: 'required',
          requireResidentKey: false
        },
        timeout: 60000,
        attestation: 'none'
      }
    });
    // Credential ID store karo
    V.bioCredId = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
    saveVault();
    document.getElementById('bioBtn').style.display = 'block';
    document.getElementById('bioHint').textContent = '✅ Biometric registered! Agli baar fingerprint/face se unlock hoga';
    toast('🫆 Biometric setup ho gaya!', 'ok', 3000);
  } catch (e) {
    // User ne cancel kiya ya device support nahi karta — silently ignore
    if (e.name !== 'NotAllowedError') console.log('Bio register:', e.message);
  }
}

// Biometric se unlock karo
async function doBioUnlock() {
  if (!bioSupported() || !V.bioCredId) return;
  const btn = document.getElementById('bioBtn');
  const err = document.getElementById('lErr');
  btn.disabled = true;
  btn.textContent = '⏳ Verifying...';
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const rawId = Uint8Array.from(atob(V.bioCredId), c => c.charCodeAt(0));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: 'public-key', id: rawId, transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000
      }
    });
    if (assertion) {
      failCount = 0; lockUntil = 0;
      enterApp();
      toast('🫆 Biometric unlock successful!', 'ok');
    }
  } catch (e) {
    if (e.name === 'NotAllowedError') {
      err.textContent = '❌ Biometric cancelled ya failed. Master Password use karo.';
    } else {
      err.textContent = '❌ Biometric error: ' + e.message;
    }
    err.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '🫆 Fingerprint / Face Unlock';
  }
}
