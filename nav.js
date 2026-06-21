/**
 * WandaTools Navigation & Auth Control
 * Handles conditional nav visibility based on login status
 */

const API_BASE = "https://your-railway-url/api/v1";

// ═══════════════════════════════════════════════════════════
// AUTH STATE
// ═══════════════════════════════════════════════════════════

class AuthState {
    constructor() {
        this.token = localStorage.getItem('access_token');
        this.refreshToken = localStorage.getItem('refresh_token');
        this.email = localStorage.getItem('user_email');
        this.isLoggedIn = !!(this.token && this.email);
    }
    
    logout() {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_email');
        this.isLoggedIn = false;
    }
    
    login(token, refreshToken, email) {
        localStorage.setItem('access_token', token);
        localStorage.setItem('refresh_token', refreshToken);
        localStorage.setItem('user_email', email);
        this.token = token;
        this.refreshToken = refreshToken;
        this.email = email;
        this.isLoggedIn = true;
    }
    
    getUserName() {
        return this.email ? this.email.split('@')[0] : '';
    }
    
    getUserInitials() {
        return this.email ? this.email.charAt(0).toUpperCase() : '?';
    }
}

const auth = new AuthState();

// ═══════════════════════════════════════════════════════════
// NAVIGATION RENDERING
// ═══════════════════════════════════════════════════════════

function renderNavigation() {
    const navLinks = document.querySelector('.nav-links');
    const navAuth = document.getElementById('navAuth');
    
    if (!navLinks || !navAuth) return;
    
    if (auth.isLoggedIn) {
        // LOGGED IN - Show private nav
        renderPrivateNav(navLinks, navAuth);
    } else {
        // LOGGED OUT - Show public nav
        renderPublicNav(navLinks, navAuth);
    }
}

function renderPublicNav(navLinks, navAuth) {
    // Public navigation (logged out)
    navLinks.innerHTML = `
        <li><a href="/">Home</a></li>
        <li><a href="/features.html">Features</a></li>
        <li><a href="/community.html">Community</a></li>
    `;
    
    navAuth.innerHTML = `
        <div class="nav-auth">
            <button class="btn-nav-signin" onclick="location.href='/signup.html'">Sign In</button>
            <button class="btn-nav-signup" onclick="location.href='/signup.html'">Sign Up</button>
        </div>
    `;
}

function renderPrivateNav(navLinks, navAuth) {
    // Private navigation (logged in)
    navLinks.innerHTML = `
        <li><a href="/tools.html">Dashboard</a></li>
        <li><a href="/wandaAI.html">WandaAI</a></li>
        <li><a href="/tools.html">Tools</a></li>
    `;
    
    const userName = auth.getUserName();
    const initials = auth.getUserInitials();
    
    navAuth.innerHTML = `
        <div class="user-menu">
            <div class="user-avatar" onclick="toggleDropdown()" title="${auth.email}">
                ${initials}
            </div>
            <div class="dropdown" id="dropdown">
                <div style="padding: 12px 16px; border-bottom: 1px solid #E0E0E0; font-weight: 600; font-size: 12px;">
                    ${userName}
                </div>
                <a href="/profile.html">⚙️ Settings</a>
                <a href="/tools.html">📊 Dashboard</a>
                <a href="/wandaAI.html">🤖 WandaAI</a>
                <div class="dropdown-divider"></div>
                <button onclick="handleLogout()" style="color: #F44336;">🚪 Logout</button>
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════
// AUTH HANDLERS
// ═══════════════════════════════════════════════════════════

function toggleDropdown() {
    const dropdown = document.getElementById('dropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// Close dropdown when clicking elsewhere
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('dropdown');
    const userMenu = document.querySelector('.user-menu');
    
    if (dropdown && !userMenu?.contains(event.target)) {
        dropdown.classList.remove('active');
    }
});

async function handleLogout() {
    try {
        if (auth.token) {
            await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${auth.token}`,
                    'Content-Type': 'application/json'
                }
            });
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
    
    auth.logout();
    showAlert('✅ Logged out successfully', 'success');
    setTimeout(() => {
        location.href = '/';
    }, 1000);
}

// ═══════════════════════════════════════════════════════════
// ACCESS PROTECTION
// ═══════════════════════════════════════════════════════════

/**
 * Protect page - redirect to login if not authenticated
 * Call this in pages that require authentication
 */
function protectPage() {
    if (!auth.isLoggedIn) {
        showAlert('⚠️ Please sign in to access this page', 'error');
        setTimeout(() => {
            location.href = '/signup.html?redirect=' + window.location.pathname;
        }, 1500);
        return false;
    }
    return true;
}

/**
 * Protect from logged-in users
 * Call this on login/signup pages
 */
function protectFromAuth() {
    if (auth.isLoggedIn) {
        location.href = '/tools.html';
        return false;
    }
    return true;
}

// ═══════════════════════════════════════════════════════════
// ALERTS
// ═══════════════════════════════════════════════════════════

function showAlert(message, type = 'success') {
    const container = document.getElementById('alertContainer') || createAlertContainer();
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    container.appendChild(alert);
    
    setTimeout(() => alert.remove(), 4000);
}

function createAlertContainer() {
    const container = document.createElement('div');
    container.id = 'alertContainer';
    document.body.appendChild(container);
    return container;
}

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    renderNavigation();
});

// Export for use in other files
window.WandaAuth = {
    auth,
    protectPage,
    protectFromAuth,
    showAlert,
    handleLogout,
    renderNavigation
};
