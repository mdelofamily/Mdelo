// terminal.js — viewer terminal + /commands
// injected inline by export-html.js assembler
// depends on: _CFG, scale (runtime.js), applyScale, fitAreas, toggleMenu (runtime.js)

function _tmInit() {
  if (!window.matchMedia('(display-mode: standalone)').matches) return;
  document.getElementById('termBtn').style.display = 'block';
  document.getElementById('mapTitle').style.display = 'none';
}

var _tmOpen = false, _tmFull = false, _tmHist = [], _tmHIdx = -1, _tmHCur = '', _tmMulti = false;
var _tmBooted = false;
var _tmEditObj = null; // title of object currently being edited in DSL mode
var _TMCMDS = ['/დახმარება','/გასუფთავება','/ინფო','/მასშტაბი','/ზონები','/ობიექტები','/დიალოგი','/წასვლა','/ლეგენდა','/მენიუ','/სრული','/ისტორია','/ვადა','/ტექსტი','/დახურვა','/nick','/me','/who','/color','/help'];

function toggleTerm() { _tmOpen ? closeTerm() : _tmOpen_(); }
function _tmOpen_() {
  _tmOpen = true;
  document.getElementById('mdlTerm').classList.add('open');
  setTimeout(function () { document.getElementById('tmIn').focus(); }, 240);
  if (!_tmBooted) { _tmBooted = true; _tmBoot(); }
}
function closeTerm() {
  // cancel edit mode silently on close
  if (_tmEditObj) { _tmEditObj = null; document.getElementById('tmTa').value = ''; if (_tmMulti) tmToggleMulti(); }
  _tmOpen = false; _tmFull = false;
  var t = document.getElementById('mdlTerm');
  t.classList.remove('open', 'tmfull');
  document.getElementById('tmFullBtn').classList.remove('on');
  document.getElementById('tmFullBtn').textContent = '⛶';
}
function tmToggleFull() {
  _tmFull = !_tmFull;
  document.getElementById('mdlTerm').classList.toggle('tmfull', _tmFull);
  var b = document.getElementById('tmFullBtn');
  b.classList.toggle('on', _tmFull); b.textContent = _tmFull ? '⊟' : '⛶';
}
function tmClear() { document.getElementById('tmOut').innerHTML = ''; }

// ── chat history (localStorage, 3 days) ──
var _HIST_TTL = 3 * 24 * 60 * 60 * 1000;
var _HIST_KEY = 'mdelo_chat_' + (_CFG && _CFG.title ? _CFG.title.replace(/[^a-zA-Z0-9ა-ჿ]/g, '_') : 'map');
var _HIST_TTL_KEY = _HIST_KEY + '_ttl';
var _HIST_MAX = 300;
(function () { try { var s = localStorage.getItem(_HIST_TTL_KEY); if (s) { var n = parseInt(s); if (n >= 1 && n <= 365) _HIST_TTL = n * 86400000; } } catch (e) {} })();

function _histSave(html) {
  try {
    var raw = localStorage.getItem(_HIST_KEY);
    var msgs = raw ? JSON.parse(raw) : [];
    msgs.push({ h: html, t: Date.now() });
    var cut = Date.now() - _HIST_TTL;
    msgs = msgs.filter(function (m) { return m.t > cut; });
    if (msgs.length > _HIST_MAX) msgs = msgs.slice(-_HIST_MAX);
    localStorage.setItem(_HIST_KEY, JSON.stringify(msgs));
  } catch (e) {}
}

function _histLoad() {
  try {
    var raw = localStorage.getItem(_HIST_KEY);
    if (!raw) return;
    var msgs = JSON.parse(raw);
    var cut = Date.now() - _HIST_TTL;
    msgs = msgs.filter(function (m) { return m.t > cut; });
    if (!msgs.length) return;
    var ago = Math.round((Date.now() - msgs[0].t) / 3600000);
    _tmL('tdm', '── ისტორია (' + ago + ' სთ წინ) ──');
    msgs.forEach(function (m) { _tmLH('chat hist', m.h); });
    _tmL('tdm', '────────────────────────────────');
  } catch (e) {}
}

function _histClear() {
  try { localStorage.removeItem(_HIST_KEY); } catch (e) {}
  _tmL('tok', 'ისტორია წაიშალა');
}

