// E2E parcours authentifié complet — connexion, création d'un road trip,
// ajout d'une gare (Phase I, recherche fusionnée du bouton rapide),
// itinéraire, marquage d'un tronçon en train, horaire, export GPX,
// partage, retrait d'un pas. Couvre la régression corrigée le 31/07/2026
// (un pas retiré de l'itinéraire ne doit plus revenir tout seul).
//
// Nécessite un compte de test EXISTANT et à l'email déjà confirmé — un
// signup automatisé ne peut pas passer la confirmation par email.
// Fournir E2E_TEST_EMAIL / E2E_TEST_PASSWORD :
//   - en local :   E2E_TEST_EMAIL=... E2E_TEST_PASSWORD=... npm run test:e2e
//   - en CI :      secrets GitHub du repo (Settings → Secrets → Actions),
//                  cf. .github/workflows/ci.yml et le README (section
//                  "Compte de test E2E").
// Sans ces variables, toute la suite est ignorée (skip, pas d'échec CI).
import { test, expect } from '@playwright/test';

const EMAIL    = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

test.describe('parcours authentifié complet', () => {
  test.skip(!EMAIL || !PASSWORD,
    'E2E_TEST_EMAIL / E2E_TEST_PASSWORD non fournis — voir README, section "Compte de test E2E"');

  test.beforeEach(async ({ context }) => {
    // Nécessaire pour lire/écrire le presse-papiers (bouton Partager).
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('connexion → road trip → gare → itinéraire → train → horaire → GPX → partage → retrait', async ({ page }) => {
    const tripName = `E2E ${Date.now()}`;

    // ── 1. Connexion ──────────────────────────────────────────────────────
    await page.goto('/#/login');
    await page.fill('#loginEmail', EMAIL);
    await page.fill('#loginPassword', PASSWORD);
    await page.click('#loginSubmit');
    await expect(page.locator('.dash-header')).toBeVisible({ timeout: 20_000 });

    // ── 2. Créer un road trip ─────────────────────────────────────────────
    await page.click('#newTripBtn');
    await page.fill('#newTripName', tripName);
    await page.click('#newTripSubmit');
    await page.waitForURL(/#\/roadtrips\/[\w-]+/, { timeout: 20_000 });
    const tripId = page.url().match(/#\/roadtrips\/([\w-]+)/)[1];

    // ── 3. La carte du road trip se charge ────────────────────────────────
    await expect(page.locator('#map.leaflet-container')).toBeVisible({ timeout: 20_000 });

    // ── 4. Ajout rapide d'un point d'ancrage (départ à pied de la rando) ──
    await page.click('#pinModeButton');
    await page.fill('#quickAddInput', 'Lons-le-Saunier');
    const placeResult = page.locator('#quickAddResults .geocode-result-item').first();
    await expect(placeResult).toBeVisible({ timeout: 10_000 });
    await placeResult.click();
    // focusPlace() ouvre la popup du pin qui vient d'être créé.
    const placePopupAdd = page.locator('.leaflet-popup .popup-add-route');
    await expect(placePopupAdd).toBeVisible({ timeout: 10_000 });
    await placePopupAdd.click();
    await expect(page.locator('#tabRouteBadge')).toHaveText('1');

    // ── 5. Ajout rapide d'une gare (recherche fusionnée du bouton rapide,
    //      cf. PR #3 — le résultat porte directement la catégorie Gare) ───
    await page.click('#pinModeButton');
    await page.fill('#quickAddInput', 'Lons-le-Saunier');
    const gareResult = page.locator('#quickAddResults .geocode-result-item', { hasText: 'Gare SNCF' }).first();
    await expect(gareResult).toBeVisible({ timeout: 10_000 });
    await gareResult.click();
    const garePopupAdd = page.locator('.leaflet-popup .popup-add-route');
    await expect(garePopupAdd).toBeVisible({ timeout: 10_000 });
    await garePopupAdd.click();
    await expect(page.locator('#tabRouteBadge')).toHaveText('2');

    // ── 6. Ouvrir l'onglet Road Trip (itinéraire) ─────────────────────────
    await page.click('#tabRoute');
    const steps = page.locator('#routeSteps .route-step');
    await expect(steps).toHaveCount(2, { timeout: 10_000 });

    // ── 7. Marquer le tronçon menant à la gare comme train ────────────────
    // Le toggle 🚉 n'existe que sur un pas de catégorie Gare avec i > 0 —
    // la gare doit donc être en 2e position (sinon inverser l'ordre via
    // drag & drop, non fait ici : le scénario suppose l'ordre d'ajout).
    const trainToggle = page.locator('#routeSteps .route-step-train-toggle').first();
    await expect(trainToggle).toBeVisible({ timeout: 5_000 });
    await trainToggle.click();
    await expect(page.locator('#routeSteps .route-step-train').first()).toContainText('🚉 Train');

    // ── 8. Renseigner l'horaire du tronçon train ──────────────────────────
    await page.locator('#routeSteps .route-step-train-edit').first().click();
    await expect(page.locator('#pinModalBackdrop')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#pinTrainFields')).toBeVisible();
    await page.fill('#pinTrainDeparture', '08:42');
    await page.fill('#pinTrainArrival', '11:15');
    await page.fill('#pinTrainNumber', 'TGV 6612');
    await page.click('#pinConfirmBtn');
    await expect(page.locator('#routeSteps .route-step-train').first()).toContainText('08:42');
    await expect(page.locator('#routeSteps .route-step-train').first()).toContainText('11:15');

    // ── 9. Export GPX ──────────────────────────────────────────────────────
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#routeGpx'),
    ]);
    expect(download.suggestedFilename()).toContain('.gpx');

    // ── 10. Partage — l'URL copiée doit porter le marquage train ─────────
    await page.click('#routeShare');
    await expect(async () => {
      const clipboard = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboard).toContain('rtransport=');
    }).toPass({ timeout: 5_000 });

    // ── 11. Retirer un pas — ne doit PAS revenir (régression corrigée) ───
    const countBefore = await steps.count();
    await page.locator('#routeSteps .route-step-remove').first().click();
    await expect(steps).toHaveCount(countBefore - 1);
    // Laisse le temps à un éventuel resync temps réel (echo Supabase) de
    // (re)agir — la régression corrigée faisait revenir le pas ~1 s après.
    await page.waitForTimeout(2_500);
    await expect(steps).toHaveCount(countBefore - 1);

    // ── 12. Nettoyage — supprime le road trip de test ─────────────────────
    await page.goto('/#/dashboard');
    await expect(page.locator('.dash-header')).toBeVisible({ timeout: 15_000 });
    await page.click(`[data-action="delete"][data-id="${tripId}"]`);
    await page.click('#deleteTripConfirm');
    await expect(page.locator(`.rt-card[data-id="${tripId}"]`)).toHaveCount(0);
  });
});
