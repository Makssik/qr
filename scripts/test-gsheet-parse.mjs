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

function normalizePhone(phone) {
  if (!phone) return '';
  let str = String(phone).trim().replace(/[^\d+]/g, '');
  if (str.startsWith('80') && str.length === 11) str = '+3' + str;
  if (str.startsWith('0') && str.length === 10) str = '+38' + str;
  if (str.startsWith('380') && !str.startsWith('+')) str = '+' + str;
  return str;
}

export async function fetchAndParseGoogleSheets() {
  const buffer = await downloadFile(GOOGLE_SHEET_URL);
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const participants = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const normSheetName = sheetName.trim().toLowerCase();

    // 1. УЧАСНИКИ / МОДЕЛІ (Учасники, Учасники конкурс, Відеовізитівка)
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

        participants.push({
          id: uuidv4(),
          type: 'participant',
          roleName: participation.includes('Конкурс') ? 'Конкурс' : 'Учасник / Модель',
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

    // 2. ДИЗАЙНЕРИ (Дизайнери, Заявки на участь дизайнери)
    else if (normSheetName.includes('дизайн')) {
      for (const r of rawRows) {
        const fullName = cleanStr(r['ПІБ кандидата'] || r['ПІБ'] || r['ПІБ учасника']);
        if (!fullName) continue;

        const phone = normalizePhone(r['Контактний номер телефону кандидата'] || r['Телефон'] || r['Контактний номер телефону']);
        const desc = cleanStr(r['Короткий опис, що представляєте, основний напрям. Коротко, 1-3 речення'] || '');
        const brandMatch = desc.match(/бренд[у|а]?\s+([a-zA-Z0-9_\s"'-]+)/i) || desc.match(/["«]([^"»]+)["»]/);
        const brandName = brandMatch ? brandMatch[1] : (desc.slice(0, 40) || 'Дизайнерський бренд');
        const instagram = cleanStr(r['Сторінка в інстаграм'] || r['Instagram'] || '');
        const telegram = cleanStr(r['Імʼя користувача в телеграм '] || r['Telegram'] || '');
        const nomination = cleanStr(r['Категорія в якій номінуєтесь'] || 'Дизайнер');

        participants.push({
          id: uuidv4(),
          type: 'designer',
          roleName: 'Дизайнер',
          fullName,
          firstName: fullName,
          lastName: '',
          organization: brandName || 'Дизайн-студія',
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

        participants.push({
          id: uuidv4(),
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

        participants.push({
          id: uuidv4(),
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
        participants.push({
          id: uuidv4(),
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
          participants.push({
            id: uuidv4(),
            type: 'collective_member',
            roleName: 'Член колективу',
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

    // 6. ГОСТІ ТА ГЛЯДАЧІ (Гості, Ответы на форму (9))
    else if (normSheetName.includes('гост') || normSheetName.includes('ответы')) {
      for (const r of rawRows) {
        const fullName = cleanStr(r['Прізвище та Ім\'я'] || r['ПІБ'] || r['ПІБ гостя'] || r["Ім'я"]);
        if (!fullName) continue;

        const phone = normalizePhone(r['Контактний номер телефону'] || r['Телефон']);
        const telegram = cleanStr(r['Telegram'] || '');
        const instagram = cleanStr(r['Instagram'] || '');
        const reason = cleanStr(r['Як дізнались про нас?'] || 'Гість фестивалю');

        participants.push({
          id: uuidv4(),
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

  // Deduplication by full name + sheet category (so different children with same phone get distinct tickets)
  const uniqueMap = new Map();
  for (const p of participants) {
    const key = `${p.type}:${p.fullName.toLowerCase().replace(/\s+/g, ' ')}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, p);
    }
  }

  return Array.from(uniqueMap.values());
}

async function run() {
  console.log('Fetching and parsing Google Sheets...');
  const results = await fetchAndParseGoogleSheets();
  console.log('Total unique participants parsed:', results.length);

  const byType = {};
  for (const p of results) {
    byType[p.type] = (byType[p.type] || 0) + 1;
  }
  console.log('Breakdown by category:', byType);
}

run().catch(console.error);
