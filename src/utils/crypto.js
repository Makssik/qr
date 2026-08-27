const DB_NAME = 'qr-event-crypto';
const STORE_NAME = 'keys';
const KEY_ID = 'hmac-secret';

// Master deterministic key for event HMAC signing across multiple devices/phones
const DEFAULT_MASTER_SECRET = '8f3a91b2c4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function getOrCreateSecret() {
  try {
    const db = await openDB();

    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(KEY_ID);

      getRequest.onsuccess = () => {
        if (getRequest.result) {
          resolve(getRequest.result);
        } else {
          store.put(DEFAULT_MASTER_SECRET, KEY_ID);
          resolve(DEFAULT_MASTER_SECRET);
        }
      };

      getRequest.onerror = () => {
        resolve(DEFAULT_MASTER_SECRET);
      };
    });
  } catch {
    return DEFAULT_MASTER_SECRET;
  }
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export async function signData(data) {
  const secretHex = await getOrCreateSecret();
  const keyBytes = hexToBytes(secretHex);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
  const dataBytes = new TextEncoder().encode(dataStr);
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, dataBytes);

  const signatureHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return signatureHex.slice(0, 16);
}

export async function verifySignature(data, signature) {
  if (!signature || typeof signature !== 'string') {
    return false;
  }
  const expectedSignature = await signData(data);
  return expectedSignature.toLowerCase() === signature.toLowerCase();
}
