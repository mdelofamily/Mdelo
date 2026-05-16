// ============================================================
//  ui-panels.js  —  Bottom Panel, Tabs, Legend Overlay
//  Depends on: state.js
// ============================================================

function togglePanel() {
  panelOpen = !panelOpen;
  document.getElementById("pb").style.display    = panelOpen ? "" : "none";
  document.getElementById("ptbtn").textContent   = panelOpen ? "▲" : "▼";
  scheduleRender();
}

function switchTab(tab, el) {
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("on"));
  if (el) el.classList.add("on");
  document.getElementById("tabTiles").style.display     = tab === "tiles" ? "flex"  : "none";
  document.getElementById("tabBuildings").style.display = tab === "build" ? "block" : "none";
  document.getElementById("tabTools").style.display     = tab === "tools" ? "block" : "none";
  document.getElementById("tabLegend").style.display    = "none";
  if (tab === "legend") {
    openLegendTab();
    // reset tab highlight — legend is a fullscreen overlay, not a real tab
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("on"));
    document.getElementById("tab-tiles").classList.add("on");
    document.getElementById("tabTiles").style.display = "flex";
  }
}

function openLegendTab() {
  document.getElementById("legendTabOverlay").classList.add("show");
}

function closeLegendTab() {
  document.getElementById("legendTabOverlay").classList.remove("show");
}

// ── WINDOW BINDINGS ──
window.togglePanel    = togglePanel;
window.switchTab      = switchTab;
window.openLegendTab  = openLegendTab;
window.closeLegendTab = closeLegendTab;
