import https from 'https';
import * as XLSX from 'xlsx';

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

async function run() {
  const buf = await downloadFile('https://docs.google.com/spreadsheets/d/1XQwVCC4JoR1vuPOB3OcTzRi48B1mt1Vl2AnPj3Ft_R0/export?format=xlsx');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets['Учасники'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log('Total rows in Учасники:', rows.length);
  console.log('Header Row 0:', rows[0]);
  let filled = 0;
  let empty = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const col5 = r[5]; // ПІБ учасника
    const col1 = r[1]; // ПІБ батьків
    const hasData = r.some(c => String(c).trim() !== '');
    if (!hasData) {
      empty++;
    } else {
      filled++;
      console.log(`Row ${i}: col5="${col5}", col1="${col1}", col6(phone)="${r[6]}"`);
    }
  }
  console.log('Filled rows:', filled, 'Empty rows:', empty);
}

run().catch(console.error);
