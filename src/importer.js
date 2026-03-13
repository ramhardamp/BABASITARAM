/**
 * importer.js - Universal Password Importer Engine
 * Supports: .vaultbak, .csv, .json from major managers (Chrome, Bitwarden, LastPass, etc.)
 */

const Importer = (() => {
  const norm = (e) => ({
    title: (e.title || '').trim(),
    url: (e.url || '').trim(),
    username: (e.username || '').trim(),
    password: (e.password || '').trim(),
    notes: (e.notes || '').trim(),
    totp: (e.totp || e.totpSecret || '').trim(),
    mobile: (e.mobile || '').trim()
  });

  function extractDomain(url) {
    try {
      if (!url) return '';
      if (!url.startsWith('http')) url = 'https://' + url;
      const h = new URL(url).hostname.replace(/^www\./, '');
      const p = h.split('.')[0];
      return p.charAt(0).toUpperCase() + p.slice(1);
    } catch { return url || ''; }
  }

  function colOf(header, ...names) {
    for (const n of names) {
      const i = header.findIndex(h => h === n || h.includes(n));
      if (i !== -1) return i;
    }
    return -1;
  }

  function parseCSV(text) {
    const lines = [];
    let cur = '', inQ = false, row = [];
    for (let i = 0; i < text.length; i++) {
        const ch = text[i], nx = text[i+1];
        if (ch === '"') {
            if (inQ && nx === '"') { cur += '"'; i++; }
            else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
            row.push(cur.trim()); cur = '';
        } else if ((ch === '\n' || ch === '\r') && !inQ) {
            if (ch === '\r' && nx === '\n') i++;
            row.push(cur.trim()); cur = '';
            if (row.some(c => c !== '')) lines.push(row);
            row = [];
        } else { cur += ch; }
    }
    if (cur || row.length) { row.push(cur.trim()); if (row.some(c=>c!=='')) lines.push(row); }
    return lines;
  }

  // --- Format Detectors ---
  const detectors = {
    vaultbak: (rawText) => {
        // Handled outside for decryption
        return null; 
    },
    google: (rows) => {
      const h = rows[0].map(x => x.toLowerCase().trim());
      if (!h.includes('url') || !h.includes('password')) throw 'Not Google';
      const iU=h.indexOf('url'), iUser=h.indexOf('username'), iPw=h.indexOf('password'), iN=h.indexOf('name');
      return rows.slice(1).filter(r=>r[iPw]).map(r=>norm({
        title: (iN>=0?r[iN]:'')||extractDomain(r[iU]),
        url: r[iU], username: r[iUser], password: r[iPw]
      }));
    },
    bitwarden: (rows) => {
      const h = rows[0].map(x => x.toLowerCase());
      if (!h.includes('login_password')) throw 'Not Bitwarden';
      const iName = colOf(h,'name'), iUrl = colOf(h,'login_uri'), iUser = colOf(h,'login_username'), iPw = colOf(h,'login_password'), iTotp = colOf(h,'login_totp');
      return rows.slice(1).filter(r=>r[iPw]).map(r=>norm({
        title: r[iName], url: r[iUrl], username: r[iUser], password: r[iPw], totp: r[iTotp]
      }));
    },
    lastpass: (rows) => {
      const h = rows[0].map(x => x.toLowerCase());
      if (!h.includes('extra') && !h.includes('grouping')) throw 'Not LastPass';
      const iUrl=colOf(h,'url'), iUser=colOf(h,'username'), iPw=colOf(h,'password'), iName=colOf(h,'name'), iNotes=colOf(h,'extra');
      return rows.slice(1).filter(r=>r[iPw]).map(r=>norm({
        title: r[iName]||extractDomain(r[iUrl]), url: r[iUrl], username: r[iUser], password: r[iPw], notes: r[iNotes]
      }));
    },
    generic: (rows) => {
        const h = rows[0].map(x => x.toLowerCase().trim());
        const iPw = colOf(h,'password','pass','pwd','secret');
        if (iPw === -1) throw 'No password col';
        const iT=colOf(h,'name','title','site'), iU=colOf(h,'url','website'), iUser=colOf(h,'username','user','login','email'), iNotes=colOf(h,'notes','note','comment');
        return rows.slice(1).filter(r=>r[iPw]).map(r=>norm({
            title: r[iT]||extractDomain(r[iU]), url: r[iU], username: r[iUser], password: r[iPw], notes: r[iNotes]
        }));
    }
  };

  async function smartParse(text, filename = '') {
    const trimmed = text.trim();
    if (!trimmed) return [];

    // JSON try
    if (trimmed.startsWith('{') || trimmed.startsWith('[') || filename.endsWith('.json')) {
        try {
            const d = JSON.parse(trimmed);
            // Bitwarden JSON
            if (d.items) return d.items.filter(i=>i.login?.password).map(i=>norm({ title: i.name, url: i.login.uris?.[0]?.uri, username: i.login.username, password: i.login.password, notes: i.notes, totp: i.login.totp }));
            // Array of objects
            if (Array.isArray(d)) return d.map(norm);
            // Wrapper
            if (d.entries) return d.entries.map(norm);
        } catch(e) {}
    }

    // CSV try
    let rows;
    try { rows = parseCSV(trimmed); } catch(e) { return []; }
    if (!rows.length) return [];

    for (const key in detectors) {
        try {
            const res = detectors[key](rows);
            if (res && res.length) return res;
        } catch(e) {}
    }

    return [];
  }

  return { smartParse, parseCSV, norm };
})();
