// ============================================================
//  tools.js  —  Drawing Tools, Input Handlers, BG Controls
//  Depends on: state.js, tile-engine.js, render.js
// ============================================================

// ── PAINTING ──
function paintAt(col, row) {
  if (!inB(col, row)) return;
  const t = (curTool === "erase") ? "" : curTile;
  const h = Math.floor(brushSz / 2);
  const amap = getActiveMap();
  const changed = [];
  for (let dr = -h; dr <= h; dr++) {
    for (let dc = -h; dc <= h; dc++) {
      const r = row + dr, c = col + dc;
      if (inB(c, r) && amap[r][c] !== t) { amap[r][c] = t; changed.push([c, r]); }
    }
  }
  if (!changed.length) { scheduleRender(); return; }
  rebuildOff();
  scheduleRender();
}

function floodFill(col, row) {
  if (!inB(col, row)) return;
  const amap = getActiveMap();
  const tg = amap[row][col], fl = curTile;
  if (tg === fl) return;
  const stk = [[col, row]];
  while (stk.length) {
    const [c, r] = stk.pop();
    if (!inB(c, r) || amap[r][c] !== tg) continue;
    amap[r][c] = fl;
    stk.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  rebuildOff();
  scheduleRender();
}

// ── LAYER ──
function setLayer(l) {
  activeLayer = l;
  document.getElementById("lpBtn-base").className    = l === "base"    ? "active" : "";
  document.getElementById("lpBtn-overlay").className = l === "overlay" ? "active" : "";
  toast(l === "base" ? "🌍 Base layer" : "✨ Overlay layer");
}

function openLayerPopup(chipEl) {
  const pop = document.getElementById("layerPopup");
  const r = chipEl.getBoundingClientRect();
  pop.style.display = "flex";
  pop.style.left = Math.min(r.left, window.innerWidth - 160) + "px";
  pop.style.top  = (r.top - pop.offsetHeight - 6) + "px";
  document.getElementById("lpBtn-base").className    = activeLayer === "base"    ? "active" : "";
  document.getElementById("lpBtn-overlay").className = activeLayer === "overlay" ? "active" : "";
  setTimeout(() => document.addEventListener("touchstart", closeLayerPopupOutside, { once: true, passive: true }), 100);
}
function closeLayerPopup() { document.getElementById("layerPopup").style.display = "none"; }
function closeLayerPopupOutside(e) {
  if (!document.getElementById("layerPopup").contains(e.target)) closeLayerPopup();
}

// ── TOOL SELECTION ──
function setTool(t) {
  curTool = t;
  lockedPos = null;
  _pendingArea = null;
  document.getElementById("areaCursor").style.display = "none";
  if (t !== "obj_move") { selectedObj = null; dragObjStart = null; }
  ["draw", "fill", "erase", "pick", "area"].forEach(id => {
    const el = document.getElementById("tl-" + id);
    if (el) el.classList.toggle("on", id === t);
  });
}

function setBrush(n, el) {
  brushSz = n;
  document.querySelectorAll(".bdot").forEach(b => b.classList.remove("on"));
  if (el) el.classList.add("on");
}

// ── UNDO ──
function undo() {
  if (!hist.length) { toast("↩"); return; }
  const s = hist.pop();
  map        = s.map;
  overlayMap = s.overlayMap || map.map(r => Array(COLS).fill(""));
  objects    = s.objects || [];
  rebuildOff();
  scheduleRender();
  toast("↩ Undo");
}

// ── CLEAR MAP ──
function clearMap() {
  if (!confirm("რუკა გაიწმინდოს?")) return;
  pushH();
  map        = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
  overlayMap = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
  objects    = [];
  hotAreas   = [];
  rebuildOff();
  scheduleRender();
  toast("🗑 რუკა გაიწმინდა");
}

// ── BG CONTROLS ──
function toggleBgPanel() {
  if (!bgImg) { document.getElementById("bgf").click(); return; }
  const bar = document.getElementById("bgbar");
  const isOpen = bar.classList.toggle("show");
  document.getElementById("bgToggleBtn").classList.toggle("on", isOpen);
}
function loadBg(e) {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = ev => {
    const img = new Image();
    img.onload = () => {
      bgImg = img; bgVis = true; bgLayerDirty = true;
      document.getElementById("bgvbtn").textContent = "👁 on";
      toast("🛰 " + img.width + "×" + img.height);
      scheduleRender();
    };
    img.src = ev.target.result;
  };
  rd.readAsDataURL(f); e.target.value = "";
}
function setBgOp(v) {
  bgOp = v / 100;
  document.getElementById("bgOpV").textContent = v + "%";
  scheduleRender();
}
function toggleBgVis() {
  bgVis = !bgVis;
  document.getElementById("bgvbtn").textContent = bgVis ? "👁 on" : "👁 off";
  scheduleRender();
}
function removeBg() {
  bgImg = null; bgLayerDirty = true;
  document.getElementById("bgbar").classList.remove("show");
  document.getElementById("bgToggleBtn").classList.remove("on");
  scheduleRender();
  toast("🛰 ფონი წაიშალა");
}
function fitToBg() {
  if (!bgImg) { toast("ჯერ ფონი ჩატვირთე"); return; }
  const ratio   = bgImg.width / bgImg.height;
  const newCols = Math.round(ROWS * ratio);
  if (!confirm("რუკა → " + newCols + "×" + ROWS + "?\n(სურათის პროპორცია)")) return;
  const nm = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: newCols }, (_, c) => (c < COLS ? map[r][c] : "water")));
  COLS = newCols; map = nm; hist = []; bgLayerDirty = true;
  rebuildOff(); centerView(); scheduleRender();
  toast("✓ " + COLS + "×" + ROWS);
}

