// runtime.js — viewer zoom, pan, hotspots, popups, menu, dialogue, notifications
// injected inline by export-html.js assembler
// depends on: _CFG, _OBJS, _W, _H, _TS (set in viewer.html data block)

// ── zoom / pan ──
const wrap = document.getElementById('mapWrap'),
      inner = document.getElementById('mapInner'),
      sizer = document.getElementById('sizer');
let scale = 1;

function applyScale(s, ox, oy) {
  const prev = scale;
  scale = Math.max(0.2, Math.min(8, s));
  const ratio = scale / prev;
  wrap.scrollLeft = (wrap.scrollLeft + ox) * ratio - ox;
  wrap.scrollTop  = (wrap.scrollTop  + oy) * ratio - oy;
  inner.style.transform = 'scale(' + scale + ')';
  sizer.style.width  = (_W * scale) + 'px';
  sizer.style.height = (_H * scale) + 'px';
}

wrap.addEventListener('wheel', e => {
  e.preventDefault();
  const r = wrap.getBoundingClientRect();
  applyScale(scale * (e.deltaY < 0 ? 1.12 : 0.89), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });

let p0 = null, pDist = 0, pScale = 1;
wrap.addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    wrap.style.touchAction = 'none';
    p0 = e.touches[0];
    const p1 = e.touches[1];
    pDist = Math.hypot(p1.clientX - p0.clientX, p1.clientY - p0.clientY);
    pScale = scale;
    e.preventDefault();
  }
}, { passive: false });
wrap.addEventListener('touchmove', e => {
  if (e.touches.length === 2) {
    const a = e.touches[0], b = e.touches[1];
    const d = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const r = wrap.getBoundingClientRect();
    applyScale(pScale * (d / pDist), (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top);
    e.preventDefault();
  }
}, { passive: false });
wrap.addEventListener('touchend', e => {
  if (e.touches.length < 2) wrap.style.touchAction = 'pan-x pan-y';
}, { passive: true });

// ── link parser ──
function parseLinks(t) {
  let o = '', i = 0;
  while (i < t.length) {
    const s = t.indexOf('[[', i);
    if (s < 0) { o += t.slice(i); break; }
    o += t.slice(i, s);
    const e = t.indexOf(']]', s + 2);
    if (e < 0) { o += t.slice(s); break; }
    const inner2 = t.slice(s + 2, e);
    const p = inner2.indexOf('|');
    if (p < 0) { o += inner2; }
    else {
      const lbl = inner2.slice(0, p), url = inner2.slice(p + 1).trim();
      const safe = (url.startsWith('http') || url.startsWith('//') || url.startsWith('/')) ? url : '#';
      o += '<a href="' + safe + '" target="_blank" style="color:#58a6ff;">' + lbl + '</a>';
    }
    i = e + 2;
  }
  return o.replace(/\n/g, '<br>');
}
function parseLinks2(t) { return parseLinks(t); }

// ── hotspot click dispatcher ──
wrap.addEventListener('click', e => {
  if (e.target.closest('#menuBtn') || e.target.closest('#gameMenu')) return;
  const hs = e.target.closest('.hotspot');
  if (hs && !hs.classList.contains('no-interact')) {
    closeHsPopup(); closeAreaPopup();
    if (hs.classList.contains('hs-area')) {
      const t = hs.dataset.title || '', grp = hs.dataset.group || '';
      blinkAreasByGroupOrTitle(grp, t);
      if (t) openAreaPopup(t, hs.dataset.tooltip || '');
    } else {
      const oi = hs.dataset.oi;
      const objData = (oi != null && _OBJS[+oi]) ? _OBJS[+oi] : null;
      openHsPopup(hs, hs.dataset.title || '', hs.dataset.tooltip || '', objData);
    }
    return;
  }
  if (!e.target.closest('#hsPopup') && !e.target.closest('#areaPopup')) {
    closeHsPopup(); closeAreaPopup();
  }
});

// ── object marker blink ──
let _objBlinkRaf = null, _objBlinkMarker = null;
function _startObjBlink(el) {
  _stopObjBlink();
  _objBlinkMarker = el.querySelector('.hs-marker,.hs-dot');
  if (!_objBlinkMarker) return;
  let t = 0;
  function frame() {
    t += 0.06;
    const s = (1.2 + 0.3 * Math.sin(t * 3)).toFixed(2);
    const a = (0.7 + 0.3 * Math.sin(t * 3)).toFixed(2);
    _objBlinkMarker.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
    _objBlinkMarker.style.opacity = a;
    _objBlinkRaf = requestAnimationFrame(frame);
  }
  frame();
}
function _stopObjBlink() {
  if (_objBlinkRaf) { cancelAnimationFrame(_objBlinkRaf); _objBlinkRaf = null; }
  if (_objBlinkMarker) {
    _objBlinkMarker.style.transform = 'translate(-50%,-50%) scale(1)';
    _objBlinkMarker.style.opacity = '1';
    _objBlinkMarker = null;
  }
}

// ── popups ──
function closeHsPopup() {
  const p = document.getElementById('hsPopup');
  p.classList.remove('show'); p.style.display = 'none';
  wrap.style.overflow = 'auto'; _stopObjBlink();
}
function openAreaPopup(title, tip) {
  closeHsPopup();
  document.getElementById('areaPopupTitle').textContent = title || '';
  const tipEl = document.getElementById('areaPopupTip');
  tipEl.textContent = tip || ''; tipEl.style.display = tip ? '' : 'none';
  const pop = document.getElementById('areaPopup');
  const pw = Math.min(window.innerWidth * 0.88, 320);
  pop.style.cssText = 'left:' + ((window.innerWidth - pw) / 2) + 'px;top:' + Math.max(60, (window.innerHeight - 180) / 2) + 'px;max-width:' + pw + 'px;';
  pop.classList.add('show'); wrap.style.overflow = 'hidden';
}
function closeAreaPopup() {
  document.getElementById('areaPopup').classList.remove('show');
  wrap.style.overflow = 'auto';
}

// ── area blink outline ──
function _doBlink(els) {
  if (!els.length) return;
  const TS = _TS;
  const cells = new Set();
  els.forEach(el => {
    const ox = +el.dataset.ox, oy = +el.dataset.oy, ow = +el.dataset.ow, oh = +el.dataset.oh;
    for (let r = 0; r < Math.round(oh / TS); r++)
      for (let cc = 0; cc < Math.round(ow / TS); cc++)
        cells.add((Math.round(oy / TS) + r) + ',' + (Math.round(ox / TS) + cc));
  });
  const edges = [];
  cells.forEach(key => {
    const [r, cc] = key.split(',').map(Number);
    const px = cc * TS, py = r * TS;
    if (!cells.has(r + ',' + (cc - 1))) edges.push([px, py, px, py + TS]);
    if (!cells.has(r + ',' + (cc + 1))) edges.push([px + TS, py, px + TS, py + TS]);
    if (!cells.has((r - 1) + ',' + cc)) edges.push([px, py, px + TS, py]);
    if (!cells.has((r + 1) + ',' + cc)) edges.push([px, py + TS, px + TS, py + TS]);
  });
  if (!edges.length) return;
  const ov = document.createElement('canvas');
  ov.width = _W; ov.height = _H;
  ov.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:15;';
  inner.appendChild(ov);
  const ctx = ov.getContext('2d');
  ctx.lineWidth = 2; ctx.lineCap = 'square';
  function draw(alpha) {
    ctx.clearRect(0, 0, ov.width, ov.height);
    if (alpha <= 0) return;
    ctx.strokeStyle = 'rgba(255,220,80,' + alpha.toFixed(2) + ')';
    ctx.beginPath();
    edges.forEach(([x1, y1, x2, y2]) => { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); });
    ctx.stroke();
  }
  const PULSE_MS = 550; let start = null, phase = 0;
  function frame(ts) {
    if (!start) start = ts;
    const t = Math.min((ts - start) / PULSE_MS, 1);
    draw(phase % 2 === 0 ? t : 1 - t);
    if (t < 1) { requestAnimationFrame(frame); }
    else {
      phase++;
      if (phase < 6) { start = null; requestAnimationFrame(frame); }
      else { let fo = 1; (function fade() { fo -= 0.08; if (fo > 0) { draw(fo * 0.9); requestAnimationFrame(fade); } else { draw(0); ov.remove(); } })(); }
    }
  }
  requestAnimationFrame(frame);
}
function blinkAreasByGroupOrTitle(grp, title) {
  let els = grp ? [...document.querySelectorAll('.hs-area[data-group="' + grp + '"]')] : [];
  if (!els.length && title) els = [...document.querySelectorAll('.hs-area[data-title="' + title + '"]')];
  _doBlink(els);
}
function fitAreas(title) {
  const els = [...document.querySelectorAll('.hs-area[data-title="' + title + '"]')];
  if (!els.length) return;
  let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  els.forEach(el => {
    const ox = +el.dataset.ox, oy = +el.dataset.oy, ow = +el.dataset.ow, oh = +el.dataset.oh;
    minX = Math.min(minX, ox); minY = Math.min(minY, oy);
    maxX = Math.max(maxX, ox + ow); maxY = Math.max(maxY, oy + oh);
  });
  const PAD = 80, sw = wrap.clientWidth - PAD * 2, sh = wrap.clientHeight - PAD * 2;
  const z = Math.min(sw / (maxX - minX || 1), sh / (maxY - minY || 1), 4);
  applyScale(Math.max(0.2, z), wrap.clientWidth / 2, wrap.clientHeight / 2);
  const cx = (minX + (maxX - minX) / 2) * scale, cy = (minY + (maxY - minY) / 2) * scale;
  let n = 0;
  (function go() { wrap.scrollLeft = cx - wrap.clientWidth / 2; wrap.scrollTop = cy - wrap.clientHeight / 2; if (++n < 6) setTimeout(go, 120); })();
}

