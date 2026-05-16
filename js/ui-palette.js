// ============================================================
//  ui-palette.js  —  Tile Palette, Buildings Grid & Pack Import
//  Depends on: state.js, tile-engine.js, render.js, tools.js
// ============================================================

// ── PALETTE BUILD ──
function buildPalette() {
  rebuildTileMap();
  _prevTileChip = null;
  const tr = document.getElementById("tr");
  tr.innerHTML = "";

  // upload chip
  const ua = document.createElement("div");
  ua.className = "upchip";
  ua.innerHTML = '<span style="font-size:22px">＋</span><span>ფილა</span>';
  ua.addEventListener("click", openUpload);
  ua.addEventListener("touchstart", e => { e.stopPropagation(); openUpload(); }, { passive: false });
  tr.appendChild(ua);

  customTiles.forEach(t => { if (!t.isObject) tr.appendChild(makeChip(t.id, t.lb, true, false)); });
  autoTiles.forEach(t   => { if (!t.isObject) tr.appendChild(makeChip(t.id, t.lb, false, true)); });
  dualTiles.forEach(t   => { tr.appendChild(makeDualChip(t)); });

  if (!baseTile) {
    const first = customTiles.find(t => !t.isObject) || autoTiles[0];
    if (first) baseTile = first.id;
  }
  buildBuildingGrid();
}

// ── TILE CHIP ──
function makeChip(id, lb, isCustom, isPack) {
  const ch = document.createElement("div");
  ch.className = "tchip" + (id === curTile ? " sel" : "");
  ch.dataset.id = id;
  if (id === curTile) _prevTileChip = ch;

  const cv  = document.createElement("canvas");
  cv.width  = 40; cv.height = 40;
  cv.style.width = "40px"; cv.style.height = "40px";
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const atTile = tileMap.get(id);
  if (atTile?.autoTile) {
    const previewImg = atTile.imgs[15] || atTile.imgs.find(Boolean);
    if (previewImg) ctx.drawImage(previewImg, 0, 0, 40, 40);
    else if (atTile.sheetImg && atTile.sprites) {
      const sp = atTile.sprites[15] || atTile.sprites.find(s => s && typeof s === "object");
      if (sp) ctx.drawImage(atTile.sheetImg, sp.x, sp.y, sp.w, sp.h, 0, 0, 40, 40);
    }
  } else if (atTile?.img) {
    ctx.drawImage(atTile.img, 0, 0, 40, 40);
  } else if (atTile?.sheetImg) {
    ctx.drawImage(atTile.sheetImg, atTile.sx, atTile.sy, atTile.sw, atTile.sh, 0, 0, 40, 40);
  }
  ch.appendChild(cv);

  if (isCustom) {
    const xb = document.createElement("button"); xb.className = "xbtn"; xb.textContent = "✕";
    xb.addEventListener("click",      e => delCustom(id, e));
    xb.addEventListener("touchstart", e => { e.stopPropagation(); delCustom(id, e); }, { passive: false });
    ch.appendChild(xb);
  } else if (isPack) {
    const xb = document.createElement("button"); xb.className = "xbtn"; xb.textContent = "✕";
    xb.addEventListener("click",      e => delPackTile(id, e, "auto"));
    xb.addEventListener("touchstart", e => { e.stopPropagation(); delPackTile(id, e, "auto"); }, { passive: false });
    ch.appendChild(xb);
  }

  const lbEl = document.createElement("div"); lbEl.className = "lb";
  const isAt = atTile?.autoTile, isOb = atTile?.isObject;
  lbEl.textContent = (isOb ? "⊞ " : isAt ? "🔲 " : "") + lb;
  ch.appendChild(lbEl);

  let _chipLt = null;
  ch.addEventListener("touchstart", e => {
    e.stopPropagation(); selectTile(id);
    _chipLt = setTimeout(() => { _chipLt = null; openLayerPopup(ch); }, 500);
  }, { passive: false });
  ch.addEventListener("touchend",  () => { if (_chipLt) { clearTimeout(_chipLt); _chipLt = null; } });
  ch.addEventListener("touchmove", () => { if (_chipLt) { clearTimeout(_chipLt); _chipLt = null; } });
  ch.addEventListener("click", () => selectTile(id));
  return ch;
}

