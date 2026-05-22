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
  _editingDialogue = JSON.parse(JSON.stringify(o.dialogue || []));
  if (_editingDialogue.length === 0) {
    _editingDialogue.push(_newNode());
  }
  _renderDialogueEditor();
  document.getElementById("objPropsModal").classList.add("show");
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
  objects[_editingObjIdx].title    = document.getElementById("objTitleInp").value.trim();
  objects[_editingObjIdx].tooltip  = document.getElementById("objTooltipInp").value.trim();
  objects[_editingObjIdx].marker   = _editingObjMarker;
  objects[_editingObjIdx].dialogue = JSON.parse(JSON.stringify(_editingDialogue));
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

// ── DIALOGUE EDITOR ──
let _editingDialogue = [];

function _newNode() {
  return {
    id: "node_" + Date.now(),
    text: "",
    buttons: [
      { label: "✅ დიახ", nextNode: "", notify: true,  notifyText: "", link: "" },
      { label: "❌ არა",  nextNode: "", notify: false, notifyText: "", link: "" }
    ]
  };
}

function _newBtn() {
  return { label: "", nextNode: "", notify: false, notifyText: "", link: "" };
}

function addDialogueNode() {
  _editingDialogue.push(_newNode());
  _renderDialogueEditor();
}

function removeDialogueNode(ni) {
  if (_editingDialogue.length <= 1) { toast("⚠ მინიმუმ 1 კვანძი საჭიროა"); return; }
  _editingDialogue.splice(ni, 1);
  _renderDialogueEditor();
}

function addDialogueBtn(ni) {
  if (_editingDialogue[ni].buttons.length >= 3) { toast("⚠ მაქს. 3 ღილაკი"); return; }
  _editingDialogue[ni].buttons.push(_newBtn());
  _renderDialogueEditor();
}

function removeDialogueBtn(ni, bi) {
  _editingDialogue[ni].buttons.splice(bi, 1);
  _renderDialogueEditor();
}

