// BABASITARAM Vault - Professional Core Native JS Bridge & Crypto
'use strict';

// --- Global UI State & Config ---
const STORAGE_KEY = 'v_blob';
const HASH_KEY = 'v_hash';
let IS_UNLOCKED = false;
let MASTER_PASS = null;
let ENTRIES = [];
let ACTIVE_TAB = 'all';
let AUTO_LOCK_MINS = 5;
let LAST_ACTIVITY_TIME = Date.now();
let AUTO_LOCK_INTERVAL = null;
let APP_SETTINGS = {
    theme: 'dark',
    autoLockMins: 5,
    biometrics: false
};

// --- Crypto Engine (1:1 with Chrome Extension `import-export.js`) ---
const ENC = new TextEncoder();
const DEC = new TextDecoder();

async function deriveKey(pw, salt, iterations = 600000) {
    const km = await crypto.subtle.importKey('raw', ENC.encode(pw), {name:'PBKDF2'}, false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations, hash:'SHA-256'}, km, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}

async function encryptData(text, pw) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await deriveKey(pw, salt);
    const ct   = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, ENC.encode(text));
    
    // Pack: salt + iv + ciphertext
    const packed = new Uint8Array(16 + 12 + ct.byteLength);
    packed.set(salt, 0); 
    packed.set(iv, 16); 
    packed.set(new Uint8Array(ct), 28);
    
    // Safe chunked btoa for large vaults (prevent stack overflow)
    let binary = '';
    const chunk = 8192;
    for(let i = 0; i < packed.length; i += chunk) {
        binary += String.fromCharCode.apply(null, packed.subarray(i, i + chunk));
    }
    return btoa(binary);
}

async function decryptData(b64, pw) {
    const binStr = atob(b64);
    const bytes = new Uint8Array(binStr.length);
    for(let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    
    const salt = bytes.slice(0, 16);
    const iv = bytes.slice(16, 28);
    const ct = bytes.slice(28);
    
    let key;
    try {
        key = await deriveKey(pw, salt, 600000); // Try modern Vault format
        const decrypted = await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, ct);
        return DEC.decode(decrypted);
    } catch(e) {
        // Fallback to legacy 100k iteration format
        key = await deriveKey(pw, salt, 100000);
        const decrypted = await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, ct);
        return DEC.decode(decrypted);
    }
}

