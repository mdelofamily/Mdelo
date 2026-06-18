// ============================================================
//  menu-builder.js  —  Legend Menu / Section Tree Builder
//  Depends on: state.js
// ============================================================

// ── SLUG GENERATION (for [[label|menu:slug]] links) ──────────
// Slugs are derived from title at render/export time — never stored.
// Collisions get a numeric suffix in tree order: გიორგი, გიორგი-2, გიორგი-3...
function _slugify(title) {
  return (title || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[|[\]#]/g, "");
}

// Walks the whole tree in order, returns Map<nodeId, slug> with collisions resolved.
function _buildSlugMap(nodes, map, seen) {
  map  = map  || new Map();
  seen = seen || new Map(); // base slug -> count seen so far
  for (const n of (nodes || _menuSections)) {
    const base = _slugify(n.title) || n.id;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    map.set(n.id, count === 1 ? base : base + "-" + count);
    if (n.children && n.children.length) _buildSlugMap(n.children, map, seen);
  }
  return map;
}

// Reverse lookup used by the link picker: slug -> node
function _findNodeBySlug(slug) {
  const map = _buildSlugMap(_menuSections);
  for (const [id, s] of map) {
    if (s === slug) return _findNode(id);
  }
  return null;
}

// ── NODE LOOKUP (any depth) ──
function _findNode(id, nodes) {
  for (const n of (nodes || _menuSections)) {
    if (n.id === id) return n;
    if (n.children) { const f = _findNode(id, n.children); if (f) return f; }
  }
  return null;
}

function _findParentNode(childId, nodes) {
  for (const n of (nodes || _menuSections)) {
    if (n.children && n.children.find(c => c.id === childId)) return n;
    if (n.children) { const p = _findParentNode(childId, n.children); if (p) return p; }
  }
  return null;
}

function _removeChildById(id, nodes) {
  for (const n of (nodes || _menuSections)) {
    if (n.children) {
      const idx = n.children.findIndex(c => c.id === id);
      if (idx >= 0) { n.children.splice(idx, 1); return true; }
      if (_removeChildById(id, n.children)) return true;
    }
  }
  return false;
}

// ── MOVE FUNCTIONS ──
function _moveSection(secId, direction) {
  const idx = _menuSections.findIndex(s => s.id === secId);
  if (idx < 0) return;
  if (direction === "up" && idx > 0) {
    [_menuSections[idx - 1], _menuSections[idx]] = [_menuSections[idx], _menuSections[idx - 1]];
  } else if (direction === "down" && idx < _menuSections.length - 1) {
    [_menuSections[idx + 1], _menuSections[idx]] = [_menuSections[idx], _menuSections[idx + 1]];
  }
  renderMenuBuilder();
}

function _moveChild(childId, direction) {
  const parent = _findParentNode(childId);
  if (!parent || !parent.children) return;
  const idx = parent.children.findIndex(c => c.id === childId);
  if (idx < 0) return;
  if (direction === "up" && idx > 0) {
    [parent.children[idx - 1], parent.children[idx]] = [parent.children[idx], parent.children[idx - 1]];
  } else if (direction === "down" && idx < parent.children.length - 1) {
    [parent.children[idx + 1], parent.children[idx]] = [parent.children[idx], parent.children[idx + 1]];
  }
  renderMenuBuilder();
}

// ── SECTION / ITEM MUTATIONS ──
function addMenuSection() {
  _menuSections.push({ id: "sec_" + Date.now(), icon: "📁", title: "", items: [], children: [] });
  renderMenuBuilder();
}

function _addItem(nodeId, type) {
  const n = _findNode(nodeId); if (!n) return;
  if (type === "progress") n.items.push({ type: "progress", emoji: "📊", label: "", value: 100 });
  else                     n.items.push({ type: "text",     emoji: "•",  label: "" });
  renderMenuBuilder();
}

function _addChild(nodeId) {
  const n = _findNode(nodeId); if (!n) return;
  if (!n.children) n.children = [];
  n.children.push({ id: "nd_" + Date.now(), icon: "📁", title: "", items: [], children: [] });
  renderMenuBuilder();
}

function _removeSection(secId) {
  _menuSections = _menuSections.filter(s => s.id !== secId);
  renderMenuBuilder();
}

function _removeChild(childId) { _removeChildById(childId); renderMenuBuilder(); }

function _removeItem(nodeId, idx) {
  const n = _findNode(nodeId); if (n) { n.items.splice(idx, 1); renderMenuBuilder(); }
}

function _updateNodeMeta(nodeId, key, val) {
  const n = _findNode(nodeId); if (n) n[key] = val;
}

function _updateItem(nodeId, idx, key, val) {
  const n = _findNode(nodeId); if (!n) return;
  const item = n.items[idx]; if (item == null) return;
  if (typeof item === "string") { n.items[idx] = { type: "text", emoji: "•", label: val }; return; }
  item[key] = val;
}

// ── LINK INTO ITEM ──
function _insertLinkIntoItem(nodeId, idx) {
  const n = _findNode(nodeId); if (!n || !n.items[idx]) return;
  let ta = null;
  document.querySelectorAll("#menuBuilder textarea").forEach(i => {
    if (i.value === (n.items[idx].label || "") && !ta) ta = i;
  });
  const s   = ta ? ta.selectionStart : 0;
  const e   = ta ? ta.selectionEnd   : 0;
  const sel = ta ? ta.value.slice(s, e).trim() : "";
  const url = prompt("URL:"); if (!url || !url.trim()) return;
  const label = sel || url.trim();
  const link  = "[[" + label + "|" + url.trim() + "]]";
  if (ta) {
    const newVal = ta.value.slice(0, s) + link + ta.value.slice(e);
    ta.value = newVal; n.items[idx].label = newVal;
    ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px";
    ta.focus(); ta.setSelectionRange(s + link.length, s + link.length);
  } else {
    const cur = (n.items[idx].label || "").trimEnd();
    n.items[idx].label = cur + (cur ? " " : "") + link;
    renderMenuBuilder();
  }
}

// ── STYLE CONSTANTS ──
const _ISTYLE = "flex:1;background:var(--panel);border:1px solid var(--border);color:var(--text);font-size:12px;padding:4px 6px;border-radius:4px;";
const _ESTYLE = "width:30px;text-align:center;background:var(--panel);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:2px;font-size:13px;";

// ── RENDER ONE NODE (recursive) ──
function _renderNode(node, depth, isRoot) {
  const wrap = document.createElement("div");
  const bc   = depth === 0 ? "var(--accent)" : depth === 1 ? "var(--border)" : "#2a3040";
  wrap.style.cssText = `background:var(--bg);border:1px solid ${bc};border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:5px;${depth > 0 ? "margin-left:" + (depth * 10) + "px;" : ""}`;

  // header row
  const hdr    = document.createElement("div"); hdr.style.cssText = "display:flex;gap:5px;align-items:center;";
  const iconI  = document.createElement("input"); iconI.value = node.icon || "📁"; iconI.style.cssText = _ESTYLE;
  iconI.oninput = () => _updateNodeMeta(node.id, "icon", iconI.value);
  const titleI = document.createElement("input"); titleI.value = node.title || "";
  titleI.placeholder = depth === 0 ? "სექციის სახელი" : "ქვე-სექციის სახელი";
  titleI.style.cssText = "flex:1;background:var(--panel);border:1px solid var(--border);color:var(--text);font-size:" + (depth === 0 ? "13px" : "12px") + ";padding:3px 6px;border-radius:4px;";
  titleI.oninput = () => _updateNodeMeta(node.id, "title", titleI.value);
  
  // move buttons
  const moveCtrl = document.createElement("div"); moveCtrl.style.cssText = "display:flex;gap:2px;";
  const upB = document.createElement("button"); upB.textContent = "▲";
  upB.style.cssText = "background:none;border:1px solid var(--border);color:var(--text);font-size:12px;cursor:pointer;width:26px;height:26px;border-radius:4px;padding:0;";
  upB.onclick = () => isRoot ? _moveSection(node.id, "up") : _moveChild(node.id, "up");
  const dnB = document.createElement("button"); dnB.textContent = "▼";
  dnB.style.cssText = "background:none;border:1px solid var(--border);color:var(--text);font-size:12px;cursor:pointer;width:26px;height:26px;border-radius:4px;padding:0;";
  dnB.onclick = () => isRoot ? _moveSection(node.id, "down") : _moveChild(node.id, "down");
  moveCtrl.appendChild(upB); moveCtrl.appendChild(dnB);
  
  const delB = document.createElement("button"); delB.textContent = "✕";
  delB.style.cssText = "background:none;border:none;color:var(--muted);font-size:16px;cursor:pointer;";
  delB.onclick = () => isRoot ? _removeSection(node.id) : _removeChild(node.id);

  hdr.appendChild(iconI); hdr.appendChild(titleI); hdr.appendChild(moveCtrl); hdr.appendChild(delB);
  wrap.appendChild(hdr);

  // items
  (node.items || []).forEach((item, idx) => {
    const itObj = typeof item === "string" ? { type: "text", emoji: "•", label: item } : item;
    const row   = document.createElement("div");
    row.style.cssText = "display:flex;gap:5px;align-items:center;padding-left:8px;";

    const emojiI = document.createElement("input");
    emojiI.value = itObj.emoji || (itObj.type === "progress" ? "📊" : "•");
    emojiI.style.cssText = _ESTYLE;
    emojiI.oninput = () => _updateItem(node.id, idx, "emoji", emojiI.value);

    const labelI = document.createElement("textarea");
    labelI.value = itObj.label || "";
    labelI.placeholder = itObj.type === "progress" ? "სახელი" : "ტექსტი ან [[სახელი|url]]";
    labelI.rows = 1;
    labelI.style.cssText = _ISTYLE + "resize:none;overflow-y:auto;min-height:62px;max-height:130px;line-height:1.5;font-family:monospace;";
    labelI.oninput = () => {
      labelI.style.height = "auto";
      labelI.style.height = Math.min(labelI.scrollHeight, 130) + "px";
      _updateItem(node.id, idx, "label", labelI.value);
    };

    const rmB = document.createElement("button"); rmB.textContent = "✕";
    rmB.style.cssText = "background:none;border:none;color:var(--muted);cursor:pointer;flex-shrink:0;";
    rmB.onclick = () => _removeItem(node.id, idx);

    row.appendChild(emojiI);

    if (itObj.type === "text") {
      const col2  = document.createElement("div");
      col2.style.cssText = "flex:1;display:flex;flex-direction:column;gap:3px;";
      col2.appendChild(labelI);
      const lnkB = document.createElement("button"); lnkB.textContent = "+ ლინკი";
      lnkB.style.cssText = "background:none;border:1px solid var(--blue);color:var(--blue);font-size:10px;padding:1px 7px;border-radius:10px;cursor:pointer;flex-shrink:0;";
      lnkB.onclick = () => _insertLinkIntoItem(node.id, idx);
      const lnkHint = document.createElement("span"); lnkHint.textContent = "ტექსტი|URL";
      lnkHint.style.cssText = "font-size:10px;color:var(--muted);";
      const lnkRow = document.createElement("div"); lnkRow.style.cssText = "display:flex;align-items:center;gap:5px;";
      lnkRow.appendChild(lnkB); lnkRow.appendChild(lnkHint);
      col2.appendChild(lnkRow);
      row.appendChild(col2);
    } else {
      row.appendChild(labelI);
    }

    if (itObj.type === "progress") {
      const valI = document.createElement("input"); valI.type = "number";
      valI.value = itObj.value != null ? itObj.value : 100; valI.min = 0; valI.max = 100;
      valI.style.cssText = "width:46px;background:var(--panel);border:1px solid var(--border);color:var(--text);font-size:12px;padding:2px 4px;border-radius:4px;text-align:center;";
      valI.oninput = () => _updateItem(node.id, idx, "value", +valI.value);
      const pct = document.createElement("span"); pct.textContent = "%";
      pct.style.cssText = "font-size:11px;color:var(--muted);";
      row.appendChild(valI); row.appendChild(pct);
    }

    row.appendChild(rmB);
    wrap.appendChild(row);
  });

  // children recursively
  (node.children || []).forEach(child => wrap.appendChild(_renderNode(child, depth + 1, false)));

  // action buttons
  const acts = document.createElement("div");
  acts.style.cssText = "display:flex;gap:5px;padding-left:8px;flex-wrap:wrap;";
  const mkA = (lbl, fn) => {
    const b = document.createElement("button"); b.textContent = lbl;
    b.style.cssText = "background:none;border:1px solid var(--border);color:var(--muted);font-size:11px;padding:2px 7px;border-radius:10px;cursor:pointer;";
    b.onclick = fn; return b;
  };
  acts.appendChild(mkA("+ ტექსტი",      () => _addItem(node.id, "text")));
  acts.appendChild(mkA("+ ინდიკატორი",  () => _addItem(node.id, "progress")));
  acts.appendChild(mkA("+ ქვე-სექცია",  () => _addChild(node.id)));
  wrap.appendChild(acts);
  return wrap;
}

// ── FULL RENDER ──
function renderMenuBuilder() {
  const el = document.getElementById("menuBuilder");
  el.innerHTML = "";
  _menuSections.forEach(sec => el.appendChild(_renderNode(sec, 0, true)));
}

// ── WINDOW BINDINGS ──
window.addMenuSection      = addMenuSection;
window.renderMenuBuilder   = renderMenuBuilder;
window._findNode           = _findNode;
window._addItem            = _addItem;
window._addChild           = _addChild;
window._removeSection      = _removeSection;
window._removeChild        = _removeChild;
window._removeItem         = _removeItem;
window._updateNodeMeta     = _updateNodeMeta;
window._updateItem         = _updateItem;
window._insertLinkIntoItem = _insertLinkIntoItem;
window._moveSection        = _moveSection;
window._moveChild          = _moveChild;
window._slugify            = _slugify;
window._buildSlugMap       = _buildSlugMap;
window._findNodeBySlug     = _findNodeBySlug;
