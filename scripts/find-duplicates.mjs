import https from 'https';
import * as XLSX from 'xlsx';

const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1XQwVCC4JoR1vuPOB3OcTzRi48B1mt1Vl2AnPj3Ft_R0/export?format=xlsx';

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP Status: ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function normalizeName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/[«»"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhone(phone) {
  if (!phone) return '';
  let str = String(phone).trim().replace(/[^\d]/g, '');
  if (str.startsWith('380') && str.length === 12) str = str.slice(2); // keep 0...
  if (str.startsWith('80') && str.length === 11) str = str.slice(1);
  return str;
}

async function findDuplicates() {
  const buf = await downloadFile(GOOGLE_SHEET_URL);
  const wb = XLSX.read(buf, { type: 'buffer' });

  const allRecords = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const r = rows[rowIndex];
      const name = r['ПІБ учасника'] || r['ПІБ дитини'] || r['ПІБ кандидата'] || r['ПІБ контактної особи'] || r['ПІБ Керівника'] || r['Прізвище та Ім\'я'] || r['ПІБ'] || r['Назва колективу'] || r["Ім'я"];
      if (!name || String(name).trim() === '' || String(name).toLowerCase().includes('приклад')) continue;

      const phone = r['Контактний номер телефону учасника'] || r['Контактний номер телефону дитини'] || r['Контактний номер телефону кандидата'] || r['Контактний номер телефону контактної особи'] || r['Контактний номер телефону керівника'] || r['Контактний номер телефону'] || r['Телефон'] || r['Контактний номер телефону одного з батьків/опікунів'];
      const parentPhone = r['Контактний номер телефону одного з батьків/опікунів'];

      allRecords.push({
        sheetName,
        rowNum: rowIndex + 2,
        rawName: String(name).trim(),
        normName: normalizeName(name),
        rawPhone: phone,
        normPhone: normalizePhone(phone),
        normParentPhone: normalizePhone(parentPhone),
        record: r
      });
    }
  }

  console.log('Total extracted raw records:', allRecords.length);

  // Group by Normalized Name
  const byName = new Map();
  for (const rec of allRecords) {
    if (!byName.has(rec.normName)) byName.set(rec.normName, []);
    byName.get(rec.normName).push(rec);
  }

  console.log('\n=== DUPLICATES BY EXACT/NORMALIZED NAME ===');
  let nameDupCount = 0;
  for (const [name, list] of byName.entries()) {
    if (list.length > 1) {
      nameDupCount++;
      console.log(`\n[${nameDupCount}] Name: "${name}" (${list.length} entries):`);
      for (const item of list) {
        console.log(`  - Sheet: "${item.sheetName}" (Row ${item.rowNum}) | Raw: "${item.rawName}" | Phone: "${item.rawPhone}"`);
      }
    }
  }

  // Group by Phone
  const byPhone = new Map();
  for (const rec of allRecords) {
    if (!rec.normPhone || rec.normPhone.length < 9) continue;
    if (!byPhone.has(rec.normPhone)) byPhone.set(rec.normPhone, []);
    byPhone.get(rec.normPhone).push(rec);
  }

  console.log('\n=== DUPLICATES BY PHONE NUMBER (Different Names or Sheets) ===');
  let phoneDupCount = 0;
  for (const [phone, list] of byPhone.entries()) {
    // only if different names or different sheets
    const uniqueNames = new Set(list.map(i => i.normName));
    if (list.length > 1) {
      phoneDupCount++;
      console.log(`\n[${phoneDupCount}] Phone: "${phone}" (${list.length} entries, names: ${Array.from(uniqueNames).join(' | ')}):`);
      for (const item of list) {
        console.log(`  - Sheet: "${item.sheetName}" (Row ${item.rowNum}) | Name: "${item.rawName}"`);
      }
    }
  }
}

findDuplicates().catch(console.error);
