// ============================================================
//  render.js  —  Offscreen Buffer & Main Render Loop
//  Depends on: state.js, tile-engine.js
// ============================================================

// ── STATIC BG LAYER (satellite image on bgCanvas) ──
function drawBgLayer() {
  if (!bgImg) return;
  bgc.width  = COLS * TS;
  bgc.height = ROWS * TS;
  const bctx = bgc.getContext("2d");
  bctx.imageSmoothingEnabled  = true;
  bctx.imageSmoothingQuality  = "high";
  bctx.drawImage(bgImg, 0, 0, COLS * TS, ROWS * TS);
  bgLayerDirty = false;
}

// ── DRAW ONE CELL onto a context ──
function drawCell(ctx, col, row) {
  const id = map[row][col];
  if (!id) {
    ctx.clearRect(col * TS, row * TS, TS, TS);
    ctx.fillStyle = "#111";
    ctx.fillRect(col * TS, row * TS, TS, TS);
    return;
  }
  const _t = tileMap.get(id);
  if (_t?.autoTile && _t.baseTileId) {
    drawTile(ctx, _t.baseTileId, col * TS, row * TS, TS);
  }
  const mask = _t?.autoTile ? getBitmask(col, row, id) : undefined;
  drawTile(ctx, id, col * TS, row * TS, TS, mask);
}

// ── REBUILD OFFSCREEN BUFFER ──
// Full repaint of all layers onto offscreen canvas.
// Call whenever map data changes.
function rebuildOff() {
  if (!offscreen) offscreen = document.createElement("canvas");
  if (offscreen.width  !== COLS * TS) offscreen.width  = COLS * TS;
  if (offscreen.height !== ROWS * TS) offscreen.height = ROWS * TS;

  offCtx = offscreen.getContext("2d");
  offCtx.imageSmoothingEnabled = false;
  offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
  offCtx.fillStyle = "#3a5c2a";
  offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

  // clip to exact map bounds — dual grid overflow will be cut at edges
  offCtx.save();
  offCtx.beginPath();
  offCtx.rect(0, 0, COLS * TS, ROWS * TS);
  offCtx.clip();

  // ── BASE LAYER ──
  // Pass 1: non-auto, non-dual tiles
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const id = map[r][c]; if (!id) continue;
      const t = tileMap.get(id); if (!t || t.autoTile || t.dualTile) continue;
      drawTile(offCtx, id, c * TS, r * TS, TS);
    }
  }
  // Pass 2: dual grid (clipped — no overflow at edges)
  if (dualTiles.length > 0) renderDualGrid(offCtx, map);
  // Pass 3: autotiles
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const id = map[r][c]; if (!id) continue;
      const t = tileMap.get(id); if (!t?.autoTile) continue;
      if (t.baseTileId) drawTile(offCtx, t.baseTileId, c * TS, r * TS, TS);
      drawTile(offCtx, id, c * TS, r * TS, TS, getBitmask(c, r, id, map));
    }
  }

  // ── OVERLAY LAYER ──
  if (!overlayMap.length) { offCtx.restore(); return; }
  // Pass 4: overlay non-auto, non-dual
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const id = overlayMap[r]?.[c]; if (!id) continue;
      const t = tileMap.get(id); if (!t || t.autoTile || t.dualTile) continue;
      drawTile(offCtx, id, c * TS, r * TS, TS);
    }
  }
  // Pass 5: overlay dual grid (clipped)
  if (dualTiles.length > 0) renderDualGrid(offCtx, overlayMap);
  // Pass 6: overlay autotiles
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const id = overlayMap[r]?.[c]; if (!id) continue;
      const t = tileMap.get(id); if (!t?.autoTile) continue;
      if (t.baseTileId) drawTile(offCtx, t.baseTileId, c * TS, r * TS, TS);
      drawTile(offCtx, id, c * TS, r * TS, TS, getBitmask(c, r, id, overlayMap));
    }
  }

  offCtx.restore(); // remove clip
}