// ── multiline (chat/edit) mode ──
function tmToggleMulti() {
  _tmMulti = !_tmMulti;
  var btn   = document.getElementById('tmMlBtn');
  var inp   = document.getElementById('tmIn');
  var ta    = document.getElementById('tmTa');
  var hint  = document.getElementById('tmHint');
  var slash = document.getElementById('tmSlashBtn');
  var send  = document.getElementById('tmSendBtn');
  btn.textContent = _tmMulti ? '■' : '□';
  btn.classList.toggle('on', _tmMulti);
  inp.style.display   = _tmMulti ? 'none'  : '';
  hint.style.display  = _tmMulti ? 'none'  : '';
  slash.style.display = _tmMulti ? 'none'  : '';
  ta.style.display    = _tmMulti ? 'block' : 'none';
  send.style.display  = _tmMulti ? 'block' : 'none';
  if (_tmMulti) {
    ta.style.height = '44px';
    ta.style.maxHeight = '88px';
    ta.style.overflowY = 'auto';
  } else {
    ta.style.height = '';
  }
  setTimeout(function () { (_tmMulti ? ta : inp).focus(); }, 50);
}

function _tmTaResize(ta) {
  ta = ta || document.getElementById('tmTa');
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

// ── send handler (shared by button and Ctrl+Enter) ──
function tmSend() {
  var ta = document.getElementById('tmTa');
  var v = ta.value.trim(); if (!v) return;

  // DSL edit mode intercept — don't treat as chat
  if (_tmEditObj) { _tmSaveDlg(v); return; }

  _tmHist.unshift(v); _tmHIdx = -1; _tmHCur = '';
  ta.value = '';
  if (typeof chatHandleInput === 'function' && chatHandleInput(v)) return;
  _tmL('ti', v); _tmRun(v);
}

// textarea keydown (multiline + edit mode)
(function () {
  var ta = document.getElementById('tmTa');
  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); tmSend(); }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (_tmEditObj) { _tmEditCancel(); }
      else { closeTerm(); }
    }
  });
  ta.addEventListener('input', function () { if (_tmMulti) _tmTaResize(ta); });
})();


function _tmL(cls, txt) {
  var d = document.createElement('div'); d.className = 'tl ' + cls; d.textContent = txt;
  var o = document.getElementById('tmOut'); o.appendChild(d); o.scrollTop = o.scrollHeight;
}
function _tmLH(cls, html) {
  var d = document.createElement('div'); d.className = 'tl ' + cls; d.innerHTML = html;
  var o = document.getElementById('tmOut'); o.appendChild(d); o.scrollTop = o.scrollHeight;
  if (cls === 'chat') _histSave(html);
}

// public API — other scripts can print to terminal
window.consolePrint = function (html, type) { _tmLH('chat', html); };
window.consoleClear = tmClear;

// ── boot message ──
function _tmBoot() {
  var d = _CFG;
  var objs  = document.querySelectorAll('.hotspot:not(.hs-area):not(.no-interact)').length;
  var areas = document.querySelectorAll('.hs-area').length;
  var lines = [
    ['tsy', 'MDELO — ტერმინალი'],
    ['tdm', '────────────────────────────────'],
    ['tnf', 'რუკა: ' + (d.title || 'უსახელო') + '   ' + d.cols + 'x' + d.rows],
    ['tnf', 'ობიექტები: ' + objs + '   ზონები: ' + areas],
    ['tdm', '"/დახმარება" — ბრძანების სია'],
    ['tdm', '────────────────────────────────']
  ];
  for (var i = 0; i < lines.length; i++) {
    (function (l, delay) { setTimeout(function () { _tmL(l[0], l[1]); }, delay); })(lines[i], i * 55);
  }
  setTimeout(_histLoad, lines.length * 55 + 80);
}

