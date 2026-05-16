/**
 * @fileoverview RoadtripEditorPage — orchestrateur de l'éditeur.
 * Compose les stores (hooks) et les composants en un layout cohérent.
 *
 * Layout (desktop) :
 *   ┌─────────────────────────────────────────────────────┐
 *   │           RoadtripHeader (pleine largeur)            │
 *   ├─────────────┬───────────────────────┬───────────────┤
 *   │  Sidebar    │      MapCanvas        │  PinDetail    │
 *   │  PinList    │                       │  (si sélect.) │
 *   │  AddPinBtn  │                       │               │
 *   └─────────────┴───────────────────────┴───────────────┘
 */

import { createRoadtripEditorStore } from '../../features/roadtrips/useRoadtripEditor.js';
import { createSelectedPinStore }    from '../../features/pins/useSelectedPin.js';
import { createMapCenterStore }      from '../../features/maps/useMapCenter.js';
import { initMapCanvas }             from '../../features/maps/MapCanvas.js';
import { renderRoadtripHeader }      from '../../features/editor/RoadtripHeader.js';
import { renderPinList }             from '../../features/editor/PinList.js';
import { renderAddPinButton }        from '../../features/editor/AddPinButton.js';
import { renderPinDetailsPanel }     from '../../features/editor/PinDetailsPanel.js';
import { toast }                     from '../../shared/ui/toast.js';
import { router }                    from '../router.js';

/**
 * @param {HTMLElement}            container
 * @param {{ id: string }}         params
 */