// ── game menu ──
function toggleMenu() {
  const gm = document.getElementById('gameMenu');
  const open = gm.classList.toggle('open');
  wrap.style.overflow = open ? 'hidden' : 'auto';
  if (open && !window._cfgLoaded) { window._cfgLoaded = true; buildMenu(_CFG); }
}
function toggleSection(el) { el.classList.toggle('open'); el.nextElementSibling.classList.toggle('open'); }
function buildItems(parent, items) {
  (items || []).forEach(item => {
    const itObj = typeof item === 'string' ? { type: 'text', emoji: '•', label: item } : item;
    if (itObj.type === 'progress') {
      const v = Math.max(0, Math.min(100, itObj.value || 0));
      const color = v > 60 ? '#4ade80' : v > 30 ? '#facc15' : '#f87171';
      const row = document.createElement('div'); row.className = 'gm-progress-row';
      const pfx = itObj.emoji ? itObj.emoji + ' ' : '';
      row.innerHTML = '<span class="gm-progress-label">' + pfx + itObj.label + '</span><div class="gm-bar"><div class="gm-bar-fill" style="width:' + v + '%;background:' + color + ';"></div></div><span class="gm-bar-pct">' + v + '%</span>';
      parent.appendChild(row);
    } else {
      const d = document.createElement('div'); d.className = 'gm-item';
      d.innerHTML = (itObj.emoji || '•') + ' ' + parseLinks(itObj.label || '');
      parent.appendChild(d);
    }
  });
}
function buildSubs(parent, children, depth) {
  (children || []).forEach(sub => {
    const hasChildren = (sub.children && sub.children.length > 0);
    if (!hasChildren) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 4px;';
      const ic = document.createElement('span'); ic.textContent = sub.icon || '📁'; ic.style.cssText = 'font-size:13px;';
      const ti = document.createElement('span'); ti.textContent = sub.title || ''; ti.style.cssText = 'font:12px/1.4 sans-serif;color:rgba(180,200,220,0.85);';
      row.appendChild(ic); row.appendChild(ti); parent.appendChild(row);
      if (sub.items && sub.items.length) {
        const il = document.createElement('div'); il.style.cssText = 'padding:0 4px 4px 22px;';
        buildItems(il, sub.items); parent.appendChild(il);
      }
      return;
    }
    const sw = document.createElement('div'); sw.className = 'gm-section';
    sw.style.marginTop = '6px'; sw.style.marginLeft = (depth * 8) + 'px';
    const sh2 = document.createElement('div'); sh2.className = 'gm-section-hdr';
    sh2.style.fontSize = (depth === 0 ? '13px' : '12px');
    sh2.innerHTML = '<span>' + (sub.icon || '📁') + '</span><span>' + sub.title + '</span><span class="arrow">▼</span>';
    sh2.onclick = () => toggleSection(sh2);
    const sb = document.createElement('div'); sb.className = 'gm-section-body';
    buildItems(sb, sub.items); buildSubs(sb, sub.children, depth + 1);
    sw.appendChild(sh2); sw.appendChild(sb); parent.appendChild(sw);
  });
}
function buildMenu(cfg) {
  const ct = document.getElementById('gmContent'); ct.innerHTML = '';
  if (cfg.title) {
    const t = document.createElement('div');
    t.style.cssText = 'font:16px/1 sans-serif;color:rgba(230,237,243,0.9);text-align:center;padding:0 0 12px;font-weight:600;';
    t.textContent = cfg.title; ct.appendChild(t);
  }
  (cfg.menu || []).forEach(sec => {
    const wrap2 = document.createElement('div'); wrap2.className = 'gm-section';
    const hasChildren = (sec.children && sec.children.length > 0);
    const hdr = document.createElement('div'); hdr.className = 'gm-section-hdr';
    hdr.innerHTML = '<span>' + (sec.icon || '📁') + '</span><span>' + sec.title + '</span>' + (hasChildren ? '<span class="arrow">▼</span>' : '');
    if (hasChildren) hdr.onclick = () => toggleSection(hdr);
    else { hdr.style.cursor = 'default'; hdr.style.padding = '5px 12px'; }
    const body = document.createElement('div'); body.className = 'gm-section-body';
    if (!hasChildren) { body.classList.add('open'); body.classList.add('compact'); }
    buildItems(body, sec.items); buildSubs(body, sec.children, 0);
    wrap2.appendChild(hdr); wrap2.appendChild(body); ct.appendChild(wrap2);
  });
}

