// setup.js - First-time Setup Wizard
'use strict';

let importedEntries = [];
let hasVaultbak = false;

// ─── AES-GCM Decrypt ─────────────────────────────────────────────────────────
async function decryptBackup(encrypted, password) {
  const decoder = new TextDecoder();
  let binaryStr;
  try { binaryStr = atob(encrypted.trim()); }
  catch(e) { throw new Error('Invalid backup file — base64 decode failed'); }

  const data       = Uint8Array.from(binaryStr, c => c.charCodeAt(0));
  const salt       = data.slice(0, 16);
  const iv         = data.slice(16, 28);
  const ciphertext = data.slice(28);

  const encoder     = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' },
    keyMaterial, { name:'AES-GCM', length:256 }, false, ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, ciphertext);
  return decoder.decode(decrypted);
}

// ─── Password Strength ────────────────────────────────────────────────────────
function calcStrength(pw) {
  if (!pw) return { score:0, label:'', color:'' };
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 14) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  if (s <= 1) return { score:s, label:'Bahut kamzor', color:'#f87171' };
  if (s <= 2) return { score:s, label:'Kamzor',       color:'#fb923c' };
  if (s <= 3) return { score:s, label:'Theek hai',    color:'#fbbf24' };
  if (s <= 4) return { score:s, label:'Achha',        color:'#34d399' };
  return             { score:s, label:'Bahut mazboot', color:'#22d3a5' };
}

// ─── CSV Parser (robust, handles quotes) ─────────────────────────────────────
function parseCSV(text) {
  const lines = [];
  let cur = '', inQ = false, row = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], nx = text[i+1];
    if (ch === '"') {
      if (inQ && nx === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      row.push(cur.trim()); cur = '';
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && nx === '\n') i++;
      row.push(cur.trim()); cur = '';
      if (row.some(c => c !== '')) lines.push(row);
      row = [];
    } else { cur += ch; }
  }
  if (cur || row.length) { row.push(cur.trim()); if (row.some(c=>c!=='')) lines.push(row); }
  return lines;
}

function colOf(header, ...names) {
  for (const n of names) {
    const i = header.findIndex(h => h === n || h.includes(n));
    if (i !== -1) return i;
  }
  return -1;
}

function extractDomain(url) {
  try {
    if (!url) return '';
    if (!url.startsWith('http')) url = 'https://' + url;
    const h = new URL(url).hostname.replace(/^www\./, '');
    const p = h.split('.')[0];
    return p.charAt(0).toUpperCase() + p.slice(1);
  } catch { return url || ''; }
}

function norm(e) {
  return {
    title:    (e.title    || '').trim(),
    url:      (e.url      || '').trim(),
    username: (e.username || '').trim(),
    password: (e.password || '').trim(),
    notes:    (e.notes    || '').trim()
  };
}

// ─── Format Detectors ─────────────────────────────────────────────────────────

function tryVaultJSON(text) {
  const d = JSON.parse(text);
  if (d.entries && Array.isArray(d.entries)) return d.entries.map(norm);
  throw new Error('No entries array');
}

function tryGenericJSON(text) {
  const d = JSON.parse(text);
  // Array of objects directly
  if (Array.isArray(d)) {
    return d.filter(e => e.password || e.pass || e.pwd).map(e => norm({
      title:    e.title || e.name || e.site || '',
      url:      e.url || e.website || e.origin || '',
      username: e.username || e.user || e.login || e.email || '',
      password: e.password || e.pass || e.pwd || '',
      notes:    e.notes || e.note || ''
    }));
  }
  throw new Error('Not array');
}

