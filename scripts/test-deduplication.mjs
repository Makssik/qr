import https from 'https';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';

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

function cleanStr(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
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
  let str = String(phone).trim().replace(/[^\d+]/g, '');
  if (str.startsWith('80') && str.length === 11) str = '+3' + str;
  if (str.startsWith('0') && str.length === 10) str = '+38' + str;
  if (str.startsWith('380') && !str.startsWith('+')) str = '+' + str;
  return str;
}

// Priority for types: Designer > Photographer > Partner > Collective > Participant > Guest
const TYPE_PRIORITY = {
  designer: 6,
  photographer: 5,
  partner: 4,
  collective_member: 3,
  participant: 2,
  guest: 1
};

export async function fetchAndParseDeduplicatedGoogleSheets() {
  const buffer = await downloadFile(GOOGLE_SHEET_URL);
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const rawList = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const normSheetName = sheetName.trim().toLowerCase();

    // Skip raw Google Form backup sheets that duplicate primary sheets
    if (normSheetName.includes('ответы на форму') || normSheetName.includes('заявки на участь дизайнери')) {
      continue;
    }

    // 1. УЧАСНИКИ / МОДЕЛІ (Учасники, Відеовізитівка)
    if (normSheetName.includes('учасник') || normSheetName.includes('відеовізитівка')) {
      for (const r of rawRows) {
        const fullName = cleanStr(r['ПІБ учасника'] || r['ПІБ дитини'] || r['ПІБ'] || r["Ім'я"]);
        if (!fullName || fullName.toLowerCase().includes('приклад')) continue;

        const phone = normalizePhone(r['Контактний номер телефону учасника'] || r['Контактний номер телефону дитини'] || r['Телефон']);
        const parentName = cleanStr(r['ПІБ одного з батьків/опікунів'] || r['ПІБ батьків']);
        const parentPhone = normalizePhone(r['Контактний номер телефону одного з батьків/опікунів'] || r['Телефон батьків']);
        const school = cleanStr(r['Модельна школа'] || r['Школа'] || '');
        const city = cleanStr(r['Область, місто '] || r['Область, місто'] || r['Місто'] || '');
        const age = cleanStr(r['Вік учасника'] || r['Вік дитини'] || r['Вік'] || '');
        const participation = cleanStr(r['Як плануєте брати участь?'] || r['Категорія'] || sheetName);
        const instagram = cleanStr(r['Сторінка інстаграм батьків/опікунів'] || r['Instagram'] || '');
        const telegram = cleanStr(r['Імʼя користувача в телеграм '] || r['Telegram'] || '');

        const isContest = participation.toLowerCase().includes('конкурс') || normSheetName.includes('конкурс');
        const roleName = isContest ? 'Учасник конкурсу' : 'Учасник показу';

        rawList.push({
          type: 'participant',
          roleName,
          fullName,
          firstName: fullName,
          lastName: '',
          organization: school && school !== 'Ні' && school !== 'Немає' ? school : (city ? `м. ${city}` : 'Top Fashion Fest'),
          school,
          phone: phone || parentPhone,
          parentName,
          parentPhone,
          age,
          city,
          category: participation,
          instagram,
          telegram,
          sourceSheet: sheetName,
          qrGenerated: true,
          checkedIn: false,
          checkedInAt: null,
          accessDenied: false,
          accessDeniedAt: null
        });
      }
    }

    // 2. ДИЗАЙНЕРИ (Дизайнери)
    else if (normSheetName.includes('дизайн')) {
      for (const r of rawRows) {
        const fullName = cleanStr(r['ПІБ кандидата'] || r['ПІБ'] || r['ПІБ учасника']);
        if (!fullName) continue;

        const phone = normalizePhone(r['Контактний номер телефону кандидата'] || r['Телефон'] || r['Контактний номер телефону']);
        const desc = cleanStr(r['Короткий опис, що представляєте, основний напрям. Коротко, 1-3 речення'] || '');
        const brandMatch = desc.match(/бренд[у|а]?\s+([a-zA-Z0-9_\s"'-]+)/i) || desc.match(/["«]([^"»]+)["»]/);
        const brandName = brandMatch ? brandMatch[1] : (desc.slice(0, 40) || 'Дизайн-студія');
        const instagram = cleanStr(r['Сторінка в інстаграм'] || r['Instagram'] || '');
        const telegram = cleanStr(r['Імʼя користувача в телеграм '] || r['Telegram'] || '');
        const nomination = cleanStr(r['Категорія в якій номінуєтесь'] || 'Дизайнер');

        rawList.push({
          type: 'designer',
          roleName: 'Дизайнер',
          fullName,
          firstName: fullName,
          lastName: '',
          organization: brandName,
          phone,
          category: nomination,
          instagram,
          telegram,
          notes: desc,
          sourceSheet: sheetName,
          qrGenerated: true,
          checkedIn: false,
          checkedInAt: null,
          accessDenied: false,
          accessDeniedAt: null
        });
      }
    }

    // 3. ФОТОГРАФИ ТА ВІДЕОГРАФИ (Фотографивідеографи)
    else if (normSheetName.includes('фотограф') || normSheetName.includes('відеограф') || normSheetName.includes('медіа')) {
      for (const r of rawRows) {
        const fullName = cleanStr(r['ПІБ кандидата'] || r['ПІБ контактної особи'] || r['ПІБ']);
        if (!fullName) continue;

        const phone = normalizePhone(r['Контактний номер телефону кандидата'] || r['Контактний номер телефону контактної особи'] || r['Телефон']);
        const activity = cleanStr(r['Вид діяльності'] || 'Фотограф / Відеограф');
        const instagram = cleanStr(r['Сторінка в інстаграм'] || r['Instagram'] || '');
        const telegram = cleanStr(r['Імʼя користувача в телеграм '] || r['Telegram'] || '');
        const portfolio = cleanStr(r['Посилання на портфоліо'] || '');

        rawList.push({
          type: 'photographer',
          roleName: activity.toLowerCase().includes('відео') ? 'Відеограф' : 'Фотограф',
          fullName,
          firstName: fullName,
          lastName: '',
          organization: instagram ? `@${instagram.replace(/^@/, '')}` : 'Преса / Медіа',
          phone,
          category: activity,
          instagram,
          telegram,
          portfolio,
          sourceSheet: sheetName,
          qrGenerated: true,
          checkedIn: false,
          checkedInAt: null,
          accessDenied: false,
          accessDeniedAt: null
        });
      }
    }

    // 4. ПАРТНЕРИ ТА СПОНСОРИ (Партнери, Партнери Оплата)
    else if (normSheetName.includes('партнер')) {
      for (const r of rawRows) {
        const fullName = cleanStr(r['ПІБ контактної особи'] || r['ПІБ'] || r['Імʼя партнера']);
        if (!fullName) continue;

        const partnerName = cleanStr(r['Імʼя партнера'] || r['Вид діяльності'] || 'Партнер заходу');
        const phone = normalizePhone(r['Контактний номер телефону контактної особи'] || r['Телефон']);
        const activity = cleanStr(r['Вид діяльності'] || '');
        const instagram = cleanStr(r['Сторінка в інстаграм'] || r['Instagram'] || '');
        const telegram = cleanStr(r['Імʼя користувача в телеграм '] || r['Telegram'] || '');

        rawList.push({
          type: 'partner',
          roleName: 'Партнер / Спонсор',
          fullName,
          firstName: fullName,
          lastName: '',
          organization: partnerName,
          phone,
          category: activity || 'Партнерство',
          instagram,
          telegram,
          sourceSheet: sheetName,
          qrGenerated: true,
          checkedIn: false,
          checkedInAt: null,
          accessDenied: false,
          accessDeniedAt: null
        });
      }
    }

    // 5. КОЛЕКТИВИ (Колективи)
    else if (normSheetName.includes('колектив')) {
      for (const r of rawRows) {
        const collectiveName = cleanStr(r['Назва колективу'] || r['Назва'] || 'Колектив');
        const leaderName = cleanStr(r['ПІБ Керівника'] || r['Хореограф'] || r['Керівник'] || '');
        const phone = normalizePhone(r['Контактний номер телефону керівника'] || r['Телефон']);
        const rawCount = parseInt(r['Кількість учасників'] || '1', 10) || 1;
        const count = Math.max(1, Math.min(rawCount, 50));
        const instagram = cleanStr(r['Сторінка Instagram колективу'] || '');
        const telegram = cleanStr(r['Імʼя користувача в телеграм керівника'] || '');

        // 1. Leader Ticket
        rawList.push({
          type: 'collective_member',
          roleName: 'Керівник колективу',
          fullName: leaderName ? `${leaderName} (${collectiveName})` : `Керівник — ${collectiveName}`,
          firstName: leaderName || 'Керівник',
          lastName: collectiveName,
          collectiveName,
          organization: collectiveName,
          memberIndex: 0,
          phone,
          category: 'Колектив',
          instagram,
          telegram,
          sourceSheet: sheetName,
          qrGenerated: true,
          checkedIn: false,
          checkedInAt: null,
          accessDenied: false,
          accessDeniedAt: null
        });

        // 2. Member Tickets
        for (let i = 1; i <= count; i++) {
          rawList.push({
            type: 'collective_member',
            roleName: 'Учасник колективу',
            fullName: `Учасник ${i} — ${collectiveName}`,
            firstName: `Учасник ${i}`,
            lastName: collectiveName,
            collectiveName,
            organization: collectiveName,
            memberIndex: i,
            phone,
            category: 'Колектив',
            sourceSheet: sheetName,
            qrGenerated: true,
            checkedIn: false,
            checkedInAt: null,
            accessDenied: false,
            accessDeniedAt: null
          });
        }
      }
    }

    // 6. ГОСТІ ТА ГЛЯДАЧІ (Гості)
    else if (normSheetName.includes('гост')) {
      for (const r of rawRows) {
        const fullName = cleanStr(r['Прізвище та Ім\'я'] || r['ПІБ'] || r['ПІБ гостя'] || r["Ім'я"]);
        if (!fullName) continue;

        const phone = normalizePhone(r['Контактний номер телефону'] || r['Телефон']);
        const telegram = cleanStr(r['Telegram'] || '');
        const instagram = cleanStr(r['Instagram'] || '');
        const reason = cleanStr(r['Як дізнались про нас?'] || 'Гість фестивалю');

        rawList.push({
          type: 'guest',
          roleName: 'Запрошений гість',
          fullName,
          firstName: fullName,
          lastName: '',
          organization: reason.slice(0, 45) || 'Гість події',
          phone,
          category: 'Гість',
          instagram,
          telegram,
          sourceSheet: sheetName,
          qrGenerated: true,
          checkedIn: false,
          checkedInAt: null,
          accessDenied: false,
          accessDeniedAt: null
        });
      }
    }
  }

  // --- SMART MERGE & DEDUPLICATION ---
  const mergedMap = new Map();

  for (const item of rawList) {
    const normName = normalizeName(item.fullName);
    if (!normName) continue;

    // Dedup key: by normalized full name (or collective member label)
    const key = item.type === 'collective_member' && item.memberIndex
      ? `collective:${item.collectiveName}:${item.memberIndex}`
      : normName;

    if (!mergedMap.has(key)) {
      mergedMap.set(key, { ...item, id: uuidv4() });
    } else {
      // Existing duplicate found: merge smartly
      const existing = mergedMap.get(key);
      const existingPrio = TYPE_PRIORITY[existing.type] || 0;
      const newPrio = TYPE_PRIORITY[item.type] || 0;

      // If new item has higher priority role (e.g. participant > guest), upgrade it
      if (newPrio > existingPrio) {
        mergedMap.set(key, {
          ...existing,
          ...item,
          id: existing.id,
          // Preserve organization / phone if richer
          organization: item.organization || existing.organization,
          phone: item.phone || existing.phone,
          parentName: item.parentName || existing.parentName,
          parentPhone: item.parentPhone || existing.parentPhone,
        });
      } else {
        // Keep existing, but fill missing fields from duplicate
        if (!existing.phone && item.phone) existing.phone = item.phone;
        if (!existing.school && item.school) existing.school = item.school;
        if (!existing.parentName && item.parentName) existing.parentName = item.parentName;
        if (!existing.parentPhone && item.parentPhone) existing.parentPhone = item.parentPhone;
      }
    }
  }

  return Array.from(mergedMap.values());
}

async function run() {
  console.log('Testing deduplication...');
  const deduplicated = await fetchAndParseDeduplicatedGoogleSheets();
  console.log('Clean unique attendees count:', deduplicated.length);

  const byType = {};
  for (const p of deduplicated) {
    byType[p.type] = (byType[p.type] || 0) + 1;
  }
  console.log('Deduplicated Breakdown:');
  console.table(byType);
}

run().catch(console.error);
