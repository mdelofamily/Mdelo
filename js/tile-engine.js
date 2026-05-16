// ============================================================
//  tile-engine.js  —  Tile Drawing & Auto/Dual-Grid Logic
//  Depends on: state.js
// ============================================================

// ── FALLBACK DRAW (unknown tile ID → dark placeholder) ──
function drawB(ctx, id, ox, oy, s) {
  ctx.save();
  ctx.translate(ox, oy);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#1a1a2e"; ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = "#2a2a4e";
  ctx.fillRect(1, 1, s - 2, 1);
  ctx.fillRect(1, 1, 1, s - 2);
  ctx.restore();
}

// ── 4-BIT BITMASK for autotile neighbour detection ──
// Bits: N=1, E=2, S=4, W=8
function getBitmask(col, row, id, m) {
  m = m || map;
  const t = tileMap.get(id);
  const compat = t?.compatibleWith || [];
  function connects(nid) { return nid === id || compat.includes(nid); }
  let bm = 0;
  if (row > 0       && connects(m[row - 1][col])) bm |= 1;
  if (col < COLS-1  && connects(m[row][col + 1])) bm |= 2;
  if (row < ROWS-1  && connects(m[row + 1][col])) bm |= 4;
  if (col > 0       && connects(m[row][col - 1])) bm |= 8;
  return bm;
}

// ── MAIN TILE DRAW ──
function drawTile(ctx, id, ox, oy, s, mask) {
  const t = tileMap.get(id);
  if (!t) { drawB(ctx, id, ox, oy, s); return; }

  // dual tile — always draw full sprite (mask 15 preferred)
  if (t.dualTile) {
    const img = t.imgs[15] || t.imgs.find(Boolean);
    if (img) {
      ctx.save(); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, ox, oy, s, s);
      ctx.restore();
    } else if (t.sheetImg) {
      const sp = t.sprites && (t.sprites[15] || t.sprites.find(Boolean));
      if (sp && typeof sp === 'object') {
        ctx.save(); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(t.sheetImg, sp.x, sp.y, sp.w, sp.h, ox, oy, s, s);
        ctx.restore();
      } else drawB(ctx, id, ox, oy, s);
    } else drawB(ctx, id, ox, oy, s);
    return;
  }

  // autotile
  if (t.autoTile) {
    const idx = (mask !== undefined) ? mask : 0;
    const img = t.imgs[idx];
    if (img) {
      ctx.save(); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, ox, oy, s, s);
      ctx.restore();
    } else if (t.sheetImg && t.sprites) {
      const sp = t.sprites[idx];
      if (sp && typeof sp === 'object' && sp.w > 0 && sp.h > 0) {
        ctx.save(); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(t.sheetImg, sp.x, sp.y, sp.w, sp.h, ox, oy, s, s);
        ctx.restore();
      }
    }
    return;
  }

  // regular tile — spritesheet coord
  if (t.sheetImg) {
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(t.sheetImg, t.sx, t.sy, t.sw, t.sh, ox, oy, s, s);
    ctx.restore();
    return;
  }

  // regular tile — pre-loaded Image
  if (t.img) {
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(t.img, ox, oy, s, s);
    ctx.restore();
    return;
  }

  drawB(ctx, id, ox, oy, s);
}

// ── GET IMAGE for a tile (returns HTMLImageElement or Canvas) ──
function getImg(id) {
  const t = tileMap.get(id);
  if (!t) return null;
  if (t.img) return t.img;
  if (t.sheetImg) {
    // slice from sheet into a cached canvas so drawImage never needs coords
    const cv = document.createElement("canvas");
    cv.width  = t.cols ? t.cols * TS : (t.sw || TS);
    cv.height = t.rows ? t.rows * TS : (t.sh || TS);
    cv.getContext("2d").drawImage(t.sheetImg, t.sx, t.sy, t.sw, t.sh, 0, 0, cv.width, cv.height);
    t.img = cv; // cache so next call is instant
    return cv;
  }
  return null;
}

// ── DUAL-GRID RENDERER ──
// Grid B cell (r,c) covers four data corners: [r][c] [r][c+1] [r+1][c] [r+1][c+1]
// Corner bitmask: TL=1, TR=2, BL=4, BR=8
// mask 0  → no corners match → skip
// mask 15 → fully filled
function renderDualGrid(ctx, m) {
  m = m || map;
  dualTiles.forEach(dt => {
    const compat = dt.compatibleWith || [];
    function dc(nid) { return nid === dt.id || compat.includes(nid); }

    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        const mask =
          (dc(m[r    ][c    ]) ? 1 : 0) |
          (dc(m[r    ][c + 1]) ? 2 : 0) |
          (dc(m[r + 1][c    ]) ? 4 : 0) |
          (dc(m[r + 1][c + 1]) ? 8 : 0);
        if (mask === 0) continue;

        ctx.imageSmoothingEnabled = false;
        const img = dt.imgs[mask];
        if (img) {
          ctx.drawImage(img, (c + 0.5) * TS, (r + 0.5) * TS, TS, TS);
        } else if (dt.sheetImg && dt.sprites) {
          const sp = dt.sprites[mask];
          if (sp && typeof sp === 'object') {
            ctx.drawImage(dt.sheetImg, sp.x, sp.y, sp.w, sp.h,
              (c + 0.5) * TS, (r + 0.5) * TS, TS, TS);
          }
        }
      }
    }
  });
}

// ── WINDOW BINDINGS ──
window.drawB          = drawB;
window.getBitmask     = getBitmask;
window.drawTile       = drawTile;
window.getImg         = getImg;
window.renderDualGrid = renderDualGrid;
