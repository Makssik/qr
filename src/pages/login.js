/**
 * Login Page — Dual authentication for Admin (password) and Controller (PIN).
 */
import { login, isAuthenticated, isAdmin } from '../data/auth.js';
import { navigateTo } from '../router.js';
import { showToast } from '../utils/ui.js';

export function renderLogin(container) {
  if (isAuthenticated()) {
    navigateTo(isAdmin() ? 'dashboard' : 'scanner');
    return null;
  }

  container.innerHTML = `
    <div class="login-wrapper">
      <div class="login-card">
        <div class="login-header">
          <div class="login-logo">
            <span class="login-logo-icon">⚡</span>
            <span class="login-logo-title">QR Event Manager</span>
          </div>
          <p class="login-subtitle">Оберіть роль для входу в систему</p>
        </div>

        <div class="login-tabs">
          <button type="button" class="login-tab active" id="tabScanner">
            <span>📱</span>
            <span>Контролер (PIN)</span>
          </button>
          <button type="button" class="login-tab" id="tabAdmin">
            <span>👑</span>
            <span>Адміністратор</span>
          </button>
        </div>

        <!-- Scanner / Controller Form -->
        <form class="login-form" id="scannerForm">
          <div class="form-group">
            <label for="scannerPinInput" class="form-label">Введіть PIN-код контролера</label>
            <div class="pin-input-wrapper">
              <input
                type="password"
                inputmode="numeric"
                id="scannerPinInput"
                class="form-input pin-input"
                placeholder="••••"
                maxlength="8"
                autocomplete="current-password"
                autofocus
              />
            </div>
            <p class="form-hint">За замовчуванням: <code>1234</code></p>
          </div>

          <div class="pin-pad" id="pinPad">
            <button type="button" class="pin-key" data-key="1">1</button>
            <button type="button" class="pin-key" data-key="2">2</button>
            <button type="button" class="pin-key" data-key="3">3</button>
            <button type="button" class="pin-key" data-key="4">4</button>
            <button type="button" class="pin-key" data-key="5">5</button>
            <button type="button" class="pin-key" data-key="6">6</button>
            <button type="button" class="pin-key" data-key="7">7</button>
            <button type="button" class="pin-key" data-key="8">8</button>
            <button type="button" class="pin-key" data-key="9">9</button>
            <button type="button" class="pin-key pin-key-action" data-key="clear">C</button>
            <button type="button" class="pin-key" data-key="0">0</button>
            <button type="button" class="pin-key pin-key-action" data-key="backspace">⌫</button>
          </div>

          <div id="scannerError" class="login-error" style="display: none;"></div>

          <button type="submit" class="btn btn-primary btn-lg" id="scannerSubmitBtn" style="width: 100%; margin-top: var(--space-4);">
            <span>📷</span>
            <span>Увійти як Контролер</span>
          </button>
        </form>

        <!-- Admin Form -->
        <form class="login-form" id="adminForm" style="display: none;">
          <div class="form-group">
            <label for="adminPasswordInput" class="form-label">Пароль адміністратора</label>
            <div style="position: relative;">
              <input
                type="password"
                id="adminPasswordInput"
                class="form-input"
                placeholder="Введіть пароль"
                autocomplete="current-password"
              />
              <button type="button" id="toggleAdminPasswordBtn" class="btn btn-ghost btn-sm" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); padding: 4px 8px;" aria-label="Показати пароль">
                👁️
              </button>
            </div>
            <p class="form-hint">За замовчуванням: <code>admin</code></p>
          </div>

          <div id="adminError" class="login-error" style="display: none;"></div>

          <button type="submit" class="btn btn-primary btn-lg" id="adminSubmitBtn" style="width: 100%; margin-top: var(--space-4);">
            <span>👑</span>
            <span>Увійти як Адміністратор</span>
          </button>
        </form>
      </div>
    </div>
  `;

  // Elements
  const tabScanner = container.querySelector('#tabScanner');
  const tabAdmin = container.querySelector('#tabAdmin');
  const scannerForm = container.querySelector('#scannerForm');
  const adminForm = container.querySelector('#adminForm');
  const scannerPinInput = container.querySelector('#scannerPinInput');
  const adminPasswordInput = container.querySelector('#adminPasswordInput');
  const scannerError = container.querySelector('#scannerError');
  const adminError = container.querySelector('#adminError');
  const pinPad = container.querySelector('#pinPad');
  const toggleAdminPasswordBtn = container.querySelector('#toggleAdminPasswordBtn');

  // Tab switching
  tabScanner.addEventListener('click', () => {
    tabScanner.classList.add('active');
    tabAdmin.classList.remove('active');
    scannerForm.style.display = 'block';
    adminForm.style.display = 'none';
    scannerPinInput.focus();
  });

  tabAdmin.addEventListener('click', () => {
    tabAdmin.classList.add('active');
    tabScanner.classList.remove('active');
    adminForm.style.display = 'block';
    scannerForm.style.display = 'none';
    adminPasswordInput.focus();
  });

  // Toggle password visibility
  toggleAdminPasswordBtn.addEventListener('click', () => {
    const isPassword = adminPasswordInput.type === 'password';
    adminPasswordInput.type = isPassword ? 'text' : 'password';
    toggleAdminPasswordBtn.textContent = isPassword ? '🙈' : '👁️';
  });

  // Pin pad buttons
  pinPad.addEventListener('click', (e) => {
    const btn = e.target.closest('.pin-key');
    if (!btn) return;
    const key = btn.dataset.key;

    if (key === 'clear') {
      scannerPinInput.value = '';
    } else if (key === 'backspace') {
      scannerPinInput.value = scannerPinInput.value.slice(0, -1);
    } else {
      if (scannerPinInput.value.length < 8) {
        scannerPinInput.value += key;
      }
    }
    scannerError.style.display = 'none';

    // Auto submit on 4 digits
    if (scannerPinInput.value.length === 4) {
      setTimeout(() => {
        if (scannerPinInput.value.length === 4) {
          submitScanner();
        }
      }, 200);
    }
  });

  // Scanner Form Submit
  async function submitScanner() {
    const pin = scannerPinInput.value.trim();
    if (!pin) {
      showError(scannerError, 'Введіть PIN-код');
      return;
    }

    const btn = container.querySelector('#scannerSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Перевірка...';
    scannerError.style.display = 'none';

    const result = await login({ pin });
    if (result.success) {
      showToast('Успішний вхід як Контролер!', 'success');
      navigateTo('scanner');
    } else {
      btn.disabled = false;
      btn.innerHTML = '<span>📷</span><span>Увійти як Контролер</span>';
      showError(scannerError, result.error || 'Невірний PIN-код');
      scannerPinInput.value = '';
      scannerPinInput.focus();
    }
  }

  scannerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitScanner();
  });

  // Admin Form Submit
  adminForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = adminPasswordInput.value.trim();
    if (!password) {
      showError(adminError, 'Введіть пароль');
      return;
    }

    const btn = container.querySelector('#adminSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Перевірка...';
    adminError.style.display = 'none';

    const result = await login({ password });
    if (result.success) {
      showToast('Успішний вхід як Адміністратор!', 'success');
      navigateTo('dashboard');
    } else {
      btn.disabled = false;
      btn.innerHTML = '<span>👑</span><span>Увійти як Адміністратор</span>';
      showError(adminError, result.error || 'Невірний пароль');
      adminPasswordInput.value = '';
      adminPasswordInput.focus();
    }
  });

  function showError(el, message) {
    el.textContent = message;
    el.style.display = 'block';
    el.classList.remove('shake');
    void el.offsetWidth; // Trigger reflow
    el.classList.add('shake');
  }

  return null;
}
