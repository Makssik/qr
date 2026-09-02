import { get, set, del, clear } from 'idb-keyval';
import { fetchWithAuth, isAuthenticated } from './auth.js';

const PARTICIPANTS_KEY = 'participants';
const SCAN_LOG_KEY = 'scanLog';

function normalizeName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/[«»"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper to push state to server /api/sync
async function pushToServer(participants, scanLog, flags = {}) {
  if (!isAuthenticated()) return;

  try {
    const payload = { ...flags };
    if (participants !== null && participants !== undefined) payload.participants = participants;
    if (scanLog !== null && scanLog !== undefined) payload.scanLog = scanLog;

    await fetchWithAuth('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.debug('Background sync push skipped:', e.message);
  }
}

// Helper to pull state from server /api/sync and synchronize IndexedDB with authoritative server state
export async function syncWithServer() {
  if (!isAuthenticated()) return;

  try {
    const res = await fetchWithAuth('/api/sync');
    if (!res.ok) return;

    const serverData = await res.json();
    const localParticipants = (await get(PARTICIPANTS_KEY)) || [];
    const localScanLog = (await get(SCAN_LOG_KEY)) || [];

    // The Server is the authoritative source for list of participants
    if (Array.isArray(serverData.participants) && serverData.participants.length > 0) {
      const localCheckInMap = new Map();
      for (const p of localParticipants) {
        if (p.checkedIn) {
          localCheckInMap.set(String(p.id), {
            checkedIn: true,
            checkedInAt: p.checkedInAt
          });
          const norm = normalizeName(p.fullName);
          if (norm) {
            localCheckInMap.set(norm, {
              checkedIn: true,
              checkedInAt: p.checkedInAt
            });
          }
        }
      }

      // Synchronize with server list, carrying over check-in marks
      const syncedList = serverData.participants.map((serverP) => {
        const checkInByDb = localCheckInMap.get(String(serverP.id)) || localCheckInMap.get(normalizeName(serverP.fullName));
        if (checkInByDb && !serverP.checkedIn) {
          return {
            ...serverP,
            checkedIn: true,
            checkedInAt: checkInByDb.checkedInAt || new Date().toISOString()
          };
        }
        return serverP;
      });

      // Deduplicate by name
      const uniqueMap = new Map();
      for (const p of syncedList) {
        const key = p.type === 'collective_member' && p.memberIndex
          ? `collective:${p.collectiveName}:${p.memberIndex}`
          : normalizeName(p.fullName);
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, p);
        }
      }

      const finalList = Array.from(uniqueMap.values());
      await set(PARTICIPANTS_KEY, finalList);
    }

    // Merge scan logs
    if (Array.isArray(serverData.scanLog)) {
      const logMap = new Map();
      for (const l of localScanLog) logMap.set(String(l.id), l);
      for (const l of serverData.scanLog) logMap.set(String(l.id), l);

      const mergedLog = Array.from(logMap.values()).sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );
      await set(SCAN_LOG_KEY, mergedLog);
    }
  } catch (e) {
    console.debug('Background sync pull skipped:', e.message);
  }
}

// Auto-sync timer (every 4 seconds)
let syncInterval = null;
if (typeof window !== 'undefined') {
  syncWithServer();
  syncInterval = setInterval(() => {
    syncWithServer();
  }, 4000);
}

export async function getParticipants() {
  await syncWithServer();
  const participants = await get(PARTICIPANTS_KEY);
  if (!Array.isArray(participants)) return [];

  // Deduplication guard
  const uniqueMap = new Map();
  for (const p of participants) {
    const key = p.type === 'collective_member' && p.memberIndex
      ? `collective:${p.collectiveName}:${p.memberIndex}`
      : normalizeName(p.fullName);
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, p);
    }
  }

  return Array.from(uniqueMap.values());
}

export async function setParticipants(participants) {
  const list = Array.isArray(participants) ? participants : [];
  await set(PARTICIPANTS_KEY, list);
  pushToServer(list, null);
  return list;
}

export async function addParticipants(newParticipants) {
  const existing = (await get(PARTICIPANTS_KEY)) || [];
  const existingNames = new Set(existing.map((p) => normalizeName(p.fullName)));
  const incoming = Array.isArray(newParticipants) ? newParticipants : [newParticipants];
  const toAdd = incoming.filter((p) => p && !existingNames.has(normalizeName(p.fullName)));
  const merged = [...existing, ...toAdd];
  await set(PARTICIPANTS_KEY, merged);
  pushToServer(merged, null);
  return merged;
}

export async function getParticipantById(id) {
  const participants = await getParticipants();
  return participants.find((p) => String(p.id) === String(id)) || null;
}

export async function updateParticipant(id, updates) {
  const participants = await getParticipants();
  const index = participants.findIndex((p) => String(p.id) === String(id));
  if (index === -1) {
    return null;
  }
  const updated = { ...participants[index], ...updates };
  participants[index] = updated;
  await set(PARTICIPANTS_KEY, participants);
  pushToServer(participants, null);
  return updated;
}

export async function clearParticipants() {
  await del(PARTICIPANTS_KEY);
  pushToServer([], null);
}

export async function getScanLog() {
  await syncWithServer();
  const log = await get(SCAN_LOG_KEY);
  return Array.isArray(log) ? log : [];
}

export async function addScanEntry(entry) {
  const log = await getScanLog();
  const scanEntry = {
    id: entry?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `scan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
    participantId: entry?.participantId ?? '',
    name: entry?.name ?? '',
    type: entry?.type ?? '',
    status: entry?.status ?? '',
    timestamp: entry?.timestamp ?? new Date().toISOString(),
    ...entry,
  };
  const updatedLog = [scanEntry, ...log];
  await set(SCAN_LOG_KEY, updatedLog);
  pushToServer(null, updatedLog);
  return scanEntry;
}

export async function clearScanLog() {
  await del(SCAN_LOG_KEY);
  await pushToServer(null, [], { _clearScanLog: true });
}

export async function clearAllData() {
  await clear();
  await pushToServer([], [], { _clearScanLog: true, _clearParticipants: true });
}

export async function getStats() {
  const participants = await getParticipants();
  const total = participants.length;
  let participantCount = 0;
  let collectiveMembersCount = 0;
  let guestCount = 0;
  let checkedInCount = 0;
  let qrGeneratedCount = 0;

  for (const p of participants) {
    if (p.type === 'participant') {
      participantCount++;
    } else if (p.type === 'collective_member') {
      collectiveMembersCount++;
    } else if (p.type === 'guest') {
      guestCount++;
    }

    if (p.checkedIn) {
      checkedInCount++;
    }
    if (p.qrGenerated) {
      qrGeneratedCount++;
    }
  }

  return {
    total,
    participants: participantCount,
    collectiveMembers: collectiveMembersCount,
    guests: guestCount,
    checkedIn: checkedInCount,
    qrGenerated: qrGeneratedCount,
  };
}
