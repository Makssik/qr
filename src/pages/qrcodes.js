import { getParticipants, updateParticipant } from '../data/store.js';
import { generateQRForParticipant, getDisplayName, getTypeLabel, getTypeBadgeClass } from '../data/qr-generator.js';
import { showToast } from '../utils/ui.js';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

/**
 * Escapes HTML special characters to prevent XSS issues.
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
 * Renders the QR Codes page.
 *
 * @param {HTMLElement} container - DOM container element.
 * @returns {Promise<null>}
 */
export async function renderQRCodes(container) {
  let currentFilter = 'all';
  let renderId = 0;

  /**
   * Main render function for the page.
   */
  async function render() {
    const currentRenderId = ++renderId;
    const participants = await getParticipants();

    // Check if there are participants at all
    if (!participants || participants.length === 0) {
      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title page-title-gradient">QR Коди</h1>
          <p class="page-subtitle">Генерація та завантаження QR кодів</p>
        </div>
        <div class="empty-state">
          <span class="empty-state-icon">🏷️</span>
          <h2 class="empty-state-title">Учасників ще немає</h2>
          <p class="empty-state-text">Імпортуйте або додайте учасників для генерації QR кодів.</p>
          <a href="#import" class="btn btn-primary">
            <span>📥</span>
            <span>Імпортувати учасників</span>
          </a>
        </div>
      `;
      return;
    }

    const generatedParticipants = participants.filter((p) => Boolean(p.qrGenerated));

    // If no QR codes generated yet across all participants
    if (generatedParticipants.length === 0) {
      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title page-title-gradient">QR Коди</h1>
          <p class="page-subtitle">Генерація та завантаження QR кодів</p>
        </div>
        <div class="empty-state">
          <span class="empty-state-icon">🏷️</span>
          <h2 class="empty-state-title">QR коди ще не згенеровано</h2>
          <p class="empty-state-text">Згенеруйте QR коди для всіх зареєстрованих учасників події (${participants.length}).</p>
          <button type="button" class="btn btn-primary" id="emptyGenerateBtn">
            <span>⚡</span>
            <span>Створити всі QR</span>
          </button>
        </div>
      `;

      const emptyGenBtn = container.querySelector('#emptyGenerateBtn');
      if (emptyGenBtn) {
        emptyGenBtn.addEventListener('click', handleCreateAllQR);
      }
      return;
    }

    // Filter generated participants by selected type
    const filtered = generatedParticipants.filter((p) => {
      if (currentFilter === 'all') return true;
      return p.type === currentFilter;
    });

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title page-title-gradient">QR Коди</h1>
        <p class="page-subtitle">Генерація та завантаження QR кодів</p>
      </div>

      <div class="actions-bar">
        <div class="filter-chips" id="qrFilterChips">
          <button type="button" class="chip ${currentFilter === 'all' ? 'active' : ''}" data-type="all">Всі</button>
          <button type="button" class="chip ${currentFilter === 'participant' ? 'active' : ''}" data-type="participant">Учасники</button>
          <button type="button" class="chip ${currentFilter === 'collective_member' ? 'active' : ''}" data-type="collective_member">Колективи</button>
          <button type="button" class="chip ${currentFilter === 'guest' ? 'active' : ''}" data-type="guest">Гості</button>
        </div>
        <div class="actions-bar-group">
          <button type="button" class="btn btn-primary" id="btnCreateAll">
            <span>⚡</span>
            <span>Створити всі QR</span>
          </button>
          <button type="button" class="btn btn-secondary" id="btnDownloadAll">
            <span>📦</span>
            <span>Завантажити всі ZIP</span>
          </button>
          <button type="button" class="btn btn-ghost" id="btnPrint">
            <span>🖨️</span>
            <span>Друк</span>
          </button>
        </div>
      </div>

      <div class="qr-grid" id="qrGridContainer">
        ${
          filtered.length === 0
            ? `
            <div class="empty-state" style="grid-column: 1 / -1; padding: var(--space-8);">
              <span class="empty-state-icon">🔍</span>
              <h2 class="empty-state-title">Немає QR кодів</h2>
              <p class="empty-state-text">За вибраним фільтром не знайдено згенерованих QR кодів.</p>
            </div>
          `
            : filtered
                .map((p) => {
                  const name = escapeHtml(getDisplayName(p));
                  const typeLabel = escapeHtml(getTypeLabel(p.type));
                  const badgeClass = escapeHtml(getTypeBadgeClass(p.type));

                  return `
                    <div class="qr-card" data-participant-id="${p.id}">
                      <div class="qr-image" style="width: 100%; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.03); border-radius: var(--radius-md);">
                        <div class="spinner" style="width: 28px; height: 28px;"></div>
                      </div>
                      <div class="qr-card-name" title="${name}">${name}</div>
                      <div class="qr-card-type">
                        <span class="badge ${badgeClass}">${typeLabel}</span>
                      </div>
                      <div class="qr-card-actions">
                        <button type="button" class="btn btn-sm btn-secondary download-single-qr-btn" data-participant-id="${p.id}" title="Завантажити PNG">
                          <span>⬇️</span>
                          <span>Завантажити</span>
                        </button>
                      </div>
                    </div>
                  `;
                })
                .join('')
        }
      </div>
    `;

    // Bind action bar events
    const filterChipsEl = container.querySelector('#qrFilterChips');
    if (filterChipsEl) {
      filterChipsEl.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        currentFilter = chip.dataset.type || 'all';
        render();
      });
    }

    const btnCreateAll = container.querySelector('#btnCreateAll');
    if (btnCreateAll) {
      btnCreateAll.addEventListener('click', handleCreateAllQR);
    }

    const btnDownloadAll = container.querySelector('#btnDownloadAll');
    if (btnDownloadAll) {
      btnDownloadAll.addEventListener('click', handleDownloadAllZip);
    }

    const btnPrint = container.querySelector('#btnPrint');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => {
        window.print();
      });
    }

    // Bind grid clicks (single download or zoom modal)
    let isZoomModalOpen = false;
    const gridContainer = container.querySelector('#qrGridContainer');
    if (gridContainer) {
      gridContainer.addEventListener('click', async (e) => {
        const downloadBtn = e.target.closest('.download-single-qr-btn');
        const qrCard = e.target.closest('.qr-card');
        const isZoomTarget = e.target.closest('.qr-image') || e.target.closest('.qr-card-name');

        if (!qrCard) return;

        if (isZoomTarget) {
          if (isZoomModalOpen || document.querySelector('.modal-backdrop')) return;
          isZoomModalOpen = true;
        }

        const pId = qrCard.dataset.participantId;
        const p = filtered.find((item) => String(item.id) === String(pId)) ||
                  (await getParticipants()).find((item) => String(item.id) === String(pId));

        if (!p) {
          isZoomModalOpen = false;
          return;
        }

        if (downloadBtn) {
          e.stopPropagation();
          try {
            const { qr } = await generateQRForParticipant(p, { width: 400, height: 400 });
            const rawName = getDisplayName(p).replace(/\s+/g, '_');
            const typeLabel = getTypeLabel(p.type).replace(/\s+/g, '_');
            const fileName = `${rawName}_${typeLabel}`;
            qr.download({ name: fileName, extension: 'png' });
            showToast(`Завантажено QR для: ${getDisplayName(p)}`, 'success');
          } catch (err) {
            console.error('Download QR error:', err);
            showToast('Помилка при завантаженні QR коду', 'error');
          }
        } else if (isZoomTarget) {
          try {
            await showQRZoomModal(p, () => { isZoomModalOpen = false; });
          } finally {
            isZoomModalOpen = false;
          }
        }
      });
    }

    // Asynchronously generate and append QR codes to the cards
    for (const p of filtered) {
      if (currentRenderId !== renderId) break;

      try {
        const { qr } = await generateQRForParticipant(p, { width: 220, height: 220 });
        if (currentRenderId !== renderId) break;

        const card = container.querySelector(`.qr-card[data-participant-id="${p.id}"]`);
        if (card) {
          const qrDiv = card.querySelector('.qr-image');
          if (qrDiv) {
            qrDiv.innerHTML = '';
            qr.append(qrDiv);
          }
        }
      } catch (err) {
        console.error(`Failed to generate QR for participant ${p.id}:`, err);
        const card = container.querySelector(`.qr-card[data-participant-id="${p.id}"]`);
        if (card) {
          const qrDiv = card.querySelector('.qr-image');
          if (qrDiv) {
            qrDiv.innerHTML = '<span style="color:var(--error);font-size:var(--font-size-xs);">Помилка QR</span>';
          }
        }
      }
    }
  }

  /**
   * Generates QR codes for all participants who do not have one yet.
   */
  async function handleCreateAllQR() {
    const participants = await getParticipants();
    const pending = participants.filter((p) => !p.qrGenerated);

    if (pending.length === 0) {
      showToast('Усі QR коди вже створено', 'info');
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '9999';
    overlay.style.background = 'rgba(10, 10, 26, 0.85)';
    overlay.style.backdropFilter = 'blur(8px)';
    overlay.innerHTML = `
      <div class="spinner" style="width: 48px; height: 48px;"></div>
      <div id="genProgressText" style="font-weight: 600; color: var(--text-primary); font-size: var(--font-size-base);">
        Створення QR кодів... (0 / ${pending.length})
      </div>
    `;
    document.body.appendChild(overlay);

    const progressText = overlay.querySelector('#genProgressText');
    let generatedCount = 0;

    try {
      for (let i = 0; i < pending.length; i++) {
        const p = pending[i];
        await generateQRForParticipant(p);
        await updateParticipant(p.id, { qrGenerated: true });
        generatedCount++;
        if (progressText) {
          progressText.textContent = `Створення QR кодів... (${generatedCount} / ${pending.length})`;
        }
      }
      showToast(`Створено ${generatedCount} QR кодів`, 'success');
    } catch (err) {
      console.error('Error generating all QR codes:', err);
      showToast('Помилка при створенні QR кодів', 'error');
    } finally {
      overlay.remove();
      await render();
    }
  }

  /**
   * Bundles all generated QR codes into a ZIP archive and triggers download.
   */
  async function handleDownloadAllZip() {
    const participants = await getParticipants();
    const generatedList = participants.filter((p) => Boolean(p.qrGenerated));

    if (generatedList.length === 0) {
      showToast('Немає згенерованих QR кодів для завантаження', 'warning');
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '9999';
    overlay.style.background = 'rgba(10, 10, 26, 0.85)';
    overlay.style.backdropFilter = 'blur(8px)';
    overlay.innerHTML = `
      <div class="spinner" style="width: 48px; height: 48px;"></div>
      <div id="zipProgressText" style="font-weight: 600; color: var(--text-primary); font-size: var(--font-size-base);">
        Підготовка ZIP архіву... (0 / ${generatedList.length})
      </div>
    `;
    document.body.appendChild(overlay);

    const progressText = overlay.querySelector('#zipProgressText');
    const zip = new JSZip();
    const usedNames = new Map();

    try {
      for (let i = 0; i < generatedList.length; i++) {
        const p = generatedList[i];
        const { qr } = await generateQRForParticipant(p, { width: 400, height: 400 });
        const blob = await qr.getRawData('png');

        const rawName = getDisplayName(p).replace(/[\\/:*?"<>|]+/g, '_').trim() || `Учасник_${p.id}`;
        const typeLabel = getTypeLabel(p.type).replace(/[\\/:*?"<>|]+/g, '_');
        const baseName = `${rawName}_${typeLabel}`;

        let finalName = `${baseName}.png`;
        if (usedNames.has(baseName)) {
          const count = usedNames.get(baseName) + 1;
          usedNames.set(baseName, count);
          finalName = `${baseName}_${count}.png`;
        } else {
          usedNames.set(baseName, 1);
        }

        zip.file(finalName, blob);

        if (progressText) {
          progressText.textContent = `Підготовка ZIP архіву... (${i + 1} / ${generatedList.length})`;
        }
      }

      if (progressText) {
        progressText.textContent = 'Стиснення архіву...';
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, 'qr-codes.zip');
      showToast('Архів успішно завантажено', 'success');
    } catch (err) {
      console.error('Error creating ZIP archive:', err);
      showToast('Помилка при створенні ZIP архіву', 'error');
    } finally {
      overlay.remove();
    }
  }

  // Initial render
  await render();

  return null;
}

/**
 * Open enlarged QR code Lightbox Modal.
 * @param {object} participant
 * @param {Function} [onClose] - Optional callback when modal is closed.
 */
async function showQRZoomModal(participant, onClose) {
  if (document.querySelector('.modal-backdrop')) {
    if (onClose) onClose();
    return;
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const name = getDisplayName(participant);
  const pType = participant.type || 'participant';
  const typeLabel = getTypeLabel(pType);
  const badgeClass = getTypeBadgeClass(pType);
  const school = participant.school || participant.collectiveName || '';
  const phone = participant.phone || '';

  backdrop.innerHTML = `
    <div class="modal" style="max-width: 460px; width: 100%; text-align: center; padding: var(--space-6);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4);">
        <span class="badge ${badgeClass}">${typeLabel}</span>
        <button type="button" class="btn btn-ghost" id="modalCloseX" style="font-size: 1.2rem; padding: 4px 8px;">✕</button>
      </div>

      <div style="font-size: var(--font-size-xl); font-weight: 700; margin-bottom: var(--space-2); color: var(--text-primary);">
        ${escapeHtml(name)}
      </div>

      ${school ? `<div style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--space-2);">Колектив / Школа: <strong>${escapeHtml(school)}</strong></div>` : ''}
      ${phone ? `<div style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-bottom: var(--space-4);">Тел: ${escapeHtml(phone)}</div>` : ''}

      <div id="zoomQrContainer" style="background: white; padding: var(--space-4); border-radius: var(--radius-xl); display: flex; align-items: center; justify-content: center; margin: 0 auto var(--space-6) auto; width: 290px; height: 290px; box-shadow: var(--shadow-lg);">
        <div class="spinner"></div>
      </div>

      <div style="display: flex; gap: var(--space-3); justify-content: center;">
        <button type="button" class="btn btn-primary btn-lg" id="modalDownloadBtn">
          <span>⬇️</span>
          <span>Завантажити PNG</span>
        </button>
        <button type="button" class="btn btn-secondary btn-lg" id="modalCloseBtn">
          Закрити
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const containerEl = backdrop.querySelector('#zoomQrContainer');
  try {
    const { qr } = await generateQRForParticipant(participant, { width: 260, height: 260 });
    containerEl.innerHTML = '';
    qr.append(containerEl);

    backdrop.querySelector('#modalDownloadBtn').addEventListener('click', () => {
      const rawName = name.replace(/\s+/g, '_');
      const fileName = `${rawName}_${getTypeLabel(pType).replace(/\s+/g, '_')}`;
      qr.download({ name: fileName, extension: 'png' });
      showToast(`Завантажено QR для: ${name}`, 'success');
    });
  } catch (err) {
    console.error('Zoom QR render error:', err);
  }

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    if (onClose) onClose();
  };
  backdrop.querySelector('#modalCloseX').addEventListener('click', close);
  backdrop.querySelector('#modalCloseBtn').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
}
