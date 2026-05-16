// ============================================================
//  state.js  —  Global State, Constants & Primitive Utilities
//  Loaded FIRST.  Every other module reads/writes these vars.
//  No ES modules: everything lives on the global (window) scope.
// ============================================================

// ── BUILT-IN TILES (none by default — user provides all tiles) ──
const BUILTIN = [];

// ── TILE SIZE (pixels per tile, power-of-2, pixelart standard) ──
const TS = 32;

// ── PAN THRESHOLD (px before a touch becomes a pan, not a tap) ──
const PAN_THRESH = 10;

// ── PROJECT STORAGE KEY ──
const PROJ_KEY = "rpgmap_projects";

// ── TILE COLLECTIONS ──
let customTiles = [];   // user-uploaded single tiles and object sprites
let autoTiles   = [];   // 4-bit auto-tile groups (16 variants each)
let dualTiles   = [];   // dual-grid transition tiles (16 corner masks)

// ── MAP DIMENSIONS ──
let COLS = 78;
let ROWS = 50;

// ── VIEW STATE ──
let zoom      = 0.75;
let showGrid  = true;
let viewX     = 0;
let viewY     = 0;

// ── OFFSCREEN CANVAS (full map pre-render buffer) ──
let offscreen = null;   // HTMLCanvasElement, created in render.js
let offCtx    = null;   // CanvasRenderingContext2D of offscreen

// ── TOOL STATE ──
let curTile  = "";       // id of selected tile
let curTool  = "draw";   // "draw" | "fill" | "erase" | "pick" | "area" | "obj_place" | "obj_move"
let brushSz  = 1;        // brush size in tiles (1, 2, 3, 5, 7)
let baseTile = "";       // tile used for erasing (first non-object tile)

// ── INTERACTION STATE ──
let hoverCell    = null;   // {col, row} — cell under cursor/finger
let selectedObj  = null;   // index into objects[] while in obj_move mode
let dragObjStart = null;   // {col, row, ox, oy} — obj drag anchor
let lockedPos    = null;   // {col, row} — first-tap lock for obj_place on touch

// ── LAST PAINTED CELL (mouse drag dedup) ──
let lastC = null;

// ── MAP DATA ──
let map        = [];   // base layer: ROWS × COLS string[][] of tile ids
let overlayMap = [];   // overlay layer: same shape
let hist       = [];   // undo history: array of snapState() objects (max 50)

// ── ACTIVE LAYER ──
let activeLayer = "base";   // "base" | "overlay"

// ── PLACED OBJECTS ──
// Each: { id, lb, src?, img, cols, rows, x, y, marker?, title?, tooltip? }
let objects = [];

// ── HOT AREAS (interactive region hotspots) ──
// Each: { id, x1, y1, x2, y2, label, tooltip, groupId? }
let hotAreas = [];
let _lastAreaId    = null;   // id of most recently drawn area
let _editingAreaIdx = -1;    // index into hotAreas[] being edited
let _pendingArea   = null;   // {x1, y1} — mouse drag start for area draw
let _mergeMode     = false;  // true while waiting for a merge-tap

// ── OBJECT PROPERTIES EDITING ──
let _editingObjIdx    = -1;
let _editingObjMarker = "";

// ── UI STATE ──
let panelOpen    = true;
let _prevTileChip  = null;   // DOM element — last selected tile chip
let _prevBuildChip = null;   // DOM element — last selected building chip

// ── BACKGROUND (satellite overlay) ──
let bgImg        = null;    // HTMLImageElement
let bgOp         = 0.5;    // opacity 0–1
let bgVis        = true;   // visibility toggle
let bgLayerDirty = true;   // needs redraw on bgCanvas

// ── TOUCH STATE ──
let touchState = null;
let pD0 = null, pZ0 = null, pMX = null, pMY = null, pVX = null, pVY = null;

// ── MOUSE STATE ──
let mDraw = false;

// ── SPOT POPUP ──
let _spotCell = { col: 0, row: 0 };
let _spotZoom = 1;
let spotBaseUrl = "";

// ── BUILDING UPLOAD ──
let _lastBuildDims = "3×3";
let _buPickerActive = false;

// ── PENDING TILE (name modal) ──
let pending = null;

// ── LEGEND / DESCRIPTION ──
let _legendLabels = {};   // { tileId: labelText }

// ── MENU BUILDER ──
let _menuSections = [];   // tree of section nodes

// ── ACTIVE PROJECT ──
let currentProjectName = "";

// ── TOAST TIMER ──
let toastT = null;

// ── IMAGE / SHEET CACHES ──
const _sheetCache      = new Map();  // sheetUrl → HTMLImageElement (network fetch cache)
const _localSheetCache = new Map();  // sheetUrl → dataURL        (untainted, for PNG export)
const tileMap          = new Map();  // tileId   → tile object    (O(1) lookup, built by rebuildTileMap)

// ── RAF SCHEDULER ──
let _rafId = null;

