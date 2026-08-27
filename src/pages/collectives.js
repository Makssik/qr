import { getParticipants } from '../data/store.js';
import { getDisplayName, getTypeLabel, getTypeBadgeClass } from '../data/qr-generator.js';

/**
 * Escapes HTML special characters.
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Groups participants with type 'collective_member' by collectiveName.
 * Returns an array of collective group objects sorted by name.
 */
function getCollectiveGroups(participants) {
  const groupMap = new Map();

  for (const p of participants) {
    if (p.type !== 'collective_member') continue;
    const name = p.collectiveName || p.collective_name || 'Без назви';

    if (!groupMap.has(name)) {
      groupMap.set(name, {
        name,
        choreographer: p.choreographer || '',
        phone: p.phone || '',
        email: p.email || '',
        category: p.category || '',
        members: [],
      });
    }

    const group = groupMap.get(name);
    group.members.push(p);

    // Update group meta from first member that has data
    if (!group.choreographer && p.choreographer) group.choreographer = p.choreographer;
    if (!group.phone && p.phone) group.phone = p.phone;
    if (!group.email && p.email) group.email = p.email;
    if (!group.category && p.category) group.category = p.category;
  }

  return Array.from(groupMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'uk'));
}

/**
 * Returns Ukrainian plural for "учасник".
 */
function getMembersWord(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'учасників';
  if (mod10 === 1) return 'учасник';
  if (mod10 >= 2 && mod10 <= 4) return 'учасники';
  return 'учасників';
}

/**
 * Renders the Collectives page.
 */