// ── MAIN RENDER ──
function render() {
  const W = cw.clientWidth, H = cw.clientHeight;
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width  = W; canvas.height = H;
    canvas.style.width  = W + "px";
    canvas.style.height = H + "px";
  }

  const ctx = mainCtx;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);

  // 1) tiles (from offscreen buffer)
  ctx.save();
  ctx.translate(viewX, viewY);
  ctx.scale(zoom, zoom);
  ctx.drawImage(offscreen, 0, 0);

  if (showGrid && zoom >= 0.5) {
    ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let c = 0; c <= COLS; c++) { ctx.moveTo(c * TS, 0); ctx.lineTo(c * TS, ROWS * TS); }
    for (let r = 0; r <= ROWS; r++) { ctx.moveTo(0, r * TS); ctx.lineTo(COLS * TS, r * TS); }
    ctx.stroke();
  }
  ctx.restore();

  // 2) objects layer
  ctx.save();
  ctx.translate(viewX, viewY);
  ctx.scale(zoom, zoom);

  objects.forEach(obj => {
    const src = getImg(obj.id) || obj.img;
    if (src) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, obj.x * TS, obj.y * TS, obj.cols * TS, obj.rows * TS);
    }
  });

  // object markers
  objects.forEach(obj => {
    if (!obj.marker) return;
    const cx = (obj.x + obj.cols / 2) * TS;
    const cy = (obj.y + obj.rows / 2) * TS;
    const fs = Math.max(12, Math.round(18 / zoom));
    ctx.save();
    ctx.font = "bold " + fs + "px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const col = obj.marker === "!" ? "#f0a500" : obj.marker === "?" ? "#e0e0e0" : "#4ade80";
    ctx.strokeStyle = "rgba(0,0,0,0.95)";
    ctx.lineWidth = fs * 0.3; ctx.lineJoin = "round";
    ctx.strokeText(obj.marker, cx, cy);
    ctx.fillStyle = col;
    ctx.fillText(obj.marker, cx, cy);
    ctx.restore();
  });

  // obj_place preview
  if ((curTool === "obj_place") && (lockedPos || hoverCell)) {
    const obj = getObjDef(curTile);
    if (obj) {
      const refCell = lockedPos || hoverCell;
      const { x, y } = objAnchor(refCell.col, refCell.row, obj.cols, obj.rows);
      const ok = inB(x, y) && inB(x + obj.cols - 1, y + obj.rows - 1);
      const tileImg = getImg(curTile);
      if (tileImg) {
        ctx.globalAlpha = 0.65; ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tileImg, x * TS, y * TS, obj.cols * TS, obj.rows * TS);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = ok ? "#4ade80" : "#f85149"; ctx.lineWidth = 1.5 / zoom;
        ctx.strokeRect(x * TS, y * TS, obj.cols * TS, obj.rows * TS);
        const ch = lockedPos || hoverCell;
        const chx = ch.col * TS + TS / 2, chy = ch.row * TS + TS / 2, cs = 4 / zoom;
        ctx.strokeStyle = lockedPos ? "#f0a500" : "rgba(255,255,255,0.8)";
        ctx.lineWidth = lockedPos ? 2 / zoom : 1 / zoom;
        ctx.beginPath(); ctx.moveTo(chx - cs, chy); ctx.lineTo(chx + cs, chy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(chx, chy - cs); ctx.lineTo(chx, chy + cs); ctx.stroke();
        if (lockedPos) {
          ctx.fillStyle = "#f0a500";
          ctx.font = "bold " + (8 / zoom) + "px monospace";
          ctx.fillText("tap ჩასასმელად", x * TS + 2 / zoom, y * TS - 2 / zoom);
        }
      }
    }
  }

  // obj_move selection outline
  if (curTool === "obj_move" && selectedObj !== null && objects[selectedObj]) {
    const o = objects[selectedObj];
    ctx.strokeStyle = "#f0a500"; ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([5 / zoom, 3 / zoom]);
    ctx.strokeRect(o.x * TS, o.y * TS, o.cols * TS, o.rows * TS);
    ctx.setLineDash([]);
  }

  // 2b) area hotspots
  const previewArea =
    _pendingArea && hoverCell
      ? { x1: Math.min(_pendingArea.x1, hoverCell.col),
          y1: Math.min(_pendingArea.y1, hoverCell.row),
          x2: Math.max(_pendingArea.x1, hoverCell.col) + 1,
          y2: Math.max(_pendingArea.y1, hoverCell.row) + 1 }
      : (touchState?._areaStart && touchState?._areaEnd)
        ? { x1: Math.min(touchState._areaStart.x1, touchState._areaEnd.col),
            y1: Math.min(touchState._areaStart.y1, touchState._areaEnd.row),
            x2: Math.max(touchState._areaStart.x1, touchState._areaEnd.col) + 1,
            y2: Math.max(touchState._areaStart.y1, touchState._areaEnd.row) + 1 }
        : null;

  const allAreas = [...hotAreas, ...(previewArea ? [{ ...previewArea, _preview: true }] : [])];

  // grouped areas (union fill)
  const drawnGroups = new Set();
  allAreas.filter(a => a.groupId && !a._preview).forEach(a => {
    if (drawnGroups.has(a.groupId)) return;
    drawnGroups.add(a.groupId);
    const members = hotAreas.filter(x => x.groupId === a.groupId);
    ctx.beginPath();
    members.forEach(m => ctx.rect(m.x1 * TS, m.y1 * TS, (m.x2 - m.x1) * TS, (m.y2 - m.y1) * TS));
    ctx.fillStyle = "rgba(240,165,0,0.08)"; ctx.fill();
    ctx.strokeStyle = "#f0a500"; ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([6 / zoom, 4 / zoom]); ctx.stroke(); ctx.setLineDash([]);
    if (a.label) {
      const m0 = members[0];
      const ax = m0.x1 * TS, ay = m0.y1 * TS, aw = (m0.x2 - m0.x1) * TS, ah = (m0.y2 - m0.y1) * TS;
      const fs = Math.max(8, 11 / zoom);
      ctx.font = "bold " + fs + "px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#f0a500"; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.lineWidth = 2 / zoom;
      ctx.strokeText(a.label, ax + aw / 2, ay + ah / 2);
      ctx.fillText(a.label, ax + aw / 2, ay + ah / 2);
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    }
  });

  // non-grouped areas
  allAreas.filter(a => !a.groupId || a._preview).forEach(a => {
    const ax = a.x1 * TS, ay = a.y1 * TS, aw = (a.x2 - a.x1) * TS, ah = (a.y2 - a.y1) * TS;
    const col = a._preview ? "#facc15" : "#58a6ff";
    ctx.strokeStyle = col; ctx.lineWidth = (a._preview ? 2 : 1.5) / zoom;
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.strokeRect(ax, ay, aw, ah);
    ctx.fillStyle = a._preview ? "rgba(250,204,21,0.12)" : "rgba(88,166,255,0.07)";
    ctx.fillRect(ax, ay, aw, ah);
    ctx.setLineDash([]);
    if (a.label && !a._preview) {
      const fs = Math.max(8, 11 / zoom);
      ctx.font = "bold " + fs + "px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = col; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.lineWidth = 2 / zoom;
      ctx.strokeText(a.label, ax + aw / 2, ay + ah / 2);
      ctx.fillText(a.label, ax + aw / 2, ay + ah / 2);
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    }
  });

  ctx.restore();

  // 3) satellite bg overlay
  if (bgImg && bgVis && bgOp > 0) {
    if (bgLayerDirty) drawBgLayer();
    ctx.save();
    ctx.globalAlpha = bgOp;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bgc, viewX, viewY, COLS * TS * zoom, ROWS * TS * zoom);
    ctx.restore();
  }
}

// ── WINDOW BINDINGS ──
window.drawBgLayer = drawBgLayer;
window.drawCell    = drawCell;
window.rebuildOff  = rebuildOff;
window.render      = render;