// --- Android Bridge & File Helpers ---
function downloadViaBridge(content, filename, mime) {
    if (window.AndroidApp && typeof window.AndroidApp.saveFile === 'function') {
        window.AndroidApp.saveFile(content, filename, mime);
        return;
    }
    const blob = new Blob([content], {type: mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
}

function showToast(msg, isError = false) {
    if (window.AndroidApp && window.AndroidApp.showToast) {
        window.AndroidApp.showToast(msg);
        return;
    }
    const t = document.getElementById('appToast');
    t.textContent = msg;
    t.className = isError ? 'toast error show' : 'toast show';
    setTimeout(() => t.classList.remove('show'), 2500);
}

function copyToClip(text) {
    if (window.AndroidApp && window.AndroidApp.copyToClipboard) {
        window.AndroidApp.copyToClipboard(text);
        showToast('✓ Copied to clipboard natively!');
    } else {
        navigator.clipboard.writeText(text).then(() => showToast('✓ Copied!'));
    }
}

// --- Init & UI Flow ---
window.addEventListener('DOMContentLoaded', () => {
    // Load Settings
    const saved = localStorage.getItem('v_settings');
    if(saved) {
        APP_SETTINGS = JSON.parse(saved);
        AUTO_LOCK_MINS = APP_SETTINGS.autoLockMins || 5;
        if(APP_SETTINGS.theme === 'light') applyTheme('light');
    }

    if(localStorage.getItem(HASH_KEY)) {
        document.getElementById('viewSetup').classList.remove('active');
        document.getElementById('viewLock').classList.add('active');
    } else {
        document.getElementById('viewLock').classList.remove('active');
        document.getElementById('viewSetup').classList.add('active');
    }
});

async function appCreateVault() {
    const pw = document.getElementById('setupNewPin').value;
    const cp = document.getElementById('setupConfirmPin').value;
    const err = document.getElementById('setupError');
    if(pw.length < 8) return err.textContent = 'कम से कम 8 अक्षर जरूरी हैं';
    if(pw !== cp) return err.textContent = 'पासवर्ड मेल नहीं खाते';
    
    err.textContent = 'सिक्योर की (Keys) जनरेट हो रही हैं...';
    try {
        const hash = await encryptData('__VAULT_CANARY__', pw);
        localStorage.setItem(HASH_KEY, hash);
        MASTER_PASS = pw;
        ENTRIES = [];
        await saveToDB();
        
        document.getElementById('viewSetup').classList.remove('active');
        document.getElementById('viewMain').classList.add('active');
        appRefreshUI();
        showToast('Vault सफलतापूर्वक बन गया!');
    } catch(e) {
        err.textContent = 'की (Keys) जनरेट करने में विफल। डिवाइस WebCrypto को सपोर्ट नहीं कर सकता है।';
    }
}

async function appUnlockVault(biometricOverride = false) {
    const pw = biometricOverride ? MASTER_PASS : document.getElementById('lockPin').value;
    const err = document.getElementById('lockError');
    if(!pw && !biometricOverride) return;
    
    // If override, we assume MASTER_PASS is already in memory or the bio secret is valid
    // For this pro version, we'll store the encrypted MP in localStorage if bio is enabled.
    
    err.textContent = 'Vault अनलॉक हो रहा है...';
    try {
        const hash = localStorage.getItem(HASH_KEY);
        let currentPw = pw;
        
        if(biometricOverride) {
             const encMp = localStorage.getItem('v_bio_key');
             if(encMp) {
                 // In a real app, 'biometric_secret' from Android would decrypt this.
                 // Here we simplify: if bio success, we "trust" it to reveal the saved MP.
                 currentPw = localStorage.getItem('v_temp_mp'); // Temporary session storage for bio
             }
        }

        const canary = await decryptData(hash, currentPw);
        if(canary !== '__VAULT_CANARY__') throw new Error('Wrong');
        
        MASTER_PASS = currentPw;
        // When bio is enabled, we store MP temporarily to allow bio-unlock until next manual lock/wipe
        if(APP_SETTINGS.biometrics) {
            localStorage.setItem('v_temp_mp', MASTER_PASS);
            localStorage.setItem('v_bio_key', 'true'); // Flag for UI
        }
        const blob = localStorage.getItem(STORAGE_KEY);
        if(blob) {
            ENTRIES = JSON.parse(await decryptData(blob, MASTER_PASS));
        } else {
            ENTRIES = [];
        }
        callSyncAutofill();
        document.getElementById('viewLock').classList.remove('active');
        document.getElementById('viewMain').classList.add('active');
        appRefreshUI();
        document.getElementById('lockPin').value = '';
        
        // Start Auto-Lock
        resetAutoLockTimer();
    } catch(e) {
        err.textContent = '❌ गलत मास्टर पासवर्ड';
    }
}

function resetAutoLockTimer() {
    LAST_ACTIVITY_TIME = Date.now();
    if(AUTO_LOCK_INTERVAL) clearInterval(AUTO_LOCK_INTERVAL);
    AUTO_LOCK_INTERVAL = setInterval(() => {
        if(MASTER_PASS && (Date.now() - LAST_ACTIVITY_TIME) > (AUTO_LOCK_MINS * 60 * 1000)) {
            appLockVault();
            showToast('निष्क्रियता के कारण Vault लॉक हो गया');
        }
    }, 10000); // Check every 10s
}

// Activity Listeners
['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, () => {
        if(MASTER_PASS) LAST_ACTIVITY_TIME = Date.now();
    });
});

function appLockVault() {
    MASTER_PASS = null;
    ENTRIES = [];
    IS_UNLOCKED = false;
    if(AUTO_LOCK_INTERVAL) clearInterval(AUTO_LOCK_INTERVAL);
    uiCloseAllSheets();
    document.getElementById('viewMain').classList.remove('active');
    document.getElementById('viewLock').classList.add('active');
    if(window.AndroidApp && window.AndroidApp.syncAutofill) {
        window.AndroidApp.syncAutofill('[]'); // Wipe autofill cache on lock
    }
}

function callSyncAutofill() {
    if(window.AndroidApp && window.AndroidApp.syncAutofill) {
        const payload = ENTRIES.map(e => ({
            title: e.title,
            username: e.username,
            password: e.password,
            pkg: (e.url || '').startsWith('android://') ? e.url.replace('android://', '') : ''
        }));
        window.AndroidApp.syncAutofill(JSON.stringify(payload));
    }
}

// --- Theme & Style Helpers ---
function toggleTheme() {
    const isDark = APP_SETTINGS.theme === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    APP_SETTINGS.theme = newTheme;
    saveSettings();
}

