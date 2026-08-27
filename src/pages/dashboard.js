/**
 * Dashboard Page
 * Displays overall event statistics, registration progress, quick actions, and recent scans.
 */
import { getStats, getParticipants, getScanLog } from '../data/store.js';
import { navigateTo } from '../router.js';

/**
 * Format timestamp to a human readable time string.
 * @param {string|number|Date} timestamp
 * @returns {string}
 */
function formatScanTime(timestamp) {
  if (!timestamp) return '—';
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return String(timestamp);
  }
}

/**
 * Get HTML badge for participant type.
 * @param {string} type
 * @returns {string}
 */
function getTypeBadge(type) {
  switch (type) {
    case 'participant':
      return '<span class="badge badge-participant">Учасник</span>';
    case 'collective_member':
      return '<span class="badge badge-collective">Колектив</span>';
    case 'guest':
      return '<span class="badge badge-guest">Гість</span>';
    default:
      return `<span class="badge badge-participant">${escapeHtml(type || 'Учасник')}</span>`;
  }
}

/**
 * Get HTML badge for scan status.
 * @param {string} status
 * @returns {string}
 */
function getStatusBadge(status) {
  switch (status) {
    case 'success':
    case 'checked_in':
      return '<span class="badge badge-success">✅ Успішно</span>';
    case 'warning':
    case 'already_checked_in':
      return '<span class="badge badge-guest">⚠️ Повторно</span>';
    case 'error':
    case 'invalid':
    case 'not_found':
      return '<span class="badge badge-error">❌ Помилка</span>';
    default:
      return `<span class="badge badge-success">${escapeHtml(status || 'Успішно')}</span>`;
  }
}

/**
 * Escape HTML to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Render the Dashboard page into the given container element.
 * @param {HTMLElement} container
 * @returns {Promise<null>}
 */
