/**
 * @fileoverview Régénère images/home/app-screenshot.webp (capture de l'app
 * "en situation" pour la page d'accueil, Phase G1) — à relancer après toute
 * évolution visuelle notable de la carte, pour ne jamais la laisser périmée.
 *
 * Encodage PNG -> WebP via le Chromium embarqué (canvas.toDataURL), sans
 * dépendance de build ni binaire externe (pas de cwebp/imagemagick ici).
 *
 * Usage : npx serve . -l 5050   (dans un autre terminal)
 *         node scripts/screenshot-home.mjs
 */

import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5050';
const OUT_PATH = new URL('../images/home/app-screenshot.webp', import.meta.url);

const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`${BASE_URL}/#/map`, { waitUntil: 'networkidle' });
await page.waitForSelector('.leaflet-marker-icon', { timeout: 15000 });
await page.waitForTimeout(600); // clusters/tuiles finissent de s'installer
const pngBuffer = await page.screenshot({ type: 'png' });
await page.close();

// Conversion PNG -> WebP dans une page vierge (canvas), via le Chromium
// de Playwright — évite toute dépendance externe (cwebp, sharp…).
const converter = await browser.newPage();
const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
const webpDataUrl = await converter.evaluate(async (src) => {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = src;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);
  return canvas.toDataURL('image/webp', 0.82);
}, dataUrl);
await browser.close();

const base64 = webpDataUrl.replace(/^data:image\/webp;base64,/, '');
writeFileSync(OUT_PATH, Buffer.from(base64, 'base64'));

console.log('Capture enregistree :', OUT_PATH.pathname);
