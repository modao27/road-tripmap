/**
 * @fileoverview Remontée des erreurs front — table Supabase client_errors
 * (écriture seule via RLS, lecture dans le SQL Editor).
 *
 * Garde-fous : max 5 remontées par session, dédoublonnage par message,
 * rien hors ligne, et surtout totalement silencieux — le monitoring ne
 * doit jamais casser l'app qu'il surveille.
 */

import { supabase } from './supabaseClient.js';

const MAX_REPORTS_PER_SESSION = 5;
let sent = 0;
const seenMessages = new Set();

function report(message, source = '', stack = '') {
  try {
    if (sent >= MAX_REPORTS_PER_SESSION || !navigator.onLine) return;
    const key = String(message).slice(0, 200);
    if (!key || seenMessages.has(key)) return;
    seenMessages.add(key);
    sent++;

    supabase.from('client_errors').insert({
      message:    String(message).slice(0, 500),
      source:     String(source ?? '').slice(0, 300),
      stack:      String(stack ?? '').slice(0, 2000),
      page:       (window.location.hash || '/').slice(0, 200),
      user_agent: navigator.userAgent.slice(0, 300),
    }).then(() => {}, () => {});
  } catch { /* silencieux par contrat */ }
}

export function initErrorReporter() {
  window.addEventListener('error', (e) => {
    report(e.message ?? 'error', `${e.filename ?? ''}:${e.lineno ?? 0}`, e.error?.stack);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    report(reason?.message ?? String(reason ?? 'unhandledrejection'), 'promise', reason?.stack);
  });
}
