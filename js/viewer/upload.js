// upload.js — media upload modal for text-item illustrations (segments[])
// injected inline by export-html.js assembler, AFTER runtime.js (needs SUPA_URL,
// SUPA_KEY, _MAP_ID, _authHeaders(), window.myDisplayName/_tierAtLeast) and
// BEFORE terminal.js (which calls window.mdMediaOpen()).
//
// Bucket: 'illustrations', path "{nick}/{timestamp}-{filename}".
// ⚠️ UNCONFIRMED (scope open item #4): bucket must exist with an authenticated
// INSERT policy (caretaker+) and a public SELECT/read policy — this is Supabase
// Dashboard config, nothing here can create or verify it. If uploads fail with
// a 400/403 from the /storage/v1/object/ call, check the bucket + its RLS
// policies first, not this file.
//
// window.mdMediaOpen() → Promise<Array<{type,url,name}> | null>
//   resolves with the uploaded file descriptors (type: 'image'|'audio'|'text'),
//   or null if the person cancels / picks nothing. Never rejects — every
//   failure path resolves null after reporting the error in the modal itself,
//   so callers (terminal.js) never need a .catch().

var _MD_BUCKET       = 'illustrations';
var _MD_MAX_BYTES    = 5 * 1024 * 1024; // 5MB/file
var _MD_MAX_PER_MIN  = 5;               // client-side throttle only — NOT a security boundary,
                                         // the real backstop (if any) has to be a Storage/RLS-side limit
var _mdUploadTimes   = []; // in-memory sliding window, per page load

var _MD_TYPES = {
  'image/jpeg': 'image', 'image/jpg': 'image', 'image/png': 'image', 'image/webp': 'image',
  'audio/mpeg': 'audio', 'audio/mp3': 'audio',
  'text/plain': 'text'
};
var _MD_ACCEPT = Object.keys(_MD_TYPES).join(',');

function _mdDetectType(file) {
  if (_MD_TYPES[file.type]) return _MD_TYPES[file.type];
  // Some browsers/OSes send an empty/wrong .type for mp3/txt — fall back to extension.
  var ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp') return 'image';
  if (ext === 'mp3') return 'audio';
  if (ext === 'txt') return 'text';
  return null;
}

function _mdValidateFile(file) {
  if (file.size > _MD_MAX_BYTES) return { ok: false, msg: 'ფაილი > 5MB: ' + file.name };
  if (!_mdDetectType(file)) return { ok: false, msg: 'მხარდაუჭერელი ტიპი: ' + file.name + ' (jpg/png/webp/mp3/txt)' };
  return { ok: true };
}

function _mdThrottleOk() {
  var cut = Date.now() - 60000;
  _mdUploadTimes = _mdUploadTimes.filter(function (t) { return t > cut; });
  return _mdUploadTimes.length < _MD_MAX_PER_MIN;
}

// Storage keys are a lot pickier than a display name — strip everything but
// alnum + Georgian + a few safe separators so the path never needs encoding.
function _mdSanitizePathPart(s) {
  return String(s || '').replace(/[^a-zA-Z0-9ა-ჿ._-]/g, '_').replace(/_+/g, '_').slice(0, 80) || 'x';
}

function _mdNick() {
  var raw = (typeof window.myDisplayName === 'function') ? window.myDisplayName() : (localStorage.getItem('mdelo_nick') || 'მოგზაური');
  return _mdSanitizePathPart(raw);
}

// Uploads one already-validated file, returns {type, url, name} or throws.
async function _mdUploadOne(file) {
  var type = _mdDetectType(file);
  var path = _mdNick() + '/' + Date.now() + '-' + _mdSanitizePathPart(file.name);

  var r = await fetch(SUPA_URL + '/storage/v1/object/' + _MD_BUCKET + '/' + path, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': file.type || 'application/octet-stream' }, _authHeaders()),
    body: file
  });
  if (!r.ok) {
    var errBody = await r.text().catch(function () { return ''; });
    throw new Error('HTTP ' + r.status + ': ' + errBody.slice(0, 150));
  }
  // Assumes the bucket is public — see the ⚠️ note at the top of this file.
  var url = SUPA_URL + '/storage/v1/object/public/' + _MD_BUCKET + '/' + path;
  return { type: type, url: url, name: file.name };
}

