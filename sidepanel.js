'use strict';

let currentFolderId = '1';
let folderHistory = [{ id: '1', title: 'Home' }];
let currentTab = 'bookmarks';
let allMobiles = [];
let vaultUnlocked = false;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    init();

    // Tab switching
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.dataset.tab;
            refreshView();
        });
    });

    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        handleSearch(query);
    });

    document.getElementById('refreshBtn').addEventListener('click', () => init());

    // Messages
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'SET_SESSION' || msg.type === 'AUTO_LOCKED') {
            checkVaultStatus();
        }
    });
});

async function init() {
    await checkVaultStatus();
    refreshView();
}

async function checkVaultStatus() {
    const res = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
    vaultUnlocked = res.ok;
    document.getElementById('lockOverlay').style.display = vaultUnlocked ? 'none' : 'flex';

    if (vaultUnlocked) {
        const entriesRes = await chrome.runtime.sendMessage({ type: 'GET_ALL_ENTRIES' });
        if (entriesRes.ok) {
            allMobiles = entriesRes.entries.filter(e => e.mobile);
        }
    }
}

function refreshView() {
    if (currentTab === 'bookmarks') {
        document.getElementById('bmBreadcrumb').style.display = 'flex';
        loadBookmarks(currentFolderId);
    } else {
        document.getElementById('bmBreadcrumb').style.display = 'none';
        renderMobiles(allMobiles);
    }
}

async function loadBookmarks(folderId) {
    if (folderId === '1') {
        // Try to find "SITARAM" or "BABASITARAM" folder first
        const searchNodes = await new Promise(res => chrome.bookmarks.search('SITARAM', res));
        const sitaramFolder = searchNodes.find(n => !n.url);
        if (sitaramFolder && folderHistory.length === 1) {
            folderId = sitaramFolder.id;
            folderHistory[0] = { id: folderId, title: sitaramFolder.title };
        }
    }

    chrome.bookmarks.getSubTree(folderId, (results) => {
        if (chrome.runtime.lastError || !results[0]) return;
        currentFolderId = folderId;
        renderList(results[0].children || [], 'bookmarks');
        updateBreadcrumbs();
    });
}

function renderList(nodes, type) {
    const list = document.getElementById('mainList');
    list.innerHTML = '';

    if (nodes.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding: 40px; color:rgba(255,255,255,0.1); font-size:13px;">यहाँ कुछ नहीं है!</div>`;
        return;
    }

    nodes.forEach(node => {
        const item = document.createElement('div');
        item.className = 'list-item';

        const isFolder = !node.url;
        const icon = isFolder ? '📁' : `<img src="chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(node.url)}&size=32" style="width:16px;height:16px;" onerror="this.outerHTML='🔖'">`;

        item.innerHTML = `
            <div class="item-icon">${icon}</div>
            <div class="item-info">
                <div class="item-title" style="${isFolder ? 'color:var(--accent);' : ''}">${node.title || node.url || 'Untitled'}</div>
                <div class="item-sub">${isFolder ? 'Folder' : extractHostname(node.url)}</div>
            </div>
            <div class="item-actions">
                ${!isFolder ? `<button class="action-btn import-vault-btn" title="Save to Vault">📥</button>` : ''}
                ${!isFolder ? `<button class="action-btn open-tab-btn" title="Open">🔗</button>` : ''}
            </div>
        `;

        const importBtn = item.querySelector('.import-vault-btn');
        if (importBtn) {
            importBtn.onclick = async (ev) => {
                ev.stopPropagation();
                if (!vaultUnlocked) { showToast('Vault Unlock karein!'); return; }
                importBtn.disabled = true;
                importBtn.textContent = '⏳';

                const entriesRes = await chrome.runtime.sendMessage({ type: 'GET_ALL_ENTRIES' });
                if (entriesRes.ok) {
                    const existing = entriesRes.entries || [];
                    const newEntry = {
                        id: 'v-' + Date.now(),
                        title: node.title || 'Untitled',
                        url: node.url || '',
                        username: '',
                        password: '',
                        notes: 'Imported from Bookmarks',
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        starred: false
                    };
                    const res = await chrome.runtime.sendMessage({
                        type: 'SAVE_ALL_ENTRIES',
                        entries: [...existing, newEntry]
                    });
                    if (res.ok) {
                        showToast('Vault mein save ho gaya! ✓');
                        importBtn.textContent = '✅';
                    } else {
                        showToast('Error saving!');
                        importBtn.textContent = '📥';
                    }
                }
                importBtn.disabled = false;
            };
        }

        const openBtn = item.querySelector('.open-tab-btn');
        if (openBtn) {
            openBtn.onclick = (ev) => {
                ev.stopPropagation();
                chrome.tabs.create({ url: node.url });
            };
        }

        item.onclick = () => {
            if (isFolder) {
                folderHistory.push({ id: node.id, title: node.title });
                loadBookmarks(node.id);
            } else if (node.url) {
                chrome.tabs.create({ url: node.url });
            }
        };

        list.appendChild(item);
    });
}

function renderMobiles(data) {
    const list = document.getElementById('mainList');
    list.innerHTML = '';

    if (!vaultUnlocked) {
        list.innerHTML = `<div style="text-align:center; padding: 40px; color:var(--text-dim); font-size:12px;">अनलॉक करें</div>`;
        return;
    }

    if (data.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding: 40px; color:rgba(255,255,255,0.1); font-size:13px;">कोई नंबर नहीं मिला!</div>`;
        return;
    }

    data.forEach(e => {
        const item = document.createElement('div');
        item.className = 'list-item';

        item.innerHTML = `
            <div class="item-icon">📱</div>
            <div class="item-info">
                <div class="item-title">${e.title || 'Untitled'}</div>
                <div class="item-sub">${e.mobile}</div>
            </div>
            <button class="action-btn" title="Copy">📋</button>
        `;

        item.querySelector('.action-btn').onclick = (ev) => {
            ev.stopPropagation();
            copyToClipboard(e.mobile);
        };

        item.onclick = () => copyToClipboard(e.mobile);
        list.appendChild(item);
    });
}

function handleSearch(query) {
    if (!query) {
        refreshView();
        return;
    }

    if (currentTab === 'bookmarks') {
        chrome.bookmarks.search(query, (results) => {
            renderList(results.slice(0, 40), 'bookmarks');
        });
    } else {
        const filtered = allMobiles.filter(e =>
            e.title.toLowerCase().includes(query) ||
            e.mobile.includes(query)
        );
        renderMobiles(filtered);
    }
}

function updateBreadcrumbs() {
    const container = document.getElementById('bmBreadcrumb');
    container.innerHTML = '';
    folderHistory.forEach((item, index) => {
        const span = document.createElement('span');
        span.textContent = item.title;
        span.onclick = (e) => {
            e.stopPropagation();
            folderHistory = folderHistory.slice(0, index + 1);
            loadBookmarks(item.id);
        };
        container.appendChild(span);
        if (index < folderHistory.length - 1) {
            const sep = document.createElement('span');
            sep.textContent = '›';
            sep.style.margin = '0 2px';
            sep.style.opacity = '0.3';
            container.appendChild(sep);
        }
    });
}

function extractHostname(url) {
    try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied!');
    } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Copied!');
    }
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:var(--purple-gold); color:white; padding:10px 20px; border-radius:30px; font-size:12px; z-index:10000; box-shadow:0 10px 30px rgba(0,0,0,0.5); font-weight:700;';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}