// ── DUAL TILE CHIP ──
function makeDualChip(dt) {
  const ch = document.createElement("div");
  ch.className = "tchip" + (curTile === dt.id ? " sel" : "");
  ch.dataset.id = dt.id;
  if (curTile === dt.id) _prevTileChip = ch;

  const cv = document.createElement("canvas"); cv.width = 40; cv.height = 40;
  cv.style.width = "40px"; cv.style.height = "40px"; cv.style.imageRendering = "pixelated";
  const prevImg = dt.imgs[15] || dt.imgs.find(Boolean);
  if (prevImg) cv.getContext("2d").drawImage(prevImg, 0, 0, 40, 40);
  else if (dt.sheetImg && dt.sprites) {
    const sp = dt.sprites[15] || dt.sprites.find(s => s && typeof s === "object");
    if (sp) cv.getContext("2d").drawImage(dt.sheetImg, sp.x, sp.y, sp.w, sp.h, 0, 0, 40, 40);
  }
  ch.appendChild(cv);

  const lb = document.createElement("div"); lb.className = "lb";
  lb.textContent = "⬡ " + dt.lb; ch.appendChild(lb);

  const xb = document.createElement("button"); xb.className = "xbtn"; xb.textContent = "✕";
  xb.addEventListener("click",      e => delPackTile(dt.id, e, "dual"));
  xb.addEventListener("touchstart", e => { e.stopPropagation(); delPackTile(dt.id, e, "dual"); }, { passive: false });
  ch.appendChild(xb);

  ch.addEventListener("click", () => selectTile(dt.id));
  let _dlt = null;
  ch.addEventListener("touchstart", e => {
    e.stopPropagation(); selectTile(dt.id);
    _dlt = setTimeout(() => { _dlt = null; openLayerPopup(ch); }, 500);
  }, { passive: false });
  ch.addEventListener("touchend",  () => { if (_dlt) { clearTimeout(_dlt); _dlt = null; } });
  ch.addEventListener("touchmove", () => { if (_dlt) { clearTimeout(_dlt); _dlt = null; } });
  return ch;
}

// ── SELECT TILE ──
function selectTile(id) {
  curTile = id;
  if (_prevTileChip) _prevTileChip.classList.remove("sel");
  const el = document.querySelector(".tchip[data-id='" + id + "']");
  if (el) { el.classList.add("sel"); _prevTileChip = el; }
  document.getElementById("sl").textContent = tileMap.get(id)?.lb || id || "ფილა";
  updSelPrev();
  if (curTool === "obj_place" || curTool === "obj_move") curTool = "draw";
}

function updSelPrev() {
  const cv  = document.getElementById("sp");
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 24, 24);
  if (curTile) drawTile(ctx, curTile, 0, 0, 24);
}

// ── BUILDINGS GRID ──
function buildBuildingGrid() {
  const grid = document.getElementById("buildGrid");
  grid.innerHTML = "";
  _prevBuildChip = null;

  const ua = document.createElement("div"); ua.className = "upchip";
  ua.innerHTML = '<span style="font-size:22px">＋</span><span>ობიექტი</span>';
  ua.onclick = openBuildingUpload;
  ua.addEventListener("touchend", e => { e.preventDefault(); e.stopPropagation(); openBuildingUpload(); }, { passive: false });
  grid.appendChild(ua);

  const objs = customTiles.filter(t => t.isObject);
  if (!objs.length) return;

  objs.forEach(t => {
    const chip = document.createElement("div");
    chip.className = "bchip" + (curTile === t.id ? " sel" : "");
    chip.dataset.id = t.id;
    if (curTile === t.id) _prevBuildChip = chip;

    const PREV = 52;
    const ar   = t.cols / t.rows;
    const pw   = ar >= 1 ? PREV : Math.round(PREV * ar);
    const ph   = ar <= 1 ? PREV : Math.round(PREV / ar);
    const cv   = document.createElement("canvas");
    cv.width = pw; cv.height = ph;
    cv.style.width = pw + "px"; cv.style.height = ph + "px";
    cv.style.imageRendering = "pixelated";
    if (t.img)      cv.getContext("2d").drawImage(t.img, 0, 0, pw, ph);
    else if (t.sheetImg) cv.getContext("2d").drawImage(t.sheetImg, t.sx, t.sy, t.sw, t.sh, 0, 0, pw, ph);
    chip.appendChild(cv);

    const lbl = document.createElement("div"); lbl.className = "blb";
    lbl.textContent = (t.lb || t.id).slice(0, 10);
    chip.appendChild(lbl);

    const xb = document.createElement("button"); xb.className = "xbtn"; xb.textContent = "✕";
    xb.addEventListener("click",      e => { e.stopPropagation(); delCustom(t.id, e); });
    xb.addEventListener("touchstart", e => { e.stopPropagation(); delCustom(t.id, e); }, { passive: false });
    chip.appendChild(xb);

    chip.addEventListener("click",      () => selectBuilding(t.id));
    chip.addEventListener("touchstart", e => { e.stopPropagation(); selectBuilding(t.id); }, { passive: false });
    grid.appendChild(chip);
  });
}

