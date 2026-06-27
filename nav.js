/**
 * WandaTools — nav.js
 * Foundation file loaded by every page.
 * Provides: API_BASE, AuthState, apiCall(), renderNavigation(),
 *           protectPage(), protectFromAuth(), showAlert()
 *
 * Load this FIRST on every page:
 *   <script src="nav.js"></script>
 */

// ═══════════════════════════════════════════════════════════
// CONFIG — single source of truth for API URL
// ═══════════════════════════════════════════════════════════

const API_BASE = "https://wandatools.up.railway.app/api/v1";

// localStorage key constants — consistent across every page
const KEYS = {
  ACCESS_TOKEN:  'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_EMAIL:    'user_email',
  USER_NAME:     'user_name',
  USER_CURRENCY: 'user_currency',
};

// ═══════════════════════════════════════════════════════════
// AUTH STATE
// ═══════════════════════════════════════════════════════════

class AuthState {
  constructor() {
    this._load();
  }

  _load() {
    this.token        = localStorage.getItem(KEYS.ACCESS_TOKEN);
    this.refreshToken = localStorage.getItem(KEYS.REFRESH_TOKEN);
    this.email        = localStorage.getItem(KEYS.USER_EMAIL);
    this.name         = localStorage.getItem(KEYS.USER_NAME);
    this.currency     = localStorage.getItem(KEYS.USER_CURRENCY) || 'E';
    this.isLoggedIn   = !!(this.token && this.email);
  }

  login(data) {
    /**
     * Call after a successful /auth/register or /auth/login response.
     * data = { access_token, refresh_token, user: { email, name, currency } }
     */
    localStorage.setItem(KEYS.ACCESS_TOKEN,  data.access_token);
    localStorage.setItem(KEYS.REFRESH_TOKEN, data.refresh_token);
    localStorage.setItem(KEYS.USER_EMAIL,    data.user.email);
    localStorage.setItem(KEYS.USER_NAME,     data.user.name  || data.user.email.split('@')[0]);
    localStorage.setItem(KEYS.USER_CURRENCY, data.user.currency || 'E');
    this._load();
  }

  logout() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    this._load();
  }

  updateTokens(accessToken, refreshToken) {
    localStorage.setItem(KEYS.ACCESS_TOKEN,  accessToken);
    localStorage.setItem(KEYS.REFRESH_TOKEN, refreshToken);
    this.token        = accessToken;
    this.refreshToken = refreshToken;
  }

  getUserName()     { return this.name  || (this.email ? this.email.split('@')[0] : 'User'); }
  getEmail()        { return this.email || ''; }
  getUserInitials() { return this.getUserName().charAt(0).toUpperCase(); }
  getCurrency()     { return this.currency || 'E'; }

  // Convenience method — some pages call WandaAuth.isLoggedIn() as a function
  // This makes both auth.isLoggedIn (property) and WandaAuth.isLoggedIn() (function) work
  static isLoggedIn() { return auth.isLoggedIn; }
  getName()           { return this.getUserName(); }
}

const auth = new AuthState();

// ═══════════════════════════════════════════════════════════
// API CALL HELPER
// Central fetch wrapper used by every page.
// Handles: Authorization header, JSON parsing, 401 auto-refresh,
//          and descriptive error messages.
// ═══════════════════════════════════════════════════════════

let _isRefreshing = false;
let _refreshQueue = [];

async function apiCall(path, options = {}) {
  /**
   * Make an authenticated API call.
   *
   * Usage:
   *   const data = await apiCall('/tools/transactions');
   *   const txn  = await apiCall('/tools/transactions', {
   *     method: 'POST',
   *     body: JSON.stringify({ ... })
   *   });
   *
   * - Automatically adds Authorization header
   * - Automatically retries once after token refresh on 401
   * - Throws Error with backend message on failure
   */
  const url = `${API_BASE}${path}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }

  let response = await fetch(url, { ...options, headers });

  // Auto-refresh on 401
  if (response.status === 401 && auth.refreshToken) {
    const newToken = await _refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(url, { ...options, headers });
    } else {
      // Refresh failed — log out and redirect
      auth.logout();
      showAlert('Session expired. Please sign in again.', 'error');
      setTimeout(() => { location.href = '/signup.html'; }, 1500);
      throw new Error('Session expired');
    }
  }

  // Parse response
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Server error (${response.status})`);
  }

  if (!response.ok) {
    // Surface backend error message
    const msg = typeof data.detail === 'string'
      ? data.detail
      : Array.isArray(data.detail)
        ? data.detail.map(e => e.msg).join(', ')
        : `Request failed (${response.status})`;
    throw new Error(msg);
  }

  return data;
}

