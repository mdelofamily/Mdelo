// ============================================================
//  export-png.js  —  PNG Export
//  Depends on: state.js, tile-engine.js, render.js
//  NOTE: never draws from offscreen (tainted). Re-renders from
//        freshly fetch()-ed blob images to avoid CORS errors.
// ============================================================

async function exportPNG() {
  try {
    toast("🖼 PNG მზადდება...");

    // ── Step 1: collect all external sheet URLs ──
    const allTiles = [...customTiles, ...autoTiles, ...dualTiles];
    const sheetUrls = [...new Set([
      ...allTiles.filter(t => t.sheetUrl).map(t => t.sheetUrl),
      ...objects.map(o => tileMap.get(o.id)?.sheetUrl).filter(Boolean)
    ])];

    // ── Step 2: fetch sheets as blob → untainted Image ──
    const cleanSheets = new Map();
    await Promise.all(sheetUrls.map(url =>
      fetch(url)
        .then(r => r.blob())
        .then(blob => {
          const bu = URL.createObjectURL(blob);
          return new Promise(res => {
            const img = new Image();
            img.onload  = () => { cleanSheets.set(url, img); URL.revokeObjectURL(bu); res(); };
            img.onerror = () => { URL.revokeObjectURL(bu); res(); };
            img.src = bu;
          });
        })
        .catch(() => {})
    ));

    // ── Step 3: create clean export canvas ──
    const exp  = document.createElement("canvas");
    exp.width  = COLS * TS;
    exp.height = ROWS * TS;
    const ctx  = exp.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, exp.width, exp.height);

    // ── helper: draw one tile using cleanSheets ──
    function _drawClean(id, px, py, mask) {
      const t = tileMap.get(id);
      if (!t) return;
      if (t.sheetUrl && cleanSheets.has(t.sheetUrl)) {
        const sh = cleanSheets.get(t.sheetUrl);
        if (t.autoTile) {
          const sp = (t.sprites || [])[mask !== undefined ? mask : 0];
          if (sp && typeof sp === "object" && sp.w > 0)
            ctx.drawImage(sh, sp.x, sp.y, sp.w, sp.h, px, py, TS, TS);
        } else {
          ctx.drawImage(sh, t.sx, t.sy, t.sw, t.sh, px, py, TS, TS);
        }
      } else if (t.img) {
        try { ctx.drawImage(t.img, px, py, TS, TS); } catch (_) {}
      }
    }

    // ── helper: render one full map layer ──
    function _renderLayer(lmap) {
      if (!lmap || !lmap.length) return;

      // Pass 1 — regular tiles
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const id = lmap[r][c]; if (!id) continue;
          const t  = tileMap.get(id); if (!t || t.autoTile || t.dualTile) continue;
          _drawClean(id, c * TS, r * TS);
        }
      }

      // Pass 2 — dual grid
      dualTiles.forEach(dt => {
        const compat = dt.compatibleWith || [];
        const sh     = dt.sheetUrl ? cleanSheets.get(dt.sheetUrl) : null;
        function dc(nid) { return nid === dt.id || compat.includes(nid); }
        for (let r = 0; r < ROWS - 1; r++) {
          for (let c = 0; c < COLS - 1; c++) {
            const mask =
              (dc(lmap[r    ][c    ]) ? 1 : 0) |
              (dc(lmap[r    ][c + 1]) ? 2 : 0) |
              (dc(lmap[r + 1][c    ]) ? 4 : 0) |
              (dc(lmap[r + 1][c + 1]) ? 8 : 0);
            if (!mask) continue;
            if (sh && dt.sprites) {
              const sp = dt.sprites[mask];
              if (sp && typeof sp === "object")
                ctx.drawImage(sh, sp.x, sp.y, sp.w, sp.h, (c + 0.5) * TS, (r + 0.5) * TS, TS, TS);
            } else if (dt.imgs && dt.imgs[mask]) {
              try { ctx.drawImage(dt.imgs[mask], (c + 0.5) * TS, (r + 0.5) * TS, TS, TS); } catch (_) {}
            }
          }
        }
      });

      // Pass 3 — autotiles
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const id = lmap[r][c]; if (!id) continue;
          const t  = tileMap.get(id); if (!t?.autoTile) continue;
          if (t.baseTileId) _drawClean(t.baseTileId, c * TS, r * TS);
          _drawClean(id, c * TS, r * TS, getBitmask(c, r, id, lmap));
        }
      }
    }

    // ── Step 4: render base + overlay layers ──
    _renderLayer(map);
    if (overlayMap && overlayMap.length) _renderLayer(overlayMap);

    // ── Step 5: draw placed objects ──
    objects.forEach(obj => {
      const def = tileMap.get(obj.id);
      const ow  = (obj.cols || 1) * TS;
      const oh  = (obj.rows || 1) * TS;
      if (def?.sheetUrl && cleanSheets.has(def.sheetUrl)) {
        const sh = cleanSheets.get(def.sheetUrl);
        ctx.drawImage(sh, def.sx, def.sy, def.sw, def.sh, obj.x * TS, obj.y * TS, ow, oh);
      } else if (obj.img) {
        try { ctx.drawImage(obj.img, obj.x * TS, obj.y * TS, ow, oh); } catch (_) {}
      }
    });

    // ── Step 6: export ──
    const fname = (currentProjectName || "rpg-map").replace(/[^a-zA-Z0-9ა-ჿ_\-]/g, "_");
    exp.toBlob(blob => {
      if (!blob) { toast("❌ PNG: toBlob ვერ შესრულდა"); return; }
      downloadFile(blob, fname + ".png", "image/png");
      toast("🖼 " + fname + ".png — მზადაა!");
    }, "image/png");

  } catch (e) {
    console.error("PNG export error:", e);
    toast("❌ PNG: " + e.message);
  }
}

// ── WINDOW BINDINGS ──
window.exportPNG = exportPNG;
