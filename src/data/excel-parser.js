import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';

/**
 * Helper to safely extract string values from a row with fallback keys.
 * Handles variations in casing, whitespace, and Ukrainian apostrophes.
 */
function getFieldValue(row, ...keys) {
  if (!row || typeof row !== 'object') return '';

  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      const val = String(row[key]).trim();
      if (val !== '') return val;
    }
  }

  const normalizeKey = (k) =>
    String(k).trim().toLowerCase().replace(/['ʼ'`]/g, "'");

  const rowEntries = Object.entries(row);
  for (const key of keys) {
    const targetKey = normalizeKey(key);
    const match = rowEntries.find(([k]) => normalizeKey(k) === targetKey);
    if (match && match[1] !== undefined && match[1] !== null) {
      const val = String(match[1]).trim();
      if (val !== '') return val;
    }
  }

  return '';
}

/**
 * Reads an Excel file and returns the workbook info:
 * sheet names, headers, and preview rows for each sheet.
 * Does NOT classify sheets — that's done by the user in the UI.
 *
 * @param {File|Blob|ArrayBuffer} file
 * @returns {Promise<{ workbook: object, sheets: Array<{ name: string, headers: string[], rowCount: number, previewRows: object[] }> }>}
 */
export async function readExcelFile(file) {
  const buffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheets = workbook.SheetNames.map((name) => {
    const ws = workbook.Sheets[name];
    const allRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const headerRow = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const headers = headerRow.length > 0 ? headerRow[0].map(h => String(h).trim()).filter(Boolean) : [];

    return {
      name,
      headers,
      rowCount: allRows.length,
      previewRows: allRows.slice(0, 15),
    };
  });

  return { workbook, sheets };
}

/**
 * Extract all rows from a specific sheet of a workbook.
 * Returns raw row objects.
 */
export function getSheetRows(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

/**
 * Parse raw rows as individual participants.
 * Dynamically maps columns based on the provided column mapping.
 *
 * @param {object[]} rows - Raw row objects from sheet
 * @param {object} columnMap - Mapping: { firstName, lastName, email, phone, category }
 *   Each value is the actual column header name in the sheet.
 * @returns {object[]} Participant objects
 */
export function parseAsParticipants(rows, columnMap = {}) {
  return rows
    .map((row) => {
      const firstName = columnMap.firstName ? String(row[columnMap.firstName] || '').trim() : getFieldValue(row, "Ім'я", 'Імʼя', 'Name', 'FirstName');
      const lastName = columnMap.lastName ? String(row[columnMap.lastName] || '').trim() : getFieldValue(row, 'Прізвище', 'LastName', 'Surname');
      const email = columnMap.email ? String(row[columnMap.email] || '').trim() : getFieldValue(row, 'Email', 'E-mail');
      const phone = columnMap.phone ? String(row[columnMap.phone] || '').trim() : getFieldValue(row, 'Телефон', 'Phone');
      const category = columnMap.category ? String(row[columnMap.category] || '').trim() : getFieldValue(row, 'Категорія', 'Category');

      return {
        id: uuidv4(),
        type: 'participant',
        firstName,
        lastName,
        email,
        phone,
        category,
        collectiveName: null,
        choreographer: null,
        memberIndex: null,
        qrGenerated: false,
        checkedIn: false,
        checkedInAt: null,
      };
    })
    .filter((p) => p.firstName !== '' || p.lastName !== '');
}

/**
 * Parse raw rows as collectives.
 *
 * @param {object[]} rows
 * @param {object} columnMap - { collectiveName, choreographer, email, phone, category, memberCount }
 * @returns {object[]} Collective summary objects (not expanded)
 */
export function parseAsCollectives(rows, columnMap = {}) {
  return rows
    .map((row) => {
      const collectiveName = columnMap.collectiveName ? String(row[columnMap.collectiveName] || '').trim() : getFieldValue(row, 'Назва колективу', 'Назва', 'Name');
      const choreographer = columnMap.choreographer ? String(row[columnMap.choreographer] || '').trim() : getFieldValue(row, 'Хореограф', 'Choreographer', 'Керівник');
      const email = columnMap.email ? String(row[columnMap.email] || '').trim() : getFieldValue(row, 'Email', 'E-mail');
      const phone = columnMap.phone ? String(row[columnMap.phone] || '').trim() : getFieldValue(row, 'Телефон', 'Phone');
      const category = columnMap.category ? String(row[columnMap.category] || '').trim() : getFieldValue(row, 'Категорія', 'Category');
      const rawCount = columnMap.memberCount ? String(row[columnMap.memberCount] || '0').trim() : getFieldValue(row, 'Кількість учасників', 'Кількість', 'Count');
      const memberCount = Math.max(0, parseInt(rawCount || '0', 10) || 0);

      return { collectiveName, choreographer, email, phone, category, memberCount };
    })
    .filter((c) => c.collectiveName !== '' || c.choreographer !== '');
}

/**
 * Parse raw rows as guests.
 *
 * @param {object[]} rows
 * @param {object} columnMap - { firstName, lastName, email, phone, organization }
 * @returns {object[]} Guest objects
 */
export function parseAsGuests(rows, columnMap = {}) {
  return rows
    .map((row) => {
      const firstName = columnMap.firstName ? String(row[columnMap.firstName] || '').trim() : getFieldValue(row, "Ім'я", 'Імʼя', 'Name');
      const lastName = columnMap.lastName ? String(row[columnMap.lastName] || '').trim() : getFieldValue(row, 'Прізвище', 'LastName');
      const organization = columnMap.organization ? String(row[columnMap.organization] || '').trim() : getFieldValue(row, 'Організація', 'Organization');
      const email = columnMap.email ? String(row[columnMap.email] || '').trim() : getFieldValue(row, 'Email', 'E-mail');
      const phone = columnMap.phone ? String(row[columnMap.phone] || '').trim() : getFieldValue(row, 'Телефон', 'Phone');

      return {
        id: uuidv4(),
        type: 'guest',
        firstName,
        lastName,
        organization,
        email,
        phone,
        category: '',
        collectiveName: null,
        choreographer: null,
        memberIndex: null,
        qrGenerated: false,
        checkedIn: false,
        checkedInAt: null,
      };
    })
    .filter((g) => g.firstName !== '' || g.lastName !== '' || g.organization !== '');
}

/**
 * Parse raw rows as a generic list — each row becomes one person
 * with firstName from the first text-like column.
 * Useful when the sheet structure is unknown.
 *
 * @param {object[]} rows
 * @param {string[]} headers - Column headers
 * @returns {object[]} Participant objects with raw data stored
 */
export function parseAsGenericList(rows, headers) {
  return rows
    .map((row) => {
      // Try to find name-like values
      const firstName = getFieldValue(row, ...headers.slice(0, 3));
      return {
        id: uuidv4(),
        type: 'participant',
        firstName,
        lastName: '',
        email: '',
        phone: '',
        category: '',
        collectiveName: null,
        choreographer: null,
        memberIndex: null,
        qrGenerated: false,
        checkedIn: false,
        checkedInAt: null,
        _rawData: row,
      };
    })
    .filter((p) => p.firstName !== '');
}

/**
 * Expands collective definitions into individual attendees.
 */
export function expandCollectives(collectives = [], memberCounts = {}) {
  if (!Array.isArray(collectives)) return [];

  const expandedMembers = [];

  for (const collective of collectives) {
    const collectiveName = collective.collectiveName || '';
    const choreographer = collective.choreographer || '';
    const email = collective.email || '';
    const phone = collective.phone || '';
    const category = collective.category || '';

    // 1. Leader / Choreographer entry
    expandedMembers.push({
      id: uuidv4(),
      type: 'collective_member',
      firstName: choreographer || 'Керівник',
      lastName: '',
      email,
      phone,
      category,
      collectiveName,
      choreographer,
      memberIndex: 0,
      qrGenerated: false,
      checkedIn: false,
      checkedInAt: null,
    });

    // 2. Member count
    const countOverride = memberCounts ? memberCounts[collectiveName] : undefined;
    const finalCount =
      typeof countOverride === 'number' && !isNaN(countOverride)
        ? countOverride
        : typeof countOverride === 'string' && countOverride.trim() !== ''
        ? parseInt(countOverride, 10) || 0
        : collective.memberCount || 0;
    const safeCount = Math.max(0, parseInt(finalCount, 10) || 0);

    // 3. Individual member entries
    for (let i = 1; i <= safeCount; i++) {
      expandedMembers.push({
        id: uuidv4(),
        type: 'collective_member',
        firstName: `Учасник ${i}`,
        lastName: collectiveName,
        email,
        phone,
        category,
        collectiveName,
        choreographer,
        memberIndex: i,
        qrGenerated: false,
        checkedIn: false,
        checkedInAt: null,
      });
    }
  }

  return expandedMembers;
}

// Keep backward compatibility
export async function parseExcelFile(file) {
  const { workbook, sheets } = await readExcelFile(file);
  const result = { participants: [], collectives: [], guests: [], sheets: sheets.map(s => s.name) };
  // Auto-detect mode (fallback)
  for (const sheet of sheets) {
    const rows = getSheetRows(workbook, sheet.name);
    const normName = sheet.name.trim().toLowerCase();
    if (normName.includes('учасник') || normName.includes('participant')) {
      result.participants.push(...parseAsParticipants(rows));
    } else if (normName.includes('колектив') || normName.includes('collective')) {
      result.collectives.push(...parseAsCollectives(rows));
    } else if (normName.includes('гост') || normName.includes('guest')) {
      result.guests.push(...parseAsGuests(rows));
    }
  }
  return result;
}