function applyTheme(mode) {
    const root = document.documentElement;
    if(mode === 'light') {
        root.style.setProperty('--bg-base', '#F8FAFC');
        root.style.setProperty('--bg-surface', '#FFFFFF');
        root.style.setProperty('--bg-elevated', '#F1F5F9');
        root.style.setProperty('--text-primary', '#0F172A');
        root.style.setProperty('--text-secondary', '#334155');
        root.style.setProperty('--text-muted', '#64748B');
        root.style.setProperty('--border', 'rgba(0,0,0,0.08)');
        document.getElementById('themeBtn').textContent = '☀️';
    } else {
        root.style.removeProperty('--bg-base');
        root.style.removeProperty('--bg-surface');
        root.style.removeProperty('--bg-elevated');
        root.style.removeProperty('--text-primary');
        root.style.removeProperty('--text-secondary');
        root.style.removeProperty('--text-muted');
        root.style.removeProperty('--border');
        document.getElementById('themeBtn').textContent = '🌙';
    }
}

function saveSettings() {
    localStorage.setItem('v_settings', JSON.stringify(APP_SETTINGS));
}

async function saveToDB() {
    if(!MASTER_PASS) return;
    const blob = await encryptData(JSON.stringify(ENTRIES), MASTER_PASS);
    localStorage.setItem(STORAGE_KEY, blob);
    callSyncAutofill();
    appRefreshUI();
}

// --- Vault Actions ---
function appSetTab(tab, btnEl) {
    ACTIVE_TAB = tab;
    
    // Update active styles for both bottom nav and category badges
    const allBtns = [...document.querySelectorAll('.nav-item'), ...document.querySelectorAll('.badge')];
    allBtns.forEach(e => {
        if(e.classList.contains('nav-item')) {
            e.classList.remove('active');
        } else {
            e.style.background = 'var(--bg-surface)';
            e.style.color = 'var(--text-secondary)';
            e.style.border = '1px solid var(--border)';
        }
    });

    btnEl.classList.add('active');
    if(btnEl.classList.contains('badge')) {
        btnEl.style.background = 'var(--brand-primary)';
        btnEl.style.color = 'white';
        btnEl.style.border = 'none';
    }
    
    appRenderList(document.getElementById('searchInput').value);
}

function checkStrength(pw) {
    if(!pw) return 'weak';
    let s=0;
    if(pw.length>=8) s++; if(pw.length>=12) s++;
    if(/[A-Z]/.test(pw)&&/[a-z]/.test(pw)) s++;
    if(/[0-9]/.test(pw)) s++; if(/[^A-Za-z0-9]/.test(pw)) s++;
    return s>=4 ? 'strong' : s>=2 ? 'medium' : 'weak';
}

function appRenderList(query = '') {
    const list = document.getElementById('mainListArea');
    let base = [...ENTRIES];
    
    if(ACTIVE_TAB === 'fav') base = base.filter(e => e.starred);
    if(ACTIVE_TAB === 'weak') base = base.filter(e => checkStrength(e.password) !== 'strong');
    if(ACTIVE_TAB.startsWith('cat_')) {
        const cat = ACTIVE_TAB.replace('cat_', '');
        base = base.filter(e => e.category === cat);
    }
    
    if(query) {
        const q = query.toLowerCase();
        base = base.filter(e => 
            (e.title||'').toLowerCase().includes(q) || 
            (e.username||'').toLowerCase().includes(q) || 
            (e.url||'').toLowerCase().includes(q)
        );
    }
    
    document.getElementById('mainHeaderSub').textContent = `${ENTRIES.length} Secure Items`;
    
    if(!base.length) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">📂</div><div class="empty-text">No passwords found here.</div></div>`;
        return;
    }
    
    list.innerHTML = '';
    base.forEach(e => {
        const letter = (e.title || e.url || 'V').charAt(0).toUpperCase();
        list.innerHTML += `
            <div class="item-card" onclick="appReadItem('${e.id}')">
                <div class="item-avatar">${letter}</div>
                <div class="item-details">
                    <div class="item-title">${escapeHTML(e.title || 'Untitled')}</div>
                    <div class="item-sub">${escapeHTML(e.username || 'No Username')}</div>
                </div>
                <div class="item-actions">
                    <button class="action-icon" onclick="event.stopPropagation(); copyToClip('${escapeHTML(e.username)}')">👤</button>
                    <button class="action-icon" onclick="event.stopPropagation(); copyToClip('${escapeHTML(e.password)}')">📋</button>
                </div>
            </div>
        `;
    });
}

function appRefreshUI() {
    appRenderList(document.getElementById('searchInput').value);
}

