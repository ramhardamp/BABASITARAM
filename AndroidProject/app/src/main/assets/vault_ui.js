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

    // Type Badge
    const typeNames = { login: '🔐 Login', card: '💳 Card', identity: '🆔 Identity', note: '📝 Note' };
    const typeLabel = typeNames[item.type] || '🔐 Login';

    let html = `
        <div style="background:var(--brand-primary); color:white; font-size:10px; padding:2px 8px; border-radius:10px; width:fit-content; margin-bottom:12px; font-weight:700;">${typeLabel}</div>
    `;

    if(item.type === 'card') {
        html += `
            <div class="input-label">Card Number</div>
            <div class="read-field" onclick="copyToClip('${escapeHTML(item.cardNumber)}')">
                <div class="read-text mono">${escapeHTML(item.cardNumber)}</div>
                <button class="icon-btn" style="border:none">📋</button>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
                <div>
                   <div class="input-label">Expiry</div>
                   <div class="read-field"><div class="read-text">${escapeHTML(item.cardExp)}</div></div>
                </div>
                <div>
                   <div class="input-label">CVV</div>
                   <div class="read-field" onclick="copyToClip('${escapeHTML(item.cardCvv)}')">
                       <div class="read-text">•••</div>
                       <button class="icon-btn" style="border:none">📋</button>
                   </div>
                </div>
            </div>
        `;
    } else if(item.type === 'identity') {
        html += `
            <div class="input-label">ID Number</div>
            <div class="read-field" onclick="copyToClip('${escapeHTML(item.idNumber)}')">
                <div class="read-text mono">${escapeHTML(item.idNumber)}</div>
                <button class="icon-btn" style="border:none">📋</button>
            </div>
        `;
    }

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
    <div id="historyArea" style="display:none; margin-top:16px;"></div>
    <div style="display:flex; gap:12px; margin-top:24px">
        <button class="btn btn-secondary" style="flex:1" onclick="toggleHistory('${id}')">⏳ History</button>
        <button class="btn btn-primary" style="flex:1" onclick="appEditItem('${id}')">✏️ Edit</button>
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
        document.getElementById('editType').value = 'login';
        document.getElementById('editTitle').value = '';
        document.getElementById('editUser').value = '';
        document.getElementById('editMobile').value = '';
        document.getElementById('editPass').value = '';
        document.getElementById('editTotp').value = '';
        document.getElementById('editCategory').value = 'Other';
        document.getElementById('editUrl').value = '';
        document.getElementById('editNotes').value = '';
        
        document.getElementById('editCardName').value = '';
        document.getElementById('editCardNumber').value = '';
        document.getElementById('editCardExp').value = '';
        document.getElementById('editCardCvv').value = '';
        document.getElementById('editIdNumber').value = '';

        document.getElementById('editHeaderTitle').textContent = 'नया आइटम';
        document.getElementById('editDeleteBtn').style.display = 'none';
        uiUpdateTemplateFields();
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
    document.getElementById('editType').value = item.type || 'login';
    document.getElementById('editTitle').value = item.title || '';
    document.getElementById('editUser').value = item.username || '';
    document.getElementById('editMobile').value = item.mobile || '';
    document.getElementById('editPass').value = item.password || '';
    document.getElementById('editTotp').value = item.totpSecret || '';
    document.getElementById('editCategory').value = item.category || 'Other';
    document.getElementById('editUrl').value = item.url || '';
    document.getElementById('editNotes').value = item.notes || '';
    
    document.getElementById('editCardName').value = item.cardName || '';
    document.getElementById('editCardNumber').value = item.cardNumber || '';
    document.getElementById('editCardExp').value = item.cardExp || '';
    document.getElementById('editCardCvv').value = item.cardCvv || '';
    document.getElementById('editIdNumber').value = item.idNumber || '';

    uiUpdateTemplateFields();
    document.getElementById('editDeleteBtn').style.display = 'block';
    document.getElementById('editUrl').value = item.url || '';
    document.getElementById('editNotes').value = item.notes || '';
    
    document.getElementById('editDeleteBtn').style.display = 'flex';
    appUpdateStrengthMeter();
    
    // Swap sheets
    document.getElementById('sheetReadItem').classList.remove('active');
    document.getElementById('sheetEditItem').classList.add('active');
}

function openAuditSheet() {
    const weakItems = ENTRIES.filter(e => checkStrength(e.password) === 'weak');
    const reusedItems = findReusedPasswords();
    const score = calculateSecurityScore();
    
    let html = `
        <div style="background:var(--bg-elevated); padding:20px; border-radius:var(--radius-lg); margin-bottom:24px; text-align:center; border:1px solid var(--border);">
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase; letter-spacing:1px;">Vault Health Score</div>
            <div style="font-size:42px; font-weight:800; color:${score < 80 ? 'var(--warning)' : 'var(--brand-secondary)'};">${score}%</div>
            <div style="font-size:13px; color:var(--text-secondary); margin-top:4px;">${score === 100 ? 'Your vault is bulletproof!' : 'Some improvements suggested.'}</div>
        </div>

        <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin:0 4px 12px; text-transform:uppercase;">Critical Issues</div>
        
        <div class="read-field" style="margin-bottom:12px; border-left:4px solid var(--error);">
            <div style="font-size:20px;">⚠️</div>
            <div style="flex:1">
                <div style="font-size:15px; font-weight:700;">Weak Passwords</div>
                <div style="font-size:12px; color:var(--text-muted);">${weakItems.length} items have insecure passwords</div>
            </div>
        </div>
        
        <div class="read-field" style="margin-bottom:24px; border-left:4px solid var(--warning);">
            <div style="font-size:20px;">🔄</div>
            <div style="flex:1">
                <div style="font-size:15px; font-weight:700;">Reused Passwords</div>
                <div style="font-size:12px; color:var(--text-muted);">${reusedItems.length} items sharing same password</div>
            </div>
        </div>

        <button class="btn btn-primary" onclick="uiCloseAllSheets()">Got it</button>
    `;
    
    document.getElementById('auditBody').innerHTML = html;
    uiOpenSheet('sheetAudit');
}

