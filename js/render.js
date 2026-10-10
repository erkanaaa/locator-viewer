/* ==========================================================================
   render.js -- everything that reads `state` and produces DOM/SVG: the
   toolbar, tabs, floor-plan SVGs, side panels, tooltips, and zoom. Calls
   into drag.js (wirePartGroupEvents) and modal.js (openEditPicker,
   openSettingsModal) but never mutates persistence directly -- that's
   state.js's job.
   ========================================================================== */

function showToast(msg, type){
  var c=document.getElementById('toast-container');
  if(!c)return;
  var t=document.createElement('div');
  t.textContent=msg;
  t.style.cssText='background:'+(type==='error'?'#c0392b':type==='warn'?'#e09000':'#2d7a3a')+
    ';color:#fff;padding:.45rem .9rem;border-radius:6px;font-size:.85rem;opacity:1;transition:opacity .4s;pointer-events:none;';
  c.appendChild(t);
  setTimeout(function(){t.style.opacity='0';setTimeout(function(){t.remove();},450);},2800);
}

function icon(name){
  const a = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  switch(name){
    case 'gear': return `<svg ${a} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
  <path d="M10.8 2.4h2.4l.5 2 1.8.9 1.9-.7 1.7 1.7-.7 1.9.9 1.8 2 .5v2.4l-2 .5-.9 1.8.7 1.9-1.7 1.7-1.9-.7-1.8.9-.5 2h-2.4l-.5-2-1.8-.9-1.9.7-1.7-1.7.7-1.9-.9-1.8-2-.5v-2.4l2-.5.9-1.8-.7-1.9 1.7-1.7 1.9.7 1.8-.9.5-2z"/>
  <circle cx="12" cy="12" r="3.5"/>
</svg>`;
	case 'reset': return `<svg ${a}><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>`;
    case 'folder': return `<svg ${a}><path d="M3 6.5a1 1 0 0 1 1-1h5l1.8 2H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>`;
    case 'panel': return `<svg ${a}><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><line x1="9.5" y1="4.5" x2="9.5" y2="19.5"/></svg>`;
    case 'edit': return `<svg ${a}><path d="M4 16.5V20h3.5L18 9.5l-3.5-3.5z"/><path d="M14.5 6 18 9.5"/></svg>`;
    case 'undo': return `<svg ${a}><path d="M8 7 4 11l4 4"/><path d="M4 11h9a6 6 0 1 1 0 12h-1"/></svg>`;
    case 'redo': return `<svg ${a}><path d="M16 7l4 4-4 4"/><path d="M20 11H11a6 6 0 1 0 0 12h1"/></svg>`;
    case 'trash': return `<svg ${a}><path d="M5 7h14"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M7 7l1 12.5A1.5 1.5 0 0 0 9.5 21h5a1.5 1.5 0 0 0 1.5-1.5L17 7"/></svg>`;
    case 'download': return `<svg ${a}><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 19.5h14"/></svg>`;
    case 'history': return `<svg ${a}><circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l3 2"/><path d="M8 3 6 5M16 3l2 2"/></svg>`;
    case 'info': return `<svg ${a}><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.3" r="0.75" fill="currentColor" stroke="none"/></svg>`;
    case 'lock': return `<svg ${a}><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>`;
    case 'churn': return `<svg ${a}><path d="M12 3.5 21.5 20h-19z"/><line x1="12" y1="9.5" x2="12" y2="14"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/></svg>`;
    case 'compare': return `<svg ${a}><path d="M4 9h13"/><path d="M13 5l4 4-4 4"/><path d="M20 15H7"/><path d="M11 19l-4-4 4-4"/></svg>`;
    case 'chevron-up': return `<svg ${a}><path d="M6 15l6-6 6 6"/></svg>`;
    case 'chevron-down': return `<svg ${a}><path d="M6 9l6 6 6-6"/></svg>`;
    case 'layers': return `<svg ${a}><path d="M12 3 4 8l8 5 8-5-8-5z"/><path d="M4 13l8 5 8-5"/></svg>`;
    case 'help': return `<svg ${a}><circle cx="12" cy="12" r="9"/><path d="M9.2 9.3a3 3 0 0 1 5.6 1.2c0 2-2.8 2.2-2.8 4"/><circle cx="12" cy="17" r="0.7" fill="currentColor" stroke="none"/></svg>`;
    case 'detail': return `<svg ${a}><rect x="4" y="3.5" width="16" height="17" rx="1.5"/><line x1="7.5" y1="8" x2="16.5" y2="8"/><line x1="7.5" y1="12" x2="16.5" y2="12"/><line x1="7.5" y1="16" x2="13" y2="16"/></svg>`;
    case 'close': return `<svg ${a}><path d="M6 6l12 12M18 6 6 18"/></svg>`;
	case 'move': return `<svg ${a}><path d="M12 2l-3 4h2.5v5.5H6V9l-4 3 4 3v-2.5h5.5V18H9l3 4 3-4h-2.5v-5.5H18V15l4-3-4-3v2.5h-5.5V6H15l-3-4z"/></svg>`;
    default: return '';
  }
}

