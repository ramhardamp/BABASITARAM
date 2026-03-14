// BabaSitaRam Pro — Background Service Worker

const VAULTX_SIG = 'VaultX-Proprietary-v3';
const VAULTX_ORIGIN_HASH = '7a3f9b2e1c8d4f6a';

// ═══ KEEP-ALIVE via chrome.alarms (setInterval MV3 mein kaam nahi karta) ═══
chrome.alarms.create('bsr-keepalive', { periodInMinutes: 0.4 }); // har ~24s

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'bsr-keepalive') {
    // SW ko jaagta rakhne ke liye storage ping
    chrome.storage.local.get('_ka', () =>
      chrome.storage.local.set({ _ka: Date.now() })
    );
  }
});

// SW start hone par alarm re-register karo (SW restart ke baad bhi)
self.addEventListener('activate', () => {
  chrome.alarms.get('bsr-keepalive', alarm => {
    if (!alarm) chrome.alarms.create('bsr-keepalive', { periodInMinutes: 0.4 });
  });
});

// Chrome start hone par aur install par run karo
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get('vx3', data => {
    if (data.vx3) {
      // Vault loaded — badge set karo
      try {
        const V = JSON.parse(data.vx3);
        const count = (V.pw || []).length;
        chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
        chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
      } catch (e) {}
    }
  });
});

// Context menu: .vaultbak file pe right-click
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'vaultx-open',
    title: '🔐 BabaSitaRam Pro mein open karo',
    contexts: ['link'],
    targetUrlPatterns: ['*://*/*.vaultbak', 'file://*/*.vaultbak']
  });
  // Install par bhi badge set karo
  chrome.storage.local.get('vx3', data => {
    if (data.vx3) {
      try {
        const V = JSON.parse(data.vx3);
        const count = (V.pw || []).length;
        chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
        chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
      } catch (e) {}
    }
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'vaultx-open') {
    chrome.tabs.create({ url: info.linkUrl });
  }
});

// Content script se message receive karo (autofill request)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'BADGE_UPDATE') {
    chrome.action.setBadgeText({ text: msg.count > 0 ? String(msg.count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
    return;
  }

  if (msg.type === 'GET_PASSWORDS') {
    chrome.storage.local.get('vx3', (data) => {
      if (!data.vx3) return sendResponse({ passwords: [] });
      try {
        const V = JSON.parse(data.vx3);
        sendResponse({ passwords: V.pw || [] });
      } catch (e) {
        sendResponse({ passwords: [] });
      }
    });
    return true; // async response
  }

  if (msg.type === 'VERIFY_VAULTBAK') {
    verifyOriginLock(msg.content)
      .then(result => sendResponse(result))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'SAVE_PASSWORD') {
    chrome.storage.local.get('vx3', (data) => {
      try {
        const V = data.vx3 ? JSON.parse(data.vx3) : { pw: [], master: '', settings: {}, fpId: null };
        const exists = V.pw.findIndex(p => p.id === msg.entry.id);
        if (exists >= 0) V.pw[exists] = msg.entry;
        else V.pw.push(msg.entry);
        chrome.storage.local.set({ vx3: JSON.stringify(V) });
        chrome.action.setBadgeText({ text: String(V.pw.length) });
        chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
        sendResponse({ ok: true });
      } catch (e) { sendResponse({ ok: false }); }
    });
    return true;
  }
});

async function verifyOriginLock(content) {
  try {
    const obj = JSON.parse(content);
    if (obj.sig !== VAULTX_SIG) return { ok: false, error: '🚫 Yeh file VaultX ke liye nahi hai! Kisi aur app se open nahi hogi.' };
    if (!obj.originHash) return { ok: false, error: '🚫 Origin token missing — file invalid ya tampered hai!' };
    // Verify hash
    const raw = JSON.stringify({ app: obj.app, version: obj.version });
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw + VAULTX_ORIGIN_HASH));
    const expected = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    if (obj.originHash !== expected) return { ok: false, error: '🚫 File tampered ya kisi aur app se export ki gayi!' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Invalid file format' };
  }
}
