import { getScanLog, clearScanLog } from '../data/store.js';
import { getTypeLabel, getTypeBadgeClass } from '../data/qr-generator.js';
import { formatDateTime, showToast, showConfirmModal, debounce } from '../utils/ui.js';
import * as XLSX from 'xlsx';

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Resolves normalized status type, CSS badge class, and Ukrainian display label.
 * @param {string} status
 * @returns {{ type: 'success'|'duplicate'|'error'|'unknown', badgeClass: string, text: string }}
 */
function getStatusInfo(status) {
  const s = String(status || '').trim().toLowerCase();

  if (s === 'success' || s === 'checked_in' || s === 'вхід') {
    return {
      type: 'success',
      badgeClass: 'badge-success',
      text: 'Вхід',
    };
  }

  if (s === 'duplicate' || s === 'warning' || s === 'already_checked_in' || s === 'повторний') {
    return {
      type: 'duplicate',
      badgeClass: 'badge-guest', // badge-guest has warning background and warning color
      text: 'Повторний',
    };
  }

  if (s === 'error' || s === 'invalid' || s === 'not_found' || s === 'помилка') {
    return {
      type: 'error',
      badgeClass: 'badge-error',
      text: 'Помилка',
    };
  }

  return {
    type: 'unknown',
    badgeClass: 'badge-guest',
    text: escapeHtml(status || '—'),
  };
}

/**
 * Renders the Scan Log page.
 *
 * @param {HTMLElement} container - DOM container element.
 * @returns {Promise<null>}
 */