function renderTopActions(){
  const el = document.getElementById('topActions');
  const runId = state.currentRun;
  const h = runId ? getHistory(runId) : { past: [], future: [] };
  const issueCount = state.infoLog.filter(m => m.type === 'error' || m.type === 'warning').length;
  el.innerHTML = `
    <button class="icon-btn" id="settingsBtn" title="Settings">${icon('gear')}</button>
    <button class="icon-btn" id="resetSettingsBtn" title="Reset zoom / label size / filter for this run" ${runId?'':'disabled'}>${icon('reset')}</button>	
    <button class="icon-btn" id="loadBtn" title="Load run JSON or Excel&hellip;">${icon('folder')}</button>
    <button class="icon-label-btn ${state.editMode?'active warn':''}" id="editModeBtn" title="${runId && lockHeldByOther(runId) ? 'Being edited elsewhere -- click to view options' : 'Toggle edit mode (E)'}">${runId && !state.editMode && lockHeldByOther(runId) ? icon('lock') : icon('edit')}<span>${runId && !state.editMode && lockHeldByOther(runId) ? 'Read-only' : 'Edit mode'}</span></button>
    ${state.editMode ? `
      <button class="icon-btn" id="undoBtn" title="Undo (Ctrl+Z)" ${h.past.length?'':'disabled'}>${icon('undo')}</button>
      <button class="icon-btn" id="redoBtn" title="Redo (Ctrl+Y)" ${h.future.length?'':'disabled'}>${icon('redo')}</button>
      <button class="icon-btn" id="discardBtn" title="Discard all edits" ${runId && hasAnyEdits(runId) ? '' : 'disabled'}>${icon('trash')}</button>
      <button class="icon-btn" id="exportEditedBtn" title="Export edited JSON (Ctrl+S)" ${runId ? '' : 'disabled'}>${icon('download')}</button>
      <button class="icon-btn ${state.changesOpen?'active':''}" id="changesToggleBtn" title="Show/hide recent changes (H)">${icon('history')}</button>
    ` : ''}
    <button class="icon-btn ${state.infoOpen?'active':''}" id="infoToggleBtn" title="Information (I)${issueCount?' \u2014 '+issueCount+' issue(s)':''}" style="position:relative;">${icon('info')}${issueCount?`<span class="badge-dot"></span>`:''}</button>
    <button class="icon-btn ${state.panelOpen?'active':''}" id="panelToggle" title="Show/hide items panel (P)">${icon('panel')}</button>
    <button class="icon-btn" id="helpBtn" title="Help (?)">${icon('help')}</button>
  `;
  el.querySelector('#settingsBtn').onclick = openSettingsModal;
  el.querySelector('#resetSettingsBtn').onclick = ()=>{
    if(!runId) return;
    if(!confirm('Reset all-period / period zoom, label size, and filter for this run back to defaults?')) return;
    resetCurrentSettings(); render();
  };
  el.querySelector('#loadBtn').onclick = ()=> document.getElementById('fileInput').click();
  el.querySelector('#editModeBtn').onclick = ()=>{ if(state.editMode) requestExitEditMode(); else requestEnterEditMode(); };
  el.querySelector('#infoToggleBtn').onclick = ()=> toggleInfo();
  el.querySelector('#panelToggle').onclick = ()=> togglePanel();
  el.querySelector('#helpBtn').onclick = ()=> showHelpModal();
  if(state.editMode){
    el.querySelector('#undoBtn').onclick = ()=>{ undo(runId); render(); };
    el.querySelector('#redoBtn').onclick = ()=>{ redo(runId); render(); };
    el.querySelector('#discardBtn').onclick = ()=>{
      if(!hasAnyEdits(runId)) return;
      if(!confirm('Discard all manual edits made to this run? This cannot be undone (unless you already exported them).')) return;
      discardEdits(runId); render();
    };
    el.querySelector('#exportEditedBtn').onclick = exportEditedJson;
    el.querySelector('#changesToggleBtn').onclick = ()=> toggleChanges();
  }
}

function updateSideStackVisibility(){
  const stack = document.getElementById('sideStack');
  if(!stack) return;
  const anyOpen = state.panelOpen || state.changesOpen || state.infoOpen;
  stack.style.display = anyOpen ? 'flex' : 'none';
}

function togglePanel(force){
  state.panelOpen = (force !== undefined) ? force : !state.panelOpen;
  document.getElementById('sidePanel').style.display = state.panelOpen ? 'flex' : 'none';
  updateSideStackVisibility();
  renderTopActions();
}

function toggleChanges(force){
  state.changesOpen = (force !== undefined) ? force : !state.changesOpen;
  document.getElementById('changesPanel').style.display = state.changesOpen ? 'flex' : 'none';
  updateSideStackVisibility();
  renderTopActions();
  renderChanges();
}

function toggleInfo(force){
  state.infoOpen = (force !== undefined) ? force : !state.infoOpen;
  document.getElementById('infoPanel').style.display = state.infoOpen ? 'flex' : 'none';
  updateSideStackVisibility();
  renderTopActions();
  renderInfoPanel();
}

function renderStoreStripControls(){
  const pct = document.getElementById('label-zoom-pct');
  if(pct && state.currentRun && state.currentStore) pct.textContent = Math.round(labelScaleForStore(state.currentStore)*100) + '%';
}

