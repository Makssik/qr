import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_FILE = path.resolve(process.cwd(), 'server-db.json');
const AUTH_FILE = path.resolve(process.cwd(), 'auth-config.json');
const BACKUP_DIR = path.resolve(process.cwd(), 'backups');

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

      // Middleware handler
      server.middlewares.use((req, res, next) => {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token, Authorization');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        const url = req.url.split('?')[0];

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
                    // Full replace — used during clear operations
                    currentStore.participants = incoming.participants;
                  } else {
                    // Merge participants by ID (prefer checkedIn = true)
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
                    // Full replace — used during clear operations
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
    host: true, // Allow network access
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
