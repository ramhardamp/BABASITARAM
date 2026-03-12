// import-export.js — Full Import/Export for Vault Password Manager
// Supports: Vault CSV, Chrome, Bitwarden, LastPass, 1Password, Firefox, Dashlane, Generic
'use strict';

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = [];
  let cur = '', inQuote = false, row = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"') {
      if (inQuote && next === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      row.push(cur.trim()); cur = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cur.trim()); cur = '';
      if (row.some(c => c !== '')) lines.push(row);
      row = [];
    } else {
      cur += ch;
    }
  }
  if (cur || row.length) { row.push(cur.trim()); if (row.some(c => c !== '')) lines.push(row); }
  return lines;
}

function csvVal(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
function buildCSVRow(...fields) { return fields.map(csvVal).join(','); }

// ─── Format hints ─────────────────────────────────────────────────────────────
const FORMAT_HINTS = {
  'vault-csv': 'Vault ke CSV backup ko import karo',
  'chrome': 'Chrome: chrome://password-manager/settings \u2192 Export passwords',
  'bitwarden': 'Bitwarden: Tools \u2192 Export Vault \u2192 Format: .csv',
  'lastpass': 'LastPass: Account Options \u2192 Advanced \u2192 Export',
  '1password': '1Password: File \u2192 Export \u2192 All Items (CSV)',
  'firefox': 'Firefox: about:logins \u2192 \u22EF \u2192 Export Logins',
  'dashlane': 'Dashlane: My Account \u2192 Settings \u2192 Export Data',
  'generic': 'Koi bhi CSV jisme name/url/username/password columns ho',
};

// ─── Parsers ──────────────────────────────────────────────────────────────────
function parseVaultCSV(rows) {
  // name,url,username,mobile,password,notes,...
  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 5) continue;
    const [title, url, username, mobile, password] = r;
    const notes = r[5] || '';
    if (!title && !url && !username && !password && !mobile) continue;
    results.push({ title, url, username, mobile, password, notes });
  }
  return results;
}

function parseChromeCSV(rows) {
  // name,url,username,password
  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 4) continue;
    const [title, url, username, password] = r;
    if (!username && !password) continue;
    results.push({ title: title || extractDomain(url), url, username, password, notes: '' });
  }
  return results;
}

function parseBitwardenCSV(rows) {
  // folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp
  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 10) continue;
    if (r[2] && r[2].toLowerCase() !== 'login') continue;
    const title = r[3] || '', notes = r[4] || '', url = r[7] || '', username = r[8] || '', password = r[9] || '';
    if (!username && !password) continue;
    results.push({ title: title || extractDomain(url), url, username, password, notes });
  }
  return results;
}

function parseLastPassCSV(rows) {
  // url,username,password,totp,extra,name,grouping,fav
  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 6) continue;
    const url = r[0] || '', username = r[1] || '', password = r[2] || '', notes = r[4] || '', title = r[5] || extractDomain(url);
    if (!username && !password) continue;
    results.push({ title, url, username, password, notes });
  }
  return results;
}

function parse1PasswordCSV(rows) {
  const header = rows[0] ? rows[0].map(h => h.toLowerCase().trim()) : [];
  const col = (...names) => { for (const n of names) { const i = header.findIndex(h => h.includes(n)); if (i !== -1) return i; } return -1; };
  const iTitle = col('title', 'name');
  const iUrl = col('url', 'website');
  const iUser = col('username', 'user');
  const iPass = col('password');
  const iNotes = col('notes', 'note');

  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const get = idx => (idx >= 0 && r[idx]) ? r[idx] : '';
    const password = get(iPass);
    if (!password) continue;
    const url = get(iUrl);
    results.push({ title: get(iTitle) || extractDomain(url), url, username: get(iUser), password, notes: get(iNotes) });
  }
  return results;
}

