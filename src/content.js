// VAULT — Autofill Engine v8 — All Bugs Fixed
// Fixes: Math.random→crypto, sessionStorage XSS, Chrome-start autofill retry
(function () {
  'use strict';

  // Guard against double injection
  const MY_ID = (() => { try { return chrome.runtime.id; } catch { return null; } })();
  if (!MY_ID) return;
  if (window.__vaultInjected === MY_ID) return;
  window.__vaultInjected = MY_ID;

  // State
  let _entries      = [];
  let _fetchPromise = null;
  let _fetched      = false;
  let _dropdown     = null;
  let _lastFilled   = null;
  let _pendingPw    = null;
  let _pendingCreds = null; // FIX #5: sessionStorage password removed — memory only
  let _settings     = null;
  let _activeField  = null;
  let _dropIndex    = -1;
  let _autoFilled   = false;
  let _dead         = false;
  let _fetchRetryTimer = null; // FIX: Chrome start retry

  // Robust sendMsg — handles SW sleep + retries
  async function sendMsg(msg, retries = 3, delayMs = 350) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await chrome.runtime.sendMessage(msg);
        return res;
      } catch (e) {
        const err = (e?.message || '').toLowerCase();
        if (err.includes('extension context invalidated') ||
            err.includes('cannot access a chrome-extension')) {
          _dead = true; return null;
        }
        if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
      }
    }
    return null;
  }

  // CSS
  function injectCSS() {
    if (document.getElementById('__vlt_css__')) return;
    const s = document.createElement('style');
    s.id = '__vlt_css__';
    s.textContent = `
      @keyframes __vlt_in__  { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }
      @keyframes __vlt_fi__  { from{opacity:0} to{opacity:1} }
      #__vlt_drop__ {
        position:fixed; background:#1c1c2e;
        border:1px solid rgba(124,92,252,.25); border-radius:8px;
        box-shadow:0 4px 20px rgba(0,0,0,.6);
        z-index:2147483647; overflow:hidden;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        animation:__vlt_in__ .12s cubic-bezier(.2,0,0,1);
        min-width:220px; max-width:340px;
      }
      #__vlt_drop__ .__vlt_hdr__ {
        display:flex; align-items:center; gap:5px; padding:5px 10px 4px;
        font-size:9px; font-weight:700; letter-spacing:1px; color:#444;
        border-bottom:1px solid rgba(255,255,255,.05); text-transform:uppercase;
      }
      #__vlt_drop__ .__vlt_item__ {
        display:flex; align-items:center; gap:9px; padding:8px 10px; cursor:pointer;
        transition:background .08s; border-bottom:1px solid rgba(255,255,255,.04);
      }
      #__vlt_drop__ .__vlt_item__.active,
      #__vlt_drop__ .__vlt_item__:hover { background:rgba(124,92,252,.15); }
      #__vlt_drop__ .__vlt_item__.active { background:rgba(124,92,252,.22); }
      #__vlt_drop__ .__vlt_ico__ {
        width:28px; height:28px; min-width:28px; border-radius:50%;
        background:rgba(124,92,252,.18); display:flex; align-items:center;
        justify-content:center; flex-shrink:0;
      }
      #__vlt_drop__ .__vlt_uname__ {
        font-size:13px; font-weight:500; color:#ddd;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;
      }
      #__vlt_drop__ .__vlt_sub__ { font-size:10px; color:#555; margin-top:1px; }
      #__vlt_drop__ .__vlt_foot__ {
        display:flex; align-items:center; gap:6px; padding:6px 10px; cursor:pointer;
        background:rgba(0,0,0,.2); font-size:10.5px; color:#555;
        transition:background .08s, color .08s;
      }
      #__vlt_drop__ .__vlt_foot__:hover { background:rgba(124,92,252,.1); color:#999; }
      #__vlt_drop__ .__vlt_sug__ {
        display:flex; align-items:center; gap:9px; padding:8px 10px; cursor:pointer;
        background:rgba(124,92,252,.06); border-top:1px solid rgba(255,255,255,.05);
        transition:background .08s;
      }
      #__vlt_drop__ .__vlt_sug__:hover { background:rgba(124,92,252,.14); }
      #__vlt_drop__ .__vlt_pw__ {
        font-size:10px; color:#7c5cfc; font-family:monospace; margin-top:1px; letter-spacing:.5px;
      }
      #__vlt_toast__ {
        position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
        background:rgba(20,20,35,.97); color:#ccc;
        font-size:12px; font-weight:500; padding:6px 14px; border-radius:20px;
        z-index:2147483647; border:1px solid rgba(124,92,252,.25);
        white-space:nowrap; animation:__vlt_fi__ .15s ease;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        pointer-events:none;
      }
      .__vlt_eye__ {
        position:absolute; right:7px; top:50%; transform:translateY(-50%);
        width:20px; height:20px; cursor:pointer;
        display:flex; align-items:center; justify-content:center;
        border-radius:4px; opacity:.5; transition:opacity .15s; z-index:9999;
      }
      .__vlt_eye__:hover { opacity:1; }
      .__vlt_kbd__ {
        font-size:9px; color:#333; background:rgba(255,255,255,.06);
        border-radius:3px; padding:1px 4px; margin-left:auto; flex-shrink:0;
      }
      #__vlt_save_prompt__ {
        position:fixed; top:20px; right:20px;
        background:rgba(23,23,37,0.95); border:1px solid rgba(124,92,252,.4);
        border-radius:16px; box-shadow:0 15px 50px rgba(0,0,0,.7);
        z-index:2147483647; color:#fff; padding:20px; width:320px;
        backdrop-filter:blur(14px);
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        animation:__vlt_in_r__ .4s cubic-bezier(.175,.885,.32,1.275);
      }
      @keyframes __vlt_in_r__ {
        from{opacity:0;transform:translateY(-20px) scale(0.95)} to{opacity:1;transform:none}
      }
      #__vlt_sp_btns__ { display:flex; gap:10px; }
      .__vlt_sp_btn__ {
        flex:1; padding:10px; border:none; border-radius:10px;
        font-size:13px; font-weight:700; cursor:pointer;
        transition:all .2s; display:flex; align-items:center; justify-content:center; gap:6px;
      }
      .__vlt_sp_save__ { background:linear-gradient(135deg,#c084fc,#fbbf24); color:#fff; }
      .__vlt_sp_save__:hover { transform:translateY(-2px); box-shadow:0 6px 16px rgba(192,132,252,0.4); }
      .__vlt_sp_close__ { background:rgba(255,255,255,.05); color:#cbd5e1; border:1px solid rgba(255,255,255,.1); }
      .__vlt_sp_close__:hover { background:rgba(255,255,255,.1); color:#fff; }
    `;
    document.head.appendChild(s);
  }

  const ICO_KEY    = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c5cfc" stroke-width="2.2"><circle cx="8" cy="15" r="4"/><line x1="11" y1="12" x2="22" y2="12"/><line x1="22" y1="12" x2="22" y2="15"/><line x1="19" y1="12" x2="19" y2="14"/></svg>`;
  const ICO_SHIELD = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#7c5cfc"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`;
  const ICO_EYE    = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const ICO_EYOFF  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  const ICO_STAR   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#7c5cfc"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
  const ICO_MGMT   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 1 1 4.93 19.07"/></svg>`;

  function isVisible(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    if (el.type === 'hidden') return false;
    if (el.disabled) return false;
    try {
      const st = window.getComputedStyle(el);
      if (st.display === 'none') return false;
      if (st.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return true;
      const parent = el.parentElement;
      if (parent) {
        const pr = parent.getBoundingClientRect();
        if (pr.width > 0 && pr.height > 0 &&
            pr.top >= -100 && pr.bottom <= window.innerHeight + 100) return true;
      }
      return false;
    } catch { return false; }
  }

  async function getSettings() {
    // FIXED: Cache hataya — settings change hone par fresh read karo
    // (Pehle cache tha → settings page pe change karne ke baad bhi purani value milti thi)
    try {
      const r = await chrome.storage.local.get('vault_settings');
      _settings = r.vault_settings || {};
    } catch { _settings = _settings || {}; }
    return _settings;
  }

  function isOtpField(el) {
    try {
      if (!el || el.tagName !== 'INPUT') return false;
      const ac = (el.autocomplete || '').toLowerCase();
      if (ac === 'one-time-code') return true;
      if (ac === 'current-password' || ac === 'new-password') return false;
      const type      = (el.type || '').toLowerCase();
      const attrs     = [el.name, el.id, el.placeholder, el.autocomplete].map(v => (v||'').toLowerCase()).join(' ');
      const classStr  = (el.className || '').toLowerCase();
      const combined  = attrs + ' ' + classStr;
      const inputmode = (el.getAttribute ? (el.getAttribute('inputmode') || '') : '').toLowerCase();
      const rawLen    = el.getAttribute ? el.getAttribute('maxlength') : null;
      const maxLen    = parseInt(rawLen != null ? rawLen : (el.maxLength ?? '0'), 10);
      if (/\botp\b|\bsms\b|\b2fa\b|\bmfa\b|\btoken\b|\bverif(y|ication)\b|\bone.?time\b/.test(combined)) return true;
      if (/\bcode\b/.test(combined) && (inputmode === 'numeric' || type === 'number' || (maxLen > 0 && maxLen <= 8))) return true;
      if (/\bpin\b|\bpasscode\b/.test(combined) && maxLen > 0 && maxLen <= 8) return true;
      if ((type === 'number' || inputmode === 'numeric') && maxLen === 1) return true;
      if ((type === 'number' || inputmode === 'numeric') && maxLen >= 4 && maxLen <= 8) return true;
      if (maxLen === 1 || (type === 'number' && maxLen <= 1)) {
        try {
          const scope = el.closest?.('form, [role="form"]') || el.parentElement?.parentElement || document;
          if (scope && scope.querySelectorAll) {
            const siblings = Array.from(scope.querySelectorAll('input')).filter(i => {
              try {
                const l = parseInt((i.getAttribute?.('maxlength')) ?? (i.maxLength ?? '0'), 10);
                return (l === 1 || i.type === 'number') && isVisible(i);
              } catch { return false; }
            });
            if (siblings.length >= 4) return true;
          }
        } catch {}
      }
      return false;
    } catch { return false; }
  }

  function isPhoneField(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    if ((el.type || '').toLowerCase() === 'tel') return true;
    const a = [el.name, el.id, el.autocomplete, el.placeholder].map(v => (v||'').toLowerCase()).join(' ');
    return /\bmobile\b|\bphone\b|\btel\b|\bcell\b|\bmob\b/.test(a);
  }

  function isPwField(el) {
    try {
      if (!el || el.tagName !== 'INPUT') return false;
      if (el.type !== 'password') return false;
      if (!isVisible(el)) return false;
      const ac = (el.autocomplete || '').toLowerCase();
      if (ac === 'current-password' || ac === 'new-password') return true;
      if (isOtpField(el)) return false;
      const rawLen = el.getAttribute ? el.getAttribute('maxlength') : null;
      const maxLen = parseInt(rawLen != null ? rawLen : (el.maxLength ?? '999'), 10);
      if (maxLen > 0 && maxLen <= 2) return false;
      return true;
    } catch { return false; }
  }

  function isUserField(el) {
    try {
      if (!el || el.tagName !== 'INPUT' || !isVisible(el)) return false;
      if (el.type === 'password' || el.type === 'hidden' || el.type === 'number') return false;
      if (isPhoneField(el) || isOtpField(el)) return false;
      const type = (el.type || '').toLowerCase();
      const a    = [el.name, el.id, el.autocomplete, el.placeholder].map(v => (v||'').toLowerCase()).join(' ');
      if (type === 'email') return true;
      if (el.autocomplete && ['username','email','nickname'].includes(el.autocomplete)) return true;
      if (/\busername\b|\bemail\b|\blogin\b|\buser\b|\buserid\b|\baccount\b/.test(a)) return true;
      try {
        if (['text','','search'].includes(type)) {
          const scope  = el.closest?.('form') || document;
          const inputs = Array.from(scope.querySelectorAll('input')).filter(i => {
            try { return isVisible(i) && i.type !== 'hidden'; } catch { return false; }
          });
          const pwIdx = inputs.findIndex(i => { try { return isPwField(i); } catch { return false; } });
          const myIdx = inputs.indexOf(el);
          if (pwIdx > -1 && myIdx > -1 && myIdx < pwIdx) return true;
        }
      } catch {}
      return false;
    } catch { return false; }
  }

  function isSignupForm(el) {
    const form = el.closest('form');
    if (!form) return false;
    const pws = Array.from(form.querySelectorAll('input[type=password]')).filter(i => isVisible(i));
    if (!pws.length) return false;
    if (pws.length >= 2) return true;
    const str = [form.id, form.className, form.action || '', form.name].join(' ').toLowerCase();
    if (/sign.?up|register|create.?account|new.?account/.test(str)) return true;
    const phs = Array.from(form.querySelectorAll('input')).map(i => (i.placeholder || '').toLowerCase()).join(' ');
    if (/confirm.?pass|repeat.?pass|re.?enter|retype/.test(phs)) return true;
    return false;
  }

  // FIX: Chrome start retry — agar prefetch fail ho, 3s / 6s / 12s mein retry karo
  function prefetch() {
    if (_dead) return Promise.resolve();
    if (_fetched) return Promise.resolve();
    if (_fetchPromise) return _fetchPromise;

    _fetchPromise = sendMsg({ type: 'GET_ENTRIES_FOR_URL', url: location.hostname }, 4, 400)
      .then(r => {
        if (r?.ok) {
          _entries = r.entries || [];
          _fetched = true;
          clearTimeout(_fetchRetryTimer);
          if (_entries.length === 1 && !_autoFilled) attemptAutoFillOnLoad();
        } else {
          _entries = [];
          // FIX: Vault locked (not unlocked yet) — don't retry
        }
      })
      .catch(() => {
        _entries = [];
        // Auto-start fix: 5-level retry — SW may be restoring session
        // Delays: 500ms, 1.5s, 4s, 8s, 15s
        if (!_dead && !_fetched) {
          clearTimeout(_fetchRetryTimer);
          const RETRIES = [500, 1500, 4000, 8000, 15000];
          let _retryIdx = 0;
          const _retry = () => {
            if (_dead || _fetched || _retryIdx >= RETRIES.length) return;
            _fetchRetryTimer = setTimeout(() => {
              _fetchPromise = null;
              _retryIdx++;
              prefetch().catch(() => { if (!_fetched && !_dead) _retry(); });
            }, RETRIES[_retryIdx]);
          };
          _retry();
        }
      })
      .finally(() => { _fetchPromise = null; });

    return _fetchPromise;
  }

  // FIX: Retry prefetch after focus on locked vault (user may have just unlocked)
  function prefetchFresh() {
    _fetched      = false;
    _fetchPromise = null;
    return prefetch();
  }

  function attemptAutoFillOnLoad() {
    if (_autoFilled || _entries.length !== 1) return;
    const vis    = () => Array.from(document.querySelectorAll('input')).filter(i => isVisible(i));
    const uField = vis().find(i => isUserField(i));
    const pField = vis().find(i => isPwField(i));
    if (uField || pField) {
      _autoFilled = true;
      doFill(_entries[0], true);
    }
  }

  async function getFullCreds(id) {
    const r = await sendMsg({ type: 'GET_PASSWORD_FOR_ID', id }, 4, 400);
    return r?.ok ? r : null;
  }

  function _randInt(min, max) {
    const a = new Uint32Array(1); crypto.getRandomValues(a);
    return min + (a[0] % (max - min + 1));
  }

  async function smartFill(el, val) {
    if (!el || val === undefined || val === null) return;
    try {
      // Click + focus
      const rect = el.getBoundingClientRect();
      const mx = rect.left + _randInt(6, Math.max(8, rect.width - 6));
      const my = rect.top  + _randInt(3, Math.max(4, rect.height - 3));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, clientX:mx, clientY:my, button:0 }));
      el.dispatchEvent(new MouseEvent('mouseup',   { bubbles:true, clientX:mx, clientY:my, button:0 }));
      el.dispatchEvent(new MouseEvent('click',     { bubbles:true, clientX:mx, clientY:my, button:0 }));
      el.dispatchEvent(new FocusEvent('focus',     { bubbles:true }));
      el.focus();
      await new Promise(r => setTimeout(r, _randInt(30, 80)));

      // Phase 1: Set value reliably (React/Vue/Angular safe)
      const ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (ns) ns.call(el, val); else el.value = val;
      if (el._valueTracker) el._valueTracker.setValue('');
      el.dispatchEvent(new InputEvent('input',  { bubbles:true, cancelable:false, inputType:'insertText', data:val }));
      el.dispatchEvent(new Event('change',      { bubbles:true }));

      // Phase 2: Per-char keyboard events (human timing)
      for (let i = 0; i < val.length; i++) {
        const ch = val[i], kc = ch.charCodeAt(0);
        const kp = { bubbles:true, cancelable:true, key:ch, keyCode:kc, which:kc };
        el.dispatchEvent(new KeyboardEvent('keydown',  kp));
        el.dispatchEvent(new KeyboardEvent('keypress', { ...kp, charCode:kc }));
        el.dispatchEvent(new KeyboardEvent('keyup',    kp));
        const d = _randInt(0,99);
        await new Promise(r => setTimeout(r, d<8 ? _randInt(180,380) : d<22 ? _randInt(10,40) : _randInt(40,130)));
      }

      el.style.transition = 'box-shadow .15s';
      el.style.boxShadow  = '0 0 0 2px rgba(124,92,252,.4)';
      setTimeout(() => { try { el.style.boxShadow=''; } catch {} }, 600);
    } catch {
      try {
        const ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (ns) ns.call(el, val); else el.value = val;
        ['input','change'].forEach(n => el.dispatchEvent(new Event(n, { bubbles:true })));
      } catch {}
    }
  }

  async function doFill(entry, quiet = false) {
    closeDrop();
    const creds = await getFullCreds(entry.id);
    if (!creds) {
      if (!quiet) toast('Vault locked — pehle popup se unlock karo');
      return;
    }
    const vis    = () => Array.from(document.querySelectorAll('input')).filter(i => isVisible(i));
    let uField   = vis().find(i => isUserField(i));
    if (!uField && creds.username) uField = vis().find(i => isPhoneField(i));
    const pField = vis().find(i => isPwField(i));

    if (uField && creds.username) await smartFill(uField, creds.username);
    _lastFilled = creds;
    if (uField && creds.username && pField) await new Promise(r => setTimeout(r, _randInt(150,280)));

    if (pField) {
      await smartFill(pField, creds.password);
      addEye(pField);
      if (!quiet) toast(uField ? '✓ Fill ho gaya!' : '✓ Password fill!');
      const s = await getSettings();
      if (s && s.autoSubmit) setTimeout(() => smartSubmit(pField, uField, quiet), 700);
    } else {
      _pendingPw = creds.password;
      if (!quiet) toast('⏳ Username fill! Password step ka wait...');
      let tries = 0;
      const poll = async () => {
        if (!_pendingPw) return;
        const pw = vis().find(i => isPwField(i));
        if (pw) {
          await smartFill(pw, _pendingPw); addEye(pw);
          toast('✓ Password fill ho gaya!'); _pendingPw = null;
        } else if (tries++ < 180) {
          setTimeout(poll, 500);
        } else {
          _pendingPw = null;
        }
      };
      setTimeout(poll, 300);
    }
  }



  // OTP/TOTP Auto-fill — called when OTP field focused
  async function fillOtpField(el) {
    if (!_fetched || !_entries.length) return false;
    for (const entry of _entries) {
      const result = await sendMsg({ type:'GET_TOTP_CODE', id:entry.id }, 3, 300);
      if (result && result.ok) {
        await smartFill(el, result.code);
        const sec = result.remaining;
        toast('OTP: ' + result.code + ' — ' + sec + 's mein badlega');
        el.style.transition='box-shadow .15s';
        el.style.boxShadow='0 0 0 2px rgba(251,191,36,.5)';
        setTimeout(()=>{ try{ el.style.boxShadow=''; }catch{} },800);
        if(sec<=3){
          setTimeout(async()=>{
            const r2=await sendMsg({type:'GET_TOTP_CODE',id:entry.id},2,200);
            if(r2?.ok && document.activeElement===el){ await smartFill(el,r2.code); toast('OTP renewed: '+r2.code); }
          },(sec+1)*1000);
        }
        return true;
      }
    }
    toast('OTP field mila! Entry mein 2FA secret add karo');
    return false;
  }

  // ─── CAPTCHA + Submit engine ──────────────────────────────────────────
  function findTextCaptchaInput() {
    for (const inp of document.querySelectorAll('input')) {
      if (!isVisible(inp) || inp.type==='hidden' || inp.type==='password') continue;
      const a = [inp.name,inp.id,inp.placeholder,inp.className].map(v=>(v||'').toLowerCase()).join(' ');
      if (/captcha|verif(y|ication)|security.?code|anti.?spam/.test(a)) return inp;
    }
    return null;
  }

  function hasBotCaptcha() {
    if (document.querySelector('.g-recaptcha,.recaptcha,[data-sitekey]')) return true;
    if (document.querySelector('iframe[src*="recaptcha"],iframe[src*="hcaptcha"]')) return true;
    if (document.querySelector('.h-captcha,[data-hcaptcha-widget-id]')) return true;
    if (document.querySelector('.cf-turnstile,[data-cf-turnstile]')) return true;
    if (document.querySelector('iframe[src*="challenges.cloudflare"],iframe[src*="funcaptcha"]')) return true;
    return false;
  }

  function findSubmitBtn(pwField, uField) {
    const form = pwField?.closest('form') || uField?.closest('form');
    const sels = ['button[type="submit"]','input[type="submit"]','button[name="submit"]','button[name="login"]'];
    if (form) {
      for (const s of sels) { const b=form.querySelector(s); if (b&&!b.disabled&&isVisible(b)) return b; }
      for (const b of form.querySelectorAll('button,input[type="button"]')) {
        const t=(b.innerText||b.value||'').toLowerCase().trim();
        if (/^(login|log in|sign in|continue|next|submit|enter)$/i.test(t)&&!b.disabled&&isVisible(b)) return b;
      }
      for (const b of form.querySelectorAll('button')) {
        const t=(b.innerText||b.value||'').toLowerCase();
        if (/log.?in|sign.?in|continue|submit|next/.test(t)&&!b.disabled&&isVisible(b)) return b;
      }
    }
    for (const s of sels) { const b=document.querySelector(s); if (b&&!b.disabled&&isVisible(b)) return b; }
    return null;
  }

  let _autoSubmitDone = false;

  async function smartSubmit(pwField, uField, quiet) {
    try {
      if (pwField && !pwField.value) return;

      // Bot CAPTCHA — user complete karo
      if (hasBotCaptcha()) { toast('⚠️ CAPTCHA complete karo, phir Login dabao'); return; }

      // Text CAPTCHA field — highlight + Enter se auto-submit
      const ci = findTextCaptchaInput();
      if (ci && !ci.value.trim()) {
        ci.style.boxShadow = '0 0 0 3px rgba(251,191,36,.8)';
        ci.style.borderColor = '#fbbf24';
        ci.focus();
        toast('⌨️ CAPTCHA bharo → Enter dabao');
        ci.addEventListener('keydown', async function onEnt(e) {
          if (e.key==='Enter' && ci.value.trim()) {
            e.preventDefault(); ci.removeEventListener('keydown', onEnt);
            await new Promise(r=>setTimeout(r,250));
            const btn=findSubmitBtn(pwField,uField);
            if (btn&&!btn.disabled) { _autoSubmitDone=true; btn.click(); toast('✅ Login!'); }
          }
        });
        return;
      }

      // Normal submit
      let btn = findSubmitBtn(pwField, uField);
      if (!btn) { await new Promise(r=>setTimeout(r,1500)); btn=findSubmitBtn(pwField,uField); }
      if (!btn) {
        if (pwField) {
          pwField.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter',keyCode:13}));
          pwField.dispatchEvent(new KeyboardEvent('keyup',  {bubbles:true,key:'Enter',keyCode:13}));
          if (!quiet) toast('↵ Enter press kiya');
        }
        return;
      }
      if (btn.disabled) {
        await new Promise(r=>setTimeout(r,1000));
        btn=findSubmitBtn(pwField,uField);
        if (!btn||btn.disabled) { if(!quiet) toast('⚠️ Submit button disabled'); return; }
      }
      _autoSubmitDone = true;
      btn.click();
      if (!quiet) toast('✅ Login ho gaya!');
    } catch(e) { console.warn('[Vault] smartSubmit:',e); }
  }

  // FIX #4: Math.random() → crypto.getRandomValues() — Cryptographically secure
  function genPassword() {
    const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', L = 'abcdefghjkmnpqrstuvwxyz',
          D = '23456789', S = '!@#$%&*';
    const all = U + L + D + S;
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    // Guarantee at least one of each type
    let p = [
      U[arr[0] % U.length],
      L[arr[1] % L.length],
      D[arr[2] % D.length],
      S[arr[3] % S.length],
    ];
    for (let i = 4; i < 12; i++) p.push(all[arr[i] % all.length]);
    // Secure Fisher-Yates shuffle
    const sh = new Uint8Array(p.length);
    crypto.getRandomValues(sh);
    for (let i = p.length - 1; i > 0; i--) {
      const j = sh[i] % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    return p.join('');
  }

  // Dropdown
  function showDrop(entries, fieldEl, showSug) {
    closeDrop();
    if (!entries.length && !showSug) return;
    const rect     = fieldEl.getBoundingClientRect();
    const w        = Math.min(Math.max(rect.width, 220), 340);
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropH    = Math.min(entries.length * 46 + 70, 280);
    const top      = spaceBelow > dropH ? rect.bottom + 2 : rect.top - dropH - 2;
    const left     = Math.min(rect.left, window.innerWidth - w - 8);

    const drop = document.createElement('div');
    drop.id = '__vlt_drop__';
    drop.setAttribute('role', 'listbox');
    drop.style.cssText = `top:${top}px;left:${left}px;width:${w}px;`;
    drop.innerHTML = `<div class="__vlt_hdr__">${ICO_SHIELD}&nbsp;VAULT</div>`;
    _dropIndex = -1;
    const items = [];

    entries.slice(0, 6).forEach((en, i) => {
      const item = document.createElement('div');
      item.className = '__vlt_item__';
      item.setAttribute('role', 'option');
      item.dataset.idx = i;
      item.innerHTML = `
        <div class="__vlt_ico__">${ICO_KEY}</div>
        <div style="flex:1;min-width:0">
          <div class="__vlt_uname__">${esc(en.username || '(username nahi)')}</div>
          <div class="__vlt_sub__">${location.hostname}</div>
        </div>
        ${i === 0 ? `<span class="__vlt_kbd__">↵</span>` : ''}
      `;
      item.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); doFill(en); }, true);
      drop.appendChild(item);
      items.push(item);
    });

    if (showSug) {
      const pwd = genPassword();
      const sug = document.createElement('div');
      sug.className = '__vlt_sug__';
      sug.innerHTML = `
        <div class="__vlt_ico__" style="background:rgba(124,92,252,.2)">${ICO_STAR}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:600;color:#a78bfa">Strong Password Suggest</div>
          <div class="__vlt_pw__">${pwd.substring(0,14)}••</div>
        </div>`;
      sug.addEventListener('mousedown', async e => {
        e.preventDefault(); e.stopPropagation();
        const pw = Array.from(document.querySelectorAll('input')).filter(i=>isVisible(i)).find(i=>isPwField(i));
        if (pw) { await smartFill(pw, pwd); addEye(pw); toast('✓ Strong password set!'); }
        closeDrop();
      }, true);
      drop.appendChild(sug);
    }

    const foot = document.createElement('div');
    foot.className = '__vlt_foot__';
    foot.innerHTML = `${ICO_MGMT}&nbsp;Passwords manage karo`;
    foot.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation(); sendMsg({ type: 'OPEN_PASSWORDS' }); closeDrop();
    }, true);
    drop.appendChild(foot);

    document.body.appendChild(drop);
    _dropdown = drop;
    drop.__items   = items;
    drop.__entries = entries;
    setTimeout(() => document.addEventListener('mousedown', _outsideClick, true), 60);
  }

  function highlightItem(idx) {
    if (!_dropdown) return;
    _dropdown.__items.forEach((it,i) => it.classList.toggle('active', i===idx));
    _dropIndex = idx;
  }

  function _outsideClick(e) {
    if (_dropdown && !_dropdown.contains(e.target) && e.target !== _activeField) closeDrop();
  }
  function closeDrop() {
    _dropdown?.remove(); _dropdown = null; _dropIndex = -1;
    document.removeEventListener('mousedown', _outsideClick, true);
  }
  function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  let _toastTimer;
  function toast(msg) {
    document.getElementById('__vlt_toast__')?.remove();
    clearTimeout(_toastTimer);
    const t = document.createElement('div'); t.id = '__vlt_toast__'; t.textContent = msg;
    document.body.appendChild(t);
    _toastTimer = setTimeout(() => {
      t.style.opacity = '0'; t.style.transition = 'opacity .2s';
      setTimeout(() => t.remove(), 200);
    }, 1800);
  }

  function addEye(pwField) {
    if (!pwField || pwField.dataset.vltEye) return;
    pwField.dataset.vltEye = '1';
    const par = pwField.parentElement; if (!par) return;
    if (getComputedStyle(par).position === 'static') par.style.position = 'relative';
    const eye = document.createElement('div');
    eye.className = '__vlt_eye__'; eye.innerHTML = ICO_EYE;
    let show = false;
    eye.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      show = !show; pwField.type = show ? 'text' : 'password';
      eye.innerHTML = show ? ICO_EYOFF : ICO_EYE;
    });
    par.appendChild(eye);
  }

  // Event Handlers
  async function onFocus(e) {
    if (_dead) return;
    const el = e.target;
    _activeField = el;
    if (el.tagName !== 'INPUT') return;

    if (isPwField(el) && _pendingPw) {
      await smartFill(el, _pendingPw); addEye(el);
      toast('✓ Password fill ho gaya!'); _pendingPw = null; return;
    }

    // OTP field — TOTP autofill
    if (isOtpField(el)) {
      if (!_fetched) await prefetch();
      if (_entries.length) fillOtpField(el);
      return;
    }

    const isU = isUserField(el), isP = isPwField(el);
    if (!isU && !isP) return;

    // FIX: Chrome start — agar entries empty hain aur fetched nahi, retry karo
    if (!_fetched) {
      await prefetch();
    } else if (!_entries.length) {
      // Vault ab unlock hua ho sakta hai — fresh fetch try karo
      await prefetchFresh();
    }

    if (_dead) return;
    if (document.activeElement !== el) return;

    if (_entries.length === 1) {
      if (!_autoFilled) {
        _autoFilled = true; doFill(_entries[0], true); toast('✓ Auto-fill ho gaya!');
      } else {
        showDrop(_entries, el, false);
      }
    } else if (_entries.length > 1) {
      showDrop(_entries, el, false);
    } else if (isU && isSignupForm(el)) {
      showDrop([], el, true);
    }
  }

  function onInput(e) {
    if (_dead) return;
    const el = e.target;
    if (!isUserField(el)) return;
    const q = (el.value || '').toLowerCase().trim();
    if (!q) {
      if (_entries.length) showDrop(_entries, el, false);
      else closeDrop();
      return;
    }
    if (!_entries.length) return;
    const hits = _entries
      .filter(en => (en.username||'').toLowerCase().includes(q))
      .sort((a,b) => {
        const aS = (a.username||'').toLowerCase().startsWith(q) ? 0 : 1;
        const bS = (b.username||'').toLowerCase().startsWith(q) ? 0 : 1;
        return aS - bS;
      });
    if (hits.length) showDrop(hits, el, false); else closeDrop();
  }

  function onKeydown(e) {
    if (_dead) return;
    if (e.key === 'Escape') { closeDrop(); return; }
    if (!_dropdown) return;
    const items = _dropdown.__items || [];
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlightItem((_dropIndex+1)%items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlightItem((_dropIndex<=0?items.length:_dropIndex)-1); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      const isTab = e.key === 'Tab';
      const idx   = isTab ? ((_dropIndex>=0)?_dropIndex:0) : _dropIndex;
      if (idx < 0) return;
      const entries = _dropdown.__entries || [];
      if (entries[idx]) { if (isTab) e.preventDefault(); doFill(entries[idx]); }
    }
  }

  function scan() {
    if (_dead) return;

    if (_pendingPw) {
      const visiblePw = Array.from(document.querySelectorAll('input')).filter(i => isPwField(i));
      if (visiblePw.length > 0) {
        const pw = visiblePw[0];
        const savedPw = _pendingPw;
        _pendingPw = null;
        setTimeout(async () => { await smartFill(pw, savedPw); addEye(pw); toast('✓ Password fill!'); }, 50);
        return;
      }
    }

    let newFields = false;
    document.querySelectorAll('input').forEach(inp => {
      if (!isVisible(inp) || inp.dataset.vltScanned) return;
      if (!isUserField(inp) && !isPwField(inp)) return;
      inp.dataset.vltScanned = '1';
      newFields = true;
      if (isPwField(inp) && _pendingPw) {
        const pw = _pendingPw; _pendingPw = null;
        setTimeout(async () => { await smartFill(inp, pw); addEye(inp); toast('✓ Password fill!'); }, 10);
      }
    });
    if (newFields && _fetched && _entries.length === 1 && !_autoFilled) attemptAutoFillOnLoad();
  }

  // FILL_CREDENTIALS from popup autofill bar
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (_dead || msg.type !== 'FILL_CREDENTIALS') return;
    (async () => {
      try {
        const vis    = () => Array.from(document.querySelectorAll('input')).filter(i => isVisible(i));
        let uField   = vis().find(i => isUserField(i));
        if (!uField && msg.username) uField = vis().find(i => isPhoneField(i));
        const pField = vis().find(i => isPwField(i));

        let filled = false;
        if (uField && msg.username) { await smartFill(uField, msg.username); filled = true; }
        if (uField && pField && msg.username && msg.password) await new Promise(r => setTimeout(r, _randInt(120,250)));
        if (pField && msg.password) { await smartFill(pField, msg.password); addEye(pField); filled = true; }

        if (!pField && msg.password) {
          _pendingPw = msg.password;
          let tries  = 0;
          const poll = async () => {
            const pw = vis().find(i => isPwField(i));
            if (pw && _pendingPw) {
              await smartFill(pw, _pendingPw); addEye(pw);
              toast('✓ Popup se autofill ho gaya!'); _pendingPw = null;
            } else if (tries++ < 120 && _pendingPw) setTimeout(poll, 500);
          };
          setTimeout(poll, 300);
          filled = true;
        }

        if (filled) toast('✓ Vault se autofill ho gaya!');
        else toast('Login fields nahi mile — page check karo');

        if (msg.submit && filled) setTimeout(() => smartSubmit(pField, uField, false), 700);
        sendResponse({ ok: true, filled });
      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  });

  // ══════════════════════════════════════════════════════════════════
  // SAVE PASSWORD SYSTEM — Silent + Popup modes
  // silentAutoSave=true  → bina pooche background mein save
  // autoPromptSave=true  → popup dikhao (jab silent=false)
  // dono false           → save nahi hota
  // ══════════════════════════════════════════════════════════════════

  let _saveInProgress = false;

  function handleFormSubmit() {
    if (!_pendingCreds) return;
    // Dual approach: setTimeout + beforeunload (both ensure we capture before page change)
    _saveInProgress = false;
    setTimeout(() => checkPendingSave('submit'), 800);
  }

  // beforeunload: last-resort save before page navigation
  window.addEventListener('beforeunload', () => {
    if (_dead || _saveInProgress || !_pendingCreds) return;
    const creds = _pendingCreds;
    if (!creds.p || creds.p.length < 6) return;
    // Synchronous-ish: use sendBeacon via background for silent save
    // (can't await here, but sendMsg with keepalive=true works in MV3)
    getSettings().then(s => {
      if (s.silentAutoSave) {
        // Silent: save immediately without waiting
        chrome.runtime.sendMessage({
          type: 'VERIFY_AND_SILENT_SAVE',
          url: location.hostname,
          username: creds.u,
          password: creds.p,
          fullUrl: location.protocol + '//' + location.hostname,
          title: document.title || location.hostname
        }).catch(() => {});
      }
    }).catch(() => {});
  }, { capture: true });

  // URL change detection (SPA: same-page navigation after login)
  let _lastSaveUrl = location.href;
  const _urlObserver = new MutationObserver(() => {
    if (location.href !== _lastSaveUrl) {
      _lastSaveUrl = location.href;
      if (_pendingCreds && !_saveInProgress) {
        setTimeout(() => checkPendingSave('urlchange'), 400);
      }
    }
  });
  _urlObserver.observe(document.documentElement, { subtree: true, childList: true });

  async function checkPendingSave(trigger = 'submit') {
    if (_dead || !_pendingCreds || _saveInProgress) return;
    _saveInProgress = true;

    try {
      const creds = _pendingCreds;
      _pendingCreds = null;

      if (!creds.p || creds.p.length < 6) { _saveInProgress = false; return; }

      const s = await getSettings();
      const isSilent = !!s.silentAutoSave;
      const isPrompt = s.autoPromptSave !== false;

      // Neither mode active — don't save
      if (!isSilent && !isPrompt) { _saveInProgress = false; return; }

      // Check if entry exists / needs update
      const status = await sendMsg({
        type: 'VERIFY_SAVE_STATUS',
        url: location.hostname,
        username: creds.u,
        password: creds.p
      }, 3, 400);

      if (!status || status.action === 'NONE') { _saveInProgress = false; return; }

      if (isSilent) {
        // ── SILENT AUTO-SAVE: No popup, direct save ──────────────────
        const res = await sendMsg({
          type:  status.action === 'UPDATE' ? 'UPDATE_ENTRY_PASS' : 'SAVE_NEW_ENTRY',
          id:    status.entryId,
          entry: {
            title:    document.title || location.hostname,
            url:      location.protocol + '//' + location.hostname,
            username: creds.u || '',
            password: creds.p
          }
        }, 3, 400);

        if (res && res.ok) {
          const msg = status.action === 'UPDATE'
            ? '✅ Password update ho gaya (silent)'
            : '✅ Password save ho gaya (silent)';
          toast(msg);
        }
      } else if (isPrompt) {
        // ── POPUP PROMPT: User se poochho ─────────────────────────────
        showSavePrompt(creds.u, creds.p, status.action === 'UPDATE', status.entryId);
      }

    } catch (e) {
      console.warn('[Vault] checkPendingSave error:', e.message);
    } finally {
      setTimeout(() => { _saveInProgress = false; }, 2000);
    }
  }

  function showSavePrompt(user, pass, isUpdate, existingId) {
    if (document.getElementById('__vlt_save_prompt__')) return;
    const prompt = document.createElement('div');
    prompt.id    = '__vlt_save_prompt__';
    prompt.innerHTML = `
      <header style="margin-bottom:18px;display:flex;align-items:center;gap:12px">
        <div style="width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#7c5cfc,#c084fc);display:flex;align-items:center;justify-content:center;">
          ${ICO_KEY.replace('stroke="#7c5cfc"','stroke="#fff"')}
        </div>
        <div style="flex:1">
          <h3 style="margin:0;font-size:16px;font-weight:700;color:#fff">${isUpdate?'Update Password?':'Save to Vault?'}</h3>
          <div style="font-size:11px;color:#7c5cfc;font-weight:800;margin-top:2px">${location.hostname.toUpperCase()}</div>
        </div>
      </header>
      <div style="background:rgba(0,0,0,0.3);padding:14px;border-radius:14px;margin-bottom:22px;display:flex;flex-direction:column;gap:10px;border:1px solid rgba(255,255,255,0.06)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;color:#64748b;font-weight:700">ACCOUNT</span>
          <span style="font-size:13px;color:#f1f5f9;font-weight:600">${esc(user||'(No Username)')}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;color:#64748b;font-weight:700">PASSWORD</span>
          <span style="font-size:14px;color:#a78bfa;font-family:monospace;letter-spacing:2px">••••••••</span>
        </div>
      </div>
      <div id="__vlt_sp_btns__">
        <button class="__vlt_sp_btn__ __vlt_sp_close__" id="__vlt_sp_no__">Not Now</button>
        <button class="__vlt_sp_btn__ __vlt_sp_save__" id="__vlt_sp_yes__">${isUpdate?'Update':'Save Password'}</button>
      </div>
    `;
    document.body.appendChild(prompt);

    document.getElementById('__vlt_sp_no__').addEventListener('click', () => {
      prompt.style.animation = '__vlt_in_r__ 0.3s reverse forwards';
      setTimeout(() => prompt.remove(), 300);
    });
    document.getElementById('__vlt_sp_yes__').addEventListener('click', async () => {
      await sendMsg({
        type:  isUpdate ? 'UPDATE_ENTRY_PASS' : 'SAVE_NEW_ENTRY',
        id:    existingId,
        entry: { title: location.hostname, url: location.protocol + '//' + location.hostname, username: user||'', password: pass }
      }, 3, 400);
      prompt.innerHTML = `<div style="text-align:center;padding:20px 0;">
        <div style="font-size:44px;margin-bottom:14px">✨</div>
        <h3 style="margin:0 0 6px;font-size:18px;font-weight:800;color:#fff">${isUpdate?'Updated!':'Saved!'}</h3>
        <p style="margin:0;font-size:13px;color:#94a3b8;">Secured in Vault.</p>
      </div>`;
      setTimeout(() => { prompt.style.animation='__vlt_in_r__ 0.3s reverse forwards'; setTimeout(()=>prompt.remove(),300); }, 1500);
    });
  }

  // FIX #5: Password memory mein rakho, sessionStorage mein NAHI
  document.addEventListener('input', e => {
    if (_dead) return;
    const el = e.target;
    if (isPwField(el) && el.value) {
      const scope = el.closest('form') || document;
      const users = Array.from(scope.querySelectorAll('input')).filter(i => isUserField(i) && i.value);
      // Memory mein rakho — sessionStorage mein nahi (XSS safe)
      _pendingCreds = { u: users[0]?.value||'', p: el.value, d: location.hostname };
    }
  }, true);

  document.addEventListener('submit', () => { if (!_dead) handleFormSubmit(); }, true);

  document.addEventListener('click', e => {
    if (_dead) return;
    const btn = e.target.closest('button, input[type="submit"], input[type="button"], a');
    if (btn) {
      const text = (btn.innerText || btn.value || '').toLowerCase();
      if (btn.type === 'submit' || /log.?in|sign.?in|continue|submit|next/.test(text)) handleFormSubmit();
    }
  }, true);

  // Init
  prefetch();
  if (document.head) injectCSS(); else document.addEventListener('DOMContentLoaded', injectCSS);
  getSettings();
  document.addEventListener('focusin',  onFocus,   true);
  document.addEventListener('input',    onInput,   true);
  document.addEventListener('keydown',  onKeydown, true);

  const obs = new MutationObserver(scan);
  const startObs = () => {
    const root = document.documentElement || document.body;
    if (root) obs.observe(root, { childList: true, subtree: true });
  };
  startObs();

  const parseInterval = setInterval(scan, 200);
  document.addEventListener('DOMContentLoaded', () => { clearInterval(parseInterval); scan(); });

  let _prevUrl = location.href;
  const _spaInterval = setInterval(() => {
    if (_dead) { clearInterval(_spaInterval); return; }
    if (location.href !== _prevUrl) {
      _prevUrl      = location.href;
      _fetched      = false;
      _fetchPromise = null;
      _settings     = null;
      _autoFilled     = false;
      _autoSubmitDone = false;
      closeDrop();
      prefetch().then(checkPendingSave);
      setTimeout(scan, 300);
      setTimeout(scan, 1000);
      setTimeout(scan, 2000);
    }
  }, 500);

  window.addEventListener('beforeunload', () => {
    clearTimeout(_fetchRetryTimer);
    clearInterval(_spaInterval);
    obs.disconnect();
    closeDrop();
  });

})();
