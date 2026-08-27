import { Html5Qrcode } from 'html5-qrcode';
import jsQR from 'jsqr';
import { parseQRData, getDisplayName, getTypeLabel, getTypeBadgeClass } from '../data/qr-generator.js';
import { verifySignature } from '../utils/crypto.js';
import { getParticipantById, updateParticipant, addScanEntry, getParticipants } from '../data/store.js';
import { playSuccess, playWarning, playError } from '../utils/sound.js';
import { showToast, formatTime, showConfirmModal } from '../utils/ui.js';

/**
 * Decode QR code from an Image File using Canvas + jsQR.
 */
async function decodeQRFromFile(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      let width = img.width;
      let height = img.height;
      const maxDim = 1200;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);
      let code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });

      if (!code || !code.data) {
        code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth'
        });
      }

      resolve(code && code.data ? code.data : null);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}

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
 * Show Check-in Decision Modal with participant details & action buttons.
 * @param {object} participant
 * @param {string} displayName
 * @returns {Promise<'allow' | 'repeat' | 'deny' | 'cancel'>}
 */
function showCheckInModal(participant, displayName) {
  return new Promise((resolve) => {
    if (document.querySelector('.modal-backdrop')) {
      resolve('cancel');
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const pType = participant.type || 'participant';
    const typeLabel = getTypeLabel(pType);
    const badgeClass = getTypeBadgeClass(pType);
    const school = participant.school || participant.collectiveName || '';
    const phone = participant.phone || '';
    const parent = participant.parentName ? `${participant.parentName} (${participant.parentPhone || '—'})` : '';
    const isFirstTime = !participant.checkedIn;
    const wasDenied = Boolean(participant.accessDenied);

    let checkedInStatus = !isFirstTime
      ? `<span style="color:var(--warning); font-weight:bold;">⚠️ Вже в приміщенні (вхід о ${participant.checkedInAt ? formatTime(participant.checkedInAt) : ''})</span>`
      : `<span style="color:var(--success); font-weight:bold;">🟢 Ще не заходив (1-й вхід)</span>`;

    if (wasDenied) {
      checkedInStatus += ` · <span style="color:var(--error); font-weight:bold;">⛔ Вхід раніше ЗАБОРОНЕНО</span>`;
    }

    const deniedBannerHtml = wasDenied
      ? `<div style="padding: var(--space-3); background: rgba(239, 68, 68, 0.15); border: 1px solid var(--error); border-radius: var(--radius-md); color: #f87171; font-weight: 700; text-align: center; margin-bottom: var(--space-2);">
           ⛔ УВАГА: Цьому учаснику раніше було ЗАБОРОНЕНО вхід!
           ${participant.accessDeniedAt ? `<div style="font-size:0.85em; font-weight:normal; margin-top:2px;">Час відмови: ${formatTime(participant.accessDeniedAt)}</div>` : ''}
         </div>`
      : '';

    const repeatDisabledAttr = isFirstTime ? 'disabled title="Учасник ще не заходив (доступно тільки для повторного входу)"' : '';
    const repeatStyle = isFirstTime ? 'opacity: 0.4; cursor: not-allowed; filter: grayscale(0.5);' : '';

    backdrop.innerHTML = `
      <div class="modal" style="max-width: 500px; width: 100%;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4);">
          <h3 class="modal-title" style="margin: 0;">👤 Вхідний контроль</h3>
          <span class="badge ${badgeClass}">${typeLabel}</span>
        </div>

        <div class="modal-body" style="display: grid; gap: var(--space-3); font-size: var(--font-size-sm);">
          ${deniedBannerHtml}
          <div style="font-size: var(--font-size-lg); font-weight: 700; color: var(--text-primary);">
            ${escapeHtml(displayName)}
          </div>

          <div style="padding: var(--space-4); background: var(--bg-glass); border-radius: var(--radius-md); border: 1px solid var(--border-color); display: grid; gap: 6px;">
            <div>Статус: ${checkedInStatus}</div>
            ${school ? `<div>Школа / Колектив: <strong>${escapeHtml(school)}</strong></div>` : ''}
            ${participant.category ? `<div>Категорія: <strong>${escapeHtml(participant.category)}</strong></div>` : ''}
            ${participant.age ? `<div>Вік: <strong>${escapeHtml(participant.age)}</strong></div>` : ''}
            ${phone ? `<div>Телефон: <strong>${escapeHtml(phone)}</strong></div>` : ''}
            ${parent ? `<div>Батьки/Опікун: <strong>${escapeHtml(parent)}</strong></div>` : ''}
          </div>
        </div>

        <div class="modal-actions" style="display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-5);">
          <button type="button" class="btn btn-success btn-lg" id="btnAllow" style="width: 100%; justify-content: center; font-weight: 700;">
            🟢 Дозволити вхід
          </button>
          <button type="button" class="btn btn-warning btn-lg" id="btnAllowRepeat" ${repeatDisabledAttr} style="width: 100%; justify-content: center; font-weight: 700; ${repeatStyle}">
            🔄 Дозволити повторно ${isFirstTime ? '(недоступно)' : ''}
          </button>
          <button type="button" class="btn btn-danger btn-lg" id="btnDeny" style="width: 100%; justify-content: center; font-weight: 700;">
            🔴 Заборонити вхід
          </button>
          <button type="button" class="btn btn-ghost" id="btnCancel" style="width: 100%; text-align: center; margin-top: var(--space-1);">
            Скасувати
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    let closed = false;
    let isConfirmingOverrule = false;

    const close = (action) => {
      if (closed) return;
      closed = true;
      backdrop.remove();
      resolve(action);
    };

    backdrop.querySelector('#btnAllow').addEventListener('click', () => {
      if (wasDenied && !isConfirmingOverrule) {
        isConfirmingOverrule = true;
        const actionsEl = backdrop.querySelector('.modal-actions');
        actionsEl.innerHTML = `
          <div style="padding: var(--space-3); background: rgba(245, 158, 11, 0.12); border: 1px solid var(--warning); border-radius: var(--radius-md); text-align: center; margin-bottom: var(--space-2);">
            <div style="font-weight: 700; color: var(--warning); margin-bottom: 4px;">⚠️ Спустошити заборону входу?</div>
            <div style="font-size: var(--font-size-xs); color: var(--text-secondary);">Цьому учаснику раніше було відхилено пропуск. Підтвердіть зміну рішення:</div>
          </div>
          <button type="button" class="btn btn-success btn-lg" id="btnConfirmOverrule" style="width: 100%; justify-content: center; font-weight: 700;">
            ✅ Так, дозволити вхід
          </button>
          <button type="button" class="btn btn-secondary" id="btnCancelOverrule" style="width: 100%; justify-content: center; margin-top: var(--space-2);">
            Скасувати
          </button>
        `;

        actionsEl.querySelector('#btnConfirmOverrule').addEventListener('click', () => close('allow'));
        actionsEl.querySelector('#btnCancelOverrule').addEventListener('click', () => close('cancel'));
        return;
      }
      close('allow');
    });

    backdrop.querySelector('#btnAllowRepeat').addEventListener('click', (e) => {
      if (isFirstTime) {
        e.preventDefault();
        showToast('Учасник заходить вперше. Натисніть "🟢 Дозволити вхід"', 'warning');
        return;
      }
      if (wasDenied && !isConfirmingOverrule) {
        isConfirmingOverrule = true;
        const actionsEl = backdrop.querySelector('.modal-actions');
        actionsEl.innerHTML = `
          <div style="padding: var(--space-3); background: rgba(245, 158, 11, 0.12); border: 1px solid var(--warning); border-radius: var(--radius-md); text-align: center; margin-bottom: var(--space-2);">
            <div style="font-weight: 700; color: var(--warning); margin-bottom: 4px;">⚠️ Спустошити заборону входу?</div>
            <div style="font-size: var(--font-size-xs); color: var(--text-secondary);">Цьому учаснику раніше було відхилено пропуск. Підтвердіть зміну рішення:</div>
          </div>
          <button type="button" class="btn btn-warning btn-lg" id="btnConfirmOverruleRepeat" style="width: 100%; justify-content: center; font-weight: 700;">
            ✅ Так, дозволити повторний вхід
          </button>
          <button type="button" class="btn btn-secondary" id="btnCancelOverrule" style="width: 100%; justify-content: center; margin-top: var(--space-2);">
            Скасувати
          </button>
        `;

        actionsEl.querySelector('#btnConfirmOverruleRepeat').addEventListener('click', () => close('repeat'));
        actionsEl.querySelector('#btnCancelOverrule').addEventListener('click', () => close('cancel'));
        return;
      }
      close('repeat');
    });

    backdrop.querySelector('#btnDeny').addEventListener('click', () => close('deny'));
    backdrop.querySelector('#btnCancel').addEventListener('click', () => close('cancel'));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close('cancel');
    });
  });
}

/**
 * Renders the QR code scanner page.
 */
export async function renderScanner(container) {
  // Inject scanner custom styling
  const style = document.createElement('style');
  style.id = 'scanner-custom-styles';
  style.textContent = `
  #qr-reader { width: 100% !important; height: 100% !important; border: none !important; }
  #qr-reader video { width: 100% !important; height: 100% !important; object-fit: cover !important; border-radius: var(--radius-xl); }
  #qr-reader__scan_region { min-height: 0 !important; }
  #qr-reader__dashboard { display: none !important; }
`;
  document.head.appendChild(style);

  // Session-scoped recent scans (last 5 scans)
  const sessionScans = [];
  const recentlyScannedIds = new Set();
  let isProcessingScan = false;
  let isDestroyed = false;
  let liveVideoInterval = null;

  // Render initial page markup
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title"><span class="page-title-gradient">Сканер QR</span></h1>
      <p class="page-subtitle">Наведіть камеру на QR-код або завантажте фото з кодом</p>
    </div>

    <div class="scanner-container">
      <!-- Database empty warning banner -->
      <div id="dbEmptyBanner" class="alert alert-warning" style="display: none; margin-bottom: var(--space-4); padding: var(--space-4); background: var(--warning-bg); border: 1px solid var(--warning); border-radius: var(--radius-md); color: var(--warning); text-align: center;">
        <span class="alert-icon">⚠️</span>
        <span class="alert-message">
          <strong>База даних на цьому пристрої порожня!</strong><br />
          Спочатку імпортуйте Excel файл на сторінці <a href="#import" style="text-decoration: underline; font-weight: bold;">📥 Імпорт</a>.
        </span>
      </div>

      <!-- Camera Viewport & Overlay -->
      <div class="scanner-viewport" id="scannerViewport">
        <div id="qr-reader"></div>
        <div class="scanner-overlay" id="scannerOverlay">
          <div class="scanner-frame">
            <div class="scan-line"></div>
          </div>
        </div>
      </div>

      <!-- Camera error message banner -->
      <div id="cameraErrorBanner" class="alert alert-error" style="display: none; margin-top: var(--space-4); text-align: center;">
        <span class="alert-icon">⚠️</span>
        <span id="cameraErrorMessage" class="alert-message">Не вдалося отримати доступ до камери.</span>
      </div>

      <!-- Controls -->
      <div class="scanner-controls" style="display: flex; justify-content: center; gap: var(--space-3); margin-top: var(--space-4); flex-wrap: wrap;">
        <button type="button" class="btn btn-primary btn-lg" id="toggleScannerBtn">
          <span id="toggleBtnIcon">⏹️</span>
          <span id="toggleBtnText">Зупинити сканер</span>
        </button>
        <button type="button" class="btn btn-secondary btn-lg" id="uploadQrBtn">
          📁 Завантажити з фото
        </button>
        <input type="file" id="qrFileInput" accept="image/*" style="display: none;" />
      </div>

      <!-- Scan Result Area (hidden initially) -->
      <div class="scan-result" id="scanResultArea" style="display: none;">
        <span class="scan-result-icon" id="scanResultIcon"></span>
        <div class="scan-result-name" id="scanResultName"></div>
        <div id="scanResultBadge" style="margin-bottom: var(--space-2);"></div>
        <div class="scan-result-info" id="scanResultInfo"></div>
        <div id="scanResultTime" style="font-size: var(--font-size-sm); color: var(--text-tertiary); margin-top: var(--space-2);"></div>
      </div>

      <!-- Recent Scans Mini-List -->
      <div class="card" style="margin-top: var(--space-6);">
        <div class="card-header">
          <h3 class="card-title">Останні сканування</h3>
          <span style="font-size: var(--font-size-xs); color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em;">Сесія</span>
        </div>
        <div id="recentScansContainer">
          <div style="text-align: center; padding: var(--space-6); color: var(--text-tertiary);">
            <span style="font-size: 2rem; display: block; margin-bottom: var(--space-2); opacity: 0.5;">📷</span>
            <p>Наведіть камеру на QR-код для початку сканування</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const scanResultArea = container.querySelector('#scanResultArea');
  const scanResultIcon = container.querySelector('#scanResultIcon');
  const scanResultName = container.querySelector('#scanResultName');
  const scanResultBadge = container.querySelector('#scanResultBadge');
  const scanResultInfo = container.querySelector('#scanResultInfo');
  const scanResultTime = container.querySelector('#scanResultTime');
  const cameraErrorBanner = container.querySelector('#cameraErrorBanner');
  const cameraErrorMessage = container.querySelector('#cameraErrorMessage');
  const toggleScannerBtn = container.querySelector('#toggleScannerBtn');
  const toggleBtnIcon = container.querySelector('#toggleBtnIcon');
  const toggleBtnText = container.querySelector('#toggleBtnText');
  const recentScansContainer = container.querySelector('#recentScansContainer');
  const scannerOverlay = container.querySelector('#scannerOverlay');
  const uploadQrBtn = container.querySelector('#uploadQrBtn');
  const qrFileInput = container.querySelector('#qrFileInput');
  const dbEmptyBanner = container.querySelector('#dbEmptyBanner');

  const allParticipants = await getParticipants();
  if (allParticipants.length === 0 && dbEmptyBanner) {
    dbEmptyBanner.style.display = 'block';
  }

  function renderRecentScans() {
    if (!recentScansContainer) return;

    if (sessionScans.length === 0) {
      recentScansContainer.innerHTML = `
        <div style="text-align: center; padding: var(--space-6); color: var(--text-tertiary);">
          <span style="font-size: 2rem; display: block; margin-bottom: var(--space-2); opacity: 0.5;">📷</span>
          <p>Наведіть камеру на QR-код для початку сканування</p>
        </div>
      `;
      return;
    }

    const rows = sessionScans
      .map((entry) => {
        const timeStr = formatTime(entry.timestamp);
        const nameStr = escapeHtml(entry.name);
        let badgeHtml = '—';
        if (entry.type) {
          badgeHtml = `<span class="badge ${getTypeBadgeClass(entry.type)}">${getTypeLabel(entry.type)}</span>`;
        }

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
            <td>${badgeHtml}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      })
      .join('');

    recentScansContainer.innerHTML = `
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
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  function addSessionScan(entry) {
    sessionScans.unshift(entry);
    if (sessionScans.length > 5) {
      sessionScans.pop();
    }
    renderRecentScans();
  }

  function showScanResult(state, details) {
    if (!scanResultArea) return;

    scanResultArea.className = `scan-result scan-result-${state}`;
    scanResultArea.style.display = 'block';

    if (state === 'success') {
      scanResultIcon.textContent = '✅';
      scanResultName.textContent = details.name || '';
      scanResultBadge.innerHTML = details.type
        ? `<span class="badge ${getTypeBadgeClass(details.type)}">${getTypeLabel(details.type)}</span>`
        : '';
      scanResultInfo.textContent = details.message || 'Ласкаво просимо!';
      scanResultTime.textContent = details.time ? `Час реєстрації: ${details.time}` : '';
    } else if (state === 'warning') {
      scanResultIcon.textContent = '⚠️';
      scanResultName.textContent = details.name || '';
      scanResultBadge.innerHTML = details.type
        ? `<span class="badge ${getTypeBadgeClass(details.type)}">${getTypeLabel(details.type)}</span>`
        : '';
      scanResultInfo.textContent = details.message || 'Вже зареєстрований';
      scanResultTime.textContent = details.time ? `Час: ${details.time}` : '';
    } else {
      scanResultIcon.textContent = '❌';
      scanResultName.textContent = details.errorTitle || 'Помилка';
      scanResultBadge.innerHTML = '';
      scanResultInfo.textContent = details.errorMessage || 'Вхід заборонено';
      scanResultTime.textContent = '';
    }

    if (window.innerWidth <= 768) {
      scanResultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // Html5Qrcode instance
  const html5Qrcode = new Html5Qrcode('qr-reader');
  let isScanningActive = false;

  /**
   * Process decoded QR string and show check-in decision menu.
   */
  async function processScannedText(decodedText) {
    if (isProcessingScan || isDestroyed || document.querySelector('.modal-backdrop')) return;

    const trimmedText = (decodedText || '').trim();
    if (!trimmedText) return;

    if (recentlyScannedIds.has(trimmedText)) {
      return;
    }

    // Immediately lock synchronously
    isProcessingScan = true;
    recentlyScannedIds.add(trimmedText);
    setTimeout(() => recentlyScannedIds.delete(trimmedText), 4000);

    try {
      // 1. Parse QR data
      const parsed = parseQRData(trimmedText);
      const scanTime = new Date();
      const formattedScanTime = formatTime(scanTime);

      if (!parsed) {
        recentlyScannedIds.add(trimmedText);
        setTimeout(() => recentlyScannedIds.delete(trimmedText), 3000);

        playError();
        showScanResult('error', {
          errorTitle: 'Невідомий QR код',
          errorMessage: 'Формат даних QR коду не розпізнано'
        });
        showToast('Невідомий QR код', 'error');

        addSessionScan({
          name: 'Невідомий QR код',
          type: '',
          status: 'error',
          timestamp: scanTime.toISOString()
        });
        return;
      }

      // Add cooldown
      const participantIdStr = String(parsed.id);
      recentlyScannedIds.add(participantIdStr);
      recentlyScannedIds.add(trimmedText);
      setTimeout(() => {
        recentlyScannedIds.delete(participantIdStr);
        recentlyScannedIds.delete(trimmedText);
      }, 3000);

      // 2. Get participant by ID from database
      const participant = await getParticipantById(parsed.id);

      if (!participant) {
        playError();
        showScanResult('error', {
          errorTitle: 'Учасника не знайдено',
          errorMessage: `Учасника з ID "${parsed.id}" немає в базі даних`
        });
        showToast('Учасника не знайдено в базі даних', 'error');

        addSessionScan({
          name: `ID: ${parsed.id} (Не знайдено)`,
          type: '',
          status: 'error',
          timestamp: scanTime.toISOString()
        });
        return;
      }

      const displayName = getDisplayName(participant);
      const participantType = participant.type || 'participant';

      // Play soft alert to notify operator QR is detected
      playWarning();

      // 3. Show Interactive Check-in Decision Menu
      const action = await showCheckInModal(participant, displayName);

      if (action === 'allow') {
        const checkInIso = scanTime.toISOString();
        await updateParticipant(participant.id, {
          checkedIn: true,
          checkedInAt: checkInIso,
          accessDenied: false,
          accessDeniedAt: null
        });

        await addScanEntry({
          participantId: participant.id,
          name: displayName,
          type: participantType,
          status: 'success',
          timestamp: checkInIso
        });

        playSuccess();
        showScanResult('success', {
          name: displayName,
          type: participantType,
          message: 'Ласкаво просимо! (Вхід дозволено)',
          time: formattedScanTime
        });
        showToast(`Вхід дозволено: ${displayName}`, 'success');

        addSessionScan({
          name: displayName,
          type: participantType,
          status: 'success',
          timestamp: checkInIso
        });
      } else if (action === 'repeat') {
        const checkInIso = scanTime.toISOString();
        await updateParticipant(participant.id, {
          checkedIn: true,
          checkedInAt: checkInIso,
          accessDenied: false,
          accessDeniedAt: null
        });

        await addScanEntry({
          participantId: participant.id,
          name: displayName,
          type: participantType,
          status: 'warning',
          timestamp: checkInIso
        });

        playWarning();
        showScanResult('warning', {
          name: displayName,
          type: participantType,
          message: 'Повторний вхід дозволено',
          time: formattedScanTime
        });
        showToast(`Повторний вхід: ${displayName}`, 'warning');

        addSessionScan({
          name: displayName,
          type: participantType,
          status: 'warning',
          timestamp: checkInIso
        });
      } else if (action === 'deny') {
        const checkInIso = scanTime.toISOString();
        await updateParticipant(participant.id, {
          accessDenied: true,
          accessDeniedAt: checkInIso
        });

        await addScanEntry({
          participantId: participant.id,
          name: displayName,
          type: participantType,
          status: 'error',
          timestamp: checkInIso
        });

        playError();
        showScanResult('error', {
          errorTitle: displayName,
          errorMessage: 'Вхід заборонено адміністратором'
        });
        showToast(`Вхід заборонено: ${displayName}`, 'error');

        addSessionScan({
          name: displayName,
          type: participantType,
          status: 'error',
          timestamp: scanTime.toISOString()
        });
      } else {
        // Cancelled - no changes
        showToast('Операцію скасовано', 'info');
      }
    } catch (err) {
      console.error('Scan processing error:', err);
      playError();
      showScanResult('error', {
        errorTitle: 'Помилка обробки',
        errorMessage: err.message || 'Не вдалося обробити результат сканування'
      });
    } finally {
      setTimeout(() => {
        isProcessingScan = false;
      }, 1000);
    }
  }

  function onScanSuccess(decodedText) {
    processScannedText(decodedText);
  }

  function onScanFailure() {}

  function updateToggleButton(running) {
    if (!toggleScannerBtn) return;
    if (running) {
      toggleBtnIcon.textContent = '⏹️';
      toggleBtnText.textContent = 'Зупинити сканер';
      toggleScannerBtn.className = 'btn btn-secondary btn-lg';
      if (scannerOverlay) scannerOverlay.style.display = 'flex';
    } else {
      toggleBtnIcon.textContent = '📷';
      toggleBtnText.textContent = 'Запустити сканер';
      toggleScannerBtn.className = 'btn btn-primary btn-lg';
      if (scannerOverlay) scannerOverlay.style.display = 'none';
    }
  }

  function startLiveVideoJsQRPass() {
    stopLiveVideoJsQRPass();
    liveVideoInterval = setInterval(() => {
      if (isProcessingScan || !isScanningActive || isDestroyed) return;
      const video = container.querySelector('#qr-reader video');
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) return;

      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const w = 400;
        const h = Math.round((video.videoHeight / (video.videoWidth || 1)) * 400) || 400;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        let code = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });

        if (!code || !code.data) {
          code = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });
        }

        if (code && code.data) {
          processScannedText(code.data);
        }
      } catch (e) {}
    }, 250);
  }

  function stopLiveVideoJsQRPass() {
    if (liveVideoInterval) {
      clearInterval(liveVideoInterval);
      liveVideoInterval = null;
    }
  }

  async function startScanner() {
    if (isDestroyed) return;
    if (cameraErrorBanner) cameraErrorBanner.style.display = 'none';

    const config = {
      fps: 10,
      qrbox: { width: 260, height: 260 }
    };

    // Explicitly request camera permission first to trigger the browser dialog
    try {
      const testStream = await navigator.mediaDevices.getUserMedia({ video: true });
      testStream.getTracks().forEach(t => t.stop());
    } catch (permErr) {
      console.warn('Camera permission pre-check failed:', permErr);
    }

    // Try environment camera first (mobile back camera)
    const facingModes = [
      { facingMode: 'environment' },
      { facingMode: 'user' },
      true // Any available camera without constraint
    ];

    for (const cameraId of facingModes) {
      try {
        await html5Qrcode.start(
          cameraId,
          config,
          onScanSuccess,
          onScanFailure
        );
        isScanningActive = true;
        updateToggleButton(true);
        startLiveVideoJsQRPass();
        return; // Success — exit
      } catch (err) {
        console.warn(`Camera start failed for ${JSON.stringify(cameraId)}:`, err);
        // Try next camera mode
      }
    }

    // All attempts failed — try listing devices and picking the first one
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        await html5Qrcode.start(
          devices[0].id,
          config,
          onScanSuccess,
          onScanFailure
        );
        isScanningActive = true;
        updateToggleButton(true);
        startLiveVideoJsQRPass();
        return;
      }
    } catch (listErr) {
      console.error('Camera list fallback error:', listErr);
    }

    // Complete failure
    isScanningActive = false;
    updateToggleButton(false);
    stopLiveVideoJsQRPass();

    if (cameraErrorBanner && cameraErrorMessage) {
      cameraErrorBanner.style.display = 'block';
      cameraErrorMessage.textContent =
        'Не вдалося отримати доступ до камери. Перевірте дозволи у налаштуваннях браузера або скористайтеся кнопкою "Завантажити з фото".';
    }
    showToast('Помилка доступу до камери', 'error');
  }

  async function stopScanner() {
    stopLiveVideoJsQRPass();
    try {
      if (html5Qrcode && html5Qrcode.isScanning) {
        await html5Qrcode.stop();
      }
    } catch (err) {
      console.error('Error stopping scanner:', err);
    } finally {
      isScanningActive = false;
      updateToggleButton(false);
    }
  }

  // Toggle button listener
  if (toggleScannerBtn) {
    toggleScannerBtn.addEventListener('click', async () => {
      if (isScanningActive) {
        await stopScanner();
      } else {
        await startScanner();
      }
    });
  }

  // Upload photo handler
  if (uploadQrBtn && qrFileInput) {
    uploadQrBtn.addEventListener('click', () => {
      qrFileInput.click();
    });

    qrFileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      showToast('Аналізуємо фото...', 'info');

      try {
        let decodedText = await decodeQRFromFile(file);

        if (!decodedText) {
          try {
            decodedText = await html5Qrcode.scanFile(file, true);
          } catch {
            decodedText = null;
          }
        }

        if (decodedText) {
          await processScannedText(decodedText);
        } else {
          showToast('Не вдалося розпізнати QR код на фото. Перевірте чіткість фото.', 'warning');
        }
      } catch (err) {
        console.error('File scan error:', err);
        showToast('Помилка розпізнавання фото', 'error');
      } finally {
        qrFileInput.value = '';
      }
    });
  }

  // Auto-start scanner
  await startScanner();

  return {
    async destroy() {
      isDestroyed = true;
      stopLiveVideoJsQRPass();
      if (style && style.parentNode) {
        style.remove();
      }
      try {
        if (html5Qrcode && html5Qrcode.isScanning) {
          await html5Qrcode.stop();
        }
      } catch (err) {
        console.error('Scanner destroy error:', err);
      }
    }
  };
}
