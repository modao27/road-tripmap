/**
 * @fileoverview Icônes SVG inline (style Lucide, ISC) — aucune dépendance,
 * aucune requête réseau. On ajoute ici uniquement les icônes utilisées.
 */

const ATTRS = 'xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" '
  + 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
  + 'aria-hidden="true" focusable="false"';

export const ICON_SUN = `<svg ${ATTRS}>
  <circle cx="12" cy="12" r="4"/>
  <path d="M12 2v2"/><path d="M12 20v2"/>
  <path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/>
  <path d="M2 12h2"/><path d="M20 12h2"/>
  <path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
</svg>`;

export const ICON_MOON = `<svg ${ATTRS}>
  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
</svg>`;

export const ICON_MAP_PIN = `<svg ${ATTRS}>
  <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
  <circle cx="12" cy="10" r="3"/>
</svg>`;

export const ICON_IMAGE = `<svg ${ATTRS}>
  <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
  <circle cx="9" cy="9" r="2"/>
  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
</svg>`;

export const ICON_SHARE = `<svg ${ATTRS}>
  <circle cx="18" cy="5" r="3"/>
  <circle cx="6" cy="12" r="3"/>
  <circle cx="18" cy="19" r="3"/>
  <line x1="8.59" x2="15.42" y1="10.51" y2="6.49"/>
  <line x1="8.59" x2="15.42" y1="13.49" y2="17.51"/>
</svg>`;

export const ICON_CALENDAR = `<svg ${ATTRS}>
  <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
  <line x1="16" x2="16" y1="2" y2="6"/>
  <line x1="8" x2="8" y1="2" y2="6"/>
  <line x1="3" x2="21" y1="10" y2="10"/>
</svg>`;

export const ICON_WIFI_OFF = `<svg ${ATTRS}>
  <path d="M12 20h.01"/>
  <path d="M8.5 16.429a5 5 0 0 1 7 0"/>
  <path d="M5 12.859a10 10 0 0 1 2.343-1.884"/>
  <path d="M19 12.859a10 10 0 0 0-2.343-1.884"/>
  <path d="M10.66 4.62a13 13 0 0 1 8.62 3.44"/>
  <path d="M2 8.82a15 15 0 0 1 4.177-2.643"/>
  <path d="m2 2 20 20"/>
</svg>`;

export const ICON_USERS = `<svg ${ATTRS}>
  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
  <circle cx="9" cy="7" r="4"/>
  <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
</svg>`;

export const ICON_CLOUD = `<svg ${ATTRS}>
  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
</svg>`;

export const ICON_DOWNLOAD = `<svg ${ATTRS}>
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
  <polyline points="7 10 12 15 17 10"/>
  <line x1="12" x2="12" y1="15" y2="3"/>
</svg>`;

export const ICON_COMPASS = `<svg ${ATTRS}>
  <circle cx="12" cy="12" r="10"/>
  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
</svg>`;