async function _refreshAccessToken() {
  /**
   * Exchange the stored refresh token for a new access token.
   * Returns the new access token string, or null on failure.
   */
  if (_isRefreshing) {
    // Queue concurrent refresh attempts — resolve when first completes
    return new Promise((resolve) => _refreshQueue.push(resolve));
  }

  _isRefreshing = true;

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: auth.refreshToken }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    auth.updateTokens(data.access_token, data.refresh_token);

    // Resolve any queued callers
    _refreshQueue.forEach(resolve => resolve(data.access_token));
    _refreshQueue = [];

    return data.access_token;
  } catch {
    return null;
  } finally {
    _isRefreshing = false;
  }
}

// ═══════════════════════════════════════════════════════════
// NAVIGATION RENDERING
// ═══════════════════════════════════════════════════════════

function renderNavigation() {
  const navLinks  = document.querySelector('.nav-links');
  const navAuth   = document.getElementById('navAuth');
  const mobileNav = document.getElementById('mobileNav');
  const hamburger = document.getElementById('hamburger');

  if (!navLinks || !navAuth) return;

  if (auth.isLoggedIn) {
    _renderPrivateNav(navLinks, navAuth, mobileNav);
  } else {
    _renderPublicNav(navLinks, navAuth, mobileNav);
  }

  // Hamburger toggle
  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = hamburger.classList.toggle('open');
      mobileNav.classList.toggle('open', isOpen);
      hamburger.setAttribute('aria-expanded', String(isOpen));
      mobileNav.setAttribute('aria-hidden', String(!isOpen));
    });
  }

  // Close mobile nav + dropdown on outside click
  document.addEventListener('click', (e) => {
    // Mobile nav
    if (hamburger && mobileNav) {
      if (!hamburger.contains(e.target) && !mobileNav.contains(e.target)) {
        hamburger.classList.remove('open');
        mobileNav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        mobileNav.setAttribute('aria-hidden', 'true');
      }
    }
    // Dropdown
    const d  = document.getElementById('dropdown');
    const um = document.querySelector('.user-menu');
    if (d && um && !um.contains(e.target)) d.style.display = 'none';
  });

  // Scroll shadow
  window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 10);
  });

  // Active page highlight
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link[data-page]').forEach(link => {
    if (link.dataset.page === currentPage) link.classList.add('active');
  });
}

function _renderPublicNav(navLinks, navAuth, mobileNav) {
  const links = [
    { href: 'index.html',     page: 'index.html',     label: 'Home' },
    { href: 'features.html',  page: 'features.html',  label: 'Features' },
    { href: 'community.html', page: 'community.html', label: 'Community' },
    { href: 'contact.html',   page: 'contact.html',   label: 'Contact' },
  ];

  navLinks.innerHTML = links.map(l =>
    `<li><a href="${l.href}" class="nav-link" data-page="${l.page}">${l.label}</a></li>`
  ).join('');

  navAuth.innerHTML = `
    <div class="nav-auth-wrap">
      <a href="signup.html" class="btn btn-outline nav-cta">Sign In</a>
      <a href="signup.html" class="btn btn-primary nav-cta">Get Started</a>
    </div>
  `;

  if (mobileNav) {
    mobileNav.innerHTML = links.map(l =>
      `<a href="${l.href}" class="nav-link" data-page="${l.page}">${l.label}</a>`
    ).join('') + `
      <div style="height:1px;background:var(--border);margin:8px 0;"></div>
      <a href="signup.html" class="btn btn-primary nav-cta" style="margin:4px 0 0;width:fit-content;">Get Started Free</a>
    `;
  }
}

