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
      return `<div class="hotspot${hasInteraction ? "" : " no-interact"}" data-ox="${ox}" data-oy="${oy}" data-ow="${ow}" data-oh="${oh}" data-title="${title}" data-tooltip="${tooltip}" style="left:${ox}px;top:${oy}px;width:${ow}px;height:${oh}px;"></div>`;
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
body{background:#111;overflow:hidden;width:100vw;height:100dvh;}
#mapWrap{width:100vw;height:100dvh;overflow:scroll;cursor:grab;touch-action:pan-x pan-y;-webkit-overflow-scrolling:touch;position:relative;}
#mapWrap:active{cursor:grabbing;}
#sizer{position:absolute;top:0;left:0;pointer-events:none;}
#mapInner{position:absolute;top:0;left:0;transform-origin:0 0;}
#mapInner canvas,#mapInner img{display:block;image-rendering:pixelated;image-rendering:crisp-edges;}
#topbar{position:fixed;top:0;left:0;right:0;z-index:10;display:flex;align-items:center;gap:10px;padding:7px 12px;background:rgba(13,17,23,0.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}
#topbar>*{pointer-events:auto;}
#mapTitle{font:13px sans-serif;color:rgba(230,237,243,0.65);}
#menuBtn{position:fixed;top:8px;right:12px;z-index:30;width:36px;height:36px;border-radius:8px;background:rgba(22,27,34,0.8);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(88,166,255,0.3);color:#8b949e;font-size:18px;cursor:pointer;}
#menuBtn:hover{border-color:#58a6ff;color:#58a6ff;}
#gameMenu{display:none;position:fixed;inset:0;z-index:40;background:rgba(13,17,23,0.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);flex-direction:column;align-items:center;justify-content:center;padding:20px;}
#gameMenu.open{display:flex;}
.gmClose{position:fixed;top:10px;right:12px;z-index:41;background:none;border:none;color:rgba(139,148,158,0.8);font-size:22px;cursor:pointer;}
#gmContent{width:100%;max-width:420px;display:flex;flex-direction:column;gap:8px;}
.gm-section{background:rgba(22,27,34,0.7);border:1px solid rgba(48,54,61,0.5);border-radius:10px;overflow:hidden;}
.gm-section-hdr{display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;font:14px/1 sans-serif;color:rgba(230,237,243,0.9);user-select:none;}
.gm-section-hdr:hover{background:rgba(255,255,255,0.04);}
.gm-section-hdr.no-children{cursor:default;}
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
.hs-marker{position:absolute;top:-8px;left:50%;transform:translate(-50%,-50%);font-size:18px;font-weight:bold;font-family:sans-serif;line-height:1;pointer-events:auto;-webkit-text-stroke:2px rgba(13,17,23,0.9);}
.hs-marker.exc{color:#f0a500;}.hs-marker.q{color:#e8e8e8;}.hs-marker.chat{color:#4ade80;}
#hsPopup{display:none;position:fixed;z-index:50;background:rgba(22,27,34,0.95);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(88,166,255,0.35);border-radius:10px;padding:12px 16px;width:260px;flex-direction:column;gap:8px;}
#hsPopup.show{display:flex;}
#hsPopupTitle{font-size:14px;font-weight:600;color:#ffffff;margin-bottom:5px;padding-right:20px;}
#hsClose{position:absolute;top:10px;right:12px;background:none;border:none;color:#8b949e;font-size:18px;cursor:pointer;line-height:1;}
.hs-area{border:none;background:transparent;cursor:pointer;border-radius:4px;}
.hotspot.no-interact{cursor:default;pointer-events:none;}
.hs-area:hover{background:rgba(255,220,80,0.07);}
#areaPopup{display:none;position:fixed;z-index:60;background:rgba(22,27,34,0.97);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid #f0a500;border-radius:10px;padding:12px 16px;width:260px;flex-direction:column;gap:8px;}
#areaPopup.show{display:flex;}
#areaPopup .ap-close{position:absolute;top:7px;right:10px;background:none;border:none;color:#8b949e;font-size:15px;cursor:pointer;}
#areaPopup .ap-title{font-size:14px;font-weight:600;color:#f0a500;padding-right:18px;}
#areaPopup .ap-tip{font-size:12px;color:#8b949e;line-height:1.5;}
#hsPopup a{color:#58a6ff;text-decoration:none;}#hsPopup a:hover{text-decoration:underline;}
#questBtn{position:fixed;bottom:14px;left:14px;z-index:30;width:38px;height:38px;border-radius:50%;background:rgba(22,27,34,0.8);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(48,54,61,0.5);color:#8b949e;font-size:20px;cursor:pointer;}
#questBtn:hover{border-color:#58a6ff;color:#58a6ff;}
#questPopup{display:none;position:fixed;bottom:62px;left:14px;z-index:30;background:rgba(22,27,34,0.88);backdrop-filter:blur(12px);border:1px solid rgba(48,54,61,0.5);border-radius:10px;padding:12px;max-width:200px;font-size:12px;color:rgba(230,237,243,0.8);line-height:1.6;}
#spotLinkPopup{display:none;position:fixed;z-index:60;background:rgba(22,27,34,0.97);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid #58a6ff;border-radius:10px;padding:12px 16px;width:260px;flex-direction:column;gap:8px;}
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
let scale=1;
function applyScale(s,ox,oy){const prev=scale;scale=Math.max(0.2,Math.min(8,s));const ratio=scale/prev;wrap.scrollLeft=(wrap.scrollLeft+ox)*ratio-ox;wrap.scrollTop=(wrap.scrollTop+oy)*ratio-oy;inner.style.transform='scale('+scale+')';}
wrap.addEventListener('wheel',e=>{e.preventDefault();const r=wrap.getBoundingClientRect();applyScale(scale*(e.deltaY<0?1.12:0.89),e.clientX-r.left,e.clientY-r.top);},{passive:false});
let p0=null,pDist=0,pScale=1;
wrap.addEventListener('touchstart',e=>{if(e.touches.length===2){wrap.style.touchAction='none';p0=e.touches[0];const p1=e.touches[1];pDist=Math.hypot(p1.clientX-p0.clientX,p1.clientY-p0.clientY);pScale=scale;}},{passive:false});
wrap.addEventListener('touchmove',e=>{if(e.touches.length===2){const a=e.touches[0],b=e.touches[1];const d=Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);const r=wrap.getBoundingClientRect();const mx=(a.clientX+b.clientX)/2-r.left,my=(a.clientY+b.clientY)/2-r.top;applyScale(pScale*(d/pDist),mx,my);}},{passive:false});
wrap.addEventListener('touchend',e=>{if(e.touches.length<2)wrap.style.touchAction='pan-x pan-y';},{passive:true});
// ── hotspots ──
function parseLinks(t){let o='',i=0;while(i<t.length){const s=t.indexOf('[[',i);if(s<0){o+=t.slice(i);break;}o+=t.slice(i,s);const e=t.indexOf(']]',s+2);if(e<0){o+=t.slice(s);break;}const inner=t.slice(s+2,e);const p=inner.lastIndexOf('|');const lbl=inner.slice(0,p<0?inner.length:p);const url=p<0?'':inner.slice(p+1);o+='<a href="'+url+'" target="_blank">'+lbl+'</a>';i=e+2;}return o;}
wrap.addEventListener('click',e=>{if(e.target.closest('#menuBtn')||e.target.closest('#gameMenu'))return;const hs=e.target.closest('.hotspot');if(hs&&!hs.classList.contains('no-interact')){const ox=+hs.dataset.ox,oy=+hs.dataset.oy,ow=+hs.dataset.ow,oh=+hs.dataset.oh;const title=hs.dataset.title;const tooltip=hs.dataset.tooltip;if(hs.classList.contains('hs-area')){openAreaPopup(title,tooltip);}else{openHsPopup(hs,title,tooltip);}}});
function openHsPopup(el,title,raw){const popup=document.getElementById('hsPopup');document.getElementById('hsPopupTitle').textContent=title||'';document.getElementById('hsPopupBody').innerHTML=parseLinks(raw||'');popup.classList.add('show');popup.style.display='flex';wrap.style.overflow='hidden';const r=el.getBoundingClientRect();popup.style.left=(r.left+r.width/2-130)+'px';popup.style.top=(r.top-popup.clientHeight-10)+'px';}
function closeHsPopup(){const p=document.getElementById('hsPopup');p.classList.remove('show');p.style.display='none';wrap.style.overflow='auto';}
function openAreaPopup(title,tip){closeHsPopup();document.getElementById('areaPopupTitle').textContent=title||'';const tipEl=document.getElementById('areaPopupTip');tipEl.textContent=tip||'';tipEl.innerHTML=parseLinks(tipEl.textContent);const p=document.getElementById('areaPopup');p.classList.add('show');p.style.display='flex';wrap.style.overflow='hidden';}
function closeAreaPopup(){document.getElementById('areaPopup').classList.remove('show');wrap.style.overflow='auto';}
function toggleMenu(){const gm=document.getElementById('gameMenu');const open=gm.classList.toggle('open');wrap.style.overflow=open?'hidden':'auto';if(open&&!window._cfgLoaded){window._cfgLoaded=true;buildMenu(_CFG);}}
function toggleSection(el){if(el.classList.contains('no-children'))return;el.classList.toggle('open');el.nextElementSibling.classList.toggle('open');}
function parseLinks2(t){return parseLinks(t);}
function buildItems(parent,items){(items||[]).forEach(item=>{const itObj=typeof item==='string'?{type:'text',emoji:'•',label:item}:item;if(itObj.type==='progress'){const v=Math.max(0,Math.min(100,itObj.value||0));const row=document.createElement('div');row.className='gm-progress-row';row.innerHTML='<span class="gm-progress-label">'+itObj.label+'</span><div class="gm-bar"><div class="gm-bar-fill" style="width:'+v+'%"></div></div><span class="gm-bar-pct">'+v+'%</span>';parent.appendChild(row);}else{const d=document.createElement('div');d.className='gm-item';d.innerHTML=parseLinks(itObj.label||'');parent.appendChild(d);}});}
function buildSubs(parent,children,depth){(children||[]).forEach(sub=>{const sw=document.createElement('div');sw.className='gm-section';sw.style.marginTop='6px';sw.style.marginLeft=(depth*8)+'px';const sh2=document.createElement('div');sh2.className='gm-section-hdr';const hasChildren=(sub.children&&sub.children.length>0);if(!hasChildren)sh2.classList.add('no-children');sh2.style.fontSize=(depth===0?'13px':'12px');const arrowSpan=hasChildren?'<span class="arrow">▼</span>':'';sh2.innerHTML='<span>'+sub.icon+'</span><span>'+sub.title+'</span>'+arrowSpan;sh2.onclick=()=>toggleSection(sh2);const sb=document.createElement('div');sb.className='gm-section-body';buildItems(sb,sub.items);buildSubs(sb,sub.children,depth+1);sw.appendChild(sh2);sw.appendChild(sb);parent.appendChild(sw);});}
function buildMenu(cfg){const ct=document.getElementById('gmContent');ct.innerHTML='';if(cfg.title){const t=document.createElement('div');t.style.cssText='font:16px/1 sans-serif;color:rgba(230,237,243,0.9);text-align:center;padding:0 0 12px;font-weight:600;';t.textContent=cfg.title;ct.appendChild(t);}(cfg.menu||[]).forEach(sec=>{const wrap2=document.createElement('div');wrap2.className='gm-section';const hdr=document.createElement('div');hdr.className='gm-section-hdr';const hasChildren=(sec.children&&sec.children.length>0);if(!hasChildren)hdr.classList.add('no-children');const arrowSpan=hasChildren?'<span class="arrow">▼</span>':'';hdr.innerHTML='<span>'+sec.icon+'</span><span>'+sec.title+'</span>'+arrowSpan;hdr.onclick=()=>toggleSection(hdr);const body=document.createElement('div');body.className='gm-section-body';buildItems(body,sec.items);buildSubs(body,sec.children,0);wrap2.appendChild(hdr);wrap2.appendChild(body);ct.appendChild(wrap2);});}
function toggleQuest(){const p=document.getElementById('questPopup');if(p)p.style.display=p.style.display==='block'?'none':'block';}
let _slCell={col:0,row:0},_slZoom=1;
function openSlPopup(col,row,cx,cy){_slCell={col,row};_slZoom=_snapZoom(scale);document.getElementById('slCoords').textContent='Col: '+col+'   Row: '+row;document.querySelectorAll('.slzBtn').forEach(b=>b.classList.toggle('on',b.dataset.z==_slZoom));const p=document.getElementById('spotLinkPopup');p.classList.add('show');p.style.display='flex';wrap.style.overflow='hidden';}
function closeSlPopup(){const p=document.getElementById('spotLinkPopup');p.classList.remove('show');p.style.display='';}
function setSlZoom(btn){_slZoom=+btn.dataset.z;document.querySelectorAll('.slzBtn').forEach(b=>b.classList.toggle('on',b===btn));}
function _snapZoom(z){const snaps=[0.5,1,2,3];return snaps.reduce((a,b)=>Math.abs(b-z)<Math.abs(a-z)?b:a);}
function copySlLink(){const base=window.location.href.split('#')[0];const link=base+'#spot='+_slCell.col+','+_slCell.row+','+_slZoom;const done=()=>{const p=document.getElementById('spotLinkPopup');if(navigator.clipboard){navigator.clipboard.writeText(link).then(done).catch(e=>_slFb(link));}else{_slFb(link);}};done();}
function _slFb(text){const ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;top:-9999px;left:-9999px;';document.body.appendChild(ta);ta.focus();ta.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);}
(function(){const TS2=${TS};let _ltTimer=null,_ltSuppress=false;wrap.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0],sx=t.clientX,sy=t.clientY;_ltTimer=setTimeout(()=>{if(_ltSuppress)return;const ix=(sx-wrap.getBoundingClientRect().left+wrap.scrollLeft)/scale,iy=(sy-wrap.getBoundingClientRect().top+wrap.scrollTop)/scale;const col=Math.floor(ix/TS2),row=Math.floor(iy/TS2);openSlPopup(col,row,sx,sy);},500);});wrap.addEventListener('touchend',e=>{clearTimeout(_ltTimer);});wrap.addEventListener('touchmove',e=>{if(Math.hypot(e.touches[0].clientX-wrap.getBoundingClientRect().left-wrap.scrollLeft,e.touches[0].clientY-wrap.getBoundingClientRect().top-wrap.scrollTop)>20)_ltSuppress=true;});})();
function applySpotHash(){const h=window.location.hash;if(!h.startsWith('#spot='))return;const parts=h.slice(6).split(',');if(parts.length<2)return;const col=parseInt(parts[0]),row=parseInt(parts[1]),z=parseFloat(parts[2])||1;applyScale(z,wrap.clientWidth/2,wrap.clientHeight/2);const cx=col*${TS}*z,cy=row*${TS}*z;wrap.scrollLeft=cx-wrap.clientWidth/2;wrap.scrollTop=cy-wrap.clientHeight/2;}
function applyAreaHash(){const h=window.location.hash;if(!h.startsWith('#area='))return;const title=decodeURIComponent(h.slice(6).replace(/\\+/g,' '));if(!title)return;function tryFit(n){const els=[...document.querySelectorAll('.hs-area[data-title="'+n+'"]')];if(!els.length)return false;let minX=Infinity,minY=Infinity,maxX=0,maxY=0;els.forEach(el=>{const ox=+el.dataset.ox,oy=+el.dataset.oy,ow=+el.dataset.ow,oh=+el.dataset.oh;minX=Math.min(minX,ox);minY=Math.min(minY,oy);maxX=Math.max(maxX,ox+ow);maxY=Math.max(maxY,oy+oh);});const cw=maxX-minX,ch=maxY-minY;const zx=wrap.clientWidth/cw,zy=wrap.clientHeight/ch;const z=Math.min(zx,zy,8);applyScale(z,wrap.clientWidth/2,wrap.clientHeight/2);wrap.scrollLeft=(minX+cw/2)*z-wrap.clientWidth/2;wrap.scrollTop=(minY+ch/2)*z-wrap.clientHeight/2;return true;}tryFit(title);}
window.addEventListener('load',()=>{applySpotHash();applyAreaHash();});
window.addEventListener('hashchange',()=>{applySpotHash();applyAreaHash();});
<\/script>
</body>
</html>`;
}

function _canvasRendererScript(TS) {
  return `(function(){const cfg=_CFG,TS=${TS},COLS=cfg.cols,ROWS=cfg.rows;const canvas=document.getElementById('mapImg');if(!canvas)return;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;function drawMap(){ctx.fillStyle='#111';ctx.fillRect(0,0,canvas.width,canvas.height);if(!cfg.map)return;for(let row=0;row<cfg.rows;row++){for(let col=0;col<cfg.cols;col++){const tid=cfg.map[row][col];if(tid){const t=cfg.custom.find(x=>x.id===tid);if(t&&t.src){const img=new Image();img.src=t.src;img.onload=()=>ctx.drawImage(img,col*TS,row*TS,TS,TS);}}}}}drawMap();})`;
}

// ── WINDOW BINDINGS ──
window.getMenuData    = getMenuData;
window.exportConfig   = exportConfig;
window.doExportHTML   = doExportHTML;
