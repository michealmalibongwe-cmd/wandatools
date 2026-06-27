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
  const navLinks = document.querySelector('.nav-links');
  const navAuth  = document.getElementById('navAuth');

  if (!navLinks || !navAuth) return;

  if (auth.isLoggedIn) {
    _renderPrivateNav(navLinks, navAuth);
  } else {
    _renderPublicNav(navLinks, navAuth);
  }

  // Scroll shadow
  window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 10);
  });
}

function _renderPublicNav(navLinks, navAuth) {
  navLinks.innerHTML = `
    <li><a href="/" class="nav-link">Home</a></li>
    <li><a href="/features.html" class="nav-link">Features</a></li>
    <li><a href="/community.html" class="nav-link">Community</a></li>
    <li><a href="/contact.html" class="nav-link">Contact</a></li>
  `;
  navAuth.innerHTML = `
    <div class="nav-auth" style="display:flex;gap:10px;align-items:center;">
      <button class="btn-nav-signin" onclick="location.href='/signup.html'">Sign In</button>
      <button class="btn-nav-signup" onclick="location.href='/signup.html'">Get Started</button>
    </div>
  `;
}

function _renderPrivateNav(navLinks, navAuth) {
  const initials = auth.getUserInitials();
  const name     = auth.getUserName();
  const currency = auth.getCurrency();

  navLinks.innerHTML = `
    <li><a href="/tools.html" class="nav-link">Dashboard</a></li>
    <li><a href="/wandaAI.html" class="nav-link">WandaAI</a></li>
    <li><a href="/tools.html" class="nav-link">Tools</a></li>
  `;
  navAuth.innerHTML = `
    <div class="user-menu" style="position:relative;">
      <div class="user-avatar" onclick="toggleDropdown()" title="${auth.getEmail()}"
           style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#007BFF,#28A745);
                  color:#fff;display:flex;align-items:center;justify-content:center;
                  font-weight:700;font-size:14px;cursor:pointer;font-family:Poppins,sans-serif;">
        ${initials}
      </div>
      <div class="dropdown" id="dropdown"
           style="display:none;position:absolute;right:0;top:48px;background:#fff;
                  border:1px solid #E0E0E0;border-radius:10px;min-width:200px;
                  box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:999;">
        <div style="padding:12px 16px;border-bottom:1px solid #E0E0E0;">
          <div style="font-weight:700;font-size:13px;color:#333;">${name}</div>
          <div style="font-size:11px;color:#888;">${auth.getEmail()}</div>
          <div style="font-size:11px;color:#007BFF;margin-top:2px;">Currency: ${currency}</div>
        </div>
        <a href="/profile.html"  style="display:block;padding:11px 16px;font-size:13px;color:#333;text-decoration:none;">⚙️ Settings</a>
        <a href="/tools.html"    style="display:block;padding:11px 16px;font-size:13px;color:#333;text-decoration:none;">📊 Dashboard</a>
        <a href="/wandaAI.html"  style="display:block;padding:11px 16px;font-size:13px;color:#333;text-decoration:none;">🤖 WandaAI</a>
        <div style="height:1px;background:#E0E0E0;margin:4px 0;"></div>
        <button onclick="handleLogout()"
                style="display:block;width:100%;padding:11px 16px;text-align:left;
                       background:none;border:none;cursor:pointer;font-size:13px;color:#DC3545;">
          🚪 Logout
        </button>
      </div>
    </div>
  `;
}

function toggleDropdown() {
  const d = document.getElementById('dropdown');
  if (!d) return;
  d.style.display = d.style.display === 'block' ? 'none' : 'block';
}

document.addEventListener('click', (e) => {
  const d  = document.getElementById('dropdown');
  const um = document.querySelector('.user-menu');
  if (d && um && !um.contains(e.target)) d.style.display = 'none';
});

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

function showAlert(message, type = 'error') {
  let container = document.getElementById('alertContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'alertContainer';
    container.style.cssText = `
      position:fixed;top:80px;right:20px;z-index:9999;
      display:flex;flex-direction:column;gap:8px;max-width:360px;
    `;
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  const styles = {
    success: 'background:#E8F5E9;color:#1B5E20;border-left:4px solid #28A745;',
    error:   'background:#FFEBEE;color:#B71C1C;border-left:4px solid #DC3545;',
    info:    'background:#E3F2FD;color:#0D47A1;border-left:4px solid #007BFF;',
    warning: 'background:#FFF8E1;color:#E65100;border-left:4px solid #FFC107;',
  };
  el.style.cssText = `
    padding:14px 18px;border-radius:8px;font-size:13px;
    font-family:'Open Sans',sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.1);
    animation:slideIn .3s ease;
    ${styles[type] || styles.error}
  `;
  el.textContent = message;
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