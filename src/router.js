/**
 * Simple hash-based SPA router with Authentication Guards for QR Event Manager.
 */
import { isAuthenticated, isAdmin, isScanner } from './data/auth.js';

const routes = {};
let currentPage = null;
let pageContainer = null;

/**
 * Register a route.
 * @param {string} path - hash path without #
 * @param {Function} render - async function that returns HTML string or renders into container
 */
export function registerRoute(path, render) {
  routes[path] = render;
}

/**
 * Navigate to a page.
 * @param {string} path
 */
export function navigateTo(path) {
  window.location.hash = path;
}

/**
 * Get the current route path.
 */
export function getCurrentRoute() {
  return window.location.hash.slice(1) || 'dashboard';
}

/**
 * Initialize the router.
 * @param {HTMLElement} container - the page container element
 */
export function initRouter(container) {
  pageContainer = container;

  window.addEventListener('hashchange', () => handleRoute());
  window.addEventListener('auth-changed', () => handleRoute());
  handleRoute();
}

export async function handleRoute() {
  let path = getCurrentRoute();

  // --- AUTH ROUTE GUARDS ---
  const authenticated = isAuthenticated();

  if (!authenticated) {
    if (path !== 'login') {
      window.location.hash = 'login';
      return;
    }
  } else {
    // If logged in and on 'login', redirect to home page
    if (path === 'login') {
      window.location.hash = isAdmin() ? 'dashboard' : 'scanner';
      return;
    }

    // Role restrictions for scanner/controller: only allow scanner and qrcodes
    if (isScanner()) {
      const allowedScannerRoutes = ['scanner', 'qrcodes'];
      if (!allowedScannerRoutes.includes(path)) {
        window.location.hash = 'scanner';
        return;
      }
    }
  }

  // Toggle layout visibility (hide sidebar on login page)
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('mainContent');
  const mobileHeader = document.querySelector('.mobile-header');

  if (path === 'login') {
    if (sidebar) sidebar.style.display = 'none';
    if (mainContent) mainContent.style.marginLeft = '0';
    if (mobileHeader) mobileHeader.style.display = 'none';
    document.body.classList.add('login-active');
  } else {
    if (sidebar) sidebar.style.display = '';
    if (mainContent) mainContent.style.marginLeft = '';
    if (mobileHeader) mobileHeader.style.display = '';
    document.body.classList.remove('login-active');
  }

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === path);
  });

  const renderFn = routes[path];
  if (!renderFn) {
    pageContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">🔍</span>
        <h2 class="empty-state-title">Сторінку не знайдено</h2>
        <p class="empty-state-text">Перейдіть на існуючу сторінку через меню.</p>
      </div>
    `;
    return;
  }

  // Page transition animation
  pageContainer.style.animation = 'none';
  pageContainer.offsetHeight; // Force reflow
  pageContainer.style.animation = 'pageEnter 0.4s cubic-bezier(0.4, 0, 0.2, 1)';

  // Clean up previous page
  if (currentPage && typeof currentPage.destroy === 'function') {
    currentPage.destroy();
  }

  try {
    currentPage = await renderFn(pageContainer);
  } catch (err) {
    console.error('Error rendering page:', err);
    pageContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">❌</span>
        <h2 class="empty-state-title">Помилка завантаження</h2>
        <p class="empty-state-text">${err.message}</p>
      </div>
    `;
  }
}
