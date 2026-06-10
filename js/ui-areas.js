// ============================================================
//  ui-areas.js  —  Hot Area Tool, Properties Modal, Merge
//  Depends on: state.js, tools.js
// ============================================================

var _editingAreaIdx = -1;
var _mergeMode      = false;
var _lastAreaId     = null;

// ── HELPER: find area index at tile cell ──
function _areaAtCell(col, row) {
  return hotAreas.findIndex(function(a) {
    return col >= a.x1 && col < a.x2 && row >= a.y1 && row < a.y2;
  });
}

// ── AREA BUTTON ──
function onAreaBtn() {
  setTool('area');
  toast('🔗 გადაიტანე არეალის დასახაზად');
}

// ── OPEN PROPS MODAL ──
function openAreaProps(idx) {
  if (_mergeMode && _editingAreaIdx >= 0 && idx !== _editingAreaIdx) {
    var src = hotAreas[_editingAreaIdx];
    var dst = hotAreas[idx];
    var gid = src.groupId || ('g_' + Date.now());
    src.groupId = gid;
    dst.groupId = gid;
    _mergeMode      = false;
    _editingAreaIdx = -1;
    scheduleRender();
    toast('✦ გაერთიანდა');
    return;
  }
  _editingAreaIdx = idx;
  _mergeMode      = false;
  var a = hotAreas[idx];
  document.getElementById('areaLabelInp').value   = a.label   || '';
  document.getElementById('areaTooltipInp').value = a.tooltip || '';
  document.getElementById('areaMergeInfo').style.display = 'none';
  _updateAreaLinkRow();
  document.getElementById('areaPropsModal').style.display = 'flex';
}

// ── CLOSE MODAL ──
function closeAreaProps() {
  document.getElementById('areaPropsModal').style.display = 'none';
  _editingAreaIdx = -1;
  _mergeMode      = false;
}

// ── SAVE ──
function saveAreaProps() {
  if (_editingAreaIdx < 0 || _editingAreaIdx >= hotAreas.length) {
    closeAreaProps(); return;
  }
  var a     = hotAreas[_editingAreaIdx];
  a.label   = document.getElementById('areaLabelInp').value.trim();
  a.tooltip = document.getElementById('areaTooltipInp').value.trim();
  closeAreaProps();
  scheduleRender();
  toast('✓ შენახულია');
}

// ── DELETE ──
function deleteArea() {
  if (_editingAreaIdx < 0) return;
  hotAreas.splice(_editingAreaIdx, 1);
  document.getElementById('areaPropsModal').style.display = 'none';
  _editingAreaIdx = -1;
  _mergeMode      = false;
  scheduleRender();
  toast('🗑 წაიშალა');
}

// ── MERGE MODE ──
function startMergeMode() {
  if (_editingAreaIdx < 0) return;
  _mergeMode = true;
  document.getElementById('areaMergeInfo').style.display = 'block';
  document.getElementById('areaPropsModal').style.display = 'none';
  setTool('area');
  toast('✦ tap სხვა არეალზე გასაერთიანებლად');
}

// ── LINK ROW UPDATE ──
function _updateAreaLinkRow() {
  var label = (document.getElementById('areaLabelInp').value || '').trim();
  var row   = document.getElementById('areaLinkRow');
  if (label) {
    row.style.display = 'flex';
    document.getElementById('areaLinkOut').value = '#area=' + encodeURIComponent(label);
  } else {
    row.style.display = 'none';
  }
}

// ── INSERT LINK TEMPLATE ──
function insertAreaLink() {
  var ta  = document.getElementById('areaTooltipInp');
  var val = ta.value;
  ta.value = val + (val && !val.endsWith('\n') ? '\n' : '') + '[[სახელი|https://example.com]]';
  ta.focus();
}

// ── COPY VIEWER LINK ──
function copyAreaViewerLink() {
  var val  = document.getElementById('areaLinkOut').value;
  if (!val) return;
  var base = (typeof spotBaseUrl !== 'undefined' ? spotBaseUrl : '') || '';
  var full = base ? base + val : val;
  var done = function() { toast('📋 დაკოპირდა!'); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(full).then(done).catch(function() {
      if (typeof _copyFallback === 'function') _copyFallback(full);
      done();
    });
  } else {
    if (typeof _copyFallback === 'function') _copyFallback(full);
    done();
  }
}

// ── WINDOW BINDINGS ──
window._areaAtCell        = _areaAtCell;
window.onAreaBtn          = onAreaBtn;
window.openAreaProps      = openAreaProps;
window.closeAreaProps     = closeAreaProps;
window.saveAreaProps      = saveAreaProps;
window.deleteArea         = deleteArea;
window.startMergeMode     = startMergeMode;
window._updateAreaLinkRow = _updateAreaLinkRow;
window.insertAreaLink     = insertAreaLink;
window.copyAreaViewerLink = copyAreaViewerLink;