export async function renderDashboard(container) {
  const stats = await getStats();
  const scanLog = await getScanLog();

  const total = stats.total || 0;
  const checkedIn = stats.checkedIn || 0;
  const waiting = Math.max(0, total - checkedIn);
  const qrGenerated = stats.qrGenerated || 0;
  const participantsCount = stats.participants || 0;
  const collectiveMembersCount = stats.collectiveMembers || 0;
  const guestsCount = stats.guests || 0;

  const percentage = total > 0 ? Math.round((checkedIn / total) * 100) : 0;

  // If total is 0, show friendly empty state encouraging import
  if (total === 0) {
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title"><span class="page-title-gradient">Дашборд</span></h1>
        <p class="page-subtitle">Загальна статистика події</p>
      </div>

      <div class="card empty-state">
        <span class="empty-state-icon">📋</span>
        <h2 class="empty-state-title">Немає зареєстрованих учасників</h2>
        <p class="empty-state-text">Імпортуйте список учасників з Excel файлу, щоб почати роботу з подією та генерувати QR-коди.</p>
        <button class="btn btn-primary btn-lg" id="dashboardEmptyImportBtn" style="margin-top: var(--space-4);">
          📥 Імпортувати дані
        </button>
      </div>
    `;

    const emptyImportBtn = container.querySelector('#dashboardEmptyImportBtn');
    if (emptyImportBtn) {
      emptyImportBtn.addEventListener('click', () => {
        navigateTo('import');
      });
    }

    return null;
  }

  // Last 5 scans
  const recentScans = Array.isArray(scanLog) ? scanLog.slice(0, 5) : [];

  let recentScansHtml = '';
  if (recentScans.length === 0) {
    recentScansHtml = `
      <div style="text-align: center; padding: var(--space-8); color: var(--text-tertiary);">
        <span style="font-size: 2rem; display: block; margin-bottom: var(--space-2); opacity: 0.5;">🕒</span>
        <p>Журнал сканувань порожній. Відскануйте QR-код для початку фіксації реєстрацій.</p>
      </div>
    `;
  } else {
    const tableRows = recentScans
      .map((entry) => {
        const timeStr = formatScanTime(entry.timestamp);
        const nameStr = escapeHtml(entry.name || entry.participantId || 'Невідомий');
        const typeBadge = getTypeBadge(entry.type);
        const statusBadge = getStatusBadge(entry.status);

        return `
          <tr>
            <td style="color: var(--text-secondary); font-variant-numeric: tabular-nums;">${timeStr}</td>
            <td style="font-weight: 600;">${nameStr}</td>
            <td>${typeBadge}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      })
      .join('');

    recentScansHtml = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Час</th>
              <th>Учасник</th>
              <th>Категорія</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title"><span class="page-title-gradient">Дашборд</span></h1>
      <p class="page-subtitle">Загальна статистика події</p>
    </div>

    <!-- 1st Stats Grid: 4 main cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-icon">👥</span>
        <div class="stat-value stat-value-gradient">${total}</div>
        <div class="stat-label">Всього зареєстровано</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">🏷️</span>
        <div class="stat-value">${qrGenerated}</div>
        <div class="stat-label">QR кодів створено</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">✅</span>
        <div class="stat-value stat-value-gradient">${checkedIn}</div>
        <div class="stat-label">Відскановано</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">⏳</span>
        <div class="stat-value">${waiting}</div>
        <div class="stat-label">Очікують</div>
      </div>
    </div>

    <!-- 2nd Stats Grid: 3 category cards -->
    <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: var(--space-8);">
      <div class="stat-card">
        <span class="stat-icon">🎭</span>
        <div class="stat-value">
          <span class="badge badge-participant" style="font-size: var(--font-size-xl); padding: var(--space-1) var(--space-3); border-radius: var(--radius-md);">${participantsCount}</span>
        </div>
        <div class="stat-label">Учасники</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">👯</span>
        <div class="stat-value">
          <span class="badge badge-collective" style="font-size: var(--font-size-xl); padding: var(--space-1) var(--space-3); border-radius: var(--radius-md);">${collectiveMembersCount}</span>
        </div>
        <div class="stat-label">Колективи</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">🌟</span>
        <div class="stat-value">
          <span class="badge badge-guest" style="font-size: var(--font-size-xl); padding: var(--space-1) var(--space-3); border-radius: var(--radius-md);">${guestsCount}</span>
        </div>
        <div class="stat-label">Гості</div>
      </div>
    </div>

    <!-- Registration Progress Card -->
    <div class="card" style="margin-bottom: var(--space-8);">
      <div class="card-header">
        <h3 class="card-title">Прогрес реєстрації</h3>
        <span style="font-size: var(--font-size-lg); font-weight: 700; color: var(--accent-primary-light);">${percentage}%</span>
      </div>
      <div class="progress-bar" style="margin-bottom: var(--space-4);">
        <div class="progress-fill" style="width: ${percentage}%;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: var(--font-size-sm); color: var(--text-secondary);">
        <span><strong>${checkedIn}</strong> / <strong>${total}</strong> (пройшли реєстрацію)</span>
        <span>Очікують прибуття: <strong>${waiting}</strong></span>
      </div>
    </div>

    <!-- Quick Actions Card -->
    <div class="card" style="margin-bottom: var(--space-8);">
      <div class="card-header">
        <h3 class="card-title">Швидкі дії</h3>
      </div>
      <div style="display: flex; gap: var(--space-4); flex-wrap: wrap;">
        <button class="btn btn-primary btn-lg" id="dashboardScanBtn">
          📷 Сканувати QR
        </button>
        <button class="btn btn-secondary btn-lg" id="dashboardImportBtn">
          📥 Імпортувати дані
        </button>
      </div>
    </div>

    <!-- Recent Scans Card -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Останні сканування</h3>
        ${recentScans.length > 0 ? `<button class="btn btn-ghost btn-sm" id="dashboardViewAllLogsBtn">Переглянути всі →</button>` : ''}
      </div>
      ${recentScansHtml}
    </div>
  `;

  // Attach event listeners
  const scanBtn = container.querySelector('#dashboardScanBtn');
  if (scanBtn) {
    scanBtn.addEventListener('click', () => {
      navigateTo('scanner');
    });
  }

  const importBtn = container.querySelector('#dashboardImportBtn');
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      navigateTo('import');
    });
  }

  const viewAllLogsBtn = container.querySelector('#dashboardViewAllLogsBtn');
  if (viewAllLogsBtn) {
    viewAllLogsBtn.addEventListener('click', () => {
      navigateTo('log');
    });
  }

  return null;
}
