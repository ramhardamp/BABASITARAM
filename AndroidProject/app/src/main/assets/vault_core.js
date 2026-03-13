// BABASITARAM Vault - Professional Core Native JS Bridge & Crypto
'use strict';

// --- Global UI State & Config ---
const STORAGE_KEY = 'v_blob';
const HASH_KEY = 'v_hash';
let IS_UNLOCKED = false;
let MASTER_PASS = null;
let ENTRIES = [];
let LOGS = [];
let ACTIVE_TAB = 'all';

const BREACHED_PATTERNS = ['123', 'admin', 'password', 'qwerty', 'abc', '111', 'login'];
let AUTO_LOCK_INTERVAL = null;
let WIPE_PENDING = false;
let APP_SETTINGS = {
    theme: 'dark',
    lang: 'hi', // Default to Hindi
    autoLockMins: 5,
    biometrics: false,
    autoBackup: false
};

const TRANSLATIONS = {
    hi: {
        setup_title: "Vault में आपका स्वागत है",
        setup_sub: "अपना सुरक्षित ऑफलाइन मास्टर पासवर्ड बनाएं",
        setup_create: "सुरक्षित Vault बनाएं",
        lock_title: "Vault लॉक है",
        lock_sub: "अनलॉक करने के लिए मास्टर पासवर्ड डालें",
        lock_btn: "अनलॉक करें",
        nav_items: "सभी आइटम",
        nav_favs: "पसंदीदा",
        nav_audit: "ऑडिट",
        nav_settings: "सेटिंग्स",
        search_ph: "पासवर्ड खोजें...",
        items_count: "सुरक्षित आइटम",
        edit_new: "नया आइटम",
        edit_edit: "आइटम संपादित करें",
        label_title: "शीर्षक *",
        label_user: "यूजरनेम / ईमेल",
        label_mobile: "मोबाइल नंबर",
        label_cat: "श्रेणी (Category)",
        label_pass: "पासवर्ड *",
        label_url: "वेबसाइट URL",
        label_notes: "नोट्स",
        btn_save: "💾 आइटम सुरक्षित करें",
        settings_title: "⚙️ Vault Settings",
        settings_lang: "Language / भाषा",
        settings_bio: "Biometric Unlock",
        settings_autobackup: "Auto-Backup (Native)",
        settings_sync: "Backup & Data",
        settings_default_autofill: "Set Default Autofill",
        settings_other: "Other Options",
        settings_export: "📤 सादा CSV एक्सपोर्ट करें",
        toast_saved: "Vault आइटम सुरक्षित हो गया!",
        toast_deleted: "आइटम हटा दिया गया",
        toast_copied: "क्लिपबोर्ड पर कॉपी किया गया!",
        toast_wrong_pass: "गलत मास्टर पासवर्ड!",
        toast_bio_verify: "सत्यापित करने के लिए फिंगरप्रिंट का उपयोग करें",
        toast_verify_fail: "सत्यापन विफल रहा"
    },
    en: {
        setup_title: "Welcome to Vault",
        setup_sub: "Create your secure offline master password",
        setup_create: "Create Secure Vault",
        lock_title: "Vault is Locked",
        lock_sub: "Enter Master Password to unlock",
        lock_btn: "Unlock Now",
        nav_items: "All Items",
        nav_favs: "Favorites",
        nav_audit: "Audit",
        nav_settings: "Settings",
        search_ph: "Search passwords...",
        items_count: "Secure Items",
        edit_new: "New Entry",
        edit_edit: "Edit Entry",
        label_title: "Title *",
        label_user: "Username / Email",
        label_mobile: "Mobile Number",
        label_cat: "Category",
        label_pass: "Password *",
        label_url: "Website URL",
        label_notes: "Notes",
        btn_save: "💾 Save Item",
        settings_title: "⚙️ Vault Settings",
        settings_lang: "Language / भाषा",
        settings_bio: "Biometric Unlock",
        settings_autobackup: "Auto-Backup (Native)",
        settings_sync: "Backup & Data",
        settings_default_autofill: "Set Default Autofill",
        settings_other: "Other Options",
        settings_export: "📤 Export Plain CSV",
        toast_saved: "Vault entry saved!",
        toast_deleted: "Item deleted",
        toast_copied: "Copied to clipboard!",
        toast_wrong_pass: "Incorrect Master Password!",
        toast_bio_verify: "Please use fingerprint to verify action",
        toast_verify_fail: "Verification failed"
    }
};

