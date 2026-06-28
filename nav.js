/**
 * WandaTools — nav.js
 * Foundation file loaded by every page.
 * Provides: API_BASE, AuthState, apiCall(), renderNavigation(),
 *           protectPage(), protectFromAuth(), showAlert()
 *
 * NO hamburger / mobile drawer — nav is always fully visible.
 * Load this FIRST on every page: <script src="nav.js"></script>
 */

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════

const API_BASE = "https://wandatools.up.railway.app/api/v1";

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
  constructor() { this._load(); }

  _load() {
    this.token        = localStorage.getItem(KEYS.ACCESS_TOKEN);
    this.refreshToken = localStorage.getItem(KEYS.REFRESH_TOKEN);
    this.email        = localStorage.getItem(KEYS.USER_EMAIL);
    this.name         = localStorage.getItem(KEYS.USER_NAME);
    this.currency     = localStorage.getItem(KEYS.USER_CURRENCY) || 'E';
    this.isLoggedIn   = !!(this.token && this.email);
  }

  login(data) {
    localStorage.setItem(KEYS.ACCESS_TOKEN,  data.access_token);
    localStorage.setItem(KEYS.REFRESH_TOKEN, data.refresh_token);
    localStorage.setItem(KEYS.USER_EMAIL,    data.user.email);
    localStorage.setItem(KEYS.USER_NAME,     data.user.name || data.user.email.split('@')[0]);
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

  static isLoggedIn() { return auth.isLoggedIn; }
  getName()           { return this.getUserName(); }
}

const auth = new AuthState();

// ═══════════════════════════════════════════════════════════
// API CALL HELPER
// ═══════════════════════════════════════════════════════════

let _isRefreshing = false;
let _refreshQueue = [];

async function apiCall(path, options = {}) {
  const url = `${API_BASE}${path}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`;

  let response = await fetch(url, { ...options, headers });

  // Auto-refresh on 401
  if (response.status === 401 && auth.refreshToken) {
    const newToken = await _refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(url, { ...options, headers });
    } else {
      auth.logout();
      showAlert('Session expired. Please sign in again.', 'error');
      setTimeout(() => { location.href = '/signup.html'; }, 1500);
      throw new Error('Session expired');
    }
  }

  let data;
  try   { data = await response.json(); }
  catch { throw new Error(`Server error (${response.status})`); }

  if (!response.ok) {
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
  if (_isRefreshing) {
    return new Promise(resolve => _refreshQueue.push(resolve));
  }
  _isRefreshing = true;
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh_token: auth.refreshToken }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    auth.updateTokens(data.access_token, data.refresh_token);
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
// No hamburger. No mobile drawer. Nav is always fully visible.
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

  // No dropdown — avatar links directly to profile.html

  // Scroll shadow on navbar
  window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });

  // Highlight active page link
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link[data-page]').forEach(link => {
    if (link.dataset.page === currentPage) link.classList.add('active');
  });

  // Intersection Observer — trigger .fade-up animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
}

// ── Public nav (logged out) ──────────────────────────────
// Row 1: WandaTools logo (left) + Sign In / Get Started (right)
// Row 2: Home, Features, Community, Contact
function _renderPublicNav(navLinks, navAuth) {
  _buildNavRows(navLinks, navAuth);

  navLinks.innerHTML = [
    { href: 'index.html',     page: 'index.html',     label: 'Home'      },
    { href: 'features.html',  page: 'features.html',  label: 'Features'  },
    { href: 'community.html', page: 'community.html', label: 'Community' },
    { href: 'contact.html',   page: 'contact.html',   label: 'Contact'   },
  ].map(l =>
    `<li><a href="${l.href}" class="nav-link" data-page="${l.page}">${l.label}</a></li>`
  ).join('');

  navAuth.innerHTML = `
    <div class="nav-auth-wrap">
      <a href="signup.html" class="btn btn-outline nav-cta">Sign In</a>
      <a href="signup.html" class="btn btn-primary nav-cta">Get Started</a>
    </div>
  `;
}

// ── Private nav (logged in) ──────────────────────────────
// Row 1: WandaTools logo (left) + user avatar/dropdown (right)
// Row 2: Tools, WandaAI, Profile
function _renderPrivateNav(navLinks, navAuth) {
  _buildNavRows(navLinks, navAuth);

  const initials = auth.getUserInitials();
  const name     = auth.getUserName();
  const currency = auth.getCurrency();

  navLinks.innerHTML = [
    { href: 'index.html',     page: 'index.html',     label: 'Home'      },
    { href: 'tools.html',     page: 'tools.html',     label: 'Tools'     },
    { href: 'wandaAI.html',   page: 'wandaAI.html',   label: 'WandaAI'  },
    { href: 'community.html', page: 'community.html', label: 'Community' },
    { href: 'contact.html',   page: 'contact.html',   label: 'Contact'   },
    { href: 'profile.html',   page: 'profile.html',   label: 'Profile'   },
  ].map(l =>
    `<li><a href="${l.href}" class="nav-link" data-page="${l.page}">${l.label}</a></li>`
  ).join('');

  navAuth.innerHTML = `
    <a href="profile.html"
       title="My Account — ${auth.getEmail()}"
       aria-label="Go to profile for ${name}"
       style="display:flex;align-items:center;justify-content:center;
              width:clamp(32px,5vw,38px);height:clamp(32px,5vw,38px);
              border-radius:50%;
              background:linear-gradient(135deg,#007BFF,#28A745);
              color:#fff;font-weight:700;
              font-size:clamp(0.75rem,2vw,0.9rem);
              font-family:'Poppins',sans-serif;
              text-decoration:none;
              transition:transform 0.2s,box-shadow 0.2s;
              flex-shrink:0;"
       onmouseover="this.style.transform='scale(1.08)';this.style.boxShadow='0 4px 16px rgba(0,123,255,0.35)'"
       onmouseout="this.style.transform='scale(1)';this.style.boxShadow='none'">
      ${initials}
    </a>
  `;
}

