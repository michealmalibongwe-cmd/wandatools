/* ============================================================
   WandaTools – Shared Navigation & Utility Script
   ============================================================ */

(function () {
  'use strict';

  /* ── Scroll shadow on navbar ── */
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ── Hamburger menu ── */
  const hamburger = document.querySelector('.nav-hamburger');
  const mobileNav = document.querySelector('.nav-mobile');
  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      const open = hamburger.classList.toggle('open');
      mobileNav.classList.toggle('open', open);
      hamburger.setAttribute('aria-expanded', open);
    });
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!hamburger.contains(e.target) && !mobileNav.contains(e.target)) {
        hamburger.classList.remove('open');
        mobileNav.classList.remove('open');
      }
    });
  }

  /* ── Active nav link highlighting ── */
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link[data-page]').forEach(link => {
    if (link.dataset.page === currentPage) link.classList.add('active');
  });

  /* ── Intersection Observer: fade-up animations ── */
  const fadeEls = document.querySelectorAll('.fade-up');
  if (fadeEls.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    fadeEls.forEach(el => observer.observe(el));
  }

  /* ── FAQ accordion ── */
  document.querySelectorAll('.faq-item').forEach(item => {
    const header = item.querySelector('.faq-header');
    if (header) {
      header.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach(o => o.classList.remove('open'));
        if (!isOpen) item.classList.add('open');
      });
    }
  });

  /* ── Simple form validation helper ── */
  window.validateForm = function (formEl) {
    let valid = true;
    formEl.querySelectorAll('[required]').forEach(field => {
      field.classList.remove('error');
      if (!field.value.trim()) {
        field.classList.add('error');
        field.style.borderColor = 'var(--red)';
        valid = false;
      } else {
        field.style.borderColor = '';
      }
    });
    return valid;
  };

  /* ── Toast notification ── */
  window.showToast = function (message, type = 'success') {
    const existing = document.querySelector('.wt-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `wt-toast wt-toast-${type}`;
    toast.innerHTML = `<i class="material-icons">${type === 'success' ? 'check_circle' : 'info'}</i><span>${message}</span>`;
    Object.assign(toast.style, {
      position: 'fixed', bottom: '24px', right: '24px',
      background: type === 'success' ? '#1B5E20' : '#0D47A1',
      color: '#fff', padding: '14px 20px', borderRadius: '10px',
      display: 'flex', alignItems: 'center', gap: '10px',
      fontFamily: "'Open Sans', sans-serif", fontSize: '0.9rem',
      boxShadow: '0 8px 30px rgba(0,0,0,0.2)', zIndex: '9999',
      animation: 'fadeIn 0.3s ease'
    });
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.4s'; setTimeout(() => toast.remove(), 400); }, 3000);
  };

  // ═══ API CONFIGURATION ═══
const API_BASE = "https://wandatools-production.up.railway.app/api/v1";

// Helper for API calls
async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem("access_token");
  
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "API request failed");
  }
  
  return await response.json();
}

  /* ── Persist auth state (demo) ── */
  window.WandaAuth = {
    isLoggedIn: () => localStorage.getItem('wt_logged_in') === 'true',
    login: (name, email) => {
      localStorage.setItem('wt_logged_in', 'true');
      localStorage.setItem('wt_user_name', name);
      localStorage.setItem('wt_user_email', email);
    },
    logout: () => {
      localStorage.removeItem('wt_logged_in');
      localStorage.removeItem('wt_user_name');
      localStorage.removeItem('wt_user_email');
      window.location.href = 'profile.html';
    },
    getName: () => localStorage.getItem('wt_user_name') || 'User',
    getEmail: () => localStorage.getItem('wt_user_email') || ''
  };

})();