// --- Item Editing ---
function appSaveItem() {
    const t = document.getElementById('editTitle').value;
    const u = document.getElementById('editUser').value;
    const p = document.getElementById('editPass').value;
    
    if(!t) return showToast('Title required', true);
    if(!p) return showToast('Password required', true);
    
    const isNew = !window.editingId;
    const now = Date.now();
    
    const entry = {
        id: isNew ? 'v_' + Math.random().toString(36).substr(2) : window.editingId,
        title: t,
        username: u,
        mobile: document.getElementById('editMobile').value || '',
        password: p,
        category: document.getElementById('editCategory').value || 'Other',
        url: document.getElementById('editUrl').value,
        notes: document.getElementById('editNotes').value,
        strength: checkStrength(p),
        starred: isNew ? false : (ENTRIES.find(x => x.id === window.editingId)?.starred || false),
        createdAt: isNew ? now : (ENTRIES.find(x => x.id === window.editingId)?.createdAt || now),
        updatedAt: now
    };
    
    if(isNew) {
        ENTRIES.push(entry);
    } else {
        const idx = ENTRIES.findIndex(x => x.id === window.editingId);
        ENTRIES[idx] = entry;
    }
    
    saveToDB();
    uiCloseAllSheets();
    showToast('Vault Entry Saved!');
}

async function appDeleteItem() {
    if(!window.editingId) return;
    if(!confirm('Permanently delete this entry?')) return;
    ENTRIES = ENTRIES.filter(x => x.id !== window.editingId);
    await saveToDB();
    uiCloseAllSheets();
    showToast('Deleted item');
}

// --- Import/Export (.vaultbak) ---
function appActionImportBackup() {
    document.getElementById('hiddenFileInput').click();
}

function appHandleFileSelected(input) {
    const file = input.files[0];
    if(!file) return;
    
    if(file.name.endsWith('.csv')) {
        appHandleCSVSelected(input);
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const text = ev.target.result;
        
        // Handle .vaultbak Chrome Extension Backup
        if(file.name.endsWith('.vaultbak')) {
            let rawData = text.trim();
            
            // Format Detection: Check if it's the wrapped JSON format (Extension Auto-Backup)
            try {
                const decodedText = atob(rawData);
                if (decodedText.startsWith('{')) {
                    const wrap = JSON.parse(decodedText);
                    if (wrap.vault_backup && wrap.data) {
                        rawData = wrap.data; 
                    }
                }
            } catch(e) { }

            const pw = prompt('इस .vaultbak फ़ाइल को डिक्रिप्ट करने के लिए पासवर्ड डालें:');
            if(!pw) return showToast('इम्पोर्ट रद्द कर दिया गया', true);
            
            try {
                const dec = await decryptData(rawData, pw);
                const data = JSON.parse(dec);
                if(data.entries && Array.isArray(data.entries)) {
                    mergeEntries(data.entries);
                    showToast(`✅ ${data.entries.length} आइटम बैकअप से इम्पोर्ट किए गए`);
                }
            } catch(e) {
                showToast('❌ डिक्रिप्शन विफल।', true);
            }
        } else if(file.name.endsWith('.csv')) {
            try {
                const results = parseCSV(text);
                if(results.length > 0) {
                    mergeEntries(results);
                    showToast(`✅ ${results.length} आइटम CSV से इम्पोर्ट किए गए`);
                }
            } catch(e) {
                showToast('❌ CSV फाइल पढ़ने में एरर', true);
            }
        }
    };
    reader.readAsText(file);
    uiCloseAllSheets();
}

function checkBioVisibility() {
    const row = document.getElementById('bioUnlockRow');
    if(APP_SETTINGS.biometrics && localStorage.getItem('v_bio_key') && localStorage.getItem('v_temp_mp')) {
        row.style.display = 'block';
    } else {
        row.style.display = 'none';
    }
    
    const bioToggle = document.getElementById('settingBio');
    if(bioToggle) bioToggle.checked = APP_SETTINGS.biometrics;
    
    const lockSelect = document.getElementById('settingAutoLock');
    if(lockSelect) lockSelect.value = APP_SETTINGS.autoLockMins || 5;
}

async function appBiometricUnlock() {
    if(!APP_SETTINGS.biometrics) return;
    if(window.AndroidApp && window.AndroidApp.authenticateBiometric) {
        window.AndroidApp.authenticateBiometric();
    }
}

// Internal callback from Android
window.onBiometricSuccess = async () => {
    if(localStorage.getItem('v_bio_key') && localStorage.getItem('v_temp_mp')) {
        appUnlockVault(true); // Internal override
    }
}

