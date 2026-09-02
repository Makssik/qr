import fs from 'fs';
import path from 'path';
import { fetchAndParseGoogleSheets } from './test-gsheet-parse.mjs';

const DATA_FILE = path.resolve(process.cwd(), 'server-db.json');
const BACKUP_DIR = path.resolve(process.cwd(), 'backups');

async function importAll() {
  console.log('Downloading Google Sheet and parsing all 12 sheets...');
  const freshList = await fetchAndParseGoogleSheets();
  console.log(`Successfully parsed ${freshList.length} unique participants!`);

  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Backup current db if exists
  if (fs.existsSync(DATA_FILE)) {
    const oldDb = fs.readFileSync(DATA_FILE, 'utf-8');
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(BACKUP_DIR, `server-db-pre-gsheet-import-${dateStr}.json`), oldDb);
  }

  const newStore = {
    participants: freshList,
    scanLog: []
  };

  fs.writeFileSync(DATA_FILE, JSON.stringify(newStore, null, 2));
  console.log('Successfully written fresh dataset to server-db.json!');

  const byType = {};
  for (const p of freshList) {
    byType[p.type] = (byType[p.type] || 0) + 1;
  }
  console.log('Import Summary by Category:');
  console.table(byType);
}

importAll().catch(console.error);
