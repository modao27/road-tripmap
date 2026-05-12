import {
  listRoadtrips, createRoadtrip, deleteRoadtrip, duplicateRoadtrip, getRoadtripSummary,
} from './storageService.js';

// ── Couleurs de couverture des cards ─────────────────────────────────────────
const COVER_GRADIENTS = [
  'linear-gradient(135deg, #1f5f43 0%, #2f8a60 100%)',
  'linear-gradient(135deg, #2477a6 0%, #3a9fd4 100%)',
  'linear-gradient(135deg, #6f513f 0%, #a07858 100%)',
  'linear-gradient(135deg, #605d80 0%, #8a87b0 100%)',
  'linear-gradient(135deg, #912d2d 0%, #c45050 100%)',
  'linear-gradient(135deg, #2f6f36 0%, #4aac56 100%)',
];

function coverGradient(index) {
  return COVER_GRADIENTS[index % COVER_GRADIENTS.length];
}

function relativeDate(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "aujourd'hui";
  if (d === 1) return 'hier';
  if (d < 7)  return `il y a ${d} jours`;
  if (d < 30) return `il y a ${Math.floor(d / 7)} sem.`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Rendu de la grille ────────────────────────────────────────────────────────

function renderGrid() {
  const trips   = listRoadtrips();
  const grid    = document.getElementById('tripGrid');
  const empty   = document.getElementById('emptyState');

  if (!trips.length) {
    grid.innerHTML  = '';
    empty.hidden    = false;
    return;
  }
  empty.hidden = true;

  grid.innerHTML = trips.map((trip, i) => {
    const { pinCount, stepCount } = getRoadtripSummary(trip.id);
    return `
      <article class="trip-card" data-id="${trip.id}">
        <div class="trip-cover" style="background:${coverGradient(i)}" aria-hidden="true">
          <span class="trip-cover-icon">🗺️</span>
        </div>
        <div class="trip-body">
          <h2 class="trip-name">${trip.title}</h2>
          ${trip.description ? `<p class="trip-desc">${trip.description}</p>` : ''}
          <div class="trip-meta">
            ${pinCount  ? `<span>📍 ${pinCount} pin${pinCount > 1 ? 's' : ''}</span>` : ''}
            ${stepCount ? `<span>🗺 ${stepCount} étape${stepCount > 1 ? 's' : ''}</span>` : ''}
            <span class="trip-date">modifié ${relativeDate(trip.updatedAt)}</span>
          </div>
        </div>
        <div class="trip-actions">
          <a class="btn-open" href="map.html?id=${trip.id}">Ouvrir →</a>
          <button class="btn-icon" data-action="duplicate" data-id="${trip.id}" title="Dupliquer">⧉</button>
          <button class="btn-icon btn-icon--danger" data-action="delete" data-id="${trip.id}" title="Supprimer">✕</button>
        </div>
      </article>
    `;
  }).join('');
}

// ── Modale nouveau road trip ──────────────────────────────────────────────────

function openNewModal() {
  document.getElementById('newTripName').value = '';
  document.getElementById('newTripDesc').value = '';
  document.getElementById('newTripBackdrop').hidden = false;
  document.getElementById('newTripName').focus();
}

function closeNewModal() {
  document.getElementById('newTripBackdrop').hidden = true;
}

function confirmNew() {
  const title = document.getElementById('newTripName').value.trim();
  if (!title) { document.getElementById('newTripName').focus(); return; }
  const desc  = document.getElementById('newTripDesc').value.trim();
  const trip  = createRoadtrip({ title, description: desc });
  closeNewModal();
  window.location.href = `map.html?id=${trip.id}`;
}

// ── Modale suppression ────────────────────────────────────────────────────────

let pendingDeleteId = null;

function openDeleteModal(id) {
  pendingDeleteId = id;
  document.getElementById('deleteTripBackdrop').hidden = false;
}

function closeDeleteModal() {
  pendingDeleteId = null;
  document.getElementById('deleteTripBackdrop').hidden = true;
}

function confirmDelete() {
  if (!pendingDeleteId) return;
  deleteRoadtrip(pendingDeleteId);
  closeDeleteModal();
  renderGrid();
}

// ── Délégation des actions sur les cards ─────────────────────────────────────

document.getElementById('tripGrid').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'delete')    openDeleteModal(id);
  if (action === 'duplicate') { duplicateRoadtrip(id); renderGrid(); }
});

// ── Listeners globaux ─────────────────────────────────────────────────────────

document.getElementById('btnNew')?.addEventListener('click', openNewModal);
document.getElementById('btnNewEmpty')?.addEventListener('click', openNewModal);
document.getElementById('btnCancelNew').addEventListener('click', closeNewModal);
document.getElementById('btnConfirmNew').addEventListener('click', confirmNew);
document.getElementById('newTripName').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmNew();
  if (e.key === 'Escape') closeNewModal();
});
document.getElementById('newTripBackdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeNewModal();
});

document.getElementById('btnCancelDelete').addEventListener('click', closeDeleteModal);
document.getElementById('btnConfirmDelete').addEventListener('click', confirmDelete);
document.getElementById('deleteTripBackdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeDeleteModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeNewModal(); closeDeleteModal(); }
});

// ── Init ──────────────────────────────────────────────────────────────────────
renderGrid();