function selectBuilding(id) {
  curTile  = id;
  curTool  = "obj_place";
  lockedPos = null;
  if (_prevBuildChip) _prevBuildChip.classList.remove("sel");
  const el = document.querySelector(".bchip[data-id='" + id + "']");
  if (el) { el.classList.add("sel"); _prevBuildChip = el; }
  const t = tileMap.get(id);
  document.getElementById("sl").textContent = "⊞ " + (t?.lb || id);
  updSelPrev();
  toast("⊞ " + (t?.lb || id) + " — double-tap canvas-ზე ჩასასმელად");
}

// ── DELETE ──
function delCustom(id, e) {
  e.stopPropagation();
  if (!confirm("ფილა წაიშალოს?")) return;
  customTiles = customTiles.filter(t => t.id !== id);
  objects     = objects.filter(o => o.id !== id);
  if (curTile === id) { curTile = ""; updSelPrev(); }
  let ch = false;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (map[r][c] === id) { map[r][c] = ""; ch = true; }
  if (ch) rebuildOff();
  buildPalette(); scheduleRender(); toast("🗑 წაიშალა");
}

function delPackTile(id, e, type) {
  e.stopPropagation();
  if (!confirm("ფილა წაიშალოს?")) return;
  if (type === "auto")      autoTiles = autoTiles.filter(t => t.id !== id);
  else if (type === "dual") dualTiles = dualTiles.filter(t => t.id !== id);
  else { autoTiles = autoTiles.filter(t => t.id !== id); dualTiles = dualTiles.filter(t => t.id !== id); }
  if (curTile === id) { curTile = ""; updSelPrev(); }
  let ch = false;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (map[r][c] === id) { map[r][c] = ""; ch = true; }
  if (ch) rebuildOff();
  rebuildTileMap(); buildPalette(); scheduleRender(); toast("🗑 წაიშალა");
}

// ── UPLOAD (single tile) ──
function openUpload() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/png,image/gif,image/svg+xml,image/jpeg,image/webp";
  inp.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = ev => {
      const img = new Image();
      img.onload = () => {
        pending = { id: "c_" + Date.now(), src: ev.target.result, img };
        const p   = document.getElementById("mprev");
        const ctx = p.getContext("2d");
        ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, 64, 64);
        ctx.drawImage(img, 0, 0, 64, 64);
        document.getElementById("tname").value = "";
        document.getElementById("modal").classList.add("show");
        setTimeout(() => document.getElementById("tname").focus(), 100);
      };
      img.src = ev.target.result;
    };
    rd.readAsDataURL(f);
  };
  inp.click();
}

// ── UPLOAD (building/object) ──
function openBuildingUpload() {
  if (_buPickerActive) return;
  _buPickerActive = true;
  setTimeout(() => _buPickerActive = false, 2000);
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/png,image/gif,image/svg+xml,image/jpeg,image/webp";
  let handled = false;
  inp.onchange = e => {
    if (handled) return; handled = true; _buPickerActive = false;
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const dims = prompt("ზომა (სვეტი×სტრიქონი):", _lastBuildDims);
        if (!dims) return;
        _lastBuildDims = dims;
        const parts = dims.replace(/[×x,]/g, "x").split("x");
        const cols  = Math.max(1, parseInt(parts[0]) || 1);
        const rows  = Math.max(1, parseInt(parts[1] || parts[0]) || 1);
        pending = { id: "obj_" + Date.now(), src: ev.target.result, img, _isObject: true, _cols: cols, _rows: rows };
        const p   = document.getElementById("mprev");
        const ctx = p.getContext("2d");
        ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, 64, 64);
        ctx.drawImage(img, 0, 0, 64, 64);
        document.getElementById("tname").value = "";
        document.getElementById("modal").classList.add("show");
        setTimeout(() => document.getElementById("tname").focus(), 100);
      };
      img.src = ev.target.result;
    };
    rd.readAsDataURL(f);
  };
  inp.click();
}

