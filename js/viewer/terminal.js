// terminal.js — viewer terminal + /commands
// injected inline by export-html.js assembler
// depends on: _CFG, scale (runtime.js), applyScale, fitAreas, toggleMenu (runtime.js), menuOverrideSave (runtime.js)

function _tmInit() {
  if (!window.matchMedia('(display-mode: standalone)').matches) return;
  document.getElementById('termBtn').style.display = 'block';
  document.getElementById('mapTitle').style.display = 'none';
}

var _tmOpen = false, _tmFull = false, _tmHist = [], _tmHIdx = -1, _tmHCur = '', _tmMulti = false;
var _tmBooted = false;
var _tmEditObj = null; // title of object currently being edited in DSL mode
var _TMCMDS = ['/დახმარება','/გასუფთავება','/ინფო','/მასშტაბი','/ზონები','/ობიექტები','/დიალოგი','/წასვლა','/ლეგენდა','/მენიუ','/სრული','/ისტორია','/ვადა','/ტექსტი','/დახურვა','/flag','/nick','/me','/who','/color','/help','/pwd','/ls','/cd','/md','/rm','/edit','/ფოთოლი'];

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
    'დახურვა':     closeTerm,
    'flag':        _tmFlag,
    'pwd':         _tmMenuPwd,
    'ls':          _tmMenuLs,
    'cd':          _tmMenuCd,
    'md':          _tmMenuMd,
    'rm':          _tmMenuRm,
    'edit':        _tmMenuEdit,
    'ფოთოლი':      _tmMenuLeaf
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
    ['/flag set/clear/list', 'flag სისტემა'],
    ['/nick სახელი',      'ნიკნეიმის შეცვლა'],
    ['/me ტექსტი',        '* აქშნის მესიჯი'],
    ['/who',              'ონლაინ სია'],
    ['/color #hex',       'ნიკნეიმის ფერი'],
    ['/pwd',              'მენიუს მიმდინარე გზა'],
    ['/ls',               'მენიუს კვანძის შემცველობა'],
    ['/cd [სახელი|..|/]', 'მენიუში ნავიგაცია'],
    ['/md <სახელი>',      'ახალი ქვე-სექცია + ავტო-cd'],
    ['/ფოთოლი ტექსტი|ინდიკატორი', 'item-ის დამატება მიმდინარე კვანძში'],
    ['/rm <სახელი|N>',    'სექციის (სახელით) ან item-ის (ინდექსით) წაშლა'],
    ['/edit <N> <...>',   'item-ის [N] შინაარსის რედაქტირება']
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

// ── /flag command ──
// Usage:
//   /flag set <name>    — set a flag
//   /flag clear <name>  — clear a flag
//   /flag check <name>  — check if flag is set
//   /flag list          — list all set flags
//   /flag reset         — clear all flags
function _tmFlag(args) {
  var sub = (args[0] || '').toLowerCase();
  var name = args.slice(1).join(' ').trim();

  if (typeof window._flagSet !== 'function') {
    _tmL('ter', '/flag: flag სისტემა არ არის ჩატვირთული (runtime.js?)'); return;
  }

  if (sub === 'set') {
    if (!name) { _tmL('ter', 'გამოყენება: /flag set <სახელი>'); return; }
    window._flagSet(name);
    _tmL('tok', '▸ flag სეტი: ' + name);
  } else if (sub === 'clear') {
    if (!name) { _tmL('ter', 'გამოყენება: /flag clear <სახელი>'); return; }
    window._flagClear(name);
    _tmL('tok', '▸ flag წაიშალა: ' + name);
  } else if (sub === 'check') {
    if (!name) { _tmL('ter', 'გამოყენება: /flag check <სახელი>'); return; }
    var val = window._flagCheck(name);
    _tmL(val ? 'tok' : 'tnf', '▸ ' + name + ': ' + (val ? '✓ სეტია' : '✗ არ არის სეტი'));
  } else if (sub === 'list') {
    var flags = window._flagList();
    _tmL('tdm', _SEP);
    if (!flags.length) { _tmL('tdm', 'flag-ები: ცარიელია'); }
    else { _tmL('tsy', 'სეტი flag-ები (' + flags.length + '):'); flags.forEach(function(f) { _tmL('tnf', '  ▸ ' + f); }); }
    _tmL('tdm', _SEP);
  } else if (sub === 'reset') {
    window._flagReset();
    _tmL('tok', '▸ ყველა flag გასუფთავდა');
  } else {
    _tmL('tdm', _SEP);
    _tmL('tsy', '/flag ბრძანებები:');
    _tmL('tnf', '  set <name>   — flag-ის სეტი');
    _tmL('tnf', '  clear <name> — flag-ის წაშლა');
    _tmL('tnf', '  check <name> — flag-ის შემოწმება');
    _tmL('tnf', '  list         — ყველა flag-ის სია');
    _tmL('tnf', '  reset        — ყველა flag-ის გასუფთავება');
    _tmL('tdm', _SEP);
  }
}

