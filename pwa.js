/* WandaTools PWA — service worker registration, install prompt, push, background sync */
/* Replace VAPID_PUBLIC_KEY with the actual key from your backend push configuration. */

(function () {
  'use strict';

  const VAPID_PUBLIC_KEY = 'Public key: <cryptography.hazmat.bindings._rust.openssl.ec.ECPublicKey object at 0x00000278CE639A50>';
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
        })
        .catch((err) => console.warn('[WandaPWA] SW registration failed:', err));

      // Listen for background-sync completion messages
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

  window.addEventListener('online',  _updateOnlineStatus);
  window.addEventListener('offline', _updateOnlineStatus);

  // ─── Install prompt (Android / Desktop Chrome) ────────────────────────────────
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    // Delay so the page has time to load before the banner appears
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
    // Trigger slide-in animation on next frame
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
    if (outcome !== 'accepted') {
      // Re-offer after a longer delay if declined
      setTimeout(_showInstallBanner, 30_000);
    }
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

    document.getElementById('pwa-update-now').addEventListener('click', () => {
      window.location.reload();
    });
    document.getElementById('pwa-update-later').addEventListener('click', () => {
      banner.remove();
    });
  }

  // ─── Offline status bar ───────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
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
  });

  // ─── Push notifications ───────────────────────────────────────────────────────
  async function subscribeToPush() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      return { error: 'not_supported' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { error: 'denied' };

    const reg          = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // Register subscription with backend
    const token = localStorage.getItem('access_token');
    if (token) {
      try {
        await fetch('https://wandatools.up.railway.app/api/v1/push/subscribe', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(subscription),
        });
      } catch (err) {
        console.warn('[WandaPWA] Could not register push subscription:', err);
      }
    }

    return { subscription };
  }

  function _urlBase64ToUint8Array(base64) {
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const raw    = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(Array.from(raw, (c) => c.charCodeAt(0)));
  }

  // ─── Background Sync — IndexedDB queue for offline mutations ─────────────────
  let _idb = null;

  async function _openDB() {
    if (_idb) return _idb;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('wanda-offline-db', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('pending-requests')) {
          const store = db.createObjectStore('pending-requests', { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp');
        }
      };
      req.onsuccess = (e) => { _idb = e.target.result; resolve(_idb); };
      req.onerror   = () => reject(req.error);
    });
  }

  async function queueOfflineRequest(url, method, headers, body) {
    const db = await _openDB();
    await new Promise((resolve, reject) => {
      const tx    = db.transaction('pending-requests', 'readwrite');
      const store = tx.objectStore('pending-requests');
      const req   = store.add({ url, method, headers, body, timestamp: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });

    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('sync-pending-requests').catch(() => {});
    }
  }

  // ─── Toast helper ─────────────────────────────────────────────────────────────
  function _showToast(message, type = 'info') {
    if (typeof WandaAuth !== 'undefined' && WandaAuth.showAlert) {
      WandaAuth.showAlert(message, type);
      return;
    }
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
    triggerInstall: _triggerInstall,
  };
})();