// ── dialogue engine ──
const SUPA_URL_D = 'https://miqenmsgwkkmtxwwbxzo.supabase.co';
const SUPA_KEY_D = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pcWVubXNnd2trbXR4d3dieHpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMDc0NzYsImV4cCI6MjA5NDg4MzQ3Nn0.VfJgVoPC-ZbjlcuwMriYrNXb-3E2OgC92nOR9hOPgKI';
let _dlgNodes = {}, _dlgObj = null;

function _parseNodes(dialogue) {
  const nodes = {};
  (dialogue || []).forEach(n => { nodes[n.id] = n; });
  const first = dialogue && dialogue.length ? dialogue[0].id : null;
  return { nodes, first };
}
function _dlgShowNode(nodeId) {
  const node = _dlgNodes[nodeId]; if (!node) return;
  const body = document.getElementById('hsPopupBody');
  const btnWrap = document.getElementById('hsPopupBtns');
  if (btnWrap) { btnWrap.innerHTML = ''; btnWrap.classList.remove('visible'); }
  body.innerHTML = '';
  const txt = (node.text || '').replace(/\[\]/g, localStorage.getItem('mdelo_nick') || 'მოგზაური');
  _typewriterHTML(body, parseLinks(txt), 35, () => {
    if (!btnWrap) return;
    (node.buttons || []).forEach(btn => {
      if (!btn.label) return;
      const b = document.createElement('button');
      b.textContent = btn.label;
      b.style.cssText = 'width:100%;height:40px;background:rgba(22,27,34,0.2);border:1px solid rgba(88,166,255,0.4);color:#e6edf3;font-size:13px;border-radius:8px;cursor:pointer;text-align:center;';
      b.onclick = () => {
        if (btn.notify) {
          const sender = localStorage.getItem('mdelo_sender') || 'ანონიმი';
          const notifyTxt = btn.notifyText || (sender + ' — ' + btn.label);
          fetch(SUPA_URL_D + '/rest/v1/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY_D, 'Authorization': 'Bearer ' + SUPA_KEY_D, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ type: 'info', symbol: '💬', text: notifyTxt, sender: sender, linked_area: '' })
          }).catch(() => {});
        }
        if (btn.link) window.open(btn.link, '_blank');
        if (btn.nextNode && _dlgNodes[btn.nextNode]) { _dlgShowNode(btn.nextNode); }
        else { closeHsPopup(); }
      };
      btnWrap.appendChild(b);
    });
    setTimeout(() => { btnWrap.classList.add('visible'); }, 50);
  }, () => {
    const scroll = document.getElementById('hsPopupScroll');
    if (scroll) {
      const target = scroll.scrollHeight - scroll.clientHeight;
      const start = scroll.scrollTop, diff = target - start;
      if (diff <= 0) return;
      let t = 0; const dur = 150;
      const step = () => { t += 16; const p = Math.min(t / dur, 1); scroll.scrollTop = start + diff * (p < 0.5 ? 2 * p * p : (1 - (2 - 2 * p) * (2 - 2 * p) / 2)); if (t < dur) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
  });
}
function openHsPopup(el, title, raw, obj) {
  _dlgObj = obj || null;
  const popup = document.getElementById('hsPopup');
  document.getElementById('hsPopupTitle').textContent = title || '';
  document.getElementById('hsPopupBody').innerHTML = '';
  const bw = document.getElementById('hsPopupBtns');
  if (bw) bw.innerHTML = '';
  const pw = Math.min(window.innerWidth * 0.88, 360), left = (window.innerWidth - pw) / 2, top = Math.max(60, (window.innerHeight - 200) / 2);
  popup.style.cssText = 'display:block;left:' + left + 'px;top:' + top + 'px;max-width:' + pw + 'px;';
  popup.classList.add('show');
  wrap.style.overflow = 'hidden';
  if (el) _startObjBlink(el);
  if (obj && obj.dialogue && obj.dialogue.length > 0) {
    const parsed = _parseNodes(obj.dialogue);
    _dlgNodes = parsed.nodes;
    if (parsed.first) _dlgShowNode(parsed.first);
  } else {
    _typewriterHTML(document.getElementById('hsPopupBody'), parseLinks(raw || ''), 35);
  }
}

// ── typewriter ──
let _twTimer = null;
function _typewriter(el, text, speed, onDone) {
  if (_twTimer) { clearInterval(_twTimer); _twTimer = null; }
  el.textContent = '';
  if (!text) { if (onDone) onDone(); return; }
  let i = 0;
  _twTimer = setInterval(() => { el.textContent += text[i++]; if (i >= text.length) { clearInterval(_twTimer); _twTimer = null; if (onDone) onDone(); } }, speed);
}
function _twSpeed(type) {
  if (type === 'emergency' || type === 'danger') return 25;
  if (type === 'warning') return 45;
  return 35;
}
function _typewriterHTML(el, html, speed, onDone, onTick) {
  if (_twTimer) { clearInterval(_twTimer); _twTimer = null; }
  el.innerHTML = '';
  const tmp = document.createElement('div'); tmp.innerHTML = html;
  const nodes = Array.from(tmp.childNodes);
  let ni = 0, ci = 0, cur = null, _done = false;
  function next() {
    if (ni >= nodes.length) { if (!_done) { _done = true; if (onDone) onDone(); } return; }
    const node = nodes[ni];
    if (node.nodeType === 3) {
      if (!cur) { cur = document.createTextNode(''); el.appendChild(cur); }
      const full = node.textContent;
      if (ci < full.length) { cur.textContent += full[ci++]; if (onTick) onTick(); }
      else { ni++; ci = 0; cur = null; }
    } else { el.appendChild(node.cloneNode(true)); ni++; ci = 0; cur = null; if (onTick) onTick(); }
  }
  _twTimer = setInterval(() => { next(); if (ni >= nodes.length && !_done) { clearInterval(_twTimer); _twTimer = null; _done = true; if (onDone) onDone(); } }, speed);
}

// ── quest/legend ──
function toggleQuest() {
  const p = document.getElementById('questPopup'); if (!p) return;
  if (p.style.display === 'block') { p.style.display = 'none'; }
  else { p.style.display = 'block'; const full = p.dataset.full || (p.dataset.full = p.textContent); p.textContent = ''; _typewriter(p, full, 60); }
}

// ── spot link popup ──
let _slCell = { col: 0, row: 0 }, _slZoom = 1;
function openSlPopup(col, row, cx, cy) {
  _slCell = { col, row }; _slZoom = _snapZoom(scale);
  document.getElementById('slCoords').textContent = 'Col: ' + col + '   Row: ' + row;
  document.querySelectorAll('.slzBtn').forEach(b => b.classList.toggle('on', +b.dataset.z === _slZoom));
  const p = document.getElementById('spotLinkPopup');
  const pw = 200, ph = 130;
  let left = cx + 12, top = cy - ph / 2;
  left = Math.min(window.innerWidth - pw - 8, Math.max(8, left));
  top  = Math.max(8, Math.min(window.innerHeight - ph - 8, top));
  p.style.left = left + 'px'; p.style.top = top + 'px'; p.classList.add('show');
}
function closeSlPopup() { const p = document.getElementById('spotLinkPopup'); p.classList.remove('show'); p.style.display = ''; }
function setSlZoom(btn) { _slZoom = +btn.dataset.z; document.querySelectorAll('.slzBtn').forEach(b => b.classList.toggle('on', b === btn)); }
function _snapZoom(z) { const snaps = [0.5, 1, 2, 3]; return snaps.reduce((a, b) => Math.abs(b - z) < Math.abs(a - z) ? b : a); }
function copySlLink() {
  const base = window.location.href.split('#')[0];
  const link = base + '#spot=' + _slCell.col + ',' + _slCell.row + ',' + _slZoom;
  const done = () => {
    const p = document.getElementById('spotLinkPopup'), btn = p.querySelector('.slCopy'), orig = btn.textContent;
    btn.textContent = '✓ დაკოპირდა!'; setTimeout(() => { btn.textContent = orig; closeSlPopup(); }, 900);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(link).then(done).catch(() => { _slFb(link); done(); }); }
  else { _slFb(link); done(); }
}
function _slFb(text) { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;'; document.body.appendChild(ta); ta.focus(); ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); }

// ── long-press for spot link ──
(function () {
  const TS2 = _TS;
  let _ltTimer = null, _ltSuppress = false;
  wrap.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0], sx = t.clientX, sy = t.clientY;
    _ltTimer = setTimeout(() => {
      _ltTimer = null; _ltSuppress = true;
      const rect = wrap.getBoundingClientRect();
      const mx = sx - rect.left + wrap.scrollLeft, my = sy - rect.top + wrap.scrollTop;
      openSlPopup(Math.max(0, Math.floor(mx / (TS2 * scale))), Math.max(0, Math.floor(my / (TS2 * scale))), sx, sy);
    }, 600);
  }, { passive: true });
  wrap.addEventListener('touchmove', e => { if (_ltTimer) { clearTimeout(_ltTimer); _ltTimer = null; } }, { passive: true });
  wrap.addEventListener('touchend', e => {
    if (_ltTimer) { clearTimeout(_ltTimer); _ltTimer = null; }
    if (_ltSuppress) { _ltSuppress = false; e.preventDefault && e.preventDefault(); }
  }, { passive: false });
  wrap.addEventListener('click', e => { if (document.getElementById('spotLinkPopup').classList.contains('show')) { if (!e.target.closest('#spotLinkPopup')) closeSlPopup(); } });
})();