// ── menu CLI — filesystem-style navigation/editing over _CFG.menu ──
// State lives only in the terminal session (Pure CLI State): navigating with
// /cd never touches the burger menu's own drill-down UI/state (_gmCfg/_gmShowPanel).
// Mutations (/md, /ფოთოლი, /rm) DO mutate _CFG.menu in place — the same object
// the burger menu reads from — and are pushed to Supabase via menuOverrideSave
// (runtime.js) so every viewer sees them on next page load.
var _tmMenuStack = []; // array of node refs, root = []

function _tmMenuCwdNode() { return _tmMenuStack.length ? _tmMenuStack[_tmMenuStack.length - 1] : null; }
function _tmMenuCwdList() {
  var n = _tmMenuCwdNode();
  if (!n) { if (!_CFG.menu) _CFG.menu = []; return _CFG.menu; }
  if (!n.children) n.children = [];
  return n.children;
}
function _tmMenuPathStr() {
  var parts = _tmMenuStack.map(function (n) { return n.title || '(უსახელო)'; });
  return 'root' + (parts.length ? '/' + parts.join('/') : '');
}

function _tmMenuPwd() { _tmL('tnf', _tmMenuPathStr()); }

function _tmMenuLs() {
  var node  = _tmMenuCwdNode();
  var list  = _tmMenuCwdList();
  var items = node ? (node.items || []) : [];
  _tmL('tdm', _SEP);
  _tmL('tsy', _tmMenuPathStr());
  if (!list.length && !items.length) _tmL('tdm', '(ცარიელია)');
  list.forEach(function (n) {
    var hasKids = (n.children && n.children.length) || (n.items && n.items.length);
    _tmL('tnf', (n.icon || '📁') + ' ' + (n.title || '(უსახელო)') + (hasKids ? '/' : ''));
  });
  items.forEach(function (it, idx) {
    var itObj = typeof it === 'string' ? { type: 'text', emoji: '•', label: it } : it;
    if (itObj.type === 'progress') {
      _tmL('tnf', '  [' + idx + '] ინდიკატორი: "' + (itObj.label || '') + '" (' + (itObj.value != null ? itObj.value : 0) + '%)');
    } else {
      var lbl = (itObj.label || '').replace(/\n/g, ' ');
      if (lbl.length > 60) lbl = lbl.slice(0, 60) + '…';
      _tmL('tnf', '  [' + idx + '] ტექსტი: "' + lbl + '"');
    }
  });
  _tmL('tdm', _SEP);
}

function _tmMenuCd(args) {
  var name = args.join(' ').trim();
  if (!name || name === '/') { _tmMenuStack = []; _tmL('tok', _tmMenuPathStr()); return; }
  if (name === '..') {
    if (!_tmMenuStack.length) { _tmL('tnf', 'უკვე root-ში ხარ'); return; }
    _tmMenuStack.pop(); _tmL('tok', _tmMenuPathStr()); return;
  }
  var list  = _tmMenuCwdList();
  var found = list.find(function (n) { return (n.title || '').trim() === name; });
  if (!found) { _tmL('ter', 'ვერ მოიძებნა: "' + name + '"'); _tmL('tdm', 'სია: /ls'); return; }
  _tmMenuStack.push(found);
  _tmL('tok', _tmMenuPathStr());
}