function _renderPrivateNav(navLinks, navAuth, mobileNav) {
  const initials = auth.getUserInitials();
  const name     = auth.getUserName();
  const currency = auth.getCurrency();

  const links = [
    { href: 'tools.html',    page: 'tools.html',    label: 'Tools' },
    { href: 'wandaAI.html',  page: 'wandaAI.html',  label: 'WandaAI' },
    { href: 'profile.html',  page: 'profile.html',  label: 'Profile' },
  ];

  navLinks.innerHTML = links.map(l =>
    `<li><a href="${l.href}" class="nav-link" data-page="${l.page}">${l.label}</a></li>`
  ).join('');

  navAuth.innerHTML = `
    <div class="user-menu" style="position:relative;">
      <div class="user-avatar" onclick="toggleDropdown()" title="${auth.getEmail()}"
           style="width:36px;height:36px;border-radius:50%;background:var(--gradient);
                  color:#fff;display:flex;align-items:center;justify-content:center;
                  font-weight:700;font-size:14px;cursor:pointer;font-family:Poppins,sans-serif;
                  user-select:none;flex-shrink:0;">
        ${initials}
      </div>
      <div class="dropdown" id="dropdown"
           style="display:none;position:absolute;right:0;top:48px;background:#fff;
                  border:1px solid var(--border);border-radius:var(--radius);min-width:210px;
                  box-shadow:var(--shadow-md);z-index:999;overflow:hidden;">
        <div style="padding:12px 16px;border-bottom:1px solid var(--border);">
          <div style="font-weight:700;font-size:13px;color:var(--dark);font-family:'Poppins',sans-serif;">${name}</div>
          <div style="font-size:11px;color:var(--mid);margin-top:2px;">${auth.getEmail()}</div>
          <div style="font-size:11px;color:var(--blue);margin-top:2px;">Currency: ${currency}</div>
        </div>
        <a href="profile.html"  class="_dd-item">⚙️ Settings</a>
        <a href="tools.html"    class="_dd-item">📊 Dashboard</a>
        <a href="wandaAI.html"  class="_dd-item">🤖 WandaAI</a>
        <div style="height:1px;background:var(--border);"></div>
        <button onclick="handleLogout()" class="_dd-item" style="color:var(--red);background:none;border:none;width:100%;text-align:left;cursor:pointer;font-family:inherit;">
          🚪 Sign Out
        </button>
      </div>
    </div>
  `;

  if (mobileNav) {
    mobileNav.innerHTML = links.map(l =>
      `<a href="${l.href}" class="nav-link" data-page="${l.page}">${l.label}</a>`
    ).join('') + `
      <div style="height:1px;background:var(--border);margin:8px 0;"></div>
      <button onclick="handleLogout()" class="nav-link" style="background:none;border:none;cursor:pointer;color:var(--red);text-align:left;width:100%;padding:12px 16px;font-size:0.95rem;font-family:'Poppins',sans-serif;font-weight:600;">
        🚪 Sign Out
      </button>
    `;
  }
}

function toggleDropdown() {
  const d = document.getElementById('dropdown');
  if (!d) return;
  d.style.display = d.style.display === 'block' ? 'none' : 'block';
}

// ═══════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════

async function handleLogout() {
  try {
    if (auth.token && auth.refreshToken) {
      // Revoke refresh token server-side
      await fetch(`${API_BASE}/auth/logout`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${auth.token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ refresh_token: auth.refreshToken }),
      });
    }
  } catch (e) {
    console.warn('Logout API error (ignored):', e);
  }

  auth.logout();
  showAlert('✅ Logged out successfully', 'success');
  setTimeout(() => { location.href = '/'; }, 1000);
}

// ═══════════════════════════════════════════════════════════
// PAGE PROTECTION
// ═══════════════════════════════════════════════════════════

function protectPage() {
  /** Call at top of private pages (tools, profile, wandaAI). */
  if (!auth.isLoggedIn) {
    showAlert('⚠️ Please sign in to access this page', 'error');
    setTimeout(() => {
      location.href = '/signup.html?redirect=' + encodeURIComponent(window.location.pathname);
    }, 1500);
    return false;
  }
  return true;
}

