/**
 * @fileoverview Service DATAtourisme — POI touristiques officiels (France).
 * Responsabilité : catégories et appel de l'Edge Function datatourisme-nearby
 * (proxy + cache 7 jours côté Supabase). Ne touche pas au DOM ni à Leaflet.
 *
 * Source unique — consommé par l'onglet Découvrir (../map/datatourisme.js)
 * et l'enrichissement des popups village/ancrage (../map/datatourisme.js).
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../shared/lib/supabaseClient.js';

const DT_NEARBY_URL = `${SUPABASE_URL}/functions/v1/datatourisme-nearby`;

export const DT_CATEGORIES = {
  hebergement: { label: 'Hébergements', icon: '🏕', color: '#2477a6' },
  restaurant:  { label: 'Restauration', icon: '🍽', color: '#d56b1d' },
  evenement:   { label: 'Événements',   icon: '📅', color: '#605d80' },
  patrimoine:  { label: 'Patrimoine',   icon: '🏛', color: '#912d2d' },
};

/**
 * Interroge l'Edge Function datatourisme-nearby.
 * radius et categories sont optionnels (l'Edge Function applique ses
 * défauts — 15 km, toutes catégories — pour l'enrichissement des popups).
 *
 * @param {{ lat: number, lng: number, radius?: number, categories?: string }} params
 *   categories : clés de DT_CATEGORIES jointes par des virgules
 * @returns {Promise<Record<string, Array<{ label: string, icon: string,
 *   lat?: number, lng?: number, dist?: number, address?: string,
 *   description?: string, phone?: string, email?: string, url?: string }>>>}
 * @throws {Error} si HTTP non-2xx ou si la réponse contient { error }
 */
export async function fetchDatatourismeNearby({ lat, lng, radius, categories }) {
  const res = await fetch(DT_NEARBY_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ lat, lng, radius, categories }),
  });
  if (!res.ok) throw new Error(`datatourisme-nearby HTTP ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(String(data.error));
  return data;
}
