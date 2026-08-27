import QRCodeStyling from 'qr-code-styling';
import { signData } from '../utils/crypto.js';

/**
 * Generates signed JSON payload string for a participant.
 *
 * @param {object} participant - Participant object containing at least an id.
 * @returns {Promise<string>} Serialized JSON string with { id, v: 1, sig }.
 */
export async function generateQRData(participant) {
  if (!participant || participant.id === undefined || participant.id === null) {
    throw new Error('Participant with a valid id is required');
  }

  const idStr = String(participant.id);
  const sig = await signData(idStr);

  return JSON.stringify({
    id: idStr,
    v: 1,
    sig,
  });
}

/**
 * Creates a styled QRCodeStyling instance with customizable presets.
 *
 * @param {string} data - Content string to encode in QR code.
 * @param {object} [options={}] - Custom overrides for QRCodeStyling options.
 * @returns {QRCodeStyling} Configured QRCodeStyling instance.
 */
export function createStyledQR(data, options = {}) {
  const mergedOptions = {
    width: 300,
    height: 300,
    type: 'svg',
    data: data,
    margin: 14,
    qrOptions: {
      typeNumber: 0,
      mode: 'Byte',
      errorCorrectionLevel: 'M'
    },
    dotsOptions: {
      color: '#1e1b4b',
      type: 'rounded',
      ...(options.dotsOptions || {}),
    },
    cornersSquareOptions: {
      color: '#7C3AED',
      type: 'extra-rounded',
      ...(options.cornersSquareOptions || {}),
    },
    cornersDotOptions: {
      color: '#06B6D4',
      type: 'dot',
      ...(options.cornersDotOptions || {}),
    },
    backgroundOptions: {
      color: '#ffffff',
      ...(options.backgroundOptions || {}),
    },
    imageOptions: {
      crossOrigin: 'anonymous',
      margin: 8,
      ...(options.imageOptions || {}),
    },
    ...options,
  };

  const QRClass = QRCodeStyling?.default || QRCodeStyling;
  return new QRClass(mergedOptions);
}

/**
 * Combines payload generation and QR styling for a given participant.
 *
 * @param {object} participant - Participant object.
 * @param {object} [options={}] - Optional styling overrides.
 * @returns {Promise<{ qr: QRCodeStyling, data: string }>}
 */
export async function generateQRForParticipant(participant, options = {}) {
  const data = await generateQRData(participant);
  const qr = createStyledQR(data, options);
  return { qr, data };
}

/**
 * Parses and validates scanned QR data string.
 *
 * @param {string} text - Raw text from QR scanner.
 * @returns {{ id: string|number, v: number, sig: string } | null}
 */
export function parseQRData(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(text.trim());
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      parsed.id !== undefined &&
      parsed.id !== null &&
      parsed.sig !== undefined &&
      parsed.sig !== null
    ) {
      return {
        id: parsed.id,
        v: parsed.v !== undefined ? parsed.v : 1,
        sig: parsed.sig,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Returns formatted human-readable display name for an attendee.
 *
 * @param {object} participant - Attendee record.
 * @returns {string} Formatted name.
 */
export function getDisplayName(participant) {
  if (!participant || typeof participant !== 'object') {
    return 'Невідомий';
  }

  const firstName = (participant.firstName || participant.first_name || '').trim();
  const lastName = (participant.lastName || participant.last_name || '').trim();
  const collectiveName = (participant.collectiveName || participant.collective_name || '').trim();
  const memberIndex = participant.memberIndex ?? participant.member_index;
  const isCollectiveMember = participant.type === 'collective_member';

  if (
    isCollectiveMember &&
    memberIndex !== null &&
    memberIndex !== undefined &&
    Number(memberIndex) > 0
  ) {
    if (firstName && collectiveName) {
      return `${firstName} — ${collectiveName}`;
    }
    if (firstName) {
      return firstName;
    }
    if (collectiveName) {
      return collectiveName;
    }
    return 'Без імені';
  }

  // If fullName is directly available (e.g. ПІБ from single column), use it
  if (participant.fullName && typeof participant.fullName === 'string' && participant.fullName.trim()) {
    return participant.fullName.trim();
  }

  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (fullName) {
    return fullName;
  }

  if (collectiveName) {
    return collectiveName;
  }

  if (participant.name && typeof participant.name === 'string' && participant.name.trim()) {
    return participant.name.trim();
  }

  return 'Без імені';
}

/**
 * Returns localized label for participant type.
 *
 * @param {string} type - Participant type ('participant' | 'collective_member' | 'guest').
 * @returns {string} Localized label in Ukrainian.
 */
export function getTypeLabel(type) {
  switch (type) {
    case 'participant':
      return 'Учасник';
    case 'collective_member':
      return 'Колектив';
    case 'guest':
      return 'Гість';
    case 'designer':
      return 'Дизайнер';
    case 'sponsor':
      return 'Спонсор';
    case 'other':
      return 'Інше';
    default:
      return 'Учасник';
  }
}

/**
 * Returns CSS badge class for participant type.
 *
 * @param {string} type - Participant type ('participant' | 'collective_member' | 'guest' | 'designer' | 'sponsor' | 'other').
 * @returns {string} CSS class name.
 */
export function getTypeBadgeClass(type) {
  switch (type) {
    case 'participant':
      return 'badge-participant';
    case 'collective_member':
      return 'badge-collective';
    case 'guest':
      return 'badge-guest';
    case 'designer':
      return 'badge-designer';
    case 'sponsor':
      return 'badge-sponsor';
    case 'other':
      return 'badge-other';
    default:
      return 'badge-participant';
  }
}
