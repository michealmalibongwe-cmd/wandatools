/**
 * WandaTools Navigation & Auth Control
 * Handles conditional nav visibility based on login status
 */

// ⚠️ REPLACE THIS WITH YOUR ACTUAL RAILWAY URL
const API_BASE = "https://wandatools.up.railway.app/api/v1";

// ═══════════════════════════════════════════════════════════
// AUTH STATE
// ═══════════════════════════════════════════════════════════

class AuthState {
    constructor() {
        this.token = localStorage.getItem('access_token');
        this.refreshToken = localStorage.getItem('refresh_token');
        this.email = localStorage.getItem('user_email');
        this.isLoggedIn = !!(this.token && this.email);
        
        console.log('🔐 Auth State:', {
            isLoggedIn: this.isLoggedIn,
            email: this.email,
            hasToken: !!this.token
        });
    }
    
    logout() {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_email');
        this.isLoggedIn = false;
        this.token = null;
        this.email = null;
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
    console.log('📍 renderNavigation called, isLoggedIn:', auth.isLoggedIn);
    
    // Find nav elements
    const navLinks = document.querySelector('.nav-links');
    const navAuth = document.getElementById('navAuth');
    
    if (!navLinks) {
        console.error('❌ .nav-links not found in DOM');
        return;
    }
    
    if (!navAuth) {
        console.error('❌ #navAuth not found in DOM');
        return;
    }
    
    if (auth.isLoggedIn) {
        renderPrivateNav(navLinks, navAuth);
    } else {
        renderPublicNav(navLinks, navAuth);
    }
}

function renderPublicNav(navLinks, navAuth) {
    console.log('📋 Rendering PUBLIC nav (logged out)');
    
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
    console.log('🔒 Rendering PRIVATE nav (logged in)');
    
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
                <button onclick="handleLogout()" style="color: #F44336; padding: 12px 16px; text-align: left; width: 100%;">🚪 Logout</button>
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
    
    if (dropdown && userMenu && !userMenu.contains(event.target)) {
        dropdown.classList.remove('active');
    }
});

async function handleLogout() {
    console.log('🚪 Logout initiated');
    
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
        console.error('Logout API error:', error);
    }
    
    auth.logout();
    showAlert('✅ Logged out successfully', 'success');
    
    setTimeout(() => {
        renderNavigation();
        location.href = '/';
    }, 1000);
}

// ═══════════════════════════════════════════════════════════
// ACCESS PROTECTION
// ═══════════════════════════════════════════════════════════

function protectPage() {
    console.log('🔐 Checking page protection, isLoggedIn:', auth.isLoggedIn);
    
    if (!auth.isLoggedIn) {
        showAlert('⚠️ Please sign in to access this page', 'error');
        setTimeout(() => {
            location.href = '/signup.html?redirect=' + window.location.pathname;
        }, 1500);
        return false;
    }
    return true;
}

function protectFromAuth() {
    console.log('🔒 Checking auth redirect, isLoggedIn:', auth.isLoggedIn);
    
    if (auth.isLoggedIn) {
        console.log('✅ User already logged in, redirecting to dashboard');
        location.href = '/tools.html';
        return false;
    }
    return true;
}

// ═══════════════════════════════════════════════════════════
// ALERTS
// ═══════════════════════════════════════════════════════════

function showAlert(message, type = 'success') {
    let container = document.getElementById('alertContainer');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'alertContainer';
        container.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 1000;
        `;
        document.body.appendChild(container);
    }
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.style.cssText = `
        padding: 16px 24px;
        margin-bottom: 10px;
        border-radius: 8px;
        font-size: 13px;
        animation: slideIn 0.3s ease-out;
        ${type === 'success' ? 'background: #E8F5E9; color: #2E7D32; border-left: 4px solid #28A745;' : 'background: #FFEBEE; color: #C62828; border-left: 4px solid #F44336;'}
    `;
    alert.textContent = message;
    container.appendChild(alert);
    
    setTimeout(() => alert.remove(), 4000);
}

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('✅ DOM Content Loaded - Initializing Navigation');
        renderNavigation();
    });
} else {
    console.log('✅ DOM Already Loaded - Initializing Navigation');
    renderNavigation();
}

// Export for use in other files
window.WandaAuth = {
    auth,
    protectPage,
    protectFromAuth,
    showAlert,
    handleLogout,
    renderNavigation,
    API_BASE
};

console.log('✅ nav.js loaded successfully');
