/**
 * Service worker — mode hors-ligne (D3).
 *
 * Stratégies par origine :
 *  - navigations        → réseau d'abord, repli sur l'app shell en cache
 *  - même origine       → stale-while-revalidate (code servi du cache,
 *                         rafraîchi en arrière-plan : les déploiements
 *                         apparaissent au rechargement suivant)
 *  - CDN (unpkg/jsdelivr) → stale-while-revalidate
 *  - tuiles carte       → cache-first, plafonné à TILE_MAX entrées
 *                         (les zones consultées restent visibles hors ligne)
 *  - API données        → jamais interceptées (auth, Supabase, geocoding,
 *                         routage : le réseau fait foi, les modules ont
 *                         déjà leurs replis localStorage)
 *
 * Incrémenter VERSION invalide tous les caches à l'activation.
 */
const VERSION    = 'v1';
const APP_CACHE  = `app-${VERSION}`;
const CDN_CACHE  = `cdn-${VERSION}`;
const TILE_CACHE = `tiles-${VERSION}`;
const TILE_MAX   = 800; // ~15 Mo de tuiles, purge des plus anciennes au-delà

const APP_SHELL = [
  './',
  'index.html',
  'map.html',
  'manifest.webmanifest',
  'favicon.png',
  'css/auth.css',
  'css/dashboard.css',
  'css/style.css',
];

const CDN_HOSTS  = ['unpkg.com', 'cdn.jsdelivr.net'];
const TILE_HOSTS = ['tile.openstreetmap.org', 'data.geopf.fr', 'server.arcgisonline.com'];
const DATA_HOSTS = ['supabase.co', 'nominatim.openstreetmap.org', 'overpass-api.de',
                    'router.project-osrm.org', 'wikivoyage.org', 'api.open-meteo.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = [APP_CACHE, CDN_CACHE, TILE_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function hostMatches(hostname, hosts) {
  return hosts.some(h => hostname === h || hostname.endsWith('.' + h));
}

/** Sert le cache immédiatement, rafraîchit en arrière-plan. */
async function staleWhileRevalidate(cacheName, request) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fresh  = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || fresh;
}

/** Cache d'abord ; au-delà de `max` entrées, purge les plus anciennes. */
async function cacheFirstCapped(cacheName, request, max) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    cache.keys().then(keys => {
      if (keys.length > max) {
        return Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
      }
    });
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Données dynamiques : ne pas intercepter
  if (hostMatches(url.hostname, DATA_HOSTS)) return;

  // Navigation SPA : réseau d'abord, repli hors ligne sur l'app shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(APP_CACHE).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('index.html')))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(APP_CACHE, request));
    return;
  }
  if (hostMatches(url.hostname, TILE_HOSTS)) {
    event.respondWith(cacheFirstCapped(TILE_CACHE, request, TILE_MAX));
    return;
  }
  if (hostMatches(url.hostname, CDN_HOSTS)) {
    event.respondWith(staleWhileRevalidate(CDN_CACHE, request));
    return;
  }
  // Autres origines : comportement réseau par défaut
});