// ── CONFIRM ADD (from modal) ──
function confirmAdd() {
  if (!pending) return;
  let n = document.getElementById("tname").value.trim() || "custom";
  let fn = n, i = 2;
  while (customTiles.find(t => t.lb === fn)) fn = n + " " + i++;
  const entry = { id: pending.id, lb: fn, src: pending.src, img: pending.img };
  if (pending._isObject) { entry.isObject = true; entry.cols = pending._cols || 1; entry.rows = pending._rows || 1; }
  customTiles.push(entry);
  pending = null;
  closeModal();
  if (entry.isObject) {
    rebuildTileMap();
    buildBuildingGrid();
    selectBuilding(entry.id);
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("on"));
    document.getElementById("tab-build").classList.add("on");
    document.getElementById("tabTiles").style.display     = "none";
    document.getElementById("tabBuildings").style.display = "block";
    document.getElementById("tabTools").style.display     = "none";
    toast("✓ " + fn + " (" + entry.cols + "×" + entry.rows + ") — შენობებში დაემატა");
  } else {
    buildPalette();
    selectTile(customTiles[customTiles.length - 1].id);
    toast("✓ " + fn + " — ფილებში დაემატა");
  }
}

function closeModal() {
  document.getElementById("modal").classList.remove("show");
  pending = null;
}

// ══════════════════════════════════════════════════════════════
//  SPRITE PACK IMPORT  (dual-grid, autotile, regular, objects)
// ══════════════════════════════════════════════════════════════

