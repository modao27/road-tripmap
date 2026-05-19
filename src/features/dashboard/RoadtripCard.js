/**
 * @fileoverview Composant RoadtripCard — rendu d'une carte de roadtrip.
 *
 * @typedef {import('../../shared/types/index.js').Roadtrip} Roadtrip
 */

const GRADIENTS = [
  'linear-gradient(135deg, #1f5f43 0%, #2f8a60 100%)',
  'linear-gradient(135deg, #2477a6 0%, #3a9fd4 100%)',
  'linear-gradient(135deg, #6f513f 0%, #a07858 100%)',
  'linear-gradient(135deg, #605d80 0%, #8a87b0 100%)',
  'linear-gradient(135deg, #912d2d 0%, #c45050 100%)',
  'linear-gradient(135deg, #2f6f36 0%, #4aac56 100%)',
];

function relativeDate(iso) {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "aujourd'hui";
  if (d === 1) return 'hier';
  if (d < 7)  return `il y a ${d} jours`;
  if (d < 30) return `il y a ${Math.floor(d / 7)} sem.`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Retourne le HTML d'une card de roadtrip.
 * @param {Roadtrip} trip
 * @param {number}   index - Pour la couleur de couverture
 * @returns {string}
 */
export function renderRoadtripCard(trip, index) {
  const gradient = GRADIENTS[index % GRADIENTS.length];
  const n = trip.pin_count ?? 0;
  const meta = [
    n > 0 ? `📍 ${n} pin${n > 1 ? 's' : ''}` : null,
    `modifié ${relativeDate(trip.updated_at)}`,
  ].filter(Boolean).join(' · ');

  return `
    <article class="rt-card" data-id="${trip.id}">
      <div class="rt-card__cover" style="background:${gradient}" aria-hidden="true">
        <span class="rt-card__icon">🗺️</span>
      </div>
      <div class="rt-card__body">
        <h2 class="rt-card__title">${trip.title}</h2>
        ${trip.description ? `<p class="rt-card__desc">${trip.description}</p>` : ''}
        <p class="rt-card__meta">${meta}</p>
      </div>
      <div class="rt-card__actions">
        <a class="btn btn--primary btn--sm" href="map.html?map=${trip.id}">
          Ouvrir →
        </a>
        <button class="btn btn--icon" data-action="edit" data-id="${trip.id}"
                data-title="${trip.title.replace(/"/g, '&quot;')}"
                data-desc="${(trip.description || '').replace(/"/g, '&quot;')}"
                title="Renommer" aria-label="Modifier ${trip.title}">✏️</button>
        <button class="btn btn--icon" data-action="share" data-id="${trip.id}"
                title="Copier le lien" aria-label="Partager ${trip.title}">🔗</button>
        <button class="btn btn--icon" data-action="delete" data-id="${trip.id}"
                title="Supprimer" aria-label="Supprimer ${trip.title}">✕</button>
      </div>
    </article>`;
}

/**
 * Retourne le HTML d'un skeleton de card (loading state).
 * @returns {string}
 */
export function renderRoadtripCardSkeleton() {
  return `
    <div class="rt-card rt-card--skeleton" aria-hidden="true">
      <div class="rt-card__cover sk-shimmer"></div>
      <div class="rt-card__body">
        <div class="sk-line sk-line--60"></div>
        <div class="sk-line sk-line--40"></div>
        <div class="sk-line sk-line--80"></div>
      </div>
    </div>`;
}