function protectFromAuth() {
  /** Call on signup page — redirects logged-in users to dashboard. */
  if (auth.isLoggedIn) {
    location.href = '/tools.html';
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════
// PASSWORD STRENGTH — client-side, no API call needed
// ═══════════════════════════════════════════════════════════

// Private scorer — called directly by updateStrengthUI so that page-level
// overrides of the public checkPasswordStrength can't break the UI updater.
function _scorePassword(password) {
  if (!password || typeof password !== 'string') {
    return { score: 0, feedback: ['Enter a password'], is_strong: false };
  }
  let score = 0;
  const feedback = [];

  if (password.length >= 8)  score++;
  else feedback.push('At least 8 characters');

  if (password.length >= 12) score++;
  else feedback.push('12+ characters is stronger');

  if (/[A-Z]/.test(password)) score++;
  else feedback.push('Add an uppercase letter');

  if (/[a-z]/.test(password)) score++;
  else feedback.push('Add a lowercase letter');

  if (/\d/.test(password)) score++;
  else feedback.push('Add a number');

  if (/[!@#$%^&*()\-_=+\[\]{}|;:,.<>?]/.test(password)) score++;
  else feedback.push('Add a special character (!@#$%^&*)');

  score = Math.min(score, 5);
  return { score, feedback, is_strong: score >= 4 };
}

// Public API — returns { score: 0-5, feedback: [], is_strong: bool }
// Mirrors the logic in security.py so results are consistent.
function checkPasswordStrength(password) {
  return _scorePassword(password);
}

function updateStrengthUI(fieldId, password) {
  // Use _scorePassword directly to avoid breakage if a page redefines
  // the global checkPasswordStrength with a different signature.
  const result = _scorePassword(password);
  if (!result) return;

  const prefix  = fieldId.replace(/Password.*$/i, '');

  const bar      = document.getElementById(`${prefix}StrengthBar`);
  const text     = document.getElementById(`${prefix}StrengthText`);
  const feedback = document.getElementById(`${prefix}Feedback`);

  const colors = ['#DC3545','#FF9800','#FFC107','#28A745','#007BFF'];
  const labels = ['Very Weak','Weak','Fair','Good','Strong'];

  if (bar) {
    bar.style.width      = `${(result.score / 5) * 100}%`;
    bar.style.background = colors[result.score] || colors[0];
    bar.style.height     = '4px';
    bar.style.borderRadius = '4px';
    bar.style.transition = 'all 0.3s';
  }
  if (text) {
    text.textContent = labels[result.score] || '';
    text.style.color = colors[result.score] || colors[0];
    text.style.fontSize = '11px';
    text.style.fontWeight = '600';
    text.style.marginTop = '4px';
  }
  if (feedback && result.feedback.length) {
    feedback.textContent = result.feedback.join(' • ');
    feedback.style.fontSize = '11px';
    feedback.style.color = '#888';
    feedback.style.marginTop = '4px';
  }

  return result;
}

// ═══════════════════════════════════════════════════════════
// ALERTS / TOASTS
// ═══════════════════════════════════════════════════════════

const _toastIcons = {
  success: '✅',
  error:   '❌',
  info:    'ℹ️',
  warning: '⚠️',
};

function showAlert(message, type = 'error') {
  let container = document.getElementById('_toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = '_toastContainer';
    container.className = 'toast-container';
    // Fallback inline style for pages that don't load styles.css
    container.style.cssText =
      'position:fixed;top:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:360px;pointer-events:none;';
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  // Fallback inline colours for pages without styles.css
  const fallback = {
    success: 'background:#E8F5E9;color:#1B5E20;border-left:4px solid #28A745;',
    error:   'background:#FFEBEE;color:#B71C1C;border-left:4px solid #DC3545;',
    info:    'background:#E3F2FD;color:#0D47A1;border-left:4px solid #007BFF;',
    warning: 'background:#FFF8E1;color:#E65100;border-left:4px solid #F9A825;',
  };
  el.style.cssText = `padding:14px 18px;border-radius:12px;font-size:0.875rem;
    font-family:'Open Sans',sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.12);
    display:flex;align-items:center;gap:10px;pointer-events:auto;
    animation:slideIn .3s cubic-bezier(.4,0,.2,1);
    ${fallback[type] || fallback.error}`;

  const icon = document.createElement('span');
  icon.textContent = _toastIcons[type] || _toastIcons.error;
  icon.style.flexShrink = '0';

  const text = document.createElement('span');
  text.textContent = message;

  el.appendChild(icon);
  el.appendChild(text);
  container.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// Alias — some pages use showToast
function showToast(message, type = 'success') { showAlert(message, type); }

// ═══════════════════════════════════════════════════════════
// FORMAT CURRENCY
// ═══════════════════════════════════════════════════════════

function formatCurrency(amount, currency) {
  /**
   * Format an amount with the correct currency symbol.
   * Uses the logged-in user's currency if none provided.
   * E.g. formatCurrency(1234.5, 'E') → 'E 1,234.50'
   */
  const c   = currency || auth.getCurrency() || 'E';
  const num = Number(amount).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${c} ${num}`;
}

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderNavigation);
} else {
  renderNavigation();
}

// ═══════════════════════════════════════════════════════════
// GLOBAL EXPORT
// Everything any page might need — accessed as window.WandaAuth.*
// ═══════════════════════════════════════════════════════════

window.WandaAuth = {
  // Auth state object (use for .isLoggedIn, .token, etc.)
  auth,
  // Shorthand methods (backwards-compatible with old code)
  isLoggedIn:    () => auth.isLoggedIn,
  getName:       () => auth.getUserName(),
  getEmail:      () => auth.getEmail(),
  getCurrency:   () => auth.getCurrency(),
  // Core helpers
  apiCall,
  protectPage,
  protectFromAuth,
  handleLogout,
  renderNavigation,
  showAlert,
  showToast,
  formatCurrency,
  checkPasswordStrength,
  updateStrengthUI,
  // Config
  API_BASE,
  KEYS,
};

// Make apiCall, showAlert, showToast, formatCurrency global
// so pages can call them without the WandaAuth. prefix
window.apiCall         = apiCall;
window.showAlert       = showAlert;
window.showToast       = showToast;
window.formatCurrency  = formatCurrency;
window.updateStrengthUI = updateStrengthUI;

console.log('✅ nav.js loaded | logged in:', auth.isLoggedIn, '| user:', auth.getEmail());