function loadSpritePack(e) {
  const files = Array.from(e.target.files); if (!files.length) return;
  e.target.value = "";
  files.forEach(f => {
    const rd = new FileReader();
    rd.onload = ev => {
      try {
        const d        = JSON.parse(ev.target.result);
        const sheetUrl = d.spritesheet || null;

        function withSheet(cb) {
          if (sheetUrl) {
            const sh = new Image();
            sh.onload  = () => cb(sh);
            sh.onerror = () => { toast("⚠ sheet ვერ ჩაიტვირთა: " + sheetUrl); cb(null); };
            sh.src = sheetUrl;
          } else cb(null);
        }

        withSheet(sheet => {
          // ── dual tiles ──
          if (d.dualTiles && d.dualTiles.length) {
            const newDts = d.dualTiles.filter(dt => !dualTiles.find(t => t.id === dt.id));
            if (newDts.length) {
              newDts.forEach(dt => {
                const rawSprites = dt.sprites || [];
                const hasCoords  = rawSprites.some(s => s && typeof s === "object" && s.x != null);
                if (hasCoords && sheet) {
                  dualTiles.push({ ...dt, sheetUrl, sheetImg: sheet, imgs: Array(16).fill(null) });
                  rebuildTileMap(); buildPalette();
                  toast("[⬡ Dual] " + newDts.map(t => t.lb).join(", ") + " ჩაიტვირთა");
                } else {
                  _loadDualTiles([dt], () => { rebuildTileMap(); buildPalette(); toast("[⬡ Dual] " + dt.lb + " ჩაიტვირთა"); });
                }
              });
            }
          }

          // ── autotiles ──
          if (d.autoTiles && d.autoTiles.length) {
            let atTotal = d.autoTiles.length, atLoaded = 0;
            d.autoTiles.forEach(at => {
              const rawSprites = at.sprites || [];
              const hasCoords  = rawSprites.some(s => s && typeof s === "object" && s.x != null);
              if (hasCoords && sheet) {
                if (!autoTiles.find(t => t.id === at.id))
                  autoTiles.push({ id: at.id, lb: at.lb || at.id, autoTile: true, sprites: rawSprites,
                    imgs: Array(16).fill(null), sheetImg: sheet, sheetUrl,
                    baseTileId: at.baseTileId || null, compatibleWith: at.compatibleWith || [], category: at.category || "" });
                atLoaded++; checkAtDone(); return;
              }
              // base64 sprites
              const imgs    = Array(16).fill(null);
              let sprDone   = 0;
              const srcs    = rawSprites.map(s => (typeof s === "string" ? s : null));
              const valid   = srcs.filter(Boolean);
              if (!valid.length) { atLoaded++; checkAtDone(); return; }
              srcs.forEach((src, idx) => {
                if (!src) { sprDone++; if (sprDone === srcs.length) { atLoaded++; checkAtDone(); } return; }
                const img = new Image();
                img.onload = () => { imgs[idx] = img; sprDone++; if (sprDone === srcs.length) {
                  if (!autoTiles.find(t => t.id === at.id))
                    autoTiles.push({ id: at.id, lb: at.lb || at.id, autoTile: true, sprites: rawSprites, imgs,
                      ...(sheetUrl ? { sheetUrl } : {}), baseTileId: at.baseTileId || null,
                      compatibleWith: at.compatibleWith || [], category: at.category || "" });
                  atLoaded++; checkAtDone(); } };
                img.onerror = () => { sprDone++; if (sprDone === srcs.length) { atLoaded++; checkAtDone(); } };
                img.src = src;
              });
            });
            function checkAtDone() {
              if (atLoaded === atTotal) {
                buildPalette(); rebuildOff(); scheduleRender();
                if (!curTile && autoTiles.length) selectTile(autoTiles[0].id);
                buildBuildingGrid();
                toast("🔲 " + atLoaded + " ავტო-ფილა ჩაიტვირთა!");
              }
            }
          }

          // ── regular tiles ──
          const list = d.tiles || (!d.autoTiles ? d : []);
          if (Array.isArray(list) && list.length) {
            let loaded = 0;
            list.forEach(t => {
              if (sheet && t.x != null) {
                if (!customTiles.find(ct => ct.id === t.id)) {
                  const entry = { id: t.id || ("sp_" + Date.now()), lb: t.lb || "tile",
                    sheetImg: sheet, sx: t.x, sy: t.y, sw: t.w, sh: t.h, sheetUrl, category: t.category || "" };
                  if (t.isObject) { entry.isObject = true; entry.cols = t.cols || 1; entry.rows = t.rows || 1; }
                  customTiles.push(entry);
                }
                if (++loaded === list.length) _afterTilesLoaded();
                return;
              }
              const src = t.src || null;
              if (!src) { loaded++; return; }
              const img = new Image();
              img.onload = () => {
                if (!customTiles.find(ct => ct.id === t.id)) {
                  const entry = { id: t.id || ("sp_" + Date.now()), lb: t.lb || "tile", src, img, category: t.category || "" };
                  if (t.isObject) { entry.isObject = true; entry.cols = t.cols || 1; entry.rows = t.rows || 1; }
                  customTiles.push(entry);
                }
                if (++loaded === list.length) _afterTilesLoaded();
              };
              img.onerror = () => { loaded++; };
              img.src = src;
            });
            function _afterTilesLoaded() {
              buildPalette();
              const firstNonObj = customTiles.find(t => !t.isObject);
              if (firstNonObj && !baseTile) baseTile = firstNonObj.id;
              const firstObj = customTiles.find(t => t.isObject);
              if (firstObj) {
                selectBuilding(firstObj.id);
                document.querySelectorAll(".tab").forEach(b => b.classList.remove("on"));
                document.getElementById("tab-build").classList.add("on");
                document.getElementById("tabTiles").style.display     = "none";
                document.getElementById("tabBuildings").style.display = "block";
                document.getElementById("tabTools").style.display     = "none";
              } else if (customTiles.length) {
                selectTile(customTiles.find(t => !t.isObject)?.id || customTiles[0].id);
              }
              const objCount  = customTiles.filter(t => t.isObject).length;
              const tileCount = customTiles.filter(t => !t.isObject).length;
              toast("📦 " + (objCount ? "📁" + objCount + " ობიექტი " : "") + (tileCount ? "🗂" + tileCount + " ფილა" : "") + " ჩაიტვირთა");
            }
          }
        }); // end withSheet
      } catch (err) { toast("⚠ " + err.message); }
    };
    rd.readAsText(f);
  });
}

