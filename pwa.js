/* WandaTools PWA — service worker registration, install prompt, push, background sync */
/* WandaDB (IndexedDB), WandaPIN (offline PIN auth), and auto-sync on reconnect       */

(function () {
  'use strict';

  const API_BASE = 'https://wandatools.up.railway.app';
  let deferredInstallPrompt = null;

  // ─── Service Worker ──────────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then((reg) => {
          reg.addEventListener('updatefound', () => {
            const worker = reg.installing;
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                _showUpdateBanner();
              }
            });
          });
          _initPushNotifications();
        })
        .catch((err) => console.warn('[WandaPWA] SW registration failed:', err));

      // Background-sync completion from service worker
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'SYNC_COMPLETE') {
          _showToast('Offline changes synced successfully.', 'success');
        }
      });
    });
  }

  // ─── Online / Offline indicator ───────────────────────────────────────────────
  function _updateOnlineStatus() {
    const el = document.getElementById('pwa-offline-bar');
    if (!el) return;
    el.hidden = navigator.onLine;
  }

  window.addEventListener('online',  _autoSync);   // syncs queue then updates bar
  window.addEventListener('offline', _updateOnlineStatus);

  // ─── Install prompt (Android / Desktop Chrome) ────────────────────────────────
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    setTimeout(_showInstallBanner, 4000);
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    _hideInstallBanner();
    _showToast('WandaTools installed! Find it on your home screen.', 'success');
  });

  function _showInstallBanner() {
    if (!deferredInstallPrompt) return;
    if (sessionStorage.getItem('pwa-install-dismissed')) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (document.getElementById('pwa-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.setAttribute('role', 'complementary');
    banner.setAttribute('aria-label', 'Install WandaTools as an app');
    banner.innerHTML = `
      <div class="pwa-banner-icon" aria-hidden="true">
        <img src="/icons/icon.svg" alt="" width="40" height="40" />
      </div>
      <div class="pwa-banner-text">
        <strong>Install WandaTools</strong>
        <span>Works offline &amp; loads faster from your home screen</span>
      </div>
      <div class="pwa-banner-actions">
        <button class="pwa-btn-install" id="pwa-install-btn">Install</button>
        <button class="pwa-btn-dismiss" id="pwa-install-dismiss" aria-label="Dismiss install prompt">&#x2715;</button>
      </div>
    `;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('pwa-install-banner--visible'));

    document.getElementById('pwa-install-btn').addEventListener('click', _triggerInstall);
    document.getElementById('pwa-install-dismiss').addEventListener('click', _dismissInstallBanner);
  }

  function _hideInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (!banner) return;
    banner.classList.remove('pwa-install-banner--visible');
    setTimeout(() => banner.remove(), 400);
  }

  function _dismissInstallBanner() {
    _hideInstallBanner();
    sessionStorage.setItem('pwa-install-dismissed', '1');
  }

  async function _triggerInstall() {
    if (!deferredInstallPrompt) return;
    _hideInstallBanner();
    const { outcome } = await deferredInstallPrompt.prompt();
    if (outcome !== 'accepted') setTimeout(_showInstallBanner, 30_000);
    deferredInstallPrompt = null;
  }

  // ─── iOS install banner (Safari does not fire beforeinstallprompt) ─────────────
  const _isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const _isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                        ('standalone' in navigator && navigator.standalone);

  if (_isIOS && !_isStandalone) {
    setTimeout(() => {
      if (sessionStorage.getItem('pwa-ios-dismissed')) return;
      if (document.getElementById('pwa-ios-banner')) return;

      const banner = document.createElement('div');
      banner.id = 'pwa-ios-banner';
      banner.setAttribute('role', 'complementary');
      banner.setAttribute('aria-label', 'Add WandaTools to your home screen');
      banner.innerHTML = `
        <button class="pwa-ios-close" id="pwa-ios-dismiss" aria-label="Dismiss">&#x2715;</button>
        <div class="pwa-ios-inner">
          <img src="/icons/icon.svg" alt="WandaTools icon" width="44" height="44" class="pwa-ios-icon" />
          <div class="pwa-ios-text">
            <strong>Add to Home Screen</strong>
            <p>Tap <span aria-label="Share button">&#x2B06;&#xFE0F;</span> then <em>"Add to Home Screen"</em> for the full app experience.</p>
          </div>
        </div>
        <div class="pwa-ios-arrow" aria-hidden="true">&#x25BC;</div>
      `;
      document.body.appendChild(banner);
      requestAnimationFrame(() => banner.classList.add('pwa-ios-banner--visible'));

      document.getElementById('pwa-ios-dismiss').addEventListener('click', () => {
        banner.classList.remove('pwa-ios-banner--visible');
        setTimeout(() => banner.remove(), 400);
        sessionStorage.setItem('pwa-ios-dismissed', '1');
      });
    }, 4000);
  }

  // ─── Update available banner ──────────────────────────────────────────────────
  function _showUpdateBanner() {
    if (document.getElementById('pwa-update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    banner.innerHTML = `
      <span class="material-icons" aria-hidden="true">system_update</span>
      <span>A new version of WandaTools is available.</span>
      <button id="pwa-update-now">Update Now</button>
      <button id="pwa-update-later" aria-label="Dismiss update banner">&#x2715;</button>
    `;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('pwa-update-banner--visible'));

    document.getElementById('pwa-update-now').addEventListener('click', () => window.location.reload());
    document.getElementById('pwa-update-later').addEventListener('click', () => banner.remove());
  }

  // ─── Offline status bar + PWA-install PIN gate ───────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    const bar = document.createElement('div');
    bar.id = 'pwa-offline-bar';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    bar.hidden = true;
    bar.innerHTML = `
      <span class="material-icons" aria-hidden="true">wifi_off</span>
      <span>You're offline &mdash; showing cached content</span>
    `;
    document.body.appendChild(bar);
    _updateOnlineStatus();

    // When running as an installed PWA, enforce PIN setup once before the user
    // can use the app. Runs once per session (sessionStorage guards repeat prompts
    // within the same tab); repeats each new session until a PIN is actually saved.
    const _isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                   ('standalone' in navigator && navigator.standalone === true);
    if (_isPWA && !sessionStorage.getItem('pwa-pin-checked')) {
      sessionStorage.setItem('pwa-pin-checked', '1');
      const token = localStorage.getItem('access_token');
      if (token && !(await _dbHasPin())) {
        await _pinPromptSetup();
      }
    }
  });

  // ─── Push notifications ───────────────────────────────────────────────────────
  async function subscribeToPush() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      return { error: 'not_supported' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { error: 'denied' };

    let vapidPublicKey;
    try {
      const resp = await fetch(`${API_BASE}/api/v1/pwa/vapid-public-key`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      vapidPublicKey = (await resp.json()).publicKey;
    } catch (err) {
      console.warn('[WandaPWA] Could not fetch VAPID public key:', err);
      return { error: 'vapid_unavailable' };
    }

    // Validate the key before trying to decode — backend may return null/garbage
    if (!vapidPublicKey || typeof vapidPublicKey !== 'string' || vapidPublicKey.length < 10) {
      console.warn('[WandaPWA] VAPID key missing or invalid — push disabled');
      return { error: 'vapid_unavailable' };
    }

    let applicationServerKey;
    try {
      applicationServerKey = _urlBase64ToUint8Array(vapidPublicKey);
    } catch (err) {
      console.warn('[WandaPWA] VAPID key could not be decoded:', err.message);
      return { error: 'vapid_unavailable' };
    }

    const reg          = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey,
    });

    const token = localStorage.getItem('access_token');
    if (token) {
      try {
        const res = await fetch(`${API_BASE}/api/v1/pwa/push/subscribe`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body:    JSON.stringify(subscription),
        });
        if (!res.ok) console.warn('[WandaPWA] Subscribe response:', res.status, await res.text());
      } catch (err) {
        console.warn('[WandaPWA] Could not register push subscription:', err);
      }
    }

    return { subscription };
  }

  function _urlBase64ToUint8Array(base64) {
    // Strip whitespace, convert URL-safe chars to standard base64, then pad
    const cleaned = base64.trim().replace(/-/g, '+').replace(/_/g, '/');
    const padded  = cleaned + '='.repeat((4 - (cleaned.length % 4)) % 4);
    const raw     = atob(padded);   // throws InvalidCharacterError if still malformed
    return Uint8Array.from(Array.from(raw, (c) => c.charCodeAt(0)));
  }

  // ─── Push notification permission prompt ──────────────────────────────────────
  async function _initPushNotifications() {
    if (!('Notification' in window) || !('PushManager' in window)) return;
    if (Notification.permission === 'denied') return;
    if (Notification.permission === 'granted') { _ensurePushSubscription(); return; }
    setTimeout(_showNotificationBanner, 10_000);
  }

  async function _ensurePushSubscription() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      // subscribeToPush returns {error} if VAPID key is missing/invalid — no throw
      if (!existing) await subscribeToPush();
    } catch {
      // Push not available or not configured on this backend — ignore silently
    }
  }

  function _showNotificationBanner() {
    if (document.getElementById('pwa-notify-banner')) return;
    if (sessionStorage.getItem('pwa-notify-dismissed')) return;
    if (Notification.permission !== 'default') return;

    const banner = document.createElement('div');
    banner.id = 'pwa-notify-banner';
    banner.setAttribute('role', 'complementary');
    banner.setAttribute('aria-label', 'Enable push notifications');
    banner.innerHTML = `
      <div class="pwa-banner-icon" aria-hidden="true">
        <span class="material-icons">notifications_active</span>
      </div>
      <div class="pwa-banner-text">
        <strong>Stay in the loop</strong>
        <span>Get alerts for tips, new features &amp; account activity</span>
      </div>
      <div class="pwa-banner-actions">
        <button class="pwa-btn-install" id="pwa-notify-allow">Allow</button>
        <button class="pwa-btn-dismiss" id="pwa-notify-dismiss" aria-label="Dismiss">&#x2715;</button>
      </div>
    `;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('pwa-install-banner--visible'));

    document.getElementById('pwa-notify-allow').addEventListener('click', async () => {
      _hideNotificationBanner();
      const result = await subscribeToPush();
      if (result.error === 'denied') {
        _showToast('Notifications blocked. Enable them in your browser settings.', 'warning');
      } else if (result.subscription) {
        _showToast('Notifications enabled!', 'success');
      } else {
        _showToast('Could not enable notifications. Try again later.', 'error');
      }
    });

    document.getElementById('pwa-notify-dismiss').addEventListener('click', () => {
      _hideNotificationBanner();
      sessionStorage.setItem('pwa-notify-dismissed', '1');
    });
  }

  function _hideNotificationBanner() {
    const banner = document.getElementById('pwa-notify-banner');
    if (!banner) return;
    banner.classList.remove('pwa-install-banner--visible');
    setTimeout(() => banner.remove(), 400);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // WandaDB — IndexedDB with 4 stores
  // Stores: settings (key-value), users, transactions, offline_queue
  // ═══════════════════════════════════════════════════════════════════════════════

  const _DB_NAME = 'wandatools-db';
  const _DB_VER  = 1;
  let   _db      = null;

  function _openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(_DB_NAME, _DB_VER);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('settings'))
          db.createObjectStore('settings', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('users')) {
          const u = db.createObjectStore('users', { keyPath: 'id' });
          u.createIndex('email', 'email', { unique: true });
        }
        if (!db.objectStoreNames.contains('transactions')) {
          const t = db.createObjectStore('transactions', { keyPath: 'id' });
          t.createIndex('timestamp', 'timestamp');
          t.createIndex('user_id',   'user_id');
        }
        if (!db.objectStoreNames.contains('offline_queue')) {
          const q = db.createObjectStore('offline_queue', { keyPath: 'id', autoIncrement: true });
          q.createIndex('timestamp', 'timestamp');
        }
      };

      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror   = ()  => reject(req.error);
    });
  }

  function _idbTx(storeName, mode, fn) {
    return _openDB().then(db => new Promise((res, rej) => {
      const t   = db.transaction(storeName, mode);
      const req = fn(t.objectStore(storeName));
      if (req) { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }
      else     { t.oncomplete  = () => res();            t.onerror  = () => rej(t.error);   }
    }));
  }

  const _setting = {
    get: (key)        => _idbTx('settings', 'readonly',  s => s.get(key)).then(r => r?.value),
    set: (key, value) => _idbTx('settings', 'readwrite', s => s.put({ key, value })),
    del: (key)        => _idbTx('settings', 'readwrite', s => s.delete(key)),
  };

  // ─── Auth persistence (mirrors localStorage → IDB for offline recovery) ───────
  async function _dbSaveAuth(data) {
    await Promise.all([
      _setting.set('auth.token',    data.access_token),
      _setting.set('auth.refresh',  data.refresh_token),
      _setting.set('auth.email',    data.user.email),
      _setting.set('auth.name',     data.user.name || data.user.email.split('@')[0]),
      _setting.set('auth.currency', data.user.currency || 'E'),
    ]);
  }

  async function _dbGetAuth() {
    const [token, refresh, email, name, currency] = await Promise.all([
      _setting.get('auth.token'),   _setting.get('auth.refresh'),
      _setting.get('auth.email'),   _setting.get('auth.name'),
      _setting.get('auth.currency'),
    ]);
    return { token, refresh, email, name, currency: currency || 'E' };
  }

  async function _dbClearAuth() {
    await Promise.all(
      ['auth.token', 'auth.refresh', 'auth.email', 'auth.name', 'auth.currency']
        .map(k => _setting.del(k))
    );
  }

  async function _dbUpdateTokens(access, refresh) {
    await Promise.all([_setting.set('auth.token', access), _setting.set('auth.refresh', refresh)]);
  }

  // ─── Transactions ─────────────────────────────────────────────────────────────
  async function _dbSaveTransactions(rows) {
    const db = await _openDB();
    return new Promise((res, rej) => {
      const t = db.transaction('transactions', 'readwrite');
      rows.forEach(r => t.objectStore('transactions').put(r));
      t.oncomplete = res;
      t.onerror    = () => rej(t.error);
    });
  }

  async function _dbGetTransactions() {
    const db = await _openDB();
    return new Promise((res, rej) => {
      const req = db.transaction('transactions', 'readonly').objectStore('transactions').getAll();
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
  }

  // ─── SHA-256 PIN hashing (WebCrypto + random salt) ────────────────────────────
  async function _sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function _dbSavePin(pin) {
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const hash = await _sha256(pin + salt);
    await _setting.set('pin.hash', hash);
    await _setting.set('pin.salt', salt);
  }

  async function _dbVerifyPin(pin) {
    const [hash, salt] = await Promise.all([_setting.get('pin.hash'), _setting.get('pin.salt')]);
    if (!hash || !salt) return false;
    return (await _sha256(pin + salt)) === hash;
  }

  async function _dbHasPin()   { return !!(await _setting.get('pin.hash')); }
  async function _dbClearPin() { await _setting.del('pin.hash'); await _setting.del('pin.salt'); }

  // ─── Offline queue ────────────────────────────────────────────────────────────
  async function _dbEnqueue(url, method, headers, body) {
    const db = await _openDB();
    return new Promise((res, rej) => {
      const t   = db.transaction('offline_queue', 'readwrite');
      const req = t.objectStore('offline_queue').add({ url, method, headers, body, timestamp: Date.now() });
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
  }

  async function _dbGetQueued() {
    const db = await _openDB();
    return new Promise((res, rej) => {
      const req = db.transaction('offline_queue', 'readonly').objectStore('offline_queue').getAll();
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
  }

  async function _dbDeleteQueued(id) {
    const db = await _openDB();
    return new Promise((res, rej) => {
      const req = db.transaction('offline_queue', 'readwrite').objectStore('offline_queue').delete(id);
      req.onsuccess = () => res();
      req.onerror   = () => rej(req.error);
    });
  }

  // ─── Security wipe (5 failed PIN attempts) ────────────────────────────────────
  async function _dbWipeAll() {
    const db    = await _openDB();
    const names = ['settings', 'users', 'transactions', 'offline_queue'];
    await new Promise((res, rej) => {
      const t = db.transaction(names, 'readwrite');
      names.forEach(n => t.objectStore(n).clear());
      t.oncomplete = res;
      t.onerror    = () => rej(t.error);
    });
    localStorage.clear();
    sessionStorage.clear();
  }

  // ─── WandaDB public object ────────────────────────────────────────────────────
  window.WandaDB = {
    getSetting:       _setting.get,
    setSetting:       _setting.set,
    deleteSetting:    _setting.del,
    saveAuthData:     _dbSaveAuth,
    getAuthData:      _dbGetAuth,
    clearAuthData:    _dbClearAuth,
    updateTokens:     _dbUpdateTokens,
    saveTransactions: _dbSaveTransactions,
    getTransactions:  _dbGetTransactions,
    saveUser:         (user) => _idbTx('users', 'readwrite', s => s.put(user)),
    savePin:          _dbSavePin,
    verifyPin:        _dbVerifyPin,
    hasPin:           _dbHasPin,
    clearPin:         _dbClearPin,
    enqueue:          _dbEnqueue,
    getAllQueued:      _dbGetQueued,
    deleteQueued:     _dbDeleteQueued,
    wipeAll:          _dbWipeAll,
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // WandaPIN — Offline PIN setup and verification
  // ═══════════════════════════════════════════════════════════════════════════════

  const _PIN_MAX = 5;

  // Inject modal styles once (works even when CSS fails to load offline)
  (function _injectPinStyles() {
    if (document.getElementById('wpin-styles')) return;
    const s = document.createElement('style');
    s.id = 'wpin-styles';
    s.textContent = `
      .wpin-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;
        align-items:center;justify-content:center;z-index:999999;backdrop-filter:blur(4px);}
      .wpin-card{background:#fff;border-radius:16px;padding:32px;width:min(380px,90vw);
        box-shadow:0 24px 64px rgba(0,0,0,.22);font-family:'Open Sans',sans-serif;}
      .wpin-title{margin:0 0 8px;color:#1a1a2e;font-family:'Poppins',sans-serif;font-size:1.1rem;}
      .wpin-sub{color:#666;font-size:.875rem;margin:0 0 16px;}
      .wpin-err{color:#DC3545;font-size:.8rem;min-height:1.2em;margin:6px 0 0;display:block;}
      .wpin-fields{display:flex;gap:8px;}
      .wpin-fields input,.wpin-big{flex:1;padding:10px 12px;border:2px solid #ddd;border-radius:8px;
        font-size:.95rem;outline:none;width:100%;box-sizing:border-box;transition:border-color .2s;}
      .wpin-big{text-align:center;font-size:1.5rem;letter-spacing:8px;}
      .wpin-fields input:focus,.wpin-big:focus{border-color:#007BFF;}
      .wpin-actions{display:flex;gap:8px;margin-top:20px;justify-content:flex-end;}
      .wpin-btn{padding:9px 18px;border:none;border-radius:8px;cursor:pointer;font-weight:600;
        font-size:.875rem;background:#f0f0f0;color:#333;transition:opacity .2s;}
      .wpin-btn-primary{background:#007BFF;color:#fff;}
      .wpin-btn:hover{opacity:.85;}
    `;
    document.head.appendChild(s);
  })();

  function _pinOverlay(html) {
    const ov = document.createElement('div');
    ov.className = 'wpin-overlay';
    ov.innerHTML = `<div class="wpin-card">${html}</div>`;
    document.body.appendChild(ov);
    return ov;
  }

  function _pinClose(ov) {
    ov.style.cssText += 'transition:opacity .25s;opacity:0;';
    setTimeout(() => ov.remove(), 260);
  }

  // Prompt user to set a PIN after their first successful login.
  async function _pinPromptSetup() {
    if (await _dbHasPin()) return; // already configured
    return new Promise(resolve => {
      const ov = _pinOverlay(`
        <h3 class="wpin-title">Set up Offline PIN</h3>
        <p class="wpin-sub">Create a 4–6 digit PIN to access WandaTools when you're offline.</p>
        <div class="wpin-fields">
          <input type="password" inputmode="numeric" maxlength="6" id="wpin1"
                 placeholder="Enter PIN" autocomplete="new-password" />
          <input type="password" inputmode="numeric" maxlength="6" id="wpin2"
                 placeholder="Confirm PIN" autocomplete="new-password" />
        </div>
        <span class="wpin-err" id="wpin-err"></span>
        <div class="wpin-actions">
          <button class="wpin-btn wpin-btn-primary" id="wpin-save">Save PIN</button>
          <button class="wpin-btn" id="wpin-skip">Skip</button>
        </div>
      `);

      ov.querySelector('#wpin-save').addEventListener('click', async () => {
        const p1 = ov.querySelector('#wpin1').value;
        const p2 = ov.querySelector('#wpin2').value;
        const er = ov.querySelector('#wpin-err');
        if (!/^\d{4,6}$/.test(p1)) { er.textContent = 'PIN must be 4–6 digits.'; return; }
        if (p1 !== p2)              { er.textContent = 'PINs do not match.';       return; }
        await _dbSavePin(p1);
        await _setting.set('pin.attempts', 0);
        _pinClose(ov);
        _showToast('Offline PIN saved!', 'success');
        resolve(true);
      });

      ov.querySelector('#wpin-skip').addEventListener('click', () => {
        _pinClose(ov);
        resolve(false);
      });
    });
  }

  // Check for cached credentials and show PIN verify modal when offline.
  // Returns true if access was granted, false otherwise.
  async function _pinCheckOfflineAccess() {
    if (navigator.onLine) return false;

    const cached = await _dbGetAuth();
    if (!cached.token || !cached.email) return false;

    // No PIN set — restore silently (no extra barrier)
    if (!(await _dbHasPin())) {
      _pinRestore(cached);
      return true;
    }

    return new Promise(resolve => {
      const ov = _pinOverlay(`
        <h3 class="wpin-title">Offline Access</h3>
        <p class="wpin-sub">You're offline. Enter your PIN to continue.</p>
        <input type="password" inputmode="numeric" maxlength="6" id="wpin-v"
               class="wpin-big" placeholder="••••" autocomplete="current-password" />
        <span class="wpin-err" id="wpin-ve"></span>
        <div class="wpin-actions">
          <button class="wpin-btn wpin-btn-primary" id="wpin-unlock">Unlock</button>
        </div>
      `);

      const inp = ov.querySelector('#wpin-v');
      inp.focus();
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') ov.querySelector('#wpin-unlock').click();
      });

      ov.querySelector('#wpin-unlock').addEventListener('click', async () => {
        const pin = inp.value;
        const er  = ov.querySelector('#wpin-ve');
        er.textContent = '';
        if (!/^\d{4,6}$/.test(pin)) { er.textContent = 'Enter your 4–6 digit PIN.'; return; }

        const attempts = (await _setting.get('pin.attempts')) || 0;

        if (await _dbVerifyPin(pin)) {
          await _setting.set('pin.attempts', 0);
          _pinClose(ov);
          _pinRestore(cached);
          resolve(true);
        } else {
          const next = attempts + 1;
          await _setting.set('pin.attempts', next);
          const left = _PIN_MAX - next;
          if (next >= _PIN_MAX) {
            er.textContent = 'Too many attempts. Wiping local data for security…';
            setTimeout(async () => {
              await _dbWipeAll();
              _pinClose(ov);
              location.href = '/signup.html';
            }, 2000);
          } else {
            er.textContent = `Incorrect PIN — ${left} attempt${left !== 1 ? 's' : ''} left.`;
            inp.value = '';
            inp.focus();
          }
        }
      });
    });
  }

  // Restore cached credentials from IDB into localStorage so the rest of the
  // app (nav.js, auth checks) sees a valid logged-in state.
  function _pinRestore(c) {
    localStorage.setItem('access_token',  c.token);
    localStorage.setItem('refresh_token', c.refresh);
    localStorage.setItem('user_email',    c.email);
    localStorage.setItem('user_name',     c.name);
    localStorage.setItem('user_currency', c.currency);
    if (window.WandaAuth?.auth?._load) WandaAuth.auth._load();
  }

  window.WandaPIN = {
    promptSetup:        _pinPromptSetup,
    checkOfflineAccess: _pinCheckOfflineAccess,
  };

  // ─── Offline queue — mutations made while offline ─────────────────────────────
  async function queueOfflineRequest(url, method, headers, body) {
    await _dbEnqueue(url, method, headers, body);
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('sync-pending-requests').catch(() => {});
    }
  }

  // ─── Auto-sync: batch-send queued requests when connection returns ─────────────
  async function _autoSync() {
    _updateOnlineStatus();
    const items = await _dbGetQueued().catch(() => []);
    if (!items.length) return;

    const token = localStorage.getItem('access_token');
    try {
      const res = await fetch(`${API_BASE}/api/v1/pwa/sync`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ requests: items }),
      });
      if (res.ok) {
        await Promise.all(items.map(item => _dbDeleteQueued(item.id)));
        _showToast(`${items.length} offline change${items.length !== 1 ? 's' : ''} synced.`, 'success');
      }
    } catch (err) {
      console.warn('[WandaPWA] Online sync failed:', err);
    }
  }

  // ─── Toast helper ─────────────────────────────────────────────────────────────
  function _showToast(message, type = 'info') {
    if (typeof showAlert === 'function') { showAlert(message, type); return; }
    const colours = { success: '#28A745', error: '#DC3545', info: '#007BFF', warning: '#FFC107' };
    const toast = document.createElement('div');
    Object.assign(toast.style, {
      position: 'fixed', bottom: '80px', left: '50%',
      transform: 'translateX(-50%)', background: colours[type] || colours.info,
      color: '#fff', padding: '10px 20px', borderRadius: '8px',
      fontFamily: "'Open Sans', sans-serif", fontSize: '14px',
      zIndex: '99999', boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
      pointerEvents: 'none',
    });
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
  }

  // ─── Public API ───────────────────────────────────────────────────────────────
  window.WandaPWA = {
    subscribeToPush,
    queueOfflineRequest,
    triggerInstall:      _triggerInstall,
    enableNotifications: _showNotificationBanner,
  };
  // WandaDB and WandaPIN are exposed on window directly above
})();
