import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import * as XLSX from 'xlsx';

const DATA_FILE = path.resolve(process.cwd(), 'server-db.json');
const AUTH_FILE = path.resolve(process.cwd(), 'auth-config.json');
const BACKUP_DIR = path.resolve(process.cwd(), 'backups');
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1XQwVCC4JoR1vuPOB3OcTzRi48B1mt1Vl2AnPj3Ft_R0/export?format=xlsx';

let lastGSheetSyncTime = null;
let isSyncingGSheets = false;

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

export async function parseGoogleSheetWorkbook(buffer) {
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

        const isContest = participation.toLowerCase().includes('конкурс') || normSheetName.includes('конкурс');
        const roleName = isContest ? 'Учасник конкурсу' : 'Учасник показу';

        participants.push({
          id: `part-${crypto.randomBytes(8).toString('hex')}`,
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

    // 2. ДИЗАЙНЕРИ (Дизайнери, Заявки на участь дизайнери)
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

        participants.push({
          id: `des-${crypto.randomBytes(8).toString('hex')}`,
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

        participants.push({
          id: `photo-${crypto.randomBytes(8).toString('hex')}`,
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
          id: `partn-${crypto.randomBytes(8).toString('hex')}`,
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
          id: `col-lead-${crypto.randomBytes(8).toString('hex')}`,
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
            id: `col-${crypto.randomBytes(8).toString('hex')}`,
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
          id: `guest-${crypto.randomBytes(8).toString('hex')}`,
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

  // Deduplication by full name + type
  const uniqueMap = new Map();
  for (const p of participants) {
    const key = `${p.type}:${p.fullName.toLowerCase().replace(/\s+/g, ' ')}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, p);
    }
  }

  return Array.from(uniqueMap.values());
}

function syncServerPlugin() {
  return {
    name: 'sync-server-plugin',
    configureServer(server) {
      // Ensure backup directory exists
      if (!fs.existsSync(BACKUP_DIR)) {
        try {
          fs.mkdirSync(BACKUP_DIR, { recursive: true });
        } catch (e) {
          console.error('Error creating backups dir:', e);
        }
      }

      // Read or initialize Auth Config
      const readAuthConfig = () => {
        try {
          if (fs.existsSync(AUTH_FILE)) {
            return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
          }
        } catch (e) {
          console.error('Error reading auth-config.json:', e);
        }
        const defaultConfig = {
          adminPassword: 'admin',
          scannerPin: '1234',
          sessions: {}
        };
        try {
          fs.writeFileSync(AUTH_FILE, JSON.stringify(defaultConfig, null, 2));
        } catch (e) {
          console.error('Error creating auth-config.json:', e);
        }
        return defaultConfig;
      };

      const writeAuthConfig = (config) => {
        try {
          fs.writeFileSync(AUTH_FILE, JSON.stringify(config, null, 2));
        } catch (e) {
          console.error('Error writing auth-config.json:', e);
        }
      };

      // Read Store
      const readStore = () => {
        try {
          if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
          }
        } catch (e) {
          console.error('Error reading server-db.json:', e);
        }
        return { participants: [], scanLog: [] };
      };

      // Write Store with Auto-Backup
      const writeStore = (data) => {
        try {
          fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

          // Save timestamped backup
          if (fs.existsSync(BACKUP_DIR)) {
            const now = new Date();
            const dateStr = now.toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(BACKUP_DIR, `server-db-${dateStr}.json`);
            fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));

            // Clean old backups (keep last 50)
            const backupFiles = fs.readdirSync(BACKUP_DIR)
              .filter(f => f.startsWith('server-db-') && f.endsWith('.json'))
              .sort();
            if (backupFiles.length > 50) {
              const toDelete = backupFiles.slice(0, backupFiles.length - 50);
              for (const df of toDelete) {
                try {
                  fs.unlinkSync(path.join(BACKUP_DIR, df));
                } catch {}
              }
            }
          }
        } catch (e) {
          console.error('Error writing server-db.json:', e);
        }
      };

      // Google Sheets Fetch & Merge
      const syncGoogleSheetsInternal = async (forceReset = false) => {
        if (isSyncingGSheets) return { status: 'already_syncing' };
        isSyncingGSheets = true;
        try {
          console.log('[GSheets Sync] Downloading Google Sheet...');
          const buffer = await downloadFile(GOOGLE_SHEET_URL);
          const freshList = await parseGoogleSheetWorkbook(buffer);
          const currentStore = readStore();

          let resultParticipants = [];

          if (forceReset || !currentStore.participants || currentStore.participants.length === 0) {
            // Fresh import: set fresh list, reset scan log
            resultParticipants = freshList;
            currentStore.participants = resultParticipants;
            if (forceReset) currentStore.scanLog = [];
          } else {
            // Smart Merge: Preserve checkedIn status and existing IDs
            const existingByName = new Map();
            const existingById = new Map();

            for (const p of currentStore.participants) {
              const nameKey = `${p.type}:${(p.fullName || '').toLowerCase().replace(/\s+/g, ' ')}`;
              existingByName.set(nameKey, p);
              existingById.set(String(p.id), p);
            }

            for (const freshP of freshList) {
              const nameKey = `${freshP.type}:${(freshP.fullName || '').toLowerCase().replace(/\s+/g, ' ')}`;
              const existing = existingByName.get(nameKey);

              if (existing) {
                // Update info, preserve status & ID
                resultParticipants.push({
                  ...freshP,
                  id: existing.id,
                  checkedIn: existing.checkedIn || false,
                  checkedInAt: existing.checkedInAt || null,
                  accessDenied: existing.accessDenied || false,
                  accessDeniedAt: existing.accessDeniedAt || null
                });
                existingByName.delete(nameKey);
              } else {
                // New participant
                resultParticipants.push(freshP);
              }
            }

            // Keep any manual local participants not in Google Sheet
            for (const manualP of existingByName.values()) {
              if (manualP.sourceSheet === undefined) {
                resultParticipants.push(manualP);
              }
            }

            currentStore.participants = resultParticipants;
          }

          writeStore(currentStore);
          lastGSheetSyncTime = new Date().toISOString();
          console.log(`[GSheets Sync] Success! Total participants: ${resultParticipants.length}`);

          return {
            success: true,
            totalCount: resultParticipants.length,
            lastSyncedAt: lastGSheetSyncTime
          };
        } catch (err) {
          console.error('[GSheets Sync] Error:', err.message);
          return { success: false, error: err.message };
        } finally {
          isSyncingGSheets = false;
        }
      };

      // Helper to validate token from request header
      const authenticateRequest = (req) => {
        const token = req.headers['x-auth-token'] || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
        if (!token) return null;

        const auth = readAuthConfig();
        const session = auth.sessions?.[token];
        if (!session) return null;

        if (session.expiresAt && Date.now() > session.expiresAt) {
          delete auth.sessions[token];
          writeAuthConfig(auth);
          return null;
        }

        return { token, role: session.role };
      };

      // Periodic Google Sheets Sync (Every 2 minutes)
      const gsheetInterval = setInterval(() => {
        syncGoogleSheetsInternal(false);
      }, 2 * 60 * 1000);

      // Perform initial sync on server startup if database is empty
      setTimeout(() => {
        const s = readStore();
        if (!s.participants || s.participants.length <= 43) {
          syncGoogleSheetsInternal(true);
        }
      }, 1000);

      // Middleware handler
      server.middlewares.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token, Authorization');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        const url = req.url.split('?')[0];

        // --- GOOGLE SHEETS SYNC ENDPOINT ---
        if (url === '/api/sync/google-sheets' && (req.method === 'POST' || req.method === 'GET')) {
          const authResult = authenticateRequest(req);
          if (!authResult) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Потрібна авторизація' }));
            return;
          }

          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ lastSyncedAt: lastGSheetSyncTime }));
            return;
          }

          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            const { forceReset } = JSON.parse(body || '{}');
            const result = await syncGoogleSheetsInternal(Boolean(forceReset));
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          });
          return;
        }

        // --- AUTH API: LOGIN ---
        if (url === '/api/auth/login' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { password, pin } = JSON.parse(body || '{}');
              const auth = readAuthConfig();
              let role = null;

              if (password && String(password).trim() === String(auth.adminPassword).trim()) {
                role = 'admin';
              } else if (pin && String(pin).trim() === String(auth.scannerPin).trim()) {
                role = 'scanner';
              }

              if (!role) {
                res.statusCode = 401;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Невірний пароль або PIN-код' }));
                return;
              }

              const token = `${role}_${crypto.randomBytes(24).toString('hex')}`;
              const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

              auth.sessions = auth.sessions || {};
              auth.sessions[token] = {
                role,
                createdAt: Date.now(),
                expiresAt
              };
              writeAuthConfig(auth);

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ token, role, expiresAt }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // --- AUTH API: CHECK SESSION ---
        if (url === '/api/auth/check' && req.method === 'GET') {
          const authResult = authenticateRequest(req);
          if (!authResult) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ authenticated: false }));
            return;
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ authenticated: true, role: authResult.role }));
          return;
        }

        // --- AUTH API: UPDATE PASSWORDS (ADMIN ONLY) ---
        if (url === '/api/auth/update-passwords' && req.method === 'POST') {
          const authResult = authenticateRequest(req);
          if (!authResult || authResult.role !== 'admin') {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Доступ лише для адміністратора' }));
            return;
          }

          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { newAdminPassword, newScannerPin } = JSON.parse(body || '{}');
              const auth = readAuthConfig();

              if (newAdminPassword && String(newAdminPassword).trim().length >= 4) {
                auth.adminPassword = String(newAdminPassword).trim();
              }
              if (newScannerPin && String(newScannerPin).trim().length >= 4) {
                auth.scannerPin = String(newScannerPin).trim();
              }

              writeAuthConfig(auth);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, message: 'Паролі успішно оновлено' }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // --- SYNC API: GET / POST ---
        if (url === '/api/sync') {
          const authResult = authenticateRequest(req);
          if (!authResult) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Неавторизований доступ. Увійдіть у систему.' }));
            return;
          }

          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(readStore()));
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const incoming = JSON.parse(body || '{}');
                const currentStore = readStore();

                // Scanner role protection against clearing DB
                if (authResult.role === 'scanner' && (incoming._clearParticipants || incoming._clearScanLog)) {
                  res.statusCode = 403;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Контролер не має прав на очищення бази даних' }));
                  return;
                }

                if (Array.isArray(incoming.participants)) {
                  if (incoming._clearParticipants && authResult.role === 'admin') {
                    currentStore.participants = incoming.participants;
                  } else {
                    const pMap = new Map();
                    for (const p of currentStore.participants) pMap.set(String(p.id), p);
                    for (const p of incoming.participants) {
                      const existing = pMap.get(String(p.id));
                      if (!existing) {
                        pMap.set(String(p.id), p);
                      } else {
                        pMap.set(String(p.id), {
                          ...existing,
                          ...p,
                          checkedIn: existing.checkedIn || p.checkedIn,
                          checkedInAt: existing.checkedInAt || p.checkedInAt,
                          accessDenied: p.accessDenied !== undefined ? p.accessDenied : existing.accessDenied,
                          accessDeniedAt: p.accessDeniedAt !== undefined ? p.accessDeniedAt : existing.accessDeniedAt,
                        });
                      }
                    }
                    currentStore.participants = Array.from(pMap.values());
                  }
                }

                if (Array.isArray(incoming.scanLog)) {
                  if (incoming._clearScanLog && authResult.role === 'admin') {
                    currentStore.scanLog = incoming.scanLog;
                  } else {
                    const logMap = new Map();
                    for (const l of currentStore.scanLog) logMap.set(String(l.id), l);
                    for (const l of incoming.scanLog) logMap.set(String(l.id), l);
                    currentStore.scanLog = Array.from(logMap.values());
                  }
                }

                writeStore(currentStore);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(currentStore));
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [
    basicSsl(),
    syncServerPlugin()
  ],
  server: {
    host: true,
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