// ── keyboard input ──
(function () {
  var inp = document.getElementById('tmIn');
  var hint = document.getElementById('tmHint');
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var v = inp.value.trim(); if (!v) return;
      _tmHist.unshift(v); _tmHIdx = -1; _tmHCur = '';
      var _isChat = v.charAt(0) !== '/' && typeof chatHandleInput === 'function';
      if (!_isChat) _tmL('ti', v);
      inp.value = ''; hint.textContent = '';
      _tmRun(v);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (_tmHIdx === -1) _tmHCur = inp.value;
      _tmHIdx = Math.min(_tmHIdx + 1, _tmHist.length - 1);
      inp.value = _tmHist[_tmHIdx] || '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      _tmHIdx = Math.max(_tmHIdx - 1, -1);
      inp.value = _tmHIdx === -1 ? _tmHCur : _tmHist[_tmHIdx];
    } else if (e.key === 'Tab') {
      e.preventDefault();
      var v2 = inp.value.trim();
      var m = _TMCMDS.find(function (c) { return c.startsWith(v2) && c !== v2; });
      if (m) { inp.value = m; hint.textContent = ''; }
    } else if (e.key === 'Backspace' && inp.value === '' && _tmHist.length) {
      e.preventDefault(); inp.value = _tmHist[0]; _tmHIdx = 0;
    } else if (e.key === 'Escape') { closeTerm(); }
  });
  inp.addEventListener('input', function () {
    var v = inp.value.trim();
    var m = _TMCMDS.find(function (c) { return c.startsWith(v) && c !== v; });
    hint.textContent = m ? m.slice(v.length) : '';
  });
})();

// ── global keyboard shortcuts ──
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && _tmOpen) { closeTerm(); return; }
  if ((e.key === '`' || e.key === '~') && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    e.preventDefault(); toggleTerm();
  }
});

var _SEP = '────────────────────────────────';

function tmInsertSlash() {
  var inp = document.getElementById('tmIn');
  if (inp.value.charAt(0) !== '/') inp.value = '/' + inp.value;
  inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
}

// ── command router ──
function _tmRun(raw) {
  var text = raw.trim();
  if (text.charAt(0) !== '/') {
    if (typeof chatHandleInput === 'function' && chatHandleInput(text)) return;
    _tmL('ter', 'ბრძანებები იწყება "/" — მაგ.: /დახმარება');
    return;
  }
  var parts = text.slice(1).split(/\s+/), cmd = parts[0], args = parts.slice(1);
  var map = {
    'დახმარება':   _tmHelp,
    'გასუფთავება': tmClear,
    'ინფო':        _tmInfo,
    'მასშტაბი':    _tmZoom,
    'ზონები':      _tmAreas,
    'ობიექტები':   _tmObjects,
    'დიალოგი':     _tmDlgEdit,
    'წასვლა':      _tmGo,
    'ლეგენდა':     _tmLegend,
    'მენიუ':       _tmMenu,
    'სრული':       tmToggleFull,
    'ისტორია':     _histClear,
    'ვადა':        _tmVada,
    'ტექსტი':      tmToggleMulti,
    'დახურვა':     closeTerm
  };
  var fn = map[cmd];
  if (fn) { fn(args); return; }
  if (typeof chatHandleInput === 'function' && chatHandleInput(text)) return;
  _tmL('ter', 'უცნობი ბრძანა: "/' + cmd + '" — სცადე: /დახმარება');
}