function renderTabs(){
  const rt = document.getElementById('runTabs');
  const st = document.getElementById('storeTabs');
  const strip = document.getElementById('storeStrip');

  rt.style.display = state.runOrder.length > 0 ? 'flex' : 'none';
  rt.innerHTML = '';
  state.runOrder.forEach(key=>{
    const wrap = document.createElement('div');
    wrap.className = 'run-tab' + (key === state.currentRun ? ' active' : '');
    const b = document.createElement('button');
    b.className = 'main' + (key === state.currentRun ? ' active' : '');
    b.textContent = `Run ${key}`;
    b.onclick = ()=>{
      const wasEditing = state.editMode;
      if(wasEditing && state.lockedRunId) releaseLock(state.lockedRunId);
      state.currentRun = key;
      state.currentStore = pickStoreForRun(key);
      if(wasEditing){
        if(lockHeldByOther(key)){
          state.editMode = false;
          pushInfo('warning', `Run ${key} is being edited elsewhere -- switched to read-only.`);
        } else {
          acquireLock(key);
        }
      }
      const other = findOtherLiveSessionData(key);
      if(other) showResumePrompt(key, other);
      render();
    };
    const rm = document.createElement('button');
    rm.className = 'rm'; rm.textContent = '\u00d7'; rm.title = 'Remove this run from the list';
    rm.onclick = (ev)=>{ ev.stopPropagation(); removeRun(key); };
    wrap.appendChild(b); wrap.appendChild(rm);
    rt.appendChild(wrap);
  });

  if(!state.currentRun){
    st.innerHTML = ''; st.style.display = 'none';
    strip.innerHTML = '';
    return;
  }

  const run = state.runs[state.currentRun];
  st.style.display = 'flex';
  st.innerHTML = '';
  Object.entries(run.stores).forEach(([code, s])=>{
    const b = document.createElement('button');
    b.textContent = s.storeName || code;
    b.title = code;
    if(code === state.currentStore) b.classList.add('active');
    b.onclick = ()=>{ state.currentStore = code; render(); };
    st.appendChild(b);
  });

  const store = run.stores[state.currentStore];
  const zs = currentSettings();
  const baseStab = computeStability(state.currentRun, state.currentStore, baselineAssignmentFn(state.currentRun));
  const curStab = computeStability(state.currentRun, state.currentStore, currentAssignmentFn(state.currentRun));
  strip.innerHTML = `
    <span><b>${store.storeName}</b></span>
    <span>${store.width} &times; ${store.height} m</span>
    <span>${store.locators.length} locators</span>
    <span>${getItemsPerLocator(state.currentRun, state.currentStore)} part${getItemsPerLocator(state.currentRun, state.currentStore)>1?'s':''}/locator</span>
    <span>split ${store.splitHorizontal ? 'horizontal' : 'vertical'}</span>
    <span>${run.periods.length} periods</span>
    <span title="Locator/part pairs keeping the same item from one period to the next, out of all period-to-period comparisons">
      Stability: <b>${curStab.pct}%</b> <span class="edits-flag" style="color:var(--bg-text-soft);">(baseline ${baseStab.pct}%)</span>
    </span>
    ${hasAnyEdits(state.currentRun) ? '<span class="edits-flag">&#9679; unsaved edits</span>' : ''}
    <div class="ctl-cluster">
	  <div class="ctl-group all-period-zoom-group" title="Adjust label size for every period in this store">
        <button class="zoom-btn" id="labelZoomDown" title="Reduce label size">A&minus;</button>
        <span class="zoom-pct" id="label-zoom-pct"  style="color:var(--ink-soft);">${Math.round(labelScaleForStore(state.currentStore)*100)}%</span>
        <button class="zoom-btn" id="labelZoomUp" title="Increase label size">A+</button>
      </div>
      <div class="ctl-group all-period-zoom-group" title="Apply the same zoom level to every period in this store">
        <button class="zoom-btn" id="allZoomDown" title="Shorten locator in all periods">&minus;</button>
        <span class="zoom-pct" id="all-period-zoom-pct">${allPeriodsZoomStatus().mixed ? 'Mixed' : Math.round(allPeriodsZoomStatus().factor*100)+'%'}</span>
        <button class="zoom-btn" id="allZoomUp" title="Extend locator in all periods">+</button>
        <button class="fit-btn" id="allZoomFit" title="Fit all periods to 100%">Fit</button>
		<button class="fit-btn ${zs.zoomMode==='horizontal'?'active':''}" id="zoomModeBtn" title="change zoom behaviour">${icon('move')}</button>
      </div>
      <div class="ctl-group">
        <button class="icon-btn ${zs.showOnlyChanged?'active':''}" id="changedOnlyBtn" title="Show only locators changed from the previous period">${icon('churn')}</button>
        <button class="icon-btn ${zs.viewMode==='changes'?'active':''}" id="viewModeBtn" title="Color by change status instead of item color">${icon('layers')}</button>
      </div>
      <div class="ctl-group">
        <input class="search-input" id="searchInput" placeholder="Filter by item code / description (/)" value="${escapeAttr(zs.searchText)}" />
        <button class="icon-btn" id="clearFilterBtn" title="Clear filter">${icon('close')}</button>
      </div>
    </div>
  `;
  document.getElementById('allZoomDown').onclick = ()=> nudgeAllPeriodsZoom(0.8);
  document.getElementById('allZoomUp').onclick = ()=> nudgeAllPeriodsZoom(1.25);
  document.getElementById('allZoomFit').onclick = zoomAllPeriodsToFit;
  document.getElementById('zoomModeBtn').onclick = changeZoomMode;
  document.getElementById('labelZoomDown').onclick = ()=> nudgeLabelScale(1/1.15);
  document.getElementById('labelZoomUp').onclick = ()=> nudgeLabelScale(1.15);
  document.getElementById('clearFilterBtn').onclick = clearFilter;
  document.getElementById('changedOnlyBtn').onclick = ()=>{
    zs.showOnlyChanged = !zs.showOnlyChanged;
    persistCurrent();
    renderPeriods();
    renderTabs();
  };
  document.getElementById('viewModeBtn').onclick = ()=>{
    zs.viewMode = zs.viewMode === 'changes' ? 'items' : 'changes';
    persistCurrent();
    renderPeriods();
    renderTabs();
  };
  document.getElementById('searchInput').addEventListener('input', (e)=>{
    currentSettings().searchText = e.target.value;
    persistCurrent();
    renderPeriods();
    renderLegend();
  });
}

function escapeAttr(s){ return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

function clearFilter(){
  const s = currentSettings();
  s.searchText = '';
  s.selectedItems.clear();
  persistCurrent();
  render();
}

function nudgeLabelScale(factor){
  if(!state.currentRun || !state.currentStore) return;
  const current = labelScaleForStore(state.currentStore);
  setLabelScale(state.currentStore, current * factor);
  persistCurrent();
  renderPeriods();
  renderStoreStripControls();
}

/* ---------------- text wrapping ---------------- */

function wrapLabel(text, maxWidthUnits, fontSizeUnits, maxLines){
  if(!text) return [''];
  const avgCharW = fontSizeUnits * 0.56;
  const maxChars = Math.max(2, Math.floor(maxWidthUnits / avgCharW));
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!cur) {
      cur = w.length > maxChars ? w.slice(0, maxChars - 1) + '\u2026' : w;
    } else {
      const test = cur + ' ' + w;
      if (test.length <= maxChars) {
        cur = test;
      } else {
        lines.push(cur);
        if (lines.length === maxLines) {
          if (i < words.length - 1 || w !== '') {
            lines[maxLines - 1] = lines[maxLines - 1].slice(0, maxChars - 1) + '\u2026';
          }
          return lines;
        }
        cur = w.length > maxChars ? w.slice(0, maxChars - 1) + '\u2026' : w;
      }
    }
  }
  if (cur) {
    lines.push(cur);
  }
  return lines.length ? lines : [''];
}

