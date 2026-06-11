// ui-areas.js - Hot Area Tool, Properties Modal, Merge
// Depends on: state.js, tools.js

var _editingAreaIdx = -1;
var _mergeMode      = false;
var _lastAreaId     = null;

function _areaAtCell(col, row) {
  return hotAreas.findIndex(function(a) {
    return col >= a.x1 && col < a.x2 && row >= a.y1 && row < a.y2;
  });
}

function onAreaBtn() {
  setTool('area');
  toast('🔗 გადაიტანე არეალის დასახაზად');
}

function openAreaProps(idx) {
  // Merge mode: second tap = merge into group
  if (_mergeMode && _editingAreaIdx >= 0 && idx !== _editingAreaIdx) {
    var src = hotAreas[_editingAreaIdx];
    var dst = hotAreas[idx];
    var gid = src.groupId || ('g_' + Date.now());
    src.groupId = gid;
    dst.groupId = gid;
    _mergeMode      = false;
    var mergedIdx   = _editingAreaIdx;
    _editingAreaIdx = idx;
    scheduleRender();
    toast('✦ გაერთიანდა');
    _showAreaModal(mergedIdx);
    return;
  }
  _mergeMode      = false;
  _editingAreaIdx = idx;
  _showAreaModal(idx);
}

function _showAreaModal(idx) {
  var a = hotAreas[idx];
  document.getElementById('areaLabelInp').value   = a.label   || '';
  document.getElementById('areaTooltipInp').value = a.tooltip || '';

  // Group row
  var gRow = document.getElementById('areaGroupRow');
  if (a.groupId) {
    var cnt = hotAreas.filter(function(x) { return x.groupId === a.groupId; }).length;
    document.getElementById('areaGroupInfo').textContent = '✦ ჯგუფი: ' + cnt + ' არეალი';
    gRow.style.display = 'flex';
  } else {
    gRow.style.display = 'none';
  }

  document.getElementById('areaMergeInfo').style.display = 'none';
  _updateAreaLinkRow();
  document.getElementById('areaPropsModal').style.display = 'flex';
}

function closeAreaProps() {
  document.getElementById('areaPropsModal').style.display = 'none';
  _editingAreaIdx = -1;
  _mergeMode      = false;
}

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

function deleteArea() {
  if (_editingAreaIdx < 0) return;
  var a   = hotAreas[_editingAreaIdx];
  var gid = a.groupId;
  hotAreas.splice(_editingAreaIdx, 1);
  if (gid) {
    var rem = hotAreas.filter(function(x) { return x.groupId === gid; });
    if (rem.length === 1) delete rem[0].groupId;
  }
  document.getElementById('areaPropsModal').style.display = 'none';
  _editingAreaIdx = -1;
  scheduleRender();
  toast('🗑 წაიშალა');
}

function startMergeMode() {
  if (_editingAreaIdx < 0) return;
  _mergeMode = true;
  document.getElementById('areaPropsModal').style.display = 'none';
  document.getElementById('areaMergeInfo').style.display = 'block';
  setTool('area');
  toast('✦ tap სხვა არეალზე');
}

function ungroupArea() {
  if (_editingAreaIdx < 0) return;
  var a   = hotAreas[_editingAreaIdx];
  var gid = a.groupId;
  if (!gid) return;
  delete a.groupId;
  var rem = hotAreas.filter(function(x) { return x.groupId === gid; });
  if (rem.length === 1) delete rem[0].groupId;
  scheduleRender();
  _showAreaModal(_editingAreaIdx);
  toast('✦ ჯგუფიდან გამოვიდა');
}

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

function copyAreaViewerLink() {
  var val  = document.getElementById('areaLinkOut').value;
  if (!val) return;
  var base = (typeof spotBaseUrl !== 'undefined' ? spotBaseUrl : '') || '';
  _doCopy(base ? base + val : val, 'ok dakopirda');
}

function copyAreaFitLink() {
  if (_editingAreaIdx < 0) return;
  var a     = hotAreas[_editingAreaIdx];
  var group = a.groupId
    ? hotAreas.filter(function(x) { return x.groupId === a.groupId; })
    : [a];
  var x1 = Math.min.apply(null, group.map(function(r) { return r.x1; }));
  var y1 = Math.min.apply(null, group.map(function(r) { return r.y1; }));
  var x2 = Math.max.apply(null, group.map(function(r) { return r.x2; }));
  var y2 = Math.max.apply(null, group.map(function(r) { return r.y2; }));
  var base = (typeof spotBaseUrl !== 'undefined' ? spotBaseUrl : '') || '';
  var link = base + '#fit=' + x1 + ',' + y1 + ',' + x2 + ',' + y2;
  if (a.groupId) link += '&group=' + encodeURIComponent(a.groupId);
  _doCopy(link, 'ok fit link dakopirda');
}

function insertAreaLink() {
  var ta  = document.getElementById('areaTooltipInp');
  var val = ta.value;
  ta.value = val + (val && !val.endsWith('\n') ? '\n' : '') + '[[saxeli|https://example.com]]';
  ta.focus();
}

function _doCopy(text, msg) {
  var done = function() { toast(msg); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(function() {
      if (typeof _copyFallback === 'function') _copyFallback(text);
      done();
    });
  } else {
    if (typeof _copyFallback === 'function') _copyFallback(text);
    done();
  }
}

window._areaAtCell        = _areaAtCell;
window.onAreaBtn          = onAreaBtn;
window.openAreaProps      = openAreaProps;
window.closeAreaProps     = closeAreaProps;
window.saveAreaProps      = saveAreaProps;
window.deleteArea         = deleteArea;
window.startMergeMode     = startMergeMode;
window.ungroupArea        = ungroupArea;
window._updateAreaLinkRow = _updateAreaLinkRow;
window.insertAreaLink     = insertAreaLink;
window.copyAreaViewerLink = copyAreaViewerLink;
window.copyAreaFitLink    = copyAreaFitLink;
