import { describe, it, expect, vi, beforeEach } from 'vitest';

// pinService importe le singleton Supabase (qui exige window.supabase au
// chargement — cf. supabaseClient.js) : on remplace tout le module plutôt
// que de simuler ce global, vi.mock étant hissé au-dessus des imports.
const calls = [];
vi.mock('../../shared/lib/supabaseClient.js', () => ({
  supabase: {
    from: () => ({
      update: fields => ({
        eq: (_col, id) => { calls.push({ id, fields }); return Promise.resolve({ error: null }); },
      }),
    }),
  },
}));

const { updatePinOrder } = await import('./pinService.js');

const id1 = '11111111-1111-1111-1111-111111111111';
const id2 = '22222222-2222-2222-2222-222222222222';

describe('updatePinOrder', () => {
  beforeEach(() => { calls.length = 0; });

  it('ne touche ni day ni transport quand ils ne sont pas fournis', async () => {
    await updatePinOrder([id1, id2]);
    expect(calls).toEqual([
      { id: id1, fields: { order_index: 0 } },
      { id: id2, fields: { order_index: 1 } },
    ]);
  });

  it('inclut transport (y compris null explicite) quand fourni, sans toucher day', async () => {
    await updatePinOrder([id1, id2], null, ['train', null]);
    expect(calls).toEqual([
      { id: id1, fields: { order_index: 0, transport: 'train' } },
      { id: id2, fields: { order_index: 1, transport: null } },
    ]);
  });

  it('peut mettre à jour day et transport en même temps', async () => {
    await updatePinOrder([id1], [2], ['train']);
    expect(calls).toEqual([{ id: id1, fields: { order_index: 0, day: 2, transport: 'train' } }]);
  });

  it('ignore les ids non-UUID (pins temporaires jamais persistés)', async () => {
    await updatePinOrder(['not-a-uuid', id1], [2, 3]);
    expect(calls).toEqual([{ id: id1, fields: { order_index: 1, day: 3 } }]);
  });
});
