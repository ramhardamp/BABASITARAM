// theme.js — Shared theme init & toggle (CSP-safe, no inline scripts)
'use strict';

// Apply saved theme immediately (before DOMContentLoaded to avoid flash)
(function () {
  const t = localStorage.getItem('vault_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
})();

// Wire up toggle buttons after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('vault_theme', t);
    document.querySelectorAll('.theme-toggle, #themeBtn, #themeToggleLock, #themeToggleMain').forEach(btn => {
      btn.textContent = t === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
    });
  }

  // Set initial button labels and wire click handlers
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  document.querySelectorAll('.theme-toggle, #themeBtn, #themeToggleLock, #themeToggleMain').forEach(btn => {
    btn.textContent = current === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
    btn.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }); // ← forEach closes here
  // NOTE: lockEyeBtn is handled by popup.js bindEvents() — not here (avoid double-listener bug)
});
