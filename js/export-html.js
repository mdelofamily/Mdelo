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
    const embeddedHotspots = objects.map(o => {
      const ox = o.x * TS_, oy = o.y * TS_, ow = o.cols * TS_, oh = o.rows * TS_;
      const title   = ((o.title || o.lb) || "").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
      const tooltip = (o.tooltip || "").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
      const hasInteraction = o.tooltip || o.title || o.marker;
      const markerCls = o.marker === "!" ? "exc" : o.marker === "?" ? "q" : o.marker === "💬" ? "chat" : "";
      const markerHtml = hasInteraction
        ? (markerCls ? `<div class="hs-marker ${markerCls}">${o.marker}</div>` : `<div class="hs-dot"></div>`)
        : "";
      return `<div class="hotspot${hasInteraction ? "" : " no-interact"}" data-ox="${ox}" data-oy="${oy}" data-ow="${ow}" data-oh="${oh}" data-title="${title}" data-tooltip="${tooltip}" style="left:${ox}px;top:${oy}px;width:${ow}px;height:${oh}px;">${markerHtml}</div>`;
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

    // draw full map — exact tile dimensions (no editor border)
    const _full = document.createElement("canvas");
    _full.width = COLS * TS; _full.height = ROWS * TS;
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

    // CROP = 0 — ჩარჩო არ გამოჩნდება viewer-ში
    const CROP = 0;
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
      allHotspots, mapDesc, COLS, ROWS, TS
    });

    downloadFile(html, fname + ".html", "text/html");
    toast("🌐 " + fname + ".html — მზადაა!");
  } catch (e) { console.error("HTML export error:", e); toast("❌ export: " + e.message); }
}