function tryChrome(rows) {
  // name,url,username,password (Chrome exported CSV)
  const h = rows[0].map(x => x.toLowerCase().replace(/"/g,'').trim());
  // Must have either url or password column
  const hasPw  = h.some(x => x==='password'||x==='pass');
  const hasUrl = h.some(x => x==='url'||x==='website'||x==='web_site');
  if (!h.includes('name') && !hasUrl && !hasPw) throw new Error('Not Chrome');
  if (!hasPw) throw new Error('No password column found');
  const iN=colOf(h,'name'), iU2=colOf(h,'url','website','web_site'),
        iUser=colOf(h,'username','login','user'), iPw=colOf(h,'password','pass');
  if (iPw===-1) throw new Error('No password col');
  return rows.slice(1).filter(r=>r[iPw]).map(r=>norm({
    title: r[iN]||extractDomain(r[iU2]),
    url: r[iU2]||'', username: r[iUser]||'', password: r[iPw]||''
  }));
}

// Google Passwords export (passwords.google.com) — Name, URL, Username, Password
function tryGooglePasswords(rows) {
  const h = rows[0].map(x => x.toLowerCase().replace(/"/g,'').trim());
  // Google format has exactly: name, url, username, password (sometimes with "note")
  const hasName = h.includes('name'), hasUrl = h.includes('url'),
        hasUser = h.includes('username'), hasPw = h.includes('password');
  if (!hasUrl || !hasPw) throw new Error('Not Google Passwords');
  const iN=h.indexOf('name'), iU=h.indexOf('url'),
        iUser=h.indexOf('username'), iPw=h.indexOf('password'), iNote=h.indexOf('note');
  return rows.slice(1).filter(r=>r[iPw]).map(r=>norm({
    title: (iN>=0?r[iN]:'')||extractDomain(r[iU]||''),
    url: r[iU]||'', username: iUser>=0?r[iUser]||'':'', 
    password: r[iPw]||'', notes: iNote>=0?r[iNote]||'':''
  }));
}

function tryBitwarden(rows) {
  // folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,...
  const h = rows[0].map(x => x.toLowerCase());
  if (!h.includes('login_password') && !h.includes('login_username')) throw new Error('Not Bitwarden');
  const iType = colOf(h,'type'), iName = colOf(h,'name'), iNotes = colOf(h,'notes');
  const iUrl  = colOf(h,'login_uri'), iUser = colOf(h,'login_username'), iPw = colOf(h,'login_password');
  return rows.slice(1)
    .filter(r => (!iType || !r[iType] || r[iType].toLowerCase() === 'login') && r[iPw])
    .map(r => norm({ title: r[iName]||'', url: r[iUrl]||'', username: r[iUser]||'', password: r[iPw]||'', notes: r[iNotes]||'' }));
}

function tryLastPass(rows) {
  // url,username,password,totp,extra,name,...
  const h = rows[0].map(x => x.toLowerCase());
  if (!h.includes('extra') && !h.includes('grouping') && !h.includes('totp')) throw new Error('Not LastPass');
  const iUrl  = colOf(h,'url'), iUser = colOf(h,'username'), iPw = colOf(h,'password');
  const iName = colOf(h,'name'), iNotes = colOf(h,'extra','note');
  return rows.slice(1).filter(r => r[iPw]).map(r => norm({
    title: r[iName] || extractDomain(r[iUrl]),
    url: r[iUrl]||'', username: r[iUser]||'', password: r[iPw]||'', notes: r[iNotes]||''
  }));
}

function try1Password(rows) {
  const h = rows[0].map(x => x.toLowerCase().trim());
  const hasTitle = colOf(h,'title') !== -1;
  const hasWebsite = colOf(h,'website','url') !== -1;
  if (!hasTitle && !hasWebsite) throw new Error('Not 1Password');
  const iT = colOf(h,'title','name'), iU = colOf(h,'url','website');
  const iUser = colOf(h,'username','user'), iPw = colOf(h,'password');
  const iNotes = colOf(h,'notes','note');
  if (iPw === -1) throw new Error('No password');
  return rows.slice(1).filter(r => r[iPw]).map(r => norm({
    title: r[iT]||extractDomain(r[iU]), url: r[iU]||'',
    username: r[iUser]||'', password: r[iPw]||'', notes: r[iNotes]||''
  }));
}

function tryFirefox(rows) {
  // url,username,password,httpRealm,formActionOrigin,...
  const h = rows[0].map(x => x.toLowerCase().replace(/"/g,''));
  if (!h.includes('httprealm') && !h.includes('formactionorigin') && !h.includes('guid')) throw new Error('Not Firefox');
  const iUrl = colOf(h,'url','origin'), iUser = colOf(h,'username'), iPw = colOf(h,'password');
  return rows.slice(1).filter(r => r[iPw]).map(r => norm({
    title: extractDomain(r[iUrl]), url: r[iUrl]||'', username: r[iUser]||'', password: r[iPw]||''
  }));
}

function tryDashlane(rows) {
  // title,url,login,password,note,...
  const h = rows[0].map(x => x.toLowerCase());
  const iLogin = colOf(h,'login');
  if (iLogin === -1) throw new Error('Not Dashlane');
  const iT = colOf(h,'title','name'), iU = colOf(h,'url','website');
  const iPw = colOf(h,'password'), iN = colOf(h,'note','notes');
  return rows.slice(1).filter(r => r[iPw]).map(r => norm({
    title: r[iT]||extractDomain(r[iU]), url: r[iU]||'',
    username: r[iLogin]||'', password: r[iPw]||'', notes: r[iN]||''
  }));
}

function tryKeePass(rows) {
  // Account,Login Name,Password,Web Site,Comments
  const h = rows[0].map(x => x.toLowerCase().trim());
  if (!h.includes('login name') && !h.includes('account')) throw new Error('Not KeePass');
  const iT  = colOf(h,'account','title','group'), iUser = colOf(h,'login name','username','login');
  const iPw = colOf(h,'password'), iU = colOf(h,'web site','url','website');
  const iN  = colOf(h,'comments','notes','comment');
  return rows.slice(1).filter(r => r[iPw]).map(r => norm({
    title: r[iT]||extractDomain(r[iU]), url: r[iU]||'',
    username: r[iUser]||'', password: r[iPw]||'', notes: r[iN]||''
  }));
}

function tryRoboForm(rows) {
  const h = rows[0].map(x => x.toLowerCase().trim());
  if (!h.includes('passcard') && !h.includes('login')) throw new Error('Not RoboForm');
  const iT = colOf(h,'name','passcard'), iU = colOf(h,'url','login');
  const iUser = colOf(h,'username','login name'), iPw = colOf(h,'password'), iN = colOf(h,'note','notes');
  return rows.slice(1).filter(r => r[iPw]).map(r => norm({
    title: r[iT]||extractDomain(r[iU]), url: r[iU]||'',
    username: r[iUser]||'', password: r[iPw]||'', notes: r[iN]||''
  }));
}

function tryVaultCSV(rows) {
  // name,url,username,password,notes,...
  const h = rows[0].map(x => x.toLowerCase().trim());
  if (colOf(h,'name','title') === -1 || colOf(h,'password') === -1) throw new Error('Not Vault CSV');
  const iT = colOf(h,'name','title'), iU = colOf(h,'url'), iUser = colOf(h,'username');
  const iPw = colOf(h,'password'), iN = colOf(h,'notes','note');
  return rows.slice(1).filter(r => r[iPw]).map(r => norm({
    title: r[iT]||'', url: r[iU]||'', username: r[iUser]||'', password: r[iPw]||'', notes: r[iN]||''
  }));
}

function tryGenericCSV(rows) {
  const h = rows[0].map(x => x.toLowerCase().trim());
  const iPw = colOf(h,'password','pass','pwd','secret');
  if (iPw === -1) throw new Error('No password column found');
  const iT  = colOf(h,'name','title','site','service','account');
  const iU  = colOf(h,'url','website','origin','uri','domain','web site');
  const iUser = colOf(h,'username','user','login','email','account','login name');
  const iN  = colOf(h,'notes','note','comment','extra','description','comments');
  return rows.slice(1).filter(r => r[iPw]).map(r => {
    const get = i => (i >= 0 && r[i]) ? r[i] : '';
    return norm({ title: get(iT)||extractDomain(get(iU)), url: get(iU), username: get(iUser), password: get(iPw), notes: get(iN) });
  });
}

// ─── Smart Auto-Detect Parser ─────────────────────────────────────────────────
async function smartParse(text, filename) {
  const lname = (filename || '').toLowerCase().trim();
  const trimmed = text.trim();

  // ── 1. Encrypted .vaultbak → handled separately, skip here
  if (lname.endsWith('.vaultbak')) return [];

  // ── 2. JSON formats ──────────────────────────────────────
  if (lname.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return tryVaultJSON(trimmed); } catch(e) {}
    try { return tryGenericJSON(trimmed); } catch(e) {}

    // Bitwarden JSON export (different structure)
    try {
      const d = JSON.parse(trimmed);
      if (d.items && Array.isArray(d.items)) {
        return d.items
          .filter(i => i.login && i.login.password)
          .map(i => norm({
            title:    i.name || '',
            url:      (i.login.uris && i.login.uris[0] && i.login.uris[0].uri) || '',
            username: i.login.username || '',
            password: i.login.password || '',
            notes:    i.notes || ''
          }));
      }
    } catch(e) {}

    // 1Password JSON export
    try {
      const d = JSON.parse(trimmed);
      if (d.accounts || d.vaults) {
        const entries = [];
        const items = d.items || (d.accounts && d.accounts.flatMap(a => a.vaults?.flatMap(v => v.items)||[])) || [];
        items.forEach(item => {
          const fields = item.fields || [];
          const pw = fields.find(f => f.type === 'P' || f.designation === 'password');
          const un = fields.find(f => f.designation === 'username');
          if (pw) entries.push(norm({ title: item.title||'', url: item.url||'', username: un?.value||'', password: pw.value||'' }));
        });
        if (entries.length) return entries;
      }
    } catch(e) {}

    // Encrypted Bitwarden/Generic JSON — try to parse as key-value pairs
    try {
      const d = JSON.parse(trimmed);
      const flat = Object.values(d).filter(v => v && typeof v === 'object' && (v.password || v.pass));
      if (flat.length) return flat.map(v => norm({ title: v.name||v.title||'', url: v.url||v.uri||'', username: v.username||v.user||v.email||'', password: v.password||v.pass||'', notes: v.notes||'' }));
    } catch(e) {}

    throw new Error(`JSON file "${filename}" parse nahi hua — unknown format`);
  }

  // ── 3. CSV / TXT / TSV / Google Drive / no-extension ──────────────────────────
  // Pre-process: TSV (tab-separated) → CSV
  const NL = trimmed.indexOf('\n');
  const firstLine = NL > -1 ? trimmed.slice(0, NL) : trimmed;
  let processedText = trimmed;
  if (firstLine.includes('\t') && !firstLine.includes(',')) {
    processedText = trimmed.split('\n').map(function(line) {
      return line.split('\t').map(function(cell) {
        var t = cell.trim();
        return t.indexOf(',') > -1 ? '"' + t.replace(/"/g, '""') + '"' : t;
      }).join(',');
    }).join('\n');
  }
  let rows;
  try { rows = parseCSV(processedText); } catch(e) {
    try { rows = parseCSV(trimmed); } catch(e2) { throw new Error('File read nahi hui'); }
  }
  if (!rows.length) throw new Error('File empty hai');

  // Try each format in order (most specific → generic)
  const csvTryers = [
    { name:'Google Passwords', fn: tryGooglePasswords },
    { name:'Bitwarden CSV',    fn: tryBitwarden },
    { name:'LastPass CSV',     fn: tryLastPass  },
    { name:'Firefox CSV',      fn: tryFirefox   },
    { name:'Dashlane CSV',     fn: tryDashlane  },
    { name:'1Password CSV',    fn: try1Password },
    { name:'KeePass CSV',      fn: tryKeePass   },
    { name:'RoboForm CSV',     fn: tryRoboForm  },
    { name:'Chrome CSV',       fn: tryChrome    },
    { name:'Vault CSV',        fn: tryVaultCSV  },
    { name:'Generic CSV',      fn: tryGenericCSV},
  ];

  const errors = [];
  for (const t of csvTryers) {
    try {
      const result = t.fn(rows);
      if (result.length > 0) {
        console.log(`[Vault Import] "${filename}" → ${t.name} (${result.length} entries)`);
        return result;
      }
    } catch(e) { errors.push(`${t.name}: ${e.message}`); }
  }

  // ── 4. Plain text fallback (line by line key:value or tab-separated)
  try {
    const entries = parsePlainText(trimmed);
    if (entries.length) return entries;
  } catch(e) {}

  throw new Error(`Format detect nahi hua: ${errors.slice(-3).join(' | ')}`);
}

// ─── Plain Text Parser (e.g. site: gmail, user: abc, pass: xyz) ──────────────
function parsePlainText(text) {
  const entries = [];
  const blocks = text.split(/\n\s*\n/); // split on blank lines
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const e = {};
    for (const line of lines) {
      const m = line.match(/^([^:=\t]+)[\s:=\t]+(.+)$/);
      if (!m) continue;
      const k = m[1].toLowerCase().trim(), v = m[2].trim();
      if (/site|name|title|service|account/.test(k)) e.title = v;
      else if (/url|website|link|web/.test(k)) e.url = v;
      else if (/user|login|email|account/.test(k)) e.username = v;
      else if (/pass|pwd|secret|key/.test(k)) e.password = v;
      else if (/note|comment|remark/.test(k)) e.notes = v;
    }
    if (e.password) entries.push(norm(e));
  }
  return entries;
}

// ─── DOM Ready ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => { bindEvents(); });

function bindEvents() {
  bindEye('masterPw', 'eyeBtn1');
  bindEye('confirmPw','eyeBtn2');
  bindEye('backupPw', 'eyeBtn3');

  document.getElementById('masterPw').addEventListener('input', e => {
    const s = calcStrength(e.target.value);
    const fill = document.getElementById('strengthFill');
    const label = document.getElementById('strengthLabel');
    fill.style.width = (s.score / 5 * 100) + '%';
    fill.style.background = s.color || 'transparent';
    label.textContent = e.target.value ? s.label : '';
    label.style.color = s.color;
  });

  document.getElementById('importFile').addEventListener('change', handleFileSelect);
  document.getElementById('decryptBtn').addEventListener('click', handleVaultbakDecrypt);
  document.getElementById('saveBtn').addEventListener('click', completeSetup);
  document.getElementById('skipBtn').addEventListener('click', () => {
    chrome.storage.local.set({ vault_setup_complete: true });
    window.close();
  });
}

function bindEye(inputId, btnId) {
  const btn = document.getElementById(btnId);
  const inp = document.getElementById(inputId);
  if (!btn || !inp) return;
  btn.addEventListener('click', () => {
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.textContent = inp.type === 'password' ? '👁' : '🙈';
  });
}

// ─── File Select ──────────────────────────────────────────────────────────────
async function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  hasVaultbak = files.some(f => f.name.toLowerCase().endsWith('.vaultbak'));
  document.getElementById('backupPwWrap').style.display = hasVaultbak ? 'block' : 'none';

  // Accept all file types: .csv, .txt, .json, .tsv, no extension, etc.
  const plainFiles = files.filter(f => !f.name.toLowerCase().endsWith('.vaultbak'));
  if (!plainFiles.length) return;

  showImportStatus('warn', '⏳ Files padh raha hoon...');
  importedEntries = [];
  let total = 0;
  const errors = [];

  for (const file of plainFiles) {
    try {
      const text = await readFile(file);
      const entries = await smartParse(text, file.name);
      if (entries.length) {
        importedEntries.push(...entries);
        total += entries.length;
      } else {
        errors.push(`${file.name}: koi entry nahi mili`);
      }
    } catch(err) {
      errors.push(`${file.name}: ${err.message}`);
      console.error('[Vault Setup Import]', file.name, err);
    }
  }

  if (total > 0) {
    showImportStatus('ok', `✅ ${total} passwords import ke liye ready! (${plainFiles.length} file${plainFiles.length>1?'s':''})`);
  } else {
    const msg = errors.length ? errors[0] : 'Koi valid password nahi mila';
    showImportStatus('err', '❌ ' + msg);
  }
}

// ─── Decrypt .vaultbak ────────────────────────────────────────────────────────
// BUG 1 FIX: Vault backup format = JSON string saved as binary file
// {"vault_backup":true, "v":2, "data":"<VaultCrypto-base64>"}
// VaultCrypto = 600,000 PBKDF2 iterations — old decryptBackup (100k) WRONG tha
async function handleVaultbakDecrypt() {
  const password = document.getElementById('backupPw').value.trim();
  if (!password) { showImportStatus('err', '❌ Backup password darj karo'); return; }

  const files = Array.from(document.getElementById('importFile').files)
    .filter(f => f.name.toLowerCase().endsWith('.vaultbak'));
  if (!files.length) { showImportStatus('err', '❌ Koi .vaultbak file select nahi'); return; }

  const btn = document.getElementById('decryptBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Decrypting...';
  showImportStatus('warn', '⏳ Decrypt ho raha hai...');

  let total = 0;
  let lastErr = null;

  for (const file of files) {
    try {
      // Read file as ArrayBuffer (binary safe, no encoding issues)
      const buf = await readFileAsBuffer(file);
      const rawText = new TextDecoder('utf-8').decode(buf).trim();

      let encryptedData = null;

      // Strategy 1: New v2 format — JSON wrapper with VaultCrypto-encrypted data
      // {"vault_backup":true, "v":2, "data":"<base64>"}
      try {
        const parsed = JSON.parse(rawText);
        if (parsed && parsed.vault_backup === true && typeof parsed.data === 'string') {
          encryptedData = parsed.data;
          console.log('[Vault Restore] Found v2 JSON wrapper format');
        }
      } catch(e) { /* not JSON, try other formats */ }

      // Strategy 2: Raw base64 VaultCrypto blob (direct encrypted string)
      if (!encryptedData) {
        const cleaned = rawText.replace(/\s/g, '');
        if (cleaned.length >= 40 && /^[A-Za-z0-9+\/=]+$/.test(cleaned)) {
          encryptedData = cleaned;
          console.log('[Vault Restore] Trying raw base64 format');
        }
      }

      if (!encryptedData) {
        throw new Error('Backup format samajh nahi aaya — file corrupt ho sakti hai');
      }

      // Decrypt using VaultCrypto (same as vault — 600,000 PBKDF2 iterations)
      const decryptedStr = await VaultCrypto.decrypt(encryptedData, password);
      const data = JSON.parse(decryptedStr);

      let entries = [];
      if (data.entries && Array.isArray(data.entries)) {
        entries = data.entries;
      } else if (Array.isArray(data)) {
        entries = data;
      } else {
        throw new Error('Backup mein entries array nahi mila');
      }

      if (entries.length === 0) throw new Error('Backup khali hai');

      importedEntries.push(...entries.map(norm));
      total += entries.length;
      console.log(`[Vault Restore] ${entries.length} entries restored from ${file.name}`);

    } catch(err) {
      lastErr = err;
      console.error('Vaultbak error:', err.name, err.message, err);
    }
  }

  btn.disabled = false;
  btn.textContent = '🔓 Decrypt Karke Import Karo';

  if (total > 0) {
    showImportStatus('ok', `✅ ${total} passwords restore ho gaye! Ab "Setup Complete Karo" dabao.`);
    document.getElementById('backupPwWrap').style.display = 'none';
    return;
  }

  if (lastErr) {
    const isWrongPw = lastErr instanceof DOMException ||
      lastErr.name === 'OperationError' || lastErr.name === 'InvalidAccessError';
    if (isWrongPw) {
      showImportStatus('err', '❌ Password galat hai! Vault ka wahi master password daalo jo backup banate waqt use kiya tha.');
    } else if (lastErr.message.includes('format') || lastErr.message.includes('corrupt')) {
      showImportStatus('err', '❌ Backup file ka format sahi nahi hai — dobara export karke try karo.');
    } else if (lastErr.message.includes('khali') || lastErr.message.includes('entries')) {
      showImportStatus('err', '❌ ' + lastErr.message);
    } else {
      showImportStatus('err', `❌ Decrypt failed: ${lastErr.message || lastErr.name}`);
    }
  } else {
    showImportStatus('err', '❌ Koi bhi entry restore nahi hui.');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Read file as ArrayBuffer (binary safe — no UTF-8 corruption)
function readFileAsBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

function readFile(file) {

  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsText(file, 'UTF-8');
  });
}

function showImportStatus(type, msg) {
  const el = document.getElementById('importStatus');
  el.className = 'status-box status-' + type;
  el.textContent = msg;
  el.style.display = 'block';
}

function showPwStatus(type, msg) {
  const el = document.getElementById('pwStatus');
  el.className = 'status-box status-' + type;
  el.textContent = msg;
  el.style.display = 'block';
}

// ─── Complete Setup ───────────────────────────────────────────────────────────
async function completeSetup() {
  const masterPw  = document.getElementById('masterPw').value;
  const confirmPw = document.getElementById('confirmPw').value;

  if (masterPw || confirmPw) {
    if (masterPw.length < 6) {
      showPwStatus('err', '❌ Password kam se kam 6 characters ka hona chahiye'); return;
    }
    if (masterPw !== confirmPw) {
      showPwStatus('err', '❌ Dono passwords match nahi kar rahe!'); return;
    }
  }

  if (!masterPw) {
    showPwStatus('err', '❌ Master password zaroori hai!'); return;
  }

  if (hasVaultbak && importedEntries.length === 0) {
    const go = confirm('⚠️ Backup file abhi decrypt nahi ki. Bina import ke aage badhen?');
    if (!go) return;
  }

  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Setting up...';

  try {
    const now = Date.now();
    const toSave = {};

    // ✅ FIXED: VaultCrypto.hashMaster use karo — popup.js isi format ko verify karta hai
    const vaultHash = await VaultCrypto.hashMaster(masterPw);
    toSave.vault_hash = vaultHash;
    // Old format clear karo (agar purana data tha)
    toSave.vault_master_hash = null;
    toSave.vault_master_salt = null;

    // ✅ FIXED: Imported entries ko encrypt karke vault_encrypted_blob mein save karo
    if (importedEntries.length > 0) {
      const entries = importedEntries.map((e, i) => ({
        id: `v_${now}_${i}`,
        title:    e.title    || extractDomain(e.url) || 'Imported',
        url:      e.url      || '',
        username: e.username || '',
        password: e.password || '',
        notes:    e.notes    || '',
        starred:  false,
        createdAt: now,
        updatedAt: now
      }));
      // Encrypt with VaultCrypto — background.js isi blob ko decrypt karta hai
      toSave.vault_encrypted_blob = await VaultCrypto.encrypt(JSON.stringify(entries), masterPw);
      toSave.vault_entries = null; // plaintext clear karo
    }

    toSave.vault_setup_complete = true;
    await chrome.storage.local.set(toSave);

    // ✅ FIXED: SET_SESSION call — background session set hoga, popup seedha main screen dikhayega
    await chrome.runtime.sendMessage({ type: 'SET_SESSION', masterPassword: masterPw });

    btn.textContent = '✅ Done!';
    setTimeout(() => window.close(), 800);
  } catch(err) {
    console.error('Setup error:', err);
    alert('❌ Setup failed: ' + err.message);
    btn.disabled = false;
    btn.textContent = '✅ Setup Complete Karo';
  }
}

// ─── Auto-Save Toggle ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // ── Auto-Save ──
  const chk  = document.getElementById('autoSaveChk');
  const info = document.getElementById('autoSaveInfo');
  if (chk && info) {
    chrome.storage.local.get(['vault_autosave'], data => {
      const on = data.vault_autosave !== false;
      chk.checked = on;
      updateAutoInfo(on);
    });
    chk.addEventListener('change', () => {
      const on = chk.checked;
      chrome.storage.local.set({ vault_autosave: on });
      updateAutoInfo(on);
    });
    function updateAutoInfo(on) {
      if (on) {
        info.style.background  = 'rgba(16,185,129,0.08)';
        info.style.borderColor = 'rgba(16,185,129,0.25)';
        info.style.color       = '#10b981';
        info.textContent       = '✓ Auto-Save ON — Vault naya login detect karke automatically save karega!';
      } else {
        info.style.background  = 'rgba(245,158,11,0.08)';
        info.style.borderColor = 'rgba(245,158,11,0.25)';
        info.style.color       = '#f59e0b';
        info.textContent       = '⚠ Manual Mode — Passwords page pe manually add karo.';
      }
    }
  }

  // ── Remember Master Password ──
  const remChk  = document.getElementById('rememberMasterChk');
  const remInfo = document.getElementById('rememberMasterInfo');
  if (remChk && remInfo) {
    // Load saved preference
    chrome.storage.local.get(['vault_remember_master'], data => {
      const on = data.vault_remember_master === true;
      remChk.checked = on;
      updateRemInfo(on);
    });
    remChk.addEventListener('change', () => {
      const on = remChk.checked;
      chrome.storage.local.set({ vault_remember_master: on });
      updateRemInfo(on);
      // If turning OFF, clear any stored remembered password
      if (!on) {
        chrome.storage.local.set({ vault_remembered_mp: null, vault_remember_until: null });
      }
    });
    function updateRemInfo(on) {
      if (on) {
        remInfo.style.background  = 'rgba(108,99,255,0.08)';
        remInfo.style.borderColor = 'rgba(108,99,255,0.25)';
        remInfo.style.color       = '#a78bfa';
        remInfo.textContent       = '✓ ON — Extension open hone pe master password automatically fill hoga (7 din tak)';
      } else {
        remInfo.style.background  = 'rgba(245,158,11,0.07)';
        remInfo.style.borderColor = 'rgba(245,158,11,0.2)';
        remInfo.style.color       = '#9898b8';
        remInfo.textContent       = '⚪ OFF — Har baar lock screen pe master password dalna hoga';
      }
    }
  }
});