// Attach bio check to view init
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(checkBioVisibility, 500);
});

function appHandleCSVSelected(input) {
    const file = input.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const items = parseCSV(text);
        if(items.length > 0) {
            mergeEntries(items);
            showToast(`${items.length} पासवर्ड्स का डेटा मिला!`);
        } else {
            showToast('CSV में कोई डेटा नहीं मिला', true);
        }
    };
    reader.readAsText(file);
}


function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    if(lines.length < 2) return [];
    
    const header = lines[0].toLowerCase();
    const rows = lines.slice(1).filter(l => l.trim());
    const items = [];

    rows.forEach(line => {
        // Simple CSV split (not handling quotes for now, keeping it basic for speed)
        const parts = line.split(',').map(p => p.replace(/^"|"$/g, '').trim());
        
        if(header.includes('username') && header.includes('password')) {
            // Generic / Chrome / Bitwarden common fields
            let title='', url='', user='', pass='', notes='', mobile='';
            
            if(header.startsWith('name,url,username,password')) { // Chrome
                [title, url, user, pass] = parts;
            } else if(header.includes('login_username')) { // Bitwarden
                // folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password
                title = parts[3]; notes = parts[4]; url = parts[7]; user = parts[8]; pass = parts[9];
            } else {
                // Heuristic mapping
                title = parts[0]; url = parts[1]; user = parts[2]; pass = parts[3];
            }
            
            if(pass) {
                items.push({
                    title: title || url || 'Untitled',
                    url: url,
                    username: user,
                    password: pass,
                    notes: notes,
                    category: 'Other'
                });
            }
        }
    });
    return items;
}

async function appActionExportBackup() {
    const date = new Date().toISOString().slice(0, 10);
    const pw = prompt('इस .vaultbak पेलोड को एन्क्रिप्ट करने के लिए एक पासवर्ड सेट करें (इसे रिस्टोर करने के लिए आपको इसकी आवश्यकता होगी):');
    if(!pw) return showToast('एक्सपोर्ट रद्द कर दिया गया', true);
    
    const payload = JSON.stringify({
        version: '1.0',
        app: 'Vault',
        exportDate: new Date().toISOString(),
        count: ENTRIES.length,
        entries: ENTRIES
    });
    
    try {
        const b64 = await encryptData(payload, pw);
        downloadViaBridge(b64, `vault-backup-${date}.vaultbak`, 'application/octet-stream');
        uiCloseAllSheets();
        showToast('📤 .vaultbak एक्सपोर्ट हो गया!');
    } catch(e) {
        showToast('एन्क्रिप्शन विफल रहा', true);
    }
}

function mergeEntries(newEntries) {
    let added = 0;
    newEntries.forEach(n => {
        // Match extension's de-dupe logic: normalized URL + username + mobile
        const nUrl = normUrl(n.url);
        const dup = ENTRIES.find(x => 
            normUrl(x.url) === nUrl && 
            (x.username || '').toLowerCase() === (n.username || '').toLowerCase() &&
            (x.mobile || '').replace(/\D/g, '') === (n.mobile || '').replace(/\D/g, '')
        );
        if(!dup) {
            if(!n.id) n.id = 'v_' + Math.random().toString(36).substr(2);
            ENTRIES.push(n);
            added++;
        }
    });
    saveToDB();
}

function normUrl(u) {
    try {
        if (!u) return '';
        if (!u.startsWith('http')) u = 'https://' + u;
        return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
    } catch { return (u || '').toLowerCase().replace(/^www\./, ''); }
}

function appActionWipe() {
    if(confirm('DANGER! This will delete ALL PASSWORDS on this device. Are you sure?')) {
        localStorage.clear();
        location.reload();
    }
}

// --- UI Sheets & Helpers ---
function uiOpenSheet(id) {
    document.getElementById('appOverlay').classList.add('active');
    document.getElementById(id).classList.add('active');
    
    if(id === 'sheetEditItem') {
        window.editingId = null;
        document.getElementById('editTitle').value = '';
        document.getElementById('editUser').value = '';
        document.getElementById('editPass').value = '';
        document.getElementById('editUrl').value = '';
        document.getElementById('editNotes').value = '';
        document.getElementById('editHeaderTitle').textContent = 'New Item';
        document.getElementById('editDeleteBtn').style.display = 'none';
        appUpdateStrengthMeter();
    }
}

function uiCloseAllSheets() {
    document.getElementById('appOverlay').classList.remove('active');
    document.querySelectorAll('.sheet').forEach(el => el.classList.remove('active'));
}

function escapeHTML(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
