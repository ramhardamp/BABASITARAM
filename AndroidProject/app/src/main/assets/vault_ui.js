// Continuation of BABASITARAM Vault - Professional Core Native JS Bridge & Crypto

// --- Item Reading ---
function appReadItem(id) {
    const item = ENTRIES.find(x => x.id === id);
    if(!item) return;

    document.getElementById('readTitle').textContent = item.title || 'Entry';
    
    // Setup Favorite toggle button logic
    const favBtn = document.getElementById('readFavBtn');
    favBtn.textContent = item.starred ? '★' : '☆';
    favBtn.onclick = () => {
        item.starred = !item.starred;
        favBtn.textContent = item.starred ? '★' : '☆';
        saveToDB();
        showToast(item.starred ? 'पसंदीदा में जोड़ा गया' : 'पसंदीदा से हटाया गया');
    };

    let html = '';
    if(item.username) {
        html += `
        <div class="input-label">Username / Email</div>
        <div class="read-field" onclick="copyToClip('${escapeHTML(item.username)}')">
            <div class="read-text">${escapeHTML(item.username)}</div>
            <button class="icon-btn" style="border:none">📋</button>
        </div>`;
    }
    
    if(item.mobile) {
        html += `
        <div class="input-label">Mobile Number</div>
        <div class="read-field" onclick="copyToClip('${escapeHTML(item.mobile)}')">
            <div class="read-text">${escapeHTML(item.mobile)}</div>
            <button class="icon-btn" style="border:none">📋</button>
        </div>`;
    }
    
    html += `
    <div class="input-label">Password</div>
    <div class="read-field" style="border-color: var(--brand-focus)">
        <div class="read-text mono" id="readPwDisp">••••••••</div>
        <button class="icon-btn" style="border:none" onclick="appToggleReadPw('${escapeHTML(item.password)}')">👁</button>
        <button class="icon-btn" style="border:none" onclick="copyToClip('${escapeHTML(item.password)}')">📋</button>
    </div>`;
    
    if(item.totpSecret) {
        html += `
        <div class="input-label">TOTP Code (2FA) <span id="totpTimer" style="font-size:10px;color:var(--brand-secondary)"></span></div>
        <div class="read-field" style="background: rgba(139, 92, 246, 0.1); border-color: var(--brand-primary);">
            <div class="read-text mono" id="readTotpDisp" style="font-size: 24px; color: var(--brand-secondary); letter-spacing: 4px;">------</div>
            <button class="icon-btn" style="border:none" id="totpCopyBtn">📋</button>
        </div>`;
        // Start live TOTP
        setTimeout(() => updateLiveTotp(item.totpSecret), 10);
    }
    
    if(item.url) {
        html += `
        <div class="input-label">Website URL</div>
        <div class="read-field">
            <div class="read-text"><a href="${escapeHTML(item.url)}" target="_blank" style="color:var(--brand-secondary);text-decoration:none">${escapeHTML(item.url)}</a></div>
            <button class="icon-btn" style="border:none" onclick="copyToClip('${escapeHTML(item.url)}')">📋</button>
        </div>`;
    }
    
    if(item.notes) {
        html += `
        <div class="input-label">Notes</div>
        <div class="read-field" style="align-items:flex-start">
            <div class="read-text" style="font-size:13px;white-space:pre-wrap">${escapeHTML(item.notes)}</div>
        </div>`;
    }

    html += `
    <div style="display:flex; gap:12px; margin-top:24px">
        <button class="btn btn-" style="flex:1" onclick="appEditItem('${id}')">✏️ Edit</button>
    </div>`;

    document.getElementById('readBody').innerHTML = html;
    uiOpenSheet('sheetReadItem');
}

function appToggleReadPw(rawPw) {
    const el = document.getElementById('readPwDisp');
    if(el.textContent === '••••••••') {
        el.textContent = rawPw;
    } else {
        el.textContent = '••••••••';
    }
}