export async function renderLog(container) {
  const rawLog = await getScanLog();
  const log = Array.isArray(rawLog) ? rawLog : [];

  // If no log entries, show empty state
  if (log.length === 0) {
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title"><span class="page-title-gradient">Журнал сканувань</span></h1>
        <p class="page-subtitle">Історія всіх сканувань QR кодів</p>
      </div>
      <div class="empty-state">
        <span class="empty-state-icon">📋</span>
        <h2 class="empty-state-title">Журнал порожній</h2>
        <p class="empty-state-text">Сканування будуть відображатися тут</p>
      </div>
    `;
    return null;
  }

  // Sort by timestamp descending (newest first)
  const sortedLog = [...log].sort((a, b) => {
    const timeA = new Date(a.timestamp || 0).getTime();
    const timeB = new Date(b.timestamp || 0).getTime();
    return timeB - timeA;
  });

  // Calculate statistics
  let successCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  for (const entry of sortedLog) {
    const info = getStatusInfo(entry.status);
    if (info.type === 'success') {
      successCount++;
    } else if (info.type === 'duplicate') {
      duplicateCount++;
    } else if (info.type === 'error') {
      errorCount++;
    }
  }

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title"><span class="page-title-gradient">Журнал сканувань</span></h1>
      <p class="page-subtitle">Історія всіх сканувань QR кодів</p>
    </div>

    <div class="actions-bar">
      <div class="search-input" style="flex: 1; max-width: 320px;">
        <input type="text" id="logSearch" placeholder="Пошук за іменем..." autocomplete="off" />
      </div>
      <div class="actions-bar-group">
        <button type="button" class="btn btn-secondary" id="exportExcelBtn">
          <span>📥</span>
          <span>Експорт Excel</span>
        </button>
        <button type="button" class="btn btn-danger btn-sm" id="clearLogBtn">
          <span>🗑️</span>
          <span>Очистити журнал</span>
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-icon">📊</span>
        <div class="stat-value stat-value-gradient">${sortedLog.length}</div>
        <div class="stat-label">Всього сканувань: ${sortedLog.length}</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">✅</span>
        <div class="stat-value" style="color: var(--success);">${successCount}</div>
        <div class="stat-label">Успішних: ${successCount}</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">⚠️</span>
        <div class="stat-value" style="color: var(--warning);">${duplicateCount}</div>
        <div class="stat-label">Повторних: ${duplicateCount}</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">❌</span>
        <div class="stat-value" style="color: var(--error);">${errorCount}</div>
        <div class="stat-label">Помилок: ${errorCount}</div>
      </div>
    </div>

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 50px;">#</th>
            <th>Час</th>
            <th>Ім'я</th>
            <th>Тип</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody id="logTableBody"></tbody>
      </table>
    </div>
  `;

  const searchInput = container.querySelector('#logSearch');
  const tableBody = container.querySelector('#logTableBody');
  const exportExcelBtn = container.querySelector('#exportExcelBtn');
  const clearLogBtn = container.querySelector('#clearLogBtn');

  let searchQuery = '';

  function renderTableRows() {
    const query = searchQuery.toLowerCase();
    const filtered = sortedLog.filter((entry) => {
      if (!query) return true;
      const name = (entry.name || entry.participantName || entry.participantId || '').toLowerCase();
      return name.includes(query);
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: var(--space-8); color: var(--text-secondary);">
            <div style="font-size: 2rem; margin-bottom: var(--space-2); opacity: 0.6;">🔍</div>
            <div>Записів не знайдено</div>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered
      .map((entry, index) => {
        const timeStr = entry.timestamp ? escapeHtml(formatDateTime(entry.timestamp)) : '—';
        const nameStr = escapeHtml(entry.name || entry.participantName || entry.participantId || '—');

        let typeHtml = '—';
        if (entry.type) {
          const typeLabel = escapeHtml(getTypeLabel(entry.type));
          const typeBadgeClass = escapeHtml(getTypeBadgeClass(entry.type));
          typeHtml = `<span class="badge ${typeBadgeClass}">${typeLabel}</span>`;
        }

        const statusInfo = getStatusInfo(entry.status);
        const statusHtml = `<span class="badge ${statusInfo.badgeClass}">${statusInfo.text}</span>`;

        return `
          <tr>
            <td style="color: var(--text-tertiary); font-weight: 500;">${index + 1}</td>
            <td style="color: var(--text-secondary); font-variant-numeric: tabular-nums;">${timeStr}</td>
            <td style="font-weight: 600; color: var(--text-primary);">${nameStr}</td>
            <td>${typeHtml}</td>
            <td>${statusHtml}</td>
          </tr>
        `;
      })
      .join('');
  }

  // Initial table render
  renderTableRows();

  // Search with debounce
  const debouncedSearch = debounce((value) => {
    searchQuery = value.trim();
    renderTableRows();
  }, 250);

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      debouncedSearch(e.target.value);
    });
  }

  // Export to Excel
  if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', () => {
      if (sortedLog.length === 0) {
        showToast('Немає записів для експорту', 'warning');
        return;
      }

      try {
        const exportData = sortedLog.map((entry, index) => {
          const statusInfo = getStatusInfo(entry.status);
          const typeLabel = entry.type ? getTypeLabel(entry.type) : '—';
          const formattedTime = entry.timestamp ? formatDateTime(entry.timestamp) : '—';
          const name = entry.name || entry.participantName || entry.participantId || '—';

          return {
            '№': index + 1,
            'Час': formattedTime,
            "Ім'я": name,
            'Тип': typeLabel,
            'Статус': statusInfo.text,
          };
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Журнал');
        XLSX.writeFile(wb, 'scan-log.xlsx');
        showToast('Журнал успішно експортовано в Excel', 'success');
      } catch (err) {
        console.error('Error exporting scan log to Excel:', err);
        showToast('Помилка під час експорту файлу', 'error');
      }
    });
  }

  // Clear Scan Log
  if (clearLogBtn) {
    clearLogBtn.addEventListener('click', async () => {
      const confirmed = await showConfirmModal(
        'Очистити журнал сканувань?',
        'Ви впевнені, що хочете видалити всі записи журналу сканувань? Цю дію неможливо скасувати.'
      );

      if (confirmed) {
        await clearScanLog();
        showToast('Журнал сканувань очищено', 'success');
        await renderLog(container);
      }
    });
  }

  return null;
}