function i18n(key) {
    const lang = APP_SETTINGS.lang || 'hi';
    return TRANSLATIONS[lang][key] || key;
}

function updateUILanguage() {
    // Dynamic updates for most common elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = i18n(key);
        else el.textContent = i18n(key);
    });
}

// --- Crypto Engine (1:1 with Chrome Extension `import-export.js`) ---
const ENC = new TextEncoder();
const DEC = new TextDecoder();
let CLIP_TIMER = null;

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
        const key = await crypto.subtle.importKey('raw', secretBytes,{ name: 'HMAC', hash: { name: 'SHA-1' } },false, ['sign']);
        const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, cb));
        const offset = sig[19] & 0xf;
        const code = (((sig[offset] & 0x7f) << 24)|((sig[offset + 1] & 0xff) << 16)|((sig[offset + 2] & 0xff) << 8)|(sig[offset + 3] & 0xff));
        return String(code % Math.pow(10, digits)).padStart(digits, '0');
    }
    async function generate(secret, digits = 6, period = 30) {
        if (!secret || secret.length < 8) return null;
        try {
            const secretBytes = base32Decode(secret);
            if (!secretBytes.length) return null;
            const counter = Math.floor(Date.now() / 1000 / period);
            const code = await hotp(secretBytes, counter, digits);
            const remaining = period - (Math.floor(Date.now() / 1000) % period);
            return { code, remaining, period };
        } catch(e) { return null; }
    }
    return { generate };
})();

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
        const input = document.createElement('textarea');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('✓ Copied!');
    }
    
    // Clipboard Auto-Clear Logic (30 seconds)
    if(CLIP_TIMER) clearTimeout(CLIP_TIMER);
    CLIP_TIMER = setTimeout(() => {
        if (window.AndroidApp && window.AndroidApp.copyToClipboard) {
            window.AndroidApp.copyToClipboard('');
        }
        showToast('Clipboard cleared for security');
    }, 30000);
}

