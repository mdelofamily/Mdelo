// ============================================================
//  bulk-parser.js — Bulk DSL → dialogue[] converter
//  Depends on: nothing (pure functions)
//  Load order: after objects.js, before ui-palette.js
// ============================================================

//
// DSL syntax reference:
//   @N [marker] title   — node start  (marker: ! ? ...)
//   [speaker] text      — named speaker block
//   [] text             — player name placeholder
//   plain text          — narrator (no speaker)
//   {atmosphere text}   — atmosphere / effect line
//   [[label|url]]       — external link (inline)
//   [[object name]]     — map object link (inline)
//   -> text =>N         — choice, no notification
//   ->. text =>N        — choice + 💬 info
//   ->! text =>N        — choice + ⚠ warning
//   ->!! text =>N       — choice + ❗ danger
//   ->< text =>N        — choice + ✅ done
//   ->> text =>N        — choice + 🚀 project
//
// Returns: { nodes: Array, title: string, marker: string }
//   nodes  — dialogue[] ready for _editingDialogue
//   title  — object title from @0 header (may be "")
//   marker — object marker from @0 header (! ? 💬 or "")
//

// valid notification types (must match notify.html / viewer)
const NOTIFY_TYPES = {
  info:    '💬',
  warning: '⚠',
  danger:  '❗',
  done:    '✅',
  project: '🚀'
};

// DSL prefix → notifyType  (order matters: ->!! before ->!)
const NOTIFY_PREFIXES = [
  { prefix: '->!!', type: 'danger'  },
  { prefix: '->>',  type: 'project' },
  { prefix: '->.',  type: 'info'    },
  { prefix: '->!',  type: 'warning' },
  { prefix: '-><',  type: 'done'    },
];

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
      const marker = mrkRaw === '!'   ? '!'   :
                     mrkRaw === '?'   ? '?'   :
                     mrkRaw === '...' ? '...' : '';

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
      cur.text += (cur.text ? '<br>' : '') + _esc(atmM[1].trim());
      continue;
    }

    // ── speaker [name] or [] ─────────────────────────────────
    // matches [anything] at start of line, followed by optional text
    const spkM = line.match(/^\[([^\]]*)\](.*)/);
    if (spkM) {
      flush();
      speaker    = spkM[1];           // "" = player, "name" = named
      const rest = spkM[2].trim();
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
  let rest       = line;
  let notify     = false;
  let notifyType = null;

  // match prefix (longest first — ->!! before ->!)
  for (const { prefix, type } of NOTIFY_PREFIXES) {
    if (rest.startsWith(prefix)) {
      notify     = true;
      notifyType = type;
      rest       = rest.slice(prefix.length).trim();
      break;
    }
  }

  // plain -> with no notify prefix
  if (!notify) {
    rest = rest.slice(2).trim();
  }

  // extract =>N at end
  let nextNode = '';
  const nxtM = rest.match(/^(.*?)\s*=>(\d+)\s*$/);
  if (nxtM) {
    rest     = nxtM[1].trim();
    nextNode = 'node_' + nxtM[2];
  }

  if (!rest) return null;
  return { label: rest, nextNode, notify, notifyType, notifyText: '', link: '' };
}

// ── minimal HTML escape ─────────────────────────────────────
function _esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── dialogue[] → DSL serializer ────────────────────────────
function unparseDialogue(o) {
  const nodes  = o.dialogue || [];
  const title  = o.title  || o.lb || '';
  const marker = o.marker || '';
  if (!nodes.length && !title) return '';

  const mrkSym = marker === '!' ? '!' : marker === '?' ? '?' : marker === '💬' ? '...' : '';
  const lines  = [];

  // notifyType → DSL prefix
  const TYPE_PREFIX = {
    info:    '->.',
    warning: '->!',
    danger:  '->!!',
    done:    '-><',
    project: '->>',
  };

  nodes.forEach((node, ni) => {
    // node header
    const hdr = '@' + ni +
      (mrkSym && ni === 0 ? ' ' + mrkSym : '') +
      (title  && ni === 0 ? ' ' + title  : '');
    lines.push(hdr);

    // text — strip HTML tags back to plain DSL
    if (node.text) {
      const plain = node.text
        .replace(/<br>/gi, '\n')
        .replace(/<b>\[\]<\/b>\s*/gi, '[] ')
        .replace(/<b>([^<]*)<\/b>\s*/gi, '[$1] ')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g,  '<')
        .replace(/&gt;/g,  '>');
      plain.split('\n').forEach(l => { if (l.trim()) lines.push(l.trim()); });
    }

    // buttons
    (node.buttons || []).forEach(btn => {
      if (!btn.label) return;
      const next   = btn.nextNode ? ' =>' + btn.nextNode.replace('node_', '') : '';
      const prefix = btn.notify ? (TYPE_PREFIX[btn.notifyType] || '->!') : '->';
      lines.push(prefix + ' ' + btn.label + next);
    });

    if (ni < nodes.length - 1) lines.push('');
  });

  return lines.join('\n');
}

// ── WINDOW BINDINGS ────────────────────────────────────────
window.parseBulkDSL    = parseBulkDSL;
window.unparseDialogue = unparseDialogue;
