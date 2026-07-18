/**
 * @fileoverview Captures de référence (Phase G4) — un jeu de pages/thèmes
 * clés, pour comparer visuellement avant/après une évolution de design.
 * Sorties dans reference-screenshots/ (non versionné, régénérable).
 *
 * Usage : npx serve . -l 5050   (dans un autre terminal)
 *         node scripts/reference-screenshots.mjs
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5050';
const OUT_DIR = new URL('../reference-screenshots/', import.meta.url);
mkdirSync(OUT_DIR, { recursive: true });

const DESKTOP = { width: 1400, height: 900 };
const MOBILE  = { width: 390, height: 844 };

async function setDark(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    localStorage.setItem('rtm-theme', 'dark');
  });
  await page.waitForTimeout(200);
}

async function openAPopup(page) {
  await page.waitForSelector('.leaflet-marker-icon', { timeout: 15000 });
  await page.locator('.leaflet-marker-icon').first().dispatchEvent('click');
  await page.waitForTimeout(400);
}

const SHOTS = [
  { name: 'home-desktop-light', url: '/', viewport: DESKTOP },
  { name: 'home-desktop-dark',  url: '/', viewport: DESKTOP, dark: true },
  { name: 'home-mobile-light',  url: '/', viewport: MOBILE },
  { name: 'login-desktop-light', url: '/#/login', viewport: DESKTOP },
  { name: 'login-desktop-dark',  url: '/#/login', viewport: DESKTOP, dark: true },
  { name: 'map-desktop-light', url: '/#/map', viewport: DESKTOP, setup: openAPopup },
  { name: 'map-desktop-dark',  url: '/#/map', viewport: DESKTOP, setup: openAPopup, dark: true },
  { name: 'map-mobile-light', url: '/#/map', viewport: MOBILE, setup: openAPopup },
];

const browser = await chromium.launch();
for (const shot of SHOTS) {
  const page = await browser.newPage({ viewport: shot.viewport });
  await page.goto(`${BASE_URL}${shot.url}`, { waitUntil: 'networkidle' });
  if (shot.setup) await shot.setup(page);
  if (shot.dark) await setDark(page);
  await page.waitForTimeout(200);
  await page.screenshot({ path: new URL(`${shot.name}.png`, OUT_DIR).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
  await page.close();
  console.log('capturé :', shot.name);
}
await browser.close();