// ── hash navigation ──
function applySpotHash() {
  const h = window.location.hash;
  if (!h.startsWith('#spot=')) return;
  const parts = h.slice(6).split(',');
  if (parts.length < 2) return;
  const col = parseInt(parts[0]), row = parseInt(parts[1]), z = parts.length >= 3 ? parseFloat(parts[2]) : 1;
  if (isNaN(col) || isNaN(row) || isNaN(z)) return;
  scale = Math.max(0.2, Math.min(8, z));
  inner.style.transform = 'scale(' + scale + ')';
  sizer.style.width  = (_W * scale) + 'px';
  sizer.style.height = (_H * scale) + 'px';
  const sx = Math.max(0, col * _TS * scale - wrap.clientWidth  / 2);
  const sy = Math.max(0, row * _TS * scale - wrap.clientHeight / 2);
  let n = 0;
  (function go() { wrap.scrollLeft = sx; wrap.scrollTop = sy; if (++n < 8) setTimeout(go, 150); })();
}
function applyAreaHash() {
  const h = window.location.hash;
  if (!h.startsWith('#area=')) return;
  const title = decodeURIComponent(h.slice(6).replace(/\+/g, ' '));
  if (!title) return;
  function tryFit(n) {
    const els = document.querySelectorAll('.hs-area[data-title="' + title + '"]');
    if (els.length) { fitAreas(title); return; }
    if (n > 0) setTimeout(() => tryFit(n - 1), 300);
  }
  setTimeout(() => tryFit(10), 200);
}

