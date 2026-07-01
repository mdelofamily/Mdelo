// ============================================================
//  export-html.js  —  HTML Viewer Export & Config Export
//  Depends on: state.js, tile-engine.js, render.js, save-load.js, menu-builder.js
//  Viewer template lives in: viewer/viewer.html
//  Runtime JS:               viewer/runtime.js
//  Terminal JS:              viewer/terminal.js
//  Canvas renderer:          viewer/canvas-renderer.js
//  Bulk parser:              js/bulk-parser.js
// ============================================================

// ── helpers ──
async function _fetchViewerAsset(path) {
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error('Cannot load ' + path + ' (' + r.status + ')');
  const text = await r.text();
  if (text.includes('\x00')) throw new Error(path + ' — binary/corrupted response (null bytes). Try again.');
  return text;
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

    // embed object sprites as base64
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

    const _objsWithSrc = mapData.objects.map(o => {
      const d = tileMap.get(o.id);
      if (d?.sheetUrl && _sheets.has(d.sheetUrl)) {
        try {
          const sh = _sheets.get(d.sheetUrl);
          const cw = (o.cols || 1) * TS, ch = (o.rows || 1) * TS;
          const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
          cv.getContext("2d").drawImage(sh, d.sx, d.sy, d.sw, d.sh, 0, 0, cw, ch);
          return { ...o, src: cv.toDataURL("image/png") };
        } catch (e) {}
      }
      return o;
    });

    // single JSON.stringify — viewer does JSON.parse({{CFG_LITERAL}})
    const embeddedCfg = {
      title: currentProjectName || "RPG Map",
      description: mapDesc,
      menu: getMenuData(),
      cols: COLS, rows: ROWS,
      map: mapData.map, overlayMap: mapData.overlayMap,
      objects: _objsWithSrc,
      custom: mapData.custom, autoTiles: mapData.autoTiles, dualTiles: mapData.dualTiles
    };

    // build hotspot HTML
    const TS_ = TS;
    const embeddedHotspots = objects.map((o, oi) => {
      const ox = o.x * TS_, oy = o.y * TS_, ow = o.cols * TS_, oh = o.rows * TS_;
      const title   = ((o.title || o.lb) || "").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
      const tooltip = (o.tooltip || "").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
      const hasInteraction = !!(o.title || o.marker || (o.dialogue && o.dialogue.length && o.dialogue[0].text));
      const markerCls = o.marker === "!" ? "exc" : o.marker === "?" ? "q" : o.marker === "..." ? "chat" : "";
      const markerHtml = hasInteraction
        ? (markerCls ? `<div class="hs-marker ${markerCls}">${o.marker}</div>` : `<div class="hs-dot"></div>`)
        : "";
      const dlgAttr = (o.dialogue && o.dialogue.length) ? ` data-dialog-id="dlg_${oi}"` : "";
      return `<div class="hotspot${hasInteraction ? "" : " no-interact"}" data-ox="${ox}" data-oy="${oy}" data-ow="${ow}" data-oh="${oh}" data-title="${title}" data-tooltip="${tooltip}" data-oi="${oi}"${dlgAttr} style="left:${ox}px;top:${oy}px;width:${ow}px;height:${oh}px;">${markerHtml}</div>`;
    });

    const embeddedAreas = hotAreas.map(a => {
      const ox = a.x1 * TS_, oy = a.y1 * TS_;
      const ow = (a.x2 - a.x1) * TS_, oh = (a.y2 - a.y1) * TS_;
      let label = a.label, tooltip = a.tooltip;
      if (a.groupId) {
        const master = hotAreas.find(x => x.groupId === a.groupId && x.label) || a;
        label = master.label; tooltip = master.tooltip;
      }
      const title = (label || "").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
      const tip   = (tooltip || "").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
      const gAttr = a.groupId ? ` data-group="${a.groupId}"` : "";
      return `<div class="hotspot hs-area"${gAttr} data-ox="${ox}" data-oy="${oy}" data-ow="${ow}" data-oh="${oh}" data-title="${title}" data-tooltip="${tip}" style="left:${ox}px;top:${oy}px;width:${ow}px;height:${oh}px;"></div>`;
    });

    const allHotspots = [...embeddedHotspots, ...embeddedAreas].join("\n    ");

    // draw full map to canvas
    const _full = document.createElement("canvas");
    _full.width = offscreen.width; _full.height = offscreen.height;
    const _fctx = _full.getContext("2d"); _fctx.imageSmoothingEnabled = false;
    _fctx.fillStyle = "#111"; _fctx.fillRect(0, 0, _full.width, _full.height);
    _fctx.drawImage(offscreen, 0, 0);
    objects.forEach(obj => {
      const def = tileMap.get(obj.id);
      if (def && def.sheetUrl && _sheets.has(def.sheetUrl)) {
        const sh = _sheets.get(def.sheetUrl);
        _fctx.drawImage(sh, def.sx, def.sy, def.sw, def.sh, obj.x * TS, obj.y * TS, obj.cols * TS, obj.rows * TS);
      } else if (obj.img) {
        _fctx.drawImage(obj.img, obj.x * TS, obj.y * TS, obj.cols * TS, obj.rows * TS);
      }
    });

    const CROP = 1;
    const exp  = document.createElement("canvas");
    exp.width  = _full.width  - CROP * 2;
    exp.height = _full.height - CROP * 2;
    const ectx = exp.getContext("2d"); ectx.imageSmoothingEnabled = false;
    ectx.drawImage(_full, -CROP, -CROP);

    const fname         = (currentProjectName || "rpg-map").replace(/[^a-zA-Z0-9ა-ჿ_\-]/g, "_");
    const hasCoordTiles = [...customTiles, ...autoTiles, ...dualTiles].some(t => t.sheetUrl);
    let   b64           = "", useCanvasRenderer = false;
    if (!hasCoordTiles) { try { b64 = exp.toDataURL("image/png"); } catch (e) { b64 = ""; } }
    else { useCanvasRenderer = true; }

    const w = exp.width, h = exp.height;
    const cfgJSLiteral = JSON.stringify(embeddedCfg);
    const objsData = mapData.objects.map(o => ({
      title: o.title, lb: o.lb, dialogue: o.dialogue || [],
      requires: o.requires || null, on_complete: o.on_complete || null
    }));

    // build window.DIALOGS — every object with dialogue becomes a dialog entry
    const _dialogsMap = {};
    mapData.objects.forEach((o, oi) => {
      if (o.dialogue && o.dialogue.length) {
        _dialogsMap['dlg_' + oi] = {
          id: 'dlg_' + oi, trigger: String(oi),
          requires: o.requires || null, nodes: o.dialogue, on_complete: o.on_complete || null
        };
      }
    });
    const dialogsJS = 'window.DIALOGS = ' + JSON.stringify(_dialogsMap) + ';';

    // load viewer assets (all inlined)
    const [tmpl, runtimeJS, terminalJS, canvasRendererJS, bulkParserJS, unlockJS] = await Promise.all([
      _fetchViewerAsset('js/viewer/viewer.html'),
      _fetchViewerAsset('js/viewer/runtime.js'),
      _fetchViewerAsset('js/viewer/terminal.js'),
      _fetchViewerAsset('js/viewer/canvas-renderer.js'),
      _fetchViewerAsset('js/bulk-parser.js'),
      _fetchViewerAsset('js/viewer/unlock.js'),
    ]);

    // map image tag
    const mapImgTag = useCanvasRenderer
      ? `<canvas id="mapImg" width="${w}" height="${h}"></canvas>`
      : `<img id="mapImg" src="${b64}" width="${w}" height="${h}">`;

    // quest / legend HTML
    const questHtml = mapDesc
      ? `<button id="questBtn" onclick="toggleQuest()">?</button><div id="questPopup">${mapDesc.replace(/\n/g, "<br>")}</div>`
      : `<button id="questBtn" style="display:none">?</button>`;

    // canvas renderer is only injected when needed
    const canvasRendererBlock = useCanvasRenderer ? canvasRendererJS : "";

    // assemble final HTML by replacing placeholders
    const title = currentProjectName || "RPG Map";
    const html = tmpl
      .replace(/{{TITLE}}/g,          title)
      .replace(/{{W}}/g,               String(w))
      .replace(/{{H}}/g,               String(h))
      .replace(/{{COLS}}/g,            String(COLS))
      .replace(/{{ROWS}}/g,            String(ROWS))
      .replace(/{{MAP_IMG}}/g,         mapImgTag)
      .replace(/{{HOTSPOTS}}/g,        allHotspots)
      .replace(/{{QUEST_HTML}}/g,      questHtml)
      .replace(/{{CFG_LITERAL}}/g,     cfgJSLiteral)
      .replace(/{{OBJS_DATA}}/g,       JSON.stringify(objsData))
      .replace(/{{TS}}/g,              String(TS))
      .replace(/{{CANVAS_RENDERER}}/g, () => canvasRendererBlock)
      .replace(/{{RUNTIME_JS}}/g,      () => runtimeJS)
      .replace(/{{DIALOGS_JS}}/g,      () => dialogsJS)
      .replace(/{{UNLOCK_JS}}/g,       () => unlockJS)
      .replace(/{{BULK_PARSER_JS}}/g,  () => bulkParserJS)
      .replace(/{{TERMINAL_JS}}/g,     () => terminalJS);

    downloadFile(html, fname + ".html", "text/html");
    toast("🌐 " + fname + ".html — მზადაა!");
  } catch (e) { console.error("HTML export error:", e); toast("❌ export: " + e.message); }
}

// ── WINDOW BINDINGS ──
window.getMenuData  = getMenuData;
window.exportConfig = exportConfig;
window.doExportHTML = doExportHTML;