function uiOpenSheet(id) {
    document.getElementById('appOverlay').classList.add('active');
    document.getElementById(id).classList.add('active');
    
    if(id === 'sheetEditItem' && !window.editingId) {
        document.getElementById('editTitle').value = '';
        document.getElementById('editUser').value = '';
        document.getElementById('editMobile').value = '';
        document.getElementById('editPass').value = '';
        document.getElementById('editTotp').value = '';
        document.getElementById('editCategory').value = 'Other';
        document.getElementById('editUrl').value = '';
        document.getElementById('editNotes').value = '';
        document.getElementById('editHeaderTitle').textContent = 'नया आइटम';
        document.getElementById('editDeleteBtn').style.display = 'none';
        appUpdateStrengthMeter();
    }
}

let TOTP_INTERVAL = null;
async function updateLiveTotp(secret) {
    if(TOTP_INTERVAL) clearInterval(TOTP_INTERVAL);
    
    const tick = async () => {
        const res = await VaultTOTP.generate(secret);
        const disp = document.getElementById('readTotpDisp');
        const timer = document.getElementById('totpTimer');
        const btn = document.getElementById('totpCopyBtn');
        
        if(!disp) { clearInterval(TOTP_INTERVAL); return; }
        
        if(res) {
            disp.textContent = res.code.slice(0,3) + ' ' + res.code.slice(3);
            timer.textContent = `Expires in ${res.remaining}s`;
            btn.onclick = () => copyToClip(res.code);
        } else {
            disp.textContent = 'INVALID';
            timer.textContent = '';
        }
    };
    
    await tick();
    TOTP_INTERVAL = setInterval(tick, 1000);
}


function appEditItem(id) {
    const item = ENTRIES.find(x => x.id === id);
    if(!item) return;
    
    window.editingId = id;
    document.getElementById('editHeaderTitle').textContent = 'आइटम संपादित करें';
    document.getElementById('editTitle').value = item.title || '';
    document.getElementById('editUser').value = item.username || '';
    document.getElementById('editMobile').value = item.mobile || '';
    document.getElementById('editPass').value = item.password || '';
    document.getElementById('editTotp').value = item.totpSecret || '';
    document.getElementById('editCategory').value = item.category || 'Other';
    document.getElementById('editUrl').value = item.url || '';
    document.getElementById('editNotes').value = item.notes || '';
    
    document.getElementById('editDeleteBtn').style.display = 'flex';
    appUpdateStrengthMeter();
    
    // Swap sheets
    document.getElementById('sheetReadItem').classList.remove('active');
    document.getElementById('sheetEditItem').classList.add('active');
}

function openAuditSheet() {
    const weak = ENTRIES.filter(e => checkStrength(e.password) === 'weak').length;
    const reused = findReusedPasswords().length;
    
    let html = `
        <div style="background:var(--bg-base); padding:16px; border-radius:var(--radius-lg); margin-bottom:20px; border:1px solid var(--border);">
            <div style="font-size:13px; color:var(--text-muted); margin-bottom:4px;">सुरक्षा स्कोर</div>
            <div style="font-size:24px; font-weight:800; color:var(--brand-secondary);">${calculateSecurityScore()}%</div>
        </div>
        
        <div class="item-card" style="margin-bottom:12px; cursor:default;">
            <div class="item-avatar" style="background:var(--error-bg); color:var(--error);">⚠️</div>
            <div class="item-details">
                <div class="item-title">कमजोर पासवर्ड</div>
                <div class="item-sub">${weak} पासवर्ड असुरक्षित पाए गए</div>
            </div>
        </div>
        
        <div class="item-card" style="margin-bottom:12px; cursor:default;">
            <div class="item-avatar" style="background:var(--warning-bg); color:var(--warning);">🔄</div>
            <div class="item-details">
                <div class="item-title">दोहराए गए पासवर्ड</div>
                <div class="item-sub">${reused} पासवर्ड एक से ज्यादा जगह इस्तेमाल हुए</div>
            </div>
        </div>
    `;
    
    document.getElementById('auditBody').innerHTML = html;
    uiOpenSheet('sheetAudit');
}

function calculateSecurityScore() {
    if(!ENTRIES.length) return 100;
    const weak = ENTRIES.filter(e => checkStrength(e.password) === 'weak').length;
    const score = Math.max(0, 100 - (weak / ENTRIES.length * 100));
    return Math.round(score);
}