// ── DOM builder: restructure nav-inner into two rows ─────
// Called once per page load. Safe to call multiple times.
//
// BEFORE (from HTML):                AFTER:
//   nav-inner                          nav-inner
//     nav-logo                           nav-logo-row
//     nav-links  (ul)                      nav-logo (a)
//     navAuth    (div)                     navAuth  (div#navAuth)
//                                        nav-links-row
//                                          nav-links (ul)
//
function _buildNavRows(navLinks, navAuth) {
  const inner = navLinks.closest('.nav-inner');
  if (!inner || inner.querySelector('.nav-logo-row')) return; // already built

  const logo = inner.querySelector('.nav-logo');

  // Create Row 1
  const row1 = document.createElement('div');
  row1.className = 'nav-logo-row';
  if (logo)    row1.appendChild(logo);
  row1.appendChild(navAuth);   // navAuth moves to row 1 (right side)

  // Create Row 2
  const row2 = document.createElement('div');
  row2.className = 'nav-links-row';
  row2.appendChild(navLinks);  // navLinks moves to row 2

  // Clear inner and rebuild
  inner.innerHTML = '';
  inner.appendChild(row1);
  inner.appendChild(row2);
}

// toggleDropdown removed — avatar is now a direct link to profile.html

// ═══════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════

async function handleLogout() {
  try {
    if (auth.token && auth.refreshToken) {
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
  if (auth.isLoggedIn) {
    location.href = '/tools.html';
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════
// PASSWORD STRENGTH
// ═══════════════════════════════════════════════════════════

function _scorePassword(password) {
  if (!password || typeof password !== 'string') {
    return { score: 0, feedback: ['Enter a password'], is_strong: false };
  }
  let score = 0;
  const feedback = [];

  if (password.length >= 8)  score++; else feedback.push('At least 8 characters');
  if (password.length >= 12) score++; else feedback.push('12+ characters is stronger');
  if (/[A-Z]/.test(password)) score++; else feedback.push('Add an uppercase letter');
  if (/[a-z]/.test(password)) score++; else feedback.push('Add a lowercase letter');
  if (/\d/.test(password))    score++; else feedback.push('Add a number');
  if (/[!@#$%^&*()\-_=+\[\]{}|;:,.<>?]/.test(password)) score++;
  else feedback.push('Add a special character (!@#$%^&*)');

  score = Math.min(score, 5);
  return { score, feedback, is_strong: score >= 4 };
}

function checkPasswordStrength(password) { return _scorePassword(password); }

function updateStrengthUI(fieldId, password) {
  const result = _scorePassword(password);
  if (!result) return;

  const prefix   = fieldId.replace(/Password.*$/i, '');
  const bar      = document.getElementById(`${prefix}StrengthBar`);
  const text     = document.getElementById(`${prefix}StrengthText`);
  const feedback = document.getElementById(`${prefix}Feedback`);

  const colors = ['#DC3545','#FF9800','#FFC107','#28A745','#007BFF'];
  const labels = ['Very Weak','Weak','Fair','Good','Strong'];

  if (bar) {
    bar.style.cssText = `width:${(result.score / 5) * 100}%;background:${colors[result.score] || colors[0]};height:4px;border-radius:4px;transition:all 0.3s;`;
  }
  if (text) {
    text.textContent  = labels[result.score] || '';
    text.style.cssText = `color:${colors[result.score] || colors[0]};font-size:11px;font-weight:600;margin-top:4px;`;
  }
  if (feedback && result.feedback.length) {
    feedback.textContent  = result.feedback.join(' • ');
    feedback.style.cssText = 'font-size:11px;color:#888;margin-top:4px;';
  }

  return result;
}

// ═══════════════════════════════════════════════════════════
// ALERTS / TOASTS
// ═══════════════════════════════════════════════════════════

const _toastIcons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

function showAlert(message, type = 'error') {
  let container = document.getElementById('_toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = '_toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;

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
  icon.textContent  = _toastIcons[type] || _toastIcons.error;
  icon.style.flexShrink = '0';

  const text = document.createElement('span');
  text.textContent = message;

  el.appendChild(icon);
  el.appendChild(text);
  container.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

function showToast(message, type = 'success') { showAlert(message, type); }

// ═══════════════════════════════════════════════════════════
// FORMAT CURRENCY
// ═══════════════════════════════════════════════════════════

function formatCurrency(amount, currency) {
  const c   = currency || auth.getCurrency() || 'E';
  const num = Number(amount).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${c} ${num}`;
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderNavigation);
} else {
  renderNavigation();
}

// ═══════════════════════════════════════════════════════════
// GLOBAL EXPORTS
// ═══════════════════════════════════════════════════════════

window.WandaAuth = {
  auth, isLoggedIn: () => auth.isLoggedIn,
  getName: () => auth.getUserName(), getEmail: () => auth.getEmail(),
  getCurrency: () => auth.getCurrency(),
  apiCall, protectPage, protectFromAuth, handleLogout,
  renderNavigation, showAlert, showToast, formatCurrency,
  checkPasswordStrength, updateStrengthUI, API_BASE, KEYS,
};

window.apiCall          = apiCall;
window.showAlert        = showAlert;
window.showToast        = showToast;
window.formatCurrency   = formatCurrency;
window.updateStrengthUI = updateStrengthUI;

console.log('✅ nav.js loaded | logged in:', auth.isLoggedIn, '| user:', auth.getEmail());