export function renderRoadtripEditorPage(container, params) {
  const roadtripId = params?.id;
  if (!roadtripId) { router.navigate('dashboard'); return; }

  // ── Stores ───────────────────────────────────────────────────────────────
  const editorStore   = createRoadtripEditorStore(roadtripId);
  const selectedStore = createSelectedPinStore();
  const centerStore   = createMapCenterStore([46.709, 5.646], 10);

  let addMode    = false;
  let canvas     = null; // référence MapCanvas

  // ── DOM shell ────────────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="editor-page">
      <div id="editorHeader"></div>

      <div class="editor-body">
        <!-- Sidebar gauche -->
        <aside class="editor-sidebar">
          <div id="addPinMount"></div>
          <div class="editor-sidebar__pins" id="pinListMount"></div>
        </aside>

        <!-- Carte centrale -->
        <div class="editor-map-wrap">
          <div id="editorMap" class="editor-map"></div>
          <!-- Hint mode ajout -->
          <div class="editor-add-hint" id="addHint" hidden>
            Cliquez sur la carte pour placer un pin
          </div>
        </div>

        <!-- Panneau détail (droit, conditionnel) -->
        <div class="editor-detail" id="detailMount" hidden></div>
      </div>
    </div>`;

  // ── Refs DOM ─────────────────────────────────────────────────────────────
  const headerMount  = container.querySelector('#editorHeader');
  const addPinMount  = container.querySelector('#addPinMount');
  const pinListMount = container.querySelector('#pinListMount');
  const detailMount  = container.querySelector('#detailMount');
  const mapEl        = container.querySelector('#editorMap');
  const addHint      = container.querySelector('#addHint');

  // ── Initialisation carte ─────────────────────────────────────────────────
  canvas = initMapCanvas({
    container: mapEl,
    center:    [46.709, 5.646],
    zoom:      10,
    onMapReady: (map) => centerStore.registerMap(map),
    onPinClick: (pin) => {
      selectedStore.select(pin);
      centerStore.flyTo(pin.lat, pin.lng);
    },
    onMapClick: async ({ lat, lng }) => {
      if (!addMode) return;
      toggleAddMode(false);
      try {
        const pin = await editorStore.addPin({ lat, lng });
        selectedStore.select(pin);
        centerStore.flyTo(lat, lng, 14);
        toast.success('Pin ajouté !');
      } catch {
        toast.error('Impossible d\'ajouter le pin.');
      }
    },
  });

  // ── Mode ajout ───────────────────────────────────────────────────────────
  function toggleAddMode(forced) {
    addMode = forced !== undefined ? forced : !addMode;
    canvas.setAddMode(addMode);
    addHint.hidden = !addMode;
    if (addMode) selectedStore.deselect();
    renderAddPinButton(addPinMount, { active: addMode, onToggle: () => toggleAddMode() });
  }

  toggleAddMode(false); // render initial

  // ── Rendu header ─────────────────────────────────────────────────────────
  function renderHeader(roadtrip, saving) {
    renderRoadtripHeader(headerMount, {
      title:  roadtrip?.title ?? 'Chargement…',
      saving,
      onBack: () => router.navigate('dashboard'),
    });
  }

  // ── Rendu pin list ───────────────────────────────────────────────────────
  function renderList(pins, selectedId) {
    renderPinList(pinListMount, {
      pins,
      selectedId,
      onSelect: (pin) => {
        selectedStore.select(pin);
        centerStore.flyTo(pin.lat, pin.lng);
      },
    });
  }

  // ── Rendu panneau détail ─────────────────────────────────────────────────
  function renderDetail(pin, mode, saving) {
    if (!pin) { detailMount.hidden = true; return; }
    detailMount.hidden = false;
    canvas.invalidateSize();

    renderPinDetailsPanel(detailMount, {
      pin, mode, saving,
      onClose:  () => { selectedStore.deselect(); },
      onEdit:   () => { selectedStore.setMode('edit'); },
      onFlyTo:  (lat, lng) => centerStore.flyTo(lat, lng, 14),
      onSave: async (fields) => {
        try {
          const updated = await editorStore.updatePin(pin.id, fields);
          selectedStore.select(updated);
          selectedStore.setMode('view');
          toast.success('Pin mis à jour.');
        } catch {
          toast.error('Impossible de mettre à jour le pin.');
        }
      },
      onDelete: async (id) => {
        try {
          await editorStore.deletePin(id);
          selectedStore.deselect();
          toast.success('Pin supprimé.');
        } catch {
          toast.error('Impossible de supprimer le pin.');
        }
      },
    });
  }

  // ── Abonnements stores ────────────────────────────────────────────────────

  const unsubs = [
    editorStore.subscribe(({ roadtrip, pins, loading, saving, error }) => {
      if (loading) {
        headerMount.innerHTML = renderSkeletonHeader();
        pinListMount.innerHTML = renderSkeletonList();
        return;
      }
      if (error) {
        container.innerHTML = `
          <div class="page page--error">
            <p class="error-msg">⚠️ ${error}</p>
            <button class="btn btn--primary" onclick="location.reload()">Réessayer</button>
          </div>`;
        return;
      }
      renderHeader(roadtrip, saving);
      renderList(pins, selectedStore.getState().pin?.id ?? null);
      canvas.setPins(pins);

      // Centre initial sur le point de départ si disponible
      if (roadtrip?.start_lat && !canvas._centered) {
        canvas._centered = true;
        centerStore.flyTo(roadtrip.start_lat, roadtrip.start_lng, roadtrip.default_zoom ?? 12);
      }
    }),

    selectedStore.subscribe(({ pin, mode }) => {
      const { pins, saving } = editorStore.getState();
      renderList(pins, pin?.id ?? null);
      renderDetail(pin, mode, saving);
      canvas.highlightPin(pin?.id ?? null);
    }),
  ];

  // ── Chargement initial ────────────────────────────────────────────────────
  editorStore.load();

  // ── Responsive : invalidate carte sur resize ──────────────────────────────
  const resizeObs = new ResizeObserver(() => canvas.invalidateSize());
  resizeObs.observe(mapEl);

  // ── Nettoyage quand la page est détruite ──────────────────────────────────
  const mutObs = new MutationObserver(() => {
    if (!document.contains(container)) {
      unsubs.forEach(fn => fn());
      canvas.destroy();
      resizeObs.disconnect();
      mutObs.disconnect();
    }
  });
  mutObs.observe(document.body, { childList: true, subtree: false });
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function renderSkeletonHeader() {
  return `<header class="editor-header">
    <div class="sk-shimmer" style="width:120px;height:28px;border-radius:6px"></div>
    <div class="sk-shimmer" style="width:200px;height:24px;border-radius:6px"></div>
  </header>`;
}

function renderSkeletonList() {
  return Array(4).fill(0).map(() => `
    <div class="pin-item pin-item--skeleton">
      <div class="sk-shimmer" style="width:28px;height:28px;border-radius:50%"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:5px">
        <div class="sk-shimmer sk-line sk-line--70"></div>
        <div class="sk-shimmer sk-line sk-line--40"></div>
      </div>
    </div>`).join('');
}
