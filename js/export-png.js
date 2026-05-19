// ============================================================
//  export-png.js  —  PNG Export
//  Depends on: state.js, tile-engine.js, render.js
//  Labels: o.title only (popup menu), speech bubble with arrow
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

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const id = lmap[r][c]; if (!id) continue;
          const t  = tileMap.get(id); if (!t || t.autoTile || t.dualTile) continue;
          _drawClean(id, c * TS, r * TS);
        }
      }

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

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const id = lmap[r][c]; if (!id) continue;
          const t  = tileMap.get(id); if (!t?.autoTile) continue;
          if (t.baseTileId) _drawClean(t.baseTileId, c * TS, r * TS);
          _drawClean(id, c * TS, r * TS, getBitmask(c, r, id, lmap));
        }
      }
    }

    // ── Step 4: render layers ──
    _renderLayer(map);
    if (overlayMap && overlayMap.length) _renderLayer(overlayMap);

    // ── Step 5: draw objects ──
    objects.forEach(obj => {
      const def = tileMap.get(obj.id);
      const ow  = (obj.cols || 1) * TS;
      const oh  = (obj.rows || 1) * TS;
      if (def?.sheetUrl && cleanSheets.has(def.sheetUrl)) {
        ctx.drawImage(cleanSheets.get(def.sheetUrl),
          def.sx, def.sy, def.sw, def.sh,
          obj.x * TS, obj.y * TS, ow, oh);
      } else if (obj.img) {
        try { ctx.drawImage(obj.img, obj.x * TS, obj.y * TS, ow, oh); } catch (_) {}
      }
    });

    // ── Step 6: draw speech bubble labels (o.title only) ──
    const FONT_SIZE = Math.max(10, Math.round(TS * 0.4));
    const PAD_X     = 7;
    const PAD_Y     = 5;
    const RADIUS    = 5;
    const ARROW_H   = 7;   // arrow height pointing down toward object
    const ARROW_W   = 8;   // arrow half-width

    ctx.font         = `bold ${FONT_SIZE}px sans-serif`;
    ctx.textAlign    = "left";
    ctx.textBaseline = "top";

    objects.forEach(obj => {
      const label = (obj.title || "").trim();
      if (!label) return;

      const ow = (obj.cols || 1) * TS;
      const oh = (obj.rows || 1) * TS;
      const ox = obj.x * TS;
      const oy = obj.y * TS;

      const textW = ctx.measureText(label).width;
      const boxW  = Math.ceil(textW) + PAD_X * 2;
      const boxH  = FONT_SIZE + PAD_Y * 2;

      // bubble center X = object center, bubble sits above object
      const arrowTipY = oy - 2;                  // tip of arrow points here
      const bubbleY   = arrowTipY - ARROW_H - boxH;
      const bubbleCX  = ox + ow / 2;
      const bubbleX   = Math.max(1, Math.min(exp.width - boxW - 1, Math.round(bubbleCX - boxW / 2)));
      const arrowCX   = Math.max(bubbleX + RADIUS + ARROW_W + 1,
                        Math.min(bubbleX + boxW - RADIUS - ARROW_W - 1,
                        Math.round(bubbleCX)));

      const by = Math.max(1, bubbleY);

      // ── draw bubble + arrow as one path ──
      ctx.beginPath();
      // top-left corner
      ctx.moveTo(bubbleX + RADIUS, by);
      // top edge → top-right
      ctx.lineTo(bubbleX + boxW - RADIUS, by);
      ctx.quadraticCurveTo(bubbleX + boxW, by, bubbleX + boxW, by + RADIUS);
      // right edge → bottom-right
      ctx.lineTo(bubbleX + boxW, by + boxH - RADIUS);
      ctx.quadraticCurveTo(bubbleX + boxW, by + boxH, bubbleX + boxW - RADIUS, by + boxH);
      // bottom edge → arrow right
      ctx.lineTo(arrowCX + ARROW_W, by + boxH);
      // arrow pointing down
      ctx.lineTo(arrowCX, arrowTipY);
      ctx.lineTo(arrowCX - ARROW_W, by + boxH);
      // continue bottom edge → bottom-left
      ctx.lineTo(bubbleX + RADIUS, by + boxH);
      ctx.quadraticCurveTo(bubbleX, by + boxH, bubbleX, by + boxH - RADIUS);
      // left edge → top-left
      ctx.lineTo(bubbleX, by + RADIUS);
      ctx.quadraticCurveTo(bubbleX, by, bubbleX + RADIUS, by);
      ctx.closePath();

      // shadow
      ctx.shadowColor   = "rgba(0,0,0,0.45)";
      ctx.shadowBlur    = 4;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle     = "rgba(15,20,28,0.35)";
      ctx.fill();

      // border
      ctx.shadowColor = "transparent";
      ctx.shadowBlur  = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth   = 1;
      ctx.stroke();

      // text
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, bubbleX + PAD_X, by + PAD_Y);
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

// ── WINDOW BINDINGS ──
window.exportPNG = exportPNG;