// ── SPOT POPUP ──
function showSpotPopup(col, row, clientX, clientY) {
  _spotCell = { col, row }; _spotZoom = 1;
  document.getElementById("spotCoords").textContent = "Col: " + col + "   Row: " + row;
  document.querySelectorAll(".szBtn").forEach(b => b.classList.toggle("on", +b.dataset.z === _spotZoom));
  const inp = document.getElementById("spotBaseUrlInp");
  if (inp) inp.value = spotBaseUrl;
  const popup = document.getElementById("spotPopup");
  popup.style.display = "flex";
  const pw = 260, ph = 160;
  let left = clientX + 12, top = clientY - ph / 2;
  left = Math.min(window.innerWidth - pw - 8, Math.max(8, left));
  top  = Math.max(8, Math.min(window.innerHeight - ph - 8, top));
  popup.style.left = left + "px"; popup.style.top = top + "px";
  popup.classList.add("show");
}
function closeSpotPopup() {
  const p = document.getElementById("spotPopup");
  p.classList.remove("show"); p.style.display = "none";
}
function setSpotZoom(btn) {
  _spotZoom = +btn.dataset.z;
  document.querySelectorAll(".szBtn").forEach(b => b.classList.toggle("on", b === btn));
}
function copySpotLink() {
  const hash = "#spot=" + _spotCell.col + "," + _spotCell.row + "," + _spotZoom;
  const base  = spotBaseUrl || "";
  const full  = base ? base + hash : hash;
  const done  = () => toast("📋 დაკოპირდა!");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(full).then(done).catch(() => { _copyFallback(full); done(); });
  } else { _copyFallback(full); done(); }
  closeSpotPopup();
}

