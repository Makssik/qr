import { getParticipants, addParticipants } from '../data/store.js';
import { getDisplayName, getTypeLabel, getTypeBadgeClass } from '../data/qr-generator.js';
import { formatDateTime, debounce, showToast } from '../utils/ui.js';
import { showQRZoomModal } from './qrcodes.js';

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
 * Returns the grammatically correct plural form for the Ukrainian word "учасник".
 * @param {number} count
 * @returns {string}
 */
function getParticipantsWord(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) {
    return 'учасників';
  }
  if (mod10 === 1) {
    return 'учасник';
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return 'учасники';
  }
  return 'учасників';
}

/**
 * Renders the Participants page.
 *
 * @param {HTMLElement} container - DOM container element.
 * @returns {Promise<null>}
 */
export async function renderParticipants(container) {
  const participants = await getParticipants();

  if (!participants || participants.length === 0) {
    container.innerHTML = `
      <div class="page-header">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
          <div>
            <h1 class="page-title page-title-gradient">Учасники та Гості</h1>
            <p class="page-subtitle">Всі зареєстровані учасники, гості та партнери події</p>
          </div>
          <button type="button" class="btn btn-primary" id="addParticipantBtn">
            <span>➕</span>
            <span>Зареєструвати гостя / учасника</span>
          </button>
        </div>
      </div>
    `;

    // Bind add participant
    container.querySelector('#addParticipantBtn').addEventListener('click', async () => {
      const result = await showAddParticipantModal();
      if (result && result.participant) {
        await addParticipants(result.participant);
        showToast('Учасника/гостя додано', 'success');
        if (result.generateQR) {
          await showQRZoomModal(result.participant);
        }
        await renderParticipants(container);
      }
    });

    // Show empty state below the header
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    emptyDiv.innerHTML = `
      <span class="empty-state-icon">👥</span>
      <h2 class="empty-state-title">Учасників ще немає</h2>
      <p class="empty-state-text">Імпортуйте список з Excel або зареєструйте гостя вручну.</p>
      <a href="#import" class="btn btn-secondary">
        <span>📥</span>
        <span>Імпортувати з Excel</span>
      </a>
    `;
    container.appendChild(emptyDiv);
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
          <p class="page-subtitle">Всі зареєстровані учасники, гості та партнери події</p>
        </div>
        <button type="button" class="btn btn-primary" id="addParticipantBtn">
          <span>➕</span>
          <span>Зареєструвати гостя / учасника</span>
        </button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="search-input">
        <input type="text" id="participantSearch" placeholder="Пошук за іменем, телефоном, організацією..." autocomplete="off" />
      </div>
      <div class="filter-chips" id="typeChips">
        <button type="button" class="chip active" data-type="all">Всі</button>
        <button type="button" class="chip" data-type="participant">Учасники</button>
        <button type="button" class="chip" data-type="collective_member">Колективи</button>
        <button type="button" class="chip" data-type="guest">Гості</button>
        <button type="button" class="chip" data-type="designer">Дизайнери</button>
        <button type="button" class="chip" data-type="sponsor">Спонсори</button>
        <button type="button" class="chip" data-type="other">Інше</button>
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
            <th style="width: 50px;">#</th>
            <th>Ім'я / Назва</th>
            <th>Тип</th>
            <th>Організація / Колектив</th>
            <th>Категорія</th>
            <th>Статус</th>
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
    // Search query matching (case-insensitive)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const displayName = getDisplayName(p).toLowerCase();
      const firstName = (p.firstName || p.first_name || '').toLowerCase();
      const lastName = (p.lastName || p.last_name || '').toLowerCase();
      const fullName = `${firstName} ${lastName}`.trim();
      const collectiveName = (p.collectiveName || p.collective_name || '').toLowerCase();
      const organization = (p.organization || p.school || '').toLowerCase();
      const phone = (p.phone || '').toLowerCase();
      const category = (p.category || '').toLowerCase();

      const matched =
        displayName.includes(q) ||
        fullName.includes(q) ||
        firstName.includes(q) ||
        lastName.includes(q) ||
        collectiveName.includes(q) ||
        organization.includes(q) ||
        phone.includes(q) ||
        category.includes(q);

      if (!matched) return false;
    }

    // Type filter matching
    if (selectedType !== 'all' && p.type !== selectedType) {
      return false;
    }

    // Status filter matching
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
        const typeLabel = escapeHtml(getTypeLabel(p.type));
        const typeBadgeClass = escapeHtml(getTypeBadgeClass(p.type));
        const collective = escapeHtml(p.collectiveName || p.collective_name || p.organization || p.school || '—');
        const category = escapeHtml(p.category || '—');
        const isChecked = Boolean(p.checkedIn);
        const statusHtml = isChecked
          ? `<span class="status-dot status-dot-success"></span>Відскановано`
          : `<span class="status-dot status-dot-pending"></span>Очікує`;
        const hasQr = Boolean(p.qrGenerated || p.qr_generated || p.qrCode);
        const qrHtml = hasQr ? '✅' : '—';

        return `
          <tr>
            <td style="color: var(--text-tertiary); font-weight: 500;">${index + 1}</td>
            <td style="font-weight: 600; color: var(--text-primary);">${name}</td>
            <td><span class="badge ${typeBadgeClass}">${typeLabel}</span></td>
            <td>${collective}</td>
            <td>${category}</td>
            <td>${statusHtml}</td>
            <td style="text-align: center;">${qrHtml}</td>
          </tr>
        `;
      })
      .join('');
  }

  // Initial table render
  renderTable();

  // Search input with debounce
  const debouncedSearch = debounce((value) => {
    searchQuery = value.trim();
    renderTable();
  }, 250);

  searchInput.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
  });

  // Type filter chips
  typeChipsContainer.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;

    typeChipsContainer.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');

    selectedType = chip.dataset.type || 'all';
    renderTable();
  });

  // Status filter chips
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
 * Show a modal to quickly register a new guest, participant, designer, sponsor, etc.
 * @param {string} [defaultType='guest']
 * @returns {Promise<{ participant: object, generateQR: boolean }|null>}
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
              <label class="form-label" for="apType">Категорія / Тип *</label>
              <select class="form-input" id="apType">
                <option value="guest" ${defaultType === 'guest' ? 'selected' : ''}>🌟 Гість</option>
                <option value="participant" ${defaultType === 'participant' ? 'selected' : ''}>🎭 Учасник</option>
                <option value="collective_member" ${defaultType === 'collective_member' ? 'selected' : ''}>👯 Член колективу</option>
                <option value="designer" ${defaultType === 'designer' ? 'selected' : ''}>🎨 Дизайнер</option>
                <option value="sponsor" ${defaultType === 'sponsor' ? 'selected' : ''}>💼 Спонсор</option>
                <option value="other" ${defaultType === 'other' ? 'selected' : ''}>❓ Інше</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="apCategory">Номінація / Категорія</label>
              <input type="text" class="form-input" id="apCategory" placeholder="напр. VIP, Mini, Показ" />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="apFirstName">Ім'я *</label>
              <input type="text" class="form-input" id="apFirstName" placeholder="Софія" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="apLastName">Прізвище</label>
              <input type="text" class="form-input" id="apLastName" placeholder="Петренко" />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="apPhone">Телефон</label>
              <input type="tel" class="form-input" id="apPhone" placeholder="+380671234567" />
            </div>
            <div class="form-group">
              <label class="form-label" for="apCollective">Організація / Колектив / Школа</label>
              <input type="text" class="form-input" id="apCollective" placeholder="напр. TopChildren / Vogue Studio" />
            </div>
          </div>

          <div class="form-group" style="margin-bottom: var(--space-5);">
            <label class="form-label" for="apEmail">Email / Соцмережі</label>
            <input type="text" class="form-input" id="apEmail" placeholder="email@example.com або @instagram" />
          </div>

          <div style="display: flex; gap: var(--space-2); justify-content: flex-end; flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary" id="modalCancelBtn">Скасувати</button>
            <button type="button" class="btn btn-secondary" id="saveAndQrBtn" style="border-color: var(--accent-primary-light); color: var(--accent-primary-light);">
              🏷️ Зберегти та показати QR
            </button>
            <button type="submit" class="btn btn-primary" id="saveOnlyBtn">
              💾 Зберегти
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(backdrop);

    // Focus first field
    setTimeout(() => {
      const firstInput = backdrop.querySelector('#apFirstName');
      if (firstInput) firstInput.focus();
    }, 100);

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

    const createParticipantFromForm = (generateQR = false) => {
      const firstName = backdrop.querySelector('#apFirstName').value.trim();
      const lastName = backdrop.querySelector('#apLastName').value.trim();
      const type = backdrop.querySelector('#apType').value;
      const category = backdrop.querySelector('#apCategory').value.trim();
      const phone = backdrop.querySelector('#apPhone').value.trim();
      const collectiveName = backdrop.querySelector('#apCollective').value.trim();
      const email = backdrop.querySelector('#apEmail').value.trim();

      if (!firstName) return null;

      const participant = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type,
        firstName,
        lastName,
        email,
        phone,
        category,
        collectiveName: collectiveName || null,
        choreographer: null,
        memberIndex: null,
        organization: collectiveName || null,
        choreographer: null,
        memberIndex: null,
        qrGenerated: Boolean(generateQR),
        checkedIn: false,
        checkedInAt: null,
      };

      return { participant, generateQR };
    };

    backdrop.querySelector('#saveAndQrBtn').addEventListener('click', () => {
      const res = createParticipantFromForm(true);
      if (res) close(res);
    });

    backdrop.querySelector('#addParticipantForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const res = createParticipantFromForm(false);
      if (res) close(res);
    });
  });
}
