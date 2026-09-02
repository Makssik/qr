import { getParticipants, updateParticipant } from '../data/store.js';
import { generateQRForParticipant, getDisplayName, getTypeLabel, getTypeBadgeClass, getCategoryMeta, CATEGORY_THEMES } from '../data/qr-generator.js';
import { showToast } from '../utils/ui.js';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

/**
 * Escapes HTML special characters to prevent XSS issues.
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
 */
export async function renderQRCodes(container) {
  let currentFilter = 'all';
  let renderId = 0;

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
          <p class="empty-state-text">Імпортуйте дані з Google Таблиці або файлу Excel.</p>
        </div>
      `;
      return;
    }

    const generatedParticipants = participants.filter((p) => Boolean(p.qrGenerated));

    // Category count counters
    const counts = {
      all: generatedParticipants.length,
      participant: 0,
      guest: 0,
      designer: 0,
      photographer: 0,
      partner: 0,
      collective_member: 0
    };

    for (const p of generatedParticipants) {
      if (counts[p.type] !== undefined) {
        counts[p.type]++;
      } else {
        counts.participant++;
      }
    }

    // Filter generated participants by selected type
    const filtered = generatedParticipants.filter((p) => {
      if (currentFilter === 'all') return true;
      return p.type === currentFilter;
    });

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title page-title-gradient">QR Коди</h1>
        <p class="page-subtitle">Всього кодів: <strong>${generatedParticipants.length}</strong> (синхронізовано з Google Таблицею)</p>
      </div>

      <div class="actions-bar">
        <div class="filter-chips" id="qrFilterChips" style="flex-wrap: wrap;">
          <button type="button" class="chip ${currentFilter === 'all' ? 'active' : ''}" data-type="all">
            Всі (${counts.all})
          </button>
          <button type="button" class="chip ${currentFilter === 'participant' ? 'active' : ''}" data-type="participant">
            🟣 Моделі (${counts.participant})
          </button>
          <button type="button" class="chip ${currentFilter === 'guest' ? 'active' : ''}" data-type="guest">
            🌟 Гості (${counts.guest})
          </button>
          <button type="button" class="chip ${currentFilter === 'designer' ? 'active' : ''}" data-type="designer">
            👗 Дизайнери (${counts.designer})
          </button>
          <button type="button" class="chip ${currentFilter === 'photographer' ? 'active' : ''}" data-type="photographer">
            📸 Фото/Відео (${counts.photographer})
          </button>
          <button type="button" class="chip ${currentFilter === 'partner' ? 'active' : ''}" data-type="partner">
            🤝 Партнери (${counts.partner})
          </button>
          <button type="button" class="chip ${currentFilter === 'collective_member' ? 'active' : ''}" data-type="collective_member">
            🌸 Колективи (${counts.collective_member})
          </button>
        </div>

        <div class="actions-bar-group">
          <button type="button" class="btn btn-secondary" id="btnDownloadCurrentZip">
            <span>📦</span>
            <span>Завантажити ZIP (${currentFilter === 'all' ? 'Всі' : filtered.length})</span>
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
              <p class="empty-state-text">За вибраною категорією не знайдено учасників.</p>
            </div>
          `
            : filtered
                .map((p) => {
                  const name = escapeHtml(getDisplayName(p));
                  const meta = getCategoryMeta(p.type);
                  const typeLabel = escapeHtml(p.roleName || meta.label);
                  const org = escapeHtml(p.organization || p.school || '');
                  const phone = escapeHtml(p.phone || '');

                  return `
                    <div class="qr-card" data-participant-id="${p.id}" style="border-top: 3px solid ${meta.color}; position: relative;">
                      <div class="qr-image" style="width: 100%; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.03); border-radius: var(--radius-md); cursor: zoom-in;">
                        <div class="spinner" style="width: 28px; height: 28px;"></div>
                      </div>
                      <div class="qr-card-name" title="${name}" style="font-size: var(--font-size-base); font-weight: 700; text-align: center; margin-top: 4px;">${name}</div>
                      
                      <div style="display: flex; flex-direction: column; align-items: center; gap: 2px; width: 100%;">
                        <span class="badge ${meta.badgeClass}" style="font-size: var(--font-size-xs);">${meta.icon} ${typeLabel}</span>
                        ${org ? `<div style="font-size: var(--font-size-xs); color: var(--text-secondary); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;" title="${org}">🏫 ${org}</div>` : ''}
                        ${phone ? `<div style="font-size: var(--font-size-xs); color: var(--text-tertiary); font-variant-numeric: tabular-nums;">📞 ${phone}</div>` : ''}
                      </div>

                      <div class="qr-card-actions" style="margin-top: 6px; width: 100%;">
                        <button type="button" class="btn btn-sm btn-secondary download-single-qr-btn" data-participant-id="${p.id}" title="Завантажити PNG" style="width: 100%; justify-content: center;">
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

    // Filter Chips
    const filterChipsEl = container.querySelector('#qrFilterChips');
    if (filterChipsEl) {
      filterChipsEl.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        currentFilter = chip.dataset.type || 'all';
        render();
      });
    }

    // Download ZIP
    const btnDownloadCurrentZip = container.querySelector('#btnDownloadCurrentZip');
    if (btnDownloadCurrentZip) {
      btnDownloadCurrentZip.addEventListener('click', () => handleDownloadZip(filtered, currentFilter));
    }

    // Print
    const btnPrint = container.querySelector('#btnPrint');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => {
        window.print();
      });
    }

    // Grid Clicks (zoom / download)
    let isZoomModalOpen = false;
    const gridContainer = container.querySelector('#qrGridContainer');
    if (gridContainer) {
      gridContainer.addEventListener('click', async (e) => {
        const downloadBtn = e.target.closest('.download-single-qr-btn');
        const qrCard = e.target.closest('.qr-card');
        const isZoomTarget = e.target.closest('.qr-image') || e.target.closest('.qr-card-name');

        if (!qrCard) return;

        const pId = qrCard.dataset.participantId;
        const p = filtered.find((item) => String(item.id) === String(pId)) ||
                  (await getParticipants()).find((item) => String(item.id) === String(pId));

        if (!p) return;

        if (downloadBtn) {
          e.stopPropagation();
          try {
            const { qr } = await generateQRForParticipant(p, { width: 450, height: 450 });
            const rawName = getDisplayName(p).replace(/[\\/:*?"<>|]+/g, '_').trim();
            const typeLabel = (p.roleName || getCategoryMeta(p.type).label).replace(/[\\/:*?"<>|]+/g, '_');
            const fileName = `${rawName}_${typeLabel}`;
            qr.download({ name: fileName, extension: 'png' });
            showToast(`Завантажено QR для: ${getDisplayName(p)}`, 'success');
          } catch (err) {
            console.error('Download QR error:', err);
            showToast('Помилка при завантаженні QR коду', 'error');
          }
        } else if (isZoomTarget) {
          if (isZoomModalOpen || document.querySelector('.modal-backdrop')) return;
          isZoomModalOpen = true;
          try {
            await showQRZoomModal(p, () => { isZoomModalOpen = false; });
          } finally {
            isZoomModalOpen = false;
          }
        }
      });
    }

    // Asynchronously generate and append styled QR codes
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
   * Bundles QR codes into a ZIP archive and triggers download.
   */
  async function handleDownloadZip(listToDownload, categoryKey) {
    if (!listToDownload || listToDownload.length === 0) {
      showToast('Немає QR кодів для завантаження', 'warning');
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
        Підготовка ZIP архіву... (0 / ${listToDownload.length})
      </div>
    `;
    document.body.appendChild(overlay);

    const progressText = overlay.querySelector('#zipProgressText');
    const zip = new JSZip();
    const usedNames = new Map();

    try {
      for (let i = 0; i < listToDownload.length; i++) {
        const p = listToDownload[i];
        const { qr } = await generateQRForParticipant(p, { width: 450, height: 450 });
        const blob = await qr.getRawData('png');

        const rawName = getDisplayName(p).replace(/[\\/:*?"<>|]+/g, '_').trim() || `Учасник_${p.id}`;
        const typeLabel = (p.roleName || getCategoryMeta(p.type).label).replace(/[\\/:*?"<>|]+/g, '_');
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
          progressText.textContent = `Підготовка ZIP архіву... (${i + 1} / ${listToDownload.length})`;
        }
      }

      if (progressText) {
        progressText.textContent = 'Стиснення архіву...';
      }

      const zipName = categoryKey === 'all' ? 'qr-codes-all.zip' : `qr-codes-${categoryKey}.zip`;
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, zipName);
      showToast(`Архів "${zipName}" успішно завантажено`, 'success');
    } catch (err) {
      console.error('Error creating ZIP archive:', err);
      showToast('Помилка при створенні ZIP архіву', 'error');
    } finally {
      overlay.remove();
    }
  }

  await render();
  return null;
}

/**
 * Open enlarged QR code Lightbox Modal.
 */
export async function showQRZoomModal(participant, onClose) {
  if (document.querySelector('.modal-backdrop')) {
    if (onClose) onClose();
    return;
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const name = getDisplayName(participant);
  const meta = getCategoryMeta(participant.type);
  const typeLabel = participant.roleName || meta.label;
  const org = participant.organization || participant.school || participant.collectiveName || '';
  const phone = participant.phone || participant.parentPhone || '';

  backdrop.innerHTML = `
    <div class="modal" style="max-width: 480px; width: 100%; text-align: center; padding: var(--space-6); border-top: 4px solid ${meta.color};">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4);">
        <span class="badge ${meta.badgeClass}" style="font-size: var(--font-size-sm);">${meta.icon} ${typeLabel}</span>
        <button type="button" class="btn btn-ghost" id="modalCloseX" style="font-size: 1.2rem; padding: 4px 8px;">✕</button>
      </div>

      <div style="font-size: 1.4rem; font-weight: 800; margin-bottom: var(--space-2); color: var(--text-primary);">
        ${escapeHtml(name)}
      </div>

      ${org ? `<div style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--space-1);">🏫 <strong>${escapeHtml(org)}</strong></div>` : ''}
      ${phone ? `<div style="font-size: var(--font-size-sm); color: var(--text-tertiary); margin-bottom: var(--space-4); font-variant-numeric: tabular-nums;">📞 ${escapeHtml(phone)}</div>` : ''}

      <div id="zoomQrContainer" style="background: white; padding: var(--space-4); border-radius: var(--radius-xl); display: flex; align-items: center; justify-content: center; margin: 0 auto var(--space-6) auto; width: 300px; height: 300px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
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
    const { qr } = await generateQRForParticipant(participant, { width: 270, height: 270 });
    containerEl.innerHTML = '';
    qr.append(containerEl);

    backdrop.querySelector('#modalDownloadBtn').addEventListener('click', () => {
      const rawName = name.replace(/[\\/:*?"<>|]+/g, '_').trim();
      const fileName = `${rawName}_${typeLabel.replace(/[\\/:*?"<>|]+/g, '_')}`;
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
