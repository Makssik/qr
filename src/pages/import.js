/**
 * Import Page — Excel data upload with manual sheet selection
 * and dynamic column mapping.
 *
 * Flow:
 * 1. Upload Excel file
 * 2. See all available sheets → click sheet card
 * 3. Preview data & configure column mapping
 * 4. Import participants
 */

import { readExcelFile, getSheetRows } from '../data/excel-parser.js';
import { addParticipants } from '../data/store.js';
import { showToast } from '../utils/ui.js';
import { navigateTo } from '../router.js';
import { v4 as uuidv4 } from 'uuid';

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
 * Renders the Import page.
 */
export function renderImport(container) {
  // === State ===
  let workbook = null;
  let sheetsInfo = [];
  let selectedSheetName = null;
  let selectedSheetRows = [];
  let selectedSheetHeaders = [];

  // Column mapping (user-selected column names)
  let columnMap = {
    name: '',           // ПІБ / Ім'я учасника
    phone: '',          // Телефон учасника
    age: '',            // Вік
    city: '',           // Область, місто
    school: '',         // Модельна школа / Колектив
    parentName: '',     // ПІБ батьків
    parentPhone: '',    // Телефон батьків
    instagram: '',      // Instagram
    telegram: '',       // Telegram
    participation: '',  // Категорія / тип участі
  };

  // Smart auto-mapping logic
  function autoMapColumns(headers) {
    const map = {
      name: '',
      phone: '',
      age: '',
      city: '',
      school: '',
      parentName: '',
      parentPhone: '',
      instagram: '',
      telegram: '',
      participation: '',
    };

    for (const h of headers) {
      const lower = h.toLowerCase().trim();

      // Participant name
      if (!map.name) {
        if (
          (lower.includes('піб') || lower.includes('п.і.б') || lower.includes('фио') || lower.includes("ім'я") || lower.includes('імʼя') || lower.includes('прізвище')) &&
          !lower.includes('батьк') && !lower.includes('опікун') && !lower.includes('мама') && !lower.includes('папа')
        ) {
          map.name = h;
        }
      }

      // Participant phone
      if (!map.phone) {
        if ((lower.includes('телефон') || lower.includes('номер') || lower.includes('тел')) && (lower.includes('учасник') || lower.includes('дитин') || (!lower.includes('батьк') && !lower.includes('опікун')))) {
          map.phone = h;
        }
      }

      // Age
      if (!map.age) {
        if (lower.includes('вік') || lower.includes('возраст') || lower.includes('років')) {
          map.age = h;
        }
      }

      // City / Region
      if (!map.city) {
        if (lower.includes('область') || lower.includes('місто') || lower.includes('город')) {
          map.city = h;
        }
      }

      // School / Collective
      if (!map.school) {
        if (lower.includes('модельн') || lower.includes('школа') || lower.includes('студія') || lower.includes('колектив') || lower.includes('ансамбль')) {
          map.school = h;
        }
      }

      // Parent name
      if (!map.parentName) {
        if ((lower.includes('піб') || lower.includes("ім'я") || lower.includes('імʼя')) && (lower.includes('батьк') || lower.includes('опікун'))) {
          map.parentName = h;
        }
      }

      // Parent phone
      if (!map.parentPhone) {
        if ((lower.includes('телефон') || lower.includes('номер')) && (lower.includes('батьк') || lower.includes('опікун'))) {
          map.parentPhone = h;
        }
      }

      // Instagram
      if (!map.instagram) {
        if (lower.includes('інстаграм') || lower.includes('instagram')) {
          map.instagram = h;
        }
      }

      // Telegram
      if (!map.telegram) {
        if (lower.includes('телеграм') || lower.includes('telegram')) {
          map.telegram = h;
        }
      }

      // Participation category
      if (!map.participation) {
        if (lower.includes('плануєте') || lower.includes('участь') || lower.includes('категорі') || lower.includes('номінація')) {
          map.participation = h;
        }
      }
    }

    // Fallback for name if not mapped yet
    if (!map.name && headers.length > 0) {
      const fallbackName = headers.find(h => {
        const l = h.toLowerCase();
        return !l.includes('отметка') && !l.includes('timestamp') && !l.includes('дата') && !l.includes('time') && !l.includes('column');
      });
      if (fallbackName) map.name = fallbackName;
    }

    return map;
  }

  // Convert raw sheet rows to participant objects
  function rowsToParticipants(rows) {
    return rows
      .map((row) => {
        let fullName = columnMap.name ? String(row[columnMap.name] || '').trim() : '';
        let firstName = '';
        let lastName = '';

        if (fullName) {
          const parts = fullName.split(/\s+/);
          lastName = parts[0] || '';
          firstName = parts.slice(1).join(' ') || fullName;
        } else {
          // Fallback for separate columns
          firstName = String(row["Ім'я"] || row['Імʼя'] || row['Name'] || '').trim();
          lastName = String(row['Прізвище'] || row['LastName'] || '').trim();
          fullName = [lastName, firstName].filter(Boolean).join(' ');
        }

        return {
          id: uuidv4(),
          type: 'participant',
          firstName: firstName || fullName,
          lastName: lastName !== fullName ? lastName : '',
          fullName: fullName || firstName,
          email: '',
          phone: columnMap.phone ? String(row[columnMap.phone] || '').trim() : '',
          age: columnMap.age ? String(row[columnMap.age] || '').trim() : '',
          city: columnMap.city ? String(row[columnMap.city] || '').trim() : '',
          category: columnMap.participation ? String(row[columnMap.participation] || '').trim() : '',
          collectiveName: columnMap.school ? String(row[columnMap.school] || '').trim() : null,
          school: columnMap.school ? String(row[columnMap.school] || '').trim() : '',
          parentName: columnMap.parentName ? String(row[columnMap.parentName] || '').trim() : '',
          parentPhone: columnMap.parentPhone ? String(row[columnMap.parentPhone] || '').trim() : '',
          instagram: columnMap.instagram ? String(row[columnMap.instagram] || '').trim() : '',
          telegram: columnMap.telegram ? String(row[columnMap.telegram] || '').trim() : '',
          choreographer: null,
          memberIndex: null,
          qrGenerated: false,
          checkedIn: false,
          checkedInAt: null,
        };
      })
      .filter((p) => (p.fullName && p.fullName !== '') || (p.firstName && p.firstName !== ''));
  }

  // === Render initial layout ===
  function render() {
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title"><span class="page-title-gradient">Імпорт даних</span></h1>
        <p class="page-subtitle">Завантажте Excel файл з учасниками та оберіть потрібний лист</p>
      </div>

      <!-- Step 1: File Upload -->
      <div class="card" id="dropzoneCard">
        <div class="dropzone" id="dropzone">
          <span class="dropzone-icon">📁</span>
          <span class="dropzone-text" id="dropzoneText">Перетягніть Excel файл сюди</span>
          <span class="dropzone-hint" id="dropzoneHint">або натисніть для вибору файлу (.xlsx, .xls)</span>
          <input type="file" id="fileInput" accept=".xlsx,.xls" style="display: none;" />
        </div>
      </div>

      <!-- Step 2: Sheet Selection -->
      <div id="sheetSelectionSection" style="display: none;">
        <div class="card" style="margin-top: var(--space-6);">
          <div class="card-header">
            <h3 class="card-title">📋 Знайдені листи у файлі: натисніть на потрібний лист</h3>
          </div>
          <div class="sheet-grid" id="sheetGrid"></div>
        </div>
      </div>

      <!-- Step 3: Data Preview & Column Mapping -->
      <div id="dataPreviewSection" style="display: none;">
        <div class="card" style="margin-top: var(--space-6);">
          <div class="card-header">
            <h3 class="card-title" id="previewTitle">Попередній перегляд</h3>
            <button type="button" class="btn btn-secondary" id="backToSheetsBtn">← Обрати інший лист</button>
          </div>

          <!-- Column Mapping -->
          <div id="columnMappingSection" style="margin-bottom: var(--space-6);">
            <p style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--space-4);">
              🔗 Перевірте та відкоригуйте відповідність колонок з вашого файлу:
            </p>
            <div class="mapping-grid" id="mappingGrid"></div>
          </div>

          <!-- Data Table Preview -->
          <div id="previewTableWrapper"></div>

          <!-- Import Button -->
          <div style="margin-top: var(--space-6); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-4);">
            <span id="previewCountText" style="font-size: var(--font-size-base); font-weight: 600; color: var(--text-primary);"></span>
            <button type="button" class="btn btn-primary btn-lg" id="importSubmitBtn">
              Імпортувати учасників
            </button>
          </div>
        </div>
      </div>
    `;

    setupDropzone();
    setupBackButton();
  }

  // === Dropzone Setup ===
  function setupDropzone() {
    const dropzone = container.querySelector('#dropzone');
    const fileInput = container.querySelector('#fileInput');

    dropzone.addEventListener('click', (e) => {
      if (e.target !== fileInput) fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      fileInput.value = '';
    });

    dropzone.addEventListener('dragenter', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', (e) => { e.preventDefault(); dropzone.classList.remove('drag-over'); });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });
  }

  // === Back Button Setup ===
  function setupBackButton() {
    const backBtn = container.querySelector('#backToSheetsBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        container.querySelector('#dataPreviewSection').style.display = 'none';
        selectedSheetName = null;
        renderSheetSelection();
      });
    }
  }

  // === Handle File Upload ===
  async function handleFile(file) {
    if (!file) return;
    const fileName = file.name || '';
    if (!fileName.match(/\.(xlsx|xls)$/i)) {
      showToast('Оберіть файл з розширенням .xlsx або .xls', 'warning');
      return;
    }

    const dropzoneText = container.querySelector('#dropzoneText');
    const dropzoneHint = container.querySelector('#dropzoneHint');
    dropzoneText.textContent = `Читання: ${fileName}...`;
    dropzoneHint.textContent = 'Будь ласка, зачекайте...';

    try {
      const result = await readExcelFile(file);
      workbook = result.workbook;
      sheetsInfo = result.sheets;

      dropzoneText.textContent = `✅ Завантажено: ${fileName}`;
      dropzoneHint.textContent = `Знайдено ${sheetsInfo.length} лист(ів). Оберіть необхідний лист нижче.`;

      showToast(`Файл успішно прочитано: знайдено ${sheetsInfo.length} лист(ів)`, 'success');
      renderSheetSelection();
    } catch (err) {
      console.error('Error parsing Excel:', err);
      showToast(`Помилка читання файлу: ${err.message}`, 'error');
      dropzoneText.textContent = 'Перетягніть Excel файл сюди';
      dropzoneHint.textContent = 'або натисніть для вибору файлу (.xlsx, .xls)';
    }
  }

  // === Step 2: Sheet Selection ===
  function renderSheetSelection() {
    const section = container.querySelector('#sheetSelectionSection');
    const grid = container.querySelector('#sheetGrid');
    section.style.display = 'block';

    // Hide step 3 if open
    container.querySelector('#dataPreviewSection').style.display = 'none';

    grid.innerHTML = sheetsInfo.map((sheet, idx) => `
      <div class="sheet-card ${selectedSheetName === sheet.name ? 'selected' : ''}" data-index="${idx}">
        <div class="sheet-card-icon">📄</div>
        <div class="sheet-card-info">
          <div class="sheet-card-name">${escapeHtml(sheet.name)}</div>
          <div class="sheet-card-meta">${sheet.rowCount} рядків · ${sheet.headers.length} колонок</div>
          <div class="sheet-card-headers">${sheet.headers.slice(0, 5).map(h => escapeHtml(h)).join(' | ')}${sheet.headers.length > 5 ? '...' : ''}</div>
        </div>
        <div class="sheet-card-arrow">Натисніть для вибору →</div>
      </div>
    `).join('');

    // Attach click listener to each sheet card
    grid.querySelectorAll('.sheet-card').forEach((card) => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.index, 10);
        const sheet = sheetsInfo[idx];
        if (sheet) {
          selectSheet(sheet);
        }
      });
    });

    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // === Select Sheet ===
  function selectSheet(sheet) {
    selectedSheetName = sheet.name;
    selectedSheetRows = getSheetRows(workbook, sheet.name);

    // Derive headers from sheet.headers or fallback to row keys
    let headers = Array.isArray(sheet.headers) && sheet.headers.length > 0 ? sheet.headers : [];
    if (headers.length === 0 && selectedSheetRows.length > 0) {
      headers = Object.keys(selectedSheetRows[0] || {}).map(k => String(k).trim()).filter(Boolean);
    }
    selectedSheetHeaders = headers;

    // Auto-map columns
    columnMap = autoMapColumns(selectedSheetHeaders);

    // Hide step 2 (sheets selection) when showing preview
    container.querySelector('#sheetSelectionSection').style.display = 'none';

    renderDataPreview();
  }

  // === Step 3: Data Preview & Mapping ===
  function renderDataPreview() {
    const section = container.querySelector('#dataPreviewSection');
    section.style.display = 'block';

    const previewTitle = container.querySelector('#previewTitle');
    previewTitle.textContent = `📊 Попередній перегляд листа: "${selectedSheetName}" (${selectedSheetRows.length} рядків)`;

    renderColumnMapping();
    renderPreviewTable();
    setupImportButton();

    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // === Column Mapping UI ===
  function renderColumnMapping() {
    const grid = container.querySelector('#mappingGrid');

    const fields = [
      { key: 'name', label: 'ПІБ учасника', required: true, icon: '👤' },
      { key: 'phone', label: 'Телефон учасника', icon: '📱' },
      { key: 'age', label: 'Вік', icon: '🎂' },
      { key: 'city', label: 'Область, місто', icon: '📍' },
      { key: 'school', label: 'Модельна школа / Колектив', icon: '🏫' },
      { key: 'parentName', label: 'ПІБ батьків/опікунів', icon: '👨‍👩‍👧' },
      { key: 'parentPhone', label: 'Телефон батьків', icon: '📞' },
      { key: 'instagram', label: 'Instagram', icon: '📸' },
      { key: 'telegram', label: 'Telegram', icon: '✈️' },
      { key: 'participation', label: 'Категорія участі', icon: '🏷️' },
    ];

    const noneOption = '<option value="">— не обрано —</option>';

    grid.innerHTML = fields.map(f => {
      const selectedValue = columnMap[f.key] || '';
      const options = selectedSheetHeaders
        .map(h => `<option value="${escapeHtml(h)}" ${h === selectedValue ? 'selected' : ''}>${escapeHtml(h)}</option>`)
        .join('');

      return `
        <div class="mapping-row">
          <label class="mapping-label">
            <span>${f.icon}</span>
            <span>${f.label}${f.required ? ' <span style="color:var(--error);">*</span>' : ''}</span>
          </label>
          <select class="mapping-select" data-field="${f.key}">
            ${noneOption}
            ${options}
          </select>
        </div>
      `;
    }).join('');

    // Change handlers on selects
    grid.querySelectorAll('.mapping-select').forEach(select => {
      select.addEventListener('change', () => {
        columnMap[select.dataset.field] = select.value;
        renderPreviewTable();
      });
    });
  }

  // === Preview Table ===
  function renderPreviewTable() {
    const wrapper = container.querySelector('#previewTableWrapper');
    const previewRows = selectedSheetRows.slice(0, 10);
    const participantsPreview = rowsToParticipants(previewRows);
    const totalParticipants = rowsToParticipants(selectedSheetRows);

    container.querySelector('#previewCountText').textContent =
      `Буде імпортовано: ${totalParticipants.length} учасників`;

    if (totalParticipants.length === 0) {
      wrapper.innerHTML = `
        <div class="empty-state" style="padding: var(--space-8);">
          <span class="empty-state-icon">⚠️</span>
          <h3 class="empty-state-title">Не знайдено учасників</h3>
          <p class="empty-state-text">Оберіть колонку "ПІБ учасника" у випадаючому списку вище</p>
        </div>
      `;
      return;
    }

    wrapper.innerHTML = `
      <div class="table-wrapper" style="max-height: 400px; overflow-y: auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:40px">#</th>
              <th>ПІБ учасника</th>
              <th>Телефон</th>
              <th>Вік</th>
              <th>Місто</th>
              <th>Школа / Колектив</th>
              <th>Категорія</th>
            </tr>
          </thead>
          <tbody>
            ${participantsPreview.map((p, i) => `
              <tr>
                <td style="color:var(--text-secondary);">${i + 1}</td>
                <td style="font-weight:600;">${escapeHtml(p.fullName || p.firstName)}</td>
                <td style="color:var(--text-secondary);">${escapeHtml(p.phone || '—')}</td>
                <td style="color:var(--text-secondary);">${escapeHtml(p.age || '—')}</td>
                <td style="color:var(--text-secondary);">${escapeHtml(p.city || '—')}</td>
                <td>${p.school ? `<span class="badge badge-collective">${escapeHtml(p.school)}</span>` : '—'}</td>
                <td>${p.category ? `<span class="badge badge-participant">${escapeHtml(p.category)}</span>` : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${selectedSheetRows.length > 10 ? `<div style="margin-top: var(--space-3); font-size: var(--font-size-xs); color: var(--text-tertiary); text-align: right;">Показано перші 10 з ${selectedSheetRows.length} записів</div>` : ''}
    `;
  }

  // === Import Submit Button ===
  function setupImportButton() {
    const btn = container.querySelector('#importSubmitBtn');
    // Replace element to clean old event listeners
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async () => {
      if (!selectedSheetRows.length) {
        showToast('Немає даних для імпорту', 'warning');
        return;
      }

      if (!columnMap.name) {
        showToast('Будь ласка, оберіть колонку "ПІБ учасника"', 'warning');
        return;
      }

      const allPeople = rowsToParticipants(selectedSheetRows);
      if (allPeople.length === 0) {
        showToast('Не вдалося сформувати список учасників. Перевірте вибір колонки ПІБ.', 'warning');
        return;
      }

      newBtn.disabled = true;
      newBtn.textContent = 'Імпортуємо...';

      try {
        await addParticipants(allPeople);
        showToast(`Успішно імпортовано ${allPeople.length} учасників!`, 'success');
        navigateTo('participants');
      } catch (err) {
        console.error('Import error:', err);
        showToast(`Помилка зберігання: ${err.message}`, 'error');
        newBtn.disabled = false;
        newBtn.textContent = 'Імпортувати учасників';
      }
    });
  }

  // Initial render
  render();
  return null;
}
