import QRCodeStyling from 'qr-code-styling';
import { signData } from '../utils/crypto.js';

/**
 * Category color schemes for QR code styling and badges
 */
export const CATEGORY_THEMES = {
  designer: {
    label: 'Дизайнер',
    icon: '👗',
    color: '#D97706',
    dotsColor: '#78350F',
    cornerSquareColor: '#D97706',
    cornerDotColor: '#F59E0B',
    badgeClass: 'badge-designer',
    bgLight: 'rgba(217, 119, 6, 0.15)',
    border: 'rgba(217, 119, 6, 0.4)'
  },
  jury: {
    label: 'Журі',
    icon: '⚖️',
    color: '#DC2626',
    dotsColor: '#881337',
    cornerSquareColor: '#DC2626',
    cornerDotColor: '#EF4444',
    badgeClass: 'badge-jury',
    bgLight: 'rgba(220, 38, 38, 0.15)',
    border: 'rgba(220, 38, 38, 0.4)'
  },
  photographer: {
    label: 'Фото / Відео',
    icon: '📸',
    color: '#0284C7',
    dotsColor: '#0C4A6E',
    cornerSquareColor: '#0284C7',
    cornerDotColor: '#38BDF8',
    badgeClass: 'badge-photographer',
    bgLight: 'rgba(2, 132, 199, 0.15)',
    border: 'rgba(2, 132, 199, 0.4)'
  },
  partner: {
    label: 'Партнер',
    icon: '🤝',
    color: '#EA580C',
    dotsColor: '#7C2D12',
    cornerSquareColor: '#EA580C',
    cornerDotColor: '#FB923C',
    badgeClass: 'badge-partner',
    bgLight: 'rgba(234, 88, 12, 0.15)',
    border: 'rgba(234, 88, 12, 0.4)'
  },
  guest: {
    label: 'Запрошений гість',
    icon: '🌟',
    color: '#059669',
    dotsColor: '#064E3B',
    cornerSquareColor: '#059669',
    cornerDotColor: '#10B981',
    badgeClass: 'badge-guest',
    bgLight: 'rgba(5, 150, 105, 0.15)',
    border: 'rgba(5, 150, 105, 0.4)'
  },
  collective_member: {
    label: 'Колектив',
    icon: '🌸',
    color: '#DB2777',
    dotsColor: '#831843',
    cornerSquareColor: '#DB2777',
    cornerDotColor: '#F472B6',
    badgeClass: 'badge-collective',
    bgLight: 'rgba(219, 39, 119, 0.15)',
    border: 'rgba(219, 39, 119, 0.4)'
  },
  participant: {
    label: 'Учасник / Модель',
    icon: '🟣',
    color: '#7C3AED',
    dotsColor: '#1E1B4B',
    cornerSquareColor: '#7C3AED',
    cornerDotColor: '#A78BFA',
    badgeClass: 'badge-participant',
    bgLight: 'rgba(124, 58, 237, 0.15)',
    border: 'rgba(124, 58, 237, 0.4)'
  }
};

/**
 * Returns category metadata by type string.
 */
export function getCategoryMeta(type) {
  const normType = String(type || 'participant').toLowerCase();
  return CATEGORY_THEMES[normType] || CATEGORY_THEMES.participant;
}

/**
 * Generates signed JSON payload string for a participant.
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
 * Creates a styled QRCodeStyling instance with category-specific colors.
 */
export function createStyledQR(data, options = {}, participant = null) {
  const theme = participant ? getCategoryMeta(participant.type) : CATEGORY_THEMES.participant;

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
      color: theme.dotsColor || '#1e1b4b',
      type: 'rounded',
      ...(options.dotsOptions || {}),
    },
    cornersSquareOptions: {
      color: theme.cornerSquareColor || '#7C3AED',
      type: 'extra-rounded',
      ...(options.cornersSquareOptions || {}),
    },
    cornersDotOptions: {
      color: theme.cornerDotColor || '#06B6D4',
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
 */
export async function generateQRForParticipant(participant, options = {}) {
  const data = await generateQRData(participant);
  const qr = createStyledQR(data, options, participant);
  return { qr, data };
}

/**
 * Parses and validates scanned QR data string.
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
 */
export function getDisplayName(participant) {
  if (!participant || typeof participant !== 'object') {
    return 'Невідомий';
  }

  if (participant.fullName && typeof participant.fullName === 'string' && participant.fullName.trim()) {
    return participant.fullName.trim();
  }

  const firstName = (participant.firstName || participant.first_name || '').trim();
  const lastName = (participant.lastName || participant.last_name || '').trim();
  const collectiveName = (participant.collectiveName || participant.collective_name || '').trim();
  const memberIndex = participant.memberIndex ?? participant.member_index;
  const isCollectiveMember = participant.type === 'collective_member';

  if (isCollectiveMember && memberIndex !== null && memberIndex !== undefined && Number(memberIndex) > 0) {
    if (firstName && collectiveName) return `${firstName} — ${collectiveName}`;
    if (firstName) return firstName;
    if (collectiveName) return collectiveName;
    return 'Учасник колективу';
  }

  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  if (collectiveName) return collectiveName;
  if (participant.name) return participant.name.trim();

  return 'Без імені';
}

/**
 * Returns localized label for participant type.
 */
export function getTypeLabel(type) {
  const meta = getCategoryMeta(type);
  return `${meta.icon} ${meta.label}`;
}

/**
 * Returns CSS badge class for participant type.
 */
export function getTypeBadgeClass(type) {
  const meta = getCategoryMeta(type);
  return meta.badgeClass;
}
