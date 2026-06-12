// unlock.js — Mdelo Viewer: Flag-based Unlock Engine
// No ES modules. Everything on window.
// Load after: chat.js (for _tmPrint fallback awareness)
// Provides: canTrigger, completeDialog, flagSet/Clear/Has/List/Reset,
//           unlockHandleCmd (/flag terminal commands), unlockInit

(function (global) {
  'use strict';

  var STORAGE_KEY = 'mdelo_flags';

  // ─────────────────────────────────────────────────────────────────────────
  // Flag storage (localStorage → JSON array of strings)
  // ─────────────────────────────────────────────────────────────────────────
  function _load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function _save(arr) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public Flag API
  // ─────────────────────────────────────────────────────────────────────────
  function flagSet(name) {
    name = String(name).trim();
    if (!name) return false;
    var arr = _load();
    if (arr.indexOf(name) === -1) { arr.push(name); _save(arr); }
    return true;
  }

  function flagClear(name) {
    name = String(name).trim();
    var arr = _load();
    var idx = arr.indexOf(name);
    if (idx === -1) return false;
    arr.splice(idx, 1);
    _save(arr);
    return true;
  }

  function flagHas(name) {
    return _load().indexOf(String(name).trim()) !== -1;
  }

  function flagList() {
    return _load().slice();
  }

  function flagReset() {
    _save([]);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // canTrigger(dialog)
  // Returns true if all dialog.requires.flags are set.
  // An unlocked dialog also needs flag "dialog_unlocked:<id>" if it was
  // originally locked (i.e. it appears in another dialog's unlock_dialogs).
  // ─────────────────────────────────────────────────────────────────────────
  function canTrigger(dialog) {
    if (!dialog) return false;
    var req = dialog.requires;

    // If dialog has no requirements it's always available
    if (!req) return true;

    var stored = _load();

    // Check required flags
    var need = req.flags || [];
    for (var i = 0; i < need.length; i++) {
      if (stored.indexOf(need[i]) === -1) return false;
    }

    // Optional: min_level guard (level system TBD)
    // if (dialog.min_level && (global.playerLevel || 0) < dialog.min_level) return false;

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // completeDialog(dialog)
  // Applies dialog.on_complete: set_flags, unlock_areas, unlock_dialogs.
  // Fires CustomEvent "mdelo:dialog_complete" on document.
  // ─────────────────────────────────────────────────────────────────────────
  function completeDialog(dialog) {
    if (!dialog || !dialog.on_complete) return;
    var oc = dialog.on_complete;

    // 1. Set flags
    (oc.set_flags || []).forEach(function (f) { flagSet(f); });

    // 2. Unlock areas (activates hotspot + stores flag)
    (oc.unlock_areas || []).forEach(function (areaId) {
      _unlockArea(areaId);
    });

    // 3. Unlock dialogs (stored as a special flag)
    (oc.unlock_dialogs || []).forEach(function (dialogId) {
      flagSet('dialog_unlocked:' + dialogId);
    });

    // 4. Dispatch event so external systems can react
    try {
      document.dispatchEvent(
        new CustomEvent('mdelo:dialog_complete', { detail: { dialog: dialog } })
      );
    } catch (e) {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // isDialogUnlocked(dialogId)
  // True if another dialog's on_complete already called unlock_dialogs for it.
  // ─────────────────────────────────────────────────────────────────────────
  function isDialogUnlocked(dialogId) {
    return flagHas('dialog_unlocked:' + dialogId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Area unlock helpers
  // ─────────────────────────────────────────────────────────────────────────
  function _unlockArea(areaId) {
    flagSet('area_unlocked:' + areaId);
    // Activate any .hotspot[data-area-id] elements on the map
    var sel = '.hotspot[data-area-id="' + areaId + '"], .hs-area[data-area-id="' + areaId + '"]';
    var els = document.querySelectorAll(sel);
    els.forEach(function (el) {
      el.classList.remove('no-interact');
      // Add a dot marker if the element has no visible indicator yet
      if (!el.querySelector('.hs-marker') && !el.querySelector('.hs-dot')) {
        var dot = document.createElement('div');
        dot.className = 'hs-dot';
        el.appendChild(dot);
      }
    });
  }

  function isAreaUnlocked(areaId) {
    return flagHas('area_unlocked:' + areaId);
  }

  // Re-apply area unlocks on every page load (flags persist across sessions)
  function _restoreAreas() {
    _load().forEach(function (f) {
      if (f.indexOf('area_unlocked:') === 0) {
        _unlockArea(f.slice('area_unlocked:'.length));
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Terminal /flag command handler
  //
  // Usage from terminal.js input handler:
  //   var parts = text.slice(1).split(/\s+/);
  //   if (parts[0] === 'flag') { unlockHandleCmd(parts); return; }
  //
  // Subcommands:
  //   /flag set <name>       — flag-ის დაყენება
  //   /flag clear <name>     — flag-ის წაშლა
  //   /flag check <name>     — flag-ის შემოწმება
  //   /flag list             — ყველა flag-ის სია
  //   /flag reset            — ყველა flag-ის გასუფთავება
  // ─────────────────────────────────────────────────────────────────────────
  function unlockHandleCmd(parts) {
    var sub = (parts[1] || '').toLowerCase();
    var arg = parts.slice(2).join(' ').trim();

    switch (sub) {
      case 'set':
        if (!arg) { _pr('გამოყენება: /flag set <სახელი>', 'ter'); return true; }
        flagSet(arg);
        _pr('✓ flag დაყენდა: ' + arg, 'tok');
        return true;

      case 'clear':
      case 'del':
        if (!arg) { _pr('გამოყენება: /flag clear <სახელი>', 'ter'); return true; }
        if (flagClear(arg)) { _pr('✗ flag წაიშალა: ' + arg, 'tnf'); }
        else                { _pr('flag არ არსებობს: ' + arg, 'ter'); }
        return true;

      case 'check':
        if (!arg) { _pr('გამოყენება: /flag check <სახელი>', 'ter'); return true; }
        _pr(arg + ': ' + (flagHas(arg) ? '✓ true' : '✗ false'),
            flagHas(arg) ? 'tok' : 'tnf');
        return true;

      case 'list':
      case 'ls':
        var fl = flagList();
        if (!fl.length) {
          _pr('flags: ცარიელი', 'tdm');
        } else {
          _pr('flags (' + fl.length + '):', 'tsy');
          fl.forEach(function (f) { _pr('  · ' + f, 'tdm'); });
        }
        return true;

      case 'reset':
        flagReset();
        _pr('ყველა flag გასუფთავდა', 'tnf');
        return true;

      default:
        _pr('/flag  set|clear|check|list|reset', 'tsy');
        return true;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Terminal print helper
  // Priority: tmPrint (terminal.js) → consolePrint (chat.js) → direct DOM
  // ─────────────────────────────────────────────────────────────────────────
  function _pr(msg, cls) {
    if (typeof global.tmPrint === 'function') {
      global.tmPrint(msg, cls || 'tdm');
      return;
    }
    // Direct DOM fallback (matches index.html terminal classes)
    var out = document.getElementById('tmOut');
    if (!out) return;
    var line = document.createElement('div');
    line.className = 'tl ' + (cls || 'tdm');
    line.textContent = msg;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-hook: intercept #tmIn keydown if terminal.js doesn't already handle
  // /flag commands. Runs after DOMContentLoaded.
  // ─────────────────────────────────────────────────────────────────────────
  function _hookTerminalInput() {
    var inp = document.getElementById('tmIn');
    if (!inp || inp._unlockHooked) return;
    inp._unlockHooked = true;

    inp.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var raw = inp.value.trim();
      if (!raw) return;
      if (raw.charAt(0) !== '/') return;

      var parts = raw.slice(1).split(/\s+/);
      if (parts[0].toLowerCase() !== 'flag') return;

      // We handle /flag — prevent terminal.js from seeing it as unknown
      e.stopImmediatePropagation();
      // Let the default submit finish first, then process
      setTimeout(function () {
        unlockHandleCmd(parts);
      }, 0);
    }, true); // capture phase — runs before terminal.js listener
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────────────────
  function unlockInit() {
    _restoreAreas();
    _hookTerminalInput();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', unlockInit);
  } else {
    unlockInit();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────
  global.canTrigger       = canTrigger;
  global.completeDialog   = completeDialog;
  global.isDialogUnlocked = isDialogUnlocked;
  global.isAreaUnlocked   = isAreaUnlocked;
  global.flagSet          = flagSet;
  global.flagClear        = flagClear;
  global.flagHas          = flagHas;
  global.flagList         = flagList;
  global.flagReset        = flagReset;
  global.unlockHandleCmd  = unlockHandleCmd;
  global.unlockInit       = unlockInit;

}(window));
