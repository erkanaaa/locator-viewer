/* ==========================================================================
   app.js -- bootstrap/glue: wires up buttons, file inputs, keyboard
   shortcuts, mouse-wheel behaviour, cross-tab coordination timers/events,
   and kicks off the very first render(). Loaded last, after state.js,
   render.js, drag.js, and modal.js are all in place.
   ========================================================================== */

cleanupEmptySessionShells();

document.getElementById('sidePanelClose').innerHTML = icon('close');

document.getElementById('changesPanelClose').innerHTML = icon('close');

document.getElementById('infoPanelClose').innerHTML = icon('close');

document.getElementById('resetFilter').innerHTML = icon('trash');
document.getElementById('clearChangeLogBtn').innerHTML = icon('trash');
document.getElementById('clearInfoLogBtn').innerHTML = icon('trash');

document.querySelectorAll('.panel-move[data-dir="-1"]').forEach(btn => btn.innerHTML = icon('chevron-up'));
document.querySelectorAll('.panel-move[data-dir="1"]').forEach(btn => btn.innerHTML = icon('chevron-down'));
document.querySelectorAll('.panel-move').forEach(btn=>{
  btn.addEventListener('click', ()=> movePanel(btn.getAttribute('data-panel'), Number(btn.getAttribute('data-dir'))));
});
state.panelOrder = loadPanelOrder();
applyPanelOrder();
updatePanelMoveButtons();
updateSideStackVisibility();

/* ---------------- key normalization ---------------- */

document.getElementById('fileInput').addEventListener('change', async (e)=>{
  const files = Array.from(e.target.files || []);
  if(!files.length) return;
  let loaded = 0, lastKey = null;
  for(const f of files){
    try{
      const lowerName = String(f.name || '').toLowerCase();
      let data;
      let sourceLabel = 'JSON';

      if(lowerName.endsWith('.xlsx') || lowerName.endsWith('.xlsm')){
        if(typeof excelFileToRunData !== 'function') throw new Error('The local Excel loader is not available. Make sure excel-loader.js is loaded before app.js.');
        const parsed = await excelFileToRunData(f);
        data = parsed.run;
        sourceLabel = 'Excel';
      }else{
        data = JSON.parse(await f.text());
      }

      if(!data.stores || !data.periods) throw new Error('missing stores/periods');
      const key = String(data.runId);
      loadRun(data, key);
      lastKey = key;
      loaded++;

      const storeCount = Object.keys(data.stores).length;
      const sourceSuffix = data._sourceFormat === 'xlsx' ? `; ${Object.values(data.stores).reduce((n,s)=>n+(s.locators||[]).length,0)} locators; ${data.itemsPlan?.length||0} item plans; ${data.itemsAffinity?.length||0} affinity rows` : '';
      pushInfo('info', `Run ${key} loaded from ${sourceLabel} file "${f.name}" (${storeCount} store${storeCount===1?'':'s'}, ${data.periods.length} period${data.periods.length===1?'':'s'}${sourceSuffix}).`);
      validateRunData(data).forEach(w => pushInfo('warning', `Run ${key}: ${w}`));
      if(Array.isArray(data._changeLog) && data._changeLog.length){
        state.importedChangeLog[key] = data._changeLog;
        pushInfo('info', `Run ${key} includes ${data._changeLog.length} previously recorded change(s) from an earlier editing session -- see "Imported history" below.`);
      }
    }catch(err){
      console.error('Failed to load', f.name, err);
      showToast('Failed to load file: '+f.name, 'error');
      pushInfo('error', `Failed to load "${f.name}": ${err.message}`);
    }
  }
  if(loaded){
    state.currentRun = lastKey;
    state.currentStore = pickStoreForRun(lastKey);
    render();
    if(hasAnyEdits(lastKey)){
      pushInfo('info', `Run ${lastKey} has unsaved manual edits restored from a previous session (kept in your browser's local storage).`);
    }
    const other = findOtherLiveSessionData(lastKey);
    if(other) showResumePrompt(lastKey, other);
    if(lockHeldByOther(lastKey)){
      pushInfo('warning', `Run ${lastKey} is currently being edited in another session -- opened here in read-only mode.`);
    }
  } else {
    pushInfo('error', 'No files loaded: none of the selected JSON/XLSX files were valid run data files.');
  }
  e.target.value = '';
});

