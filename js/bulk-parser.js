// ============================================================
//  bulk-parser.js — Bulk DSL → dialogue[] converter
//  Depends on: nothing (pure functions)
//  Load order: after objects.js, before ui-palette.js
// ============================================================

//
// DSL syntax reference:
//   @N [marker] title        — node start  (marker: ! ? ...)
//   [speaker] text           — named speaker block
//   [] text                  — player name placeholder
//   plain text               — narrator (no speaker)
//   {atmosphere text}        — atmosphere / effect line
//   [[label|url]]            — external link (inline)
//   [[object name]]          — map object link (inline)
//   -> text =>N              — choice button, no notification
//   ->! text =>N             — choice + notification (auto text)
//   -> text ->! notif =>N    — choice + explicit notification text
//
// Returns: { nodes: Array, title: string, marker: string }
//   nodes  — dialogue[] ready for _editingDialogue
//   title  — object title from @0 header (may be "")
//   marker — object marker from @0 header (! ? 💬 or "")
//

function parseBulkDSL(raw) {
  const lines  = raw.replace(/\r\n/g, '\n').split('\n');
  const result = [];

  let cur     = null;   // node being built
  let speaker = null;   // null=narrator | ""=player | "name"=named
  let textBuf = [];     // accumulated lines for current text block

  let rootTitle  = '';
  let rootMarker = '';

  // flush accumulated text buffer into cur.text as HTML
  function flush() {
    if (!cur || !textBuf.length) { textBuf = []; return; }
    const block = textBuf.join(' ').trim();
    if (!block) { textBuf = []; return; }

    let html;
    if (speaker === null) {
      // narrator — plain text
      html = _esc(block);
    } else if (speaker === '') {
      // player placeholder
      html = '<b>[]</b> ' + _esc(block);
    } else {
      html = '<b>' + _esc(speaker) + '</b> ' + _esc(block);
    }

    cur.text += (cur.text ? '<br>' : '') + html;
    textBuf = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // ── @N node header ──────────────────────────────────────
    if (/^@\d/.test(line)) {
      if (cur) { flush(); result.push(cur); }

      const m      = line.match(/^@(\d+)\s*(\.\.\.|[!?])?\s*(.*)/);
      const idx    = m ? m[1] : '0';
      const mrkRaw = m ? (m[2] || '').trim() : '';
      const title  = m ? (m[3] || '').trim() : '';
      const marker = mrkRaw === '!'   ? '!'  :
                     mrkRaw === '?'   ? '?'  :
                     mrkRaw === '...' ? '💬' : '';

      if (idx === '0') { rootTitle = title; rootMarker = marker; }

      cur     = { id: 'node_' + idx, text: '', buttons: [] };
      speaker = null;
      textBuf = [];
      continue;
    }

    if (!cur) continue;

    // ── choice line ──────────────────────────────────────────
    if (/^->/.test(line)) {
      flush();
      const btn = _parseBtn(line);
      if (btn) {
        if (cur.buttons.length < 3) {
          cur.buttons.push(btn);
        }
        // silently drop 4th+ buttons (editor limit is 3)
      }
      continue;
    }

    // ── atmosphere {text} ────────────────────────────────────
    const atmM = line.match(/^\{(.+)\}$/);
    if (atmM) {
      flush();
      speaker = null;
      cur.text += (cur.text ? '<br>' : '') +
                  '<i>' + _esc(atmM[1].trim()) + '</i>';
      continue;
    }

    // ── speaker [name] or [] ─────────────────────────────────
    // matches [anything] at start of line, followed by optional text
    const spkM = line.match(/^\[([^\]]*)\](.*)/);
    if (spkM) {
      flush();
      speaker       = spkM[1];           // "" = player, "name" = named
      const rest    = spkM[2].trim();
      if (rest) textBuf.push(rest);
      continue;
    }

    // ── empty line → flush block, reset speaker ──────────────
    if (!line.trim()) {
      flush();
      speaker = null;
      continue;
    }

    // ── regular text line ────────────────────────────────────
    textBuf.push(line.trim());
  }

  // finalize last node
  if (cur) { flush(); result.push(cur); }

  return { nodes: result, title: rootTitle, marker: rootMarker };
}

// ── choice line parser ──────────────────────────────────────
function _parseBtn(line) {
  let rest   = line;
  let notify = false;

  // strip leading ->! or ->
  if (rest.startsWith('->!')) {
    notify = true;
    rest   = rest.slice(3).trim();
  } else {
    rest = rest.slice(2).trim();
  }

  // extract =>N at end
  let nextNode = '';
  const nxtM = rest.match(/^(.*?)\s*=>(\d+)\s*$/);
  if (nxtM) {
    rest     = nxtM[1].trim();
    nextNode = 'node_' + nxtM[2];
  }

  // extract inline " ->! notif_text" separator
  let notifyText = '';
  const sep = rest.indexOf(' ->! ');
  if (sep >= 0) {
    notifyText = rest.slice(sep + 5).trim();
    rest       = rest.slice(0, sep).trim();
    notify     = true;
  }

  if (!rest) return null;
  return { label: rest, nextNode, notify, notifyText, link: '' };
}

// ── minimal HTML escape ─────────────────────────────────────
function _esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── WINDOW BINDINGS ────────────────────────────────────────
window.parseBulkDSL = parseBulkDSL;
