/**
 * @fileoverview Service Wikivoyage — sections d'article autour d'un point.
 * Responsabilité : geosearch + parse MediaWiki, regroupement des sections
 * par catégorie UX. Ne touche pas au DOM de la page (le HTML distant est
 * parsé via DOMParser, document inerte : ni scripts ni chargements).
 *
 * Consommé par ../map/wikivoyage.js (rendu popup).
 */

const WIKIVOYAGE_API = 'https://fr.wikivoyage.org/w/api.php';

// Mapping sections Wikivoyage FR → catégories UX
// Ordre = priorité de matching (premier match gagne)
const WIKI_CATS = [
  { keys: ['voir'],                          icon: '👁️',  label: 'À voir'        },
  { keys: ['faire', 'activit'],              icon: '🎯',  label: 'À faire'       },
  { keys: ['acheter'],                       icon: '🛍️', label: 'Acheter'       },
  { keys: ['manger', 'restau'],              icon: '🍽️', label: 'Manger'        },
  { keys: ['boire', 'sortir'],               icon: '🍺',  label: 'Boire / Sortir'},
  { keys: ['loger', 'heberg'],               icon: '🛏️', label: 'Se loger'      },
  { keys: ['aller', 'circuler'],             icon: '🚗',  label: 'Y aller'       },
  { keys: ['comprendre', 'quotidien'],       icon: '💡',  label: 'Comprendre'    },
  { keys: ['environ', 'voisin', 'alentour'], icon: '🗺️', label: 'Aux environs'  },
];

function wikiCatFor(sectionTitle) {
  const low = sectionTitle.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return WIKI_CATS.find(c => c.keys.some(k => low.includes(k)));
}

/**
 * Extrait et regroupe les sections utiles du HTML rendu d'un article.
 * Exportée pour les tests — ne fait aucun appel réseau.
 * @param {string} fullHtml - HTML MediaWiki (action=parse)
 * @returns {Record<string, { icon: string, label: string, items: string[] }>}
 */
export function groupSectionsFromHtml(fullHtml) {
  const doc     = new DOMParser().parseFromString(fullHtml, 'text/html');
  const grouped = {};

  // Parcourt les <h2> du HTML rendu et extrait le contenu jusqu'au h2 suivant
  for (const h2 of doc.querySelectorAll('h2')) {
    const sectionTitle = (h2.querySelector('.mw-headline') ?? h2).textContent?.trim() ?? '';
    const cat = wikiCatFor(sectionTitle);
    if (!cat || grouped[cat.label]) continue;

    const items = [];
    // MediaWiki récent encapsule le <h2> dans <div class="mw-heading">
    // → le contenu de la section est frère du div, pas du h2
    const headingBlock = h2.closest('.mw-heading') ?? h2;
    let el = headingBlock.nextElementSibling;
    while (el && el.tagName !== 'H2' && !el.classList.contains('mw-heading')) {
      for (const li of el.querySelectorAll('li')) {
        const bold = li.querySelector('b, strong');
        const text = (bold ? bold.textContent : li.textContent)
          .trim().split(/\s*[-–—:]\s*/)[0].trim();
        if (text.length >= 3 && !items.includes(text) && items.length < 7 && !/^\d/.test(text)) items.push(text);
      }
      el = el.nextElementSibling;
    }
    if (items.length) grouped[cat.label] = { icon: cat.icon, label: cat.label, items };
  }
  return grouped;
}

const sectionCache = new Map(); // title → grouped (cache session)

/**
 * Article Wikivoyage le plus proche d'un point, avec ses sections groupées.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{ title: string, pageUrl: string,
 *   sections: Array<{ icon: string, label: string, items: string[] }> }|null>}
 *   null si aucun article à moins de 10 km ou aucune section exploitable
 */
export async function fetchWikivoyageSections(lat, lng) {
  // 1. Geosearch
  const gsUrl = `${WIKIVOYAGE_API}?action=query&list=geosearch`
    + `&gscoord=${lat}|${lng}&gsradius=10000&gslimit=3&format=json&origin=*`;
  const hits = (await fetch(gsUrl).then(r => r.json())).query?.geosearch ?? [];
  if (!hits.length) return null;

  const title = hits[0].title;

  // 2. Sections via MediaWiki action=parse (CORS natif avec origin=*)
  //    Remplace mobile-sections (décommissionnée T328036)
  let grouped = sectionCache.get(title);
  if (!grouped) {
    const parseUrl = `${WIKIVOYAGE_API}?action=parse`
      + `&page=${encodeURIComponent(title)}&prop=text|sections&format=json&origin=*`;
    const parsed = await fetch(parseUrl).then(r => r.json());
    grouped = groupSectionsFromHtml(parsed.parse?.text?.['*'] ?? '');
    sectionCache.set(title, grouped);
  }

  const sections = Object.values(grouped).filter(s => s.items.length > 0);
  if (!sections.length) return null;

  return {
    title,
    pageUrl: `https://fr.wikivoyage.org/wiki/${encodeURIComponent(title)}`,
    sections,
  };
}