// ── VIEWER HTML BUILDER ──
function _buildViewerHTML({ title, w, h, b64, useCanvasRenderer, cfgJSLiteral, allHotspots, mapDesc, COLS, ROWS, TS }) {
  return `<!DOCTYPE html>
<html lang="ka">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
body{background:#111;overflow:hidden;width:100vw;height:100vh;}
#mapWrap{width:100vw;height:100vh;overflow:scroll;cursor:grab;touch-action:pan-x pan-y;-webkit-overflow-scrolling:touch;position:relative;}
#mapWrap:active{cursor:grabbing;}
#sizer{position:absolute;top:0;left:0;pointer-events:none;}
#mapInner{position:absolute;top:0;left:0;transform-origin:0 0;}
#mapInner canvas,#mapInner img{display:block;image-rendering:pixelated;image-rendering:crisp-edges;}
#topbar{position:fixed;top:0;left:0;right:0;z-index:10;display:flex;align-items:center;gap:10px;padding:7px 12px;background:rgba(13,17,23,0.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid rgba(48,54,61,0.35);pointer-events:none;}
#topbar>*{pointer-events:auto;}
#mapTitle{font:13px sans-serif;color:rgba(230,237,243,0.65);}
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
#hsPopup{display:none;position:fixed;z-index:50;background:rgba(22,27,34,0.95);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(88,166,255,0.35);border-radius:10px;padding:12px 34px 12px 14px;max-width:min(88vw,360px);font:13px/1.7 sans-serif;color:rgba(200,210,220,0.92);}
#hsPopup.show{display:block;}
#hsPopupTitle{font-size:14px;font-weight:600;color:#ffffff;margin-bottom:5px;padding-right:20px;}
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
#questBtn{position:fixed;bottom:14px;left:14px;z-index:30;width:38px;height:38px;border-radius:50%;background:rgba(22,27,34,0.8);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(48,54,61,0.6);color:rgba(180,190,200,0.8);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
#questPopup{display:none;position:fixed;bottom:62px;left:14px;z-index:30;background:rgba(22,27,34,0.88);backdrop-filter:blur(12px);border:1px solid rgba(48,54,61,0.5);border-radius:10px;padding:12px 14px;max-width:min(88vw,420px);font:13px/1.6 sans-serif;color:rgba(200,210,220,0.9);white-space:pre-wrap;}
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
<div id="topbar"><span id="mapTitle">${title}</span></div>
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
<button id="menuBtn" onclick="toggleMenu()">☰</button>
<div id="gameMenu"><button class="gmClose" onclick="toggleMenu()">✕</button><div id="gmContent"></div></div>
<div id="hsPopup"><button id="hsClose" onclick="closeHsPopup()">✕</button><div id="hsPopupTitle"></div><div id="hsPopupBody"></div></div>
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
${useCanvasRenderer ? _canvasRendererScript(TS) : ""}
// ── zoom ──
const wrap=document.getElementById('mapWrap'),inner=document.getElementById('mapInner'),sizer=document.getElementById('sizer');
// MIN_SCALE = cover: map always fills screen, recalculated on resize (address bar hide/show)
let MIN_SCALE=Math.max(window.innerWidth/${w},window.innerHeight/${h});
let scale=MIN_SCALE;
function applyScale(s,ox,oy){const prev=scale;scale=Math.max(MIN_SCALE,Math.min(8,s));const ratio=scale/prev;wrap.scrollLeft=(wrap.scrollLeft+ox)*ratio-ox;wrap.scrollTop=(wrap.scrollTop+oy)*ratio-oy;inner.style.transform='scale('+scale+')';sizer.style.width=(${w}*scale)+'px';sizer.style.height=(${h}*scale)+'px';}
window.addEventListener('resize',()=>{MIN_SCALE=Math.max(window.innerWidth/${w},window.innerHeight/${h});if(scale<MIN_SCALE)applyScale(MIN_SCALE,wrap.clientWidth/2,wrap.clientHeight/2);});
wrap.addEventListener('wheel',e=>{e.preventDefault();const r=wrap.getBoundingClientRect();applyScale(scale*(e.deltaY<0?1.12:0.89),e.clientX-r.left,e.clientY-r.top);},{passive:false});
let p0=null,pDist=0,pScale=1;
wrap.addEventListener('touchstart',e=>{if(e.touches.length===2){wrap.style.touchAction='none';p0=e.touches[0];const p1=e.touches[1];pDist=Math.hypot(p1.clientX-p0.clientX,p1.clientY-p0.clientY);pScale=scale;e.preventDefault();}},{passive:false});
wrap.addEventListener('touchmove',e=>{if(e.touches.length===2){const a=e.touches[0],b=e.touches[1];const d=Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);const r=wrap.getBoundingClientRect();applyScale(pScale*(d/pDist),(a.clientX+b.clientX)/2-r.left,(a.clientY+b.clientY)/2-r.top);e.preventDefault();}},{passive:false});
wrap.addEventListener('touchend',e=>{if(e.touches.length<2)wrap.style.touchAction='pan-x pan-y';},{passive:true});
// ── hotspots ──
function parseLinks(t){let o='',i=0;while(i<t.length){const s=t.indexOf('[[',i);if(s<0){o+=t.slice(i);break;}o+=t.slice(i,s);const e=t.indexOf(']]',s+2);if(e<0){o+=t.slice(s);break;}const inner2=t.slice(s+2,e);const p=inner2.indexOf('|');if(p<0){o+=inner2;}else{const lbl=inner2.slice(0,p),url=inner2.slice(p+1).trim(),safe=url.startsWith('http')||url.startsWith('//')||url.startsWith('/')?url:'#';o+='<a href="'+safe+'" target="_blank" style="color:#58a6ff;">'+lbl+'</a>';}i=e+2;}return o.replace(/\\n/g,'<br>');}
wrap.addEventListener('click',e=>{if(e.target.closest('#menuBtn')||e.target.closest('#gameMenu'))return;const hs=e.target.closest('.hotspot');if(hs&&!hs.classList.contains('no-interact')){closeHsPopup();closeAreaPopup();if(hs.classList.contains('hs-area')){const t=hs.dataset.title||'',grp=hs.dataset.group||'';blinkAreasByGroupOrTitle(grp,t);if(t)openAreaPopup(t,hs.dataset.tooltip||'');}else{openHsPopup(hs,hs.dataset.title||'',hs.dataset.tooltip||'');}return;}if(!e.target.closest('#hsPopup')&&!e.target.closest('#areaPopup')){closeHsPopup();closeAreaPopup();}});
function openHsPopup(el,title,raw){const popup=document.getElementById('hsPopup');document.getElementById('hsPopupTitle').textContent=title||'';document.getElementById('hsPopupBody').innerHTML=parseLinks(raw||'');const pw=Math.min(window.innerWidth*0.88,360),left=(window.innerWidth-pw)/2,top=Math.max(60,(window.innerHeight-200)/2);popup.style.cssText='display:block;left:'+left+'px;top:'+top+'px;max-width:'+pw+'px;';popup.classList.add('show');wrap.style.overflow='hidden';}
function closeHsPopup(){const p=document.getElementById('hsPopup');p.classList.remove('show');p.style.display='none';wrap.style.overflow='auto';}
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
function buildSubs(parent,children,depth){(children||[]).forEach(sub=>{if(depth<1){const sw=document.createElement('div');sw.className='gm-section';sw.style.marginTop='6px';const sh2=document.createElement('div');sh2.className='gm-section-hdr';sh2.style.fontSize='13px';sh2.innerHTML=\`<span>\${sub.icon||'📁'}</span><span>\${sub.title}</span><span class="arrow">▼</span>\`;sh2.onclick=()=>toggleSection(sh2);const sb=document.createElement('div');sb.className='gm-section-body';buildItems(sb,sub.items);buildSubs(sb,sub.children,depth+1);sw.appendChild(sh2);sw.appendChild(sb);parent.appendChild(sw);}else{const s=document.createElement('div');s.className='gm-sub';const st=document.createElement('div');st.className='gm-sub-title';st.textContent=(sub.icon||'📁')+' '+sub.title;s.appendChild(st);buildItems(s,sub.items);parent.appendChild(s);}});}
function buildMenu(cfg){const ct=document.getElementById('gmContent');ct.innerHTML='';if(cfg.title){const t=document.createElement('div');t.style.cssText='font:16px/1 sans-serif;color:rgba(230,237,243,0.9);text-align:center;padding:0 0 12px;font-weight:600;';t.textContent=cfg.title;ct.appendChild(t);}(cfg.menu||[]).forEach(sec=>{const wrap2=document.createElement('div');wrap2.className='gm-section';const hdr=document.createElement('div');hdr.className='gm-section-hdr';hdr.innerHTML=\`<span>\${sec.icon||'📁'}</span><span>\${sec.title}</span><span class="arrow">▼</span>\`;hdr.onclick=()=>toggleSection(hdr);const body=document.createElement('div');body.className='gm-section-body';buildItems(body,sec.items);buildSubs(body,sec.children,0);wrap2.appendChild(hdr);wrap2.appendChild(body);ct.appendChild(wrap2);});}
// ── quest ──
function toggleQuest(){const p=document.getElementById('questPopup');if(p)p.style.display=p.style.display==='block'?'none':'block';}
// ── spot link ──
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
window.addEventListener('load',()=>{
  if(!window.location.hash){
    // cover zoom — map fills screen edge-to-edge, no black border visible
    const s=Math.max(window.innerWidth/${w},window.innerHeight/${h});
    applyScale(Math.max(0.1,s),0,0);
  }
  applySpotHash();applyAreaHash();
});
window.addEventListener('hashchange',()=>{applySpotHash();applyAreaHash();});
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