// ── LOAD DUAL TILES (from save/load restore) ──
function _loadDualTiles(arr, cb) {
  arr.forEach(dt => {
    const rawSprites = dt.sprites || [];
    const hasCoords  = rawSprites.some(s => s && typeof s === "object" && s.x != null);
    if (dt.sheetUrl && hasCoords) {
      _loadSheet(dt.sheetUrl, sh => {
        dualTiles.push({ ...dt, imgs: Array(16).fill(null), ...(sh ? { sheetImg: sh } : {}) });
        cb();
      });
      return;
    }
    const imgs = Array(16).fill(null);
    function doLoad(srcs) {
      const valid = srcs.map((s, i) => ({ s, i })).filter(x => x.s);
      if (!valid.length) { dualTiles.push({ ...dt, imgs }); cb(); return; }
      let done = 0;
      valid.forEach(({ s, i }) => {
        const img = new Image();
        img.onload  = () => { imgs[i] = img; if (++done >= valid.length) { dualTiles.push({ ...dt, imgs }); cb(); } };
        img.onerror = () => {              if (++done >= valid.length) { dualTiles.push({ ...dt, imgs }); cb(); } };
        img.src = s;
      });
    }
    if (dt.sheetUrl) {
      _loadSheet(dt.sheetUrl, sh => {
        if (!sh) { dualTiles.push({ ...dt, imgs }); cb(); return; }
        const srcs = rawSprites.map(s => {
          if (!s) return null;
          if (typeof s === "string") return s;
          const cv = document.createElement("canvas"); cv.width = s.w; cv.height = s.h;
          cv.getContext("2d").drawImage(sh, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
          return cv.toDataURL("image/png");
        });
        doLoad(srcs);
      });
    } else { doLoad(rawSprites); }
  });
}

// ── LOAD AUTOTILE ARRAY (from save/load restore) ──
function _loadAutoTilesArr(ats, onEach) {
  ats.forEach(at => {
    const rawSprites = at.sprites || [];
    const hasCoords  = rawSprites.some(s => s && typeof s === "object" && s.x != null);
    if (at.sheetUrl && hasCoords) {
      _loadSheet(at.sheetUrl, sh => {
        if (!sh) { autoTiles.push({ ...at, imgs: Array(16).fill(null) }); onEach(); return; }
        autoTiles.push({ ...at, imgs: Array(16).fill(null), sheetImg: sh });
        onEach();
      });
      return;
    }
    const imgs  = Array(16).fill(null);
    let   sdone = 0;
    function fromSrcs(srcs) {
      const total = srcs.filter(Boolean).length;
      if (!total) { autoTiles.push({ ...at, imgs }); onEach(); return; }
      srcs.forEach((src, idx) => {
        if (!src) return;
        const img = new Image();
        img.onload  = () => { imgs[idx] = img; if (++sdone >= total) { autoTiles.push({ ...at, imgs }); onEach(); } };
        img.onerror = () => {                  if (++sdone >= total) { autoTiles.push({ ...at, imgs }); onEach(); } };
        img.src = src;
      });
    }
    if (at.sheetUrl) {
      _loadSheet(at.sheetUrl, sh => {
        if (!sh) { autoTiles.push({ ...at, imgs }); onEach(); return; }
        const srcs = rawSprites.map(s => {
          if (!s) return null; if (typeof s === "string") return s;
          const cv = document.createElement("canvas"); cv.width = s.w; cv.height = s.h;
          cv.getContext("2d").drawImage(sh, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
          return cv.toDataURL("image/png");
        });
        fromSrcs(srcs);
      });
    } else { fromSrcs(rawSprites); }
  });
}

// ── LOAD SINGLE CUSTOM TILE (from save/load restore) ──
function _loadCustomTile(ct, onDone) {
  if (ct.sheetUrl) {
    _loadSheet(ct.sheetUrl, sh => {
      if (!sh) { onDone(); return; }
      const entry = { id: ct.id, lb: ct.lb, sheetImg: sh, sx: ct.x, sy: ct.y, sw: ct.w, sh: ct.h, sheetUrl: ct.sheetUrl };
      if (ct.isObject) { entry.isObject = true; entry.cols = ct.cols || 1; entry.rows = ct.rows || 1; }
      customTiles.push(entry); onDone();
    });
  } else {
    const img = new Image();
    img.onload = () => {
      const entry = { id: ct.id, lb: ct.lb, img, src: ct.src };
      if (ct.isObject) { entry.isObject = true; entry.cols = ct.cols || 1; entry.rows = ct.rows || 1; }
      customTiles.push(entry); onDone();
    };
    img.onerror = onDone;
    img.src = ct.src;
  }
}

// ── WINDOW BINDINGS ──
window.buildPalette      = buildPalette;
window.makeChip          = makeChip;
window.makeDualChip      = makeDualChip;
window.selectTile        = selectTile;
window.updSelPrev        = updSelPrev;
window.buildBuildingGrid = buildBuildingGrid;
window.selectBuilding    = selectBuilding;
window.delCustom         = delCustom;
window.delPackTile       = delPackTile;
window.openUpload        = openUpload;
window.openBuildingUpload = openBuildingUpload;
window.confirmAdd        = confirmAdd;
window.closeModal        = closeModal;
window.loadSpritePack    = loadSpritePack;
window._loadDualTiles    = _loadDualTiles;
window._loadAutoTilesArr = _loadAutoTilesArr;
window._loadCustomTile   = _loadCustomTile;
