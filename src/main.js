/**
 * QR Event Manager — Main Entry Point
 */
import './styles/index.css';
import { registerRoute, initRouter, navigateTo } from './router.js';
import { renderLogin } from './pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderImport } from './pages/import.js';
import { renderParticipants } from './pages/participants.js';
import { renderCollectives } from './pages/collectives.js';
import { renderQRCodes } from './pages/qrcodes.js';
import { renderScanner } from './pages/scanner.js';
import { renderLog } from './pages/log.js';
import { clearAllData } from './data/store.js';
import { getRole, isAdmin, isScanner, logout, updatePasswords, isAuthenticated } from './data/auth.js';
import { showToast, showConfirmModal } from './utils/ui.js';

// Register all routes
registerRoute('login', renderLogin);
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

// Update UI according to role (Admin vs Scanner)
function updateRoleUI() {
  const role = getRole();
  const navItems = document.querySelectorAll('.nav-item');
  const roleIcon = document.getElementById('roleIcon');
  const roleText = document.getElementById('roleText');
  const authSettingsBtn = document.getElementById('authSettingsBtn');
  const clearDataBtn = document.getElementById('clearDataBtn');
  const userRoleBadge = document.getElementById('userRoleBadge');

  if (!isAuthenticated()) {
    if (userRoleBadge) userRoleBadge.style.display = 'none';
    return;
  }

  if (userRoleBadge) userRoleBadge.style.display = 'flex';

  if (role === 'admin') {
    if (roleIcon) roleIcon.textContent = '👑';
    if (roleText) roleText.textContent = 'Організатор';
    if (authSettingsBtn) authSettingsBtn.style.display = 'flex';
    if (clearDataBtn) clearDataBtn.style.display = 'flex';

    navItems.forEach(item => {
      item.style.display = 'flex';
    });
  } else if (role === 'scanner') {
    if (roleIcon) roleIcon.textContent = '📱';
    if (roleText) roleText.textContent = 'Контролер';
    if (authSettingsBtn) authSettingsBtn.style.display = 'none';
    if (clearDataBtn) clearDataBtn.style.display = 'none';

    navItems.forEach(item => {
      const allowedRoles = (item.dataset.roles || '').split(',');
      if (allowedRoles.includes('scanner')) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  }
}

// Listen to auth changes
window.addEventListener('auth-changed', updateRoleUI);
window.addEventListener('DOMContentLoaded', updateRoleUI);
updateRoleUI();

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

// Logout button
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    const confirmed = await showConfirmModal('Вийти з акаунта?', 'Ви повернетесь на сторінку входу.');
    if (confirmed) {
      logout();
      showToast('Ви вийшли з системи', 'info');
    }
  });
}

// Password Settings Modal for Admin
const authSettingsBtn = document.getElementById('authSettingsBtn');
if (authSettingsBtn) {
  authSettingsBtn.addEventListener('click', () => {
    showPasswordSettingsModal();
  });
}

function showPasswordSettingsModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="max-width: 440px;">
      <h3 class="modal-title">⚙️ Налаштування безпеки</h3>
      <p class="modal-body" style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--space-4);">
        Змініть пароль адміністратора або PIN-код контролерів. Залиште поле порожнім, якщо не бажаєте його змінювати.
      </p>

      <form id="passwordSettingsForm" style="display: grid; gap: var(--space-4);">
        <div class="form-group">
          <label class="form-label" for="settingAdminPass">Новий пароль адміністратора</label>
          <input type="password" id="settingAdminPass" class="form-input" placeholder="Мінімум 4 символи" autocomplete="new-password" />
        </div>

        <div class="form-group">
          <label class="form-label" for="settingScannerPin">Новий PIN-код контролерів</label>
          <input type="password" inputmode="numeric" id="settingScannerPin" class="form-input" placeholder="4-8 цифр" maxlength="8" autocomplete="new-password" />
        </div>

        <div id="settingsModalError" class="login-error" style="display: none;"></div>

        <div class="modal-actions" style="margin-top: var(--space-4);">
          <button type="button" class="btn btn-secondary" id="cancelSettingsBtn">Скасувати</button>
          <button type="submit" class="btn btn-primary" id="saveSettingsBtn">Зберегти зміни</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);

  const form = backdrop.querySelector('#passwordSettingsForm');
  const cancelBtn = backdrop.querySelector('#cancelSettingsBtn');
  const errorEl = backdrop.querySelector('#settingsModalError');
  const adminPassInput = backdrop.querySelector('#settingAdminPass');
  const scannerPinInput = backdrop.querySelector('#settingScannerPin');

  const close = () => backdrop.remove();

  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newAdminPassword = adminPassInput.value.trim();
    const newScannerPin = scannerPinInput.value.trim();

    if (!newAdminPassword && !newScannerPin) {
      errorEl.textContent = 'Вкажіть хоча б один новий пароль або PIN';
      errorEl.style.display = 'block';
      return;
    }

    if (newAdminPassword && newAdminPassword.length < 4) {
      errorEl.textContent = 'Пароль адміністратора має бути не менше 4 символів';
      errorEl.style.display = 'block';
      return;
    }

    if (newScannerPin && newScannerPin.length < 4) {
      errorEl.textContent = 'PIN-код контролера має бути від 4 до 8 цифр';
      errorEl.style.display = 'block';
      return;
    }

    const saveBtn = backdrop.querySelector('#saveSettingsBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Збереження...';

    try {
      await updatePasswords({
        newAdminPassword: newAdminPassword || undefined,
        newScannerPin: newScannerPin || undefined
      });
      showToast('Паролі безпеки успішно оновлено!', 'success');
      close();
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Зберегти зміни';
      errorEl.textContent = err.message || 'Помилка збереження';
      errorEl.style.display = 'block';
    }
  });
}

// Protected Clear data button (Admin only, requires password)
const clearDataBtn = document.getElementById('clearDataBtn');
if (clearDataBtn) {
  clearDataBtn.addEventListener('click', async () => {
    if (!isAdmin()) {
      showToast('Очищення бази дозволено лише адміністратору', 'error');
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" style="max-width: 440px;">
        <h3 class="modal-title" style="color: var(--error);">🗑️ Очистити всі дані?</h3>
        <p class="modal-body" style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--space-4);">
          Це незворотна дія: буде видалено всіх учасників, історію сканувань та QR-коди.<br/><br/>
          <strong>Для підтвердження введіть пароль адміністратора:</strong>
        </p>

        <form id="clearConfirmForm" style="display: grid; gap: var(--space-3);">
          <input type="password" id="clearAdminPass" class="form-input" placeholder="Пароль адміністратора" required autofocus />
          <div id="clearError" class="login-error" style="display: none;"></div>

          <div class="modal-actions" style="margin-top: var(--space-3);">
            <button type="button" class="btn btn-secondary" id="clearCancelBtn">Скасувати</button>
            <button type="submit" class="btn btn-danger" id="clearConfirmBtn">Видалити все</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(backdrop);

    const form = backdrop.querySelector('#clearConfirmForm');
    const passInput = backdrop.querySelector('#clearAdminPass');
    const errorEl = backdrop.querySelector('#clearError');
    const cancelBtn = backdrop.querySelector('#clearCancelBtn');

    cancelBtn.addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.remove();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pass = passInput.value.trim();

      // Test login credentials to verify admin password
      const testRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
      });

      if (!testRes.ok) {
        errorEl.textContent = 'Невірний пароль адміністратора';
        errorEl.style.display = 'block';
        passInput.value = '';
        passInput.focus();
        return;
      }

      backdrop.remove();
      await clearAllData();
      showToast('Усі дані успішно очищено', 'success');
      navigateTo('dashboard');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });
}
