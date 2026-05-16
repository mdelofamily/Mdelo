// ============================================================
//  save-load.js  —  Map Save / Load (JSON)
//  Depends on: state.js, tile-engine.js, render.js, ui-palette.js
// ============================================================

// ── COLLECT ALL MAP DATA INTO ONE OBJECT ──
function getMapData() {
  return {
    cols: COLS, rows: ROWS, map, overlayMap,
    objects: objects.map(o => ({
      id: o.id, lb: o.lb, x: o.x, y: o.y, cols: o.cols, rows: o.rows,
      ...(o.title   ? { title:   o.title   } : {}),
      ...(o.tooltip ? { tooltip: o.tooltip } : {}),
      ...(o.marker  ? { marker:  o.marker  } : {})
    })),
    custom: customTiles.map(t => ({
      id: t.id, lb: t.lb,
      ...(t.sheetUrl
        ? { sheetUrl: t.sheetUrl, x: t.sx, y: t.sy, w: t.sw, h: t.sh }
        : { src: t.src }),
      ...(t.isObject ? { isObject: true, cols: t.cols, rows: t.rows } : {})
    })),
    autoTiles: autoTiles.map(t => ({
      id: t.id, lb: t.lb, autoTile: true, sprites: t.sprites,
      ...(t.sheetUrl        ? { sheetUrl:       t.sheetUrl        } : {}),
      ...(t.baseTileId      ? { baseTileId:      t.baseTileId      } : {}),
      ...(t.compatibleWith?.length ? { compatibleWith: t.compatibleWith } : {})
    })),
    dualTiles: dualTiles.map(t => ({
      id: t.id, lb: t.lb, dualTile: true, sprites: t.sprites,
      ...(t.sheetUrl        ? { sheetUrl:       t.sheetUrl        } : {}),
      ...(t.compatibleWith?.length ? { compatibleWith: t.compatibleWith } : {})
    })),
    legendDesc:   (document.getElementById("legTabDesc")?.value || "").trim(),
    legendLabels: { ..._legendLabels },
    legendMenu:   JSON.parse(JSON.stringify(_menuSections)),
    hotAreas:     hotAreas.map(a => ({ ...a })),
    spotBaseUrl:  spotBaseUrl || ""
  };
}

// ── SAVE MAP TO JSON FILE ──
function saveMap() {
  const fname = (currentProjectName || "rpg-map").replace(/[^a-zA-Z0-9ა-ჿ_\-]/g, "_");
  downloadFile(JSON.stringify(getMapData()), fname + ".json", "application/json");
  toast("💾 " + fname + ".json შენახულია");
}

// ── RESTORE OBJECTS AFTER LOAD ──
function restoreObjects(savedObjs) {
  if (!savedObjs || !savedObjs.length) { objects = []; scheduleRender(); return; }
  objects = [];
  savedObjs.forEach(o => {
    const def = tileMap.get(o.id);
    if (!def) return;
    const img = def.img || getImg(o.id);
    if (img) objects.push({ ...o, img });
  });
  scheduleRender();
}

// ── LOAD MAP FROM JSON FILE ──
function loadMap(e) {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      COLS = d.cols; ROWS = d.rows;
      map        = d.map;
      overlayMap = d.overlayMap || Array.from({ length: ROWS }, () => Array(COLS).fill(""));
      hist = [];
      customTiles = []; autoTiles = []; dualTiles = [];

      const customs = d.custom    || [];
      const ats     = d.autoTiles || [];
      const dts     = d.dualTiles || [];
      let pending   = customs.length + ats.length + dts.length;

      function done() {
        if (--pending <= 0) {
          rebuildTileMap(); buildPalette(); rebuildOff(); centerView();
          restoreObjects(d.objects || []);
          scheduleRender(); toast("📂 ჩატვირთულია");
        }
      }

      if (pending === 0) {
        rebuildTileMap(); buildPalette(); rebuildOff(); centerView();
        restoreObjects(d.objects || []); scheduleRender(); toast("📂 ჩატვირთულია");
      } else {
        if (ats.length)     _loadAutoTilesArr(ats, done);
        if (dts.length)     _loadDualTiles(dts, done);
        if (customs.length) customs.forEach(ct => _loadCustomTile(ct, done));
      }

      // restore legend / hotspot data
      if (d.legendDesc  != null) document.getElementById("legTabDesc").value = d.legendDesc || "";
      if (d.legendLabels)        _legendLabels = { ...(d.legendLabels || {}) };
      if (d.legendMenu)          { _menuSections = d.legendMenu || []; renderMenuBuilder(); }
      if (d.hotAreas)            hotAreas = d.hotAreas;
      if (d.spotBaseUrl != null) {
        spotBaseUrl = d.spotBaseUrl;
        const inp = document.getElementById("spotBaseUrlInp");
        if (inp) inp.value = spotBaseUrl;
      }
    } catch (err) { toast("⚠ " + err.message); }
  };
  rd.readAsText(f); e.target.value = "";
}

// ── WINDOW BINDINGS ──
window.getMapData      = getMapData;
window.saveMap         = saveMap;
window.restoreObjects  = restoreObjects;
window.loadMap         = loadMap;
