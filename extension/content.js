// VaultX Extension — Content Script
// Auto-fill: ek match = seedha fill, multiple = picker

(function () {
  if (window.__vaultxInjected) return;
  window.__vaultxInjected = true;

  const site = location.hostname.replace('www.', '');
  let passwords = [];
  let filled = false;

  chrome.runtime.sendMessage({ type: 'GET_PASSWORDS' }, (res) => {
    if (res && res.passwords) passwords = res.passwords;
    tryAutoFill();
  });

  function getMatches() {
    return passwords.filter(p =>
      p.site.toLowerCase().includes(site) ||
      site.includes(p.site.toLowerCase()) ||
      (p.url && p.url.includes(site))
    );
  }

  function tryAutoFill() {
    if (filled) return;
    const pwField = document.querySelector('input[type="password"]');
    if (!pwField) return;

    const matches = getMatches();
    if (!matches.length) {
      injectBtn(pwField, []); // show btn even with no match so user can pick
      return;
    }

    if (matches.length === 1) {
      // Single match — auto fill immediately
      fillForm(pwField, matches[0]);
      filled = true;
      injectBtn(pwField, matches); // still show btn for re-fill
    } else {
      // Multiple matches — show picker automatically
      injectBtn(pwField, matches);
      showPicker(pwField, matches, true); // auto-open
    }
  }

  function injectBtn(pwField, matches) {
    if (pwField.dataset.vaultxDone) return;
    pwField.dataset.vaultxDone = '1';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = '🔐';
    btn.title = 'VaultX AutoFill';
    btn.style.cssText = `
      position:absolute;right:8px;top:50%;transform:translateY(-50%);
      background:linear-gradient(135deg,#3b82f6,#06b6d4);
      border:none;border-radius:6px;width:26px;height:26px;
      cursor:pointer;font-size:13px;z-index:99999;
      box-shadow:0 2px 8px rgba(59,130,246,.4);
      display:flex;align-items:center;justify-content:center;
      transition:transform .15s;
    `;
    btn.onmouseenter = () => btn.style.transform = 'translateY(-50%) scale(1.1)';
    btn.onmouseleave = () => btn.style.transform = 'translateY(-50%) scale(1)';

    const parent = pwField.parentElement;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.appendChild(btn);

    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const m = getMatches();
      if (m.length === 1) { fillForm(pwField, m[0]); }
      else if (m.length > 1) { showPicker(pwField, m, false); }
      else { showPicker(pwField, passwords.slice(0, 10), false); }
    });
  }

  function showPicker(pwField, matches, autoOpen) {
    document.getElementById('vaultx-picker')?.remove();
    if (!matches.length) return;

    // Auto-open: position near the field, not center
    const rect = pwField.getBoundingClientRect();
    const top = Math.min(rect.bottom + window.scrollY + 6, window.innerHeight - 320);
    const left = Math.min(rect.left + window.scrollX, window.innerWidth - 320);

    const picker = document.createElement('div');
    picker.id = 'vaultx-picker';
    picker.style.cssText = `
      position:fixed;
      top:${Math.min(rect.bottom + 6, window.innerHeight - 300)}px;
      left:${Math.min(rect.left, window.innerWidth - 310)}px;
      background:#0d1117;border:1px solid rgba(56,139,253,.25);
      border-radius:12px;width:300px;max-height:280px;
      z-index:2147483647;box-shadow:0 16px 48px rgba(0,0,0,.7);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      overflow:hidden;animation:vxIn .15s ease;
    `;

    const style = document.createElement('style');
    style.textContent = `@keyframes vxIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}`;
    document.head.appendChild(style);

    picker.innerHTML = `
      <div style="padding:10px 14px 8px;border-bottom:1px solid rgba(56,139,253,.1);
        display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:6px">
          <span>🔐</span>
          <span style="color:#e2e8f0;font-size:11px;font-weight:700">VaultX — Account चुनें</span>
        </div>
        <button id="vx-close" style="background:none;border:none;color:#4a5568;cursor:pointer;font-size:14px;padding:2px 4px">✕</button>
      </div>
      <div style="overflow-y:auto;max-height:220px">
        ${matches.map((p, i) => `
          <div class="vx-item" data-i="${i}" style="padding:10px 14px;cursor:pointer;
            border-bottom:1px solid rgba(56,139,253,.05);display:flex;align-items:center;gap:8px">
            <div style="width:30px;height:30px;background:rgba(59,130,246,.1);border-radius:7px;
              display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">
              ${getCatEmoji(p.cat)}
            </div>
            <div style="flex:1;min-width:0">
              <div style="color:#e2e8f0;font-size:11px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.site)}</div>
              <div style="color:#94a3b8;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.user)}</div>
            </div>
            <span style="color:#06b6d4;font-size:9px;font-weight:700">FILL</span>
          </div>`).join('')}
      </div>`;

    document.body.appendChild(picker);

    picker.querySelector('#vx-close').onclick = () => picker.remove();
    picker.querySelectorAll('.vx-item').forEach(item => {
      item.onmouseenter = () => item.style.background = 'rgba(59,130,246,.08)';
      item.onmouseleave = () => item.style.background = '';
      item.onclick = () => {
        fillForm(pwField, matches[parseInt(item.dataset.i)]);
        picker.remove();
      };
    });

    setTimeout(() => document.addEventListener('click', function h(e) {
      if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', h); }
    }), 150);
  }

  function fillForm(pwField, p) {
    setVal(pwField, p.pw);

    // Username field dhundo — form ke andar ya upar
    const form = pwField.closest('form');
    const scope = form || document;
    const userField = scope.querySelector(
      'input[type="email"],input[autocomplete="username"],input[autocomplete="email"],' +
      'input[name*="user"],input[name*="email"],input[id*="user"],input[id*="email"],' +
      'input[type="text"]'
    );
    if (userField && userField !== pwField) setVal(userField, p.user);

    showToast(`✅ ${p.site} auto-filled!`);
  }

  function setVal(el, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(el, value); else el.value = value;
    ['input', 'change', 'blur'].forEach(ev => el.dispatchEvent(new Event(ev, { bubbles: true })));
  }

  function showToast(msg) {
    document.getElementById('vx-toast')?.remove();
    const t = document.createElement('div');
    t.id = 'vx-toast';
    t.style.cssText = `position:fixed;bottom:20px;right:20px;background:#0d1117;
      border:1px solid rgba(16,185,129,.35);border-radius:8px;padding:9px 14px;
      color:#10b981;font-size:12px;font-weight:700;z-index:2147483647;
      box-shadow:0 8px 24px rgba(0,0,0,.5);font-family:-apple-system,sans-serif;
      animation:vxIn .2s ease`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  function getCatEmoji(cat) {
    return { Social: '💬', Banking: '🏦', Email: '📧', Work: '💼', Shopping: '🛒', Games: '🎮' }[cat] || '🔑';
  }

  function escHtml(s) {
    return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
  }

  // Dynamic pages (SPA) ke liye observe
  const obs = new MutationObserver(() => {
    const pwField = document.querySelector('input[type="password"]:not([data-vaultx-done])');
    if (pwField) { filled = false; tryAutoFill(); }
  });
  obs.observe(document.body, { childList: true, subtree: true });
})();
