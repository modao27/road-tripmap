/**
 * @fileoverview Page dashboard — liste des roadtrips de l'utilisateur.
 */

import { authStore }                                  from '../../features/auth/AuthStore.js';
import { signOut }                                    from '../../features/auth/authService.js';
import { listRoadtrips, createRoadtrip, deleteRoadtrip, updateRoadtrip } from '../../features/roadtrips/roadtripService.js';
import { renderList, renderListLoading, renderListError } from '../../features/dashboard/RoadtripList.js';
import { toast }                                      from '../../shared/ui/toast.js';
import { router }                                     from '../router.js';

export function renderDashboardPage(container) {
  const { user } = authStore.getState();

  container.innerHTML = `
    <div class="page page--dashboard">

      <header class="dash-header">
        <div class="dash-header__brand">
          <span class="dash-header__logo">🗺️</span>
          <span class="dash-header__name">Road Trip Map</span>
        </div>
        <div class="dash-header__actions">
          <button class="btn btn--primary" id="newTripBtn">
            + Nouveau road trip
          </button>
          <button class="btn btn--ghost btn--icon" id="profileBtn"
                  title="Mon profil" aria-label="Mon profil">
            👤
          </button>
          <button class="btn btn--ghost btn--icon" id="logoutBtn"
                  title="Se déconnecter" aria-label="Se déconnecter">
            ↩
          </button>
        </div>
      </header>

      <main class="dash-main">
        <div class="dash-welcome">
          <h1 class="dash-welcome__title">Mes road trips</h1>
          <p class="dash-welcome__sub">
            ${user?.email ? `Connecté en tant que <strong>${user.email}</strong>` : ''}
          </p>
        </div>

        <div id="tripList" class="dash-list-wrap"></div>
      </main>

    </div>

    <!-- Modale nouveau road trip -->
    <div class="modal-backdrop" id="newTripBackdrop" hidden>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="newTripTitle">
        <h2 class="modal__title" id="newTripTitle">Nouveau road trip</h2>

        <div id="newTripAlert" class="alert alert--error" hidden role="alert"></div>

        <form class="modal__form" id="newTripForm">
          <label class="form-field">
            <span class="form-field__label">Nom du road trip *</span>
            <input class="form-field__input" type="text" id="newTripName"
                   placeholder="Ex : Jura sauvage 2025" maxlength="80" required>
            <span class="form-field__error" id="newTripNameErr"></span>
          </label>
          <label class="form-field">
            <span class="form-field__label">Description (facultatif)</span>
            <textarea class="form-field__input form-field__textarea" id="newTripDesc"
                      placeholder="Quelques mots sur ce voyage…" rows="2" maxlength="200"></textarea>
          </label>
          <div class="modal__actions">
            <button class="btn btn--ghost" type="button" id="newTripCancel">Annuler</button>
            <button class="btn btn--primary" type="submit" id="newTripSubmit">Créer</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modale édition road trip -->
    <div class="modal-backdrop" id="editTripBackdrop" hidden>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="editTripTitle">
        <h2 class="modal__title" id="editTripTitle">Modifier le road trip</h2>

        <div id="editTripAlert" class="alert alert--error" hidden role="alert"></div>

        <form class="modal__form" id="editTripForm">
          <label class="form-field">
            <span class="form-field__label">Nom du road trip *</span>
            <input class="form-field__input" type="text" id="editTripName"
                   maxlength="80" required>
            <span class="form-field__error" id="editTripNameErr"></span>
          </label>
          <label class="form-field">
            <span class="form-field__label">Description (facultatif)</span>
            <textarea class="form-field__input form-field__textarea" id="editTripDesc"
                      rows="2" maxlength="200"></textarea>
          </label>
          <div class="modal__actions">
            <button class="btn btn--ghost" type="button" id="editTripCancel">Annuler</button>
            <button class="btn btn--primary" type="submit" id="editTripSubmit">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modale confirmation suppression -->
    <div class="modal-backdrop" id="deleteTripBackdrop" hidden>
      <div class="modal modal--sm" role="dialog" aria-modal="true">
        <h2 class="modal__title">Supprimer ce road trip ?</h2>
        <p class="modal__body">Cette action est irréversible. Tous les pins et l'itinéraire seront supprimés.</p>
        <div class="modal__actions">
          <button class="btn btn--ghost" id="deleteTripCancel">Annuler</button>
          <button class="btn btn--danger" id="deleteTripConfirm">Supprimer</button>
        </div>
      </div>
    </div>`;

  const listWrap            = container.querySelector('#tripList');
  const newTripBackdrop     = container.querySelector('#newTripBackdrop');
  const editTripBackdrop    = container.querySelector('#editTripBackdrop');
  const deleteTripBackdrop  = container.querySelector('#deleteTripBackdrop');
  let   pendingDeleteId     = null;
  let   pendingEditId       = null;

  // ── Chargement ────────────────────────────────────────────────────────────
  async function loadTrips() {
    renderListLoading(listWrap);
    try {
      const trips = await listRoadtrips();
      renderList(listWrap, trips, { onDelete: openDeleteModal, onShare: shareTrip, onEdit: openEditModal });
    } catch (err) {
      renderListError(listWrap, 'Impossible de charger les road trips.');
      listWrap.querySelector('#listRetry')?.addEventListener('click', loadTrips);
    }
  }

  loadTrips();

  // ── Profil ────────────────────────────────────────────────────────────────
  container.querySelector('#profileBtn').addEventListener('click', () => {
    router.navigate('profile');
  });

  // ── Déconnexion ───────────────────────────────────────────────────────────
  container.querySelector('#logoutBtn').addEventListener('click', async () => {
    await signOut();
    router.navigate('');
  });

  // ── Nouveau road trip ─────────────────────────────────────────────────────
  container.querySelector('#newTripBtn').addEventListener('click', () => {
    container.querySelector('#newTripName').value = '';
    container.querySelector('#newTripDesc').value = '';
    container.querySelector('#newTripNameErr').textContent = '';
    container.querySelector('#newTripAlert').hidden = true;
    newTripBackdrop.hidden = false;
    container.querySelector('#newTripName').focus();
  });

  container.querySelector('#newTripCancel').addEventListener('click', () => {
    newTripBackdrop.hidden = true;
  });

  newTripBackdrop.addEventListener('click', e => {
    if (e.target === newTripBackdrop) newTripBackdrop.hidden = true;
  });

  container.querySelector('#newTripForm').addEventListener('submit', async e => {
    e.preventDefault();
    const title = container.querySelector('#newTripName').value.trim();
    if (!title) {
      container.querySelector('#newTripNameErr').textContent = 'Le nom est requis.';
      return;
    }
    const submitBtn = container.querySelector('#newTripSubmit');
    submitBtn.disabled = true;
    const desc  = container.querySelector('#newTripDesc').value.trim();
    const { user: u } = authStore.getState();
    try {
      const trip = await createRoadtrip({ title, description: desc, userId: u?.id ?? null });
      newTripBackdrop.hidden = true;
      window.location.href = `map.html?map=${trip.id}&onboard=true`;
    } catch {
      submitBtn.disabled = false;
      const alert = container.querySelector('#newTripAlert');
      alert.textContent = 'Erreur lors de la création. Réessaie.';
      alert.hidden = false;
    }
  });

  // ── Édition ───────────────────────────────────────────────────────────────
  function openEditModal(id, title, desc) {
    pendingEditId = id;
    container.querySelector('#editTripName').value = title || '';
    container.querySelector('#editTripDesc').value = desc  || '';
    container.querySelector('#editTripNameErr').textContent = '';
    container.querySelector('#editTripAlert').hidden = true;
    editTripBackdrop.hidden = false;
    container.querySelector('#editTripName').focus();
  }

  container.querySelector('#editTripCancel').addEventListener('click', () => {
    pendingEditId = null;
    editTripBackdrop.hidden = true;
  });

  editTripBackdrop.addEventListener('click', e => {
    if (e.target === editTripBackdrop) { pendingEditId = null; editTripBackdrop.hidden = true; }
  });

  container.querySelector('#editTripForm').addEventListener('submit', async e => {
    e.preventDefault();
    const title = container.querySelector('#editTripName').value.trim();
    if (!title) {
      container.querySelector('#editTripNameErr').textContent = 'Le nom est requis.';
      return;
    }
    const submitBtn = container.querySelector('#editTripSubmit');
    submitBtn.disabled = true;
    const desc = container.querySelector('#editTripDesc').value.trim();
    try {
      await updateRoadtrip(pendingEditId, { title, description: desc });
      editTripBackdrop.hidden = true;
      pendingEditId = null;
      toast.success('Road trip mis à jour.');
      loadTrips();
    } catch {
      submitBtn.disabled = false;
      const alertEl = container.querySelector('#editTripAlert');
      alertEl.textContent = 'Erreur lors de la mise à jour. Réessaie.';
      alertEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ── Partage ───────────────────────────────────────────────────────────────
  function shareTrip(id) {
    const url = `${window.location.origin}/map.html?map=${id}`;
    navigator.clipboard.writeText(url)
      .then(() => toast.success('Lien copié dans le presse-papiers !'))
      .catch(() => {
        prompt('Copie ce lien :', url);
      });
  }

  // ── Suppression ───────────────────────────────────────────────────────────
  function openDeleteModal(id) {
    pendingDeleteId = id;
    deleteTripBackdrop.hidden = false;
  }

  container.querySelector('#deleteTripCancel').addEventListener('click', () => {
    pendingDeleteId = null;
    deleteTripBackdrop.hidden = true;
  });

  deleteTripBackdrop.addEventListener('click', e => {
    if (e.target === deleteTripBackdrop) {
      pendingDeleteId = null;
      deleteTripBackdrop.hidden = true;
    }
  });

  container.querySelector('#deleteTripConfirm').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    pendingDeleteId = null;
    deleteTripBackdrop.hidden = true;
    await deleteRoadtrip(id);
    loadTrips();
  });

  // ── Fermeture modales clavier ─────────────────────────────────────────────
  document.addEventListener('keydown', function onKey(e) {
    if (e.key !== 'Escape') return;
    newTripBackdrop.hidden    = true;
    editTripBackdrop.hidden   = true;
    deleteTripBackdrop.hidden = true;
    pendingDeleteId = null;
    pendingEditId   = null;
    // Nettoyage quand la page est déchargée
    if (!document.contains(container)) document.removeEventListener('keydown', onKey);
  });
}
