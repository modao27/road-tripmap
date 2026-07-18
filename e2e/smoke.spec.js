// Smoke tests publics — aucun compte requis. Couvrent ce que les tests
// unitaires (happy-dom) ne voient pas : chargement réel de Leaflet (à la
// demande), rendu de la carte, popup, ajout à l'itinéraire.
import { test, expect } from '@playwright/test';

test.describe('parcours publics', () => {
  test("la page d'accueil s'affiche et mène à la connexion", async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.home-hero__title')).toContainText('Planifiez vos road trips');

    await page.click('#heroLogin');
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("la carte libre se charge, popup et ajout à l'itinéraire", async ({ page }) => {
    await page.goto('/#/map');

    // Leaflet est chargé à la demande : #map reçoit .leaflet-container
    await expect(page.locator('#map.leaflet-container')).toBeVisible({ timeout: 20_000 });

    // Les lieux statiques remplissent la sidebar
    await expect(page.locator('#placeList .place-card').first()).toBeVisible({ timeout: 15_000 });
    expect(await page.locator('#placeList .place-card').count()).toBeGreaterThan(10);

    // Clic sur un lieu → la carte zoome et ouvre la popup
    await page.locator('#placeList .place-card').first().click();
    const addBtn = page.locator('.leaflet-popup .popup-add-route');
    await expect(addBtn).toBeVisible({ timeout: 15_000 });

    // Ajout à l'itinéraire → badge de l'onglet Road Trip à 1
    await addBtn.click();
    await expect(page.locator('#tabRouteBadge')).toHaveText('1');
  });

  test('la page d’inscription s’affiche', async ({ page }) => {
    await page.goto('/#/register');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });
});