// ── notifications ──
const SUPA_URL = 'https://miqenmsgwkkmtxwwbxzo.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pcWVubXNnd2trbXR4d3dieHpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMDc0NzYsImV4cCI6MjA5NDg4MzQ3Nn0.VfJgVoPC-ZbjlcuwMriYrNXb-3E2OgC92nOR9hOPgKI';
window.SUPABASE_URL = SUPA_URL; window.SUPABASE_ANON_KEY = SUPA_KEY; window.MDELO_ROOM_ID = 'mdelo-chat';
const TYPE_LABELS = { info: 'ინფო', warning: 'გაფრთხილება', danger: 'საფრთხე', emergency: 'განგაში', done: 'მზადაა', project: 'პროექტი' };
let _notifs = [], _curNotif = null;

async function loadNotifs() {
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/notifications?order=created_at.desc&limit=20', { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY } });
    if (!r.ok) return;
    _notifs = await r.json(); renderNotifBar();
    if (navigator.setAppBadge && _notifs.length) { navigator.setAppBadge(_notifs.length); }
    else if (navigator.clearAppBadge) { navigator.clearAppBadge(); }
  } catch (e) {}
}
function renderNotifBar() {
  const bar = document.getElementById('notifBar'); if (!bar) return;
  bar.innerHTML = ''; if (!_notifs.length) return;
  const MAX = 4;
  _notifs.slice(0, MAX).forEach(n => {
    const c = document.createElement('div');
    c.className = 'ncard' + (n.type === 'emergency' ? ' pulse' : '');
    c.dataset.type = n.type || 'info'; c.title = n.text || ''; c.textContent = n.symbol || '💬';
    c.onclick = () => openNotifPopup(n);
    // ── long tap → delete ──
    let _lt = null;
    c.addEventListener('touchstart', e => {
      _lt = setTimeout(() => {
        _lt = null;
        if (navigator.vibrate) navigator.vibrate(40);
        _ncardDeleteConfirm(c, n);
      }, 600);
    }, { passive: true });
    c.addEventListener('touchmove',  () => { if (_lt) { clearTimeout(_lt); _lt = null; } }, { passive: true });
    c.addEventListener('touchend',   () => { if (_lt) { clearTimeout(_lt); _lt = null; } }, { passive: true });
    bar.appendChild(c);
  });
  if (_notifs.length > MAX) {
    const more = document.createElement('div');
    more.style.cssText = 'width:44px;height:44px;border-radius:10px;background:rgba(13,17,23,0.65);backdrop-filter:blur(8px);border:1px solid #30363d;color:#8b949e;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0.82;';
    more.textContent = '+' + (_notifs.length - MAX); more.onclick = () => openNotifList(); bar.appendChild(more);
  }
}

