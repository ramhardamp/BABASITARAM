// passwords.js — Dashboard v6 — URL Groups + Stats + Bulk Delete
(async function () {

  // ══ STATE ══
  let _isSaving = false; // sync guard
  let allEntries = [];
  let displayEntries = [];
  let expandedId = null;
  let editingId = null;
  let pendingDeleteId = null;
  let selectedIds = new Set();
  let selectMode = false;
  let currentView = 'grouped';
  let currentFilter = 'all';
  let openGroups = new Set();

  // ══ DOM ══
  const searchInput = document.getElementById('searchInput');
  const btnAddNew = document.getElementById('btnAddNew');
  const pwList = document.getElementById('pwList');
  const emptyState = document.getElementById('emptyState');
  const listView = document.getElementById('listView');
  const lockedScreen = document.getElementById('lockedScreen');
  const btnGoUnlock = document.getElementById('btnGoUnlock');
  const breachBanner = document.getElementById('breachBanner');
  const breachCountEl = document.getElementById('breachCount');
  const tCount = document.getElementById('tCount');

  const sAll = document.getElementById('sAll');
  const sBreach = document.getElementById('sBreach');
  const sWeak = document.getElementById('sWeak');
  const sMed = document.getElementById('sMed');
  const sStrong = document.getElementById('sStrong');
  const sMobiles = document.getElementById('sMobiles');
  const sSites = document.getElementById('sSites');
  const statBreach = document.getElementById('statBreach');

  const viewGrouped = document.getElementById('viewGrouped');
  const viewFlat = document.getElementById('viewFlat');
  const filterSel = document.getElementById('filterSel');

  const editModal = document.getElementById('editModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalClose = document.getElementById('modalClose');
  const fieldTitle = document.getElementById('fieldTitle');
  const fieldUrl = document.getElementById('fieldUrl');
  const fieldUsername = document.getElementById('fieldUsername');
  const fieldPassword = document.getElementById('fieldPassword');
  const fieldNotes = document.getElementById('fieldNotes');
  const fieldMobile = document.getElementById('fieldMobile');
  const toggleModalPw = document.getElementById('toggleModalPw');
  const eyeShow = document.getElementById('eyeShow');
  const eyeHide = document.getElementById('eyeHide');
  const btnGenPw = document.getElementById('btnGenPw');
  const btnModalCancel = document.getElementById('btnModalCancel');
  const btnModalSave = document.getElementById('btnModalSave');
  const sidePanelBtn = document.getElementById('sidePanelBtn');
  const modalStrMt = document.getElementById('modalStrMt');
  const modalStrTxt = document.getElementById('modalStrTxt');
  const ms = [document.getElementById('ms1'), document.getElementById('ms2'), document.getElementById('ms3')];

  const deleteModal = document.getElementById('deleteModal');
  const btnDeleteCancel = document.getElementById('btnDeleteCancel');
  const btnDeleteConfirm = document.getElementById('btnDeleteConfirm');
  const deleteDesc = document.getElementById('deleteDesc');

  const btnSelectMode = document.getElementById('btnSelectMode');
  const btnCancelSelect = document.getElementById('btnCancelSelect');
  const selectBar = document.getElementById('selectBar');
  const selectAllChk = document.getElementById('selectAllChk');
  const selectCount = document.getElementById('selectCount');
  const btnBulkDelete = document.getElementById('btnBulkDelete');
  const bulkDeleteModal = document.getElementById('bulkDeleteModal');
  const bulkDelCount = document.getElementById('bulkDelCount');
  const bulkDelDesc = document.getElementById('bulkDelDesc');
  const btnBulkDelCancel = document.getElementById('btnBulkDelCancel');
  const btnBulkDelConfirm = document.getElementById('btnBulkDelConfirm');

  // ══ PIN LOCK ══
  async function showPinOverlay() {
    const data = await new Promise(res => chrome.storage.local.get(['vault_pin_hash'], r => res(r)));
    if (!data.vault_pin_hash) return true;

    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.id = '__pin_overlay__';
      overlay.style.cssText = `position:fixed;inset:0;background:#07070a;z-index:99999;
        display:flex;align-items:center;justify-content:center;
        font-family:'Plus Jakarta Sans','JetBrains Mono',sans-serif;`;
      overlay.innerHTML = `
        <div style="background:rgba(23,23,33,0.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);
          border-radius:24px;padding:40px 32px;max-width:320px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.6);">
          <div style="font-size:48px;margin-bottom:12px;filter:drop-shadow(0 0 10px rgba(251,191,36,0.2));">🔐</div>
          <div style="font-size:18px;font-weight:400;color:#7dd3fc;margin-bottom:4px;letter-spacing:1px;font-family:'JetBrains Mono';">BABASITARAM v5.0</div>
          <div style="font-size:12px;color:#444;margin-bottom:24px;font-family:'JetBrains Mono';">Dashboard protected hai</div>
          
          <div style="display:flex;justify-content:center;gap:16px;margin-bottom:24px;" id="__dots__">
            <div style="width:12px;height:12px;border-radius:50%;border:2px solid rgba(255,255,255,0.1);"></div>
            <div style="width:12px;height:12px;border-radius:50%;border:2px solid rgba(255,255,255,0.1);"></div>
            <div style="width:12px;height:12px;border-radius:50%;border:2px solid rgba(255,255,255,0.1);"></div>
            <div style="width:12px;height:12px;border-radius:50%;border:2px solid rgba(255,255,255,0.1);"></div>
          </div>

          <input id="__pin_in__" type="password" inputmode="numeric" maxlength="4" placeholder="••••"
            style="width:100%;box-sizing:border-box;text-align:center;letter-spacing:12px;font-size:24px;
            font-weight:800;padding:14px;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.05);border-radius:12px;
            color:#fff;outline:none;margin-bottom:8px;font-family:'JetBrains Mono';">
          
          <div id="__pin_err__" style="font-size:11px;color:#f43f5e;min-height:16px;margin-bottom:12px;font-family:'JetBrains Mono';"></div>
          
          <button id="__pin_ok__" style="width:100%;padding:14px;background:linear-gradient(135deg,#c084fc,#fbbf24);
            border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:800;cursor:pointer;margin-bottom:10px;box-shadow:0 8px 24px rgba(192,132,252,0.2);">
            ✓ Unlock Dashboard
          </button>
          <button id="__pin_x__" style="width:100%;padding:10px;background:none;
            border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:#555;font-size:12px;cursor:pointer;font-weight:600;">
            ✕ Wapas Jao
          </button>
        </div>`;
      document.body.appendChild(overlay);

      const inp = overlay.querySelector('#__pin_in__');
      const errEl = overlay.querySelector('#__pin_err__');
      const okBtn = overlay.querySelector('#__pin_ok__');
      const xBtn = overlay.querySelector('#__pin_x__');
      const dotsDiv = overlay.querySelector('#__dots__');
      setTimeout(() => inp.focus(), 80);

      function updateDots() {
        const val = inp.value;
        const dots = dotsDiv.children;
        for (let i = 0; i < 4; i++) {
          if (i < val.length) {
            dots[i].style.background = '#c084fc';
            dots[i].style.borderColor = '#c084fc';
            dots[i].style.boxShadow = '0 0 10px #c084fc';
          } else {
            dots[i].style.background = 'transparent';
            dots[i].style.borderColor = 'rgba(255,255,255,0.1)';
            dots[i].style.boxShadow = 'none';
          }
        }
      }

      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/\D/g, '').slice(0, 4);
        updateDots();
        if (inp.value.length === 4) setTimeout(verify, 150);
      });

      async function verify() {
        const val = inp.value.trim();
        if (val.length !== 4) return;
        okBtn.disabled = true;
        inp.style.opacity = '0.5';
        errEl.textContent = '🔑 Verifying...';
        errEl.style.color = '#fbbf24';
        try {
          // ✅ SPEED FIX: verifyMaster (600k PBKDF2) hataya — decrypt se hi verify ho jaata hai
          // Wrong PIN → AES-GCM OperationError → catch block
          // Pehle: 600k iterations (2-4 sec freeze)
          // Ab: 600k iterations decrypt only (~800ms smooth)
          const encMp = (await new Promise(res => chrome.storage.local.get(['vault_pin_enc_mp'], r => res(r)))).vault_pin_enc_mp;
          if (!encMp) { errEl.style.color='#f43f5e'; errEl.textContent = '❌ PIN data missing — dobara set karo'; return; }
          await VaultCrypto.decrypt(encMp, val + chrome.runtime.id);
          // Decrypt succeeded → PIN sahi hai
          errEl.textContent = '✅ Unlocked!';
          errEl.style.color = '#22d3a5';
          setTimeout(() => { overlay.remove(); resolve(true); }, 200);
        } catch (e) {
          errEl.style.color = '#f43f5e';
          errEl.textContent = '❌ Galat PIN — dobara try karo';
          inp.value = '';
          updateDots();
          inp.focus();
        } finally {
          okBtn.disabled = false;
          inp.style.opacity = '1';
        }
      }

      okBtn.addEventListener('click', verify);
      inp.addEventListener('keypress', e => { if (e.key === 'Enter') verify(); });
      xBtn.addEventListener('click', () => { overlay.remove(); resolve(false); window.close(); });
    });
  }

  // ══ INIT ══
  async function init() {
    // Sidepanel — bind once
    if (sidePanelBtn && !sidePanelBtn._bound) {
      sidePanelBtn._bound = true;
      sidePanelBtn.addEventListener('click', () => {
        if (chrome.sidePanel) {
          chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true });
          chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT }).catch(() => {
            showToast('📑 Side Panel ko Chrome settings se enable karein');
          });
        }
      });
    }

    try {
      const sess = await checkSessionFull();

      if (sess && sess.ok && sess.masterPassword) {
        // ✅ Unlocked — list dikhao, loader chupa do
        lockedScreen.classList.remove('show');
        pwList.style.display = 'block';
        _masterPw = sess.masterPassword;
        await loadEntries(sess);
      } else {
        // ❌ Locked — pehle PIN check karo
        const pinEnabled = await new Promise(res =>
          chrome.storage.local.get(['vault_pin_enabled'], r => res(r.vault_pin_enabled))
        );

        if (pinEnabled) {
          // Hide loader while showing PIN overlay
          const ldr = document.getElementById('mainLoader');
          if (ldr) ldr.style.display = 'none';

          const pinOk = await showPinOverlay();
          if (pinOk) {
            init(); // re-init after pin unlock
            return;
          }
        }

        // Show locked screen
        const ldr = document.getElementById('mainLoader');
        if (ldr) ldr.style.display = 'none';
        lockedScreen.classList.add('show');
        pwList.style.display = 'none';
      }
    } catch (err) {
      console.error('[Vault] Init error:', err);
      const ldr = document.getElementById('mainLoader');
      if (ldr) ldr.style.display = 'none';
      if (pwList) pwList.style.display = 'block';
      showLockWarning();
    }
  }

  async function checkSessionFull() {
    try {
      return await Promise.race([
        chrome.runtime.sendMessage({ type: 'GET_SESSION' }),
        new Promise((_, rej) => setTimeout(() => rej('Timeout'), 2500))
      ]);
    } catch (e) {
      return null;
    }
  }

  async function checkSession() {
    try {
      // In MV3, this returns a Promise. Add a 1s timeout to prevent hanging.
      const r = await Promise.race([
        chrome.runtime.sendMessage({ type: 'GET_SESSION' }),
        new Promise((_, rej) => setTimeout(() => rej('Timeout'), 2000))
      ]);
      return r && r.ok;
    } catch (e) {
      console.warn('[Vault] Session check failed/timeout:', e);
      return false;
    }
  }

  // Master password (fetched from background session, cached locally)
  let _masterPw = null;

  // Direct local storage helper
  function getLocalBlob(key) {
    return new Promise(resolve => chrome.storage.local.get([key], r => resolve(r[key] || null)));
  }

  // Save directly to storage (no background dependency — avoids SW termination bug)
  async function saveBlob(entries) {
    if (!_masterPw) throw new Error('No session');
    const blob = await VaultCrypto.encrypt(JSON.stringify(entries), _masterPw);
    await new Promise((res, rej) => chrome.storage.local.set({ vault_encrypted_blob: blob, vault_entries: null }, () => {
      chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res();
    }));
    // ✅ FIX: Background ka _memVault cache invalidate karo
    // Pehle yeh sirf GET_SESSION bhejta tha jo kuch nahi karta tha
    // Result: content.js autofill ko naye saved passwords nahi milte the
    chrome.runtime.sendMessage({ type: 'INVALIDATE_CACHE' }).catch(() => {});

    const settingsData = await new Promise(res => chrome.storage.local.get(['vault_settings'], r => res(r)));
    if (settingsData.vault_settings && settingsData.vault_settings.autoBackup) {
      setTimeout(() => { chrome.runtime.sendMessage({ type: 'AUTO_BACKUP' }).catch(() => {}); }, 500);
    }
  }

  // Show lock warning banner
  function showLockWarning() {
    if (document.getElementById('__lock_warn__')) return;
    const w = document.createElement('div');
    w.id = '__lock_warn__';
    w.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#ef4444;color:#fff;text-align:center;padding:10px 16px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:10px;';
    w.innerHTML = '🔒 Session expire ho gayi — dobara unlock karo';
    const btn = document.createElement('button');
    btn.textContent = '🔄 Reload';
    btn.style.cssText = 'background:#fff;color:#ef4444;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-weight:700;font-size:12px;';
    btn.onclick = () => window.location.reload();
    w.appendChild(btn);
    document.body.prepend(w);
  }

  async function loadEntries(providedSess = null) {
    try {
      const sess = providedSess || await checkSessionFull();

      if (!sess || !sess.ok || !sess.masterPassword) {
        // No session — hide loader, show lock warning
        _hideLoader();
        allEntries = []; renderAll(); showLockWarning();
        return;
      }

      _masterPw = sess.masterPassword;

      // ✅ Session mil gaya — ABHI loader hide karo, list show karo
      // User ko turant kuch dikhna chahiye, chahe data baad mein aaye
      _hideLoader();

      // Pehle seedha local blob se decrypt karo (reliable)
      try {
        const blob = await getLocalBlob('vault_encrypted_blob');
        if (blob) {
          const json = await VaultCrypto.decrypt(blob, _masterPw);
          allEntries = JSON.parse(json);
        } else {
          allEntries = [];
        }
      } catch (decryptErr) {
        console.warn('[Vault] Local decrypt failed, trying background...', decryptErr);
        // Fallback: background se try karo
        try {
          const res = await chrome.runtime.sendMessage({ type: 'GET_ALL_ENTRIES' });
          allEntries = (res && res.ok && res.entries) ? res.entries : [];
        } catch (bgErr) {
          console.error('[Vault] Both decrypt paths failed:', bgErr);
          allEntries = [];
        }
      }

    } catch (e) {
      console.error('[Vault] loadEntries failed:', e);
      _hideLoader();
      allEntries = [];
    }

    applyFilterSearch();
    updateStats();
  }

  function _hideLoader() {
    const loader = document.getElementById('mainLoader');
    if (loader) loader.style.display = 'none';
    if (pwList) pwList.style.display = 'block';
    listView.style.display = 'block';
  }

  // ══ FILTER + SEARCH ══
  function applyFilterSearch() {
    const rawQ = (searchInput.value || '').trim();
    const q = rawQ.toLowerCase();
    // Normalize search query — strip https://, www., trailing slash for domain match
    const qDom = normDomain(rawQ) || q;
    let base = [...allEntries];

    if (currentFilter === 'breach') base = base.filter(e => isBreach(e.password));
    else if (currentFilter === 'weak') base = base.filter(e => getStrength(e.password) === 'weak');
    else if (currentFilter === 'medium') base = base.filter(e => getStrength(e.password) === 'medium');
    else if (currentFilter === 'strong') base = base.filter(e => getStrength(e.password) === 'strong');
    else if (currentFilter === 'mobiles') base = base.filter(e => e.mobile);

    if (q) base = base.filter(e => {
      const eDom = normDomain(e.url);
      return (e.title || '').toLowerCase().includes(q) ||
        (e.username || '').toLowerCase().includes(q) ||
        (e.url || '').toLowerCase().includes(q) ||
        // Domain-level match: "chimathan.in" matches "https://chimathan.in/path"
        (qDom && eDom && (eDom.includes(qDom) || qDom.includes(eDom)));
    });

    displayEntries = base;
    expandedId = null;
    renderAll();
  }

  searchInput.addEventListener('input', applyFilterSearch);

  filterSel.addEventListener('change', () => {
    currentFilter = filterSel.value;
    syncStatPills();
    applyFilterSearch();
  });

  function syncStatPills() {
    document.querySelectorAll('.stat-pill').forEach(p => p.classList.remove('active'));
    const map = { all: 'statAll', breach: 'statBreach', weak: 'statWeak', medium: 'statMed', strong: 'statStrong', mobiles: 'statMobiles' };
    const el = document.getElementById(map[currentFilter]);
    if (el) el.classList.add('active');
  }

  // Stat pill clicks
  document.querySelectorAll('.stat-pill[data-filter]').forEach(pill => {
    pill.addEventListener('click', () => {
      currentFilter = pill.dataset.filter;
      filterSel.value = currentFilter;
      syncStatPills();
      applyFilterSearch();
    });
  });

  // View toggle
  viewGrouped.addEventListener('click', () => {
    currentView = 'grouped';
    viewGrouped.classList.add('active');
    viewFlat.classList.remove('active');
    renderAll();
  });
  viewFlat.addEventListener('click', () => {
    currentView = 'flat';
    viewFlat.classList.add('active');
    viewGrouped.classList.remove('active');
    renderAll();
  });

  btnGoUnlock.addEventListener('click', () => window.close());

  // ══ UTILS ══
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

  function isBreach(pw) {
    if (!pw) return false;
    const common = ['password', '123456', '12345678', 'qwerty', 'abc123', 'password123',
      '111111', '123123', 'admin', 'letmein', 'welcome', 'monkey', '1234567890'];
    return common.includes((pw || '').toLowerCase()) || pw.length < 6;
  }

  const COLORS = ['#4f46e5', '#059669', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#ea580c', '#475569'];
  function avatarColor(str) {
    let h = 0;
    for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
    return COLORS[h % COLORS.length];
  }

  function normDomain(url) {
    if (!url) return '(no url)';
    try {
      if (!url.includes('://')) url = 'https://' + url;
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch { return url.toLowerCase().split('/')[0] || url; }
  }

  function genPw(prefix = '') {
    const u = 'ABCDEFGHJKLMNPQRSTUVWXYZ', l = 'abcdefghjkmnpqrstuvwxyz';
    const d = '23456789', s = '!@#$%&*';
    // Base random pool mapping 
    let p = u[~~(Math.random() * u.length)] + u[~~(Math.random() * u.length)]
      + l[~~(Math.random() * l.length)] + l[~~(Math.random() * l.length)]
      + d[~~(Math.random() * d.length)] + d[~~(Math.random() * d.length)]
      + s[~~(Math.random() * s.length)];
    const all = u + l + d + s;
    for (let i = 0; i < 5; i++) p += all[~~(Math.random() * all.length)];
    const randomPart = p.split('').sort(() => Math.random() - .5).join('');

    // Inject prefix properly if provided
    if (prefix) {
      // Remove spaces & non-ascii, enforce length to max 6 just to be safe (already handled by HTML maxlength but being defensive)
      const cleanPrefix = prefix.replace(/\s+/g, '').substring(0, 6);
      return cleanPrefix + randomPart;
    }
    return randomPart;
  }

  function uid() { return 'v_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ══ RENDER ══
  function renderAll() {
    // Make sure loader is hidden and list is visible
    const mainLoader = document.getElementById('mainLoader');
    if (mainLoader) mainLoader.style.display = 'none';
    if (pwList) pwList.style.display = 'block';

    updateStats();

    const breached = allEntries.filter(e => isBreach(e.password));
    breachBanner.style.display = breached.length > 0 ? 'flex' : 'none';
    breachCountEl.textContent = breached.length;
    tCount.textContent = displayEntries.length + ' entries';

    if (displayEntries.length === 0) {
      pwList.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    if (currentView === 'grouped') renderGrouped();
    else renderFlat();
  }

  function updateStats() {
    const total = allEntries.length;
    const breach = allEntries.filter(e => isBreach(e.password)).length;
    const weak = allEntries.filter(e => getStrength(e.password) === 'weak').length;
    const med = allEntries.filter(e => getStrength(e.password) === 'medium').length;
    const strong = allEntries.filter(e => getStrength(e.password) === 'strong').length;
    const mobiles = allEntries.filter(e => e.mobile).length;
    const sites = new Set(allEntries.map(e => normDomain(e.url))).size;

    if (sAll) sAll.textContent = total;
    if (sBreach) sBreach.textContent = breach;
    if (sWeak) sWeak.textContent = weak;
    if (sMed) sMed.textContent = med;
    if (sStrong) sStrong.textContent = strong;
    if (sMobiles) sMobiles.textContent = mobiles;
    if (sSites) sSites.textContent = sites;

    if (statBreach) statBreach.style.display = breach > 0 ? 'flex' : 'none';
  }

  // ── Grouped ── (Batch-Rendered for 120fps Smoothness)
  function renderGrouped() {
    const listEl = document.getElementById('pwList');
    if (!listEl) return;
    listEl.innerHTML = '';

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
      const fragment = document.createDocumentFragment();

      for (let i = dIdx; i < end; i++) {
        const domain = domains[i];
        const entries = groups[domain];
        const isOpen = openGroups.has(domain);
        const color = avatarColor(domain);
        const initial = (domain[0] || '?').toUpperCase();
        const hasBr = entries.some(e => isBreach(e.password));
        const hasWeak = entries.some(e => getStrength(e.password) === 'weak');
        const allSel = selectMode && entries.every(e => selectedIds.has(e.id));
        const singleAccount = entries.length === 1;

        const grp = document.createElement('div');
        grp.className = 'url-group' + (isOpen ? ' open' : '');

        const hdr = document.createElement('div');
        hdr.className = 'group-hdr' + (isOpen ? ' open' : '');
        const fUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=https://${domain}&size=32`;

        hdr.innerHTML = `
          <input type="checkbox" class="g-chk" data-dom="${esc(domain)}" ${allSel ? 'checked' : ''}>
          <div class="g-avatar" style="background:${color}">
            <img src="${fUrl}" style="width:18px;height:18px" onerror="this.style.display='none'">
            <span class="g-initial">${initial}</span>
          </div>
          <div class="g-info">
            <div class="g-domain">${esc(domain)}</div>
            <div class="g-sub">${singleAccount ? esc(entries[0].username || 'No Username') : entries.length + ' accounts'}</div>
          </div>
          <div class="g-tags">
            ${hasBr ? '<span class="badge b-br">⚠ Breach</span>' : ''}
            ${hasWeak && !hasBr ? '<span class="badge b-w">Weak</span>' : ''}
          </div>
          <div class="g-acts">
             ${singleAccount ? `
              <button class="a-btn g-copy" title="Copy password">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
              <button class="a-btn g-edit" title="Edit">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
             ` : `<span class="g-badge">${entries.length}</span>`}
             <span class="g-chev"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></span>
          </div>
        `;

        const body = document.createElement('div');
        body.className = 'group-body' + (isOpen ? ' open' : '');
        entries.forEach(entry => {
          const { rowEl, detEl } = buildRow(entry);
          body.appendChild(rowEl);
          body.appendChild(detEl);
        });

        if (singleAccount) {
          hdr.querySelector('.g-copy')?.addEventListener('click', e => {
            e.stopPropagation();
            navigator.clipboard.writeText(entries[0].password || '').then(() => showToast('✓ Password copied!', '#10b981'));
          });
          hdr.querySelector('.g-edit')?.addEventListener('click', e => {
            e.stopPropagation();
            openEditModal(entries[0].id);
          });
        }

        hdr.addEventListener('click', e => {
          if (e.target.closest('.g-chk') || e.target.closest('.a-btn')) return;
          if (selectMode) {
            const chk = hdr.querySelector('.g-chk'); chk.checked = !chk.checked; chk.dispatchEvent(new Event('change')); return;
          }
          if (openGroups.has(domain)) openGroups.delete(domain);
          else openGroups.add(domain);
          renderAll(); // Re-render to show updated state
        });

        const gChk = hdr.querySelector('.g-chk');
        gChk.addEventListener('change', ev => {
          ev.stopPropagation();
          entries.forEach(en => { if (gChk.checked) selectedIds.add(en.id); else selectedIds.delete(en.id); });
          updateSelBar();
          renderAll();
        });

        grp.appendChild(hdr);
        grp.appendChild(body);
        fragment.appendChild(grp);
      }

      listEl.appendChild(fragment);
      dIdx = end;
      if (dIdx < domains.length) requestAnimationFrame(renderNextGroups);
    }
    renderNextGroups();
  }

  // ── Flat ──
  function renderFlat() {
    displayEntries.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'flat-card';
      const { rowEl, detEl } = buildRow(entry);
      card.appendChild(rowEl);
      card.appendChild(detEl);
      pwList.appendChild(card);
    });
  }

  // ── Build row + detail ──
  function buildRow(entry) {
    const str = getStrength(entry.password);
    const breach = isBreach(entry.password);
    const init = ((entry.title || entry.username || 'P')[0]).toUpperCase();
    const color = avatarColor(entry.title || entry.url || entry.id);
    const isExp = (expandedId === entry.id);
    const isSel = selectedIds.has(entry.id);

    const rowEl = document.createElement('div');
    rowEl.className = 'pw-row' + (isExp ? ' expanded' : '') + (isSel ? ' sel-on' : '');
    rowEl.dataset.id = entry.id;

    const strBadge = str === 'strong'
      ? '<span class="badge b-s">Strong</span>'
      : str === 'medium'
        ? '<span class="badge b-m">Medium</span>'
        : '<span class="badge b-w">Weak</span>';

    rowEl.innerHTML = `
      <input type="checkbox" class="row-chk" data-id="${entry.id}" ${isSel ? 'checked' : ''}>
      <div class="pw-av" style="background:${color}">${init}</div>
      <div class="pw-inf">
        <div class="pw-t">${esc(entry.title || entry.url || 'Untitled')}</div>
        <div class="pw-u">${esc(entry.username || '\u2014')}</div>
      </div>
      <div class="pw-badges">
        ${breach ? '<span class="badge b-br">⚠</span>' : ''}
        ${strBadge}
      </div>
      <div class="pw-acts">
        ${entry.mobile ? `
        <button class="a-btn copy-mob-btn" data-id="${entry.id}" title="Copy mobile">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        </button>` : ''}
        <button class="a-btn copy-btn" data-id="${entry.id}" title="Copy password">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="a-btn edit-btn" data-id="${entry.id}" title="Edit">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="a-btn del delete-btn" data-id="${entry.id}" title="Delete">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    `;

    // Detail panel
    const detEl = document.createElement('div');
    detEl.className = 'pw-det' + (isExp ? ' open' : '');
    detEl.dataset.id = entry.id;

    const segs = str === 'strong' ? 3 : str === 'medium' ? 2 : 1;
    const sCls = str === 'strong' ? 'ss' : str === 'medium' ? 'sm' : 'sw';
    let segsHtml = '';
    for (let i = 1; i <= 3; i++) segsHtml += `<div class="s-seg ${i <= segs ? sCls : ''}"></div>`;
    const strLbl = str === 'strong' ? 'Strong ✓' : str === 'medium' ? 'Medium' : 'Weak ✗';

    detEl.innerHTML = `
      <div class="d-f">
        <div class="d-lbl">Website</div>
        <div class="d-row"><span class="d-val">${esc(entry.url || entry.title || '\u2014')}</span></div>
      </div>
      <div class="d-f">
        <div class="d-lbl">Username / Email</div>
        <div class="d-row">
          <span class="d-val" id="uv-${entry.id}">${esc(entry.username || '\u2014')}</span>
          <button class="d-btn" id="cu-${entry.id}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
        </div>
      </div>
      <div class="d-f">
        <div class="d-lbl">Password</div>
        <div class="d-row">
          <span class="d-val mono" id="pv-${entry.id}" style="letter-spacing:3px">&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</span>
          <button class="d-btn" id="shb-${entry.id}">
            <svg id="eye-on-${entry.id}" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <svg id="eye-off-${entry.id}" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><path d="M17.94 17.94A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            <span id="sh-lbl-${entry.id}">Show</span>
          </button>
          <button class="d-btn" id="cp-${entry.id}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
        </div>
        <div style="display:flex;align-items:center;margin-top:8px">
          <div class="s-bars">${segsHtml}</div>
          <span class="s-txt ${sCls}" style="margin-left:8px">${strLbl}</span>
        </div>
      </div>
      ${entry.notes ? `<div class="d-f"><div class="d-lbl">Notes</div><div class="d-val">${esc(entry.notes)}</div></div>` : ''}
      ${breach ? `<div class="br-warn"><svg width="14" height="14" viewBox="0 0 24 24" fill="#ef4444" style="flex-shrink:0;margin-top:1px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg><span><strong>Breach!</strong> Yeh password unsafe hai — turant badlo!</span></div>` : ''}
      <div class="d-acts">
        <button class="d-btn p" id="edit-d-${entry.id}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
        <button class="d-btn dr" id="del-d-${entry.id}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          Delete
        </button>
      </div>
    `;

    // ── Events ──

    // Row click → expand (normal) or toggle checkbox (select mode)
    rowEl.addEventListener('click', e => {
      if (selectMode) {
        const chk = rowEl.querySelector('.row-chk');
        if (e.target === chk) return;
        chk.checked = !chk.checked;
        chk.dispatchEvent(new Event('change'));
        return;
      }
      if (e.target.closest('.pw-acts')) return;
      expandedId = (expandedId === entry.id) ? null : entry.id;
      renderAll();
    });

    // Row checkbox
    const rowChk = rowEl.querySelector('.row-chk');
    rowChk.addEventListener('change', ev => {
      ev.stopPropagation();
      if (rowChk.checked) selectedIds.add(entry.id);
      else selectedIds.delete(entry.id);
      rowEl.classList.toggle('sel-on', rowChk.checked);
      updateSelBar();
    });

    // Row actions
    rowEl.querySelector('.copy-btn').addEventListener('click', e => {
      e.stopPropagation();
      navigator.clipboard.writeText(entry.password || '').then(() => showToast('✓ Password copied!', '#10b981'));
    });
    const mobBtn = rowEl.querySelector('.copy-mob-btn');
    if (mobBtn) {
      mobBtn.addEventListener('click', e => {
        e.stopPropagation();
        navigator.clipboard.writeText(entry.mobile || '').then(() => showToast('✓ Mobile number copied!', '#22d3ee'));
      });
    }
    rowEl.querySelector('.edit-btn').addEventListener('click', e => {
      e.stopPropagation();
      openEditModal(entry.id);
    });
    rowEl.querySelector('.delete-btn').addEventListener('click', e => {
      e.stopPropagation();
      openDeleteModal(entry.id);
    });

    // Show/hide password
    let pwVis = false;
    const shBtn = detEl.querySelector(`#shb-${entry.id}`);
    const pvEl = detEl.querySelector(`#pv-${entry.id}`);
    const eyeOn = detEl.querySelector(`#eye-on-${entry.id}`);
    const eyeOff = detEl.querySelector(`#eye-off-${entry.id}`);
    const shLbl = detEl.querySelector(`#sh-lbl-${entry.id}`);
    shBtn.addEventListener('click', e => {
      e.stopPropagation();
      pwVis = !pwVis;
      pvEl.textContent = pwVis ? (entry.password || '\u2014') : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
      pvEl.style.letterSpacing = pwVis ? '1.5px' : '3px';
      pvEl.style.fontSize = pwVis ? '12px' : '14px';
      eyeOn.style.display = pwVis ? 'none' : '';
      eyeOff.style.display = pwVis ? '' : 'none';
      shLbl.textContent = pwVis ? 'Hide' : 'Show';
    });

    // Copy username
    detEl.querySelector(`#cu-${entry.id}`).addEventListener('click', e => {
      e.stopPropagation();
      navigator.clipboard.writeText(entry.username || '').then(() => showToast('✓ Username copied!', '#6c63ff'));
    });

    // Copy password (detail)
    detEl.querySelector(`#cp-${entry.id}`).addEventListener('click', e => {
      e.stopPropagation();
      navigator.clipboard.writeText(entry.password || '').then(() => showToast('✓ Password copied!', '#10b981'));
    });

    // Edit from detail
    detEl.querySelector(`#edit-d-${entry.id}`).addEventListener('click', e => {
      e.stopPropagation();
      openEditModal(entry.id);
    });

    // Delete from detail
    detEl.querySelector(`#del-d-${entry.id}`).addEventListener('click', e => {
      e.stopPropagation();
      openDeleteModal(entry.id);
    });

    return { rowEl, detEl };
  }

  // ══ ADD BUTTON ══
  btnAddNew.addEventListener('click', () => openEditModal(null));

  // ══ EDIT MODAL ══
  function openEditModal(id) {
    editingId = id;
    fieldPassword.type = 'password';
    eyeShow.style.display = '';
    eyeHide.style.display = 'none';
    if (modalStrMt) modalStrMt.style.display = 'none';

    if (id) {
      const e = allEntries.find(x => x.id === id);
      if (!e) return;
      modalTitle.textContent = 'Password Edit Karo';
      fieldTitle.value = e.title || '';
      fieldUrl.value = e.url || '';
      fieldUsername.value = e.username || '';
      fieldMobile.value = e.mobile || '';
      fieldPassword.value = e.password || '';
      fieldNotes.value = e.notes || '';
    } else {
      modalTitle.textContent = 'Naya Password Add Karo';
      fieldTitle.value = fieldUrl.value = fieldUsername.value = fieldMobile.value = fieldPassword.value = fieldNotes.value = '';
    }
    updateModalStr();
    editModal.classList.add('open');
    setTimeout(() => fieldTitle.focus(), 80);
  }

  function closeEditModal() {
    editModal.classList.remove('open');
    editingId = null;
  }

  modalClose.addEventListener('click', closeEditModal);
  btnModalCancel.addEventListener('click', closeEditModal);
  editModal.addEventListener('click', e => { if (e.target === editModal) closeEditModal(); });

  // Eye toggle
  toggleModalPw.addEventListener('click', () => {
    const hide = fieldPassword.type === 'password';
    fieldPassword.type = hide ? 'text' : 'password';
    eyeShow.style.display = hide ? 'none' : '';
    eyeHide.style.display = hide ? '' : 'none';
  });

  // Strength
  fieldPassword.addEventListener('input', updateModalStr);
  function updateModalStr() {
    const pw = fieldPassword.value;
    if (!pw) { if (modalStrMt) modalStrMt.style.display = 'none'; return; }
    if (modalStrMt) modalStrMt.style.display = 'flex';
    const s = getStrength(pw);
    const cls = s === 'strong' ? 'ss' : s === 'medium' ? 'sm' : 'sw';
    const segs = s === 'strong' ? 3 : s === 'medium' ? 2 : 1;
    ms.forEach((el, i) => { if (el) el.className = 's-seg ' + (i < segs ? cls : ''); });
    if (modalStrTxt) {
      modalStrTxt.textContent = s === 'strong' ? 'Strong ✓' : s === 'medium' ? 'Medium' : 'Weak ✗';
      modalStrTxt.className = 's-txt ' + cls;
    }
  }

  // Generate password
  btnGenPw.addEventListener('click', () => {
    const prefixInput = document.getElementById('pwPrefix');
    const prefix = prefixInput ? prefixInput.value.trim() : '';
    fieldPassword.value = genPw(prefix);
    fieldPassword.type = 'text';
    eyeShow.style.display = 'none';
    eyeHide.style.display = '';
    updateModalStr();
    fieldPassword.focus();
  });

  // Save
  btnModalSave.addEventListener('click', async () => {
    const title = fieldTitle.value.trim();
    const url = fieldUrl.value.trim();
    const username = fieldUsername.value.trim();
    const mobile = fieldMobile.value.trim();
    const password = fieldPassword.value;
    const notes = fieldNotes.value.trim();

    if (!password) {
      fieldPassword.style.borderColor = '#ef4444';
      showToast('⚠ Password zaroori hai!', '#ef4444');
      setTimeout(() => { fieldPassword.style.borderColor = ''; }, 2000);
      return;
    }

    btnModalSave.disabled = true;
    btnModalSave.textContent = 'Saving...';

    let entries = [...allEntries];
    if (editingId) {
      const i = entries.findIndex(e => e.id === editingId);
      if (i !== -1) entries[i] = { ...entries[i], title, url, username, mobile, password, notes, strength: getStrength(password), updatedAt: Date.now() };
    } else {
      // 🛡️ Zero-Fault Duplicate Prevention
      const domain = normDomain(url);
      const duplicate = entries.find(e => {
        const sameUser = (e.username || '').toLowerCase() === username.toLowerCase();
        const sameMobile = mobile && (e.mobile || '').replace(/\D/g, '') === mobile.replace(/\D/g, '');
        return normDomain(e.url || '') === domain && (sameUser || sameMobile);
      });

      if (duplicate) {
        if (confirm(`"${duplicate.title}" already exists for this site.\n\nOverwrite existing entry?`)) {
          const i = entries.findIndex(e => e.id === duplicate.id);
          entries[i] = { ...entries[i], title, url, username, mobile, password, notes, strength: getStrength(password), updatedAt: Date.now() };
        } else if (confirm("Save as new separate entry?")) {
          entries.push({ id: uid(), title, url, username, mobile, password, notes, strength: getStrength(password), starred: false, createdAt: Date.now(), updatedAt: Date.now() });
        } else {
          btnModalSave.disabled = false;
          btnModalSave.textContent = '💾 Save Karo';
          return;
        }
      } else {
        entries.push({ id: uid(), title, url, username, mobile, password, notes, strength: getStrength(password), starred: false, createdAt: Date.now(), updatedAt: Date.now() });
      }
    }

    _isSaving = true;
    const wasEditing = !!editingId;
    try {
      await saveBlob(entries);
      allEntries = entries;
      closeEditModal();
      // ✅ FIX: Toast ANDAR try ke — pehle finally ke baad tha, toh fail pe bhi show hota tha
      showToast(wasEditing ? '✓ Password updated!' : '✓ Password saved!', '#10b981');
      applyFilterSearch();
    } catch (e) {
      showToast('❌ Save fail — session expire? Reload karo', '#ef4444');
      await loadEntries();
    } finally {
      setTimeout(() => { _isSaving = false; }, 300);
      btnModalSave.disabled = false;
      btnModalSave.textContent = '💾 Save Karo';
    }
  }); // ← btnModalSave.addEventListener ends here (was missing → DELETE/BULK/ESC all broken)

  // ══ DELETE SINGLE ══
  function openDeleteModal(id) {
    pendingDeleteId = id;
    const e = allEntries.find(x => x.id === id);
    deleteDesc.textContent = e
      ? `"${e.title || e.url || e.username || 'Entry'}" permanently delete ho jayegi.`
      : 'Permanently delete ho jayegi.';
    deleteModal.classList.add('open');
  }
  function closeDeleteModal() {
    deleteModal.classList.remove('open');
    pendingDeleteId = null;
  }
  btnDeleteCancel.addEventListener('click', closeDeleteModal);
  deleteModal.addEventListener('click', e => { if (e.target === deleteModal) closeDeleteModal(); });
  btnDeleteConfirm.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    btnDeleteConfirm.disabled = true;
    btnDeleteConfirm.textContent = 'Deleting...';
    const entries = allEntries.filter(e => e.id !== pendingDeleteId);
    _isSaving = true;
    try {
      await saveBlob(entries);
      allEntries = entries;
      closeDeleteModal();
    } catch (e) {
      showToast('❌ Delete fail — session expire? Reload karo', '#ef4444');
      await loadEntries();
    } finally {
      setTimeout(() => { _isSaving = false; }, 300);
    }
    showToast('🗑 Password deleted!', '#ef4444');
    applyFilterSearch();
    btnDeleteConfirm.disabled = false;
    btnDeleteConfirm.textContent = 'Delete Karo';
  });

  // ══ BULK SELECT ══
  function enterSelectMode() {
    selectMode = true;
    selectedIds.clear();
    document.body.classList.add('sel-mode');
    selectBar.classList.add('on');
    btnSelectMode.classList.add('on');
    updateSelBar();
    renderAll();
  }
  function exitSelectMode() {
    selectMode = false;
    selectedIds.clear();
    document.body.classList.remove('sel-mode');
    selectBar.classList.remove('on');
    btnSelectMode.classList.remove('on');
    selectAllChk.checked = false;
    updateSelBar();
    renderAll();
  }
  function updateSelBar() {
    const n = selectedIds.size;
    selectCount.textContent = n === 0 ? 'Koi select nahi' : `${n} selected`;
    btnBulkDelete.disabled = n === 0;
    const total = displayEntries.length;
    selectAllChk.indeterminate = n > 0 && n < total;
    selectAllChk.checked = total > 0 && n === total;
  }

  btnSelectMode.addEventListener('click', () => { if (selectMode) exitSelectMode(); else enterSelectMode(); });
  btnCancelSelect.addEventListener('click', exitSelectMode);

  selectAllChk.addEventListener('change', () => {
    if (selectAllChk.checked) displayEntries.forEach(e => selectedIds.add(e.id));
    else selectedIds.clear();
    updateSelBar();
    renderAll();
  });

  btnBulkDelete.addEventListener('click', () => {
    const n = selectedIds.size;
    if (n === 0) return;
    bulkDelCount.textContent = n;
    bulkDelDesc.textContent = `${n} password${n > 1 ? 's' : ''} permanently delete ho jayenge!`;
    bulkDeleteModal.classList.add('open');
  });
  btnBulkDelCancel.addEventListener('click', () => bulkDeleteModal.classList.remove('open'));
  bulkDeleteModal.addEventListener('click', e => { if (e.target === bulkDeleteModal) bulkDeleteModal.classList.remove('open'); });
  btnBulkDelConfirm.addEventListener('click', async () => {
    const n = selectedIds.size;
    btnBulkDelConfirm.disabled = true;
    btnBulkDelConfirm.textContent = 'Deleting...';
    const entries = allEntries.filter(e => !selectedIds.has(e.id));
    _isSaving = true;
    try {
      await saveBlob(entries);
      allEntries = entries;
      bulkDeleteModal.classList.remove('open');
    } catch (e) {
      showToast('❌ Bulk delete fail — session expire? Reload karo', '#ef4444');
      await loadEntries();
    } finally {
      setTimeout(() => { _isSaving = false; }, 300);
    }
    exitSelectMode();
    showToast(`🗑 ${n} password${n > 1 ? 's' : ''} deleted!`, '#ef4444');
    applyFilterSearch();
    btnBulkDelConfirm.disabled = false;
    btnBulkDelConfirm.textContent = 'Delete Karo';
  });

  // ══ ESC ══
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (editModal.classList.contains('open')) closeEditModal();
    if (deleteModal.classList.contains('open')) closeDeleteModal();
    if (bulkDeleteModal.classList.contains('open')) bulkDeleteModal.classList.remove('open');
  });

  // ══ TOAST ══
  let _tt = null;
  function showToast(msg, bg) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    clearTimeout(_tt);
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.background = bg || 'var(--bg2)';
    t.style.color = '#fff';
    t.textContent = msg;
    document.body.appendChild(t);
    _tt = setTimeout(() => {
      t.style.transition = 'opacity .3s';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 300);
    }, 2500);
  }

  // NOTE: No auto-reload on storage change or visibilitychange intentionally.
  // Reason: Can cause restore loop if another tab/popup has stale session.
  // Data is always fresh because we save directly and show UI immediately.

  // ══ START ══
  init();

})();
