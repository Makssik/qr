import { getParticipants, addParticipants } from '../data/store.js';
import { getDisplayName, getTypeLabel, getTypeBadgeClass, getCategoryMeta } from '../data/qr-generator.js';
import { formatDateTime, debounce, showToast } from '../utils/ui.js';
import { showQRZoomModal } from './qrcodes.js';

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

function getParticipantsWord(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'учасників/гостей';
  if (mod10 === 1) return 'учасник/гість';
  if (mod10 >= 2 && mod10 <= 4) return 'учасники/гості';
  return 'учасників/гостей';
}

/**
 * Renders the Participants page.
 */
export async function renderParticipants(container) {
  const participants = await getParticipants();

  if (!participants || participants.length === 0) {
    container.innerHTML = `
      <div class="page-header">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
          <div>
            <h1 class="page-title page-title-gradient">Учасники та Гості</h1>
            <p class="page-subtitle">Всі зареєстровані учасники, дизайнери, фотографи та гості події</p>
          </div>
          <button type="button" class="btn btn-primary" id="addParticipantBtn">
            <span>➕</span>
            <span>Додати гостя / учасника</span>
          </button>
        </div>
      </div>
      <div class="empty-state">
        <span class="empty-state-icon">👥</span>
        <h2 class="empty-state-title">Учасників ще немає</h2>
        <p class="empty-state-text">Дані автоматично синхронізуються з Google Таблиці або можна додати вручну.</p>
      </div>
    `;

    container.querySelector('#addParticipantBtn').addEventListener('click', async () => {
      const result = await showAddParticipantModal();
      if (result && result.participant) {
        await addParticipants(result.participant);
        showToast('Зареєстровано успішно', 'success');
        if (result.generateQR) {
          await showQRZoomModal(result.participant);
        }
        await renderParticipants(container);
      }
    });
    return null;
  }

  let searchQuery = '';
  let selectedType = 'all';
  let selectedStatus = 'all';

  container.innerHTML = `
    <div class="page-header">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
        <div>
          <h1 class="page-title page-title-gradient">Учасники та Гості</h1>
          <p class="page-subtitle">Всього зареєстровано: <strong>${participants.length}</strong> (з Google Таблиці)</p>
        </div>
        <button type="button" class="btn btn-primary" id="addParticipantBtn">
          <span>➕</span>
          <span>Додати гостя / учасника</span>
        </button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="search-input">
        <input type="text" id="participantSearch" placeholder="Пошук за іменем, телефоном, організацією..." autocomplete="off" />
      </div>
      <div class="filter-chips" id="typeChips" style="flex-wrap: wrap;">
        <button type="button" class="chip active" data-type="all">Всі</button>
        <button type="button" class="chip" data-type="participant">🟣 Моделі</button>
        <button type="button" class="chip" data-type="guest">🌟 Гості</button>
        <button type="button" class="chip" data-type="designer">👗 Дизайнери</button>
        <button type="button" class="chip" data-type="photographer">📸 Фото/Відео</button>
        <button type="button" class="chip" data-type="partner">🤝 Партнери</button>
        <button type="button" class="chip" data-type="collective_member">🌸 Колективи</button>
      </div>
      <div class="filter-chips" id="statusChips">
        <button type="button" class="chip active" data-status="all">Всі статуси</button>
        <button type="button" class="chip" data-status="checked">Відскановані</button>
        <button type="button" class="chip" data-status="pending">Очікують</button>
      </div>
    </div>

    <div id="resultsCount" class="results-count" style="margin-bottom: var(--space-4); color: var(--text-secondary); font-size: var(--font-size-sm); font-weight: 500;"></div>

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 40px;">#</th>
            <th>Ім'я (ПІБ)</th>
            <th>Категорія</th>
            <th>Організація / Школа / Бренд</th>
            <th>Телефон</th>
            <th>Статус входу</th>
            <th style="width: 70px; text-align: center;">QR</th>
          </tr>
        </thead>
        <tbody id="participantsTableBody"></tbody>
      </table>
    </div>
  `;

  const searchInput = container.querySelector('#participantSearch');
  const typeChipsContainer = container.querySelector('#typeChips');
  const statusChipsContainer = container.querySelector('#statusChips');
  const resultsCountEl = container.querySelector('#resultsCount');
  const tableBody = container.querySelector('#participantsTableBody');

  function matchesFilter(p) {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const displayName = getDisplayName(p).toLowerCase();
      const org = (p.organization || p.school || p.collectiveName || '').toLowerCase();
      const phone = (p.phone || p.parentPhone || '').toLowerCase();
      const category = (p.category || p.roleName || '').toLowerCase();

      const matched =
        displayName.includes(q) ||
        org.includes(q) ||
        phone.includes(q) ||
        category.includes(q);

      if (!matched) return false;
    }

    if (selectedType !== 'all' && p.type !== selectedType) {
      return false;
    }

    if (selectedStatus === 'checked' && !p.checkedIn) {
      return false;
    }
    if (selectedStatus === 'pending' && p.checkedIn) {
      return false;
    }

    return true;
  }

  function renderTable() {
    const filtered = participants.filter(matchesFilter);

    resultsCountEl.textContent = `Знайдено: ${filtered.length} ${getParticipantsWord(filtered.length)}`;

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: var(--space-8); color: var(--text-secondary);">
            <div style="font-size: 2rem; margin-bottom: var(--space-2); opacity: 0.6;">🔍</div>
            <div>За вибраними фільтрами записів не знайдено</div>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered
      .map((p, index) => {
        const name = escapeHtml(getDisplayName(p));
        const meta = getCategoryMeta(p.type);
        const roleTitle = escapeHtml(p.roleName || meta.label);
        const org = escapeHtml(p.organization || p.school || p.collectiveName || '—');
        const phone = escapeHtml(p.phone || p.parentPhone || '—');
        const isChecked = Boolean(p.checkedIn);
        const isDenied = Boolean(p.accessDenied);

        let statusHtml = '';
        if (isDenied) {
          statusHtml = `<span class="badge badge-error">⛔ Заборонено</span>`;
        } else if (isChecked) {
          statusHtml = `<span class="status-dot status-dot-success"></span><strong style="color:var(--success);">Вхід о ${p.checkedInAt ? formatDateTime(p.checkedInAt).split(' ')[1] : ''}</strong>`;
        } else {
          statusHtml = `<span class="status-dot status-dot-pending"></span>Очікує`;
        }

        return `
          <tr data-participant-id="${p.id}" class="participant-row" style="cursor: pointer;">
            <td style="color: var(--text-tertiary); font-weight: 500;">${index + 1}</td>
            <td style="font-weight: 700; color: var(--text-primary);">${name}</td>
            <td><span class="badge ${meta.badgeClass}">${meta.icon} ${roleTitle}</span></td>
            <td><strong>${org}</strong></td>
            <td style="font-variant-numeric: tabular-nums;">${phone !== '—' ? `📞 ${phone}` : '—'}</td>
            <td>${statusHtml}</td>
            <td style="text-align: center;">
              <button type="button" class="btn btn-ghost btn-sm view-qr-row-btn" data-participant-id="${p.id}" title="Переглянути QR">
                🏷️
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  renderTable();

  // Row click to view QR code
  tableBody.addEventListener('click', async (e) => {
    const row = e.target.closest('tr');
    if (!row) return;
    const pId = row.dataset.participantId;
    if (!pId) return;

    const p = participants.find(item => String(item.id) === String(pId));
    if (p) {
      await showQRZoomModal(p);
    }
  });

  // Debounced search
  const debouncedSearch = debounce((value) => {
    searchQuery = value.trim();
    renderTable();
  }, 250);

  searchInput.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
  });

  // Type chips
  typeChipsContainer.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;

    typeChipsContainer.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');

    selectedType = chip.dataset.type || 'all';
    renderTable();
  });

  // Status chips
  statusChipsContainer.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;

    statusChipsContainer.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');

    selectedStatus = chip.dataset.status || 'all';
    renderTable();
  });

  // Add participant button
  const addBtn = container.querySelector('#addParticipantBtn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const result = await showAddParticipantModal();
      if (result && result.participant) {
        await addParticipants(result.participant);
        showToast('Зареєстровано успішно', 'success');
        if (result.generateQR) {
          await showQRZoomModal(result.participant);
        }
        await renderParticipants(container);
      }
    });
  }

  return null;
}

/**
 * Quick Add Participant Modal
 */
export function showAddParticipantModal(defaultType = 'guest') {
  return new Promise((resolve) => {
    if (document.querySelector('.modal-backdrop')) {
      resolve(null);
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    backdrop.innerHTML = `
      <div class="modal" style="max-width: 540px; width: 100%; padding: var(--space-6);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5);">
          <h3 class="modal-title" style="margin: 0;">✨ Реєстрація гостя / учасника</h3>
          <button type="button" class="btn btn-ghost" id="modalCloseX" style="font-size: 1.2rem; padding: 4px 8px;">✕</button>
        </div>

        <form id="addParticipantForm" autocomplete="off">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="apType">Категорія / Роль *</label>
              <select class="form-input" id="apType">
                <option value="guest" ${defaultType === 'guest' ? 'selected' : ''}>🌟 Запрошений гість</option>
                <option value="participant" ${defaultType === 'participant' ? 'selected' : ''}>🟣 Модель / Учасник</option>
                <option value="designer" ${defaultType === 'designer' ? 'selected' : ''}>👗 Дизайнер</option>
                <option value="photographer" ${defaultType === 'photographer' ? 'selected' : ''}>📸 Фотограф / Відеограф</option>
                <option value="partner" ${defaultType === 'partner' ? 'selected' : ''}>🤝 Партнер</option>
                <option value="collective_member" ${defaultType === 'collective_member' ? 'selected' : ''}>🌸 Член колективу</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="apFullName">ПІБ (Повне ім'я) *</label>
              <input type="text" class="form-input" id="apFullName" placeholder="Прізвище Ім'я По батькові" required />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="apPhone">Телефон</label>
              <input type="tel" class="form-input" id="apPhone" placeholder="+380671234567" />
            </div>
            <div class="form-group">
              <label class="form-label" for="apOrg">Організація / Бренд / Школа</label>
              <input type="text" class="form-input" id="apOrg" placeholder="напр. ARTelь moda / Top Children" />
            </div>
          </div>

          <div style="display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-5);">
            <button type="button" class="btn btn-secondary" id="modalCancelBtn">Скасувати</button>
            <button type="submit" class="btn btn-primary" id="saveAndQrBtn">
              🏷️ Зберегти та згенерувати QR
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(backdrop);

    let closed = false;
    const close = (result) => {
      if (closed) return;
      closed = true;
      backdrop.remove();
      resolve(result);
    };

    backdrop.querySelector('#modalCloseX').addEventListener('click', () => close(null));
    backdrop.querySelector('#modalCancelBtn').addEventListener('click', () => close(null));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(null);
    });

    backdrop.querySelector('#addParticipantForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const fullName = backdrop.querySelector('#apFullName').value.trim();
      const type = backdrop.querySelector('#apType').value;
      const phone = backdrop.querySelector('#apPhone').value.trim();
      const organization = backdrop.querySelector('#apOrg').value.trim();

      if (!fullName) return;

      const participant = {
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        roleName: getCategoryMeta(type).label,
        fullName,
        firstName: fullName,
        lastName: '',
        organization: organization || 'Top Fashion Fest',
        phone,
        category: getCategoryMeta(type).label,
        qrGenerated: true,
        checkedIn: false,
        checkedInAt: null,
        accessDenied: false,
        accessDeniedAt: null
      };

      close({ participant, generateQR: true });
    });
  });
}