function _ncardDeleteConfirm(card, n) {
  const type = n.type || 'info';

  // emergency — დაბლოკილი
  if (type === 'emergency') {
    const ov = _ncardOverlay(card, '🔒', '#8b949e');
    setTimeout(() => ov.remove(), 1200);
    return;
  }

  // danger / warning — confirm dialog
  if (type === 'danger' || type === 'warning') {
    const ov = _ncardOverlay(card, '?', { danger: '#fb8f44', warning: '#f0a500' }[type]);
    ov.style.flexDirection = 'column';
    ov.style.gap = '4px';
    ov.innerHTML = '';
    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:10px;color:#fff;text-align:center;';
    msg.textContent = 'წაიშალოს?';
    const yes = document.createElement('button');
    yes.style.cssText = 'background:#f85149;border:none;color:#fff;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;';
    yes.textContent = 'კი';
    const no = document.createElement('button');
    no.style.cssText = 'background:#30363d;border:none;color:#ccc;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;';
    no.textContent = 'არა';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;';
    row.appendChild(yes); row.appendChild(no);
    ov.appendChild(msg); ov.appendChild(row);
    yes.addEventListener('click', async e => { e.stopPropagation(); await _ncardDoDelete(ov, n); });
    no.addEventListener('click',  e => { e.stopPropagation(); ov.remove(); });
    return;
  }

  // info / done / project — პირდაპირ წაშლა
  const ov = _ncardOverlay(card, '🗑', '#f85149');
  ov.addEventListener('click', async e => { e.stopPropagation(); await _ncardDoDelete(ov, n); });
  setTimeout(() => {
    function cancel(e) { if (!card.contains(e.target)) { ov.remove(); document.removeEventListener('touchstart', cancel); } }
    document.addEventListener('touchstart', cancel, { passive: true });
  }, 100);
}

