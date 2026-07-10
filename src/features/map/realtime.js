// Temps réel — les changements de pins d'un roadtrip (co-équipiers,
// autres onglets) arrivent via Supabase Realtime (postgres_changes).
// RLS est respectée : un client ne reçoit que ce qu'il peut lire.
// Ce module ne gère que l'abonnement ; la mise à jour de l'état carte
// vit dans mapApp (callbacks).
import { supabase } from '../../shared/lib/supabaseClient.js';

/**
 * @param {{
 *   roadtripId: string,
 *   onInsert:   (row: Object) => void,
 *   onUpdate:   (row: Object) => void,
 *   onDelete:   (row: { id: string }) => void,
 *   signal?:    AbortSignal,  - démontage de la carte (navigation SPA)
 * }} params
 */
export function initRealtimePins({ roadtripId, onInsert, onUpdate, onDelete, signal }) {
  const filter = `roadtrip_id=eq.${roadtripId}`;

  const channel = supabase
    .channel(`pins:${roadtripId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pins', filter },
      ({ new: row }) => onInsert(row))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pins', filter },
      ({ new: row }) => onUpdate(row))
    // DELETE : la ligne old ne porte que la clé primaire (replica identity
    // par défaut), le filtre roadtrip_id est impossible — mapApp vérifie l'id
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pins' },
      ({ old: row }) => onDelete(row))
    .subscribe();

  signal?.addEventListener('abort', () => { supabase.removeChannel(channel); }, { once: true });
  return channel;
}
