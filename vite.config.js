import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.resolve(process.cwd(), 'server-db.json');

function syncServerPlugin() {
  return {
    name: 'sync-server-plugin',
    configureServer(server) {
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

      const writeStore = (data) => {
        try {
          fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        } catch (e) {
          console.error('Error writing server-db.json:', e);
        }
      };

      server.middlewares.use('/api/sync', (req, res, next) => {
        // Set CORS headers so any phone/client can sync
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(readStore()));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const incoming = JSON.parse(body || '{}');
              const currentStore = readStore();

              if (Array.isArray(incoming.participants)) {
                if (incoming._clearParticipants) {
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
                      });
                    }
                  }
                  currentStore.participants = Array.from(pMap.values());
                }
              }

              if (Array.isArray(incoming.scanLog)) {
                if (incoming._clearScanLog) {
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
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
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
