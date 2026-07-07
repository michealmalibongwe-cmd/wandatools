/**
 * WandaTools — nav.js
 * Foundation file loaded by every page.
 * Provides: API_BASE, apiCall(), renderNavigation(), showAlert()/showToast()
 *
 * NO hamburger / mobile drawer — nav is always fully visible.
 * No login/signup — this is a marketing site for wandaPOS + wandaACC.
 * Load this FIRST on every page: <script src="nav.js"></script>
 */

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════

const API_BASE = "https://wandatools.up.railway.app/api/v1";

// ═══════════════════════════════════════════════════════════
// API CALL HELPER (used by the contact form)
// ═══════════════════════════════════════════════════════════

async function apiCall(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };

  const response = await fetch(url, { ...options, headers });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Server error (${response.status})`);
  }

  if (!response.ok) {
    const msg =
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((e) => e.msg).join(", ")
          : `Request failed (${response.status})`;
    throw new Error(msg);
  }

  return data;
}

// ═══════════════════════════════════════════════════════════
// NAVIGATION RENDERING
// One static nav for every page — no login state.
// No hamburger. No mobile drawer. Nav is always fully visible.
// ═══════════════════════════════════════════════════════════

const NAV_LINKS = [
  { href: "index.html", page: "index.html", label: "Home" },
  { href: "products.html", page: "products.html", label: "Products" },
  { href: "services.html", page: "services.html", label: "Services" },
  { href: "demo.html", page: "demo.html", label: "Demo" },
  { href: "contact.html", page: "contact.html", label: "Contact" },
];

function renderNavigation() {
  const navLinks = document.querySelector(".nav-links");
  const navAuth = document.getElementById("navAuth");

  if (!navLinks || !navAuth) return;

  _buildNavRows(navLinks, navAuth);

  navLinks.innerHTML = NAV_LINKS.map(
    (l) => `<li><a href="${l.href}" class="nav-link" data-page="${l.page}">${l.label}</a></li>`
  ).join("");

  navAuth.innerHTML = `
    <div class="nav-auth-wrap">
      <a href="demo.html" class="btn btn-primary nav-cta">Book a Demo</a>
    </div>
  `;

  // Scroll shadow on navbar
  window.addEventListener(
    "scroll",
    () => {
      const navbar = document.querySelector(".navbar");
      if (navbar) navbar.classList.toggle("scrolled", window.scrollY > 10);
    },
    { passive: true }
  );

  // Highlight active page link
  const currentPage = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-link[data-page]").forEach((link) => {
    if (link.dataset.page === currentPage) link.classList.add("active");
  });

  // Intersection Observer — trigger .fade-up animations
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  document.querySelectorAll(".fade-up").forEach((el) => observer.observe(el));
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
  const inner = navLinks.closest(".nav-inner");
  if (!inner || inner.querySelector(".nav-logo-row")) return; // already built

  const logo = inner.querySelector(".nav-logo");

  const row1 = document.createElement("div");
  row1.className = "nav-logo-row";
  if (logo) row1.appendChild(logo);
  row1.appendChild(navAuth);

  const row2 = document.createElement("div");
  row2.className = "nav-links-row";
  row2.appendChild(navLinks);

  inner.innerHTML = "";
  inner.appendChild(row1);
  inner.appendChild(row2);
}

// ═══════════════════════════════════════════════════════════
// ALERTS / TOASTS
// ═══════════════════════════════════════════════════════════

const _toastIcons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };

function showAlert(message, type = "error") {
  let container = document.getElementById("_toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "_toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const el = document.createElement("div");
  el.className = `toast toast-${type}`;

  const fallback = {
    success: "background:#E8F5E9;color:#1B5E20;border-left:4px solid #28A745;",
    error: "background:#FFEBEE;color:#B71C1C;border-left:4px solid #DC3545;",
    info: "background:#E3F2FD;color:#0D47A1;border-left:4px solid #007BFF;",
    warning: "background:#FFF8E1;color:#E65100;border-left:4px solid #F9A825;",
  };
  el.style.cssText = `padding:14px 18px;border-radius:12px;font-size:0.875rem;
    font-family:'Open Sans',sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.12);
    display:flex;align-items:center;gap:10px;pointer-events:auto;
    animation:slideIn .3s cubic-bezier(.4,0,.2,1);
    ${fallback[type] || fallback.error}`;

  const icon = document.createElement("span");
  icon.textContent = _toastIcons[type] || _toastIcons.error;
  icon.style.flexShrink = "0";

  const text = document.createElement("span");
  text.textContent = message;

  el.appendChild(icon);
  el.appendChild(text);
  container.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

function showToast(message, type = "success") {
  showAlert(message, type);
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderNavigation);
} else {
  renderNavigation();
}

// ═══════════════════════════════════════════════════════════
// GLOBAL EXPORTS
// ═══════════════════════════════════════════════════════════

window.apiCall = apiCall;
window.showAlert = showAlert;
window.showToast = showToast;
