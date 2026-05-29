// ============================================================
//  export-html.js  —  HTML Viewer Export & Config Export
//  Depends on: state.js, tile-engine.js, render.js, save-load.js, menu-builder.js
// ============================================================

function getMenuData() {
  function ser(n) {
    return {
      id: n.id, icon: n.icon || "📁", title: n.title,
      items: (n.items || [])
        .map(i => typeof i === "string" ? { type: "text", emoji: "•", label: i } : i)
        .filter(i => i.label || i.type === "progress"),
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
  downloadFile(JSON.stringify(config, null, 2), "config.json", "application/json");
  toast("📋 config.json გადმოიწერა");
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

    const embeddedCfg = JSON.stringify({
      title: currentProjectName || "RPG Map",
      description: mapDesc,
      menu: getMenuData(),
      cols: COLS, rows: ROWS,
      map: mapData.map, overlayMap: mapData.overlayMap,
      objects: _objsWithSrc,
      custom: mapData.custom, autoTiles: mapData.autoTiles, dualTiles: mapData.dualTiles
    });

    // build hotspot HTML
    const TS_ = TS;
    const embeddedHotspots = objects.map((o, oi) => {
      const ox = o.x * TS_, oy = o.y * TS_, ow = o.cols * TS_, oh = o.rows * TS_;
      const title   = ((o.title || o.lb) || "").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
      const tooltip = (o.tooltip || "").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
      const hasInteraction = !!(o.title || o.marker || (o.dialogue && o.dialogue.length && o.dialogue[0].text));
      const markerCls = o.marker === "!" ? "exc" : o.marker === "?" ? "q" : o.marker === "💬" ? "chat" : "";
      const markerHtml = hasInteraction
        ? (markerCls ? `<div class="hs-marker ${markerCls}">${o.marker}</div>` : `<div class="hs-dot"></div>`)
        : "";
      return `<div class="hotspot${hasInteraction ? "" : " no-interact"}" data-ox="${ox}" data-oy="${oy}" data-ow="${ow}" data-oh="${oh}" data-title="${title}" data-tooltip="${tooltip}" data-oi="${oi}" style="left:${ox}px;top:${oy}px;width:${ow}px;height:${oh}px;">${markerHtml}</div>`;
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

    // draw full map
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

    const fname          = (currentProjectName || "rpg-map").replace(/[^a-zA-Z0-9ა-ჿ_\-]/g, "_");
    const hasCoordTiles  = [...customTiles, ...autoTiles, ...dualTiles].some(t => t.sheetUrl);
    let   b64            = "", useCanvasRenderer = false;
    if (!hasCoordTiles) { try { b64 = exp.toDataURL("image/png"); } catch (e) { b64 = ""; } }
    else { useCanvasRenderer = true; }
    const w = exp.width, h = exp.height;
    const cfgJSLiteral = JSON.stringify(embeddedCfg);

    const html = _buildViewerHTML({
      title: currentProjectName || "RPG Map",
      w, h, b64, useCanvasRenderer, cfgJSLiteral,
      allHotspots, mapDesc, COLS, ROWS, TS,
      objsData: mapData.objects.map(o => ({title:o.title,lb:o.lb,dialogue:o.dialogue||[]}))
    });

    downloadFile(html, fname + ".html", "text/html");
    toast("🌐 " + fname + ".html — მზადაა!");
  } catch (e) { console.error("HTML export error:", e); toast("❌ export: " + e.message); }
}

// ── VIEWER HTML BUILDER ──
function _buildViewerHTML({ title, w, h, b64, useCanvasRenderer, cfgJSLiteral, allHotspots, mapDesc, COLS, ROWS, TS, objsData }) {
  return `<!DOCTYPE html>
<html lang="ka">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="#000000">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="logo.png">
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
body{background:#111;overflow:hidden;width:100vw;height:100dvh;}
#mapWrap{width:100vw;height:100dvh;overflow:scroll;cursor:grab;touch-action:pan-x pan-y;-webkit-overflow-scrolling:touch;position:relative;}
#mapWrap:active{cursor:grabbing;}
#sizer{position:absolute;top:0;left:0;pointer-events:none;}
#mapInner{position:absolute;top:0;left:0;transform-origin:0 0;}
#mapInner canvas,#mapInner img{display:block;image-rendering:pixelated;image-rendering:crisp-edges;}
#topbar{position:fixed;top:0;left:0;right:0;z-index:10;display:flex;align-items:center;gap:10px;padding:7px 12px;background:rgba(13,17,23,0.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid rgba(48,54,61,0.35);pointer-events:none;}
#topbar>*{pointer-events:auto;}
#mapTitle{font:13px sans-serif;color:rgba(230,237,243,0.65);}
#termBtn{display:none;background:transparent;border:none;color:rgba(230,237,243,0.65);font:13px sans-serif;cursor:pointer;padding:0;letter-spacing:.01em;transition:color .15s;}
#termBtn:hover{color:#00ff88;}
#termBtn .tm-tilde{color:#00ff88;margin-right:2px;opacity:.8;}
#mdlTerm{position:fixed;top:0;left:0;right:0;height:46vh;z-index:998;display:flex;flex-direction:column;background:rgba(0,0,0,.25);backdrop-filter:blur(2px) saturate(.75);-webkit-backdrop-filter:blur(2px) saturate(.75);border-bottom:1px solid rgba(0,255,136,.15);box-shadow:0 6px 32px rgba(0,0,0,.55);transform:translateY(-100%);transition:transform 220ms cubic-bezier(.22,1,.36,1);overflow:hidden;}
#mdlTerm.open{transform:translateY(0);}
#mdlTerm.tmfull{height:100vh;border-bottom:none;}
.tm-wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0;}
.tm-wm img{width:52%;max-width:260px;opacity:.05;filter:grayscale(1);user-select:none;}
.tm-wm-txt{font-family:'Courier New',monospace;font-size:clamp(44px,9vw,88px);font-weight:700;letter-spacing:.28em;color:#00ff88;opacity:.055;}
.tm-hdr{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;padding:6px 13px;border-bottom:1px solid rgba(0,255,136,.09);flex-shrink:0;background:rgba(0,0,0,.18);}
.tm-path{color:#00ff88;font-family:'Courier New',monospace;font-size:11px;letter-spacing:.07em;opacity:.75;}
.tm-path em{opacity:.38;font-style:normal;}
.tm-ctrl{display:flex;gap:5px;}
.tm-ctrl button{background:transparent;border:1px solid rgba(0,255,136,.16);color:rgba(0,255,136,.5);font-family:'Courier New',monospace;font-size:11px;padding:2px 8px;cursor:pointer;border-radius:2px;transition:all .12s;line-height:1.4;}
.tm-ctrl button:hover{background:rgba(0,255,136,.08);border-color:rgba(0,255,136,.38);color:#00ff88;}
.tm-ctrl button.on{background:rgba(0,255,136,.1);border-color:rgba(0,255,136,.35);color:#00ff88;}
#tmOut{position:relative;z-index:1;flex:1;overflow-y:auto;padding:8px 15px 4px;display:flex;flex-direction:column;gap:1px;scrollbar-width:thin;scrollbar-color:rgba(0,255,136,.15) transparent;}
#tmOut::-webkit-scrollbar{width:3px;}
#tmOut::-webkit-scrollbar-thumb{background:rgba(0,255,136,.15);border-radius:2px;}
.tl{font-family:'Courier New',Consolas,monospace;font-size:13px;line-height:1.55;animation:tlfi 75ms ease;}
@keyframes tlfi{from{opacity:0;transform:translateX(-3px)}to{opacity:1}}
.tl.ti{color:#00ff88;}.tl.ti::before{content:'> ';opacity:.42;}
.tl.tok{color:#00ff88;opacity:.7;}.tl.tok::before{content:'\\2713 ';}
.tl.tnf{color:#ffcc00;opacity:.8;}.tl.tnf::before{content:'\\00b7 ';}
.tl.ter{color:#ff5555;}.tl.ter::before{content:'\\2717 ';}
.tl.tdm{color:#555;font-size:12px;}
.tl.tsy{color:#3a7a4a;font-size:11px;letter-spacing:.05em;opacity:.7;}.tl.tsy::before{content:'# ';}
.tm-ir{position:relative;z-index:1;display:flex;align-items:center;padding:7px 13px;border-top:1px solid rgba(0,255,136,.09);background:rgba(0,0,0,.2);flex-shrink:0;}
.tm-pr{color:#00ff88;font-family:'Courier New',monospace;font-size:13px;margin-right:7px;opacity:.45;white-space:nowrap;}
#tmIn{flex:1;background:transparent;border:none;outline:none;color:#00ff88;font-family:'Courier New',Consolas,monospace;font-size:13px;caret-color:#00ff88;}
#tmIn::placeholder{color:rgba(0,255,136,.2);}
#tmHint{color:rgba(0,255,136,.2);font-family:'Courier New',monospace;font-size:13px;pointer-events:none;user-select:none;}
#menuBtn{position:fixed;top:8px;right:12px;z-index:30;width:36px;height:36px;border-radius:8px;background:rgba(22,27,34,0.8);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(48,54,61,0.6);color:rgba(180,190,200,0.85);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
#menuBtn:hover{border-color:#58a6ff;color:#58a6ff;}
#gameMenu{display:none;position:fixed;inset:0;z-index:40;background:rgba(13,17,23,0.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);flex-direction:column;align-items:center;justify-content:flex-start;padding:50px 16px 20px;overflow-y:auto;}
#gameMenu.open{display:flex;}
.gmClose{position:fixed;top:10px;right:12px;z-index:41;background:none;border:none;color:rgba(139,148,158,0.8);font-size:22px;cursor:pointer;}
#gmContent{width:100%;max-width:420px;display:flex;flex-direction:column;gap:8px;}
.gm-section{background:rgba(22,27,34,0.7);border:1px solid rgba(48,54,61,0.5);border-radius:10px;overflow:hidden;}
.gm-section-hdr{display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;font:14px/1 sans-serif;color:rgba(230,237,243,0.9);user-select:none;}
.gm-section-hdr:hover{background:rgba(255,255,255,0.04);}
.gm-section-hdr .arrow{margin-left:auto;font-size:10px;color:#8b949e;transition:transform .2s;}
.gm-section-hdr.open .arrow{transform:rotate(180deg);}
.gm-section-body{display:none;padding:8px 14px 12px;border-top:1px solid rgba(48,54,61,0.4);}
.gm-section-body.open{display:block;}

.gm-item{font:13px/1.8 sans-serif;color:rgba(180,190,200,0.85);padding:1px 0;}
.gm-section-body.compact .gm-item{font:12px/1.3 sans-serif;padding:0;color:rgba(180,190,200,0.85);}
.gm-section-body.compact{padding:2px 8px 6px;display:flex;flex-direction:column;gap:0;}
.gm-progress-row{display:flex;align-items:center;gap:8px;padding:4px 0;}
.gm-progress-label{font:13px sans-serif;color:rgba(180,190,200,0.85);min-width:100px;}
.gm-bar{flex:1;height:8px;background:rgba(48,54,61,0.6);border-radius:4px;overflow:hidden;}
.gm-bar-fill{height:100%;border-radius:4px;background:#4ade80;transition:width .3s;}
.gm-bar-pct{font:11px monospace;color:#8b949e;min-width:30px;text-align:right;}
.gm-sub{margin-top:6px;padding-left:10px;border-left:2px solid rgba(48,54,61,0.5);}
.gm-sub-title{font:12px sans-serif;color:#8b949e;margin-bottom:2px;}
.info{position:fixed;bottom:7px;right:10px;font:10px monospace;color:rgba(72,79,88,0.6);pointer-events:none;}
.hotspot{position:absolute;cursor:pointer;z-index:5;overflow:visible;background:none!important;border:none!important;}
.hs-dot{position:absolute;top:-18px;left:50%;transform:translateX(-50%);width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.6);box-shadow:0 0 4px rgba(255,255,255,0.8);pointer-events:none;}
.hs-marker{position:absolute;top:-8px;left:50%;transform:translate(-50%,-50%);font-size:18px;font-weight:bold;font-family:sans-serif;line-height:1;pointer-events:auto;-webkit-text-stroke:2px rgba(0,0,0,0.9);paint-order:stroke fill;}
.hs-marker.exc{color:#f0a500;}.hs-marker.q{color:#e8e8e8;}.hs-marker.chat{color:#4ade80;}
#hsPopup{display:none;position:fixed;z-index:50;left:50%!important;top:20%!important;transform:translateX(-50%)!important;background:rgba(22,27,34,0.4);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(88,166,255,0.35);border-radius:10px;padding:12px 34px 12px 14px;width:min(88vw,360px);font:13px/1.7 sans-serif;color:rgba(200,210,220,0.92);flex-direction:column;}
#hsPopup.show{display:flex;}
#hsPopup.show{display:flex;}
#hsPopupTitle{font-size:14px;font-weight:600;color:#ffffff;margin-bottom:5px;padding-right:20px;flex-shrink:0;}
#hsPopupScroll{height:88px;overflow-y:auto;-webkit-mask-image:linear-gradient(to bottom,transparent 0%,black 15%,black 75%,transparent 100%);mask-image:linear-gradient(to bottom,transparent 0%,black 15%,black 75%,transparent 100%);scrollbar-width:none;}
#hsPopupScroll::-webkit-scrollbar{display:none;}
#hsPopupBtns{display:flex;flex-direction:column;gap:6px;flex-shrink:0;max-height:0;overflow:hidden;opacity:0;transition:max-height 0.5s cubic-bezier(0.4,0,0.2,1),margin-top 0.5s ease,opacity 0.4s ease 0.2s;}
#hsPopupBtns.visible{max-height:400px;margin-top:10px;opacity:1;}
#hsClose{position:absolute;top:10px;right:12px;background:none;border:none;color:#8b949e;font-size:18px;cursor:pointer;line-height:1;}
.hs-area{border:none;background:transparent;cursor:pointer;border-radius:4px;}
.hotspot.no-interact{cursor:default;pointer-events:none;}
.hs-area:hover{background:rgba(255,220,80,0.07);}
#areaPopup{display:none;position:fixed;z-index:60;background:rgba(22,27,34,0.97);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid #f0a500;border-radius:10px;padding:11px 14px 12px;flex-direction:column;gap:8px;min-width:200px;max-width:min(88vw,320px);}
#areaPopup.show{display:flex;}
#areaPopup .ap-close{position:absolute;top:7px;right:10px;background:none;border:none;color:#8b949e;font-size:15px;cursor:pointer;}
#areaPopup .ap-title{font-size:14px;font-weight:600;color:#f0a500;padding-right:18px;}
#areaPopup .ap-tip{font-size:12px;color:#8b949e;line-height:1.5;}
#hsPopup a{color:#58a6ff;text-decoration:none;}#hsPopup a:hover{text-decoration:underline;}
#questBtn{position:fixed;bottom:14px;left:14px;z-index:30;width:38px;height:38px;border-radius:50%;background:rgba(22,27,34,0.3);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(48,54,61,0.6);color:rgba(180,190,200,0.8);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
#questPopup{display:none;position:fixed;bottom:62px;left:14px;z-index:30;background:rgba(22,27,34,0.3);backdrop-filter:blur(2px);border:1px solid rgba(48,54,61,0.5);border-radius:10px;padding:12px 14px;max-width:min(88vw,420px);font:13px/1.6 sans-serif;color:rgba(200,210,220,0.9);white-space:pre-wrap;}
#notifBar{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:30;display:flex;gap:8px;align-items:center;pointer-events:auto;}
.ncard{width:44px;height:44px;border-radius:10px;border:2px solid var(--nc);background:rgba(13,17,23,0.2);backdrop-filter:blur(1px);display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;position:relative;box-shadow:0 2px 12px rgba(0,0,0,0.4);opacity:0.82;}
.ncard:active{opacity:1;}
.ncard.pulse{animation:npulse 1.2s infinite;}
@keyframes npulse{0%,100%{box-shadow:0 0 0 0 var(--nc);}50%{box-shadow:0 0 0 6px transparent;}}
.ncard[data-type="info"]{--nc:#58a6ff;}
.ncard[data-type="warning"]{--nc:#f0a500;}
.ncard[data-type="danger"]{--nc:#fb8f44;}
.ncard[data-type="emergency"]{--nc:#f85149;}
.ncard[data-type="done"]{--nc:#4ade80;}
.ncard[data-type="project"]{--nc:#c084fc;}
#notifPopup{display:none;position:fixed;z-index:70;background:rgba(13,17,23,0.1);backdrop-filter:blur(1px);border:2px solid var(--nc,#58a6ff);border-radius:12px;padding:14px 40px 14px 14px;max-width:min(88vw,360px);font:13px/1.6 sans-serif;color:#e6edf3;box-shadow:0 4px 24px rgba(0,0,0,0.5);}
#notifPopup.show{display:block;}
#notifPopup .np-type{font-size:11px;color:var(--nc,#58a6ff);font-weight:600;margin-bottom:4px;text-transform:uppercase;}
#notifPopup .np-sender{font-size:11px;color:#8b949e;margin-bottom:8px;}
#notifPopup .np-text{font-size:14px;font-weight:600;color:#fff;margin-bottom:6px;}
#notifPopup .np-detail{font-size:12px;color:rgba(180,200,220,0.85);}
#notifPopup .np-area{margin-top:10px;padding:6px 10px;background:rgba(240,165,0,0.1);border:1px solid rgba(240,165,0,0.3);border-radius:6px;font-size:12px;color:#f0a500;cursor:pointer;text-align:center;}
#notifClose{position:absolute;top:10px;right:12px;background:none;border:none;color:#8b949e;font-size:18px;cursor:pointer;line-height:1;}
#spotLinkPopup{display:none;position:fixed;z-index:60;background:rgba(22,27,34,0.97);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid #58a6ff;border-radius:10px;padding:11px 13px;width:200px;flex-direction:column;gap:7px;box-shadow:0 4px 24px rgba(0,0,0,0.5);}
#spotLinkPopup.show{display:flex;}
#spotLinkPopup .slClose{position:absolute;top:7px;right:9px;background:none;border:none;color:#8b949e;font-size:15px;cursor:pointer;line-height:1;}
#spotLinkPopup .slCoords{font-size:12px;color:rgba(200,210,220,0.9);padding-right:18px;}
.slzBtn{flex:1;height:27px;background:rgba(13,17,23,0.8);border:1px solid rgba(48,54,61,0.7);color:#8b949e;font-size:12px;border-radius:5px;cursor:pointer;font-family:monospace;}
.slzBtn.on{border-color:#58a6ff;color:#58a6ff;background:rgba(88,166,255,0.08);}
#spotLinkPopup .slCopy{height:32px;background:rgba(13,17,23,0.8);border:2px solid #4ade80;color:#4ade80;font-size:12px;border-radius:5px;cursor:pointer;}
</style>
</head>
<body>
<div id="topbar"><button id="termBtn" onclick="toggleTerm()"><span class="tm-tilde">~</span>${title}</button><span id="mapTitle">${title}</span></div>
<div id="mdlTerm">
  <div class="tm-wm"><img src="logo.png" alt="" onerror="this.style.display=\'none\'"><span class="tm-wm-txt">MDELO</span></div>
  <div class="tm-hdr"><span class="tm-path"><em>~/</em>mdelo</span><div class="tm-ctrl"><button id="tmFullBtn" onclick="tmToggleFull()">\u26F6</button><button onclick="tmClear()">\u232B</button><button onclick="closeTerm()">\u2715</button></div></div>
  <div id="tmOut"></div>
  <div class="tm-ir"><span class="tm-pr">~/mdelo $</span><input id="tmIn" autocomplete="off" spellcheck="false" placeholder="\u10D1\u10E0\u10eb\u10d0\u10dc\u10d4\u10d1\u10d0..."><span id="tmHint"></span></div>
</div>
<div id="mapWrap">
  <div id="sizer" style="width:${w}px;height:${h}px;"></div>
  <div id="mapInner">
    ${useCanvasRenderer
      ? `<canvas id="mapImg" width="${w}" height="${h}"></canvas>`
      : `<img id="mapImg" src="${b64}" width="${w}" height="${h}">`}
    ${allHotspots}
  </div>
</div>
${mapDesc ? `<button id="questBtn" onclick="toggleQuest()">?</button><div id="questPopup">${mapDesc.replace(/\n/g, "<br>")}</div>` : `<button id="questBtn" style="display:none">?</button>`}
<div id="notifBar"></div>
<div id="notifPopup"><button id="notifClose" onclick="closeNotifPopup()">✕</button><div class="np-type" id="npType"></div><div class="np-sender" id="npSender"></div><div class="np-text" id="npText"></div><div class="np-detail" id="npDetail"></div><div class="np-area" id="npArea" style="display:none" onclick="goToArea()">🗺 რუკაზე ნახვა →</div></div>
<button id="menuBtn" onclick="toggleMenu()">☰</button>
<div id="gameMenu"><button class="gmClose" onclick="toggleMenu()">✕</button><div id="gmContent"></div></div>
<div id="hsPopup"><button id="hsClose" onclick="closeHsPopup()">✕</button><div id="hsPopupTitle"></div><div id="hsPopupScroll"><div id="hsPopupBody"></div></div><div id="hsPopupBtns"></div></div>
<div id="areaPopup"><button class="ap-close" onclick="closeAreaPopup()">✕</button><div class="ap-title" id="areaPopupTitle"></div><div class="ap-tip" id="areaPopupTip"></div></div>
<div id="spotLinkPopup">
  <button class="slClose" onclick="closeSlPopup()">✕</button>
  <div class="slCoords" id="slCoords">Col: – &nbsp;Row: –</div>
  <div style="display:flex;gap:4px;">
    <button class="slzBtn" data-z="0.5" onclick="setSlZoom(this)">½×</button>
    <button class="slzBtn" data-z="1" onclick="setSlZoom(this)">1×</button>
    <button class="slzBtn" data-z="2" onclick="setSlZoom(this)">2×</button>
    <button class="slzBtn" data-z="3" onclick="setSlZoom(this)">3×</button>
  </div>
  <button class="slCopy" onclick="copySlLink()">📋 ლინკის კოპირება</button>
</div>
<div class="info">${w}\u00d7${h} \u00b7 ${COLS}\u00d7${ROWS}</div>
<script>
const _CFG=JSON.parse(${cfgJSLiteral});
const _OBJS=${JSON.stringify(objsData)};
${useCanvasRenderer ? _canvasRendererScript(TS) : ""}
// ── zoom ──
const wrap=document.getElementById('mapWrap'),inner=document.getElementById('mapInner'),sizer=document.getElementById('sizer');
let scale=1;
function applyScale(s,ox,oy){const prev=scale;scale=Math.max(0.2,Math.min(8,s));const ratio=scale/prev;wrap.scrollLeft=(wrap.scrollLeft+ox)*ratio-ox;wrap.scrollTop=(wrap.scrollTop+oy)*ratio-oy;inner.style.transform='scale('+scale+')';sizer.style.width=(${w}*scale)+'px';sizer.style.height=(${h}*scale)+'px';}
wrap.addEventListener('wheel',e=>{e.preventDefault();const r=wrap.getBoundingClientRect();applyScale(scale*(e.deltaY<0?1.12:0.89),e.clientX-r.left,e.clientY-r.top);},{passive:false});
let p0=null,pDist=0,pScale=1;
wrap.addEventListener('touchstart',e=>{if(e.touches.length===2){wrap.style.touchAction='none';p0=e.touches[0];const p1=e.touches[1];pDist=Math.hypot(p1.clientX-p0.clientX,p1.clientY-p0.clientY);pScale=scale;e.preventDefault();}},{passive:false});
wrap.addEventListener('touchmove',e=>{if(e.touches.length===2){const a=e.touches[0],b=e.touches[1];const d=Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);const r=wrap.getBoundingClientRect();applyScale(pScale*(d/pDist),(a.clientX+b.clientX)/2-r.left,(a.clientY+b.clientY)/2-r.top);e.preventDefault();}},{passive:false});
wrap.addEventListener('touchend',e=>{if(e.touches.length<2)wrap.style.touchAction='pan-x pan-y';},{passive:true});
// ── hotspots ──
function parseLinks(t){let o='',i=0;while(i<t.length){const s=t.indexOf('[[',i);if(s<0){o+=t.slice(i);break;}o+=t.slice(i,s);const e=t.indexOf(']]',s+2);if(e<0){o+=t.slice(s);break;}const inner2=t.slice(s+2,e);const p=inner2.indexOf('|');if(p<0){o+=inner2;}else{const lbl=inner2.slice(0,p),url=inner2.slice(p+1).trim(),safe=url.startsWith('http')||url.startsWith('//')||url.startsWith('/')?url:'#';o+='<a href="'+safe+'" target="_blank" style="color:#58a6ff;">'+lbl+'</a>';}i=e+2;}return o.replace(/\\n/g,'<br>');}
wrap.addEventListener('click',e=>{if(e.target.closest('#menuBtn')||e.target.closest('#gameMenu'))return;const hs=e.target.closest('.hotspot');if(hs&&!hs.classList.contains('no-interact')){closeHsPopup();closeAreaPopup();if(hs.classList.contains('hs-area')){const t=hs.dataset.title||'',grp=hs.dataset.group||'';blinkAreasByGroupOrTitle(grp,t);if(t)openAreaPopup(t,hs.dataset.tooltip||'');}else{const oi=hs.dataset.oi;const objData=(oi!=null&&_OBJS[+oi])?_OBJS[+oi]:null;openHsPopup(hs,hs.dataset.title||'',hs.dataset.tooltip||'',objData);}return;}if(!e.target.closest('#hsPopup')&&!e.target.closest('#areaPopup')){closeHsPopup();closeAreaPopup();}});
let _objBlinkRaf=null,_objBlinkMarker=null;
function _startObjBlink(el){
  _stopObjBlink();
  _objBlinkMarker=el.querySelector('.hs-marker,.hs-dot');
  if(!_objBlinkMarker)return;
  let t=0;
  function frame(){
    t+=0.06;
    const s=(1.2+0.3*Math.sin(t*3)).toFixed(2);
    const a=(0.7+0.3*Math.sin(t*3)).toFixed(2);
    _objBlinkMarker.style.transform='translate(-50%,-50%) scale('+s+')';
    _objBlinkMarker.style.opacity=a;
    _objBlinkRaf=requestAnimationFrame(frame);
  }
  frame();
}
function _stopObjBlink(){
  if(_objBlinkRaf){cancelAnimationFrame(_objBlinkRaf);_objBlinkRaf=null;}
  if(_objBlinkMarker){
    _objBlinkMarker.style.transform='translate(-50%,-50%) scale(1)';
    _objBlinkMarker.style.opacity='1';
    _objBlinkMarker=null;
  }
}
function closeHsPopup(){const p=document.getElementById('hsPopup');p.classList.remove('show');p.style.display='none';wrap.style.overflow='auto';_stopObjBlink();}
function openAreaPopup(title,tip){closeHsPopup();document.getElementById('areaPopupTitle').textContent=title||'';const tipEl=document.getElementById('areaPopupTip');tipEl.textContent=tip||'';tipEl.style.display=tip?'':'none';const pop=document.getElementById('areaPopup');const pw=Math.min(window.innerWidth*0.88,320);pop.style.cssText='left:'+((window.innerWidth-pw)/2)+'px;top:'+Math.max(60,(window.innerHeight-180)/2)+'px;max-width:'+pw+'px;';pop.classList.add('show');wrap.style.overflow='hidden';}
function closeAreaPopup(){document.getElementById('areaPopup').classList.remove('show');wrap.style.overflow='auto';}
function _doBlink(els){if(!els.length)return;const TS=${TS};const cells=new Set();els.forEach(el=>{const ox=+el.dataset.ox,oy=+el.dataset.oy,ow=+el.dataset.ow,oh=+el.dataset.oh;for(let r=0;r<Math.round(oh/TS);r++)for(let cc=0;cc<Math.round(ow/TS);cc++)cells.add((Math.round(oy/TS)+r)+','+(Math.round(ox/TS)+cc));});const edges=[];cells.forEach(key=>{const[r,cc]=key.split(',').map(Number);const px=cc*TS,py=r*TS;if(!cells.has(r+','+(cc-1)))edges.push([px,py,px,py+TS]);if(!cells.has(r+','+(cc+1)))edges.push([px+TS,py,px+TS,py+TS]);if(!cells.has((r-1)+','+cc))edges.push([px,py,px+TS,py]);if(!cells.has((r+1)+','+cc))edges.push([px,py+TS,px+TS,py+TS]);});if(!edges.length)return;const ov=document.createElement('canvas');ov.width=${w};ov.height=${h};ov.style.cssText='position:absolute;top:0;left:0;pointer-events:none;z-index:15;';inner.appendChild(ov);const ctx=ov.getContext('2d');ctx.lineWidth=2;ctx.lineCap='square';function draw(alpha){ctx.clearRect(0,0,ov.width,ov.height);if(alpha<=0)return;ctx.strokeStyle='rgba(255,220,80,'+alpha.toFixed(2)+')';ctx.beginPath();edges.forEach(([x1,y1,x2,y2])=>{ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);});ctx.stroke();}const PULSE_MS=550;let start=null,phase=0;function frame(ts){if(!start)start=ts;const t=Math.min((ts-start)/PULSE_MS,1);draw(phase%2===0?t:1-t);if(t<1){requestAnimationFrame(frame);}else{phase++;if(phase<6){start=null;requestAnimationFrame(frame);}else{let fo=1;(function fade(){fo-=0.08;if(fo>0){draw(fo*0.9);requestAnimationFrame(fade);}else{draw(0);ov.remove();}})();}}}requestAnimationFrame(frame);}
function blinkAreasByGroupOrTitle(grp,title){let els=grp?[...document.querySelectorAll('.hs-area[data-group="'+grp+'"]')]:[];if(!els.length&&title)els=[...document.querySelectorAll('.hs-area[data-title="'+title+'"]')];_doBlink(els);}
function fitAreas(title){const els=[...document.querySelectorAll('.hs-area[data-title="'+title+'"]')];if(!els.length)return;let minX=Infinity,minY=Infinity,maxX=0,maxY=0;els.forEach(el=>{const ox=+el.dataset.ox,oy=+el.dataset.oy,ow=+el.dataset.ow,oh=+el.dataset.oh;minX=Math.min(minX,ox);minY=Math.min(minY,oy);maxX=Math.max(maxX,ox+ow);maxY=Math.max(maxY,oy+oh);});const PAD=80,sw=wrap.clientWidth-PAD*2,sh=wrap.clientHeight-PAD*2;const z=Math.min(sw/(maxX-minX||1),sh/(maxY-minY||1),4);applyScale(Math.max(0.2,z),wrap.clientWidth/2,wrap.clientHeight/2);const cx=(minX+(maxX-minX)/2)*scale,cy=(minY+(maxY-minY)/2)*scale;let n=0;(function go(){wrap.scrollLeft=cx-wrap.clientWidth/2;wrap.scrollTop=cy-wrap.clientHeight/2;if(++n<6)setTimeout(go,120);})();}
// ── menu ──
function toggleMenu(){const gm=document.getElementById('gameMenu');const open=gm.classList.toggle('open');wrap.style.overflow=open?'hidden':'auto';if(open&&!window._cfgLoaded){window._cfgLoaded=true;buildMenu(_CFG);}}
function toggleSection(el){el.classList.toggle('open');el.nextElementSibling.classList.toggle('open');}
function parseLinks2(t){return parseLinks(t);}
function buildItems(parent,items){(items||[]).forEach(item=>{const itObj=typeof item==='string'?{type:'text',emoji:'\u2022',label:item}:item;if(itObj.type==='progress'){const v=Math.max(0,Math.min(100,itObj.value||0));const color=v>60?'#4ade80':v>30?'#facc15':'#f87171';const row=document.createElement('div');row.className='gm-progress-row';const pfx=itObj.emoji?itObj.emoji+' ':'';row.innerHTML='<span class="gm-progress-label">'+pfx+itObj.label+'</span><div class="gm-bar"><div class="gm-bar-fill" style="width:'+v+'%;background:'+color+';"></div></div><span class="gm-bar-pct">'+v+'%</span>';parent.appendChild(row);}else{const d=document.createElement('div');d.className='gm-item';d.innerHTML=(itObj.emoji||'\u2022')+' '+parseLinks(itObj.label||'');parent.appendChild(d);}});}
function buildSubs(parent,children,depth){(children||[]).forEach(sub=>{const hasChildren=(sub.children&&sub.children.length>0);if(!hasChildren){// compact: no card, just a simple row
const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:6px;padding:3px 4px;';const ic=document.createElement('span');ic.textContent=sub.icon||'📁';ic.style.cssText='font-size:13px;';const ti=document.createElement('span');ti.textContent=sub.title||'';ti.style.cssText='font:12px/1.4 sans-serif;color:rgba(180,200,220,0.85);';row.appendChild(ic);row.appendChild(ti);parent.appendChild(row);if(sub.items&&sub.items.length){const il=document.createElement('div');il.style.cssText='padding:0 4px 4px 22px;';buildItems(il,sub.items);parent.appendChild(il);}return;}const sw=document.createElement('div');sw.className='gm-section';sw.style.marginTop='6px';sw.style.marginLeft=(depth*8)+'px';const sh2=document.createElement('div');sh2.className='gm-section-hdr';sh2.style.fontSize=(depth===0?'13px':'12px');sh2.innerHTML=\`<span>\${sub.icon||'📁'}</span><span>\${sub.title}</span><span class="arrow">▼</span>\`;sh2.onclick=()=>toggleSection(sh2);const sb=document.createElement('div');sb.className='gm-section-body';buildItems(sb,sub.items);buildSubs(sb,sub.children,depth+1);sw.appendChild(sh2);sw.appendChild(sb);parent.appendChild(sw);});}
function buildMenu(cfg){const ct=document.getElementById('gmContent');ct.innerHTML='';if(cfg.title){const t=document.createElement('div');t.style.cssText='font:16px/1 sans-serif;color:rgba(230,237,243,0.9);text-align:center;padding:0 0 12px;font-weight:600;';t.textContent=cfg.title;ct.appendChild(t);}(cfg.menu||[]).forEach(sec=>{const wrap2=document.createElement('div');wrap2.className='gm-section';const hasChildren=(sec.children&&sec.children.length>0);const hdr=document.createElement('div');hdr.className='gm-section-hdr';hdr.innerHTML=\`<span>\${sec.icon||'📁'}</span><span>\${sec.title}</span>\${hasChildren?'<span class="arrow">▼</span>':''}\`;if(hasChildren)hdr.onclick=()=>toggleSection(hdr);else{hdr.style.cursor='default';hdr.style.padding='5px 12px';}const body=document.createElement('div');body.className='gm-section-body';if(!hasChildren){body.classList.add('open');body.classList.add('compact');}buildItems(body,sec.items);buildSubs(body,sec.children,0);wrap2.appendChild(hdr);wrap2.appendChild(body);ct.appendChild(wrap2);});}
// ── dialogue engine ──
const SUPA_URL_D='https://miqenmsgwkkmtxwwbxzo.supabase.co';
const SUPA_KEY_D='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pcWVubXNnd2trbXR4d3dieHpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMDc0NzYsImV4cCI6MjA5NDg4MzQ3Nn0.VfJgVoPC-ZbjlcuwMriYrNXb-3E2OgC92nOR9hOPgKI';
let _dlgNodes={},_dlgObj=null,_dlgTwTimer=null;

function _parseNodes(dialogue){
  // dialogue is array of node objects from editor
  const nodes={};
  (dialogue||[]).forEach(n=>{ nodes[n.id]=n; });
  const first=dialogue&&dialogue.length?dialogue[0].id:null;
  return{nodes,first};
}

function _dlgShowNode(nodeId){
  const node=_dlgNodes[nodeId];
  if(!node)return;
  const body=document.getElementById('hsPopupBody');
  const btnWrap=document.getElementById('hsPopupBtns');
  if(btnWrap){btnWrap.innerHTML='';btnWrap.classList.remove('visible');}
  body.innerHTML='';

  _typewriterHTML(body,parseLinks(node.text||''),35,()=>{
    if(!btnWrap)return;
    (node.buttons||[]).forEach(btn=>{
      if(!btn.label)return;
      const b=document.createElement('button');
      b.textContent=btn.label;
      b.style.cssText='width:100%;height:40px;background:rgba(22,27,34,0.2);border:1px solid rgba(88,166,255,0.4);color:#e6edf3;font-size:13px;border-radius:8px;cursor:pointer;text-align:center;';
      b.onclick=()=>{
        if(btn.notify){
          const sender=localStorage.getItem('mdelo_sender')||'ანონიმი';
          const txt=btn.notifyText||(sender+' — '+btn.label);
          fetch(SUPA_URL_D+'/rest/v1/notifications',{
            method:'POST',
            headers:{'Content-Type':'application/json','apikey':SUPA_KEY_D,'Authorization':'Bearer '+SUPA_KEY_D,'Prefer':'return=minimal'},
            body:JSON.stringify({type:'info',symbol:'💬',text:txt,sender:sender,linked_area:''})
          }).catch(()=>{});
        }
        if(btn.link)window.open(btn.link,'_blank');
        if(btn.nextNode&&_dlgNodes[btn.nextNode]){
          _dlgShowNode(btn.nextNode);
        } else {
          closeHsPopup();
        }
      };
      btnWrap.appendChild(b);
    });
    setTimeout(()=>{ btnWrap.classList.add('visible'); }, 50);
  },()=>{
    const scroll=document.getElementById('hsPopupScroll');
    if(scroll){
      const target=scroll.scrollHeight-scroll.clientHeight;
      const start=scroll.scrollTop;
      const diff=target-start;
      if(diff<=0)return;
      let t=0;const dur=150;
      const step=()=>{t+=16;const p=Math.min(t/dur,1);scroll.scrollTop=start+diff*(p<0.5?2*p*p:(1-(2-2*p)*(2-2*p)/2));if(t<dur)requestAnimationFrame(step);};
      requestAnimationFrame(step);
    }
  });
}

function openHsPopup(el,title,raw,obj){
  _dlgObj=obj||null;
  const popup=document.getElementById('hsPopup');
  document.getElementById('hsPopupTitle').textContent=title||'';
  document.getElementById('hsPopupBody').innerHTML='';
  const bw=document.getElementById('hsPopupBtns');
  if(bw)bw.innerHTML='';
  const pw=Math.min(window.innerWidth*0.88,360),left=(window.innerWidth-pw)/2,top=Math.max(60,(window.innerHeight-200)/2);
  popup.style.cssText='display:block;left:'+left+'px;top:'+top+'px;max-width:'+pw+'px;';
  popup.classList.add('show');
  wrap.style.overflow='hidden';
  if(el)_startObjBlink(el);

  if(obj&&obj.dialogue&&obj.dialogue.length>0){
    const parsed=_parseNodes(obj.dialogue);
    _dlgNodes=parsed.nodes;
    if(parsed.first)_dlgShowNode(parsed.first);
  } else {
    _typewriterHTML(document.getElementById('hsPopupBody'),parseLinks(raw||''),35);
  }
}
let _twTimer=null;
function _typewriter(el,text,speed,onDone){
  if(_twTimer){clearInterval(_twTimer);_twTimer=null;}
  el.textContent='';
  if(!text){if(onDone)onDone();return;}
  let i=0;
  _twTimer=setInterval(()=>{
    el.textContent+=text[i++];
    if(i>=text.length){clearInterval(_twTimer);_twTimer=null;if(onDone)onDone();}
  },speed);
}
function _twSpeed(type){
  if(type==='emergency'||type==='danger')return 25;
  if(type==='warning')return 45;
  return 35;
}
function _typewriterHTML(el,html,speed,onDone,onTick){
  if(_twTimer){clearInterval(_twTimer);_twTimer=null;}
  el.innerHTML='';
  const tmp=document.createElement('div');tmp.innerHTML=html;
  const nodes=Array.from(tmp.childNodes);
  let ni=0,ci=0,cur=null;
  let _done=false;
  function next(){
    if(ni>=nodes.length){if(!_done){_done=true;if(onDone)onDone();}return;}
    const node=nodes[ni];
    if(node.nodeType===3){
      if(!cur){cur=document.createTextNode('');el.appendChild(cur);}
      const full=node.textContent;
      if(ci<full.length){cur.textContent+=full[ci++];if(onTick)onTick();}
      else{ni++;ci=0;cur=null;}
    } else {
      el.appendChild(node.cloneNode(true));ni++;ci=0;cur=null;if(onTick)onTick();
    }
  }
  _twTimer=setInterval(()=>{next();if(ni>=nodes.length&&!_done){clearInterval(_twTimer);_twTimer=null;_done=true;if(onDone)onDone();}},speed);
}
function openNotifPopup(n){_curNotif=n;const p=document.getElementById('notifPopup');p.style.setProperty('--nc',{info:'#58a6ff',warning:'#f0a500',danger:'#fb8f44',emergency:'#f85149',done:'#4ade80',project:'#c084fc'}[n.type]||'#58a6ff');document.getElementById('npType').textContent=(TYPE_LABELS[n.type]||n.type).toUpperCase();document.getElementById('npSender').textContent=n.sender?('👤 '+n.sender):'';const textEl=document.getElementById('npText');textEl.textContent='';const detEl=document.getElementById('npDetail');detEl.style.display='none';detEl.textContent='';const ar=document.getElementById('npArea');ar.style.display='none';const spd=_twSpeed(n.type);_typewriter(textEl,n.text||'',spd,()=>{if(n.detail){detEl.style.display='block';_typewriter(detEl,n.detail,spd);}});if(n.linked_area){ar.style.display='block';ar.textContent='🗺 '+n.linked_area+' — რუკაზე ნახვა →';}const pw=Math.min(window.innerWidth*0.9,360);p.style.cssText='display:block;left:'+((window.innerWidth-pw)/2)+'px;bottom:72px;max-width:'+pw+'px;';p.classList.add('show');}
function toggleQuest(){const p=document.getElementById('questPopup');if(!p)return;if(p.style.display==='block'){p.style.display='none';}else{p.style.display='block';const full=p.dataset.full||(p.dataset.full=p.textContent);p.textContent='';_typewriter(p,full,60);}}
let _slCell={col:0,row:0},_slZoom=1;
function openSlPopup(col,row,cx,cy){_slCell={col,row};_slZoom=_snapZoom(scale);document.getElementById('slCoords').textContent='Col: '+col+'   Row: '+row;document.querySelectorAll('.slzBtn').forEach(b=>b.classList.toggle('on',+b.dataset.z===_slZoom));const p=document.getElementById('spotLinkPopup');const pw=200,ph=130;let left=cx+12,top=cy-ph/2;left=Math.min(window.innerWidth-pw-8,Math.max(8,left));top=Math.max(8,Math.min(window.innerHeight-ph-8,top));p.style.left=left+'px';p.style.top=top+'px';p.classList.add('show');}
function closeSlPopup(){const p=document.getElementById('spotLinkPopup');p.classList.remove('show');p.style.display='';}
function setSlZoom(btn){_slZoom=+btn.dataset.z;document.querySelectorAll('.slzBtn').forEach(b=>b.classList.toggle('on',b===btn));}
function _snapZoom(z){const snaps=[0.5,1,2,3];return snaps.reduce((a,b)=>Math.abs(b-z)<Math.abs(a-z)?b:a);}
function copySlLink(){const base=window.location.href.split('#')[0];const link=base+'#spot='+_slCell.col+','+_slCell.row+','+_slZoom;const done=()=>{const p=document.getElementById('spotLinkPopup');const btn=p.querySelector('.slCopy');const orig=btn.textContent;btn.textContent='✓ დაკოპირდა!';setTimeout(()=>{btn.textContent=orig;closeSlPopup();},900);};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(link).then(done).catch(()=>{_slFb(link);done();});}else{_slFb(link);done();}}
function _slFb(text){const ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;top:-9999px;left:-9999px;';document.body.appendChild(ta);ta.focus();ta.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);}
(function(){const TS2=${TS};let _ltTimer=null,_ltSuppress=false;wrap.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0],sx=t.clientX,sy=t.clientY;_ltTimer=setTimeout(()=>{_ltTimer=null;_ltSuppress=true;const rect=wrap.getBoundingClientRect();const mx=sx-rect.left+wrap.scrollLeft,my=sy-rect.top+wrap.scrollTop;openSlPopup(Math.max(0,Math.floor(mx/(TS2*scale))),Math.max(0,Math.floor(my/(TS2*scale))),sx,sy);},600);},{passive:true});wrap.addEventListener('touchmove',e=>{if(_ltTimer){clearTimeout(_ltTimer);_ltTimer=null;}},{passive:true});wrap.addEventListener('touchend',e=>{if(_ltTimer){clearTimeout(_ltTimer);_ltTimer=null;}if(_ltSuppress){_ltSuppress=false;e.preventDefault&&e.preventDefault();}},{passive:false});wrap.addEventListener('click',e=>{if(document.getElementById('spotLinkPopup').classList.contains('show')){if(!e.target.closest('#spotLinkPopup'))closeSlPopup();}});})();
// ── hash navigation ──
function applySpotHash(){const h=window.location.hash;if(!h.startsWith('#spot='))return;const parts=h.slice(6).split(',');if(parts.length<2)return;const col=parseInt(parts[0]),row=parseInt(parts[1]),z=parts.length>=3?parseFloat(parts[2]):1;if(isNaN(col)||isNaN(row)||isNaN(z))return;scale=Math.max(0.2,Math.min(8,z));inner.style.transform='scale('+scale+')';sizer.style.width=(${w}*scale)+'px';sizer.style.height=(${h}*scale)+'px';const sx=Math.max(0,col*${TS}*scale-wrap.clientWidth/2),sy=Math.max(0,row*${TS}*scale-wrap.clientHeight/2);let n=0;(function go(){wrap.scrollLeft=sx;wrap.scrollTop=sy;if(++n<8)setTimeout(go,150);})();}
function applyAreaHash(){const h=window.location.hash;if(!h.startsWith('#area='))return;const title=decodeURIComponent(h.slice(6).replace(/\\+/g,' '));if(!title)return;function tryFit(n){const els=document.querySelectorAll('.hs-area[data-title="'+title+'"]');if(els.length){fitAreas(title);return;}if(n>0)setTimeout(()=>tryFit(n-1),300);}setTimeout(()=>tryFit(10),200);}
// ── notifications ──
const SUPA_URL='https://miqenmsgwkkmtxwwbxzo.supabase.co';
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pcWVubXNnd2trbXR4d3dieHpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMDc0NzYsImV4cCI6MjA5NDg4MzQ3Nn0.VfJgVoPC-ZbjlcuwMriYrNXb-3E2OgC92nOR9hOPgKI';
const TYPE_LABELS={info:'ინფო',warning:'გაფრთხილება',danger:'საფრთხე',emergency:'განგაში',done:'მზადაა',project:'პროექტი'};
let _notifs=[],_curNotif=null;
async function loadNotifs(){try{const r=await fetch(SUPA_URL+'/rest/v1/notifications?order=created_at.desc&limit=20',{headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY}});if(!r.ok)return;_notifs=await r.json();renderNotifBar();if(navigator.setAppBadge&&_notifs.length){navigator.setAppBadge(_notifs.length);}else if(navigator.clearAppBadge){navigator.clearAppBadge();}}catch(e){}}
function renderNotifBar(){const bar=document.getElementById('notifBar');if(!bar)return;bar.innerHTML='';if(!_notifs.length)return;const MAX=4;const visible=_notifs.slice(0,MAX);visible.forEach(n=>{const c=document.createElement('div');c.className='ncard'+(n.type==='emergency'?' pulse':'');c.dataset.type=n.type||'info';c.title=n.text||'';c.textContent=n.symbol||'💬';c.onclick=()=>openNotifPopup(n);bar.appendChild(c);});if(_notifs.length>MAX){const hidden=_notifs.length-MAX;const more=document.createElement('div');more.style.cssText='width:44px;height:44px;border-radius:10px;background:rgba(13,17,23,0.65);backdrop-filter:blur(8px);border:1px solid #30363d;color:#8b949e;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0.82;';more.textContent='+'+hidden;more.onclick=()=>openNotifList();bar.appendChild(more);}}
function openNotifList(){closeNotifPopup();const p=document.getElementById('notifPopup');p.style.setProperty('--nc','#58a6ff');document.getElementById('npType').textContent='ყველა შეტყობინება';document.getElementById('npSender').textContent='';const body=document.getElementById('npText');body.innerHTML='';_notifs.forEach(n=>{const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(48,54,61,0.4);cursor:pointer;';row.innerHTML='<span style="font-size:16px;">'+(n.symbol||'💬')+'</span><span style="font-size:12px;color:#e6edf3;flex:1;">'+(n.text||'')+'</span>';row.onclick=()=>openNotifPopup(n);body.appendChild(row);});document.getElementById('npDetail').textContent='';document.getElementById('npDetail').style.display='none';document.getElementById('npArea').style.display='none';const pw=Math.min(window.innerWidth*0.9,360);p.style.cssText='display:block;left:'+((window.innerWidth-pw)/2)+'px;bottom:72px;max-width:'+pw+'px;';p.classList.add('show');}
function closeNotifPopup(){const p=document.getElementById('notifPopup');p.classList.remove('show');p.style.display='none';}
function goToArea(){if(!_curNotif||!_curNotif.linked_area)return;closeNotifPopup();const title=_curNotif.linked_area;const els=document.querySelectorAll('.hs-area[data-title="'+title+'"]');if(els.length){fitAreas(title);blinkAreasByGroupOrTitle('',title);}else{const hs=document.querySelector('.hotspot[data-title="'+title+'"]');if(hs){const ox=+hs.dataset.ox,oy=+hs.dataset.oy;wrap.scrollLeft=ox*scale-wrap.clientWidth/2;wrap.scrollTop=oy*scale-wrap.clientHeight/2;}}}
window.addEventListener('load',()=>{
  loadNotifs();
  _startRealtime();
  applySpotHash();
  applyAreaHash();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').then(reg=>{
      if('periodicSync' in reg){reg.periodicSync.register('notif-check',{minInterval:5*60*1000}).catch(()=>{});}
      setInterval(()=>{if(reg.active)reg.active.postMessage('CHECK_NOTIFS');},5*60*1000);
    }).catch(()=>{});
    navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.type==='NOTIF_UPDATE')loadNotifs();});
  }
});
window.addEventListener('hashchange',()=>{applySpotHash();applyAreaHash();});
// ── terminal ──
function _tmInit(){
  document.getElementById('termBtn').style.display='block';
  document.getElementById('mapTitle').style.display='none';
  document.getElementById('mapTitle').style.display='none';
}
var _tmOpen=false,_tmFull=false,_tmHist=[],_tmHIdx=-1,_tmHCur='';
var _TMCMDS=['\u10D3\u10D0\u10EE\u10DB\u10D0\u10E0\u10D4\u10D1\u10D0','\u10D2\u10D0\u10E1\u10E3\u10E4\u10D7\u10D0\u10D5\u10D4\u10D1\u10D0','\u10D8\u10DC\u10E4\u10DD','\u10DB\u10D0\u10E1\u10E8\u10E2\u10D0\u10D1\u10D8','\u10D6\u10DD\u10DC\u10D4\u10D1\u10D8','\u10DD\u10D1\u10D8\u10D4\u10E5\u10E2\u10D4\u10D1\u10D8','\u10EC\u10D0\u10E1\u10D5\u10DA\u10D0','\u10DA\u10D4\u10D2\u10D4\u10DC\u10D3\u10D0','\u10DB\u10D4\u10DC\u10D8\u10E3','\u10E1\u10E0\u10E3\u10DA\u10D8','\u10D3\u10D0\u10EE\u10E3\u10E0\u10D5\u10D0'];
function toggleTerm(){_tmOpen?closeTerm():_tmOpen_();}
function _tmOpen_(){_tmOpen=true;document.getElementById('mdlTerm').classList.add('open');setTimeout(function(){document.getElementById('tmIn').focus();},240);if(!document.getElementById('tmOut').children.length)_tmBoot();}
function closeTerm(){_tmOpen=false;_tmFull=false;var t=document.getElementById('mdlTerm');t.classList.remove('open','tmfull');document.getElementById('tmFullBtn').classList.remove('on');document.getElementById('tmFullBtn').textContent='\u26F6';}
function tmToggleFull(){_tmFull=!_tmFull;document.getElementById('mdlTerm').classList.toggle('tmfull',_tmFull);var b=document.getElementById('tmFullBtn');b.classList.toggle('on',_tmFull);b.textContent=_tmFull?'\u229F':'\u26F6';}
function tmClear(){document.getElementById('tmOut').innerHTML='';}
function _tmL(cls,txt){var d=document.createElement('div');d.className='tl '+cls;d.textContent=txt;var o=document.getElementById('tmOut');o.appendChild(d);o.scrollTop=o.scrollHeight;}
function _tmBoot(){var d=_CFG;var objs=document.querySelectorAll('.hotspot:not(.hs-area):not(.no-interact)').length;var areas=document.querySelectorAll('.hs-area').length;var lines=[['tsy','MDELO VIEWER \u2014 \u10E2\u10D4\u10E0\u10DB\u10D8\u10DC\u10D0\u10DA\u10D8'],['tdm','\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'],['tnf','\u10E0\u10E3\u10D9\u10D0: '+(d.title||'\u10E3\u10E1\u10D0\u10EE\u10D4\u10DA\u10DD')+'   '+d.cols+'x'+d.rows],['tnf','\u10DD\u10D1\u10D8\u10D4\u10E5\u10E2\u10D4\u10D1\u10D8: '+objs+'   \u10D6\u10DD\u10DC\u10D4\u10D1\u10D8: '+areas],['tdm','"\u10D3\u10D0\u10EE\u10DB\u10D0\u10E0\u10D4\u10D1\u10D0" \u2014 \u10D1\u10E0\u10eb\u10d0\u10dc\u10d4\u10d1\u10d8\u10e1 \u10E1\u10D8\u10D0'],['tdm','\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500']];for(var i=0;i<lines.length;i++){(function(l,delay){setTimeout(function(){_tmL(l[0],l[1]);},delay);})(lines[i],i*55);}}
(function(){var inp=document.getElementById('tmIn');var hint=document.getElementById('tmHint');inp.addEventListener('keydown',function(e){if(e.key==='Enter'){var v=inp.value.trim();if(!v)return;_tmHist.unshift(v);_tmHIdx=-1;_tmHCur='';_tmL('ti',v);inp.value='';hint.textContent='';_tmRun(v);}else if(e.key==='ArrowUp'){e.preventDefault();if(_tmHIdx===-1)_tmHCur=inp.value;_tmHIdx=Math.min(_tmHIdx+1,_tmHist.length-1);inp.value=_tmHist[_tmHIdx]||'';}else if(e.key==='ArrowDown'){e.preventDefault();_tmHIdx=Math.max(_tmHIdx-1,-1);inp.value=_tmHIdx===-1?_tmHCur:_tmHist[_tmHIdx];}else if(e.key==='Tab'){e.preventDefault();var v2=inp.value.trim();var m=_TMCMDS.find(function(c){return c.startsWith(v2)&&c!==v2;});if(m){inp.value=m;hint.textContent='';}}else if(e.key==='Escape'){closeTerm();}});inp.addEventListener('input',function(){var v=inp.value.trim();var m=_TMCMDS.find(function(c){return c.startsWith(v)&&c!==v;});hint.textContent=m?m.slice(v.length):'';});})();
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&_tmOpen){closeTerm();return;}if((e.key==='\`'||e.key==='~')&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();toggleTerm();}});
var _SEP='\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
function _tmRun(raw){var parts=raw.trim().split(/\s+/),cmd=parts[0],args=parts.slice(1);var map={'\u10D3\u10D0\u10EE\u10DB\u10D0\u10E0\u10D4\u10D1\u10D0':_tmHelp,'\u10D2\u10D0\u10E1\u10E3\u10E4\u10D7\u10D0\u10D5\u10D4\u10D1\u10D0':tmClear,'\u10D8\u10DC\u10E4\u10DD':_tmInfo,'\u10DB\u10D0\u10E1\u10E8\u10E2\u10D0\u10D1\u10D8':_tmZoom,'\u10D6\u10DD\u10DC\u10D4\u10D1\u10D8':_tmAreas,'\u10DD\u10D1\u10D8\u10D4\u10E5\u10E2\u10D4\u10D1\u10D8':_tmObjects,'\u10EC\u10D0\u10E1\u10D5\u10DA\u10D0':_tmGo,'\u10DA\u10D4\u10D2\u10D4\u10DC\u10D3\u10D0':_tmLegend,'\u10DB\u10D4\u10DC\u10D8\u10E3':_tmMenu,'\u10E1\u10E0\u10E3\u10DA\u10D8':tmToggleFull,'\u10D3\u10D0\u10EE\u10E3\u10E0\u10D5\u10D0':closeTerm};var fn=map[cmd];fn?fn(args):_tmL('ter','\u10E3\u10EA\u10DC\u10DD\u10D1\u10D8 \u10D1\u10E0\u10eb\u10d0\u10dc\u10d4\u10d1\u10d0: "'+cmd+'" \u2014 \u10E1\u10EA\u10D0\u10D3\u10D4: \u10D3\u10D0\u10EE\u10DB\u10D0\u10E0\u10D4\u10D1\u10D0');}
function _tmHelp(){var list=[['\u10D3\u10D0\u10EE\u10DB\u10D0\u10E0\u10D4\u10D1\u10D0','\u10D1\u10E0\u10eb\u10d0\u10dc\u10d4\u10d1\u10d8\u10e1 \u10E1\u10D8\u10D0'],['\u10D2\u10D0\u10E1\u10E3\u10E4\u10D7\u10D0\u10D5\u10D4\u10D1\u10D0','\u10D9\u10DD\u10DC\u10E1\u10DD\u10DA\u10D8\u10E1 \u10D2\u10D0\u10E1\u10E3\u10E4\u10D7\u10D0\u10D5\u10D4\u10D1\u10D0'],['\u10D8\u10DC\u10E4\u10DD','\u10E0\u10E3\u10D9\u10D8\u10E1 \u10D8\u10DC\u10E4\u10DD\u10E0\u10DB\u10D0\u10EA\u10D8\u10D0'],['\u10DB\u10D0\u10E1\u10E8\u10E2\u10D0\u10D1\u10D8 [N]','zoom 0.25\u20136'],['\u10D6\u10DD\u10DC\u10D4\u10D1\u10D8','\u10D6\u10DD\u10DC\u10D4\u10D1\u10D8\u10E1 \u10E1\u10D8\u10D0'],['\u10DD\u10D1\u10D8\u10D4\u10E5\u10E2\u10D4\u10D1\u10D8','\u10DD\u10D1\u10D8\u10D4\u10E5\u10E2\u10D4\u10D1\u10D8\u10E1 \u10E1\u10D8\u10D0'],['\u10EC\u10D0\u10E1\u10D5\u10DA\u10D0 [N]','\u10D6\u10DD\u10DC\u10D0\u10D6\u10D4 \u10DC\u10D0\u10D5\u10D8\u10D2\u10D0\u10EA\u10D8\u10D0'],['\u10DA\u10D4\u10D2\u10D4\u10DC\u10D3\u10D0','\u10D0\u10E6\u10EC\u10D4\u10E0\u10D0\u10E1 \u10E9\u10D5\u10D4\u10DC\u10D0/\u10D3\u10D0\u10DB\u10D0\u10DA\u10D5\u10D0'],['\u10DB\u10D4\u10DC\u10D8\u10E3','\u10DB\u10D4\u10DC\u10D8\u10E3\u10E1 toggle'],['\u10E1\u10E0\u10E3\u10DA\u10D8','\u10E1\u10E0\u10E3\u10DA\u10D8 \u2194 \u10DC\u10D0\u10EE\u10D4\u10D5\u10D0\u10E0\u10D8'],['\u10D3\u10D0\u10EE\u10E3\u10E0\u10D5\u10D0','\u10D3\u10D0\u10EE\u10E3\u10E0\u10D5\u10D0  [Esc]']];_tmL('tdm',_SEP);for(var i=0;i<list.length;i++){var c=list[i][0],d=list[i][1];var pad=c;while(pad.length<18)pad+=' ';_tmL('tnf',pad+d);}_tmL('tdm','Tab \u2014 \u10D0\u10D5\u10E2\u10DD\u10D3\u10D0\u10E1\u10E0\u10E3\u10DA\u10D4\u10D1\u10D0   \u2191\u2193 \u2014 \u10D8\u10E1\u10E2\u10DD\u10E0\u10D8\u10D0');_tmL('tdm',_SEP);}
function _tmInfo(){var d=_CFG;var objs=document.querySelectorAll('.hotspot:not(.hs-area):not(.no-interact)').length;var areas=document.querySelectorAll('.hs-area').length;_tmL('tdm',_SEP);_tmL('tnf','\u10E1\u10D0\u10EE\u10D4\u10DA\u10D8:    '+(d.title||'\u10E3\u10E1\u10D0\u10EE\u10D4\u10DA\u10DD'));_tmL('tnf','\u10D6\u10DD\u10DB\u10D0:       '+d.cols+' \u00d7 '+d.rows+' \u10E1\u10D4\u10E5\u10E2\u10DD\u10E0\u10D8');_tmL('tnf','zoom:       '+scale.toFixed(2)+'x');_tmL('tnf','\u10DD\u10D1\u10D8\u10D4\u10E5\u10E2\u10D4\u10D1\u10D8: '+objs);_tmL('tnf','\u10D6\u10DD\u10DC\u10D4\u10D1\u10D8:    '+areas);_tmL('tdm',_SEP);}
function _tmZoom(args){var n=parseFloat(args[0]);if(isNaN(n)||n<0.25||n>6){_tmL('ter','\u10DB\u10D0\u10E1\u10E8\u10E2\u10D0\u10D1\u10D8: 0.25\u20136 \u10E8\u10DD\u10E0\u10D8\u10E1');return;}applyScale(n,wrap.clientWidth/2,wrap.clientHeight/2);_tmL('tok','\u10DB\u10D0\u10E1\u10E8\u10E2\u10D0\u10D1\u10D8: '+n+'x');}
function _tmAreas(){var els=document.querySelectorAll('.hs-area');if(!els.length){_tmL('tdm','\u10D6\u10DD\u10DC\u10D4\u10D1\u10D8: \u10EA\u10D0\u10E0\u10D8\u10D4\u10DA\u10D8\u10D0');return;}var seen={};_tmL('tdm',_SEP);els.forEach(function(el){var t=el.dataset.title;if(t&&!seen[t]){seen[t]=1;_tmL('tnf','\u25b8 '+t);}});_tmL('tdm',_SEP);_tmL('tdm','\u10D2\u10D0\u10DB\u10DD\u10D8\u10E7\u10D4\u10DC\u10D4: \u10EC\u10D0\u10E1\u10D5\u10DA\u10D0 [\u10E1\u10D0\u10EE\u10D4\u10DA\u10D8]');}
function _tmObjects(){var els=document.querySelectorAll('.hotspot:not(.hs-area):not(.no-interact)');if(!els.length){_tmL('tdm','\u10DD\u10D1\u10D8\u10D4\u10E5\u10E2\u10D4\u10D1\u10D8: \u10EA\u10D0\u10E0\u10D8\u10D4\u10DA\u10D8\u10D0');return;}_tmL('tdm',_SEP);els.forEach(function(el){_tmL('tnf','\u25c6 '+(el.dataset.title||'(\u10E3\u10E1\u10D0\u10EE\u10D4\u10DA\u10DD)'));});_tmL('tdm',_SEP);}
function _tmGo(args){var label=args.join(' ').trim();if(!label){_tmL('ter','\u10D2\u10D0\u10DB\u10DD\u10E7\u10D4\u10DC\u10D4\u10D1\u10D0: \u10EC\u10D0\u10E1\u10D5\u10DA\u10D0 [\u10D6\u10DD\u10DC\u10D8\u10E1 \u10E1\u10D0\u10EE\u10D4\u10DA\u10D8]');return;}var els=document.querySelectorAll('.hs-area[data-title="'+label+'"]');if(!els.length){_tmL('ter','\u10D6\u10DD\u10DC\u10D0 \u10D5\u10D4\u10E0 \u10DB\u10DD\u10D8\u10eb\u10d4\u10d1\u10dc\u10d0: "'+label+'"');return;}fitAreas(label);closeTerm();}
function _tmLegend(){toggleQuest();_tmL('tok','\u10DA\u10D4\u10D2\u10D4\u10DC\u10D3\u10D0: toggled');}
function _tmMenu(){closeTerm();toggleMenu();}
<\/script>
</body>
</html>`;
}

function _canvasRendererScript(TS) {
  return `(function(){const cfg=_CFG,TS=${TS},COLS=cfg.cols,ROWS=cfg.rows;const canvas=document.getElementById('mapImg');if(!canvas)return;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;const tileMap=new Map();(cfg.custom||[]).forEach(t=>tileMap.set(t.id,t));(cfg.autoTiles||[]).forEach(t=>tileMap.set(t.id,t));(cfg.dualTiles||[]).forEach(t=>tileMap.set(t.id,t));const sheets=new Map(),b64imgs=new Map(),urls=new Set();[...(cfg.custom||[]),...(cfg.autoTiles||[]),...(cfg.dualTiles||[])].forEach(t=>{if(t.sheetUrl)urls.add(t.sheetUrl);});(cfg.objects||[]).forEach(obj=>{const def=tileMap.get(obj.id);if(def&&def.sheetUrl)urls.add(def.sheetUrl);});const b64tiles=(cfg.custom||[]).filter(t=>t.src&&!t.sheetUrl);let loadPending=urls.size+b64tiles.length;function tryDone(){if(--loadPending<=0)onAllLoaded();}function connects(nid,id,compat){return nid===id||compat.includes(nid);}function drawSp(t,sp,ox,oy){if(!sp)return;if(typeof sp==='object'&&sp.x!=null){const sh=sheets.get(t.sheetUrl);if(sh)ctx.drawImage(sh,sp.x,sp.y,sp.w,sp.h,ox,oy,TS,TS);}else if(typeof sp==='string'){const bi=new Image();bi.onload=()=>ctx.drawImage(bi,ox,oy,TS,TS);bi.src=sp;}}function renderLayer(lmap){for(let r=0;r<ROWS;r++){for(let c=0;c<COLS;c++){const id=lmap[r][c];if(!id)continue;const t=tileMap.get(id);if(!t||t.dualTile||t.autoTile)continue;if(t.sheetUrl){const sh=sheets.get(t.sheetUrl);if(sh)ctx.drawImage(sh,t.x,t.y,t.w,t.h,c*TS,r*TS,TS,TS);}else{const bi=b64imgs.get(t.id);if(bi)ctx.drawImage(bi,c*TS,r*TS,TS,TS);}}}(cfg.dualTiles||[]).forEach(dt=>{const compat=dt.compatibleWith||[];for(let r=0;r<ROWS-1;r++){for(let c=0;c<COLS-1;c++){const mask=(connects(lmap[r][c],dt.id,compat)?1:0)|(connects(lmap[r][c+1],dt.id,compat)?2:0)|(connects(lmap[r+1][c],dt.id,compat)?4:0)|(connects(lmap[r+1][c+1],dt.id,compat)?8:0);if(!mask)continue;drawSp(dt,(dt.sprites||[])[mask],(c+0.5)*TS,(r+0.5)*TS);}}});for(let r=0;r<ROWS;r++){for(let c=0;c<COLS;c++){const id=lmap[r][c];if(!id)continue;const t=tileMap.get(id);if(!t||!t.autoTile)continue;const compat=t.compatibleWith||[];let m=0;if(r>0&&connects(lmap[r-1][c],id,compat))m|=1;if(c<COLS-1&&connects(lmap[r][c+1],id,compat))m|=2;if(r<ROWS-1&&connects(lmap[r+1][c],id,compat))m|=4;if(c>0&&connects(lmap[r][c-1],id,compat))m|=8;const sprites=t.sprites||[];const sp=sprites[m]||sprites[0]||sprites.find(v=>v&&typeof v==='object'&&v.w>0)||sprites.find(Boolean);if(sp)drawSp(t,sp,c*TS,r*TS);}}}function onAllLoaded(){ctx.fillStyle='#111';ctx.fillRect(0,0,canvas.width,canvas.height);renderLayer(cfg.map);if(cfg.overlayMap)renderLayer(cfg.overlayMap);const _oImgs=new Map();(cfg.objects||[]).forEach(obj=>{if(obj.src&&!_oImgs.has(obj.src)){const im=new Image();im.src=obj.src;_oImgs.set(obj.src,im);}});Promise.all([..._oImgs.values()].map(im=>im.complete?Promise.resolve():new Promise(r=>{im.onload=r;im.onerror=r;}))).then(()=>{(cfg.objects||[]).forEach(obj=>{const w=(obj.cols||1)*TS,h=(obj.rows||1)*TS;if(obj.src&&_oImgs.has(obj.src)){ctx.drawImage(_oImgs.get(obj.src),obj.x*TS,obj.y*TS,w,h);}else{const def=tileMap.get(obj.id);if(!def)return;if(def.sheetUrl){const sh=sheets.get(def.sheetUrl);if(sh)ctx.drawImage(sh,def.sx,def.sy,def.sw,def.sh,obj.x*TS,obj.y*TS,w,h);}}}); });}if(loadPending===0){onAllLoaded();return;}urls.forEach(url=>{const img=new Image();img.onload=()=>{sheets.set(url,img);tryDone();};img.onerror=()=>tryDone();img.src=url;});b64tiles.forEach(t=>{const img=new Image();img.onload=()=>{b64imgs.set(t.id,img);tryDone();};img.onerror=()=>tryDone();img.src=t.src;});})();`;
}

// ── WINDOW BINDINGS ──
window.getMenuData    = getMenuData;
window.exportConfig   = exportConfig;
window.doExportHTML   = doExportHTML;