// ── built-in commands ──
function _tmHelp() {
  var list = [
    ['/დახმარება',        'ბრძანების სია'],
    ['/გასუფთავება',      'კონსოლის გასუფთავება'],
    ['/ინფო',             'რუკის ინფორმაცია'],
    ['/მასშტაბი [N]',     'zoom 0.25–6'],
    ['/ზონები',           'ზონების სია'],
    ['/ობიექტები',        'ობიექტები + dialogue სტატუსი'],
    ['/დიალოგი [სახელი]', 'DSL რედაქტირება · Ctrl+Enter შესანახად'],
    ['/წასვლა [N]',       'ზონაზე ნავიგაცია'],
    ['/ლეგენდა',          'აღწერას ჩვენა/დამალვა'],
    ['/მენიუ',            'მენიუს toggle'],
    ['/სრული',            'სრული ↔ ნახევარი'],
    ['/ისტორია',          'ჩატის ისტორიის წაშლა'],
    ['/ვადა [N]',         'ისტ. შენახვა N დღე'],
    ['/ტექსტი',           'ჩატ ↔ ბრძანება mode'],
    ['/დახურვა',          'დახურვა  [Esc]'],
    ['/nick სახელი',      'ნიკნეიმის შეცვლა'],
    ['/me ტექსტი',        '* აქშნის მესიჯი'],
    ['/who',              'ონლაინ სია'],
    ['/color #hex',       'ნიკნეიმის ფერი']
  ];
  _tmL('tdm', _SEP); _tmL('tsy', '--- ბრძანები ---');
  for (var i = 0; i < list.length; i++) {
    var c = list[i][0], d = list[i][1];
    var pad = c; while (pad.length < 24) pad += ' ';
    _tmL('tnf', pad + d);
  }
  _tmL('tdm', 'Tab — ავტოდასრულება   ↑↓ — ისტორია');
  _tmL('tdm', 'ტექსტი "/" გარეშე → ჩატის მესიჯი');
  _tmL('tdm', _SEP);
}
function _tmInfo() {
  var d = _CFG;
  var objs  = document.querySelectorAll('.hotspot:not(.hs-area):not(.no-interact)').length;
  var areas = document.querySelectorAll('.hs-area').length;
  _tmL('tdm', _SEP);
  _tmL('tnf', 'სახელი:    ' + (d.title || 'უსახელო'));
  _tmL('tnf', 'ზომა:       ' + d.cols + ' × ' + d.rows + ' სექტორი');
  _tmL('tnf', 'zoom:       ' + scale.toFixed(2) + 'x');
  _tmL('tnf', 'ობიექტები: ' + objs);
  _tmL('tnf', 'ზონები:    ' + areas);
  _tmL('tdm', _SEP);
}
function _tmZoom(args) {
  var n = parseFloat(args[0]);
  if (isNaN(n) || n < 0.25 || n > 6) { _tmL('ter', 'მასშტაბი: 0.25–6 შორის'); return; }
  applyScale(n, wrap.clientWidth / 2, wrap.clientHeight / 2);
  _tmL('tok', 'მასშტაბი: ' + n + 'x');
}
function _tmAreas() {
  var els = document.querySelectorAll('.hs-area');
  if (!els.length) { _tmL('tdm', 'ზონები: ცარიელია'); return; }
  var seen = {}; _tmL('tdm', _SEP);
  els.forEach(function (el) { var t = el.dataset.title; if (t && !seen[t]) { seen[t] = 1; _tmL('tnf', '▸ ' + t); } });
  _tmL('tdm', _SEP); _tmL('tdm', 'გამოიყენე: წასვლა [სახელი]');
}

function _tmObjects() {
  var els = document.querySelectorAll('.hotspot:not(.hs-area):not(.no-interact)');
  if (!els.length) { _tmL('tdm', 'ობიექტები: ცარიელია'); return; }
  _tmL('tdm', _SEP);
  _tmL('tsy', 'ობიექტები  [/დიალოგი სახელი — რედაქტირება]');
  els.forEach(function (el) {
    var title = el.dataset.title || '(უსახელო)';
    var oi = el.dataset.oi;
    var obj = (oi != null && typeof _OBJS !== 'undefined' && _OBJS[+oi]) ? _OBJS[+oi] : null;
    var displayName = (obj && obj.lb) ? obj.lb : title;
    var suffix = '';
    if (obj && obj.dialogue && obj.dialogue.length) {
      suffix = ' [💬 ' + obj.dialogue.length + ']';
    }
    _tmL('tnf', '◆ ' + displayName + suffix);
  });
  _tmL('tdm', _SEP);
}

function _tmGo(args) {
  var label = args.join(' ').trim();
  if (!label) { _tmL('ter', 'გამოყენება: წასვლა [ზონის სახელი]'); return; }
  var els = document.querySelectorAll('.hs-area[data-title="' + label + '"]');
  if (!els.length) { _tmL('ter', 'ზონა ვერ მოიძებნა: "' + label + '"'); return; }
  fitAreas(label); closeTerm();
}
function _tmLegend() { toggleQuest(); _tmL('tok', 'ლეგენდა: toggled'); }
function _tmMenu() { closeTerm(); toggleMenu(); }
function _tmVada(args) {
  var n = parseInt(args[0]);
  if (!args.length || isNaN(n) || n < 1 || n > 365) {
    var cur = Math.round(_HIST_TTL / 86400000);
    _tmL('tnf', 'ამჟამინდელი ვადა: ' + cur + ' დღე');
    _tmL('tdm', 'გამოყენება: /ვადა [1–365]');
    return;
  }
  _HIST_TTL = n * 86400000;
  try { localStorage.setItem(_HIST_TTL_KEY, String(n)); } catch (e) {}
  _tmL('tok', 'ისტორიის ვადა: ' + n + ' დღე');
}

// ── dialogue DSL editor ──

