/**
 * @fileoverview Révèle en fondu les éléments `[data-animate]` au scroll.
 * Repli silencieux si IntersectionObserver est indisponible (l'élément
 * reste visible, non animé) ou si l'utilisateur préfère moins d'animations.
 */

/**
 * @param {HTMLElement} root - conteneur dans lequel chercher `[data-animate]`
 * @returns {() => void} à appeler au démontage de la page
 */
export function observeScrollReveal(root) {
  const targets = root.querySelectorAll('[data-animate]');
  if (!targets.length) return () => {};

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || typeof IntersectionObserver === 'undefined') {
    targets.forEach((el) => el.classList.add('is-visible'));
    return () => {};
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  targets.forEach((el) => observer.observe(el));
  return () => observer.disconnect();
}