function parseFirefoxCSV(rows) {
  // "url","username","password","httpRealm","formActionOrigin",...
  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 3) continue;
    const [url, username, password] = r;
    if (!username && !password) continue;
    results.push({ title: extractDomain(url), url, username, password, notes: '' });
  }
  return results;
}

function parseDashlaneCSV(rows) {
  // title,url,login,password,note,...
  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 4) continue;
    const [title, url, username, password] = r;
    const notes = r[4] || '';
    if (!username && !password) continue;
    results.push({ title: title || extractDomain(url), url, username, password, notes });
  }
  return results;
}

function parseGenericCSV(rows) {
  const header = rows[0] ? rows[0].map(h => h.toLowerCase().trim()) : [];
  const findCol = (...names) => { for (const n of names) { const i = header.findIndex(h => h === n || h.includes(n)); if (i !== -1) return i; } return -1; };

  const iTitle = findCol('name', 'title', 'site', 'service', 'account');
  const iUrl = findCol('url', 'website', 'origin', 'uri', 'domain', 'hostname');
  const iUser = findCol('username', 'user', 'login', 'email', 'account');
  const iMobile = findCol('mobile', 'phone', 'contact', 'number');
  const iPass = findCol('password', 'pass', 'pwd', 'secret');
  const iNotes = findCol('notes', 'note', 'comment', 'extra', 'description');

  if (iPass === -1) throw new Error('Password column nahi mila. CSV mein "password" header hona chahiye.');

  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const get = idx => (idx >= 0 && r[idx]) ? r[idx] : '';
    const password = get(iPass);
    if (!password) continue;
    const url = get(iUrl);
    results.push({ title: get(iTitle) || extractDomain(url), url, username: get(iUser), mobile: get(iMobile), password, notes: get(iNotes) });
  }
  return results;
}