function calculateSecurityScore() {
    if(!ENTRIES.length) return 100;
    
    let penalty = 0;
    const reused = findReusedPasswords();
    
    ENTRIES.forEach(e => {
        const pw = (e.password || '').toLowerCase();
        // 1. Weak length / pattern penalty
        if(checkStrength(e.password) === 'weak') penalty += 20;
        else if(checkStrength(e.password) === 'medium') penalty += 5;
        
        // 2. Breach penalty
        const isBreached = BREACHED_PATTERNS.some(p => pw.includes(p));
        if(isBreached) penalty += 30;
    });
    
    // 3. Reused penalty
    penalty += (reused.length * 10);

    const score = Math.max(0, 100 - (penalty / ENTRIES.length));
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

function refreshSecurityHub() {
    const score = calculateSecurityScore();
    const display = document.getElementById('vaultScoreDisplay');
    if(!display) return;
    
    display.textContent = score + '%';
    
    // Change color and pulse based on score
    const card = display.closest('.health-card');
    if(score < 50) {
        card.style.background = 'linear-gradient(135deg, #ef4444, #f87171)';
        card.classList.add('pulse');
    } else if(score < 80) {
        card.style.background = 'linear-gradient(135deg, #f59e0b, #fbbf24)';
        card.classList.remove('pulse');
    } else {
        card.style.background = 'var(--brand-gradient)';
        card.classList.remove('pulse');
    }
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

function openLogsSheet() {
    let html = `
        <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:16px; text-transform:uppercase; letter-spacing:1px;">Recent Activity (Last 50)</div>
        <div style="display:flex; flex-direction:column; gap:8px; max-height:60vh; overflow-y:auto;">
    `;

    if(!LOGS.length) {
        html += '<div class="empty-state">No logs recorded yet.</div>';
    } else {
        LOGS.forEach(l => {
            const date = new Date(l.timestamp).toLocaleString();
            html += `
                <div style="background:rgba(255,255,255,0.02); padding:12px; border-radius:var(--radius-md); border:1px solid var(--border);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="font-weight:700; font-size:13px; color:var(--brand-secondary);">${l.action}</span>
                        <span style="font-size:10px; color:var(--text-muted);">${date}</span>
                    </div>
                    <div style="font-size:12px; color:var(--text-secondary);">${escapeHTML(l.details)}</div>
                </div>
            `;
        });
    }

    html += `</div><button class="btn btn-primary" onclick="uiCloseAllSheets()" style="margin-top:20px;">Close Audit Log</button>`;
    document.getElementById('logsBody').innerHTML = html;
    uiOpenSheet('sheetLogs');
}

function toggleHistory(id) {
    const item = ENTRIES.find(x => x.id === id);
    const histArea = document.getElementById('historyArea');
    if(!item || !item.history || !item.history.length) return showToast('No history found');
    
    if(histArea.style.display === 'block') {
        histArea.style.display = 'none';
        return;
    }

    histArea.innerHTML = item.history.map(h => `
        <div style="background:rgba(255,255,255,0.02); padding:10px; border-radius:8px; border:1px solid var(--border); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <div style="font-size:10px; color:var(--text-muted);">${new Date(h.date).toLocaleDateString()}</div>
                <div style="font-family:monospace; font-size:13px;">••••••••</div>
            </div>
            <button class="icon-btn" onclick="copyToClip('${escapeHTML(h.password)}'); showToast('Old password copied')">📋</button>
        </div>
    `).join('');
    histArea.style.display = 'block';
}

function uiCloseSheet(id) {
    document.getElementById(id).classList.remove('active');
    if(id !== 'sheetAppSelector' && id !== 'sheetLogs' && id !== 'sheetGenerator') {
        uiCloseAllSheets();
    }
}

function uiUpdateTemplateFields() {
    const type = document.getElementById('editType').value;
    document.getElementById('tmplLogin').style.display = (type === 'login') ? 'block' : 'none';
    document.getElementById('tmplCard').style.display = (type === 'card') ? 'block' : 'none';
    document.getElementById('tmplIdentity').style.display = (type === 'identity') ? 'block' : 'none';
}

function uiOpenGenerator() {
    uiOpenSheet('sheetGenerator');
    uiGenerateCustom();
}

function uiGenerateCustom() {
    const len = parseInt(document.getElementById('genLen').value);
    const upper = document.getElementById('genUpper').checked;
    const num = document.getElementById('genNum').checked;
    const sym = document.getElementById('genSym').checked;
    
    let charset = "abcdefghijklmnopqrstuvwxyz";
    if(upper) charset += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if(num) charset += "0123456789";
    if(sym) charset += "!@#$%^&*()_+~`|}{[]:;?><,./-=";
    
    let retVal = "";
    const arr = new Uint32Array(len);
    window.crypto.getRandomValues(arr);
    for (let i = 0; i < len; ++i) {
        retVal += charset[arr[i] % charset.length];
    }
    document.getElementById('genDisplay').textContent = retVal;
}

function uiUseGenerated() {
    const val = document.getElementById('genDisplay').textContent;
    document.getElementById('editPass').value = val;
    uiCloseSheet('sheetGenerator');
    appUpdateStrengthMeter();
}
