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
var _tmEditObj = null;     // truthy sentinel while an edit session is open (dlg objKey, or menu node id)
var _tmEditMode = null;    // 'dlg' | 'menuItem' | null
var _tmEditMenuCtx = null; // { node, idx, type } — set only when _tmEditMode === 'menuItem'
var _tmEditBuf = null;     // raw content buffered from a chain segment, consumed by /შეყვანა
var _tmEditLabel = null;   // human-readable label shown in cancel/header messages
var _TMCMDS = ['/დახმარება','/გასუფთავება','/ინფო','/მასშტაბი','/ზონები','/ობიექტები','/დიალოგი','/წასვლა','/ლეგენდა','/მენიუ','/გახსნა','/შეყვანა','/სრული','/ისტორია','/ვადა','/ტექსტი','/შეტყობინება','/marker','/დახურვა','/flag','/nick','/me','/who','/color','/help','/pwd','/ls','/cd','/md','/rm','/edit','/ფოთოლი','/macro','/იზივეი'];

function toggleTerm() { _tmOpen ? closeTerm() : _tmOpen_(); }
function _tmOpen_() {
  _tmOpen = true;
  document.getElementById('mdlTerm').classList.add('open');
  setTimeout(function () { document.getElementById('tmIn').focus(); }, 240);
  if (!_tmBooted) { _tmBooted = true; _tmBoot(); }
}
function closeTerm() {
  // cancel edit mode silently on close
  if (_tmEditObj) { _tmEditObj = null; _tmEditMode = null; _tmEditMenuCtx = null; _tmEditLabel = null; _tmEditBuf = null; document.getElementById('tmTa').value = ''; if (_tmMulti) tmToggleMulti(); }
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

  // DSL/menu-item/legend edit mode intercept — don't treat as chat
  if (_tmEditObj) {
    if (_tmEditMode === 'menuItem') { _tmSaveMenuItem(v); return; }
    if (_tmEditMode === 'legend')   { _tmSaveLegend(v); return; }
    _tmSaveDlg(v); return;
  }

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

// ── command registry (incremental migration target) ──────────────────────
// Schema per top-level entry:
//   {
//     params: [...], desc: "...", handler: fn   // no sub-actions
//   }
//   OR
//   {
//     subs: {
//       <subName>: { params: [...], desc: "...", handler: fn },
//       ...
//     }
//   }
// `handler` is always called as handler(args) — args is the same space-split
// array the old `map[cmd](args)` dispatch already passed. Commands that
// delegate to another module with a different signature (e.g. /flag →
// unlockHandleCmd) get a thin wrapper here so every registry handler shares
// one calling convention, regardless of what runs underneath.
//
// MIGRATION STATE: registry intentionally starts EMPTY. Nothing has been
// moved out of the legacy `map` object inside _tmRun yet — this commit only
// wires up the registry data structure + lookup + dispatcher fallback so the
// pattern can be verified before any real command moves. See
// COMMAND_REGISTRY_SCOPE_INSTRUCTION.md for the full migration plan.
var COMMAND_REGISTRY = {
  // /flag set|clear|del|check|list|ls|reset <სახელი?> — fully delegates to
  // unlock.js's unlockHandleCmd, which already does its own sub-action
  // switch + arg-join internally (parts[1]=sub, parts.slice(2)=arg). Registry
  // intentionally does NOT expose sub-actions here (see Step 2 design
  // decision: single source of truth stays in unlock.js, matching its own
  // header comment). The wrapper only re-prepends the literal "flag" head
  // unlockHandleCmd expects, exactly as the old _tmFlagDelegate did.
  flag: {
    params: [], // unlockHandleCmd parses its own sub-action + arg from the array
    desc: 'flag სისტემა — set/clear/check/list/reset',
    // Multi-row /help override — mirrors unlock.js's own header-comment list
    // of sub-actions exactly (single source of truth stays in unlock.js;
    // this is just its help-row mirror, same Variant A pattern as elsewhere).
    helpLines: [
      ['/flag set <სახელი>',   'flag-ის დაყენება'],
      ['/flag clear <სახელი>', 'flag-ის წაშლა'],
      ['/flag check <სახელი>', 'flag-ის შემოწმება'],
      ['/flag list',           'ყველა flag-ის სია'],
      ['/flag reset',          'ყველა flag-ის გასუფთავება']
    ],
    // Izivei picker hint (IZIVEI_SCOPE design Q2): manually curated parallel
    // to helpLines above — each `sub` becomes its own structured picker row
    // with its own param-schema, since internal dispatch (unlockHandleCmd)
    // doesn't expose sub-actions through the flat `params` array. Must be
    // kept in sync by hand alongside helpLines — same accepted trade-off.
    izivei: [
      { sub: 'set',   params: [{ name: 'სახელი', type: 'text' }] },
      { sub: 'clear', params: [{ name: 'სახელი', type: 'text' }] },
      { sub: 'check', params: [{ name: 'სახელი', type: 'text' }] },
      { sub: 'list',  params: [] },
      { sub: 'reset', params: [] }
    ],
    handler: function (args) {
      if (typeof unlockHandleCmd !== 'function') {
        _tmL('ter', '/flag: unlock.js არ არის ჩატვირთული'); return;
      }
      return unlockHandleCmd(['flag'].concat(args));
    }
  },

  // ── Step 3: filesystem-style menu navigation (pwd/ls/cd/md/rm/edit/ფოთოლი) ──
  // All seven are thin pass-throughs to their existing _tmMenu* handlers —
  // same args array shape the old map[cmd](args) dispatch already used.
  // No behavior change; this step only moves the lookup, not the logic.

  pwd: {
    params: [],
    desc: 'მიმდინარე მენიუ-მდებარეობის გამოტანა',
    handler: function (args) { return _tmMenuPwd(); } // takes no args itself
  },

  ls: {
    params: [],
    desc: 'მიმდინარე მდებარეობის შემცველობის ჩამონათვალი',
    handler: function (args) { return _tmMenuLs(); } // takes no args itself
  },

  cd: {
    params: [
      { name: 'სახელი|..|/|a/b/c', type: 'text', desc: 'სექციის სახელი, ".." ან slash-path ("/a/b", "a/b")' }
    ],
    desc: 'მენიუში გადასვლა — სახელით, ".."-ით root-ზე/მშობელზე ასასვლელად, ან slash-path-ით',
    handler: function (args) { return _tmMenuCd(args); }
  },

  md: {
    params: [
      { name: 'სახელი', type: 'text', desc: 'ახალი სექციის სახელი' },
      { name: 'ემოჯი', type: 'text', optional: true, desc: 'ემოჯი (default 📁)' }
    ],
    desc: 'ახალი ქვე-სექციის შექმნა მიმდინარე მდებარეობაში',
    handler: function (args) { return _tmMenuMd(args); }
  },

  rm: {
    params: [
      { name: 'სახელი|N', type: 'text', desc: 'სექციის სახელი ან item-ის რიცხვითი ინდექსი' }
    ],
    desc: 'სექციის ან item-ის წაშლა (სახელით ან ინდექსით)',
    handler: function (args) { return _tmMenuRm(args); }
  },

  edit: {
    params: [
      { name: 'N', type: 'number', desc: 'item-ის ინდექსი (/ls-ში ნანახი)' },
      { name: '...', type: 'text', optional: true, multiline: true,
        desc: 'ახალი ტექსტი/% — თუ გამოტოვებული, იხსნება multiline editor' }
    ],
    desc: 'item-ის შემცველობის რედაქტირება ინდექსით — inline ან multiline editor-ით',
    handler: function (args) { return _tmMenuEdit(args); }
  },

  // /ფოთოლი keeps its own internal sub-action switch (ტექსტი/ინდიკატორი),
  // exactly mirroring the /flag → unlockHandleCmd pattern (Variant A):
  // a single registry entry, no `subs` block, internal dispatch untouched.
  'ფოთოლი': {
    params: [], // _tmMenuLeaf parses its own sub-action (ტექსტი/ინდიკატორი) + args
    desc: 'item-ის დამატება მიმდინარე სექციაში — ტექსტი/ინდიკატორი',
    helpLines: [
      ['/ფოთოლი ტექსტი|ინდიკატორი [ემოჯი]', 'item-ის დამატება მიმდინარე კვანძში']
    ],
    // Izivei picker hint — both sub-actions take an optional leading emoji
    // plus their own content shape: ტექსტი is free text, ინდიკატორი is a
    // numeric value (rendered as the progress bar _gmOpenOverlay draws).
    izivei: [
      { sub: 'ტექსტი',      params: [
        { name: 'ემოჯი', type: 'text', optional: true },
        { name: 'ტექსტი', type: 'text', multiline: true }
      ] },
      { sub: 'ინდიკატორი',  params: [
        { name: 'ემოჯი', type: 'text', optional: true },
        { name: 'სახელი', type: 'text' },
        { name: 'მნიშვნელობა', type: 'number' }
      ] }
    ],
    handler: function (args) { return _tmMenuLeaf(args); }
  },

  // ── Step 4: დახმარება ──
  // NOTE: _tmHelp's command list is still a hardcoded static array at this
  // point — auto-generating it FROM the registry is a separate, later step
  // (scope item 5) that only makes sense once migration is complete and the
  // registry actually contains every command. This step only moves the
  // *lookup* for /დახმარება itself into the registry; the list contents are
  // untouched.
  'დახმარება': {
    params: [],
    desc: 'ბრძანების სია',
    handler: function (args) { return _tmHelp(); } // takes no args itself
  },

  // ── Step 5: გასუფთავება ──
  'გასუფთავება': {
    params: [],
    desc: 'კონსოლის გასუფთავება',
    handler: function (args) { return tmClear(); } // takes no args itself
  },

  // ── Step 6: 14 simple commands, migrated as one batch ──
  // All thin pass-throughs to existing handlers — same args array shape the
  // legacy map[cmd](args) dispatch already used. No behavior change.

  'ინფო': {
    params: [],
    desc: 'რუკის ინფორმაცია',
    handler: function (args) { return _tmInfo(); } // takes no args itself
  },

  'მასშტაბი': {
    params: [
      { name: 'N', type: 'number', desc: 'zoom დონე 0.25–6' }
    ],
    desc: 'zoom 0.25–6',
    handler: function (args) { return _tmZoom(args); }
  },

  'ზონები': {
    params: [],
    desc: 'ზონების სია',
    handler: function (args) { return _tmAreas(); } // takes no args itself
  },

  'ობიექტები': {
    params: [],
    desc: 'ობიექტები + dialogue სტატუსი',
    handler: function (args) { return _tmObjects(); } // takes no args itself
  },

  'დიალოგი': {
    params: [
      { name: 'სახელი', type: 'text', optional: true, desc: 'ობიექტის სახელი' }
    ],
    desc: 'DSL რედაქტირება · Ctrl+Enter შესანახად',
    handler: function (args) { return _tmDlgEdit(args); }
  },

  'წასვლა': {
    params: [
      { name: 'N', type: 'text', desc: 'ზონის სახელი' }
    ],
    desc: 'ზონაზე ნავიგაცია',
    handler: function (args) { return _tmGo(args); }
  },

  // /ლეგენდა keeps its own internal sub-action check (რედაქტირება/edit),
  // same Variant A pattern as /flag and /ფოთოლი: single entry, no `subs`
  // block, internal dispatch in _tmLegend untouched.
  'ლეგენდა': {
    params: [], // _tmLegend parses its own optional sub-action (რედაქტირება/edit)
    desc: 'აღწერას ჩვენა/დამალვა · "რედაქტირება" — მთავარი ლეგენდის ტექსტი',
    helpLines: [
      ['/ლეგენდა',            'აღწერას ჩვენა/დამალვა'],
      ['/ლეგენდა რედაქტირება', 'მთავარი ლეგენდის ტექსტის რედაქტირება']
    ],
    // Izivei picker hint — plain toggle has no sub/params; რედაქტირება opens
    // the multiline legend editor, modeled as a single multiline text param
    // (mirrors what _tmLegendEditOpen + _tmSaveLegend actually do).
    izivei: [
      { sub: null,            params: [] },
      { sub: 'რედაქტირება',  params: [{ name: 'ტექსტი', type: 'text', multiline: true }] }
    ],
    handler: function (args) { return _tmLegend(args); }
  },

  'გახსნა': {
    params: [],
    desc: 'ტერმინალის გახსნა (macro/window hook-ისთვის)',
    handler: function (args) { return _tmOpenCmd(); } // takes no args itself
  },

  'შეყვანა': {
    params: [],
    desc: 'Enter/Send — ღია edit-სესიის submit (macro-chain-ისთვის)',
    handler: function (args) { return _tmSubmitCmd(); } // takes no args itself
  },

  'სრული': {
    params: [],
    desc: 'სრული ↔ ნახევარი',
    handler: function (args) { return tmToggleFull(); } // takes no args itself
  },

  'ისტორია': {
    params: [],
    desc: 'ჩატის ისტორიის წაშლა',
    handler: function (args) { return _histClear(); } // takes no args itself
  },

  'ვადა': {
    params: [
      { name: 'N', type: 'number', optional: true, desc: 'შენახვის ვადა დღეებში (1–365)' }
    ],
    desc: 'ისტ. შენახვა N დღე',
    handler: function (args) { return _tmVada(args); }
  },

  'ტექსტი': {
    params: [],
    desc: 'ჩატ ↔ ბრძანება mode',
    handler: function (args) { return tmToggleMulti(); } // takes no args itself
  },

  'დახურვა': {
    params: [],
    desc: 'დახურვა [Esc]',
    handler: function (args) { return closeTerm(); } // takes no args itself
  },

  // ── Step 7: marker ──
  // /marker set|reset keeps its own internal sub-action switch (same pattern
  // as /flag → unlockHandleCmd and /ლეგენდა → _tmLegend): single entry, no
  // `subs` block, _tmMarkerCmd does its own args[0]=sub / args.slice(1)=rest
  // extraction exactly as before. Local-only (localStorage), per-device —
  // unrelated to Supabase-synced notification/menu overrides.
  marker: {
    params: [], // _tmMarkerCmd parses its own sub-action (set/reset) + rest
    desc: 'set|reset <სახელი> [?|!|~|-] — ლოკალური მარკერი (მხ. ეს device)',
    helpLines: [
      ['/marker set <სახელი> ?/!/~/-', 'მარკერი — ლოკალური (მხ. შენ)'],
      ['/marker reset [სახელი]',       'მარკერი → საწყისზე (ერთი ან ყველა)']
    ],
    // Izivei picker hint — set takes a name + a select of the 4 marker chars;
    // reset's name is optional (omitted clears all), matching helpLines above.
    izivei: [
      { sub: 'set',   params: [
        { name: 'სახელი', type: 'text' },
        { name: 'მარკერი', type: 'select', options: ['?', '!', '~', '-'] }
      ] },
      { sub: 'reset', params: [
        { name: 'სახელი', type: 'text', optional: true }
      ] }
    ],
    handler: function (args) { return _tmMarkerCmd(args); }
  },

  // ── Step 8: macro ──
  // /macro has two different things living behind args[0]: a literal
  // sub-action (ls/rm), OR the scope word (local/საერთო) of a `:=` assignment
  // — _tmMacro tells them apart itself by re-joining the raw args and looking
  // for ":=" before treating args[0] as scope. This doesn't fit a clean
  // registry `subs` split (ls/rm aren't peers of local/საერთო — they're a
  // separate branch entirely), so same Variant A approach as /flag, /marker,
  // /ლეგენდა: one entry, no `subs`, full args array passed through untouched.
  macro: {
    params: [], // _tmMacro parses ls / rm <scope> <name> / <scope> <name> := cmd;cmd... itself
    desc: 'local|საერთო <სახელი> := cmd1;cmd2... · ls · rm local|საერთო <სახელი>',
    helpLines: [
      ['/macro local <სახელი> := ...',  'პერსონალური შორთკატის შექმნა'],
      ['/macro საერთო <სახელი> := ...', 'გაზიარებული შორთკატის შექმნა'],
      ['/macro ls',                     'ყველა შორთკატის სია'],
      ['/macro rm local|საერთო <სახელი>', 'შორთკატის წაშლა']
    ],
    // Izivei picker hint — `local`/`საერთო` both take name + a multiline
    // chain body (the ";"-joined command list _tmMacro splits itself); `ls`
    // has no params; `rm` takes a scope select + name, matching the rm
    // sub-branch _tmMacro itself parses (args[1]=scope, rest=name).
    izivei: [
      { sub: 'local',   params: [
        { name: 'სახელი', type: 'text' },
        { name: 'ჯაჭვი', type: 'text', multiline: true }
      ] },
      { sub: 'საერთო',  params: [
        { name: 'სახელი', type: 'text' },
        { name: 'ჯაჭვი', type: 'text', multiline: true }
      ] },
      { sub: 'ls',      params: [] },
      { sub: 'rm',      params: [
        { name: 'scope', type: 'select', options: ['local', 'საერთო'] },
        { name: 'სახელი', type: 'text' }
      ] }
    ],
    handler: function (args) { return _tmMacro(args); }
  },

  // ── Step 9: მენიუ (plain form only) ──
  // /მენიუ has two structurally different entry points:
  //   1. Plain "/მენიუ" — toggles the menu panel open/closed (closeTerm +
  //      toggleMenu). Space-split args shape, fits the registry cleanly.
  //   2. "/მენიუ/ა/ბ/2" — deep-link path syntax with literal "/" separators.
  //      This NEVER reaches here as cmd="მენიუ": the whole "მენიუ/ა/ბ/2"
  //      string is matched by the menuPathM regex earlier in _tmRun (before
  //      the parts=full.split(/\s+/) line), because there's no whitespace
  //      to split on — it's one token. That branch opens a leaf as a
  //      standalone overlay (no menu panel underneath), a genuinely
  //      different UI state from the plain toggle. It stays a permanent
  //      regex special-case in _tmRun — literal-path syntax doesn't fit a
  //      space-split args registry model, structurally (unlike /შეტყობინება,
  //      whose suffix-glued syntax WAS changed to fit the registry below).
  'მენიუ': {
    params: [],
    desc: 'მენიუ-პანელის გახსნა/დახურვა (deep-link: /მენიუ/სექცია/.../N)',
    // Second row documents the deep-link syntax even though that syntax is
    // matched by a separate regex in _tmRun and never reaches this entry's
    // handler (see comment above) — it's a help-text pairing only.
    helpLines: [
      ['/მენიუ',              'მენიუს toggle'],
      ['/მენიუ/სექცია/.../N', 'პირდაპირი ლინკი ნესტ. სექციაზე ან item-ზე']
    ],
    // Izivei picker hint — plain toggle has no params. The deep-link form is
    // hinted here too even though it's matched by a separate regex in _tmRun
    // and never reaches this entry's handler (same permanent special-case
    // noted above) — picker treats it as a single free-text path param.
    izivei: [
      { sub: null, params: [] },
      { sub: 'deep-link', params: [{ name: 'path', type: 'text' }] }
    ],
    handler: function (args) { return _tmMenu(); } // takes no args itself
  },

  // ── Step 10: შეტყობინება — syntax changed to fit the registry ──
  // OLD syntax (pre-migration): "/შეტყობინება!" — type-char glued directly
  // onto the command name, no space. That could never resolve via a plain
  // name-keyed registry lookup (cmd=parts[0] would be "შეტყობინება!", a
  // different literal string per type-char).
  // NEW syntax: "/შეტყობინება ! ტექსტი @@ზონა" — type-char is now its own
  // space-separated token (args[0]), exactly like any other param. This is
  // an intentional, user-approved breaking change (old "/შეტყობინება!"
  // glued form no longer works — must now write "/შეტყობინება !").
  // _tmNotify(typeChar, rest) itself is untouched; only how its two
  // arguments get extracted from the command line has changed.
  'შეტყობინება': {
    params: [
      { name: 'typeChar', type: 'select', options: ['*', '!', '~', '+', '.'], optional: true,
        desc: '*ინფო  !გაფრთხ.  ~საფრთხე  +პროექტი  .მზადაა (default: ინფო)' },
      { name: 'ტექსტი', type: 'text', multiline: true, desc: 'შეტყობინების ტექსტი' },
      { name: 'ზონა', type: 'text', optional: true, prefix: '@@', desc: 'დაკავშირებული ზონა' }
    ],
    desc: 'პირდაპირი შეტყობინების გაგზავნა (Supabase + PWA push)',
    handler: function (args) {
      var typeChars = ['*', '!', '~', '+', '.'];
      var typeChar = '', rest = args;
      if (args.length && typeChars.indexOf(args[0]) >= 0) {
        typeChar = args[0];
        rest = args.slice(1);
      }
      return _tmNotify(typeChar, rest.join(' '));
    }
  },

  // ── Step 11: იზივეი (window-builder trigger — Variant A, own dispatch) ──
  // /იზივეი local|საერთო <სახელი> opens the builder for a new/existing window
  // (creation + collision rules live in _tmIzivei). Opening an ALREADY-SAVED
  // window by its bare name is NOT this command's job — that's
  // _tmIziviResolve, checked earlier in _tmRun's dispatch chain, same
  // precedence rule as macros (local wins over shared on a name clash).
  'იზივეი': {
    params: [], // _tmIzivei parses its own scope word + name (+ optional "force")
    desc: 'local|საერთო <სახელი> — ფანჯრის-ბილდერის გახსნა (ახალი ან ედიტი)',
    helpLines: [
      ['/იზივეი local <სახელი>',          'პერსონალური ფანჯრის შექმნა/ედიტი'],
      ['/იზივეი საერთო <სახელი>',         'გაზიარებული ფანჯრის შექმნა/ედიტი'],
      ['/იზივეი საერთო <სახელი> force',   'სახელის კონფლიქტის გადაწერა']
    ],
    izivei: [
      { sub: 'local',  params: [{ name: 'სახელი', type: 'text' }] },
      { sub: 'საერთო', params: [{ name: 'სახელი', type: 'text' }] }
    ],
    handler: function (args) { return _tmIzivei(args); }
  }
};

// Looks up a command (and optional sub-action) in the registry.
// Returns the entry { params, desc, handler } or null if not found there
// (which tells the caller to fall back to the legacy `map` dispatch).
function _tmRegistryFind(name, sub) {
  var entry = COMMAND_REGISTRY[name];
  if (!entry) return null;
  if (entry.subs) return sub ? (entry.subs[sub] || null) : null;
  return entry;
}

function tmInsertSlash() {
  var inp = document.getElementById('tmIn');
  if (inp.value.charAt(0) !== '/') inp.value = '/' + inp.value;
  inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
}

// ── command router ──
async function _tmRun(raw) {
  var text = raw.trim();
  if (text.charAt(0) !== '/') {
    if (typeof chatHandleInput === 'function' && chatHandleInput(text)) return;
    _tmL('ter', 'ბრძანებები იწყება "/" — მაგ.: /დახმარება');
    return;
  }
  var full = text.slice(1);

  // A macro DEFINITION owns its own ";"-separated body — never let the generic
  // resolver/splitter below tear it apart before it reaches _tmMacro.
  var isMacroDef = /^macro\s+(local|საერთო)\s+/.test(full) && full.indexOf(':=') >= 0;

  if (!isMacroDef) {
    // ── exact macro-name match (local scope wins over shared) — checked before
    //    normal dispatch, so a saved shortcut behaves like a brand-new command ──
    var macroCmds = _tmMacroResolve(full);
    if (macroCmds) { await _tmRunChain(macroCmds); return; }

    // ── exact Izivei-window-name match (local scope wins over shared) —
    //    same precedence rule as macros, checked right after them so a saved
    //    window opens by typing its bare name, same as a macro does ──
    var iziviWin = _tmIziviResolve(full);
    if (iziviWin) { _tmIziviOpenWindow(iziviWin); return; }

    // ── generic ";"-chaining: only splits where ";" is followed by "/",
    //    so a stray ";" inside ordinary item text is left alone ──
    var chainParts = _tmSplitChain(full);
    if (chainParts.length > 1) { await _tmRunChain(chainParts); return; }
  }

  // /მენიუ/<სექცია>/<სექცია>/.../<ფოთოლი_index?> — deep-link straight to a menu panel/leaf
  var menuPathM = full.match(/^მენიუ\/(.+)$/);
  if (menuPathM) { _tmMenuOpenPath(menuPathM[1].split('/').map(function (s) { return s.trim(); }).filter(Boolean)); return; }

  var parts = full.split(/\s+/), cmd = parts[0], args = parts.slice(1);

  // ── registry-first dispatch (incremental migration) ──
  // Sub-action commands pass their first arg as `sub` for the lookup, then
  // drop it from the args the handler actually receives (matches how the
  // legacy map-based handlers already split head/rest themselves below).
  var regEntry = _tmRegistryFind(cmd, args[0]);
  var regArgs = args;
  if (regEntry && COMMAND_REGISTRY[cmd] && COMMAND_REGISTRY[cmd].subs) regArgs = args.slice(1);
  if (regEntry) { await regEntry.handler(regArgs); return; }

  // ── legacy map dispatch (commands not yet migrated to COMMAND_REGISTRY) ──
  var map = {};
  var fn = map[cmd];
  if (fn) { await fn(args); return; }
  if (typeof chatHandleInput === 'function' && chatHandleInput(text)) return;
  _tmL('ter', 'უცნობი ბრძანა: "/' + cmd + '" — სცადე: /დახმარება');
}

// ── /help formatting helper ──────────────────────────────────────────────
// Turns a registry entry's `params` array into the bracket/angle notation
// _tmHelp displays, e.g. [{name:'index',type:'number'},{name:'content',
// optional:true}] → "<index> [content]". A param's own `prefix` (e.g. '@@'
// on /შეტყობინება's area param) is glued inside its bracket/angle pair;
// `type:'select'` with `options` renders as a pipe-joined choice list
// instead of the bare name (e.g. "*|!|~|+|.").
function _tmFormatParam(p) {
  var label = (p.type === 'select' && p.options) ? p.options.join('|') : p.name;
  if (p.prefix) label = p.prefix + label;
  return p.optional ? ('[' + label + ']') : ('<' + label + '>');
}
function _tmFormatCmdRow(name, entry) {
  var parts = (entry.params || []).map(_tmFormatParam);
  return '/' + name + (parts.length ? ' ' + parts.join(' ') : '');
}

// ── built-in commands ──
// /help is now generated FROM COMMAND_REGISTRY, not a hand-maintained list —
// adding/changing a command's params/desc/helpLines here automatically
// updates what /დახმარება prints, with zero risk of the two drifting apart.
//   - An entry with `helpLines` (Variant A: flag, marker, macro, ლეგენდა,
//     ფოთოლი, მენიუ) prints those rows verbatim — these are the commands
//     whose real syntax is an internal sub-action switch that a flat
//     `params` array can't express as a single row.
//   - Every other entry prints one auto-formatted row: /name + its params
//     in <required>/[optional] notation (see _tmFormatCmdRow above).
// Order follows Object.keys(COMMAND_REGISTRY) insertion order, which mirrors
// the registry's own step-by-step migration grouping (flag → filesystem-
// style menu commands → დახმარება/გასუფთავება → the 14-command batch →
// marker → macro → მენიუ → შეტყობინება → იზივეი) — the same grouping the old
// hardcoded list followed by hand.
function _tmHelp() {
  _tmL('tdm', _SEP);
  _tmL('tsy', '--- ბრძანები ---');
  Object.keys(COMMAND_REGISTRY).forEach(function (name) {
    var entry = COMMAND_REGISTRY[name];
    if (entry.helpLines) {
      entry.helpLines.forEach(function (row) { _tmL('tnf', pad(row[0]) + row[1]); });
    } else {
      _tmL('tnf', pad(_tmFormatCmdRow(name, entry)) + entry.desc);
    }
  });
  // /nick, /me, /who, /color live in chat.js / chat-hud.js — a separate
  // subsystem, never migrated into COMMAND_REGISTRY (out of this refactor's
  // scope) — so these four rows stay static here, exactly as before.
  _tmL('tnf', pad('/nick სახელი') + 'ნიკნეიმის შეცვლა');
  _tmL('tnf', pad('/me ტექსტი')   + '* აქშნის მესიჯი');
  _tmL('tnf', pad('/who')         + 'ონლაინ სია');
  _tmL('tnf', pad('/color #hex')  + 'ნიკნეიმის ფერი');
  _tmL('tdm', 'Tab — ავტოდასრულება   ↑↓ — ისტორია');
  _tmL('tdm', 'ტექსტი "/" გარეშე → ჩატის მესიჯი');
  _tmL('tdm', _SEP);

  // column-align helper: pads a command string to a fixed width so the
  // description column lines up — same 24-char width the old hardcoded
  // list used, so auto-generated rows visually match it.
  function pad(s) {
    var W = 24;
    return s.length >= W ? (s + ' ') : (s + new Array(W - s.length + 1).join(' '));
  }
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
function _tmLegend(args) {
  var sub = (args[0] || '').trim();
  if (sub === 'რედაქტირება' || sub === 'edit') { _tmLegendEditOpen(); return; }
  toggleQuest();
  _tmL('tok', 'ლეგენდა: toggled');
}

// Open the multiline editor for the main "?" legend text.
function _tmLegendEditOpen() {
  var p = document.getElementById('questPopup');
  if (!p) { _tmL('ter', '✗ ლეგენდის ელემენტი ვერ მოიძებნა'); return; }
  var current = p.dataset.full || p.textContent || '';

  if (!_tmMulti) tmToggleMulti();
  document.getElementById('tmTa').value = current;
  _tmTaResize();
  _tmEditObj   = '__legend__';
  _tmEditMode  = 'legend';
  _tmEditLabel = 'მთავარი ლეგენდა';

  _tmL('tsy', '─── მთავარი ლეგენდა ──────────────');
  _tmL('tdm', 'Ctrl+Enter — შენახვა · Esc — გაუქმება');
}

// Save the multiline editor content as the new legend text — updates the
// live popup immediately and pushes the override to Supabase for every viewer.
async function _tmSaveLegend(text) {
  var p = document.getElementById('questPopup');
  if (p) {
    p.dataset.full = text;
    if (p.style.display === 'block') {
      p.textContent = '';
      if (typeof _typewriter === 'function') _typewriter(p, text, 60); else p.textContent = text;
    }
  }

  var label = _tmEditLabel;
  _tmEditObj = null; _tmEditMode = null; _tmEditMenuCtx = null; _tmEditLabel = null; _tmEditBuf = null;
  document.getElementById('tmTa').value = '';
  if (_tmMulti) tmToggleMulti();

  _tmL('tdm', '↑ ' + label + ' — ვინახავ...');
  if (typeof window.legendOverrideSave !== 'function') {
    _tmL('ter', '✗ legendOverrideSave ვერ მოიძებნა (runtime.js?)');
    return;
  }
  var res = await window.legendOverrideSave(text);
  if (res === true) _tmL('tok', label + ' — შენახულია ✓ (ყველა viewer-ს ეჩვენება)');
  else _tmL('ter', '✗ Supabase: ' + (res && res.msg ? res.msg : 'უცნობი'));
}
function _tmMenu() { closeTerm(); toggleMenu(); }

// ── /მენიუ/<section>/<section>/.../<leaf-item-index?> — deep link ──
// Drills the visible game-menu UI (runtime.js's _gmShowPanel/_gmOpenOverlay)
// straight to a nested section or a specific item inside a leaf, instead of
// making the person tap through each level by hand.
function _tmMenuOpenPath(segs) {
  if (!segs.length) { _tmMenu(); return; }
  if (!_gmCfg) _gmCfg = _CFG;

  var itemIdx = null;
  if (/^\d+$/.test(segs[segs.length - 1])) { itemIdx = parseInt(segs[segs.length - 1]); segs = segs.slice(0, -1); }
  if (!segs.length) { _tmMenu(); return; }

  var nodes = _gmCfg.menu || [], path = [], node = null;
  for (var i = 0; i < segs.length; i++) {
    node = nodes.find(function (n) { return (n.title || '').trim() === segs[i]; });
    if (!node) { _tmL('ter', 'მენიუში ვერ მოიძებნა: "' + segs[i] + '"'); return; }
    if (i < segs.length - 1) {
      if (!node.children || !node.children.length) { _tmL('ter', '"' + node.title + '" — ქვესექციები არ აქვს'); return; }
      path.push({ title: node.title, nodes: node.children });
      nodes = node.children;
    }
  }

  var gm = document.getElementById('gameMenu');
  var wasOpen = gm.classList.contains('open');
  if (!wasOpen) toggleMenu();

  if (node.items && node.items.length) {
    _gmOpenOverlay(node, nodes, path, !wasOpen);
    if (itemIdx != null) {
      setTimeout(function () {
        var body = document.getElementById('gmOverlayBody');
        var el = body.children[itemIdx];
        if (!el) { _tmL('ter', 'item [' + itemIdx + '] არ არსებობს'); return; }
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var orig = el.style.backgroundColor;
        el.style.transition = 'background-color .3s';
        el.style.backgroundColor = 'rgba(0,255,136,.25)';
        setTimeout(function () { el.style.backgroundColor = orig; }, 1200);
      }, 80);
    }
  } else if (node.children && node.children.length) {
    _gmShowPanel(node.children, path.concat([{ title: node.title, nodes: node.children }]));
  } else {
    _gmShowPanel(nodes, path);
  }
  _tmL('tok', '☰ → ' + segs.join('/') + (itemIdx != null ? '/' + itemIdx : ''));
}
function _tmOpenCmd() {
  if (!_tmOpen) _tmOpen_();
  _tmL('tok', 'ტერმინალი გახსნილია');
}

// ── /შეყვანა — Enter/Send equivalent for macro chains ──
// Submits content into whichever edit session is currently open (dlg/menuItem/
// legend), exactly as pressing the ➤ button would. Content comes from either
// a buffered chain segment (_tmEditBuf, set by _tmRunChain) or, if typed
// directly rather than via a macro, whatever's already sitting in #tmTa.
function _tmSubmitCmd() {
  if (!_tmEditObj) { _tmL('ter', '/შეყვანა: ღია edit-სესია არ მოიძებნა'); return; }
  var v = (_tmEditBuf != null) ? _tmEditBuf : document.getElementById('tmTa').value.trim();
  _tmEditBuf = null;
  if (!v) { _tmL('ter', '/შეყვანა: შესანახი ტექსტი არ მოიძებნა'); return; }
  if (_tmEditMode === 'menuItem') { _tmSaveMenuItem(v); return; }
  if (_tmEditMode === 'legend')   { _tmSaveLegend(v); return; }
  _tmSaveDlg(v);
}

// ── /marker set|reset — local-only marker override (personal exploration) ──
// Reuses _applyMarkerDom / _markerSave / _mkRestoring / _MK_KEY from runtime.js — zero new infra.
// Visible only on this device; community/Supabase state never touched.
//   ?  →  '?'   (badge "?"   class q)    — აღებული ქუესტი
//   !  →  '!'   (badge "!"   class exc)  — quest
//   ~  →  '💬'  (badge "..." class chat) — ჩატი
//   -  →  ''    (hs-dot "•")             — ნეიტრალური
var _TM_MK_SYM = { '?': '?', '!': '!', '~': '💬', '-': '' };

// Find hotspot by name — same dual-path lookup as /დიალოგი (data-title, then .lb fallback by oi).
function _tmFindHotspot(name) {
  var hs = document.querySelector('.hotspot[data-title="' + name.replace(/"/g, '\\"') + '"]:not(.hs-area):not(.no-interact)');
  if (!hs && typeof _OBJS !== 'undefined') {
    for (var _i = 0; _i < _OBJS.length; _i++) {
      if (_OBJS[_i] && _OBJS[_i].lb === name) {
        var _c = document.querySelector('.hotspot[data-oi="' + _i + '"]:not(.hs-area):not(.no-interact)');
        if (_c) { hs = _c; break; }
      }
    }
  }
  return hs || null;
}

// Original (export/Supabase-baked) marker for an object, converted to _applyMarkerDom's input domain.
function _tmOrigMk(oi) {
  var raw = (typeof _OBJS !== 'undefined' && _OBJS[+oi] && _OBJS[+oi].marker) || '';
  return raw === '...' ? '💬' : raw;
}

async function _tmMarkerCmd(args) {
  var sub = (args[0] || '').toLowerCase();

  if (sub === 'set') {
    var rest = args.slice(1).join(' ').trim();
    var m = rest.match(/^([\s\S]+?)\s+([?!~-])$/);
    if (!m) {
      _tmL('ter', 'გამოყენება: /marker set <სახელი> ?|!|~|-');
      _tmL('tdm', '?ქუესტი  !აღებული  ~ჩატი(...)  -ნეიტრალური(•)');
      return;
    }
    var name = m[1].trim(), sym = m[2];
    var hs = _tmFindHotspot(name);
    if (!hs) { _tmL('ter', 'ობიექტი ვერ მოიძებნა: "' + name + '"'); return; }
    _applyMarkerDom(hs, _TM_MK_SYM[sym]);
    _tmL('tok', name + ' — მარკერი "' + sym + '" (ლოკალური, მხ. შენ)');
    return;
  }

  if (sub === 'reset') {
    var name2 = args.slice(1).join(' ').trim();

    if (!name2) {
      try {
        var s = JSON.parse(localStorage.getItem(_MK_KEY) || '{}');
        _mkRestoring = true;
        Object.keys(s).forEach(function (oi) {
          var el = document.querySelector('.hotspot[data-oi="' + oi + '"]:not(.hs-area)');
          if (el) _applyMarkerDom(el, _tmOrigMk(oi));
        });
        _mkRestoring = false;
        localStorage.removeItem(_MK_KEY);
        _tmL('tok', 'ყველა მარკერი — საწყის მდგომარეობაზე დაბრუნდა');
      } catch (e) { _mkRestoring = false; _tmL('ter', 'შეცდომა: ' + e.message); }
      return;
    }

    var hs2 = _tmFindHotspot(name2);
    if (!hs2) { _tmL('ter', 'ობიექტი ვერ მოიძებნა: "' + name2 + '"'); return; }
    var oi2 = hs2.dataset.oi;
    _mkRestoring = true;
    _applyMarkerDom(hs2, _tmOrigMk(oi2));
    _mkRestoring = false;
    try {
      var s2 = JSON.parse(localStorage.getItem(_MK_KEY) || '{}');
      delete s2[oi2];
      localStorage.setItem(_MK_KEY, JSON.stringify(s2));
    } catch (e) {}
    _tmL('tok', name2 + ' — საწყის მდგომარეობაზე დაბრუნდა');
    return;
  }

  _tmL('ter', 'გამოყენება: /marker set|reset <სახელი> [?|!|~|-]');
}

// ── /შეტყობინება — direct send to Supabase `notifications` table ──
// type chars match bulk-parser.js _NOTIFY_TYPES:  * info  ! warning  ~ danger  + project  . done
var _TM_NOTIFY_TYPES = { '*': 'info', '!': 'warning', '~': 'danger', '+': 'project', '.': 'done', '': 'info' };
var _TM_NOTIFY_SYMS  = { info: '💬', warning: '⚠', danger: '❗', done: '✅', project: '🚀' };

async function _tmNotify(typeChar, rest) {
  rest = (rest || '').trim();
  if (!rest) {
    _tmL('tnf', 'გამოყენება: /შეტყობინება [*!~+.] ტექსტი [@@ზონა]');
    _tmL('tdm', '*ინფო  !გაფრთხ.  ~საფრთხე  +პროექტი  .მზადაა');
    return;
  }

  // optional trailing @@area
  var area = '';
  var areaM = rest.match(/^(.*?)\s*@@(.+?)\s*$/);
  if (areaM) { area = areaM[2].trim(); rest = areaM[1].trim(); }
  if (!rest) { _tmL('ter', 'ტექსტი ცარიელია'); return; }

  var type   = _TM_NOTIFY_TYPES[typeChar] || 'info';
  var sym    = _TM_NOTIFY_SYMS[type];
  var sender = localStorage.getItem('mdelo_sender') || (typeof _CFG !== 'undefined' && _CFG && _CFG.title) || 'ანონიმი';

  try {
    var r = await fetch(SUPA_URL + '/rest/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ type: type, symbol: sym, text: rest, sender: sender, linked_area: area })
    });
    if (r.ok) {
      _tmL('tok', sym + ' შეტყობინება გაიგზავნა');
      if (typeof loadNotifs === 'function') loadNotifs();
    } else {
      _tmL('ter', 'შეცდომა: ' + r.status);
    }
  } catch (e) {
    _tmL('ter', 'კავშირის შეცდომა');
  }
}
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
  _tmEditMode = 'dlg';
  _tmEditLabel = (_OBJS && _OBJS[+hs.dataset.oi] && _OBJS[+hs.dataset.oi].lb) || objKey;

  _tmL('tsy', '─── ' + ((_OBJS && _OBJS[+hs.dataset.oi] && _OBJS[+hs.dataset.oi].lb) || objKey) + ' — DSL ──────────────');
  _tmL('tdm', 'Ctrl+Enter — შენახვა · Esc — გაუქმება');
}

// Cancel edit mode without saving
function _tmEditCancel() {
  var label = _tmEditLabel || _tmEditObj;
  _tmEditObj = null;
  _tmEditMode = null;
  _tmEditMenuCtx = null;
  _tmEditLabel = null;
  _tmEditBuf = null;
  document.getElementById('tmTa').value = '';
  if (_tmMulti) tmToggleMulti();
  _tmL('tdm', label + ' — გაუქმდა');
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
    _tmEditMode = null;
    _tmEditLabel = null;
    _tmEditBuf = null;
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
// DEAD CODE as of Step 2 migration — superseded by COMMAND_REGISTRY.flag.handler
// (same logic, same delegation to unlockHandleCmd). Left in place rather than
// deleted, consistent with the low-priority dead-code-cleanup convention used
// elsewhere (e.g. runtime.js's btn.markers/btn.flags/btn.notify blocks).
// Safe to remove in a future cleanup pass once all migrations are verified.
function _tmFlagDelegate(args) {
  if (typeof unlockHandleCmd !== 'function') {
    _tmL('ter', '/flag: unlock.js არ არის ჩატვირთული'); return;
  }
  unlockHandleCmd(['flag'].concat(args));
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
  if (name.indexOf('/') >= 0) { _tmMenuCdPath(name); return; }

  var list  = _tmMenuCwdList();
  var found = list.find(function (n) { return (n.title || '').trim() === name; });
  if (!found) { _tmL('ter', 'ვერ მოიძებნა: "' + name + '"'); _tmL('tdm', 'სია: /ls'); return; }
  _tmMenuStack.push(found);
  _tmL('tok', _tmMenuPathStr());
}

// Slash-segmented path: "/a/b/c" (absolute, from root) or "a/b/c" (relative, from cwd).
// ".." is a valid segment too ("../sibling"). Resolved against a throwaway copy of
// the stack first — Unix `cd` semantics: any missing segment aborts the WHOLE move,
// cwd stays exactly where it was (no partial hop).
function _tmMenuCdPath(path) {
  var absolute = path.charAt(0) === '/';
  var segments = path.split('/').map(function (s) { return s.trim(); }).filter(Boolean);
  var stack = absolute ? [] : _tmMenuStack.slice();

  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    if (seg === '.') continue;
    if (seg === '..') {
      if (!stack.length) {
        _tmL('ter', 'root-ზე მაღლა ასვლა შეუძლებელია — სეგმენტი ' + (i + 1) + '/' + segments.length + ' (".."), cwd უცვლელია');
        return;
      }
      stack.pop();
      continue;
    }
    var topNode  = stack.length ? stack[stack.length - 1] : null;
    var children = topNode ? (topNode.children || []) : (_CFG.menu || []);
    var found = children.find(function (n) { return (n.title || '').trim() === seg; });
    if (!found) {
      _tmL('ter', 'ვერ მოიძებნა: "' + seg + '" (სეგმენტი ' + (i + 1) + '/' + segments.length + ') — cwd უცვლელია');
      return;
    }
    stack.push(found);
  }

  _tmMenuStack = stack;
  _tmL('tok', _tmMenuPathStr());
}

// Detects whether a trailing arg token is a custom icon/emoji override rather
// than part of the name/text itself — short (<=2 unicode chars, covers most
// single emoji incl. variation selectors) and containing no ordinary letters
// or digits, so a real word/number is never mistaken for an icon.
function _tmIsIconToken(tok) {
  if (!tok) return false;
  return Array.from(tok).length <= 2 && !/[a-zA-Zა-ჿ0-9]/.test(tok);
}

async function _tmMenuMd(args) {
  var icon = '📁';
  if (args.length > 1 && _tmIsIconToken(args[args.length - 1])) {
    icon = args[args.length - 1];
    args = args.slice(0, -1);
  }
  var name = args.join(' ').trim();
  if (!name) { _tmL('ter', 'გამოყენება: /md <სახელი> [ემოჯი]'); return; }
  var parent = _tmMenuCwdNode();
  var list   = _tmMenuCwdList();
  if (list.find(function (n) { return (n.title || '').trim() === name; })) {
    _tmL('ter', 'უკვე არსებობს: "' + name + '"'); return;
  }
  var node = { id: 'nd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), icon: icon, title: name, items: [], children: [] };
  list.push(node);
  _tmMenuStack.push(node);
  _tmL('tok', icon + ' ' + name + '  →  ' + _tmMenuPathStr());
  await _tmMenuSaveNode(node.id, { parent_id: parent ? parent.id : null, icon: node.icon, title: node.title, items_json: [] });
}

async function _tmMenuLeaf(args) {
  var sub  = (args[0] || '').trim();
  var node = _tmMenuCwdNode();
  if (!node) { _tmL('ter', 'root-ში ფოთლები არ შეიძლება — /cd <სახელი> შედი სექციაში'); return; }

  if (sub === 'ტექსტი') {
    var rest = args.slice(1);
    var emoji = '•';
    if (rest.length > 1 && _tmIsIconToken(rest[rest.length - 1])) {
      emoji = rest[rest.length - 1];
      rest = rest.slice(0, -1);
    }
    var text = rest.join(' ').trim();
    if (!text) { _tmL('ter', 'გამოყენება: /ფოთოლი ტექსტი <ტექსტი> [ემოჯი]'); return; }
    if (!node.items) node.items = [];
    node.items.push({ type: 'text', emoji: emoji, label: text });
    _tmL('tok', '+ [' + (node.items.length - 1) + '] ' + emoji + ' ტექსტი დაემატა');
    await _tmMenuSaveNode(node.id, { items_json: node.items });
  } else if (sub === 'ინდიკატორი') {
    var rest2  = args.slice(1);
    var emoji2 = '📊';
    if (rest2.length > 1 && _tmIsIconToken(rest2[rest2.length - 1])) {
      emoji2 = rest2[rest2.length - 1];
      rest2 = rest2.slice(0, -1);
    }
    var pct    = parseInt(rest2[rest2.length - 1]);
    var hasPct = !isNaN(pct) && rest2.length > 1;
    var label  = (hasPct ? rest2.slice(0, -1) : rest2).join(' ').trim();
    if (!label) { _tmL('ter', 'გამოყენება: /ფოთოლი ინდიკატორი <სახელი> <%> [ემოჯი]'); return; }
    var val = hasPct ? Math.max(0, Math.min(100, pct)) : 100;
    if (!node.items) node.items = [];
    node.items.push({ type: 'progress', emoji: emoji2, label: label, value: val });
    _tmL('tok', '+ [' + (node.items.length - 1) + '] ' + emoji2 + ' ინდიკატორი დაემატა (' + val + '%)');
    await _tmMenuSaveNode(node.id, { items_json: node.items });
  } else {
    _tmL('tdm', _SEP);
    _tmL('tsy', '/ფოთოლი ბრძანებები:');
    _tmL('tnf', '  ტექსტი <ტექსტი> [ემოჯი]         — ტექსტური item (default •)');
    _tmL('tnf', '  ინდიკატორი <სახელი> <%> [ემოჯი] — progress item (default 📊)');
    _tmL('tdm', _SEP);
  }
}

async function _tmMenuRm(args) {
  var arg = args.join(' ').trim();
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
//   /edit <N>                          — multiline editor (Ctrl+Enter — შენახვა · Esc — გაუქმება)
//   /edit <N> <ახალი ტექსტი>           — text item: ცვლის label-ს მთლიანად, inline
//   /edit <N> <ახალი ტექსტი> <%>       — progress item: ცვლის label-სა და value-ს ერთად, inline
//   /edit <N> <%>                      — progress item: ცვლის მხოლოდ value-ს, label ხელუხლებელია
async function _tmMenuEdit(args) {
  var node = _tmMenuCwdNode();
  if (!node) { _tmL('ter', 'root-ში items არ არსებობს'); return; }
  var idx = parseInt(args[0]);
  if (isNaN(idx) || !node.items || !node.items[idx]) {
    _tmL('ter', 'გამოყენება: /edit <ინდექსი> [ახალი შინაარსი] — სია: /ls');
    return;
  }
  var rest  = args.slice(1);
  var itObj = typeof node.items[idx] === 'string' ? { type: 'text', emoji: '•', label: node.items[idx] } : node.items[idx];

  if (!rest.length) { _tmMenuEditOpen(node, idx, itObj); return; }

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

// Serialize an item into editable plain text for the multiline textarea.
// Line 1 is a tagged "[emoji: X]" line so it can't be confused with real
// label content — progress items also keep their value on a trailing "NN%" line.
function _tmMenuItemToEditText(itObj) {
  var emoji = itObj.emoji || (itObj.type === 'progress' ? '📊' : '•');
  var head  = '[emoji: ' + emoji + ']';
  if (itObj.type === 'progress') {
    return head + '\n' + (itObj.label || '') + '\n\n' + (itObj.value != null ? itObj.value : 0) + '%';
  }
  return head + '\n' + (itObj.label || '');
}

// Parse the textarea content back into { emoji, label, value } on save.
// If line 1 isn't a valid "[emoji: X]" tag (e.g. accidentally edited away),
// `fallbackEmoji` (the item's current emoji) is kept instead of guessing —
// nothing gets silently swallowed into the label.
function _tmParseMenuEditText(text, type, fallbackEmoji) {
  var lines = text.split('\n');
  var emoji = fallbackEmoji || (type === 'progress' ? '📊' : '•');
  var tagMatch = /^\[emoji:\s*(.*)\]$/.exec((lines[0] || '').trim());
  if (tagMatch) { emoji = tagMatch[1].trim() || emoji; lines.shift(); }
  var rest = lines;

  if (type === 'progress') {
    while (rest.length && rest[rest.length - 1].trim() === '') rest.pop();
    var last  = rest.length ? rest[rest.length - 1].trim() : '';
    var m     = /^(\d{1,3})%?$/.exec(last);
    var value = null, labelLines = rest;
    if (m) { value = Math.max(0, Math.min(100, parseInt(m[1]))); labelLines = rest.slice(0, -1); }
    while (labelLines.length && labelLines[labelLines.length - 1].trim() === '') labelLines.pop();
    return { emoji: emoji, label: labelLines.join('\n').trim(), value: value };
  }
  return { emoji: emoji, label: rest.join('\n').trim(), value: null };
}

// Open the multiline editor for item [idx] of `node`.
function _tmMenuEditOpen(node, idx, itObj) {
  if (!_tmMulti) tmToggleMulti();
  document.getElementById('tmTa').value = _tmMenuItemToEditText(itObj);
  _tmTaResize();
  _tmEditObj     = node.id;
  _tmEditMode    = 'menuItem';
  _tmEditMenuCtx = { node: node, idx: idx, type: itObj.type || 'text' };
  _tmEditLabel   = '[' + idx + '] ' + (node.title || '');

  _tmL('tsy', '─── [' + idx + '] ' + (node.title || '') + ' ──────────────');
  _tmL('tdm', 'ხაზი 1 — [emoji: X], მხოლოდ X გამოცვალე');
  _tmL('tdm', 'Ctrl+Enter — შენახვა · Esc — გაუქმება');
}

// Save the multiline editor content back into the item + push to Supabase.
async function _tmSaveMenuItem(text) {
  var ctx = _tmEditMenuCtx;
  if (!ctx) { _tmEditCancel(); return; }
  var node = ctx.node, idx = ctx.idx;
  if (!node.items || !node.items[idx]) {
    _tmL('ter', '✗ item [' + idx + '] აღარ არსებობს');
    _tmEditObj = null; _tmEditMode = null; _tmEditMenuCtx = null; _tmEditLabel = null; _tmEditBuf = null;
    document.getElementById('tmTa').value = '';
    if (_tmMulti) tmToggleMulti();
    return;
  }

  var existing      = node.items[idx];
  var currentEmoji  = (existing && typeof existing === 'object' && existing.emoji) ? existing.emoji : (ctx.type === 'progress' ? '📊' : '•');
  var parsed        = _tmParseMenuEditText(text, ctx.type, currentEmoji);
  var itObj         = typeof existing === 'string' ? { type: ctx.type } : existing;
  itObj.type  = ctx.type;
  itObj.emoji = parsed.emoji;
  itObj.label = parsed.label;
  if (ctx.type === 'progress' && parsed.value != null) itObj.value = parsed.value;
  node.items[idx] = itObj;

  var label = _tmEditLabel;
  _tmEditObj = null; _tmEditMode = null; _tmEditMenuCtx = null; _tmEditLabel = null; _tmEditBuf = null;
  document.getElementById('tmTa').value = '';
  if (_tmMulti) tmToggleMulti();

  _tmL('tdm', '↑ ' + label + ' — ვინახავ...');
  await _tmMenuSaveNode(node.id, { items_json: node.items });
  _tmL('tok', label + ' — შენახულია ✓');
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

// ── macro/shortcut engine ──
// Two scopes:
//   local   — localStorage, this device only, instant, no Supabase round-trip
//   საერთო  — Supabase (terminal_macros table), every viewer sees it on next load
// A macro IS a brand-new command: once saved, typing its exact name (with /) runs
// the whole stored chain. Local scope takes precedence over shared on a name clash.
var _TM_RESERVED = ['macro','marker','cd','md','rm','ls','pwd','edit','ფოთოლი','flag','nick','me','who','color','help',
  'დახმარება','გასუფთავება','ინფო','მასშტაბი','ზონები','ობიექტები','დიალოგი','წასვლა','ლეგენდა','მენიუ','გახსნა','შეყვანა','სრული','ისტორია','ვადა','ტექსტი','შეტყობინება','დახურვა','იზივეი'];

// Split a raw (no leading "/") command line on ";" — only where ";" is followed
// (after optional whitespace) by "/", so semicolons inside ordinary text are safe.
// Splits a chain on ";" — but only when ";" is followed by "/" (so a stray
// ";" inside ordinary command args is left alone) — PLUS treats any [...]
// block as its own atomic segment: content inside brackets is never split
// on ";" no matter what follows, and the brackets force a boundary on both
// sides. This lets a macro safely carry free-form multi-word content (e.g.
// the body for /edit + /შეყვანა) without it bleeding into a neighboring
// command's args or being torn apart by a literal ";" in the text itself.
//   /edit 0; [თავის ტექსტი; შესაძლოა ; აქაც]; /შეყვანა
function _tmSplitChain(full) {
  var parts = [], buf = '', i = 0, n = full.length;
  while (i < n) {
    var ch = full[i];
    if (ch === '[') {
      if (buf.trim()) parts.push(buf);
      buf = '';
      var j = full.indexOf(']', i + 1);
      if (j === -1) j = n;
      parts.push(full.slice(i + 1, j));
      i = j + 1;
      while (i < n && /[\s;]/.test(full[i])) i++;
      continue;
    }
    if (ch === ';') {
      var rest = full.slice(i + 1).replace(/^\s+/, '');
      if (rest.charAt(0) === '/' || rest.charAt(0) === '[') {
        if (buf.trim()) parts.push(buf);
        buf = '';
        i++;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  if (buf.trim()) parts.push(buf);
  return parts.map(function (s) { return s.trim(); }).filter(Boolean);
}

// Run a list of command strings (each with or without a leading "/") in order,
// awaiting each before starting the next, echoing every step to the log.
async function _tmRunChain(cmds) {
  for (var i = 0; i < cmds.length; i++) {
    var c = (cmds[i] || '').trim();
    if (!c) continue;

    // While an edit session is open (_tmEditObj truthy), a segment that isn't
    // an explicit "/" command is raw content for that session — buffer it for
    // /შეყვანა to submit, instead of force-dispatching it as an unknown command.
    if (_tmEditObj && c.charAt(0) !== '/') {
      _tmEditBuf = c;
      _tmL('ti', c);
      continue;
    }

    if (c.charAt(0) !== '/') c = '/' + c;
    _tmL('ti', c);
    await _tmRun(c);
  }
}

function _tmMacroLocalKey() { return 'mdelo_macro_local_' + ((typeof _CFG !== 'undefined' && _CFG && _CFG.title) || 'map'); }
function _tmMacroLocalAll() {
  try { return JSON.parse(localStorage.getItem(_tmMacroLocalKey()) || '{}'); } catch (e) { return {}; }
}
function _tmMacroLocalSave(all) {
  try { localStorage.setItem(_tmMacroLocalKey(), JSON.stringify(all)); return true; } catch (e) { return false; }
}

// Exact-name lookup across both scopes. Returns a commands[] array or null.
function _tmMacroResolve(full) {
  var name = (full || '').trim();
  if (!name) return null;
  var locals = _tmMacroLocalAll();
  if (locals[name]) return locals[name];
  if (window._tmMacroShared && window._tmMacroShared[name]) return window._tmMacroShared[name];
  return null;
}

// /macro local|საერთო <სახელი> := cmd1 ; cmd2 ; ...
// /macro ls
// /macro rm local|საერთო <სახელი>
async function _tmMacro(args) {
  var head0 = (args[0] || '').trim();

  if (head0 === 'ls') { _tmMacroLs(); return; }

  if (head0 === 'rm') {
    var scopeWord = (args[1] || '').trim();
    var rmName = args.slice(2).join(' ').trim();
    if (!rmName || (scopeWord !== 'local' && scopeWord !== 'საერთო')) {
      _tmL('ter', 'გამოყენება: /macro rm local|საერთო <სახელი>');
      return;
    }
    if (scopeWord === 'local') {
      var all = _tmMacroLocalAll();
      if (!all[rmName]) { _tmL('ter', 'local მაკრო ვერ მოიძებნა: "' + rmName + '"'); return; }
      delete all[rmName];
      _tmMacroLocalSave(all);
      _tmL('tok', '✗ 🔒 "' + rmName + '" წაიშალა');
    } else {
      if (typeof window.macroOverrideDelete !== 'function') { _tmL('ter', '✗ macroOverrideDelete ვერ მოიძებნა (runtime.js?)'); return; }
      var dres = await window.macroOverrideDelete(rmName);
      if (dres === true) _tmL('tok', '✗ 🌐 "' + rmName + '" წაიშალა');
      else _tmL('ter', '✗ Supabase: ' + (dres && dres.msg ? dres.msg : 'უცნობი'));
    }
    return;
  }

  var raw = args.join(' ');
  var assignIdx = raw.indexOf(':=');
  if (assignIdx < 0) {
    _tmL('tdm', _SEP);
    _tmL('tsy', '/macro ბრძანებები:');
    _tmL('tnf', '  local <სახელი> := cmd1 ; cmd2 ...   — პერსონალური შორთკატი');
    _tmL('tnf', '  საერთო <სახელი> := cmd1 ; cmd2 ...  — გაზიარებული შორთკატი');
    _tmL('tnf', '  ls                                  — ყველა შორთკატის სია');
    _tmL('tnf', '  rm local|საერთო <სახელი>            — წაშლა');
    _tmL('tdm', _SEP);
    return;
  }

  var head = raw.slice(0, assignIdx).trim();
  var body = raw.slice(assignIdx + 2).trim();
  var headParts = head.split(/\s+/);
  var scope = headParts[0];
  var name = headParts.slice(1).join(' ').trim();

  if (scope !== 'local' && scope !== 'საერთო') {
    _tmL('ter', 'მითხარი scope: /macro local <სახელი> := ...  ან  /macro საერთო <სახელი> := ...');
    return;
  }
  if (!name) { _tmL('ter', 'სახელი არ მიუთითე'); return; }
  if (_TM_RESERVED.indexOf(name) >= 0) { _tmL('ter', '✗ "' + name + '" დაცული სახელია — სხვა აარჩიე'); return; }

  var commands = body.split(';').map(function (s) { return s.trim(); }).filter(Boolean)
    .map(function (c) { return c.charAt(0) === '/' ? c : '/' + c; });
  if (!commands.length) { _tmL('ter', 'ბრძანებების ჩამონათვალი ცარიელია'); return; }

  if (scope === 'local') {
    var locAll = _tmMacroLocalAll();
    locAll[name] = commands;
    _tmMacroLocalSave(locAll);
    _tmL('tok', '🔒 "' + name + '" შენახულია (' + commands.length + ' ბრძანება)');
  } else {
    if (typeof window.macroOverrideSave !== 'function') { _tmL('ter', '✗ macroOverrideSave ვერ მოიძებნა (runtime.js?)'); return; }
    var sres = await window.macroOverrideSave(name, commands);
    if (sres === true) _tmL('tok', '🌐 "' + name + '" შენახულია — ყველა viewer-ს ეჩვენება');
    else _tmL('ter', '✗ Supabase: ' + (sres && sres.msg ? sres.msg : 'უცნობი'));
  }
}

function _tmMacroLs() {
  var locals = _tmMacroLocalAll();
  var shared = window._tmMacroShared || {};
  _tmL('tdm', _SEP);
  var any = false;
  Object.keys(locals).forEach(function (n) {
    any = true;
    _tmL('tnf', '🔒 ' + n + '  (' + locals[n].length + ' ბრძანება)');
  });
  Object.keys(shared).forEach(function (n) {
    if (locals[n]) return; // local already shown, and takes precedence
    any = true;
    _tmL('tnf', '🌐 ' + n + '  (' + shared[n].length + ' ბრძანება)');
  });
  if (!any) _tmL('tdm', '(შორთკატები არ არსებობს)');
  _tmL('tdm', _SEP);
}

// Cross-file hook — e.g. a dialogue marker effect can call window.runMacro('name')
// to replay a saved shortcut from inside an NPC conversation.
window.runMacro = function (name) {
  var cmds = _tmMacroResolve(name);
  if (!cmds) { if (typeof _tmL === 'function') _tmL('ter', 'მაკრო ვერ მოიძებნა: "' + name + '"'); return false; }
  _tmRunChain(cmds);
  return true;
};

// ── Izivei window-builder engine (step 2: trigger command + storage layer) ──
// Mirrors the macro engine's duality pattern exactly:
//   local   — localStorage, this device only, instant, no Supabase round-trip
//   საერთო  — Supabase (izivei_windows table), every viewer sees it on next load
// A saved window IS a brand-new command too: typing its exact name (with /)
// opens it, same precedence rule as macros (local wins over shared on a name
// clash) — see _tmRun's dispatch chain above, right after _tmMacroResolve.
//
// Window-builder UI (field/widget rendering, button-chain editor) is step 3
// — DONE: real render lives in runtime.js as _tmIziviOpenWindow (same
// cross-file convention as toggleMenu/applyScale — terminal.js calls it,
// runtime.js owns the DOM). The step-2 placeholder that used to live here
// has been removed now that the real implementation exists.

function _tmIziviLocalKey() { return 'mdelo_izivei_local_' + ((typeof _CFG !== 'undefined' && _CFG && _CFG.title) || 'map'); }
function _tmIziviLocalAll() {
  try { return JSON.parse(localStorage.getItem(_tmIziviLocalKey()) || '{}'); } catch (e) { return {}; }
}
function _tmIziviLocalSave(all) {
  try { localStorage.setItem(_tmIziviLocalKey(), JSON.stringify(all)); return true; } catch (e) { return false; }
}

// Exact-name lookup across both scopes. Returns a window-JSON object or null.
// Same precedence as _tmMacroResolve: local always wins over shared.
function _tmIziviResolve(full) {
  var name = (full || '').trim();
  if (!name) return null;
  var locals = _tmIziviLocalAll();
  if (locals[name]) return locals[name];
  if (window._tmIziviShared && window._tmIziviShared[name]) return window._tmIziviShared[name];
  return null;
}

// /იზივეი local|საერთო <სახელი>
// Opens the builder for a brand-new window (or re-opens an existing one of
// the same scope+name to edit it — builder UI itself is step 3). This
// command only handles creation/lookup + the collision rules below; it does
// NOT open a window by bare name — that's _tmIziviResolve's job, checked
// earlier in _tmRun's dispatch chain.
//
// Collision rules (IZIVEI_SCOPE design discussion):
//   local create, name already used by another LOCAL window → silent overwrite
//     (same as macro's local scope — no confirmation, matches user's own
//     instant/no-round-trip expectation for local scope)
//   local create, name already used by a SHARED window → not a collision —
//     local precedence on resolve means this is fine, the global window is
//     simply shadowed for this device when typing the bare name; the shared
//     row itself is untouched.
//   საერთო create, name already used by another SHARED window → CANNOT
//     silently overwrite. Warn the person the name already exists globally,
//     and require them to either pick a new name or explicitly confirm they
//     want to overwrite (re-issue the same command with `force` as a 3rd
//     arg). Permission-check on *who* is allowed to overwrite a global
//     window is a STUB here — real access control is out of this scope
//     (PROGRESSION_ENGINE_SCOPE_V1.md), so for now any viewer can force an
//     overwrite once warned.
//   საერთო create, name already used by a LOCAL window (for this device) →
//     not a collision either, by the same local-precedence logic — the
//     shared window is created normally; this device just won't see it by
//     bare name (its own local one shadows it), a known macro-engine-style
//     trade-off, not specially handled.
async function _tmIzivei(args) {
  var scope = (args[0] || '').trim();
  var rest = args.slice(1);
  var force = false;
  if (rest.length && rest[rest.length - 1] === 'force') { force = true; rest = rest.slice(0, -1); }
  var name = rest.join(' ').trim();

  if (scope !== 'local' && scope !== 'საერთო') {
    _tmL('ter', 'მითხარი scope: /იზივეი local <სახელი>  ან  /იზივეი საერთო <სახელი>');
    return;
  }
  if (!name) { _tmL('ter', 'სახელი არ მიუთითე'); return; }
  if (_TM_RESERVED.indexOf(name) >= 0) { _tmL('ter', '✗ "' + name + '" დაცული სახელია — სხვა აარჩიე'); return; }

  if (scope === 'local') {
    var locAll = _tmIziviLocalAll();
    var isOverwrite = !!locAll[name];
    // silent overwrite — no confirmation needed for local scope
    _tmIziviBuilderOpen(scope, name, locAll[name] || null);
    if (isOverwrite) _tmL('tdm', '("' + name + '" — local ფანჯარა უკვე არსებობს, ედიტში გადააწერ)');
    return;
  }

  // საერთო — check for an existing SHARED window under this name first
  var shared = window._tmIziviShared || {};
  if (shared[name] && !force) {
    _tmL('ter', '✗ "' + name + '" სახელი უკვე არსებობს გლობალურად');
    _tmL('tdm', 'მოიფიქრე ახალი სახელი, ან დაადასტურე: /იზივეი საერთო ' + name + ' force');
    return;
  }
  if (shared[name] && force) {
    // STUB: real permission check belongs here once access-control exists
    // (PROGRESSION_ENGINE_SCOPE_V1.md). For now, force always succeeds.
    _tmL('tdm', '⚠️ გლობალური "' + name + '" — გადაწერად ეხსნება ედიტში');
  }
  _tmIziviBuilderOpen(scope, name, shared[name] || null);
}

// Builder-open placeholder — step 3 replaces this with the actual editor UI
// (title/buttons/fields inline editing per IZIVEI_SCOPE scope item 6).
// existing is the prior window-JSON if this is an edit/overwrite, else null.
function _tmIziviBuilderOpen(scope, name, existing) {
  _tmL('tok', '🛠 Izivei builder — scope:' + scope + ' name:"' + name + '"' + (existing ? ' (არსებულის ედიტი)' : ' (ახალი)'));
  _tmL('tdm', '(builder UI ჯერ არ არსებობს — შემდეგი ნაბიჯი)');
}