// Open DSL edit mode for an object
function _tmDlgEdit(args) {
  var title = args.join(' ').trim();
  if (!title) {
    _tmL('ter', 'გამოყენება: /დიალოგი [ობიექტის სახელი]');
    _tmL('tdm', 'სია: /ობიექტები');
    return;
  }

  // verify object exists — try data-title first, then obj.lb (renamed objects)
  var hs = document.querySelector('.hotspot[data-title="' + title.replace(/"/g, '\\"') + '"]:not(.hs-area):not(.no-interact)');
  if (!hs && typeof _OBJS !== 'undefined') {
    for (var _i = 0; _i < _OBJS.length; _i++) {
      if (_OBJS[_i] && _OBJS[_i].lb === title) {
        var _c = document.querySelector('.hotspot[data-oi="' + _i + '"]:not(.hs-area):not(.no-interact)');
        if (_c) { hs = _c; break; }
      }
    }
  }
  if (!hs) {
    _tmL('ter', 'ობიექტი ვერ მოიძებნა: "' + title + '"');
    _tmL('tdm', 'სია: /ობიექტები');
    return;
  }

  // get current DSL (from override or embedded dialogue)
  // always use data-title as Supabase key — not lb (which may differ after rename)
  var objKey = hs.dataset.title;
  var dsl = '';
  if (typeof dlgGetCurrentDsl === 'function') dsl = dlgGetCurrentDsl(objKey);

  // fallback template if no dialogue exists yet
  if (!dsl) {
    dsl = '@0 ' + ((_OBJS && _OBJS[+hs.dataset.oi] && _OBJS[+hs.dataset.oi].lb) || objKey) + '\n\n<> \n\n-> ';
  }

  // switch to multiline mode and load DSL
  if (!_tmMulti) tmToggleMulti();
  document.getElementById('tmTa').value = dsl;
  _tmTaResize();
  _tmEditObj = objKey;

  _tmL('tsy', '─── ' + ((_OBJS && _OBJS[+hs.dataset.oi] && _OBJS[+hs.dataset.oi].lb) || objKey) + ' — DSL ──────────────');
  _tmL('tdm', 'Ctrl+Enter — შენახვა · Esc — გაუქმება');
}

// Cancel edit mode without saving
function _tmEditCancel() {
  var title = _tmEditObj;
  _tmEditObj = null;
  document.getElementById('tmTa').value = '';
  if (_tmMulti) tmToggleMulti();
  _tmL('tdm', title + ' — გაუქმდა');
}

// Save DSL to Supabase and patch _OBJS locally
async function _tmSaveDlg(dsl) {
  var title = _tmEditObj;

  if (typeof parseBulkDSL !== 'function') {
    _tmL('ter', '✗ bulk-parser.js არ არის ჩატვირთული');
    return;
  }

  var result;
  try {
    // strip #? / #! headers before passing to parseBulkDSL
    var _dslClean = (typeof parseUnlockHeaders === 'function') ? parseUnlockHeaders(dsl).dsl.trim() : dsl;
    result = parseBulkDSL(_dslClean || '@0\n');
  } catch (e) {
    _tmL('ter', '✗ DSL შეცდომა: ' + e.message);
    return;
  }

  // parseBulkDSL may return array or { nodes, title, marker }
  var nodes  = Array.isArray(result) ? result : (result && result.nodes ? result.nodes : []);
  var marker = (!Array.isArray(result) && result && result.marker != null) ? result.marker : undefined;
  if (!nodes.length) {
    _tmL('ter', '✗ DSL: კვანძები ვერ მოიძებნა — შეამოწმე ფორმატი');
    return;
  }

  _tmL('tdm', '↑ ' + title + ' — ვინახავ...');

  if (typeof dlgOverrideSave !== 'function') {
    _tmL('ter', '✗ dlgOverrideSave ვერ მოიძებნა (runtime.js?)');
    return;
  }

  var ok = false, okResult = null;
  try {
    okResult = await dlgOverrideSave(title, nodes, dsl); ok = okResult === true;
  } catch (e) {
    _tmL('ter', '✗ Supabase: ' + e.message);
    return;
  }

  if (ok) {
    _tmEditObj = null;
    document.getElementById('tmTa').value = '';
    if (_tmMulti) tmToggleMulti();
    _tmL('tok', title + ' — შენახულია ✓  (ყველა viewer განახლდება)');
  } else {
    var _em = okResult && okResult.msg ? ('HTTP ' + okResult.status + ': ' + okResult.msg) : 'უცნობი';
    _tmL('ter', '✗ Supabase ' + _em);
    _tmL('tdm', 'DSL textarea-ში რჩება, შეგიძლია კვლავ სცადო');
  }
}