export async function renderCollectives(container) {
  const participants = await getParticipants();
  const groups = getCollectiveGroups(participants);

  if (groups.length === 0) {
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title page-title-gradient">🏫 Колективи</h1>
        <p class="page-subtitle">Групи та колективи учасників події</p>
      </div>
      <div class="empty-state">
        <span class="empty-state-icon">🏫</span>
        <h2 class="empty-state-title">Колективів ще немає</h2>
        <p class="empty-state-text">Імпортуйте дані з колективами або додайте учасників з типом «Член колективу».</p>
        <a href="#import" class="btn btn-primary">
          <span>📥</span>
          <span>Імпортувати дані</span>
        </a>
      </div>
    `;
    return null;
  }

  const totalMembers = groups.reduce((sum, g) => sum + g.members.length, 0);
  const totalCheckedIn = groups.reduce((sum, g) => sum + g.members.filter(m => m.checkedIn).length, 0);

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title page-title-gradient">🏫 Колективи</h1>
      <p class="page-subtitle">${groups.length} ${groups.length === 1 ? 'колектив' : 'колективів'} · ${totalMembers} ${getMembersWord(totalMembers)} · ${totalCheckedIn} відскановано</p>
    </div>

    <div class="collective-grid" id="collectiveGrid">
      ${groups.map((group) => {
        const checkedIn = group.members.filter(m => m.checkedIn).length;
        const total = group.members.length;
        const pct = total > 0 ? Math.round((checkedIn / total) * 100) : 0;
        const statusColor = pct === 100 ? 'var(--success)' : pct > 0 ? 'var(--warning)' : 'var(--text-tertiary)';

        return `
          <div class="collective-card" data-collective="${escapeHtml(group.name)}">
            <div class="collective-card-header">
              <span class="collective-card-icon">🏫</span>
              <h3 class="collective-card-name">${escapeHtml(group.name)}</h3>
            </div>
            ${group.choreographer ? `<div class="collective-card-meta"><span class="collective-meta-icon">👤</span> ${escapeHtml(group.choreographer)}</div>` : ''}
            ${group.category ? `<div class="collective-card-meta"><span class="collective-meta-icon">🏷️</span> ${escapeHtml(group.category)}</div>` : ''}
            ${group.phone ? `<div class="collective-card-meta"><span class="collective-meta-icon">📞</span> ${escapeHtml(group.phone)}</div>` : ''}
            <div class="collective-card-stats">
              <div class="collective-stat">
                <span class="collective-stat-number">${total}</span>
                <span class="collective-stat-label">${getMembersWord(total)}</span>
              </div>
              <div class="collective-stat">
                <span class="collective-stat-number" style="color: ${statusColor};">${checkedIn}</span>
                <span class="collective-stat-label">відскановано</span>
              </div>
            </div>
            <div class="collective-progress">
              <div class="progress-bar" style="height: 6px; border-radius: 3px; background: var(--bg-tertiary);">
                <div class="progress-fill" style="width: ${pct}%; height: 100%; border-radius: 3px; background: ${statusColor}; transition: width 0.6s ease;"></div>
              </div>
              <span class="collective-pct" style="color: ${statusColor};">${pct}%</span>
            </div>
            <div class="collective-card-action">
              <span>Детальніше →</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div id="collectiveDetail" style="display: none;"></div>
  `;

  // Handle card click → show detail
  const grid = container.querySelector('#collectiveGrid');
  const detailContainer = container.querySelector('#collectiveDetail');

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.collective-card');
    if (!card) return;

    const collectiveName = card.dataset.collective;
    const group = groups.find(g => g.name === collectiveName);
    if (!group) return;

    showCollectiveDetail(group, detailContainer, grid);
  });

  return null;
}

/**
 * Shows detailed view for a single collective.
 */
function showCollectiveDetail(group, detailContainer, grid) {
  grid.style.display = 'none';
  detailContainer.style.display = 'block';

  const checkedIn = group.members.filter(m => m.checkedIn).length;
  const total = group.members.length;
  const pct = total > 0 ? Math.round((checkedIn / total) * 100) : 0;

  // Sort: choreographer/leader first (memberIndex === 0), then by memberIndex
  const sorted = [...group.members].sort((a, b) => {
    if (a.memberIndex === 0 && b.memberIndex !== 0) return -1;
    if (b.memberIndex === 0 && a.memberIndex !== 0) return 1;
    return (a.memberIndex || 0) - (b.memberIndex || 0);
  });

  detailContainer.innerHTML = `
    <button type="button" class="btn btn-secondary" id="backToCollectives" style="margin-bottom: var(--space-4);">
      <span>←</span>
      <span>Назад до колективів</span>
    </button>

    <div class="card" style="margin-bottom: var(--space-5);">
      <div style="display: flex; align-items: center; gap: var(--space-4); margin-bottom: var(--space-4); flex-wrap: wrap;">
        <div style="font-size: 2.5rem;">🏫</div>
        <div style="flex: 1; min-width: 200px;">
          <h2 style="font-size: var(--font-size-2xl); font-weight: 700; color: var(--text-primary); margin: 0 0 var(--space-1) 0;">${escapeHtml(group.name)}</h2>
          <span class="badge badge-collective">Колектив</span>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-4);">
        ${group.choreographer ? `
        <div class="collective-info-item">
          <span class="collective-info-label">👤 Хореограф / Керівник</span>
          <span class="collective-info-value">${escapeHtml(group.choreographer)}</span>
        </div>` : ''}
        ${group.category ? `
        <div class="collective-info-item">
          <span class="collective-info-label">🏷️ Категорія</span>
          <span class="collective-info-value">${escapeHtml(group.category)}</span>
        </div>` : ''}
        ${group.phone ? `
        <div class="collective-info-item">
          <span class="collective-info-label">📞 Телефон</span>
          <span class="collective-info-value">${escapeHtml(group.phone)}</span>
        </div>` : ''}
        ${group.email ? `
        <div class="collective-info-item">
          <span class="collective-info-label">✉️ Email</span>
          <span class="collective-info-value">${escapeHtml(group.email)}</span>
        </div>` : ''}
        <div class="collective-info-item">
          <span class="collective-info-label">👥 Кількість учасників</span>
          <span class="collective-info-value">${total} ${getMembersWord(total)}</span>
        </div>
        <div class="collective-info-item">
          <span class="collective-info-label">✅ Відскановано</span>
          <span class="collective-info-value">${checkedIn} з ${total} (${pct}%)</span>
        </div>
      </div>

      <div style="margin-bottom: var(--space-2);">
        <div class="progress-bar" style="height: 8px; border-radius: 4px; background: var(--bg-tertiary);">
          <div class="progress-fill" style="width: ${pct}%; height: 100%; border-radius: 4px; background: ${pct === 100 ? 'var(--success)' : 'var(--accent-primary)'}; transition: width 0.6s ease;"></div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 style="font-size: var(--font-size-lg); font-weight: 700; margin-bottom: var(--space-4); color: var(--text-primary);">
        Учасники колективу
      </h3>

      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 50px;">#</th>
              <th>Ім'я</th>
              <th>Роль</th>
              <th>Категорія</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((m, i) => {
              const name = escapeHtml(getDisplayName(m));
              const isLeader = m.memberIndex === 0;
              const isChecked = Boolean(m.checkedIn);
              const statusHtml = isChecked
                ? `<span class="status-dot status-dot-success"></span>Відскановано`
                : `<span class="status-dot status-dot-pending"></span>Очікує`;
              const roleLabel = isLeader ? '⭐ Керівник' : `Учасник ${m.memberIndex || ''}`;

              return `
                <tr>
                  <td style="color: var(--text-tertiary); font-weight: 500;">${i + 1}</td>
                  <td style="font-weight: 600; color: var(--text-primary);">${name}</td>
                  <td>${roleLabel}</td>
                  <td>${escapeHtml(m.category || '—')}</td>
                  <td>${statusHtml}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Back button
  detailContainer.querySelector('#backToCollectives').addEventListener('click', () => {
    detailContainer.style.display = 'none';
    grid.style.display = '';
  });
}