function labelFor(assign, labelMode){
  if(!assign) return '';
  if(labelMode === 'design') return assign.itemDesign || '';
  if(labelMode === 'color') return assign.itemColor || '';
  return [assign.itemDesign, assign.itemColor].filter(Boolean).join(' \u2014 ');
}

/* ---------------- filter matching ---------------- */

function filterActive(){
  const s = currentSettings();
  return s.selectedItems.size > 0 || s.searchText.trim().length > 0;
}

function matchesFilter(assign){
  if(!filterActive()) return true;
  if(!assign) return false;
  const s = currentSettings();
  if(s.selectedItems.has(String(assign.itemCode))) return true;
  const q = normalizeFa(s.searchText);
  if(!q) return false;
  return normalizeFa(assign.itemCode).includes(q) ||
         normalizeFa(assign.itemDesc).includes(q) ||
         normalizeFa(assign.itemColor).includes(q) ||
         normalizeFa(assign.itemDesign).includes(q);
}

/* ---------------- tooltip ---------------- */

let tt = null;

function showTooltip(evt, loc, part, assign, edited, churned){
  hideTooltip();
  if(!loc) return;
  if(state.editMode && !currentSettings().showEditTooltips) return; 
  tt = document.createElement('div');
  tt.className = 'tooltip';
  let body = `<div class="tt-code">${loc.locatorNameCode} &middot; part ${part}</div>`;
  if(assign){
    body += `<div style="margin-top:6px;"><b>${escapeHtml(assign.itemCode|| '—')}</b><br>${escapeHtml(assign.itemDesc || '')}</div>`;
    body += `<div style="margin-top:4px; color:#BFD9D9;">${escapeHtml(assign.itemColor || '')} ${assign.itemDesign ? '&middot; ' + escapeHtml(assign.itemDesign) : ''}</div>`;
    if(assign.assignedCapSqm != null) body += `<div style="margin-top:4px;">${assign.assignedCapSqm} m&sup2; assigned</div>`;
  } else {
    body += `<div style="margin-top:6px;">Empty part</div>`;
  }
  if(edited) body += `<div class="tt-edited">Manually edited &mdash; not yet exported</div>`;
  if(churned) body += `<div class="tt-churn">&#9888; Changed from the previous period</div>`;
  if(state.editMode) body += `<div style="margin-top:6px; color:#BFD9D9;">Click: filter &middot; Right-click: change item &middot; Drag: swap &middot; X icon/Delete: clear</div>`;
  tt.innerHTML = body;
  document.body.appendChild(tt);
  positionTooltip(evt);
}

