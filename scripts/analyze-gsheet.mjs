import fs from 'fs';
import https from 'https';
import * as XLSX from 'xlsx';

const fileUrl = 'https://docs.google.com/spreadsheets/d/1XQwVCC4JoR1vuPOB3OcTzRi48B1mt1Vl2AnPj3Ft_R0/export?format=xlsx';

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

async function analyze() {
  console.log('Downloading Google Sheet as XLSX...');
  const buffer = await downloadFile(fileUrl);
  console.log('Downloaded bytes:', buffer.length);
  const wb = XLSX.read(buffer, { type: 'buffer' });
  console.log('\n=== ALL SHEET NAMES (' + wb.SheetNames.length + ') ===');
  console.log(JSON.stringify(wb.SheetNames, null, 2));

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    console.log('\n======================================================');
    console.log('SHEET:', name);
    console.log('Total Rows:', rows.length);
    if (rows.length > 0) {
      console.log('Headers (Row 0):', JSON.stringify(rows[0].slice(0, 15)));
      for (let i = 1; i <= Math.min(4, rows.length - 1); i++) {
        if (rows[i] && rows[i].some(cell => String(cell).trim() !== '')) {
          console.log(`Sample Row ${i}:`, JSON.stringify(rows[i].slice(0, 15)));
        }
      }
    }
  }
}

analyze().catch(err => console.error('Error analyzing:', err.message));
