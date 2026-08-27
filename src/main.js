/**
 * QR Event Manager — Main Entry Point
 */
import './styles/index.css';
import { registerRoute, initRouter, navigateTo } from './router.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderImport } from './pages/import.js';
import { renderParticipants } from './pages/participants.js';
import { renderCollectives } from './pages/collectives.js';
import { renderQRCodes } from './pages/qrcodes.js';
import { renderScanner } from './pages/scanner.js';
import { renderLog } from './pages/log.js';
import { clearAllData } from './data/store.js';
import { showToast, showConfirmModal } from './utils/ui.js';

// Register all routes
registerRoute('dashboard', renderDashboard);
registerRoute('import', renderImport);
registerRoute('participants', renderParticipants);
registerRoute('collectives', renderCollectives);
registerRoute('qrcodes', renderQRCodes);
registerRoute('scanner', renderScanner);
registerRoute('log', renderLog);

// Initialize router
const pageContainer = document.getElementById('pageContainer');
initRouter(pageContainer);

// Sidebar toggle
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');

sidebarToggle.addEventListener('click', () => {
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('mobile-open');
    toggleMobileOverlay();
  } else {
    sidebar.classList.toggle('collapsed');
  }
});

// Mobile menu support
function toggleMobileOverlay() {
  let overlay = document.querySelector('.mobile-overlay');
  if (sidebar.classList.contains('mobile-open')) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'mobile-overlay';
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        overlay.remove();
      });
      document.body.appendChild(overlay);
    }
  } else if (overlay) {
    overlay.remove();
  }
}

// Add mobile header
function setupMobileHeader() {
  if (window.innerWidth <= 768) {
    let mobileHeader = document.querySelector('.mobile-header');
    if (!mobileHeader) {
      mobileHeader = document.createElement('div');
      mobileHeader.className = 'mobile-header';
      mobileHeader.innerHTML = `
        <button class="sidebar-toggle" id="mobileMenuBtn" aria-label="Меню">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <span class="logo-icon" style="font-size:1.2rem;width:28px;height:28px;background:var(--accent-gradient);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;">⚡</span>
        <span style="font-weight:700;background:var(--accent-gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">QR Event</span>
      `;
      const mainContent = document.querySelector('.main-content');
      mainContent.insertBefore(mobileHeader, mainContent.firstChild);

      mobileHeader.querySelector('#mobileMenuBtn').addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
        toggleMobileOverlay();
      });
    }
  }
}

setupMobileHeader();
window.addEventListener('resize', setupMobileHeader);

// Close mobile menu on nav click
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      sidebar.classList.remove('mobile-open');
      const overlay = document.querySelector('.mobile-overlay');
      if (overlay) overlay.remove();
    }
  });
});

// Clear data button
const clearDataBtn = document.getElementById('clearDataBtn');
clearDataBtn.addEventListener('click', async () => {
  const confirmed = await showConfirmModal(
    'Очистити всі дані?',
    'Це видалить усіх учасників, QR коди та журнал сканувань. Цю дію неможливо відмінити.'
  );
  if (confirmed) {
    await clearAllData();
    showToast('Усі дані очищено', 'success');
    navigateTo('dashboard');
    // Force re-render
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
});