document.getElementById('settingsFileInput').addEventListener('change', async (e)=>{
  const f = e.target.files[0];
  if(!f) return;
  try{
    const data = JSON.parse(await f.text());
    Object.entries(data).forEach(([runId, s])=>{
      state.runSettings[runId] = {
        fontScale: typeof s.fontScale === 'number' ? s.fontScale : 2,
        labelScaleByStore: s.labelScaleByStore || {},
        searchText: s.searchText || '',
        selectedItems: new Set(s.selectedItems || []),
        zoomByStore: s.zoomByStore || {},
        zoomByStorePeriod: s.zoomByStorePeriod || {},
        zoomMode: s.zoomMode === 'both' ? 'both' : 'horizontal',
        labelMode: s.labelMode || 'both',
        showEditStripes: s.showEditStripes !== false,
        showEditTooltips: s.showEditTooltips !== false,
        includeChangeLogInExport: s.includeChangeLogInExport === true,
        showChurnBadges: s.showChurnBadges !== false,
        showOnlyChanged: s.showOnlyChanged === true,
        viewMode: s.viewMode === 'changes' ? 'changes' : 'items',
      };
      saveSettingsToStorage(runId);
    });
    render();
  }catch(err){
    console.error('Failed to import settings', err);
    showToast('Failed to import settings', 'error');
    pushInfo('error', `Failed to import settings file: ${err.message}`);
  }
  e.target.value = '';
});

document.getElementById('sidePanelClose').onclick = ()=> togglePanel(false);

document.getElementById('changesPanelClose').onclick = ()=> toggleChanges(false);

document.getElementById('clearChangeLogBtn').onclick = clearChangeLog;

document.getElementById('infoPanelClose').onclick = ()=> toggleInfo(false);

document.getElementById('clearInfoLogBtn').onclick = clearInfoLog;

/* ---------------- tabs + store strip ---------------- */

document.getElementById('resetFilter').addEventListener('click', clearFilter);


document.getElementById('periodsScroll').addEventListener('wheel', (e)=>{
  if(getWheelMode() !== 'horizontal') return;
  if(e.deltaY === 0) return;
  e.preventDefault();
  document.getElementById('periodsScroll').scrollLeft += e.deltaY;
}, { passive: false });

/* ---------------- keyboard shortcuts ---------------- */

document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape'){
    document.querySelectorAll('.modal-overlay').forEach(m=>m.remove());
    return;
  }
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if(tag === 'INPUT' || tag === 'TEXTAREA') return;

  const runId = state.currentRun;
  const mod = e.ctrlKey || e.metaKey;

  if(mod && !e.shiftKey && e.key.toLowerCase() === 'z'){ if(state.editMode && runId){ e.preventDefault(); undo(runId); render(); } return; }
  if(mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))){ if(state.editMode && runId){ e.preventDefault(); redo(runId); render(); } return; }
  if(mod && e.key.toLowerCase() === 's'){ if(state.editMode && runId){ e.preventDefault(); exportEditedJson(); } return; }
  if(e.key === '/'){ e.preventDefault(); document.getElementById('searchInput')?.focus(); return; }
  if(e.key === ','){ openSettingsModal(); return; }
  if(e.key.toLowerCase() === 'e'){ if(state.editMode) requestExitEditMode(); else requestEnterEditMode(); return; }
  if(e.key.toLowerCase() === 'p'){ togglePanel(); return; }
  if(e.key.toLowerCase() === 'h' && state.editMode){ toggleChanges(); return; }
  if(e.key.toLowerCase() === 'i'){ toggleInfo(); return; }
  if(e.key === '?'){ showHelpModal(); return; }
  if((e.key === '+' || e.key === '=') && runId){ nudgeZoom(1.25); return; }
  if(e.key === '-' && runId){ nudgeZoom(0.8); return; }
  if(e.key === '0' && runId){ zoomToFit(); return; }
  if((e.key === 'Delete' || e.key === 'Backspace') && state.editMode && hoveredPartRef){
    e.preventDefault();
    clearPart(hoveredPartRef.storeCode, hoveredPartRef.period, hoveredPartRef.locCode, hoveredPartRef.part);
  }
});

let resizeRaf = 0;
window.addEventListener('resize', ()=>{
  if(!state.currentRun) return;
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(()=> applyZoomToAll());
});

/* ---------------- cross-tab coordination: heartbeat, storage events, unload ---------------- */

setInterval(refreshHeartbeat, LOCK_HEARTBEAT_MS);

// Fired in OTHER tabs when a localStorage key we care about changes here --
// lets a tab notice immediately if another session takes over its run's
// edit lock, instead of only finding out on its next heartbeat tick.

window.addEventListener('storage', (e)=>{
  if(!e.key || !state.currentRun) return;
  if(e.key === LOCK_PREFIX + state.currentRun) refreshHeartbeat();
});

// Best-effort release so the lock doesn't linger until it times out on its
// own -- browsers don't guarantee async work completes here, so this is a
// synchronous, best-effort cleanup only.

window.addEventListener('beforeunload', ()=>{
  if(state.lockedRunId) releaseLock(state.lockedRunId);
});

// Housekeeping: remove leftover session-scoped keys from other sessions
// that never accumulated any real data (e.g. a tab opened and closed
// without editing). Sessions with actual unsaved edits are never touched
// here -- those are only ever resolved through the explicit resume/discard
// prompt, never deleted silently.
cleanupEmptySessionShells();

/* ---------------- top-level render ---------------- */

render();

