/**
 * @fileoverview Service profils utilisateur.
 * Responsabilités : lecture et mise à jour du profil Supabase.
 * Le profil est créé automatiquement via le trigger handle_new_user (migration 002).
 *
 * @typedef {Object} UserProfile
 * @property {string}      id
 * @property {string|null} display_name
 * @property {string|null} avatar_url
 * @property {string}      bio
 * @property {string}      created_at
 * @property {string}      updated_at
 */

import { supabase } from '../../shared/lib/supabaseClient.js';

/**
 * Charge le profil d'un utilisateur.
 * @param {string} userId
 * @returns {Promise<UserProfile|null>}
 */
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();            // maybeSingle = null si absent (pas d'erreur)
  if (error) throw error;
  return data;
}

/**
 * Crée ou met à jour le profil de l'utilisateur courant.
 * @param {string}                    userId
 * @param {Partial<Omit<UserProfile,'id'|'created_at'|'updated_at'>>} fields
 * @returns {Promise<UserProfile>}
 */
export async function upsertProfile(userId, fields) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...fields })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Charge le profil de l'utilisateur courant (auth.uid()).
 * @returns {Promise<UserProfile|null>}
 */
export async function getCurrentProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return getProfile(user.id);
}
