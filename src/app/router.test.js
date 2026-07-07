// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { router } from './router.js';

describe('router.resolve', () => {
  it('résout les routes statiques', () => {
    expect(router.resolve('')).toMatchObject({ component: 'home', needsAuth: false });
    expect(router.resolve('login')).toMatchObject({ component: 'login', needsAuth: false });
    expect(router.resolve('dashboard')).toMatchObject({ component: 'dashboard', needsAuth: true });
    expect(router.resolve('profile')).toMatchObject({ component: 'profile', needsAuth: true });
  });

  it('résout la route dynamique roadtrips/:id', () => {
    const ctx = router.resolve('roadtrips/a3bb189e-8bf9-4888-9912-ace4e6543002');
    expect(ctx.component).toBe('roadtrip');
    expect(ctx.needsAuth).toBe(true);
    expect(ctx.params).toEqual({ id: 'a3bb189e-8bf9-4888-9912-ace4e6543002' });
  });

  it("exclut 'roadtrips/new' de la route dynamique (fallback home)", () => {
    expect(router.resolve('roadtrips/new').component).toBe('home');
  });

  it('retombe sur home pour une route inconnue', () => {
    expect(router.resolve('nimporte/quoi').component).toBe('home');
    expect(router.resolve('nimporte/quoi').needsAuth).toBe(false);
  });
});