async function _tmMenuMd(args) {
  var name = args.join(' ').trim();
  if (!name) { _tmL('ter', 'გამოყენება: /md <სახელი>'); return; }
  var parent = _tmMenuCwdNode();
  var list   = _tmMenuCwdList();
  if (list.find(function (n) { return (n.title || '').trim() === name; })) {
    _tmL('ter', 'უკვე არსებობს: "' + name + '"'); return;
  }
  var node = { id: 'nd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), icon: '📁', title: name, items: [], children: [] };
  list.push(node);
  _tmMenuStack.push(node);
  _tmL('tok', '+ ' + name + '  →  ' + _tmMenuPathStr());
  await _tmMenuSaveNode(node.id, { parent_id: parent ? parent.id : null, icon: node.icon, title: node.title, items_json: [] });
}

async function _tmMenuLeaf(args) {
  var sub  = (args[0] || '').trim();
  var node = _tmMenuCwdNode();
  if (!node) { _tmL('ter', 'root-ში ფოთლები არ შეიძლება — /cd <სახელი> შედი სექციაში'); return; }

  if (sub === 'ტექსტი') {
    var text = args.slice(1).join(' ').trim();
    if (!text) { _tmL('ter', 'გამოყენება: /ფოთოლი ტექსტი <ტექსტი>'); return; }
    if (!node.items) node.items = [];
    node.items.push({ type: 'text', emoji: '•', label: text });
    _tmL('tok', '+ [' + (node.items.length - 1) + '] ტექსტი დაემატა');
    await _tmMenuSaveNode(node.id, { items_json: node.items });
  } else if (sub === 'ინდიკატორი') {
    var rest   = args.slice(1);
    var pct    = parseInt(rest[rest.length - 1]);
    var hasPct = !isNaN(pct) && rest.length > 1;
    var label  = (hasPct ? rest.slice(0, -1) : rest).join(' ').trim();
    if (!label) { _tmL('ter', 'გამოყენება: /ფოთოლი ინდიკატორი <სახელი> <%>'); return; }
    var val = hasPct ? Math.max(0, Math.min(100, pct)) : 100;
    if (!node.items) node.items = [];
    node.items.push({ type: 'progress', emoji: '📊', label: label, value: val });
    _tmL('tok', '+ [' + (node.items.length - 1) + '] ინდიკატორი დაემატა (' + val + '%)');
    await _tmMenuSaveNode(node.id, { items_json: node.items });
  } else {
    _tmL('tdm', _SEP);
    _tmL('tsy', '/ფოთოლი ბრძანებები:');
    _tmL('tnf', '  ტექსტი <ტექსტი>         — ტექსტური item');
    _tmL('tnf', '  ინდიკატორი <სახელი> <%> — progress item');
    _tmL('tdm', _SEP);
  }
}

async function _tmMenuRm(args) {
  var arg = (args[0] || '').trim();
  if (!arg) { _tmL('ter', 'გამოყენება: /rm <სახელი>  ან  /rm <ინდექსი>'); return; }
  var node     = _tmMenuCwdNode();
  var isIndex  = /^\d+$/.test(arg);

  if (isIndex) {
    var idx = parseInt(arg);
    if (!node) { _tmL('ter', 'root-ში items არ არსებობს'); return; }
    if (!node.items || !node.items[idx]) { _tmL('ter', 'item [' + idx + '] ვერ მოიძებნა — /ls'); return; }
    node.items.splice(idx, 1);
    _tmL('tok', '✗ item [' + idx + '] წაიშალა');
    await _tmMenuSaveNode(node.id, { items_json: node.items });
  } else {
    var list = _tmMenuCwdList();
    var fIdx = list.findIndex(function (n) { return (n.title || '').trim() === arg; });
    if (fIdx < 0) { _tmL('ter', 'ვერ მოიძებნა: "' + arg + '" — /ls'); return; }
    var removed = list[fIdx];
    list.splice(fIdx, 1);
    _tmL('tok', '✗ "' + arg + '" — სექცია წაიშალა (ქვე-შემცველობასთან ერთად)');
    await _tmMenuSaveNode(removed.id, { deleted: true });
  }
}

// Edit an existing item in place by index.
//   /edit <N> <ახალი ტექსტი>         — text item: ცვლის label-ს მთლიანად
//   /edit <N> <ახალი ტექსტი> <%>     — progress item: ცვლის label-სა და value-ს ერთად
//   /edit <N> <%>                    — progress item: ცვლის მხოლოდ value-ს, label ხელუხლებელია
async function _tmMenuEdit(args) {
  var node = _tmMenuCwdNode();
  if (!node) { _tmL('ter', 'root-ში items არ არსებობს'); return; }
  var idx = parseInt(args[0]);
  if (isNaN(idx) || !node.items || !node.items[idx]) {
    _tmL('ter', 'გამოყენება: /edit <ინდექსი> <ახალი შინაარსი> — სია: /ls');
    return;
  }
  var rest = args.slice(1);
  if (!rest.length) { _tmL('ter', 'გამოყენება: /edit <ინდექსი> <ახალი შინაარსი>'); return; }

  var itObj = typeof node.items[idx] === 'string' ? { type: 'text', emoji: '•', label: node.items[idx] } : node.items[idx];

  if (itObj.type === 'progress') {
    var lastIsNum = /^\d+$/.test(rest[rest.length - 1]);
    var label = (lastIsNum ? rest.slice(0, -1) : rest).join(' ').trim();
    if (lastIsNum) itObj.value = Math.max(0, Math.min(100, parseInt(rest[rest.length - 1])));
    if (label) itObj.label = label;
  } else {
    itObj.label = rest.join(' ').trim();
  }

  node.items[idx] = itObj;
  _tmL('tok', '✎ [' + idx + '] განახლდა');
  await _tmMenuSaveNode(node.id, { items_json: node.items });
}

// Partial upsert into menu_overrides — only the given fields get written/replaced server-side.
async function _tmMenuSaveNode(nodeId, fields) {
  if (typeof window.menuOverrideSave !== 'function') {
    _tmL('ter', '✗ menuOverrideSave ვერ მოიძებნა (runtime.js?)');
    return;
  }
  var res = await window.menuOverrideSave(nodeId, fields);
  if (res !== true) {
    var em = res && res.msg ? ('HTTP ' + res.status + ': ' + res.msg) : 'უცნობი';
    _tmL('ter', '✗ Supabase: ' + em);
  }
}
