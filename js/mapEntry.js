// Point d'entrée de map.html : le paramètre de carte vient de ?map=
// (UUID de roadtrip ou slug de carte partagée).
// La SPA (index.html) monte la même application via src/app/pages/MapPage.js
// en passant le paramètre depuis la route.
import { initMapApp } from './app.js';
import { getMapIdFromUrl } from './storage.js';

initMapApp({ mapParam: getMapIdFromUrl() });