function _renderDialogueEditor() {
  const container = document.getElementById("dialogueEditor");
  if (!container) return;
  container.innerHTML = "";

  _editingDialogue.forEach((node, ni) => {
    const nodeDiv = document.createElement("div");
    nodeDiv.style.cssText = "background:var(--panel2);border:1px solid var(--border);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px;";

    // node header
    const hdr = document.createElement("div");
    hdr.style.cssText = "display:flex;align-items:center;justify-content:space-between;";
    const idInpWrap = document.createElement("div");
    idInpWrap.style.cssText = "display:flex;align-items:center;gap:6px;flex:1;";
    const idLbl = document.createElement("span");
    idLbl.textContent = "ID:";
    idLbl.style.cssText = "font-size:11px;color:var(--muted);flex-shrink:0;";
    const idInp = document.createElement("input");
    idInp.value = node.id;
    idInp.style.cssText = "flex:1;background:var(--bg);border:1px solid var(--border);color:var(--accent);font-size:11px;padding:3px 6px;border-radius:4px;font-family:monospace;";
    idInp.oninput = () => { _editingDialogue[ni].id = idInp.value.trim(); };
    idInpWrap.appendChild(idLbl);
    idInpWrap.appendChild(idInp);
    const delNodeBtn = document.createElement("button");
    delNodeBtn.textContent = "🗑";
    delNodeBtn.style.cssText = "background:none;border:1px solid var(--red);color:var(--red);border-radius:4px;padding:2px 7px;font-size:12px;cursor:pointer;flex-shrink:0;margin-left:6px;";
    delNodeBtn.onclick = () => removeDialogueNode(ni);
    hdr.appendChild(idInpWrap);
    hdr.appendChild(delNodeBtn);

    // text area
    const ta = document.createElement("textarea");
    ta.value = node.text;
    ta.placeholder = "ტექსტი... (---node:id--- გამყოფი)";
    ta.style.cssText = "width:100%;min-height:80px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:12px;padding:7px 9px;border-radius:6px;font-family:sans-serif;line-height:1.6;resize:vertical;";
    ta.oninput = () => { _editingDialogue[ni].text = ta.value; };

    // buttons section
    const btnsLbl = document.createElement("div");
    btnsLbl.textContent = "ღილაკები:";
    btnsLbl.style.cssText = "font-size:11px;color:var(--muted);";

    const btnsWrap = document.createElement("div");
    btnsWrap.style.cssText = "display:flex;flex-direction:column;gap:6px;";

    node.buttons.forEach((btn, bi) => {
      const brow = document.createElement("div");
      brow.style.cssText = "background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:5px;";

      // label + delete
      const r1 = document.createElement("div");
      r1.style.cssText = "display:flex;gap:6px;align-items:center;";
      const lblInp = document.createElement("input");
      lblInp.value = btn.label;
      lblInp.placeholder = "ღილაკის ტექსტი";
      lblInp.style.cssText = "flex:1;background:var(--panel2);border:1px solid var(--border);color:var(--text);font-size:12px;padding:4px 7px;border-radius:4px;";
      lblInp.oninput = () => { _editingDialogue[ni].buttons[bi].label = lblInp.value; };
      const delBtnBtn = document.createElement("button");
      delBtnBtn.textContent = "✕";
      delBtnBtn.style.cssText = "background:none;border:1px solid var(--red);color:var(--red);border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer;flex-shrink:0;";
      delBtnBtn.onclick = () => removeDialogueBtn(ni, bi);
      r1.appendChild(lblInp);
      r1.appendChild(delBtnBtn);

      // next node
      const r2 = document.createElement("div");
      r2.style.cssText = "display:flex;gap:6px;align-items:center;";
      const r2lbl = document.createElement("span");
      r2lbl.textContent = "→ კვანძი:";
      r2lbl.style.cssText = "font-size:11px;color:var(--muted);flex-shrink:0;";
      const nextInp = document.createElement("input");
      nextInp.value = btn.nextNode || "";
      nextInp.placeholder = "node_id ან ცარიელი=დახურვა";
      nextInp.style.cssText = "flex:1;background:var(--panel2);border:1px solid var(--border);color:var(--blue);font-size:11px;padding:3px 6px;border-radius:4px;font-family:monospace;";
      nextInp.oninput = () => { _editingDialogue[ni].buttons[bi].nextNode = nextInp.value.trim(); };
      r2.appendChild(r2lbl);
      r2.appendChild(nextInp);

      // notify toggle
      const r3 = document.createElement("div");
      r3.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;";
      const notifChk = document.createElement("input");
      notifChk.type = "checkbox";
      notifChk.checked = btn.notify || false;
      notifChk.style.accentColor = "var(--green)";
      notifChk.onchange = () => {
        _editingDialogue[ni].buttons[bi].notify = notifChk.checked;
        ntxtInp.style.display = notifChk.checked ? "block" : "none";
      };
      const notifLbl = document.createElement("span");
      notifLbl.textContent = "📢 notification";
      notifLbl.style.cssText = "font-size:11px;color:var(--muted);";
      r3.appendChild(notifChk);
      r3.appendChild(notifLbl);

      // notify text
      const ntxtInp = document.createElement("input");
      ntxtInp.value = btn.notifyText || "";
      ntxtInp.placeholder = "notification ტექსტი (ან ავტო)";
      ntxtInp.style.cssText = "width:100%;background:var(--panel2);border:1px solid var(--border);color:var(--green);font-size:11px;padding:3px 6px;border-radius:4px;display:" + (btn.notify ? "block" : "none") + ";";
      ntxtInp.oninput = () => { _editingDialogue[ni].buttons[bi].notifyText = ntxtInp.value; };

      // link
      const r4 = document.createElement("div");
      r4.style.cssText = "display:flex;gap:6px;align-items:center;";
      const r4lbl = document.createElement("span");
      r4lbl.textContent = "🔗 ლინკი:";
      r4lbl.style.cssText = "font-size:11px;color:var(--muted);flex-shrink:0;";
      const linkInp = document.createElement("input");
      linkInp.value = btn.link || "";
      linkInp.placeholder = "https://... (სურვილისამებრ)";
      linkInp.style.cssText = "flex:1;background:var(--panel2);border:1px solid var(--border);color:var(--accent);font-size:11px;padding:3px 6px;border-radius:4px;";
      linkInp.oninput = () => { _editingDialogue[ni].buttons[bi].link = linkInp.value.trim(); };
      r4.appendChild(r4lbl);
      r4.appendChild(linkInp);

      brow.appendChild(r1);
      brow.appendChild(r2);
      brow.appendChild(r3);
      brow.appendChild(ntxtInp);
      brow.appendChild(r4);
      btnsWrap.appendChild(brow);
    });

    // add button
    const addBtnBtn = document.createElement("button");
    addBtnBtn.textContent = "+ ღილაკი";
    addBtnBtn.style.cssText = "height:30px;background:transparent;border:1px dashed var(--border);color:var(--muted);font-size:12px;border-radius:5px;cursor:pointer;";
    addBtnBtn.onclick = () => addDialogueBtn(ni);

    nodeDiv.appendChild(hdr);
    nodeDiv.appendChild(ta);
    nodeDiv.appendChild(btnsLbl);
    nodeDiv.appendChild(btnsWrap);
    nodeDiv.appendChild(addBtnBtn);
    container.appendChild(nodeDiv);
  });

  // add node button
  const addNodeBtn = document.createElement("button");
  addNodeBtn.textContent = "+ კვანძი";
  addNodeBtn.style.cssText = "height:36px;background:transparent;border:2px dashed var(--accent);color:var(--accent);font-size:13px;border-radius:6px;cursor:pointer;";
  addNodeBtn.onclick = addDialogueNode;
  container.appendChild(addNodeBtn);
}

// ── LINK INSERTION HELPER (area only now) ──
function insertAreaLink() {
  const ta = document.getElementById("areaTooltipInp");
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
window.insertAreaLink     = insertAreaLink;
window.addDialogueNode    = addDialogueNode;
window.removeDialogueNode = removeDialogueNode;
window.addDialogueBtn     = addDialogueBtn;
window.removeDialogueBtn  = removeDialogueBtn;