// ================================================================
//  DOM REFERENCES
//  Scripts are placed at the bottom of <body>, so DOM is fully
//  parsed by the time these lines execute.
// ================================================================
const canvas  = document.getElementById("mc");
const bgc     = document.getElementById("bgCanvas");
const cw      = document.getElementById("cw");
const mainCtx = canvas.getContext("2d");

// ================================================================
//  PRIMITIVE UTILITY FUNCTIONS
//  Placed here so every downstream file can call them without
//  worrying about load order.
// ================================================================

/**
 * Rebuild the O(1) tileMap from all tile arrays.
 * Must be called after any tile array mutates.
 */
function rebuildTileMap() {
  tileMap.clear();
  BUILTIN.forEach(t => tileMap.set(t.id, t));
  customTiles.forEach(t => tileMap.set(t.id, t));
  autoTiles.forEach(t => tileMap.set(t.id, t));
  dualTiles.forEach(t => tileMap.set(t.id, t));
}

/**
 * Schedule a render on the next animation frame.
 * Coalesces multiple synchronous calls into one frame.
 * NOTE: render() is defined in render.js (loaded after state.js).
 *       By the time RAF fires, render() will be available.
 */
function scheduleRender() {
  if (!_rafId) _rafId = requestAnimationFrame(() => { _rafId = null; render(); });
}

/**
 * Center the view on the map (called after load or resize).
 */
function centerView() {
  const mw = COLS * TS * zoom;
  const mh = ROWS * TS * zoom;
  const ww = cw.clientWidth;
  const wh = cw.clientHeight;
  viewX = Math.max(0, (ww - mw) / 2);
  viewY = Math.max(0, (wh - mh) / 2);
}

/**
 * Clamp viewX/viewY so the map never scrolls fully off-screen.
 */
function clamp() {
  const mw = COLS * TS * zoom;
  const mh = ROWS * TS * zoom;
  const ww = cw.clientWidth;
  const wh = cw.clientHeight;
  const px = Math.max(50, ww * 0.1);
  const py = Math.max(50, wh * 0.1);
  viewX = Math.max(ww - mw - px, Math.min(px, viewX));
  viewY = Math.max(wh - mh - py, Math.min(py, viewY));
}

/**
 * Return true when (c, r) is within the map bounds.
 */
function inB(c, r) {
  return c >= 0 && c < COLS && r >= 0 && r < ROWS;
}

/**
 * Convert canvas pixel coordinates → { col, row } map cell.
 */
function toCell(px, py) {
  return {
    col: Math.floor((px - viewX) / (TS * zoom)),
    row: Math.floor((py - viewY) / (TS * zoom))
  };
}

/**
 * Snapshot current map + objects for undo.
 */
function snapState() {
  return {
    map:        map.map(r => [...r]),
    overlayMap: overlayMap.map(r => [...r]),
    objects:    objects.map(o => ({ ...o }))
  };
}

/**
 * Push current state onto the undo history stack.
 */
function pushH() {
  hist.push(snapState());
  if (hist.length > 50) hist.shift();
}

/**
 * Show a brief toast notification.
 */
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("show"), 1800);
}

/**
 * Trigger a file download for text or Blob content.
 */
function downloadFile(content, filename, mimeType) {
  const a = document.createElement("a");
  if (typeof content === "string") {
    a.href = "data:" + mimeType + "," + encodeURIComponent(content);
  } else {
    a.href = URL.createObjectURL(content);
  }
  a.download = filename;
  a.click();
}

/**
 * Clipboard copy fallback for browsers without navigator.clipboard.
 */
function _copyFallback(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand("copy"); } catch (e) {}
  document.body.removeChild(ta);
}

/**
 * Load a spritesheet Image from URL, using the _sheetCache.
 * @param {string} url
 * @param {function(HTMLImageElement|null)} cb
 */
function _loadSheet(url, cb) {
  if (_sheetCache.has(url)) { cb(_sheetCache.get(url)); return; }
  const sh = new Image();
  sh.onload  = () => { _sheetCache.set(url, sh); cb(sh); };
  sh.onerror = () => cb(null);
  sh.src = url;
}

/**
 * Return the active layer's map array.
 */
function getActiveMap() {
  return activeLayer === "overlay" ? overlayMap : map;
}

// ================================================================
//  WINDOW BINDINGS
//  Functions in this file that are called from HTML onclick attrs
//  or from other modules must be exposed on window.
// ================================================================
window.rebuildTileMap = rebuildTileMap;
window.scheduleRender = scheduleRender;
window.centerView     = centerView;
window.clamp          = clamp;
window.inB            = inB;
window.toCell         = toCell;
window.snapState      = snapState;
window.pushH          = pushH;
window.toast          = toast;
window.downloadFile   = downloadFile;
window._copyFallback  = _copyFallback;
window._loadSheet     = _loadSheet;
window.getActiveMap   = getActiveMap;
