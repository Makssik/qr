import fs from 'fs';
import path from 'path';
import { fetchAndParseDeduplicatedGoogleSheets } from './test-deduplication.mjs';

const DATA_FILE = path.resolve(process.cwd(), 'server-db.json');
const BACKUP_DIR = path.resolve(process.cwd(), 'backups');

async function main() {
  console.log('Fetching Google Sheet with smart deduplication...');
  const cleanList = await fetchAndParseDeduplicatedGoogleSheets();
  console.log(`Deduplicated into exactly ${cleanList.length} unique attendees.`);

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Backup current db
  if (fs.existsSync(DATA_FILE)) {
    const oldDb = fs.readFileSync(DATA_FILE, 'utf-8');
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(BACKUP_DIR, `server-db-pre-dedup-${dateStr}.json`), oldDb);
  }

  const cleanStore = {
    participants: cleanList,
    scanLog: []
  };

  fs.writeFileSync(DATA_FILE, JSON.stringify(cleanStore, null, 2));
  console.log('Successfully saved deduplicated database to server-db.json!');
}

main().catch(console.error);