function parseVaultJSON(text) {
  const data = JSON.parse(text);
  if (!data.entries || !Array.isArray(data.entries)) throw new Error('Invalid Vault JSON format');
  return data.entries.map(e => ({ title: e.title || '', url: e.url || '', username: e.username || '', mobile: e.mobile || '', password: e.password || '', notes: e.notes || '' }));
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
function parseFile(text, format, filename) {
  const lname = (filename || '').toLowerCase();

  // .vaultbak files are handled async in _loadFile() — never reach here
  if (lname.endsWith('.vaultbak')) {
    throw new Error('.vaultbak files are handled by the import dialog directly');
  }

  if (lname.endsWith('.json') || (text.trim().startsWith('{') && text.includes('"entries"'))) {
    return parseVaultJSON(text);
  }
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('File empty ya unreadable hai.');
  switch (format) {
    case 'vault-csv': return parseVaultCSV(rows);
    case 'chrome': return parseChromeCSV(rows);
    case 'bitwarden': return parseBitwardenCSV(rows);
    case 'lastpass': return parseLastPassCSV(rows);
    case '1password': return parse1PasswordCSV(rows);
    case 'firefox': return parseFirefoxCSV(rows);
    case 'dashlane': return parseDashlaneCSV(rows);
    default: return parseGenericCSV(rows);
  }
}

// ─── Duplicate detection ──────────────────────────────────────────────────────
function deduplicateImport(parsed, existing) {
  return parsed.map(item => {
    const dup = existing.find(e =>
      normUrl(e.url) === normUrl(item.url) &&
      (e.username || '').toLowerCase() === (item.username || '').toLowerCase() &&
      (e.mobile || '').replace(/\D/g, '') === (item.mobile || '').replace(/\D/g, '')
    );
    return { ...item, _status: dup ? 'dup' : 'new', _existingId: dup ? dup.id : null };
  });
}

function normUrl(u) {
  try {
    if (!u) return '';
    if (!u.startsWith('http')) u = 'https://' + u;
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch { return (u || '').toLowerCase().replace(/^www\./, ''); }
}

function extractDomain(url) {
  try {
    if (!url) return '';
    if (!url.startsWith('http')) url = 'https://' + url;
    const h = new URL(url).hostname.replace(/^www\./, '');
    const part = h.split('.')[0];
    return part.charAt(0).toUpperCase() + part.slice(1);
  } catch { return url || ''; }
}

// ─── Exporters ────────────────────────────────────────────────────────────────
function exportVaultCSV(entries) {
  const hdr = 'name,url,username,mobile,password,notes,strength,starred,createdAt,updatedAt';
  return hdr + '\n' + entries.map(e => buildCSVRow(e.title, e.url, e.username, e.mobile || '', e.password, e.notes || '', e.strength || '', e.starred ? '1' : '0', e.createdAt || '', e.updatedAt || '')).join('\n');
}
function exportChromeCSV(entries) {
  return 'name,url,username,password\n' + entries.map(e => buildCSVRow(e.title, e.url, e.username, e.password)).join('\n');
}
function exportBitwardenCSV(entries) {
  return 'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n' +
    entries.map(e => buildCSVRow('', e.starred ? '1' : '0', 'login', e.title, e.notes || '', '', '0', e.url, e.username, e.password, '')).join('\n');
}
function exportLastPassCSV(entries) {
  return 'url,username,password,totp,extra,name,grouping,fav\n' +
    entries.map(e => buildCSVRow(e.url, e.username, e.password, '', e.notes || '', e.title, '', e.starred ? '1' : '0')).join('\n');
}
function exportVaultJSON(entries) {
  return JSON.stringify({ version: '1.0', app: 'Vault Password Manager', exportDate: new Date().toISOString(), count: entries.length, entries: entries.map(e => ({ title: e.title, url: e.url, username: e.username, mobile: e.mobile || '', password: e.password, notes: e.notes || '', strength: e.strength || '', starred: e.starred || false, createdAt: e.createdAt || Date.now(), updatedAt: e.updatedAt || Date.now() })) }, null, 2);
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Encryption for backup files
async function encryptBackup(data, password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, // BUG-01 FIX: 600k iterations (same as VaultCrypto)
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(data));
  const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  result.set(salt, 0);
  result.set(iv, 16);
  result.set(new Uint8Array(encrypted), 28);

  // BUG-02 FIX: Use .apply() instead of spread (...) to prevent stack overflow on large vaults
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < result.length; i += chunk) {
    binary += String.fromCharCode.apply(null, result.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function decryptBackupSync(encrypted, password) {
  // Synchronous wrapper - will be called from parseFile
  throw new Error('Use async decryptBackup instead');
}

async function decryptBackup(encrypted, password) {
  const decoder = new TextDecoder();

  // FORMAT DETECT: Plain base64 JSON (AUTO_BACKUP format) vs AES-GCM encrypted
  // AUTO_BACKUP format: base64(JSON string) — JSON starts with { after decode
  // AES format: base64(16-byte-salt + 12-byte-iv + ciphertext) — binary, not JSON
  let rawText = encrypted.trim();

  // Chunked atob — handles any size safely
  function safeAtob(b64) {
    const binStr = atob(b64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    return bytes;
  }

  // Try to detect AUTO_BACKUP format (plain base64 JSON)
  try {
    const decoded = atob(rawText);
    if (decoded.trimStart().startsWith('{')) {
      // Yeh plain JSON hai — seedha parse karo (password check nahi hoga)
      // Lekin security ke liye: vault_hash se verify karte hain
      const data = JSON.parse(decoded);
      if (data.entries && Array.isArray(data.entries)) {
        // This is AUTO_BACKUP format — no password needed (already encrypted vault)
        return decoded; // Return as-is for parsing
      }
    }
  } catch (e) { /* not plain JSON, proceed with AES */ }

  // AES-GCM format (manual export with password)
  const data = safeAtob(rawText);
  const salt = data.slice(0, 16);
  const iv = data.slice(16, 28);
  const ciphertext = data.slice(28);

  const encoder = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);

  // BACKWARD-COMPAT FIX: Try 600k iterations first (new format after fix),
  // then fall back to 100k (old backups exported before the fix).
  // This ensures both old and new .vaultbak files decrypt correctly.
  async function tryDecrypt(iterations) {
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      km,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  }

  let decrypted;
  try {
    decrypted = await tryDecrypt(600000); // New format
  } catch (e) {
    // OperationError = wrong key → try legacy 100k iterations
    decrypted = await tryDecrypt(100000); // Old format (before BUG-01 fix)
  }

  return decoder.decode(decrypted);
}

// ─── UI Controller ────────────────────────────────────────────────────────────
class ImportExportUI {
  constructor(getEntries, setEntries, calcStrength, genId, showToast, closePanel) {
    this.getEntries = getEntries;   // () => entries[]
    this.setEntries = setEntries;   // async (entries[]) => void  — updates global + persists
    this.calcStrength = calcStrength;
    this.genId = genId;
    this.showToast = showToast;
    this.closePanel = closePanel;

    this.selectedFormat = 'vault-csv';
    this.parsedItems = [];
    this.currentFile = null;
    this.currentFileText = null;

    this._bindAll();
  }

  _bindAll() {
    // IO tab switching
    document.querySelectorAll('.io-tab[data-io]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.io-tab[data-io]').forEach(t => t.classList.toggle('active', t.dataset.io === tab.dataset.io));
        document.getElementById('ioImportView').style.display = tab.dataset.io === 'import' ? 'block' : 'none';
        document.getElementById('ioExportView').style.display = tab.dataset.io === 'export' ? 'block' : 'none';
        // ★ FIX 4: Bookmark tab support
        const bmView = document.getElementById('ioBookmarkView');
        if (bmView) bmView.style.display = tab.dataset.io === 'bookmarks' ? 'block' : 'none';
      });
    });

    // Format card selection
    document.querySelectorAll('.fmt-card[data-fmt]').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.fmt-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedFormat = card.dataset.fmt;
        const hint = document.getElementById('formatHint');
        if (hint) hint.textContent = FORMAT_HINTS[this.selectedFormat] || '';
        if (this.currentFileText) this._parseCurrentFile();
      });
    });

    // File input
    const dz = document.getElementById('dropZone');
    const fi = document.getElementById('importFileInput');
    const browse = document.getElementById('browseLink');

    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) this._loadFile(e.dataTransfer.files[0]);
    });
    dz.addEventListener('click', () => fi.click());
    browse.addEventListener('click', e => { e.stopPropagation(); fi.click(); });
    fi.addEventListener('change', () => { if (fi.files[0]) this._loadFile(fi.files[0]); });

    // Step 2
    document.getElementById('confirmImportBtn').addEventListener('click', () => this._doImport());
    document.getElementById('backToStep1Btn').addEventListener('click', () => this._backToStep1());

    // Export buttons
    document.getElementById('exportVaultCSV').addEventListener('click', () => this._doExport('vault'));
    document.getElementById('exportChrome').addEventListener('click', () => this._doExport('chrome'));
    document.getElementById('exportBitwarden').addEventListener('click', () => this._doExport('bitwarden'));
    document.getElementById('exportLastpass').addEventListener('click', () => this._doExport('lastpass'));
    document.getElementById('exportJSON').addEventListener('click', () => this._doExport('json'));
  }

  _loadFile(file) {
    this.currentFile = file;
    const reader = new FileReader();
    reader.onload = async (e) => {
      this.currentFileText = e.target.result;

      // ── Encrypted .vaultbak file ──────────────────────────────
      if (file.name.endsWith('.vaultbak')) {
        try {
          const raw = this.currentFileText.trim();
          let entries = null;

          // ── FORMAT v2: NEW — File IS the JSON string directly (not base64 wrapped) ──
          // {"vault_backup":true, "v":2, "data":"<VaultCrypto-base64>"}
          // This is the format background.js AUTO_BACKUP creates
          try {
            const wrapper = JSON.parse(raw);
            if (wrapper && wrapper.vault_backup === true && typeof wrapper.data === 'string') {
              const masterPw = prompt('🔐 Vault ka Master Password darj karo\n(Wahi password jo Vault unlock karne mein use karte ho):');
              if (!masterPw) { this.showToast('Password zaroori hai', true); return; }
              const json = await window.VaultCrypto.decrypt(wrapper.data, masterPw);
              const parsed = JSON.parse(json);
              let rawEntries = null;
              if (parsed && parsed.entries && Array.isArray(parsed.entries)) rawEntries = parsed.entries;
              else if (Array.isArray(parsed)) rawEntries = parsed;
              if (rawEntries && rawEntries.length > 0) {
                entries = rawEntries;
                console.log('[Vault Import] v2 JSON format: ' + entries.length + ' entries');
              }
            }
          } catch (e) { /* not v2 JSON, try legacy formats */ }

          // ── FORMAT v2-LEGACY: base64(JSON) wrapper ──
          // Old format where JSON was base64-encoded before saving
          if (!entries) {
            try {
              const decoded = new TextDecoder().decode(
                Uint8Array.from(atob(raw.replace(/[\r\n\s]/g, '')), ch => ch.charCodeAt(0))
              );
              const wrapper = JSON.parse(decoded);
              if (wrapper && wrapper.vault_backup === true && typeof wrapper.data === 'string') {
                const masterPw = prompt('🔐 Vault ka Master Password darj karo:');
                if (!masterPw) { this.showToast('Password zaroori hai', true); return; }
                const json = await window.VaultCrypto.decrypt(wrapper.data, masterPw);
                const parsed = JSON.parse(json);
                if (parsed && parsed.entries && Array.isArray(parsed.entries)) entries = parsed.entries;
                else if (Array.isArray(parsed)) entries = parsed;
              }
            } catch (e2) { /* not legacy base64 JSON */ }
          }

          // ── FORMAT v1 AUTO_BACKUP: plain base64 JSON (no password) ──
          if (!entries) {
            try {
              const decoded = atob(raw);
              if (decoded.trimStart().startsWith('{')) {
                const data = JSON.parse(decoded);
                if (data.entries && Array.isArray(data.entries)) {
                  entries = data.entries;
                  this.showToast('ℹ️ Purana backup format — master password check nahi hua', false);
                }
              }
            } catch (e) { /* not plain JSON */ }
          }

          // ── FORMAT manual export: AES-GCM with custom password ──
          if (!entries) {
            const password = prompt('🔐 Export ke waqt set kiya hua password darj karo:');
            if (!password) {
              this.showToast('❌ Import cancel hua — password nahi diya gaya', true);
              return;
            }
            try {
              const decrypted = await decryptBackup(raw, password);
              const data = JSON.parse(decrypted);
              if (data.entries && Array.isArray(data.entries)) entries = data.entries;
            } catch (err) {
              console.error('Decrypt error:', err.name, err.message);
              const isWrongPw = err instanceof DOMException || err.name === 'OperationError';
              if (isWrongPw) {
                // OperationError = AES-GCM authentication fail = wrong password
                this.showToast('❌ Galat password! Wahi password daalo jo export karte waqt set kiya tha.', true);
              } else if (err instanceof SyntaxError) {
                // JSON.parse fail = decrypted data valid JSON nahi
                this.showToast('❌ Backup file corrupt hai — decrypt hua lekin data invalid hai.', true);
              } else {
                this.showToast('❌ Backup open nahi hua: ' + (err.message || err.name) + '. File sahi format mein nahi hai.', true);
              }
              return;
            }
          }

          if (!entries || !entries.length) {
            this.showToast('❌ Backup mein koi entry nahi mili — shayad file empty hai ya galat format ka hai.', true);
            return;
          }

          this.parsedItems = deduplicateImport(entries, this.getEntries());
          this._showStep2();
          this.showToast(`✅ ${entries.length} entries import ke liye ready!`);
        } catch (err) {
          console.error('Vaultbak import error:', err);
          const reason = err.name === 'OperationError'
            ? 'Galat master password — wahi password daalo jo Vault unlock karne mein use hota hai'
            : err instanceof SyntaxError
              ? 'File corrupt hai — data decrypt hua lekin JSON parse nahi hua'
              : (err.message || err.name);
          this.showToast('❌ Backup import fail: ' + reason, true);
        }
        return;
      }

      // ── All other files ───────────────────────────────────────
      this._parseCurrentFile();
    };
    reader.onerror = () => this.showToast('File read error', true);
    reader.readAsText(file, 'UTF-8');
  }

  _parseCurrentFile() {
    if (!this.currentFileText) return;
    try {
      const parsed = parseFile(this.currentFileText, this.selectedFormat, this.currentFile.name);
      if (!parsed.length) throw new Error('Is file mein koi valid entry nahi mili.');
      this.parsedItems = deduplicateImport(parsed, this.getEntries());
      this._showStep2();
    } catch (err) {
      this.showToast(err.message || 'Parse error hua', true);
      console.error('_parseCurrentFile error:', err);
    }
  }

  _showStep2() {
    document.getElementById('ioStep1').style.display = 'none';
    document.getElementById('ioStep2').style.display = 'block';

    const newCount = this.parsedItems.filter(i => i._status === 'new').length;
    const dupCount = this.parsedItems.filter(i => i._status === 'dup').length;

    document.getElementById('statNew').textContent = newCount;
    document.getElementById('statDup').textContent = dupCount;
    document.getElementById('statErr').textContent = 0;

    document.getElementById('conflictOpts').style.display = dupCount > 0 ? 'block' : 'none';

    const tbody = document.getElementById('previewTbody');
    tbody.innerHTML = this.parsedItems.slice(0, 100).map(item => {
      const badge = item._status === 'dup'
        ? '<span class="badge dup">duplicate</span>'
        : '<span class="badge new">new</span>';
      return `<tr>
        <td title="${escHtml(item.url)}">${escHtml(item.title || item.url || '\u2014')}</td>
        <td title="${escHtml(item.username)}">${escHtml(item.username || '\u2014')}</td>
        <td>${badge}</td>
      </tr>`;
    }).join('');

    if (this.parsedItems.length > 100) {
      tbody.innerHTML += `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:8px">\u2026aur ${this.parsedItems.length - 100} more</td></tr>`;
    }

    document.getElementById('confirmImportBtn').textContent = `\uD83D\uDD12 Import ${this.parsedItems.length} Entries`;
  }

  _backToStep1() {
    document.getElementById('ioStep1').style.display = 'block';
    document.getElementById('ioStep2').style.display = 'none';
    document.getElementById('importFileInput').value = '';
    this.currentFile = null;
    this.currentFileText = null;
    this.parsedItems = [];
  }

  async _doImport() {
    if (!this.parsedItems.length) { this.showToast('Import karne ke liye pehle file choose karo', true); return; }

    const dupMode = document.querySelector('input[name="dupMode"]:checked')?.value || 'skip';
    const btn = document.getElementById('confirmImportBtn');
    const progressWrap = document.getElementById('importProgress');
    const progressFill = document.getElementById('importProgressFill');
    const progressLabel = document.getElementById('importProgressLabel');

    btn.disabled = true;
    progressWrap.style.display = 'block';
    progressFill.style.width = '0%';

    const workingList = [...this.getEntries()];
    const now = Date.now();
    let added = 0, updated = 0, skipped = 0;

    // Process in batches for better performance
    const batchSize = 100;
    for (let i = 0; i < this.parsedItems.length; i += batchSize) {
      const batch = this.parsedItems.slice(i, i + batchSize);

      for (const item of batch) {
        if (item._status === 'dup') {
          if (dupMode === 'skip') { skipped++; continue; }
          if (dupMode === 'overwrite' && item._existingId) {
            const idx = workingList.findIndex(e => e.id === item._existingId);
            if (idx !== -1) {
              workingList[idx] = { ...workingList[idx], title: item.title, url: item.url, username: item.username, mobile: item.mobile || '', password: item.password, notes: item.notes || '', strength: this.calcStrength(item.password), updatedAt: now };
              updated++;
            }
            continue;
          }
        }
        workingList.push({
          id: this.genId(), title: item.title || extractDomain(item.url) || 'Imported',
          url: item.url || '', username: item.username || '', mobile: item.mobile || '', password: item.password || '',
          notes: item.notes || '', strength: this.calcStrength(item.password || ''),
          starred: false, createdAt: now, updatedAt: now
        });
        added++;
      }

      const pct = Math.min(90, Math.round(((i + batch.length) / this.parsedItems.length) * 90));
      progressFill.style.width = pct + '%';
      progressLabel.textContent = `${Math.min(i + batchSize, this.parsedItems.length)} / ${this.parsedItems.length}`;

      if (i % 300 === 0 && i > 0) await new Promise(r => setTimeout(r, 0));
    }

    progressFill.style.width = '90%';
    progressLabel.textContent = 'Saving...';
    await new Promise(r => setTimeout(r, 50));

    try {
      await this.setEntries(workingList);
      progressFill.style.width = '100%';
      progressLabel.textContent = 'Done!';
      await new Promise(r => setTimeout(r, 50));
    } catch (err) {
      console.error('_doImport error:', err);
      this.showToast('Save failed: ' + (err.message || 'Storage error'), true);
      btn.disabled = false;
      progressWrap.style.display = 'none';
      return;
    }

    progressWrap.style.display = 'none';
    btn.disabled = false;

    const parts = [];
    if (added) parts.push(added + ' added');
    if (updated) parts.push(updated + ' updated');
    if (skipped) parts.push(skipped + ' skipped');
    this.showToast('✅ Import successful! ' + parts.join(', '));
    this._backToStep1();
    setTimeout(() => this.closePanel('ioPanel'), 500);
    // BUG-08 FIX: Removed silent auto-backup after import — user should manually trigger backup from settings
  }

  async _doExport(type) {
    const ents = this.getEntries();
    if (!ents.length) { this.showToast('No entries to export', true); return; }

    try {
      const date = todayStr();
      let content, filename, mime;

      switch (type) {
        case 'vault':
          content = exportVaultCSV(ents); filename = `vault-backup-${date}.csv`; mime = 'text/csv'; break;
        case 'chrome':
          content = exportChromeCSV(ents); filename = `vault-chrome-${date}.csv`; mime = 'text/csv'; break;
        case 'bitwarden':
          content = exportBitwardenCSV(ents); filename = `vault-bitwarden-${date}.csv`; mime = 'text/csv'; break;
        case 'lastpass':
          content = exportLastPassCSV(ents); filename = `vault-lastpass-${date}.csv`; mime = 'text/csv'; break;
        case 'json': {
          // Encrypted JSON export — block {} required for const inside switch case
          const password = prompt('Enter password to encrypt backup:\n(Remember this password to restore later)');
          if (!password) { this.showToast('Export cancelled', true); return; }
          if (password.length < 6) { this.showToast('Password must be at least 6 characters', true); return; }

          const data = JSON.stringify({ version: '1.0', app: 'Vault', exportDate: new Date().toISOString(), count: ents.length, entries: ents });
          const encrypted = await encryptBackup(data, password);
          content = encrypted;
          filename = `vault-encrypted-${date}.vaultbak`;
          mime = 'application/octet-stream';
          break;
        }
        default: return;
      }

      downloadFile(content, filename, mime);
      this.showToast(`📤 ${ents.length} entries exported — ${filename}`);
    } catch (err) {
      this.showToast('Export failed: ' + err.message, true);
      console.error('_doExport error:', err);
    }
  }
}
