/**
 * @fileoverview Système de toasts léger.
 *
 * Usage :
 *   import { toast } from '../../shared/ui/toast.js';
 *   toast.success('Road trip créé !');
 *   toast.error('Connexion impossible.');
 *   toast.info('Chargement…');
 */

let container = null;

function getContainer() {
  if (container && document.contains(container)) return container;
  container = document.createElement('div');
  container.className = 'toast-wrap';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'false');
  document.body.appendChild(container);
  return container;
}

/**
 * @param {string} message
 * @param {'success'|'error'|'info'} [type='info']
 * @param {number} [duration=3500]
 */
function show(message, type = 'info', duration = 3500) {
  const wrap = getContainer();

  const el = document.createElement('div');
  el.className  = `toast toast--${type}`;
  el.textContent = message;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');

  wrap.appendChild(el);

  // Entrée
  requestAnimationFrame(() => el.classList.add('toast--visible'));

  // Sortie
  const hide = () => {
    el.classList.remove('toast--visible');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  };

  const timer = setTimeout(hide, duration);

  // Clic pour fermer
  el.addEventListener('click', () => { clearTimeout(timer); hide(); });
}

export const toast = {
  success: (msg, d) => show(msg, 'success', d),
  error:   (msg, d) => show(msg, 'error',   d ?? 5000),
  info:    (msg, d) => show(msg, 'info',    d),
};
