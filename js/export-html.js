// ============================================================
//  export-html.js  —  Viewer Export (index.html + data.js) & Config Export
//  Depends on: state.js, tile-engine.js, render.js, save-load.js, menu-builder.js
//
//  Output per export (2 files, both go to the mdeloviewer repo root):
//    data.js     — per-map data only: window._CFG, _OBJS, _W, _H, _TS, DIALOGS
//    index.html  — light shell from js/viewer/viewer.html (only {{TITLE}} is replaced)
//
//  All viewer code (runtime, terminal, canvas-renderer, unlock, upload,
//  bulk-parser, chat...) is static and lives in the mdeloviewer repo (js/).
//  Hotspots, map canvas, legend button and info line are built client-side
//  by runtime.js from window._CFG — nothing is baked here anymore.
// ============================================================

// ── helpers ──
async function _fetchViewerAsset(path) {
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error('Cannot load ' + path + ' (' + r.status + ')');
  const text = await r.text();
  if (text.includes('\x00')) throw new Error(path + ' — binary/corrupted response (null bytes). Try again.');
  return text;
}

function _expEscTitle(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getMenuData() {
  function ser(n) {
    return {
      id: n.id, icon: n.icon || "📁", title: n.title,
      items: (n.items || [])
        .map(i => typeof i === "string" ? { type: "text", emoji: "•", label: i } : i)
        .filter(i => i.label || i.type === "progress" || i.type === "todo"),
      children: (n.children || []).filter(c => c.title).map(ser)
    };
  }
  return _menuSections.filter(s => s.title).map(ser);
}

function exportConfig() {
  const config = {
    title:       currentProjectName || "მდელო",
    description: (document.getElementById("legTabDesc")?.value || "").trim(),
    menu:        getMenuData()
  };
  const js = "window._CFG = " + JSON.stringify(config, null, 2) + ";";
  downloadFile(js, "config.js", "application/javascript");
  toast("📋 config.js გადმოიწერა");
}

async function doExportHTML() {
  try {
    const mapDesc = (document.getElementById("legTabDesc")?.value || "").trim();
    const mapData = getMapData();

    // embed object sprites as base64 (one canvas crop per placed object)
    const _objUrls = [...new Set(mapData.objects
      .map(o => { const d = tileMap.get(o.id); return d?.sheetUrl || null; })
      .filter(Boolean))];
    const _sheets = new Map();
    await Promise.all(_objUrls.map(url =>
      fetch(url).then(r => r.blob()).then(blob => {
        const bu = URL.createObjectURL(blob);
        return new Promise(res => {
          const img = new Image();
          img.onload  = () => { _sheets.set(url, img); URL.revokeObjectURL(bu); res(); };
          img.onerror = () => { URL.revokeObjectURL(bu); res(); };
          img.src = bu;
        });
      }).catch(() => {})
    ));

    const cfgObjects = mapData.objects.map((o, oi) => {
      const g = objects[oi] || {};   // live editor object — fallback for hotspot fields
      let out = {
        ...o,
        x: o.x ?? g.x, y: o.y ?? g.y, cols: o.cols ?? g.cols, rows: o.rows ?? g.rows,
        lb: o.lb ?? g.lb, title: o.title ?? g.title, tooltip: o.tooltip ?? g.tooltip,
        marker: o.marker ?? g.marker, dialogue: o.dialogue ?? g.dialogue
      };
      const d = tileMap.get(o.id);
      const cw = (out.cols || 1) * TS, ch = (out.rows || 1) * TS;
      if (d?.sheetUrl && _sheets.has(d.sheetUrl)) {
        try {
          const sh = _sheets.get(d.sheetUrl);
          const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
          const cx = cv.getContext("2d"); cx.imageSmoothingEnabled = false;
          cx.drawImage(sh, d.sx, d.sy, d.sw, d.sh, 0, 0, cw, ch);
          out.src = cv.toDataURL("image/png");
        } catch (e) {}
      } else if (!out.src && g.img) {
        // single-image object — the old baked-PNG path drew obj.img directly;
        // canvas-renderer needs it as src now that the PNG path is gone
        try {
          const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
          const cx = cv.getContext("2d"); cx.imageSmoothingEnabled = false;
          cx.drawImage(g.img, 0, 0, cw, ch);
          out.src = cv.toDataURL("image/png");
        } catch (e) {}
      }
      return out;
    });

    // map canvas size — same crop the old baked PNG had
    const CROP = 1;
    const w = offscreen.width  - CROP * 2;
    const h = offscreen.height - CROP * 2;

    const title = currentProjectName || "RPG Map";
    const cfg = {
      title: title,
      description: mapDesc,               // full raw text (>>flag blocks included); runtime cuts the default block
      menu: getMenuData(),
      cols: COLS, rows: ROWS,
      map: mapData.map, overlayMap: mapData.overlayMap,
      objects: cfgObjects,
      custom: mapData.custom, autoTiles: mapData.autoTiles, dualTiles: mapData.dualTiles,
      hotAreas: hotAreas.map(a => ({
        id: a.id, x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2,
        label: a.label, tooltip: a.tooltip, groupId: a.groupId
      }))
    };

    const objsData = cfgObjects.map(o => ({
      title: o.title, lb: o.lb, dialogue: o.dialogue || [],
      requires: o.requires || null, on_complete: o.on_complete || null
    }));

    // window.DIALOGS — every object with dialogue becomes a dialog entry
    const dialogsMap = {};
    cfgObjects.forEach((o, oi) => {
      if (o.dialogue && o.dialogue.length) {
        dialogsMap['dlg_' + oi] = {
          id: 'dlg_' + oi, trigger: String(oi),
          requires: o.requires || null, nodes: o.dialogue, on_complete: o.on_complete || null
        };
      }
    });

    // ── data.js ──
    const dataJS =
      "// generated by Mdelo editor — per-map data only, do not edit by hand\n" +
      "window._CFG = "    + JSON.stringify(cfg)        + ";\n" +
      "window._OBJS = "   + JSON.stringify(objsData)   + ";\n" +
      "window._W = " + w + "; window._H = " + h + "; window._TS = " + TS + ";\n" +
      "window.DIALOGS = " + JSON.stringify(dialogsMap) + ";\n";

    // ── index.html (light shell; only {{TITLE}} is per-map) ──
    const tmpl = await _fetchViewerAsset('js/viewer/viewer.html');
    const html = tmpl.replace(/{{TITLE}}/g, () => _expEscTitle(title));
    const left = html.match(/{{[A-Z_]+}}/g);
    if (left) throw new Error('viewer.html has unreplaced placeholders: ' + [...new Set(left)].join(', '));

    downloadFile(dataJS, "data.js", "application/javascript");
    setTimeout(() => downloadFile(html, "index.html", "text/html"), 400); // avoid browser blocking 2 simultaneous downloads
    toast("🌐 index.html + data.js — მზადაა!");
  } catch (e) { console.error("Viewer export error:", e); toast("❌ export: " + e.message); }
}

// ── WINDOW BINDINGS ──
window.getMenuData  = getMenuData;
window.exportConfig = exportConfig;
window.doExportHTML = doExportHTML;