// ── modal DOM (built dynamically — index.html is never touched) ──
function _mdBuildModal(resolve) {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';

  var box = document.createElement('div');
  box.style.cssText = 'background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:16px;width:100%;max-width:360px;display:flex;flex-direction:column;gap:10px;font-family:inherit;';

  var title = document.createElement('div');
  title.textContent = '📎 მედია ატვირთვა';
  title.style.cssText = 'font-size:14px;font-weight:600;color:var(--text);';

  var hint = document.createElement('div');
  hint.textContent = 'jpg / png / webp / mp3 / txt — მაქს. 5MB თითო ფაილზე';
  hint.style.cssText = 'font-size:11px;color:var(--muted);';

  var fileI = document.createElement('input');
  fileI.type = 'file'; fileI.accept = _MD_ACCEPT; fileI.multiple = true;
  fileI.style.cssText = 'font-size:12px;color:var(--text);';

  var list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:11px;';

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:4px;';

  var cancelB = document.createElement('button');
  cancelB.textContent = 'გაუქმება';
  cancelB.style.cssText = 'background:none;border:1px solid var(--border);color:var(--text);font-size:12px;padding:6px 12px;border-radius:6px;cursor:pointer;';

  var uploadB = document.createElement('button');
  uploadB.textContent = 'ატვირთვა';
  uploadB.disabled = true;
  uploadB.style.cssText = 'background:var(--accent);border:none;color:#fff;font-size:12px;padding:6px 14px;border-radius:6px;cursor:pointer;opacity:.5;';

  box.appendChild(title); box.appendChild(hint); box.appendChild(fileI); box.appendChild(list);
  btnRow.appendChild(cancelB); btnRow.appendChild(uploadB);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  var done = false;
  function finish(result) {
    if (done) return; done = true;
    overlay.remove();
    resolve(result);
  }

  overlay.addEventListener('pointerdown', function (e) { if (e.target === overlay) finish(null); });
  cancelB.onclick = function () { finish(null); };

  fileI.onchange = function () {
    list.innerHTML = '';
    var files = Array.from(fileI.files || []);
    var anyValid = false;
    files.forEach(function (f) {
      var v = _mdValidateFile(f);
      var row = document.createElement('div');
      row.style.cssText = 'color:' + (v.ok ? 'var(--muted)' : '#e05555') + ';';
      row.textContent = (v.ok ? '✓ ' : '✗ ') + (v.ok ? f.name : v.msg);
      list.appendChild(row);
      if (v.ok) anyValid = true;
    });
    uploadB.disabled = !anyValid;
    uploadB.style.opacity = anyValid ? '1' : '.5';
  };

  uploadB.onclick = async function () {
    var files = Array.from(fileI.files || []).filter(function (f) { return _mdValidateFile(f).ok; });
    if (!files.length) return;
    if (!_mdThrottleOk()) {
      list.innerHTML = '';
      var warn = document.createElement('div');
      warn.style.cssText = 'color:#e05555;';
      warn.textContent = 'ძალიან ბევრი ატვირთვა ბოლო წუთში — მოიცადე ცოტა ხანს';
      list.appendChild(warn);
      return;
    }

    uploadB.disabled = true; cancelB.disabled = true;
    uploadB.textContent = 'იტვირთება...';

    var results = [], errors = [];
    for (var i = 0; i < files.length; i++) {
      try {
        _mdUploadTimes.push(Date.now());
        var res = await _mdUploadOne(files[i]);
        results.push(res);
      } catch (e) {
        errors.push(files[i].name + ': ' + e.message);
      }
    }

    if (errors.length) {
      list.innerHTML = '';
      errors.forEach(function (msg) {
        var row = document.createElement('div');
        row.style.cssText = 'color:#e05555;';
        row.textContent = '✗ ' + msg;
        list.appendChild(row);
      });
      uploadB.textContent = 'ხელახლა ცდა';
      uploadB.disabled = false; cancelB.disabled = false;
      if (!results.length) return; // nothing succeeded — let the person retry or cancel
    }

    finish(results.length ? results : null);
  };
}

// Derives the storage path from a public URL this file generated, so callers
// only ever need to hand back URLs (what they already have in segments[]),
// never raw paths.
function _mdPathFromUrl(url) {
  var prefix = SUPA_URL + '/storage/v1/object/public/' + _MD_BUCKET + '/';
  if (typeof url === 'string' && url.indexOf(prefix) === 0) return url.slice(prefix.length);
  return null;
}

// Best-effort orphan cleanup (scope open item #2). Never throws, never blocks
// the caller — a failed delete just leaves a stray file in the bucket, which
// is a storage-cost problem, not a data-integrity one. Silently ignores any
// URL it didn't generate (e.g. already null/foreign), so it's always safe to
// call with a mixed or partially-empty list.
window.mdMediaDelete = async function (urls) {
  var paths = (urls || []).map(_mdPathFromUrl).filter(Boolean);
  if (!paths.length) return true;
  try {
    var r = await fetch(SUPA_URL + '/storage/v1/object/' + _MD_BUCKET, {
      method: 'DELETE',
      headers: Object.assign({ 'Content-Type': 'application/json' }, _authHeaders()),
      body: JSON.stringify({ prefixes: paths })
    });
    return r.ok;
  } catch (e) { return false; }
};

window.mdMediaOpen = function () {
  // Defensive only — the real gate is the Storage bucket's own INSERT policy.
  // Fails open if the auth engine isn't loaded yet, same philosophy as
  // terminal.js's _tmTierDenied, so this never blocks local dev/testing.
  if (typeof window._tierAtLeast === 'function' && !window._tierAtLeast('caretaker')) {
    return Promise.resolve(null);
  }
  return new Promise(function (resolve) { _mdBuildModal(resolve); });
};
