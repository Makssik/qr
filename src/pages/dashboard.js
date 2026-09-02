/**
 * Dashboard Page
 * Displays overall event statistics, category breakdown, Google Sheets live sync, and recent scans.
 */
import { getStats, getParticipants, getScanLog, addParticipants } from '../data/store.js';
import { fetchWithAuth } from '../data/auth.js';
import { getCategoryMeta } from '../data/qr-generator.js';
import { navigateTo } from '../router.js';
import { showAddParticipantModal } from './participants.js';
import { showQRZoomModal } from './qrcodes.js';
import { showToast, formatTime } from '../utils/ui.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function renderDashboard(container) {
  const participants = await getParticipants();
  const scanLog = await getScanLog();

  const total = participants.length;
  let checkedIn = 0;
  let qrGenerated = 0;

  // Breakdown by category
  const breakdown = {
    participant: 0,
    guest: 0,
    designer: 0,
    photographer: 0,
    partner: 0,
    collective_member: 0
  };

  for (const p of participants) {
    if (p.checkedIn) checkedIn++;
    if (p.qrGenerated) qrGenerated++;
    if (breakdown[p.type] !== undefined) {
      breakdown[p.type]++;
    } else {
      breakdown.participant++;
    }
  }

  const waiting = Math.max(0, total - checkedIn);
  const percentage = total > 0 ? Math.round((checkedIn / total) * 100) : 0;

  // Recent scans
  const recentScans = Array.isArray(scanLog) ? scanLog.slice(0, 5) : [];

  container.innerHTML = `
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-4);">
      <div>
        <h1 class="page-title"><span class="page-title-gradient">Дашборд</span></h1>
        <p class="page-subtitle">Загальна статистика події Top Fashion Fest</p>
      </div>

      <!-- Google Sheets Live Sync Widget -->
      <div style="background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: var(--space-2) var(--space-4); display: flex; align-items: center; gap: var(--space-3); backdrop-filter: blur(10px);">
        <div style="display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-xs); font-weight: 600;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10B981; box-shadow: 0 0 6px #10B981;"></span>
          <span style="color: var(--text-secondary);">Google Таблиця:</span>
          <span style="color: var(--text-primary);">Авто-синхронізація</span>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="btnSyncGoogleSheets" title="Оновити дані з Google Таблиці зараз" style="font-size: var(--font-size-xs); padding: 4px 10px;">
          <span>🔄</span>
          <span>Оновити зараз</span>
        </button>
      </div>
    </div>

    <!-- 1st Stats Grid: 4 main cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-icon">👥</span>
        <div class="stat-value stat-value-gradient">${total}</div>
        <div class="stat-label">Всього в системі</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">🏷️</span>
        <div class="stat-value">${qrGenerated}</div>
        <div class="stat-label">QR кодів згенеровано</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">✅</span>
        <div class="stat-value stat-value-gradient" style="color: #10B981;">${checkedIn}</div>
        <div class="stat-label">Пройшли вхід</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">⏳</span>
        <div class="stat-value" style="color: #F59E0B;">${waiting}</div>
        <div class="stat-label">Очікують прибуття</div>
      </div>
    </div>

    <!-- 2nd Stats Grid: Category cards with colors -->
    <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); margin-bottom: var(--space-8);">
      <div class="stat-card" style="border-top: 3px solid #7C3AED;">
        <span class="stat-icon">🟣</span>
        <div class="stat-value">${breakdown.participant}</div>
        <div class="stat-label">Моделі / Учасники</div>
      </div>
      <div class="stat-card" style="border-top: 3px solid #059669;">
        <span class="stat-icon">🌟</span>
        <div class="stat-value">${breakdown.guest}</div>
        <div class="stat-label">Запрошені гості</div>
      </div>
      <div class="stat-card" style="border-top: 3px solid #D97706;">
        <span class="stat-icon">👗</span>
        <div class="stat-value">${breakdown.designer}</div>
        <div class="stat-label">Дизайнери</div>
      </div>
      <div class="stat-card" style="border-top: 3px solid #0284C7;">
        <span class="stat-icon">📸</span>
        <div class="stat-value">${breakdown.photographer}</div>
        <div class="stat-label">Фото / Відео</div>
      </div>
      <div class="stat-card" style="border-top: 3px solid #EA580C;">
        <span class="stat-icon">🤝</span>
        <div class="stat-value">${breakdown.partner}</div>
        <div class="stat-label">Партнери</div>
      </div>
      <div class="stat-card" style="border-top: 3px solid #DB2777;">
        <span class="stat-icon">🌸</span>
        <div class="stat-value">${breakdown.collective_member}</div>
        <div class="stat-label">Колективи</div>
      </div>
    </div>

    <!-- Registration Progress Card -->
    <div class="card" style="margin-bottom: var(--space-8);">
      <div class="card-header">
        <h3 class="card-title">Прогрес реєстрації на вході</h3>
        <span style="font-size: var(--font-size-lg); font-weight: 700; color: var(--accent-primary-light);">${percentage}%</span>
      </div>
      <div class="progress-bar" style="margin-bottom: var(--space-4);">
        <div class="progress-fill" style="width: ${percentage}%;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: var(--font-size-sm); color: var(--text-secondary); flex-wrap: wrap; gap: var(--space-2);">
        <span><strong>${checkedIn}</strong> з <strong>${total}</strong> пройшли контроль</span>
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
        <button class="btn btn-secondary btn-lg" id="dashboardQrCodesBtn">
          🏷️ Переглянути QR-коди
        </button>
        <button class="btn btn-secondary btn-lg" id="dashboardRegisterBtn" style="border-color: var(--accent-primary-light); color: var(--accent-primary-light);">
          ✨ Додати гостя / VIP вручну
        </button>
      </div>
    </div>

    <!-- Recent Scans Card -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Останні сканування</h3>
        ${recentScans.length > 0 ? `<button class="btn btn-ghost btn-sm" id="dashboardViewAllLogsBtn">Переглянути всі →</button>` : ''}
      </div>
      ${
        recentScans.length === 0
          ? `
          <div style="text-align: center; padding: var(--space-8); color: var(--text-tertiary);">
            <span style="font-size: 2rem; display: block; margin-bottom: var(--space-2); opacity: 0.5;">📷</span>
            <p>Сканувань ще не було. Відкрийте сканер для початку реєстрації входу.</p>
          </div>
        `
          : `
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
                ${recentScans
                  .map((entry) => {
                    const timeStr = formatTime(entry.timestamp);
                    const nameStr = escapeHtml(entry.name || entry.participantId || 'Невідомий');
                    const meta = getCategoryMeta(entry.type);

                    let statusBadge = '';
                    if (entry.status === 'success') {
                      statusBadge = '<span class="badge badge-success">✅ Успішно</span>';
                    } else if (entry.status === 'warning') {
                      statusBadge = '<span class="badge badge-guest">⚠️ Повторно</span>';
                    } else {
                      statusBadge = '<span class="badge badge-error">❌ Заборонено</span>';
                    }

                    return `
                      <tr>
                        <td style="color: var(--text-secondary); font-variant-numeric: tabular-nums;">${timeStr}</td>
                        <td style="font-weight: 600;">${nameStr}</td>
                        <td><span class="badge ${meta.badgeClass}">${meta.icon} ${meta.label}</span></td>
                        <td>${statusBadge}</td>
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        `
      }
    </div>
  `;

  // Attach event listeners
  const btnSync = container.querySelector('#btnSyncGoogleSheets');
  if (btnSync) {
    btnSync.addEventListener('click', async () => {
      btnSync.disabled = true;
      btnSync.innerHTML = '<span>⏳</span><span>Синхронізація...</span>';
      try {
        const res = await fetchWithAuth('/api/sync/google-sheets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ forceReset: false })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Синхронізація успішна! Всього: ${data.totalCount} осіб`, 'success');
          await renderDashboard(container);
        } else {
          showToast(`Помилка синхронізації: ${data.error || 'Невідома помилка'}`, 'error');
        }
      } catch (err) {
        showToast(`Помилка підключення: ${err.message}`, 'error');
      } finally {
        btnSync.disabled = false;
        btnSync.innerHTML = '<span>🔄</span><span>Оновити зараз</span>';
      }
    });
  }

  const scanBtn = container.querySelector('#dashboardScanBtn');
  if (scanBtn) {
    scanBtn.addEventListener('click', () => navigateTo('scanner'));
  }

  const qrCodesBtn = container.querySelector('#dashboardQrCodesBtn');
  if (qrCodesBtn) {
    qrCodesBtn.addEventListener('click', () => navigateTo('qrcodes'));
  }

  const registerBtn = container.querySelector('#dashboardRegisterBtn');
  if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
      const result = await showAddParticipantModal('guest');
      if (result && result.participant) {
        await addParticipants(result.participant);
        showToast('Зареєстровано успішно', 'success');
        if (result.generateQR) {
          await showQRZoomModal(result.participant);
        }
        await renderDashboard(container);
      }
    });
  }

  const viewAllLogsBtn = container.querySelector('#dashboardViewAllLogsBtn');
  if (viewAllLogsBtn) {
    viewAllLogsBtn.addEventListener('click', () => navigateTo('log'));
  }

  return null;
}
