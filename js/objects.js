// ============================================================
//  objects.js  —  Placed Object Management & Properties
//  Depends on: state.js, tile-engine.js, render.js
// ============================================================

// ── HELPERS ──
function objAnchor(col, row, cols, rows) {
  return { x: col - Math.floor(cols / 2), y: row - Math.floor(rows / 2) };
}

function objAtCell(col, row) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (col >= o.x && col < o.x + o.cols && row >= o.y && row < o.y + o.rows) return i;
  }
  return -1;
}

function canPlace(x, y, cols, rows, skipIdx) {
  return inB(x, y) && inB(x + cols - 1, y + rows - 1);
}

function getObjDef(id) {
  const t = tileMap.get(id);
  return (t && t.isObject) ? t : null;
}

// ── PLACE OBJECT ON MAP ──
function doPlaceObject(col, row) {
  const def = getObjDef(curTile);
  if (!def) { toast("⚠ ობიექტი არ არის არჩეული"); return; }
  const img = getImg(curTile);
  if (!img) { toast("⚠ სურათი: " + curTile); return; }
  const x = col - Math.floor(def.cols / 2);
  const y = row - Math.floor(def.rows / 2);
  if (!canPlace(x, y, def.cols, def.rows, -1)) { toast("⚠ საზღვარს გარეთ"); return; }
  pushH();
  objects.push({ id: def.id, lb: def.lb || def.id, img, cols: def.cols, rows: def.rows, x, y });
  scheduleRender();
  toast("⊞ " + (def.lb || def.id));
}

// ── OBJECT PROPERTIES MODAL ──
function openObjProps(idx) {
  _editingObjIdx    = idx;
  const o           = objects[idx];
  _editingObjMarker = o.marker || "";
  document.getElementById("objTitleInp").value   = o.title   || "";
  document.getElementById("objTooltipInp").value = o.tooltip || "";
  _syncMarkerBtns(_editingObjMarker);
  document.getElementById("objPropsModal").classList.add("show");
}

function closeObjProps() {
  document.getElementById("objPropsModal").classList.remove("show");
  _editingObjIdx = -1;
}

function setObjMarker(m) {
  _editingObjMarker = m;
  _syncMarkerBtns(m);
}

function _syncMarkerBtns(m) {
  ["none", "exc", "q", "chat"].forEach(k =>
    document.getElementById("mk-" + k).classList.remove("on"));
  const mkMap = { "": "none", "!": "exc", "?": "q", "💬": "chat" };
  document.getElementById("mk-" + (mkMap[m] || "none")).classList.add("on");
}

function saveObjProps() {
  if (_editingObjIdx < 0 || !objects[_editingObjIdx]) return;
  objects[_editingObjIdx].title   = document.getElementById("objTitleInp").value.trim();
  objects[_editingObjIdx].tooltip = document.getElementById("objTooltipInp").value.trim();
  objects[_editingObjIdx].marker  = _editingObjMarker;
  closeObjProps();
  setTool("draw");
  scheduleRender();
  toast("✓ შენახულია");
}

function deleteObjFromProps() {
  if (_editingObjIdx < 0) return;
  pushH();
  objects.splice(_editingObjIdx, 1);
  closeObjProps();
  lockedPos = null;
  scheduleRender();
  toast("🗑 წაიშალა");
}

// ── LINK INSERTION HELPER ──
function _insertLink(taId) {
  const ta = document.getElementById(taId);
  if (!ta) return;
  const start = ta.selectionStart, end = ta.selectionEnd;
  const sel   = ta.value.slice(start, end).trim();
  const url   = prompt("URL:");
  if (!url) return;
  const label = sel || prompt("ლინკის ტექსტი:") || url;
  const link  = "[[" + label + "|" + url + "]]";
  ta.value    = ta.value.slice(0, start) + link + ta.value.slice(end);
  ta.focus();
  ta.setSelectionRange(start + link.length, start + link.length);
}

function insertObjLink()  { _insertLink("objTooltipInp");  }
function insertAreaLink() { _insertLink("areaTooltipInp"); }

// ── WINDOW BINDINGS ──
window.objAnchor          = objAnchor;
window.objAtCell          = objAtCell;
window.canPlace           = canPlace;
window.getObjDef          = getObjDef;
window.doPlaceObject      = doPlaceObject;
window.openObjProps       = openObjProps;
window.closeObjProps      = closeObjProps;
window.setObjMarker       = setObjMarker;
window.saveObjProps       = saveObjProps;
window.deleteObjFromProps = deleteObjFromProps;
window.insertObjLink      = insertObjLink;
window.insertAreaLink     = insertAreaLink;
