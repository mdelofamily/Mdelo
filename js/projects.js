// ============================================================
//  projects.js  —  Local Project Manager (localStorage)
//  Depends on: state.js, tile-engine.js, render.js, ui-palette.js, save-load.js
// ============================================================

// ── STORAGE HELPERS ──
function getProjects() {
  try { return JSON.parse(localStorage.getItem(PROJ_KEY) || "[]"); }
  catch { return []; }
}

function setProjects(list) {
  localStorage.setItem(PROJ_KEY, JSON.stringify(list));
}

// ── THUMBNAIL ──
function makeThumb() {
  try {
    const th  = document.createElement("canvas"); th.width = 64; th.height = 64;
    const ctx = th.getContext("2d"); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, 0, 0, 64, 64);
    return th.toDataURL("image/png");
  } catch (e) {
    // coord-tile sheets taint the canvas — return a solid placeholder
    const th  = document.createElement("canvas"); th.width = 64; th.height = 64;
    th.getContext("2d").fillStyle = "#1a2e1a";
    th.getContext("2d").fillRect(0, 0, 64, 64);
    return th.toDataURL("image/png");
  }
}

// ── OPEN / CLOSE OVERLAY ──
function openProjects() {
  document.getElementById("projNameInput").value = currentProjectName || "";
  document.getElementById("projOverlay").classList.add("show");
  renderProjectList();
}

function closeProjects() {
  document.getElementById("projOverlay").classList.remove("show");
}

// ── SAVE ──
function saveProject() {
  const name = document.getElementById("projNameInput").value.trim();
  if (!name) { toast("⚠ სახელი შეიყვანე"); return; }
  const projects = getProjects();
  const thumb    = makeThumb();
  const data     = getMapData();
  const now      = new Date();
  const dateStr  = now.toLocaleDateString("ka-GE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const existing = projects.findIndex(p => p.name === name);
  const proj     = { name, thumb, data, date: dateStr, cols: COLS, rows: ROWS };
  if (existing >= 0) { projects[existing] = proj; }
  else               { projects.unshift(proj); }
  if (projects.length > 20) projects.splice(20);
  setProjects(projects);
  currentProjectName = name;
  renderProjectList();
  toast("💾 '" + name + "' შენახულია");
  closeProjects();
}

// ── LOAD ──
function loadProject(name) {
  const projects = getProjects();
  const proj     = projects.find(p => p.name === name);
  if (!proj) return;
  const d = proj.data;

  COLS = d.cols; ROWS = d.rows;
  map        = d.map;
  overlayMap = d.overlayMap || Array.from({ length: ROWS }, () => Array(COLS).fill(""));
  hist       = [];
  customTiles = []; autoTiles = []; dualTiles = [];

  const customs = d.custom    || [];
  const ats     = d.autoTiles || [];
  const dts     = d.dualTiles || [];
  let   pending = customs.length + ats.length + dts.length;

  function done() {
    if (--pending <= 0) {
      rebuildTileMap(); buildPalette(); rebuildOff(); centerView();
      objects = [];
      (d.objects || []).forEach(o => {
        const def = tileMap.get(o.id); if (!def) return;
        const img = def.img || getImg(o.id);
        if (img) objects.push({ ...o, img });
      });
      scheduleRender();
    }
  }

  if (pending === 0) { rebuildTileMap(); buildPalette(); rebuildOff(); centerView(); scheduleRender(); }
  else {
    if (customs.length) customs.forEach(ct => _loadCustomTile(ct, done));
    if (ats.length)     _loadAutoTilesArr(ats, done);
    if (dts.length)     _loadDualTiles(dts, done);
  }

  currentProjectName = name;
  document.getElementById("projNameInput").value = name;

  // restore legend data
  if (d.legendDesc  != null) document.getElementById("legTabDesc").value = d.legendDesc || "";
  if (d.legendLabels)        _legendLabels = { ...(d.legendLabels || {}) };
  if (d.legendMenu)          { _menuSections = d.legendMenu || []; renderMenuBuilder(); }
  if (d.hotAreas)            hotAreas = d.hotAreas;
  if (d.spotBaseUrl != null) {
    spotBaseUrl = d.spotBaseUrl;
    const sui = document.getElementById("spotBaseUrlInp");
    if (sui) sui.value = spotBaseUrl;
  }

  closeProjects();
  toast("📂 '" + name + "' გაიხსნა");
}

// ── DELETE ──
function deleteProject(name) {
  const projects = getProjects().filter(p => p.name !== name);
  setProjects(projects);
  renderProjectList();
  toast("🗑 '" + name + "' წაიშალა");
}

// ── RENDER LIST ──
function renderProjectList() {
  const list     = document.getElementById("projList");
  const projects = getProjects();
  if (!projects.length) {
    list.innerHTML = '<div id="projEmpty">📁 პროექტები არ გაქვს<br>სახელი შეიყვანე და შეინახე</div>';
    return;
  }
  list.innerHTML = "";
  projects.forEach(p => {
    const item  = document.createElement("div"); item.className = "pitem";
    const thumb = document.createElement("img");
    thumb.className = "pthumb"; thumb.width = 48; thumb.height = 48;
    thumb.src = p.thumb; thumb.style.width = "48px"; thumb.style.height = "48px";

    const info = document.createElement("div"); info.className = "pinfo";
    info.innerHTML =
      '<div class="pname">' + p.name + '</div>' +
      '<div class="pdate">' + p.date + '</div>' +
      '<div class="psize">' + p.cols + "×" + p.rows + '</div>';

    const openBtn   = document.createElement("button");
    openBtn.className = "pbtn open"; openBtn.textContent = "გახსნა";
    openBtn.onclick   = () => loadProject(p.name);

    const delBtn    = document.createElement("button");
    delBtn.className = "pbtn del"; delBtn.textContent = "✕";
    delBtn.onclick   = e => {
      e.stopPropagation();
      if (confirm("'" + p.name + "' წაიშალოს?")) deleteProject(p.name);
    };

    item.appendChild(thumb);
    item.appendChild(info);
    item.appendChild(openBtn);
    item.appendChild(delBtn);
    list.appendChild(item);
  });
}

// ── WINDOW BINDINGS ──
window.getProjects        = getProjects;
window.setProjects        = setProjects;
window.makeThumb          = makeThumb;
window.openProjects       = openProjects;
window.closeProjects      = closeProjects;
window.saveProject        = saveProject;
window.loadProject        = loadProject;
window.deleteProject      = deleteProject;
window.renderProjectList  = renderProjectList;
