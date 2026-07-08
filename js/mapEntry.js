// Point d'entrée de map.html : le paramètre de carte vient de ?map=
// (UUID de roadtrip ou slug de carte partagée).
// La SPA (index.html) monte la même application via src/app/pages/MapPage.js
// en passant le paramètre depuis la route.
import { MAP_PAGE_HTML } from '../src/features/map/mapPageTemplate.js';
import { initMapApp } from './app.js';
import { getMapIdFromUrl } from './storage.js';

document.getElementById('app').innerHTML = MAP_PAGE_HTML;
initMapApp({ mapParam: getMapIdFromUrl() });
