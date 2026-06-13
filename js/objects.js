// ============================================================
//  objects.js  —  Placed Object Management & Properties
//  Depends on: state.js, tile-engine.js, render.js, bulk-parser.js
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

// ── UNLOCK HEADER PARSING ─────────────────────────────────────────────────
// #? flag1 flag2       → requires
// #! flag >dlg *area !obj ?obj ~obj -obj  → on_complete

function _parseUnlockHeaders(raw) {
  var lines = raw.split('\n'), dslLines = [], requires = null, on_complete = null;
  lines.forEach(function(line) {
    var m;
    if ((m = line.match(/^#\?\s*(.+)/))) {
      var flags = m[1].split(/\s+/).map(function(s){return s.trim();}).filter(Boolean);
      if (flags.length) requires = { flags: flags };
    } else if ((m = line.match(/^#!\s*(.+)/))) {
      var tokens = m[1].split(/\s+/).filter(Boolean);
      var oc = { set_flags: [], unlock_dialogs: [], unlock_areas: [], set_markers: [] };
      tokens.forEach(function(t) {
        var ch = t.charAt(0);
        if      (ch === '>') oc.unlock_dialogs.push(t.slice(1));
        else if (ch === '*') oc.unlock_areas.push(t.slice(1));
        else if (ch === '!' || ch === '?' || ch === '~' || ch === '-')
          oc.set_markers.push({ mk: ch === '-' ? '' : ch, title: t.slice(1) });
        else oc.set_flags.push(t);
      });
      if (!oc.set_flags.length)      delete oc.set_flags;
      if (!oc.unlock_dialogs.length) delete oc.unlock_dialogs;
      if (!oc.unlock_areas.length)   delete oc.unlock_areas;
      if (!oc.set_markers.length)    delete oc.set_markers;
      if (Object.keys(oc).length)    on_complete = oc;
    } else { dslLines.push(line); }
  });
  return { dsl: dslLines.join('\n'), requires: requires, on_complete: on_complete };
}

function _unparseUnlockHeaders(o) {
  var lines = [];
  if (o.requires && o.requires.flags && o.requires.flags.length)
    lines.push('#? ' + o.requires.flags.join(' '));
  if (o.on_complete) {
    var oc = o.on_complete, tokens = [];
    (oc.set_flags      || []).forEach(function(f){ tokens.push(f); });
    (oc.unlock_dialogs || []).forEach(function(f){ tokens.push('>'+f); });
    (oc.unlock_areas   || []).forEach(function(f){ tokens.push('*'+f); });
    (oc.set_markers    || []).forEach(function(m){ tokens.push((m.mk||'-')+m.title); });
    if (tokens.length) lines.push('#! ' + tokens.join(' '));
  }
  return lines.join('\n');
}

// ── OBJECT PROPERTIES MODAL ──
function openObjProps(idx) {
  _editingObjIdx = idx;
  const o = objects[idx];
  var headers = _unparseUnlockHeaders(o);
  var dsl     = o.dsl || unparseDialogue(o) || "";
  document.getElementById("objDslInp").value = headers ? (headers + '\n' + dsl) : dsl;
  document.getElementById("objPropsModal").classList.add("show");
  setTimeout(function() {
    var inp = document.getElementById("objDslInp");
    if (inp) inp.focus();
  }, 60);
}

function closeObjProps() {
  document.getElementById("objPropsModal").classList.remove("show");
  _editingObjIdx = -1;
}

function saveObjProps() {
  if (_editingObjIdx < 0 || !objects[_editingObjIdx]) return;
  var raw = (document.getElementById("objDslInp").value || "").trim();
  var o   = objects[_editingObjIdx];

  // empty textarea — close without changes
  if (!raw) {
    closeObjProps();
    setTool("draw");
    return;
  }

  o.dsl = raw;
  var parsed = _parseUnlockHeaders(raw);
  o.requires    = parsed.requires;
  o.on_complete = parsed.on_complete;
  var cleanDsl  = parsed.dsl.trim();

  try {
    var result  = parseBulkDSL(cleanDsl || '@0\n');
    o.title    = result.title;
    o.marker   = result.marker;
    o.dialogue = result.nodes;
  } catch (e) {
    console.error("DSL parse error:", e);
    toast("⚠ DSL შეცდომა: " + e.message);
    return;
  }

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

// ── LINK INSERTION HELPER (area only) ──
function insertAreaLink() {
  var ta = document.getElementById("areaTooltipInp");
  if (!ta) return;
  var start = ta.selectionStart, end = ta.selectionEnd;
  var sel   = ta.value.slice(start, end).trim();
  var url   = prompt("URL:");
  if (!url) return;
  var label = sel || prompt("ლინკის ტექსტი:") || url;
  var link  = "[[" + label + "|" + url + "]]";
  ta.value  = ta.value.slice(0, start) + link + ta.value.slice(end);
  ta.focus();
  ta.setSelectionRange(start + link.length, start + link.length);
}

// ── WINDOW BINDINGS ──
window.objAnchor          = objAnchor;
window.objAtCell          = objAtCell;
window.canPlace           = canPlace;
window.getObjDef          = getObjDef;
window.doPlaceObject      = doPlaceObject;
window.openObjProps       = openObjProps;
window.closeObjProps      = closeObjProps;
window.saveObjProps       = saveObjProps;
window.deleteObjFromProps = deleteObjFromProps;
window.insertAreaLink     = insertAreaLink;