// ── TOUCH HANDLERS ──
// Safety: define _areaAtCell here in case ui-areas.js fails to load
if (typeof _areaAtCell === 'undefined') {
  window._areaAtCell = function(col, row) {
    return hotAreas.findIndex(function(a) {
      return col >= a.x1 && col < a.x2 && row >= a.y1 && row < a.y2;
    });
  };
}
if (typeof openAreaProps === 'undefined') {
  window.openAreaProps = function(idx) {
    window._editingAreaIdx = idx;
    var a = hotAreas[idx];
    document.getElementById('areaLabelInp').value   = a.label   || '';
    document.getElementById('areaTooltipInp').value = a.tooltip || '';
    var mr = document.getElementById('areaMergeInfo');
    if (mr) mr.style.display = 'none';
    var lr = document.getElementById('areaLinkRow');
    if (lr) {
      var lbl = a.label || '';
      lr.style.display = lbl ? 'flex' : 'none';
      if (lbl) document.getElementById('areaLinkOut').value = '#area=' + encodeURIComponent(lbl);
    }
    document.getElementById('areaPropsModal').style.display = 'flex';
  };
}
if (typeof closeAreaProps === 'undefined') {
  window.closeAreaProps = function() {
    document.getElementById('areaPropsModal').style.display = 'none';
    window._editingAreaIdx = -1;
  };
}
if (typeof saveAreaProps === 'undefined') {
  window.saveAreaProps = function() {
    var idx = window._editingAreaIdx;
    if (idx >= 0 && idx < hotAreas.length) {
      hotAreas[idx].label   = document.getElementById('areaLabelInp').value.trim();
      hotAreas[idx].tooltip = document.getElementById('areaTooltipInp').value.trim();
    }
    closeAreaProps();
    scheduleRender();
    toast('ok shenahuliao');
  };
}
if (typeof deleteArea === 'undefined') {
  window.deleteArea = function() {
    var idx = window._editingAreaIdx;
    if (idx < 0) return;
    hotAreas.splice(idx, 1);
    document.getElementById('areaPropsModal').style.display = 'none';
    window._editingAreaIdx = -1;
    scheduleRender();
    toast('ok washlesao');
  };
}
function tp(t) {
  const r = canvas.getBoundingClientRect();
  return { x: t.clientX - r.left, y: t.clientY - r.top };
}
function d2(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

canvas.addEventListener("touchstart", e => {
  e.preventDefault();
  if (e.touches.length === 1) {
    const p = tp(e.touches[0]);
    const _ltX = p.x, _ltY = p.y;
    const _ltTimer = setTimeout(() => {
      if (touchState && !touchState.moved) {
        const { col, row } = toCell(_ltX, _ltY);
        if (inB(col, row)) {
          touchState._suppressTap = true;
          showSpotPopup(col, row, _ltX, _ltY);
        }
      }
    }, 600);
    touchState = { sx: p.x, sy: p.y, vx: viewX, vy: viewY, moved: false, histPushed: false, _longTimer: _ltTimer };

    const { col, row } = toCell(p.x, p.y);
    if (curTool === "pick") {
      if (inB(col, row)) { selectTile(map[row][col]); setTool("draw"); toast("💉 " + tileMap.get(map[row][col])?.lb); }
      touchState = null; return;
    }
    if (curTool === "fill") { pushH(); floodFill(col, row); setTool("pick"); touchState = null; return; }
    if (curTool === "area") {
      const idx = _areaAtCell(col, row);
      if (idx >= 0) { openAreaProps(idx); touchState = null; return; }
      touchState._areaStart = { x1: col, y1: row };
      return;
    }
    if (curTool === "obj_place" || curTool === "obj_move") { hoverCell = { col, row }; scheduleRender(); }
  } else if (e.touches.length === 2) {
    touchState = null;
    const a = tp(e.touches[0]), b = tp(e.touches[1]);
    pD0 = d2(a, b); pZ0 = zoom;
    pMX = (a.x + b.x) / 2; pMY = (a.y + b.y) / 2;
    pVX = viewX; pVY = viewY;
  }
}, { passive: false });

canvas.addEventListener("touchmove", e => {
  e.preventDefault();
  if (e.touches.length === 1 && touchState) {
    const p = tp(e.touches[0]);
    const dx = p.x - touchState.sx, dy = p.y - touchState.sy;
    if (!touchState.moved && Math.hypot(dx, dy) > PAN_THRESH) {
      touchState.moved = true;
      if (touchState._longTimer) { clearTimeout(touchState._longTimer); touchState._longTimer = null; }
    }
    const { col: tc, row: tr } = toCell(p.x, p.y);
    hoverCell = { col: tc, row: tr };

    if (curTool === "obj_move" && selectedObj !== null && dragObjStart) {
      if (touchState._longTimer) { clearTimeout(touchState._longTimer); touchState._longTimer = null; }
      const dx2 = tc - dragObjStart.col, dy2 = tr - dragObjStart.row;
      const o = objects[selectedObj];
      const nx = dragObjStart.ox + dx2, ny = dragObjStart.oy + dy2;
      if (canPlace(nx, ny, o.cols, o.rows, selectedObj)) { o.x = nx; o.y = ny; }
      scheduleRender();
    } else if (curTool === "obj_place") {
      scheduleRender();
    } else if (curTool === "area" && touchState._areaStart) {
      touchState.moved = true;
      touchState._areaEnd = { col: tc, row: tr };
      const s = touchState._areaStart;
      const x1 = Math.min(s.x1, tc), y1 = Math.min(s.y1, tr);
      const x2 = Math.max(s.x1, tc) + 1, y2 = Math.max(s.y1, tr) + 1;
      const ac = document.getElementById("areaCursor");
      ac.style.cssText = `display:block;left:${x1*TS*zoom+viewX}px;top:${y1*TS*zoom+viewY}px;width:${(x2-x1)*TS*zoom}px;height:${(y2-y1)*TS*zoom}px;border:2px dashed #facc15;background:rgba(250,204,21,0.1);`;
      scheduleRender();
    } else if (touchState.moved) {
      viewX = touchState.vx + dx; viewY = touchState.vy + dy;
      clamp(); scheduleRender();
    }
  } else if (e.touches.length === 2 && pD0) {
    const a = tp(e.touches[0]), b = tp(e.touches[1]);
    const newZoom = Math.max(0.25, Math.min(6, Math.round(pZ0 * (d2(a, b) / pD0) * 4) / 4));
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    viewX = mx - (pMX - pVX) * (newZoom / pZ0) - (mx - pMX);
    viewY = my - (pMY - pVY) * (newZoom / pZ0) - (my - pMY);
    zoom  = newZoom;
    clamp(); scheduleRender();
  }
}, { passive: false });

canvas.addEventListener("touchend", e => {
  e.preventDefault();
  if (e.touches.length === 0 && touchState) {
    if (touchState._longTimer) { clearTimeout(touchState._longTimer); touchState._longTimer = null; }
    if (touchState._suppressTap) { touchState = null; if (e.touches.length < 2) pD0 = null; return; }
    const { col, row } = toCell(touchState.sx, touchState.sy);
    document.getElementById("hx").textContent = col;
    document.getElementById("hy").textContent = row;

    if (curTool === "obj_place") {
      const tapCell = toCell(touchState.sx, touchState.sy);
      const idx = objAtCell(tapCell.col, tapCell.row);
      if (idx >= 0) {
        openObjProps(idx);
      } else if (lockedPos && lockedPos.col === tapCell.col && lockedPos.row === tapCell.row) {
        doPlaceObject(lockedPos.col, lockedPos.row); lockedPos = null;
      } else {
        lockedPos  = { col: tapCell.col, row: tapCell.row };
        hoverCell  = { col: tapCell.col, row: tapCell.row };
        scheduleRender();
      }
    } else if (curTool === "obj_move") {
      if (touchState.moved && dragObjStart) { pushH(); dragObjStart = null; }
      else if (!touchState.moved) { selectedObj = null; dragObjStart = null; curTool = "obj_place"; }
      scheduleRender();
    } else if (curTool === "area") {
      if (touchState._areaStart) {
        const s   = touchState._areaStart;
        const end = touchState._areaEnd || s;
        if (!touchState.moved) {
          const idx = _areaAtCell(s.x1, s.y1);
          if (idx >= 0) { openAreaProps(idx); touchState = null; return; }
        } else {
          const x1 = Math.min(s.x1, end.col), y1 = Math.min(s.y1, end.row);
          const x2 = Math.max(s.x1, end.col) + 1, y2 = Math.max(s.y1, end.row) + 1;
          if (x2 - x1 >= 1 && y2 - y1 >= 1) {
            const id = "area_" + Date.now();
            hotAreas.push({ id, x1, y1, x2, y2, label: "", tooltip: "" });
            _lastAreaId = id;
            document.getElementById("areaCursor").style.display = "none";
            openAreaProps(hotAreas.length - 1);
          }
        }
      }
      touchState = null;
    } else if (!touchState.moved) {
      if (curTool === "draw" || curTool === "erase") {
        if (inB(col, row)) { pushH(); paintAt(col, row); }
      }
    }
    touchState = null;
  }
  if (e.touches.length < 2) pD0 = null;
}, { passive: false });

// ── MOUSE HANDLERS ──
canvas.addEventListener("mousedown", e => {
  if (e.button !== 0) return;
  const { col, row } = toCell(e.offsetX, e.offsetY);
  if (curTool === "pick")     { if (inB(col, row)) { selectTile(map[row][col]); setTool("draw"); } return; }
  if (curTool === "fill")     { pushH(); floodFill(col, row); setTool("pick"); return; }
  if (curTool === "obj_place") {
    const idx = objAtCell(col, row);
    if (idx >= 0) openObjProps(idx); else doPlaceObject(col, row);
    return;
  }
  if (curTool === "obj_move") {
    const idx = objAtCell(col, row);
    if (idx >= 0) { selectedObj = idx; dragObjStart = { col, row, ox: objects[idx].x, oy: objects[idx].y }; mDraw = true; }
    else { selectedObj = null; dragObjStart = null; curTool = "obj_place"; }
    scheduleRender(); return;
  }
  if (curTool === "area") {
    const idx = _areaAtCell(col, row);
    if (idx >= 0) openAreaProps(idx); else _pendingArea = { x1: col, y1: row };
    return;
  }
  mDraw = true; pushH(); paintAt(col, row); lastC = { col, row };
});

canvas.addEventListener("mousemove", e => {
  const { col, row } = toCell(e.offsetX, e.offsetY);
  hoverCell = { col, row };
  if (curTool === "area" && _pendingArea) {
    const ac = document.getElementById("areaCursor");
    const x1 = Math.min(_pendingArea.x1, col), y1 = Math.min(_pendingArea.y1, row);
    const x2 = Math.max(_pendingArea.x1, col) + 1, y2 = Math.max(_pendingArea.y1, row) + 1;
    ac.style.cssText = `display:block;left:${x1*TS*zoom+viewX}px;top:${y1*TS*zoom+viewY}px;width:${(x2-x1)*TS*zoom}px;height:${(y2-y1)*TS*zoom}px;border:2px dashed #facc15;background:rgba(250,204,21,0.1);`;
    scheduleRender(); return;
  }
  if (curTool === "obj_place") { scheduleRender(); return; }
  if (curTool === "obj_move" && mDraw && selectedObj !== null && dragObjStart) {
    const dx = col - dragObjStart.col, dy = row - dragObjStart.row;
    const o  = objects[selectedObj];
    const nx = dragObjStart.ox + dx, ny = dragObjStart.oy + dy;
    if (canPlace(nx, ny, o.cols, o.rows, selectedObj)) { o.x = nx; o.y = ny; }
    scheduleRender(); return;
  }
  if (!mDraw) return;
  if (!lastC || lastC.col !== col || lastC.row !== row) { paintAt(col, row); lastC = { col, row }; }
});

window.addEventListener("mouseup", e => {
  if (curTool === "area" && _pendingArea) {
    document.getElementById("areaCursor").style.display = "none";
    const col = hoverCell ? hoverCell.col : _pendingArea.x1;
    const row = hoverCell ? hoverCell.row : _pendingArea.y1;
    const x1  = Math.min(_pendingArea.x1, col), y1 = Math.min(_pendingArea.y1, row);
    const x2  = Math.max(_pendingArea.x1, col) + 1, y2 = Math.max(_pendingArea.y1, row) + 1;
    _pendingArea = null;
    if (x2 - x1 >= 1 && y2 - y1 >= 1) {
      const id = "area_" + Date.now();
      hotAreas.push({ id, x1, y1, x2, y2, label: "", tooltip: "" });
      _lastAreaId = id;
      toast("🔗 არეალი შეინახა");
      setTool("draw");
    }
    scheduleRender(); return;
  }
  if (curTool === "obj_move" && dragObjStart && selectedObj !== null) { pushH(); dragObjStart = null; }
  mDraw = false;
});

// ── WINDOW BINDINGS ──
window.paintAt         = paintAt;
window.floodFill       = floodFill;
window.setLayer        = setLayer;
window.openLayerPopup  = openLayerPopup;
window.closeLayerPopup = closeLayerPopup;
window.setTool         = setTool;
window.setBrush        = setBrush;
window.undo            = undo;
window.clearMap        = clearMap;
window.toggleBgPanel   = toggleBgPanel;
window.loadBg          = loadBg;
window.setBgOp         = setBgOp;
window.toggleBgVis     = toggleBgVis;
window.removeBg        = removeBg;
window.fitToBg         = fitToBg;
window.showSpotPopup   = showSpotPopup;
window.closeSpotPopup  = closeSpotPopup;
window.setSpotZoom     = setSpotZoom;
window.copySpotLink    = copySpotLink;
