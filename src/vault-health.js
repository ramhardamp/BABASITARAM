// ═══════════════════════════════════════════════════════════════════════════════
// VAULT HEALTH GUARD v1.0 — Self-Healing System
// Runs on every popup/page load. Detects & auto-fixes storage corruption,
// inconsistent state, dead keys, and broken settings.
// ═══════════════════════════════════════════════════════════════════════════════
'use strict';

const VaultHealthGuard = (() => {

    // ── Storage helpers ──────────────────────────────────────────────────────────
    function getS(key) {
        return new Promise(res =>
            chrome.storage.local.get([key], r => res(r[key] !== undefined ? r[key] : null))
        );
    }
    function setS(obj) {
        return new Promise(res => chrome.storage.local.set(obj, res));
    }

    // ── Default safe settings ────────────────────────────────────────────────────
    const DEFAULT_SETTINGS = {
        theme: 'dark',
        autoLockTime: 10,
        clipboardClear: 30,
        blockWeak: true,
        encryptBackup: true,
        excludeSimilar: false,
        defaultLength: 16,
        passwordSuggestion: true,
        silentAutoSave: false,
        autoPromptSave: true,
        autoSubmit: false,
        autoBackup: false,
        rememberMe: false,
    };

    // ── FIX 1: Settings corruption ───────────────────────────────────────────────
    // If any setting is NaN, null, or wrong type, reset it to default.
    async function fixSettings() {
        const saved = (await getS('vault_settings')) || {};
        let changed = false;
        const fixed = { ...DEFAULT_SETTINGS };

        for (const key of Object.keys(DEFAULT_SETTINGS)) {
            const v = saved[key];
            const def = DEFAULT_SETTINGS[key];
            if (v === undefined || v === null) {
                fixed[key] = def;
                changed = true;
            } else if (typeof def === 'number') {
                const n = Number(v);
                if (isNaN(n) || !isFinite(n)) {
                    fixed[key] = def;
                    changed = true;
                } else {
                    fixed[key] = n;
                }
            } else if (typeof def === 'boolean') {
                fixed[key] = Boolean(v);
            } else {
                fixed[key] = v;
            }
        }

        if (changed) {
            await setS({ vault_settings: fixed });
            console.info('[VaultHealth] Settings repaired ✓');
        }
        return fixed;
    }

    // ── FIX 2: PIN state inconsistency ──────────────────────────────────────────
    // vault_pin_enabled=true but vault_pin_hash missing → disable PIN automatically
    async function fixPinState() {
        const [enabled, hash, encMp] = await Promise.all([
            getS('vault_pin_enabled'),
            getS('vault_pin_hash'),
            getS('vault_pin_enc_mp'),
        ]);

        if (enabled && (!hash || !encMp)) {
            console.warn('[VaultHealth] PIN enabled but hash/encMp missing → auto-disabling PIN');
            await setS({ vault_pin_enabled: false, vault_pin_hash: null, vault_pin_enc_mp: null });
            return { fixed: true, reason: 'PIN state inconsistency fixed' };
        }
        return { fixed: false };
    }

    // ── FIX 3: Stale remember-me cleanup ────────────────────────────────────────
    // If vault_remember_until is expired, clear stored remembered password.
    async function fixRememberMe() {
        const until = await getS('vault_remember_until');
        if (until && Date.now() >= until) {
            await setS({ vault_remember_until: null, vault_remembered_mp: null });
            console.info('[VaultHealth] Expired remember-me cleared ✓');
        }
    }

    // ── FIX 4: Legacy plaintext entries nuke ─────────────────────────────────────
    // vault_entries was the old plaintext format — dangerous if left around.
    async function fixLegacyEntries() {
        const legacy = await getS('vault_entries');
        if (legacy !== null && legacy !== undefined && legacy !== 'null') {
            await setS({ vault_entries: null });
            console.info('[VaultHealth] Legacy plaintext entries nuked ✓');
        }
    }

    // ── FIX 5: vault_setup_complete alignment ───────────────────────────────────
    // If vault_hash exists but setup_complete is missing, set it.
    async function fixSetupFlag() {
        const [hash, complete] = await Promise.all([
            getS('vault_hash'),
            getS('vault_setup_complete'),
        ]);
        if (hash && !complete) {
            await setS({ vault_setup_complete: true });
            console.info('[VaultHealth] vault_setup_complete flag repaired ✓');
        }
    }

    // ── FIX 6: Vault hash format check ──────────────────────────────────────────
    // If vault_hash is not a string (e.g. corrupted to a number/null during a bad write),
    // we cannot recover — but we can detect and warn (must not auto-wipe, respect user data).
    async function checkVaultHash() {
        const hash = await getS('vault_hash');
        if (hash !== null && typeof hash !== 'string') {
            console.error('[VaultHealth] CRITICAL: vault_hash is not a string! Value:', typeof hash);
            return { ok: false, reason: 'Vault hash corrupted' };
        }
        return { ok: true };
    }

    // ── FIX 7: Theme sync ───────────────────────────────────────────────────────
    async function fixThemeSync() {
        const settings = (await getS('vault_settings')) || {};
        const storedTheme = settings.theme || 'dark';
        localStorage.setItem('vault_theme', storedTheme);
        document.documentElement.setAttribute('data-theme', storedTheme);
        // Anti-flicker: Wait for theme to apply before showing UI
        document.documentElement.style.visibility = 'visible';
    }

    // ── FIX 8: Genetic Index Maintenance (2050 Formula) ────────────────────────
    async function optimizeIndex() {
        // Only run if service worker is responsive
        chrome.runtime.sendMessage({ type: 'OPTIMIZE_INDEX' }).catch(() => { });
    }

    // ── MAIN: Run all health checks silently ────────────────────────────────────
    async function runAll() {
        try {
            // Anti-flicker: starts hidden
            if (document.documentElement) document.documentElement.style.visibility = 'hidden';

            await Promise.allSettled([
                fixSettings(),
                fixPinState(),
                fixRememberMe(),
                fixLegacyEntries(),
                fixSetupFlag(),
                checkVaultHash(),
                fixThemeSync(),
            ]);

            // Rebuild cache index in background for 0ms lookup
            setTimeout(optimizeIndex, 500);

        } catch (err) {
            if (document.documentElement) document.documentElement.style.visibility = 'visible';
            console.error('[VaultHealth] Guard error (non-fatal):', err);
        }
    }

    // ── RECOVERY UI: Shows a "Repair Vault" UI when things are badly broken ─────
    function showRecoveryBanner(message) {
        if (document.getElementById('__vh_banner__')) return;
        const b = document.createElement('div');
        b.id = '__vh_banner__';
        b.style.cssText = [
            'position:fixed;top:0;left:0;right:0;z-index:99999',
            'background:linear-gradient(135deg,#c084fc,#f43f5e)',
            'color:#fff;font-size:13px;font-weight:700',
            'padding:10px 20px;display:flex;align-items:center;gap:12px',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
            'box-shadow:0 4px 20px rgba(0,0,0,0.5)',
        ].join(';');
        b.innerHTML = `<span>⚠️ Vault Health: ${message}</span>`;
        const btn = document.createElement('button');
        btn.textContent = '✕';
        btn.style.cssText = 'background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer;font-weight:700;margin-left:auto;';
        btn.onclick = () => b.remove();
        b.appendChild(btn);
        document.body?.prepend(b);
    }

    // ── STORAGE MONITOR: Watch for unexpected data loss ─────────────────────────
    function startStorageMonitor() {
        if (typeof chrome === 'undefined' || !chrome.storage) return;
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;

            // If vault_hash gets deleted unexpectedly while we have a blob → warn
            if ('vault_hash' in changes && !changes.vault_hash.newValue && changes.vault_hash.oldValue) {
                console.warn('[VaultHealth] vault_hash was deleted! Vault may be inaccessible.');
            }

            // If vault_encrypted_blob is written as empty string → auto-fix (common bug)
            if ('vault_encrypted_blob' in changes) {
                const nv = changes.vault_encrypted_blob.newValue;
                if (nv === '' || nv === 'null') {
                    chrome.storage.local.set({ vault_encrypted_blob: null });
                    console.warn('[VaultHealth] Fixed: vault_encrypted_blob set to empty string → null');
                }
            }
        });
    }

    return { runAll, fixSettings, fixPinState, fixRememberMe, fixSetupFlag, showRecoveryBanner, startStorageMonitor };
})();

// Auto-run on load
if (typeof chrome !== 'undefined' && chrome.storage) {
    VaultHealthGuard.runAll();
    VaultHealthGuard.startStorageMonitor();
}