function _ncardOverlay(card, icon, color) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:absolute;inset:0;border-radius:10px;background:' + color + 'dd;display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;z-index:2;';
  ov.textContent = icon;
  card.style.position = 'relative';
  card.appendChild(ov);
  return ov;
}

async function _ncardDoDelete(ov, n) {
  ov.textContent = '…';
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/notifications?id=eq.' + n.id, {
      method: 'DELETE',
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY }
    });
    if (r.ok) await loadNotifs();
    else ov.remove();
  } catch (e) { ov.remove(); }
}
function _startRealtime() {
  if (typeof supabase === 'undefined') return;
  try {
    const client = supabase.createClient(SUPA_URL, SUPA_KEY);
    client.channel('notif-live').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => loadNotifs()).subscribe();
  } catch (e) {}
}
function openNotifPopup(n) {
  _curNotif = n;
  const p = document.getElementById('notifPopup');
  p.style.setProperty('--nc', { info: '#58a6ff', warning: '#f0a500', danger: '#fb8f44', emergency: '#f85149', done: '#4ade80', project: '#c084fc' }[n.type] || '#58a6ff');
  document.getElementById('npType').textContent = (TYPE_LABELS[n.type] || n.type).toUpperCase();
  document.getElementById('npSender').textContent = n.sender ? ('👤 ' + n.sender) : '';
  const textEl = document.getElementById('npText'); textEl.textContent = '';
  const detEl = document.getElementById('npDetail'); detEl.style.display = 'none'; detEl.textContent = '';
  const ar = document.getElementById('npArea'); ar.style.display = 'none';
  const spd = _twSpeed(n.type);
  _typewriter(textEl, n.text || '', spd, () => { if (n.detail) { detEl.style.display = 'block'; _typewriter(detEl, n.detail, spd); } });
  if (n.linked_area) { ar.style.display = 'block'; ar.textContent = '🗺 ' + n.linked_area + ' — რუკაზე ნახვა →'; }
  const pw = Math.min(window.innerWidth * 0.9, 360);
  p.style.cssText = 'display:block;left:' + ((window.innerWidth - pw) / 2) + 'px;bottom:72px;max-width:' + pw + 'px;';
  p.classList.add('show');
}
function openNotifList() {
  closeNotifPopup();
  const p = document.getElementById('notifPopup');
  p.style.setProperty('--nc', '#58a6ff');
  document.getElementById('npType').textContent = 'ყველა შეტყობინება';
  document.getElementById('npSender').textContent = '';
  const body = document.getElementById('npText'); body.innerHTML = '';
  _notifs.forEach(n => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(48,54,61,0.4);cursor:pointer;';
    row.innerHTML = '<span style="font-size:16px;">' + (n.symbol || '💬') + '</span><span style="font-size:12px;color:#e6edf3;flex:1;">' + (n.text || '') + '</span>';
    row.onclick = () => openNotifPopup(n); body.appendChild(row);
  });
  document.getElementById('npDetail').textContent = ''; document.getElementById('npDetail').style.display = 'none';
  document.getElementById('npArea').style.display = 'none';
  const pw = Math.min(window.innerWidth * 0.9, 360);
  p.style.cssText = 'display:block;left:' + ((window.innerWidth - pw) / 2) + 'px;bottom:72px;max-width:' + pw + 'px;';
  p.classList.add('show');
}
function closeNotifPopup() { const p = document.getElementById('notifPopup'); p.classList.remove('show'); p.style.display = 'none'; }
function goToArea() {
  if (!_curNotif || !_curNotif.linked_area) return;
  closeNotifPopup();
  const title = _curNotif.linked_area;
  const els = document.querySelectorAll('.hs-area[data-title="' + title + '"]');
  if (els.length) { fitAreas(title); blinkAreasByGroupOrTitle('', title); }
  else {
    const hs = document.querySelector('.hotspot[data-title="' + title + '"]');
    if (hs) { const ox = +hs.dataset.ox, oy = +hs.dataset.oy; wrap.scrollLeft = ox * scale - wrap.clientWidth / 2; wrap.scrollTop = oy * scale - wrap.clientHeight / 2; }
  }
}

// ── init ──
window.addEventListener('load', () => {
  loadNotifs();
  _startRealtime();
  applySpotHash();
  applyAreaHash();
  _tmInit();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      if ('periodicSync' in reg) { reg.periodicSync.register('notif-check', { minInterval: 5 * 60 * 1000 }).catch(() => {}); }
      setInterval(() => { if (reg.active) reg.active.postMessage('CHECK_NOTIFS'); }, 5 * 60 * 1000);
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'NOTIF_UPDATE') loadNotifs(); });
  }
});
window.addEventListener('hashchange', () => { applySpotHash(); applyAreaHash(); });
