/**
 * @fileoverview Service de partage de cartes.
 * Responsabilité : sauvegarder et charger des snapshots publics via Supabase.
 * Ne touche pas au DOM.
 *
 * @typedef {import('../../shared/types/index.js').SharedMap} SharedMap
 */

import { supabase } from '../../shared/lib/supabaseClient.js';

/**
 * Sauvegarde une carte partagée avec un slug unique.
 * @param {string}                                slug    - Slug de base (ex: "jura-juin-2025")
 * @param {Omit<SharedMap, 'slug'>}               payload
 * @returns {Promise<string>} Slug final (potentiellement suffixé -2, -3…)
 */
export async function saveSharedMap(slug, payload) {
  let finalSlug = slug;
  let i = 2;
  while (true) {
    const { data } = await supabase
      .from('shared_maps')
      .select('slug')
      .eq('slug', finalSlug)
      .maybeSingle();
    if (!data) break;
    finalSlug = `${slug}-${i++}`;
  }
  const { error } = await supabase.from('shared_maps').insert({ slug: finalSlug, ...payload });
  if (error) throw error;
  return finalSlug;
}

/**
 * Charge une carte partagée par son slug.
 * @param {string} slug
 * @returns {Promise<SharedMap>}
 */
export async function loadSharedMap(slug) {
  const { data, error } = await supabase
    .from('shared_maps')
    .select('*')
    .eq('slug', slug)
    .single();
  if (error) throw error;
  return data;
}