function findReusedPasswords() {
    const map = {};
    ENTRIES.forEach(e => {
        if(!map[e.password]) map[e.password] = [];
        map[e.password].push(e);
    });
    return Object.values(map).filter(arr => arr.length > 1).flat();
}

// --- Dynamic Form Helpers ---
function appTogglePassVis(id) {
    const el = document.getElementById(id);
    if(el.type === 'password') el.type = 'text';
    else el.type = 'password';
}

function appGeneratePassword() {
    const U='ABCDEFGHJKLMNPQRSTUVWXYZ', L='abcdefghjkmnpqrstuvwxyz', D='23456789', S='!@#$%&*';
    let p = U[~~(Math.random()*U.length)] + L[~~(Math.random()*L.length)] + D[~~(Math.random()*D.length)] + S[~~(Math.random()*S.length)];
    const all = U+L+D+S;
    for(let i=0;i<12;i++) p+=all[~~(Math.random()*all.length)];
    p = p.split('').sort(()=>Math.random()-.5).join('');
    
    const el = document.getElementById('editPass');
    el.value = p;
    el.type = 'text';
    appUpdateStrengthMeter();
    showToast('सुरक्षित पासवर्ड जनरेट हो गया');
}

function appUpdateStrengthMeter() {
    const pw = document.getElementById('editPass').value;
    const str = checkStrength(pw);
    
    const bars = [
        document.getElementById('strM1'),
        document.getElementById('strM2'),
        document.getElementById('strM3'),
        document.getElementById('strM4')
    ];
    
    // Reset
    bars.forEach(b => b.className = 'strength-bar');
    
    if(!pw) return;
    
    if(str === 'weak') {
        bars[0].className = 'strength-bar weak';
    } else if(str === 'medium') {
        bars[0].className = 'strength-bar medium';
        bars[1].className = 'strength-bar medium';
    } else if(str === 'strong') {
        bars[0].className = 'strength-bar strong';
        bars[1].className = 'strength-bar strong';
        bars[2].className = 'strength-bar strong';
        bars[3].className = 'strength-bar strong';
    }
}

// --- App Selector System ---
let ALL_APPS = [];

function uiOpenAppSelector() {
    if (window.AndroidApp && window.AndroidApp.getInstalledApps) {
        try {
            // Fix: Fetch all apps properly and render immediately
            const json = window.AndroidApp.getInstalledApps();
            ALL_APPS = JSON.parse(json);
            ALL_APPS.sort((a,b) => a.name.localeCompare(b.name));
            uiRenderAppList();
            uiOpenSheet('sheetAppSelector');
        } catch(e) {
            showToast('Apps लोड करने में एरर', true);
        }
    } else {
        showToast('यह फीचर केवल Android App में उपलब्ध है');
    }
}

function uiRenderAppList(query = '') {
    const q = query.toLowerCase();
    const area = document.getElementById('appListArea');
    const filtered = ALL_APPS.filter(a => a.name.toLowerCase().includes(q) || a.pkg.toLowerCase().includes(q));
    
    area.innerHTML = filtered.map(app => `
        <div class="item-card" onclick="uiSelectApp('${app.name}', '${app.pkg}')" style="padding: 12px; margin-bottom: 8px;">
            <div class="item-avatar" style="width: 44px; height: 44px; background: none; border: none;">
                ${app.icon ? `<img src="${app.icon}" class="app-icon-img">` : `<div class="item-avatar">${app.name[0]}</div>`}
            </div>
            <div class="item-details">
                <div class="item-title" style="font-size: 15px; font-weight: 600;">${app.name}</div>
                <div class="item-sub" style="font-size: 11px;">${app.pkg}</div>
            </div>
        </div>
    `).join('') || '<div class="empty-state">कोई App नहीं मिला</div>';
}

function uiSelectApp(name, pkg) {
    document.getElementById('editTitle').value = name;
    document.getElementById('editUrl').value = 'android://' + pkg;
    uiCloseSheet('sheetAppSelector');
    showToast(`${name} लिंक किया गया`);
}

function uiCloseSheet(id) {
    document.getElementById(id).classList.remove('active');
    if(id !== 'sheetAppSelector') {
        uiCloseAllSheets();
    }
}
