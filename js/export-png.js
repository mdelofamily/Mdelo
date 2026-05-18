// ============================================================
//  export-png.js  —  PNG Export
//  Depends on: state.js, tile-engine.js, render.js
//  NOTE: never draws from offscreen (tainted). Re-renders
//        everything from fresh fetch()-ed blobs (no CORS error).
// ============================================================

async function exportPNG() {
  try {
    toast("🖼 PNG მზადდება...");

    // ── Step 1: collect all sheet URLs ──
    const allTiles = [...customTiles, ...autoTiles, ...dualTiles];
    const sheetUrls = [...new Set([
      ...allTiles.filter(t => t.sheetUrl).map(t => t.sheetUrl),
      ...objects.map(o => tileMap.get(o.id)?.sheetUrl).filter(Boolean)
    ])];

    // ── Step 2: fetch → blob → untainted Image ──
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

    // ── Step 3: create export canvas ──
    const exp  = document.createElement("canvas");
    exp.width  = COLS * TS;
    exp.height = ROWS * TS;
    const ctx  = exp.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, exp.width, exp.height);

    // ── helper: draw one tile ──
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

    // ── helper: render one layer ──
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

    // ── Step 4: render tile layers ──
    _renderLayer(map);
    if (overlayMap && overlayMap.length) _renderLayer(overlayMap);

    // ── Step 5: draw objects ──
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

    // ── Step 6: draw object labels (title or lb) ──
    const FONT_SIZE = Math.max(9, Math.round(TS * 0.38));
    ctx.font        = `bold ${FONT_SIZE}px sans-serif`;
    ctx.textAlign   = "left";
    ctx.textBaseline = "top";

    objects.forEach(obj => {
      const label = (obj.title || obj.lb || "").trim();
      if (!label) return;

      const ow = (obj.cols || 1) * TS;
      const ox = obj.x * TS;
      const oy = obj.y * TS;

      const metrics  = ctx.measureText(label);
      const textW    = Math.ceil(metrics.width);
      const textH    = FONT_SIZE;
      const PAD      = 3;
      const boxW     = textW + PAD * 2;
      const boxH     = textH + PAD * 2;

      // center above object
      const bx = ox + Math.round((ow - boxW) / 2);
      const by = oy - boxH - 2;

      // clamp to canvas
      const fx = Math.max(0, Math.min(exp.width  - boxW, bx));
      const fy = Math.max(0, Math.min(exp.height - boxH, by));

      // dark pill background
      ctx.fillStyle = "rgba(0,0,0,0.72)";
      _roundRect(ctx, fx, fy, boxW, boxH, 3);
      ctx.fill();

      // white text
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, fx + PAD, fy + PAD);
    });

    // ── Step 7: download ──
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

// ── rounded rect helper (no Path2D needed) ──
function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── WINDOW BINDINGS ──
window.exportPNG   = exportPNG;
window._roundRect  = _roundRect;
