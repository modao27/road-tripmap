// Bottom sheet mobile (F-P2) — sur petit écran, la popup Leaflet est
// dockée en bas de l'écran (pattern Google Maps) au lieu de flotter sur
// le pin : même contenu, même câblage (météo, replis, délégations),
// seule la présentation change.
//
// Mécanique : au popupopen, le conteneur .leaflet-popup est reparenté
// dans le conteneur de la carte (non transformé — les panes Leaflet
// portent un translate3d qui rendrait position:fixed inopérant) et la
// classe .sheet-popup le docke en bas. Leaflet gère toujours ouverture,
// fermeture (✕, tap carte) et cycle de vie.

// Seuil volontairement différent de mobileQuery (mapApp.js, 960px avec la
// Phase H8) : le dock en bas d'écran est un secours pour les écrans étroits
// où une popup flottante couvrirait trop de carte, pas une préférence
// tactile — une tablette a la largeur pour une popup flottante classique.
const MOBILE = window.matchMedia('(max-width: 820px)');
const SWIPE_CLOSE_PX  = 80;  // glisser vers le bas au-delà → réduit/ferme
const SWIPE_EXPAND_PX = 40;  // glisser vers le haut au-delà → étend

export function initBottomSheet(map) {
  map.on('popupopen', (e) => {
    const popup = e.popup;
    const el    = popup.getElement(); // .leaflet-popup (réutilisé entre ouvertures)
    if (!el) return;

    if (!MOBILE.matches) {
      // Desktop (ou rotation) : rendu popup classique
      el.classList.remove('sheet-popup', 'sheet-expanded');
      return;
    }

    el.classList.add('sheet-popup');
    el.classList.remove('sheet-expanded'); // chaque ouverture repart en aperçu
    map.getContainer().appendChild(el);

    if (!el.dataset.sheetWired) {
      el.dataset.sheetWired = 'true';
      wireHandle(map, el);
    }
  });
}

function wireHandle(map, el) {
  const wrapper = el.querySelector('.leaflet-popup-content-wrapper');
  if (!wrapper) return;

  const handle = document.createElement('div');
  handle.className = 'sheet-handle';
  handle.setAttribute('aria-hidden', 'true');
  wrapper.prepend(handle);

  let startY = 0;
  let deltaY = 0;

  handle.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    deltaY = 0;
    el.style.transition = 'none';
  }, { passive: true });

  handle.addEventListener('touchmove', (e) => {
    deltaY = e.touches[0].clientY - startY;
    // Suit le doigt vers le bas uniquement (le haut = snap à l'état étendu)
    el.style.transform = `translateY(${Math.max(0, deltaY)}px)`;
  }, { passive: true });

  handle.addEventListener('touchend', () => {
    el.style.transition = '';
    el.style.transform  = '';
    if (deltaY > SWIPE_CLOSE_PX) {
      if (el.classList.contains('sheet-expanded')) el.classList.remove('sheet-expanded');
      else map.closePopup();
    } else if (deltaY < -SWIPE_EXPAND_PX) {
      el.classList.add('sheet-expanded');
    }
  });

  // Tap sur la poignée : bascule aperçu ↔ étendu (repli au doigt peu précis)
  handle.addEventListener('click', () => el.classList.toggle('sheet-expanded'));
}