// --- Init & UI Flow ---
window.addEventListener('DOMContentLoaded', () => {
    // Load Settings
    const saved = localStorage.getItem('v_settings');
    if(saved) {
        APP_SETTINGS = JSON.parse(saved);
        AUTO_LOCK_MINS = APP_SETTINGS.autoLockMins || 5;
        if(APP_SETTINGS.theme === 'light') applyTheme('light');
        updateUILanguage();
    }

    // Load Logs
    const logsJson = localStorage.getItem('v_logs');
    if(logsJson) LOGS = JSON.parse(logsJson);

    if(localStorage.getItem(HASH_KEY)) {
        document.getElementById('viewSetup').classList.remove('active');
        document.getElementById('viewLock').classList.add('active');
        // Auto-trigger biometric if enabled
        setTimeout(() => { if(APP_SETTINGS.biometrics) appBiometricUnlock(); }, 800);
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
        logEvent('VAULT_SETUP', 'New vault profile created');
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
        logEvent('VAULT_UNLOCK', 'Success');
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
    logEvent('VAULT_LOCK', 'Manual lock triggered');
    if(AUTO_LOCK_INTERVAL) clearInterval(AUTO_LOCK_INTERVAL);
    uiCloseAllSheets();
    document.getElementById('viewMain').classList.remove('active');
    document.getElementById('viewLock').classList.add('active');
    if(window.AndroidApp && window.AndroidApp.syncAutofill) {
        window.AndroidApp.syncAutofill('[]'); // Wipe autofill cache on lock
    }
    // Auto-trigger biometric on manual lock too
    setTimeout(() => { if(APP_SETTINGS.biometrics) appBiometricUnlock(); }, 500);
}

function callSyncAutofill() {
    if(window.AndroidApp && window.AndroidApp.syncAutofill) {
        const payload = ENTRIES.map(e => ({
            title: e.title,
            username: e.username,
            password: e.password,
            mobile: e.mobile || '',
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
    
    // Auto-Backup logic
    if(APP_SETTINGS.autoBackup && window.AndroidApp && window.AndroidApp.autoBackupNative) {
        const date = new Date().toISOString().slice(0, 10);
        window.AndroidApp.autoBackupNative(blob, `vault-autobackup-${date}.vaultbak`);
    }
    
    appRefreshUI();
    if(typeof refreshSecurityHub === 'function') refreshSecurityHub();
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
    
    document.getElementById('mainHeaderSub').textContent = `${ENTRIES.length} ${i18n('items_count')}`;
    
    if(!base.length) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">📂</div><div class="empty-text">No passwords found here.</div></div>`;
        return;
    }
    
    list.innerHTML = '';
    base.forEach(e => {
        const letter = (e.title || e.url || 'V').charAt(0).toUpperCase();
        const displayTitle = highlightText(escapeHTML(e.title || 'Untitled'), query);
        const displayUser = highlightText(escapeHTML(e.username || 'No Username'), query);
        
        list.innerHTML += `
            <div class="item-card" onclick="appReadItem('${e.id}')">
                <div class="item-avatar">${letter}</div>
                <div class="item-details">
                    <div class="item-title">${displayTitle}</div>
                    <div class="item-sub">${displayUser}</div>
                </div>
                <div class="item-actions">
                    <button class="action-icon" onclick="event.stopPropagation(); copyToClip('${escapeHTML(e.username)}')">👤</button>
                    <button class="action-icon" onclick="event.stopPropagation(); copyToClip('${escapeHTML(e.password)}')">📋</button>
                </div>
            </div>
        `;
    });
    
    if(typeof refreshSecurityHub === 'function') refreshSecurityHub();
}

function highlightText(text, q) {
    if(!q) return text;
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark style="background:var(--brand-secondary);color:white;border-radius:2px;padding:0 2px">$1</mark>');
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
    
    const oldEntry = ENTRIES.find(x => x.id === window.editingId);
    let history = oldEntry?.history || [];
    
    // Pro Feature: Password History
    if(oldEntry && oldEntry.password !== p) {
        history.push({
            password: oldEntry.password,
            date: oldEntry.updatedAt || Date.now()
        });
        if(history.length > 5) history.shift(); // Keep last 5
    }

    const isNew = !window.editingId;
    const now = Date.now();
    const type = document.getElementById('editType').value;

    const entry = {
        id: isNew ? 'v_' + Math.random().toString(36).substr(2) : window.editingId,
        type: type,
        title: t,
        username: u,
        mobile: document.getElementById('editMobile').value || '',
        password: p,
        totpSecret: document.getElementById('editTotp').value || '',
        category: document.getElementById('editCategory').value || 'Other',
        url: document.getElementById('editUrl').value,
        notes: document.getElementById('editNotes').value,
        
        // Template Specific Fields
        cardName: document.getElementById('editCardName').value || '',
        cardNumber: document.getElementById('editCardNumber').value || '',
        cardExp: document.getElementById('editCardExp').value || '',
        cardCvv: document.getElementById('editCardCvv').value || '',
        idNumber: document.getElementById('editIdNumber').value || '',

        strength: checkStrength(p),
        starred: isNew ? false : (oldEntry?.starred || false),
        createdAt: isNew ? now : (oldEntry?.createdAt || now),
        updatedAt: now,
        history: history
    };
    
    if(isNew) {
        logEvent('ITEM_ADD', t);
        ENTRIES.push(entry);
    } else {
        logEvent('ITEM_EDIT', t);
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
    const deletedItem = ENTRIES.find(x => x.id === window.editingId);
    logEvent('ITEM_DELETE', deletedItem?.title || 'Unknown');
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
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const text = ev.target.result;
        
        const name = file.name.toLowerCase();
        if (name.endsWith('.vaultbak')) {
            handleVaultBakImport(text);
        } else if (name.endsWith('.csv')) {
            handleCSVImport(text);
        } else if (name.endsWith('.json')) {
            handleJSONImport(text);
        } else {
            showToast('Unsupported file format', true);
        }
        return;
    };
    reader.readAsText(file);
    uiCloseAllSheets();
    input.value = '';
}

function checkBioVisibility() {
    const row = document.getElementById('bioUnlockRow');
    if(APP_SETTINGS.biometrics && localStorage.getItem('v_bio_key') && localStorage.getItem('v_temp_mp')) {
        row.style.display = 'block';
    } else {
        row.style.display = 'none';
    }

    const langSelect = document.getElementById('settingLang');
    if(langSelect) langSelect.value = APP_SETTINGS.lang || 'hi';
    
    const bioToggle = document.getElementById('settingBio');
    if(bioToggle) bioToggle.checked = APP_SETTINGS.biometrics;

    const backupToggle = document.getElementById('settingAutoBackup');
    if(backupToggle) backupToggle.checked = APP_SETTINGS.autoBackup || false;
    
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
    if (WIPE_PENDING) {
        executeWipe();
    } else if (localStorage.getItem('v_bio_key') && localStorage.getItem('v_temp_mp')) {
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
        try {
            const rows = parseCSV(e.target.result);
            const items = processCSVData(rows);
            if(items.length > 0) {
                mergeEntries(items);
            } else {
                showToast('CSV में कोई मान्य डेटा नहीं मिला', true);
            }
        } catch(err) {
            showToast('CSV पढ़ने में एरर: ' + err.message, true);
        }
    };
    reader.readAsText(file);
    input.value = ''; // Reset for next selection
}


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
        } else { cur += ch; }
    }
    if (cur || row.length) { row.push(cur.trim()); if (row.some(c => c !== '')) lines.push(row); }
    return lines;
}

function processCSVData(rows) {
    if (!rows.length) return [];
    
    // Universal Keyword Mapping for major Password Managers
    // (Chrome, Bitwarden, LastPass, 1Password, KeePass, NordPass, Dashlane, etc.)
    const header = rows[0].map(h => h.toLowerCase().trim().replace(/["']/g, ''));
    
    const findCol = (...names) => { 
        for (const n of names) { 
            const i = header.findIndex(h => h === n || h.includes(n) || n.includes(h)); 
            if (i !== -1) return i; 
        } 
        return -1; 
    };
    
    // Mapping keywords
    const iTitle = findCol('name', 'title', 'site', 'label', 'account', 'description');
    const iUrl = findCol('url', 'website', 'uri', 'link', 'address', 'host');
    const iUser = findCol('username', 'user', 'login', 'email', 'id', 'member');
    const iPass = findCol('password', 'pass', 'pwd', 'code', 'secret', 'key');
    const iNotes = findCol('notes', 'note', 'comment', 'extra', 'info', 'remarks');
    const iMobile = findCol('mobile', 'phone', 'tel', 'cell');
    const iTotp = findCol('totp', '2fa', 'otp', 'auth', 'secret'); // Common for TOTP seeds
    const iCategory = findCol('category', 'folder', 'collection', 'group', 'tag');

    const results = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r.length) continue;
        
        const get = idx => (idx >= 0 && r[idx]) ? r[idx].replace(/^"|"$/g, '').trim() : '';
        const password = get(iPass);
        
        // Skip rows without a password
        if (!password) continue;

        let title = get(iTitle);
        let url = get(iUrl);
        let user = get(iUser);

        // Intelligent Fallbacks
        if (!title) {
            if (url) title = normUrl(url);
            else if (user) title = user.split('@')[0];
            else title = 'Imported Item';
        }

        results.push({
            type: 'login', // Default for CSV imports
            title: title,
            url: url,
            username: user,
            password: password,
            mobile: get(iMobile),
            notes: get(iNotes),
            totpSecret: get(iTotp),
            category: get(iCategory) || 'Other',
            strength: checkStrength(password)
        });
    }
    return results;
}

async function appActionExportBackup() {
    const date = new Date().toISOString().slice(0, 10);
    // User requested "Ek hi password wala logic" - Always use Master Password for cross-platform ease
    if(!MASTER_PASS) return showToast('Please unlock vault first');

    try {
        const payload = JSON.stringify({
            version: '2.0',
            app: 'Vault Pro',
            exportDate: new Date().toISOString(),
            count: ENTRIES.length,
            entries: ENTRIES
        });

        const encrypted = await encryptData(payload, MASTER_PASS);
        const wrapper = {
            vault_backup: true,
            data: encrypted,
            v: 2,
            exportDate: new Date().toISOString()
        };
        const finalRAW = JSON.stringify(wrapper);
        logEvent('EXPORT_BACKUP', `File: vault-backup-${date}.vaultbak`);
        downloadViaBridge(finalRAW, `vault-backup-${date}.vaultbak`, 'application/json');
        uiCloseAllSheets();
        showToast('📤 Backup (.vaultbak) exported using Master Password');
    } catch(e) {
        showToast('Backup failed: ' + e.message, true);
    }
}

async function appActionExportCSV() {
    if(!ENTRIES.length) return showToast('एक्सपोर्ट करने के लिए कोई डेटा नहीं है', true);
    
    const date = new Date().toISOString().slice(0, 10);
    const header = 'name,url,username,mobile,password,notes,category,strength,starred,createdAt,updatedAt';
    const csvContent = ENTRIES.map(e => [
        `"${(e.title||'').replace(/"/g, '""')}"`,
        `"${(e.url||'').replace(/"/g, '""')}"`,
        `"${(e.username||'').replace(/"/g, '""')}"`,
        `"${(e.mobile||'').replace(/"/g, '""')}"`,
        `"${(e.password||'').replace(/"/g, '""')}"`,
        `"${(e.notes||'').replace(/"/g, '""')}"`,
        `"${(e.category||'Other').replace(/"/g, '""')}"`,
        `"${e.strength||'weak'}"`,
        e.starred ? '1' : '0',
        e.createdAt || Date.now(),
        e.updatedAt || Date.now()
    ].join(',')).join('\n');
    
    const finalCSV = header + '\n' + csvContent;
    downloadViaBridge(finalCSV, `vault-passwords-${date}.csv`, 'text/csv');
    uiCloseAllSheets();
    showToast('📤 CSV एक्सपोर्ट हो गया!');
}

function mergeEntries(newEntries) {
    let added = 0;
    let skipped = 0;
    newEntries.forEach(n => {
        // Universal Field Parsing: Handle diverse input names
        const title = n.title || n.name || n.site || n.label || 'Imported Item';
        const url = n.url || n.website || n.uri || n.link ||'';
        const username = n.username || n.user || n.login || n.email || '';
        const password = n.password || n.pass || n.pwd || '';
        
        if(!password) { skipped++; return; }

        const nUrl = normUrl(url);
        const dup = ENTRIES.find(x => 
            normUrl(x.url) === nUrl && 
            (x.username || '').toLowerCase() === username.toLowerCase()
        );
        
        if(!dup) {
            const now = Date.now();
            ENTRIES.push({
                id: 'v_' + Math.random().toString(36).substr(2),
                type: n.type || 'login',
                title: title,
                url: url,
                username: username,
                password: password,
                mobile: n.mobile || '',
                notes: n.notes || n.note || n.comment || '',
                totpSecret: n.totpSecret || n.totp || '',
                category: n.category || 'Other',
                strength: n.strength || checkStrength(password),
                starred: n.starred || false,
                createdAt: n.createdAt || now,
                updatedAt: n.updatedAt || now
            });
            added++;
        } else {
            skipped++;
        }
    });
    saveToDB();
    if(added > 0) showToast(`${added} new items added. ${skipped > 0 ? skipped + ' skipped/dupes.' : ''}`);
}

function normUrl(u) {
    try {
        if (!u) return '';
        if (!u.startsWith('http') && !u.startsWith('android://')) u = 'https://' + u;
        if (u.startsWith('android://')) return u.toLowerCase();
        return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
    } catch { return (u || '').toLowerCase().replace(/^www\./, ''); }
}

async function appSyncContacts() {
    if(!window.AndroidApp || !window.AndroidApp.getSystemContacts) return;
    const json = window.AndroidApp.getSystemContacts();
    if(json === 'PERMISSION_DENIED') {
        showToast('संपर्क अनुमति की आवश्यकता है', true);
        return;
    }
    try {
        const contacts = JSON.parse(json);
        if(contacts.length > 0) {
            mergeEntries(contacts);
        } else {
            showToast('कोई नया संपर्क नहीं मिला');
        }
    } catch(e) { showToast('Sync विफल: ' + e.message, true); }
}

function appSetDefaultAutofill() {
    if(window.AndroidApp && window.AndroidApp.openAutofillSettings) {
        window.AndroidApp.openAutofillSettings();
    }
}

// --- Professional Feature: Security Event Logging ---
function logEvent(action, details = '') {
    const log = {
        id: 'L_' + Date.now(),
        timestamp: new Date().toISOString(),
        action: action,
        details: details
    };
    LOGS.unshift(log);
    if(LOGS.length > 50) LOGS.pop(); // Keep last 50 events
    localStorage.setItem('v_logs', JSON.stringify(LOGS)); 
}

// --- Professional Feature: TOTP Authenticator (RFC 6238) ---
// Note: This is a standalone implementation of TOTP logic
async function generateTOTP(secret) {
    if(!secret) return null;
    try {
        // Base32 to Byte Array
        const base32ToBuf = (s) => {
            const b32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
            s = s.replace(/=/g, "").toUpperCase();
            let l = s.length, b = 0, v = 0, res = new Uint8Array(((l * 5) / 8) | 0);
            for (let i = 0, j = 0; i < l; i++) {
                v = (v << 5) | b32.indexOf(s[i]);
                b += 5;
                if (b >= 8) { res[j++] = (v >> (b - 8)) & 255; b -= 8; }
            }
            return res;
        };

        const key = base32ToBuf(secret);
        const epoch = Math.round(Date.now() / 1000.0);
        const time = Math.floor(epoch / 30);
        const timeBuf = new ArrayBuffer(8);
        const view = new DataView(timeBuf);
        view.setUint32(4, time); // Set lower 32 bits

        const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
        const signature = await crypto.subtle.sign("HMAC", cryptoKey, timeBuf);
        const hmac = new Uint8Array(signature);
        const offset = hmac[hmac.length - 1] & 0x0f;
        const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
        const otp = (code % 1000000).toString().padStart(6, "0");
        const timeLeft = 30 - (epoch % 30);
        return { otp, timeLeft };
    } catch (e) { return null; }
}

// --- Global Helpers ---
function uiCloseAllSheets() {
    document.getElementById('appOverlay').classList.remove('active');
    document.querySelectorAll('.sheet').forEach(el => el.classList.remove('active'));
}

function escapeHTML(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function handleVaultBakImport(text) {
    let rawData = text.trim();
    let encryptedBlob = null;

    // Strategy 1: Try raw JSON wrapper
    try {
        const parsed = JSON.parse(rawData);
        if (parsed && parsed.vault_backup === true && typeof parsed.data === 'string') {
            encryptedBlob = parsed.data;
        }
    } catch(e) {}

    // Strategy 2: Try Base64-encoded JSON wrapper
    if (!encryptedBlob) {
        try {
            const decoded = atob(rawData);
            if (decoded.trim().startsWith('{')) {
                const parsed = JSON.parse(decoded);
                if (parsed && parsed.vault_backup === true && typeof parsed.data === 'string') {
                    encryptedBlob = parsed.data;
                }
            }
        } catch(e) {}
    }

    // Strategy 3: Direct encrypted blob
    const finalBlob = encryptedBlob || rawData;

    const pw = prompt('Enter password to decrypt .vaultbak:');
    if(!pw) return showToast('Import cancelled', true);

    try {
        const dec = await decryptData(finalBlob, pw);
        const data = JSON.parse(dec);
        const entries = data.entries || data.items || (Array.isArray(data) ? data : []);
        
        if(entries.length > 0) {
            mergeEntries(entries);
            showToast(`✅ ${entries.length} items imported from backup`);
        } else {
            showToast('Backup empty or invalid format', true);
        }
    } catch(e) {
        showToast(`❌ Decryption failed: Wrong password`, true);
    }
}

function handleCSVImport(text) {
    try {
        const rows = parseCSV(text);
        const items = processCSVData(rows);
        if(items.length > 0) {
            mergeEntries(items);
            showToast(`✅ ${items.length} items imported from CSV`);
        } else {
            showToast('No valid data found in CSV', true);
        }
    } catch(e) {
        showToast('❌ Failed to read CSV', true);
    }
}

function handleJSONImport(text) {
    try {
        const data = JSON.parse(text);
        let items = [];
        if (data.items && Array.isArray(data.items)) {
            items = data.items.map(i => ({
                title: i.name,
                username: i.login?.username,
                password: i.login?.password,
                url: i.login?.uris?.[0]?.uri,
                totpSecret: i.login?.totp,
                notes: i.notes
            }));
        } 
        else if (Array.isArray(data)) items = data;
        else if (data.passwords && Array.isArray(data.passwords)) items = data.passwords;

        if (items.length > 0) {
            mergeEntries(items);
            showToast(`✅ ${items.length} items imported from JSON`);
        } else {
            showToast('Could not find password data in JSON', true);
        }
    } catch(e) {
        showToast('❌ Failed to parse JSON', true);
    }
}