function positionTooltip(evt){
  if(!tt) return;
  const pad = 14;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  const r = tt.getBoundingClientRect();
  if(x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
  if(y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
  tt.style.left = x+'px'; tt.style.top = y+'px';
}

function hideTooltip(){ if(tt){ tt.remove(); tt=null; } }
  window.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('resize', hideTooltip);

/* ---------------- edit picker modal ---------------- */

function buildSvgMarkup(store, storeCode, itemsPerLocator, periodKey, churnMap, isFirstPeriod){
  const W = store.width, H = store.height;
  const rows = store.assignments[periodKey] || [];
  const byLocator = {};
  rows.forEach(a=>{
    if(!byLocator[a.locatorNameCode]) byLocator[a.locatorNameCode] = {};
    byLocator[a.locatorNameCode][a.part] = a;
  });

  let occupied = 0, empty = 0;
  const defs = [];
  const layers = [];
  const active = filterActive();
  const catalog = getCatalog(state.currentRun);
  const settings = currentSettings();
  const labelScale = labelScaleForStore(storeCode);
  const stripeId = `stripe_${periodKey}`.replace(/[^a-zA-Z0-9_]/g, '_');
  if(settings.showEditStripes){
    defs.push(`<pattern id="${stripeId}" width="1.4" height="1.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="1.4" stroke="rgba(255,255,255,0.55)" stroke-width="0.22"/>
    </pattern>`);
  }

  store.locators.forEach(loc=>{
    const rx0 = loc.centerX - loc.width/2;
    const ry0 = H - (loc.centerY + loc.height/2);
    const assignedParts = byLocator[loc.locatorNameCode] || {};
    const cornerR = Math.min(loc.width, loc.height) * 0.14;
    const clipId = `clip_${periodKey}_${loc.locatorNameCode}`.replace(/[^a-zA-Z0-9_]/g, '_');

    const locParts = [];
    const refPw = store.splitHorizontal ? loc.width : loc.width/itemsPerLocator;
    const refPh = store.splitHorizontal ? loc.height/itemsPerLocator : loc.height;
    for(let p=1; p<=itemsPerLocator; p++){
      let px, py, pw, ph;
      if(store.splitHorizontal){ pw = loc.width; ph = loc.height/itemsPerLocator; px = rx0; py = ry0 + (p-1)*ph; }
      else { pw = loc.width/itemsPerLocator; ph = loc.height; px = rx0 + (p-1)*pw; py = ry0; }

      const editVal = getEditFor(state.currentRun, storeCode, periodKey, loc.locatorNameCode, p);
      const isEdited = editVal !== undefined;
      let rawAssign = assignedParts[p];
      if(isEdited){
        rawAssign = (editVal === null) ? null : (catalog[String(editVal)]
          ? { ...catalog[String(editVal)], locatorNameCode: loc.locatorNameCode, part: p, assignedCapSqm: null }
          : null);
      }

      const isChurned = !!(churnMap && churnMap[`${periodKey}|${loc.locatorNameCode}|${p}`]);
      const isMatch = matchesFilter(rawAssign);
      const passesChangedFilter = !settings.showOnlyChanged || isChurned;
      const visible = (!active || isMatch) && passesChangedFilter;
      const assign = visible ? rawAssign : null;
      if(rawAssign) occupied++; else empty++;

      // "Changes" view: color by period-over-period status instead of the
      // item's real color -- unchanged (light blue), changed (light red),
      // still empty (left as the normal empty style). Period 0 has no
      // previous period to compare against, so it always shows real colors.
      const isChangesView = settings.viewMode === 'changes' && !isFirstPeriod;
      const fill = isChangesView
        ? (assign ? (isChurned ? '#F7D6D3' : '#D8E8F5') : null)
        : (assign ? assign.backColor : null);
      const isUnresolved = assign === undefined || (editVal !== undefined && editVal !== null && !assign);
      const cls = ['part', !assign && !isUnresolved ? 'empty' : '', isUnresolved ? 'unresolved' : ''].filter(Boolean).join(' ');
      const groupCls = ['part-group', (visible && isMatch && rawAssign) ? 'matched' : ''].filter(Boolean).join(' ');

      // Keep wrapping in logical/store units; zoom is applied later as a visual transform.
      const baseFontSize = Math.min(pw, ph) * 0.16 * labelScale;
      const label = labelFor(assign, settings.labelMode);
      const lines = assign ? wrapLabel(label, pw * 0.92, baseFontSize, Math.max(1, Math.floor(ph / (baseFontSize*1.3)))) : [];
      const textColor = isChangesView
        ? (assign ? (isChurned ? '#7A1F1A' : '#1B3A5C') : '#94a3b8')
        : (assign ? (assign.fontColor || '#ffffff') : '#94a3b8');

      let tspans = '';
      const lineH = baseFontSize * 1.25;
      const startY = py + ph/2 - ((lines.length-1)*lineH)/2;
      lines.forEach((ln, i)=>{
        tspans += `<tspan x="${px+pw/2}" y="${startY + i*lineH}">${escapeXml(ln)}</tspan>`;
      });

      locParts.push(
        `<g class="${groupCls}" data-loc="${loc.locatorNameCode}" data-part="${p}" data-period="${periodKey}">` +
        `<rect class="${cls}" x="${px}" y="${py}" width="${pw}" height="${ph}" ${fill?`fill="${fill}"`:''}/>` +
        (lines.length ? `<text class="item-label" data-label-cx="${px+pw/2}" data-label-cy="${py+ph/2}" data-base-font-size="${baseFontSize}" fill="${textColor}" font-size="${baseFontSize}" text-anchor="middle" dominant-baseline="middle">${tspans}</text>` : '') +
        (isEdited && settings.showEditStripes ? `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="url(#${stripeId})" pointer-events="none"/>` : '') +
        `<rect class="part-hover-outline" x="${px}" y="${py}" width="${pw}" height="${ph}"/>` +
        (isChurned && settings.showChurnBadges && visible && !isChangesView ? buildChurnBadge(px, py, pw, ph) : '') +
        (state.editMode && assign ? buildClearIcon(px, py, pw, ph, loc.locatorNameCode, p, periodKey) : '') +
        `</g>`
      );
    }

    defs.push(`<clipPath id="${clipId}"><rect class="locator-clip-rect" data-base-rx="${cornerR}" x="${rx0}" y="${ry0}" width="${loc.width}" height="${loc.height}" rx="${cornerR}" ry="${cornerR}"/></clipPath>`);
    layers.push(`<g clip-path="url(#${clipId})">${locParts.join('')}</g>`);
    layers.push(`<rect class="locator-outline" data-base-rx="${cornerR}" x="${rx0}" y="${ry0}" width="${loc.width}" height="${loc.height}" rx="${cornerR}" ry="${cornerR}"/>`);
    layers.push(buildLocatorInfoIcon(rx0, ry0, loc.height, refPw, refPh, loc.locatorNameCode));
  });

  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" data-store-width="${W}" data-store-height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${defs.join('')}</defs>${layers.join('')}</svg>`;
  return { svg, occupied, empty };
}

function escapeXml(s){
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function buildClearIcon(px, py, pw, ph, locCode, part, period){
  const r = Math.max(0.16, Math.min(pw, ph) * 0.15);
  const pad = r * 0.5;
  const cx = px + pw - pad - r, cy = py + pad + r;
  const half = r * 0.42;
  return `<g class="clear-icon fixed-ui-shape" data-fixed-ui="1" data-ui-cx="${cx}" data-ui-cy="${cy}" data-loc="${locCode}" data-part="${part}" data-period="${period}" title="Clear this part">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(15,23,33,0.6)"/>
    <line x1="${cx-half}" y1="${cy-half}" x2="${cx+half}" y2="${cy+half}" stroke="#fff" stroke-width="${r*0.26}" stroke-linecap="round"/>
    <line x1="${cx-half}" y1="${cy+half}" x2="${cx+half}" y2="${cy-half}" stroke="#fff" stroke-width="${r*0.26}" stroke-linecap="round"/>
  </g>`;
}

function buildChurnBadge(px, py, pw, ph){
  // small warning triangle, top-left corner -- flags a locator/part whose
  // assigned item differs from the immediately previous period
  const s = Math.max(0.22, Math.min(pw, ph) * 0.22);
  const x0 = px + s*0.15, y0 = py + s*0.15;
  const cx = x0 + s/2, cy = y0 + s/2;
  return `<g class="churn-badge fixed-ui-shape" data-fixed-ui="1" data-ui-cx="${cx}" data-ui-cy="${cy}" pointer-events="none">
    <path d="M ${x0} ${y0+s} L ${x0+s} ${y0+s} L ${x0+s/2} ${y0} Z" fill="#E8A33D" stroke="#fff" stroke-width="${s*0.12}" stroke-linejoin="round"/>
    <line x1="${x0+s/2}" y1="${y0+s*0.42}" x2="${x0+s/2}" y2="${y0+s*0.68}" stroke="#fff" stroke-width="${s*0.13}" stroke-linecap="round"/>
    <circle cx="${x0+s/2}" cy="${y0+s*0.84}" r="${s*0.07}" fill="#fff"/>
  </g>`;
}

function buildLocatorInfoIcon(rx0, ry0, locHeight, refPw, refPh, locCode){
  // one small "i" badge per locator (not per part), left edge, near the
  // bottom -- sized to match the churn badge (based on a single part's
  // dimensions, not the whole locator, so it doesn't look oversized on
  // locators split into several parts). Opens the cross-period Locator
  // Detail panel for this locator.
  const s = Math.max(0.22, Math.min(refPw, refPh) * 0.22);
  const r = s / 2;
  const pad = r * 0.5;
  const cx = rx0 + pad + r, cy = ry0 + locHeight - pad - r;
  return `<g class="locator-info-icon fixed-ui-shape" data-fixed-ui="1" data-ui-cx="${cx}" data-ui-cy="${cy}" data-loc="${locCode}" title="Locator detail">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(44,122,123,0.85)"/>
    <line x1="${cx}" y1="${cy-r*0.32}" x2="${cx}" y2="${cy+r*0.4}" stroke="#fff" stroke-width="${r*0.26}" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy-r*0.55}" r="${r*0.12}" fill="#fff"/>
  </g>`;
}

/* ---------------- zoom: all-period control + per-period control ---------------- */

function computeBaseFitScale(store, viewport){
  if(!viewport || !store || !(store.width > 0) || !(store.height > 0)) return 1;
  const cs = getComputedStyle(viewport);
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const availableW = Math.max(40, viewport.clientWidth - padX);
  const availableH = Math.max(40, viewport.clientHeight - padY);
  // Recalculate from the CURRENT store dimensions every time the store is rendered.
  // Period cards stay fixed-width; this scale belongs to the floor-plan geometry only.
  return Math.max(0.02, Math.min(availableW / store.width, availableH / store.height));
}

function zoomMode(){
  return currentSettings().zoomMode === 'both' ? 'both' : 'horizontal';
}

function allPeriodsZoomStatus(){
  const run = state.runs[state.currentRun];
  if(!run || !state.currentStore) return { mixed:false, factor:1 };
  const values = run.periods.map(pk => periodZoom(state.currentStore, String(pk)));
  if(!values.length) return { mixed:false, factor:1 };
  const first = values[0];
  const same = values.every(v => Math.abs(v - first) < 0.000001);
  return { mixed: !same, factor: same ? first : 1 };
}

function setAllPeriodsZoom(factor){
  const run = state.runs[state.currentRun];
  if(!run || !state.currentStore) return;
  const next = Math.max(0.5, Math.min(6, factor));
  run.periods.forEach(pk => setPeriodZoom(state.currentStore, String(pk), next));
}

function applyZoomGeometryCompensation(svgEl, factor){
  const horizontalOnly = zoomMode() === 'horizontal';
  const activeFactor = Math.max(0.0001, factor || 1);

  // Horizontal-only zoom stretches the SVG's X axis.  Keep rounded corners
  // circular by reducing rx in store units while leaving ry unchanged.
  svgEl.querySelectorAll('[data-base-rx]').forEach(rect=>{
    const baseRx = Number(rect.getAttribute('data-base-rx')) || 0;
    rect.setAttribute('rx', String(horizontalOnly ? baseRx / activeFactor : baseRx));
    rect.setAttribute('ry', String(baseRx));
  });

  // Labels should grow/shrink with locator zoom. A separate per-store label-scale
  // controls their baseline readability; zoom then multiplies that baseline.
  // In horizontal-only mode inverse X scaling keeps glyphs visually undistorted.
  svgEl.querySelectorAll('.item-label[data-label-cx]').forEach(textEl=>{
    const baseFontSize = Number(textEl.getAttribute('data-base-font-size')) || Number(textEl.getAttribute('font-size')) || 0;
    const cx = Number(textEl.getAttribute('data-label-cx')) || 0;
    const cy = Number(textEl.getAttribute('data-label-cy')) || 0;
    textEl.setAttribute('font-size', String(baseFontSize * activeFactor));
    if(horizontalOnly && Math.abs(activeFactor - 1) >= 0.000001){
      const inv = 1 / activeFactor;
      textEl.setAttribute('transform', `translate(${cx} ${cy}) scale(${inv} 1) translate(${-cx} ${-cy})`);
    }else{
      textEl.removeAttribute('transform');
    }
  });

  // Informational / status controls are UI affordances, not floor-plan
  // geometry. Keep them the same visual size in horizontal-only mode.
  svgEl.querySelectorAll('.fixed-ui-shape[data-ui-cx]').forEach(shape=>{
    if(!horizontalOnly || Math.abs(activeFactor - 1) < 0.000001){
      shape.removeAttribute('transform');
      return;
    }
    const cx = Number(shape.getAttribute('data-ui-cx')) || 0;
    const cy = Number(shape.getAttribute('data-ui-cy')) || 0;
    const inv = 1 / activeFactor;
    shape.setAttribute('transform', `translate(${cx} ${cy}) scale(${inv} 1) translate(${-cx} ${-cy})`);
  });
}

function applyZoomToAll(){
  const run = state.runs[state.currentRun];
  if(!run) return;
  const store = run.stores[state.currentStore];
  if(!store) return;
  const mode = zoomMode();

  document.querySelectorAll('.period-card').forEach(card=>{
    const periodKey = card.getAttribute('data-period');
    const viewport = card.querySelector('[data-role="viewport"]');
    const svgEl = viewport?.querySelector('svg');
    if(!viewport || !svgEl) return;

    const baseScale = computeBaseFitScale(store, viewport);
    svgEl.setAttribute('data-store-fit-scale', String(baseScale));
    svgEl.setAttribute('data-store-code', String(state.currentStore));
    const factor = periodZoom(state.currentStore, periodKey);
    const widthPx = store.width * baseScale * factor;
    const heightPx = mode === 'both' ? store.height * baseScale * factor : store.height * baseScale;
    svgEl.setAttribute('width', widthPx);
    svgEl.setAttribute('height', heightPx);
    svgEl.setAttribute('data-zoom-mode', mode);
    applyZoomGeometryCompensation(svgEl, factor);

    const pctEl = card.querySelector('.period-zoom-pct');
    if(pctEl) pctEl.textContent = Math.round(factor * 100) + '%';
  });

  const all = allPeriodsZoomStatus();
  const allPct = document.getElementById('all-period-zoom-pct');
  if(allPct) allPct.textContent = all.mixed ? 'Mixed' : Math.round(all.factor * 100) + '%';
}

function nudgePeriodZoom(periodKey, factor){
  if(!state.currentRun) return;
  const current = periodZoom(state.currentStore, periodKey);
  const next = Math.max(0.5, Math.min(6, current * factor));
  setPeriodZoom(state.currentStore, periodKey, next);
  applyZoomToAll();
  persistCurrent();
}

function zoomPeriodToFit(periodKey){
  if(!state.currentRun) return;
  setPeriodZoom(state.currentStore, periodKey, 1);
  applyZoomToAll();
  persistCurrent();
}

function nudgeAllPeriodsZoom(factor){
  if(!state.currentRun) return;
  const status = allPeriodsZoomStatus();
  const base = status.mixed ? 1 : status.factor;
  setAllPeriodsZoom(base * factor);
  applyZoomToAll();
  persistCurrent();
}

function zoomAllPeriodsToFit(){
  if(!state.currentRun) return;
  setAllPeriodsZoom(1);
  nudgeLabelScale(2/currentSettings().fontScale);
  applyZoomToAll();
  persistCurrent();
}

function changeZoomMode(){
	const zs = currentSettings();
    zs.zoomMode = zs.zoomMode === 'both' ? 'horizontal' : 'both';
    persistCurrent();
    renderPeriods();
	renderTabs();
  };
  
// Keyboard + / - / 0 now control every period together.
function nudgeZoom(factor){ nudgeAllPeriodsZoom(factor); }
function zoomToFit(){ zoomAllPeriodsToFit(); }

/* ---------------- drag + hover tracking ---------------- */


function renderPeriods(){
  const wrap = document.getElementById('periodsScroll');
  wrap.innerHTML = '';
  hoveredPartRef = null;

  if(!state.currentRun){
    wrap.innerHTML = `<div class="empty-state"><div class="inner">
      No run loaded yet.<br>Click the <b>folder icon</b> above to open one or more exported run files and see the store floor plans.
    </div></div>`;
    return;
  }

  const run = state.runs[state.currentRun];
  const store = run.stores[state.currentStore];
  const storeCode = state.currentStore;
  const itemsPerLocator = getItemsPerLocator(state.currentRun, storeCode);
  const churnMap = computeStability(state.currentRun, storeCode, currentAssignmentFn(state.currentRun)).churnMap;

  run.periods.forEach((period, idx)=>{
    const pk = String(period);
    const prevPeriod = idx > 0 ? run.periods[idx-1] : null;
    const { svg, occupied, empty } = buildSvgMarkup(store, storeCode, itemsPerLocator, pk, churnMap, idx === 0);

    const card = document.createElement('div');
    card.className = 'period-card';
    card.setAttribute('data-period', pk);
    card.setAttribute('data-store-code', String(storeCode));
    card.setAttribute('data-store-width', String(store.width));
    card.setAttribute('data-store-height', String(store.height));
    card.innerHTML = `
      <div class="period-head">
        <div class="period-title">
		${prevPeriod !== null ? `<button class="period-diff-btn" title="Compare with previous period">${icon('compare')}</button>` : ''}
          <span>${period === 0 ? 'Baseline' : ' Period ' + period}</span>        </div>
        <div class="period-controls">
          
          <span class="period-zoom-label">${zoomMode()==='both' ? 'Zoom' : 'Length'}</span>
          <button class="period-zoom-btn" data-period-zoom="out" title="Shorten locator length">&minus;</button>
          <span class="period-zoom-pct" title="Per-period zoom">${Math.round(periodZoom(state.currentStore, pk)*100)}%</span>
          <button class="period-zoom-btn" data-period-zoom="in" title="Extend locator length">+</button>
          <button class="period-fit-btn" data-period-zoom="fit" title="Fit locator length">Fit</button>
        </div>
      </div>
      <div class="svg-viewport ${state.editMode ? 'edit-mode' : ''}" data-role="viewport">${svg}</div>
      <div class="stat-strip"><span><b>${store.locators.length}</b> locators</span><span><b>${occupied}</b> occupied</span><span><b>${empty}</b> empty</span></div>
    `;
    wrap.appendChild(card);

    if(prevPeriod !== null){
      card.querySelector('.period-diff-btn').addEventListener('click', ()=> showPeriodDiffModal(storeCode, prevPeriod, period));
    }
    card.querySelector('[data-period-zoom="out"]').addEventListener('click', ()=> nudgePeriodZoom(pk, 0.8));
    card.querySelector('[data-period-zoom="in"]').addEventListener('click', ()=> nudgePeriodZoom(pk, 1.25));
    card.querySelector('[data-period-zoom="fit"]').addEventListener('click', ()=> zoomPeriodToFit(pk));

    const viewport = card.querySelector('[data-role="viewport"]');
    const svgEl = viewport.querySelector('svg');

    const byLocatorLookup = {};
    store.locators.forEach(l=> byLocatorLookup[l.locatorNameCode] = l);
    const byLocatorAssign = {};
    (store.assignments[pk] || []).forEach(a=>{
      if(!byLocatorAssign[a.locatorNameCode]) byLocatorAssign[a.locatorNameCode] = {};
      byLocatorAssign[a.locatorNameCode][a.part] = a;
    });

    svgEl.querySelectorAll('.part-group').forEach(g=>{
      wirePartGroupEvents(g, { storeCode, pk, byLocatorLookup, byLocatorAssign, churnMap });
    });

    wireClearIcons(svgEl, { storeCode });
    wireLocatorInfoIcons(svgEl, { storeCode });
  });

  requestAnimationFrame(applyZoomToAll);
}

/* ---------------- legend ---------------- */

function renderLegend(){
  const list = document.getElementById('legendList');
  if(!state.currentRun){ list.innerHTML = ''; return; }
  const run = state.runs[state.currentRun];
  const store = run.stores[state.currentStore];
  const counts = {};
  run.periods.forEach(period=>{
    (store.assignments[String(period)] || []).forEach(a=>{
      if(!counts[a.itemCode]) counts[a.itemCode] = { ...a, count: 0 };
      counts[a.itemCode].count++;
    });
  });
  const entries = Object.values(counts).sort((a,b)=> b.count - a.count).slice(0, 80);
  if(!entries.length){ list.innerHTML = `<div class="hint" style="margin:0;">No items assigned.</div>`; return; }
  list.innerHTML = '';
  const settings = currentSettings();
  entries.forEach(it=>{
    const code = String(it.itemCode);
    const selected = settings.selectedItems.has(code);
    const row = document.createElement('div');
    row.className = 'legend-row' + (selected ? ' active' : '');
    row.innerHTML = `<div class="checkbox">${selected ? '\u2713' : ''}</div>
      <div class="swatch" style="background:${escapeHtml(it.backColor||'')}"></div>
      <div style="min-width:0;">
        <div class="legend-code">${escapeHtml(it.itemCode)}</div>
        <div style="font-size:11px; color:var(--ink-soft); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;">${escapeHtml(it.itemDesc||'')}</div>
      </div>
      <div class="legend-count">${it.count}</div>`;
    row.onclick = ()=>{
      if(settings.selectedItems.has(code)) settings.selectedItems.delete(code);
      else settings.selectedItems.add(code);
      persistCurrent();
      render();
    };
    list.appendChild(row);
  });
}

/* ---------------- recent changes panel ---------------- */

const CHANGE_GLYPH = { added: '\uFF0B', removed: '\u2212', edited: '\u270E', swapped: '\u2194' };

const CHANGE_LABEL = { added: 'Added', removed: 'Removed', edited: 'Changed', swapped: 'Swapped'};


function relTime(ts){
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if(s < 60) return s + 's ago';
  const m = Math.round(s / 60);
  if(m < 60) return m + 'm ago';
  return Math.round(m / 60) + 'h ago';
}

function storeNameFor(runId, storeCode){
  const run = state.runs[runId];
  return (run && run.stores[storeCode] && run.stores[storeCode].storeName) || storeCode;
}

function periodLabel(p){ return (p === 0 || p === '0') ? 'Baseline' : 'Period ' + p; }

function ctxLine(runId, ctx){
  if(!ctx || !ctx.locCode) return '';
  return `${storeNameFor(runId, ctx.storeCode)} &middot; ${ctx.locCode} &middot; part ${ctx.part} &middot; ${periodLabel(ctx.period)}`;
}

function itemChip(item){
  if(!item) return '<span class="legend-code">empty</span>';
  return `<span class="legend-code">${item.itemCode}</span>${item.itemDesc ? ' (' + escapeXml(item.itemDesc)+')' : ''}`;
}



function renderChanges(){
  const list = document.getElementById('changesList');
  if(!list) return;
  if(!state.currentRun){ list.innerHTML = ''; return; }
  const runId = state.currentRun;
  const log = getChangeLog(runId);
  if(!log.length){ list.innerHTML = `<div class="hint" style="margin:0;">No changes yet this session.</div>`; return; }
  list.innerHTML = '';
  log.forEach(entry=>{
    const row = document.createElement('div');
    row.className = 'change-row';
    let headline, sub;
    if(entry.type === 'edited'){
      headline = `<span class="change-label edited">${CHANGE_LABEL.edited}</span> ${itemChip(entry.prevItem)} <span class="change-arrow">to</span> ${itemChip(entry.item)}`;
      sub = ctxLine(runId, entry.ctx);
    } else if(entry.type === 'swapped'){
      headline = `<span class="change-label swapped">${CHANGE_LABEL.swapped}</span> ${itemChip(entry.itemA)} <span class="change-arrow">with</span> ${itemChip(entry.itemB)}`;
      sub = `${ctxLine(runId, entry.ctxA)}<br>&harr; ${ctxLine(runId, entry.ctxB)}`;
    } else {
      headline = `<span class="change-label ${entry.type}">${CHANGE_LABEL[entry.type]}</span> ${itemChip(entry.item)}`;
      sub = ctxLine(runId, entry.ctx);
    }
    row.innerHTML = `<span class="change-glyph ${entry.type}">${CHANGE_GLYPH[entry.type]}</span>
      <div style="min-width:0;">
        <div>${headline}</div>
        ${sub ? `<div class="change-sub">${sub}</div>` : ''}
      </div>`;
    list.appendChild(row);
  });
}

function clearChangeLog(){
  if(!state.currentRun) return;
  state.changeLog[state.currentRun] = [];
  saveChangeLogToStorage(state.currentRun);
  renderChanges();
}

/* ---------------- information panel: messages + imported history ---------------- */

const INFO_GLYPH = { error: '\u2715', warning: '\u26A0', info: '\u2139' };

function renderInfoPanel(){
  const list = document.getElementById('infoList');
  if(!list) return;
  if(!state.infoLog.length){
    list.innerHTML = `<div class="hint" style="margin:0;">No messages yet.</div>`;
  } else {
    list.innerHTML = '';
    state.infoLog.forEach(m=>{
      const row = document.createElement('div');
      row.className = 'info-row';
      row.innerHTML = `<span class="info-glyph ${m.type}">${INFO_GLYPH[m.type]}</span>
        <div class="info-msg">${escapeXml(m.message)}<div class="change-sub">${relTime(m.at)}</div></div>`;
      list.appendChild(row);
    });
  }

  const importedPanel = document.getElementById('importedHistoryPanel');
  const importedList = document.getElementById('importedHistoryList');
  const imported = state.currentRun ? (state.importedChangeLog[state.currentRun] || []) : [];
  if(imported.length){
    importedPanel.style.display = 'block';
    importedList.innerHTML = '';
    imported.forEach(line=>{
      const row = document.createElement('div');
      row.className = 'imported-row';
      row.textContent = line;
      importedList.appendChild(row);
    });
  } else {
    importedPanel.style.display = 'none';
  }
}

/* ---------------- mouse-wheel behaviour ---------------- */

function render(){
  renderTopActions();
  renderTabs();
  renderPeriods();
  renderLegend();
  renderChanges();
  renderInfoPanel();
}

