/* ==========================================================================
   state.js -- data model, persistence (localStorage/sessionStorage), the
   multi-tab edit-lock system, and import/export. No DOM rendering lives
   here; render.js/modal.js/drag.js call into these functions and read
   `state` directly.
   ========================================================================== */

function normalizeKeys(obj){
  const specialCase = { locatorpart: 'part' };
  const out = {};
  for(const k in obj){
    const lower = k.toLowerCase();
    const camel = specialCase[lower] || (k.charAt(0).toLowerCase() + k.slice(1));
    out[camel] = obj[k];
  }
  return out;
}

/* ---------------- Arabic/Persian-tolerant text normalization ---------------- */

function normalizeFa(str){
  return String(str ?? '')
    .replace(/[\u064A\u0649]/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/[\u064B-\u0652\u0670]/g, '')
    .replace(/[\u200C\u200F\u200E]/g, ' ')
    .toLowerCase()
    .trim();
}

/* ---------------- localStorage-backed settings persistence ---------------- */

const LS = (function(){
  try{ const k='__slap_test__'; localStorage.setItem(k,'1'); localStorage.removeItem(k); return localStorage; }
  catch(e){ console.warn('localStorage unavailable -- settings will not persist between sessions.'); return null; }
})();

const SETTINGS_PREFIX = 'slapViewerSettings:';

const EDITS_PREFIX = 'slapViewerEdits:';

const HISTORY_PREFIX = 'slapViewerHistory:';

const CHANGELOG_PREFIX = 'slapViewerChangeLog:';

const LOCK_PREFIX = 'slapViewerLock:';

const WHEEL_MODE_KEY = 'slapViewerWheelMode';

/* ---------------- per-tab session identity ----------------
   Each browser tab gets its own sessionId (sessionStorage: survives reloads
   of the SAME tab, but not a fresh tab/window). Edits, settings, undo
   history, and the change log are all stored per (runId, sessionId), so two
   tabs editing the same run never silently clobber each other's localStorage
   writes -- see the lock mechanism below for coordinating *which* session is
   allowed to actually edit at a given moment. */

const SS = (function(){
  try{ const k='__slap_test__'; sessionStorage.setItem(k,'1'); sessionStorage.removeItem(k); return sessionStorage; }
  catch(e){ return null; }
})();

const SESSION_ID_KEY = 'slapViewerSessionId';

let _sessionId = null;

function getSessionId(){
  if(_sessionId) return _sessionId;
  let sid = null;
  if(SS){ try{ sid = SS.getItem(SESSION_ID_KEY); }catch(e){} }
  if(!sid){
    sid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID()
        : ('sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    if(SS){ try{ SS.setItem(SESSION_ID_KEY, sid); }catch(e){} }
  }
  _sessionId = sid;
  return sid;
}

function scopedKey(prefix, runId){ return prefix + runId + ':' + getSessionId(); }

/* ---------------- edit lock: one editor per run at a time ---------------- */

const LOCK_HEARTBEAT_MS = 7000;   // refresh every 5-10s while actively editing

const LOCK_STALE_MS = 20000;      // treat as abandoned if no heartbeat in 15-30s


function readLock(runId){
  if(!LS || !runId) return null;
  try{ const raw = LS.getItem(LOCK_PREFIX+runId); return raw ? JSON.parse(raw) : null; }catch(e){ return null; }
}

function writeLock(runId, lock){ if(LS && runId){ try{ LS.setItem(LOCK_PREFIX+runId, JSON.stringify(lock)); }catch(e){} } }

function clearLock(runId){ if(LS && runId){ try{ LS.removeItem(LOCK_PREFIX+runId); }catch(e){} } }

function isLockStale(lock){ return !lock || (Date.now() - (lock.lastHeartbeat || 0)) > LOCK_STALE_MS; }

function lockIsMine(lock){ return !!lock && lock.sessionId === getSessionId(); }

function lockHeldByOther(runId){
  const lock = readLock(runId);
  return !!lock && !lockIsMine(lock) && !isLockStale(lock);
}

function acquireLock(runId){
  const existing = readLock(runId);
  writeLock(runId, {
    sessionId: getSessionId(),
    openedAt: (existing && existing.sessionId === getSessionId() && existing.openedAt) || Date.now(),
    lastHeartbeat: Date.now(),
    mode: 'edit',
  });
  state.lockedRunId = runId;
}

function releaseLock(runId){
  const lock = readLock(runId);
  if(lockIsMine(lock)) clearLock(runId);
  if(state.lockedRunId === runId) state.lockedRunId = null;
}

function refreshHeartbeat(){
  const runId = state.lockedRunId;
  if(!runId) return;
  const lock = readLock(runId);
  if(lockIsMine(lock)){
    lock.lastHeartbeat = Date.now();
    writeLock(runId, lock);
  } else {
    // Someone else took over while we believed we held the lock.
    state.lockedRunId = null;
    if(state.editMode && state.currentRun === runId){
      state.editMode = false;
      pushInfo('warning', `Editing rights for run ${runId} were taken over by another session -- switched to read-only.`);
      render();
    }
  }
}

/* ---------------- resuming / discarding another session's leftovers ---------------- */

function listSessionKeysForRun(prefix, runId){
  if(!LS) return [];
  const out = [], search = prefix + runId + ':';
  for(let i=0;i<LS.length;i++){
    const k = LS.key(i);
    if(k && k.indexOf(search) === 0) out.push({ key:k, sessionId: k.slice(search.length) });
  }
  return out;
}

function isStoredValueEmpty(raw){
  if(raw == null) return true;
  try{
    const v = JSON.parse(raw);
    if(Array.isArray(v)) return v.length === 0;
    if(v && typeof v === 'object'){
      if('past' in v || 'future' in v) return !(v.past||[]).length && !(v.future||[]).length;
      return Object.keys(v).length === 0;
    }
    return !v;
  }catch(e){ return true; }
}

function findOtherLiveSessionData(runId){
  const mySid = getSessionId();
  const candidates = listSessionKeysForRun(EDITS_PREFIX, runId).filter(x => x.sessionId !== mySid);
  return candidates.find(x => !isStoredValueEmpty(LS.getItem(x.key))) || null;
}

function migrateSessionData(runId, fromSid, toSid){
  [EDITS_PREFIX, SETTINGS_PREFIX, HISTORY_PREFIX, CHANGELOG_PREFIX].forEach(prefix=>{
    const fromKey = prefix+runId+':'+fromSid, toKey = prefix+runId+':'+toSid;
    const val = LS.getItem(fromKey);
    if(val != null) LS.setItem(toKey, val);
    LS.removeItem(fromKey);
  });
  delete state.runEdits[runId];
  delete state.runSettings[runId];
  delete state.editHistory[runId];
  delete state.changeLog[runId];
}

function cleanupSessionData(runId, sid){
  [EDITS_PREFIX, SETTINGS_PREFIX, HISTORY_PREFIX, CHANGELOG_PREFIX].forEach(prefix=>{
    if(LS) LS.removeItem(prefix+runId+':'+sid);
  });
}

function cleanupEmptySessionShells(){
  if(!LS) return;
  const prefixes = [EDITS_PREFIX, SETTINGS_PREFIX, HISTORY_PREFIX, CHANGELOG_PREFIX];
  const mySid = getSessionId();
  const groups = {};
  for(let i=0;i<LS.length;i++){
    const k = LS.key(i);
    if(!k) continue;
    const prefix = prefixes.find(p => k.indexOf(p) === 0);
    if(!prefix) continue;
    const rest = k.slice(prefix.length);
    const idx = rest.lastIndexOf(':');
    if(idx < 0) continue;
    const runId = rest.slice(0, idx), sid = rest.slice(idx+1);
    if(sid === mySid) continue; // never touch our own live session
    const gk = runId+'\u0001'+sid;
    (groups[gk] = groups[gk] || []).push(k);
  }
  Object.values(groups).forEach(keys=>{
    if(keys.every(k => isStoredValueEmpty(LS.getItem(k)))) keys.forEach(k => LS.removeItem(k));
  });
}

/* ---------------- take-over / resume prompts ---------------- */

function requestEnterEditMode(){
  const runId = state.currentRun;
  if(!runId) return;
  if(lockHeldByOther(runId)){
    showTakeOverPrompt(runId, ()=>{
      acquireLock(runId);
      state.editMode = true;
      render();
      pushInfo('info', `You took over editing for run ${runId}.`);
    });
    return;
  }
  acquireLock(runId);
  state.editMode = true;
  render();
}

function requestExitEditMode(){
  if(state.lockedRunId) releaseLock(state.lockedRunId);
  state.editMode = false;
  render();
}



function defaultSettings(){
  return {
    fontScale: 2, labelScaleByStore: {}, searchText: '', selectedItems: new Set(), zoomByStore: {}, zoomByStorePeriod: {},
    zoomMode: 'horizontal',   // 'both' | 'horizontal' -- scale both axes, or locator length only
    labelMode: 'both',        // 'both' | 'design' | 'color'
    showEditStripes: true,
    showEditTooltips: true, // show full locator-part tooltip while editing
    includeChangeLogInExport: false,
    showChurnBadges: true,    // mark locators whose item changed from the previous period
    showOnlyChanged: false,   // filter: show only period-over-period changes
    viewMode: 'items',        // 'items' (real item colors) | 'changes' (change-status colors)
  };
}

function loadSettingsFromStorage(runId){
  if(!LS) return null;
  try{
    const raw = LS.getItem(scopedKey(SETTINGS_PREFIX, runId));
    if(!raw) return null;
    const p = JSON.parse(raw);
    return {
      fontScale: typeof p.fontScale === 'number' ? p.fontScale : 2,
      labelScaleByStore: p.labelScaleByStore || {},
      searchText: p.searchText || '',
      selectedItems: new Set(p.selectedItems || []),
      zoomByStore: p.zoomByStore || {},
      zoomByStorePeriod: p.zoomByStorePeriod || {},
      zoomMode: p.zoomMode === 'both' ? 'both' : 'horizontal',
      labelMode: p.labelMode || 'both',
      showEditStripes: p.showEditStripes !== false,
      showEditTooltips: p.showEditTooltips !== false,
      includeChangeLogInExport: p.includeChangeLogInExport === true,
      showChurnBadges: p.showChurnBadges !== false,
      showOnlyChanged: p.showOnlyChanged === true,
      viewMode: p.viewMode === 'changes' ? 'changes' : 'items',
    };
  }catch(e){ return null; }
}

function saveSettingsToStorage(runId){
  if(!LS) return;
  const s = state.runSettings[runId];
  if(!s) return;
  try{
    LS.setItem(scopedKey(SETTINGS_PREFIX, runId), JSON.stringify({
      fontScale: s.fontScale, labelScaleByStore: s.labelScaleByStore, searchText: s.searchText,
      selectedItems: Array.from(s.selectedItems), zoomByStore: s.zoomByStore,
      zoomByStorePeriod: s.zoomByStorePeriod, zoomMode: s.zoomMode,
      labelMode: s.labelMode, showEditStripes: s.showEditStripes,
      showEditTooltips: s.showEditTooltips,
      includeChangeLogInExport: s.includeChangeLogInExport,
      showChurnBadges: s.showChurnBadges, showOnlyChanged: s.showOnlyChanged, viewMode: s.viewMode,
    }));
  }catch(e){}
}

function getSettings(runId){
  if(!state.runSettings[runId]) state.runSettings[runId] = loadSettingsFromStorage(runId) || defaultSettings();
  const s = state.runSettings[runId];
  if(!s.labelScaleByStore || typeof s.labelScaleByStore !== 'object') s.labelScaleByStore = {};

  // Migrate the old single label scale into one value per store. Existing
  // settings keep their previous value; newly created store-specific values
  // start at that legacy value, then remain independent thereafter.
  const legacy = typeof s.fontScale === 'number' ? s.fontScale : 2;
  const stores = state.runs[runId]?.stores || {};
  Object.keys(stores).forEach(code=>{
    if(typeof s.labelScaleByStore[code] !== 'number') s.labelScaleByStore[code] = legacy;
  });
  return s;
}

function currentSettings(){ return getSettings(state.currentRun); }

function persistCurrent(){ if(state.currentRun) saveSettingsToStorage(state.currentRun); }

function labelScaleForStore(storeCode){
  const s = currentSettings();
  const storeKey = String(storeCode ?? state.currentStore ?? '');
  if(!s.labelScaleByStore || typeof s.labelScaleByStore !== 'object') s.labelScaleByStore = {};
  if(typeof s.labelScaleByStore[storeKey] !== 'number'){
    s.labelScaleByStore[storeKey] = typeof s.fontScale === 'number' ? s.fontScale : 2;
  }
  return s.labelScaleByStore[storeKey];
}

function setLabelScale(storeCode, factor){
  const s = currentSettings();
  const storeKey = String(storeCode ?? state.currentStore ?? '');
  if(!s.labelScaleByStore || typeof s.labelScaleByStore !== 'object') s.labelScaleByStore = {};
  s.labelScaleByStore[storeKey] = Math.max(0.4, Math.min(5, factor));
  // Keep the legacy field aligned with the current store for backward compatibility.
  s.fontScale = s.labelScaleByStore[storeKey];
}

function currentZoom(){
  const s = currentSettings();
  if(!s.zoomByStore[state.currentStore]) s.zoomByStore[state.currentStore] = { scale: null, fit: true };
  return s.zoomByStore[state.currentStore];
}

function periodZoom(storeCode, periodKey){
  const s = currentSettings();
  const storeKey = String(storeCode ?? state.currentStore ?? '');
  const period = String(periodKey ?? '0');
  if(!s.zoomByStorePeriod[storeKey]) s.zoomByStorePeriod[storeKey] = {};
  if(typeof s.zoomByStorePeriod[storeKey][period] !== 'number') s.zoomByStorePeriod[storeKey][period] = 1;
  return s.zoomByStorePeriod[storeKey][period];
}

function setPeriodZoom(storeCode, periodKey, factor){
  const s = currentSettings();
  const storeKey = String(storeCode ?? state.currentStore ?? '');
  const period = String(periodKey ?? '0');
  if(!s.zoomByStorePeriod[storeKey]) s.zoomByStorePeriod[storeKey] = {};
  s.zoomByStorePeriod[storeKey][period] = factor;
}

function resetCurrentSettings(){
  if(!state.currentRun) return;
  state.runSettings[state.currentRun] = defaultSettings();
  persistCurrent();
}

function getWheelMode(){
  if(LS){ try{ const v = LS.getItem(WHEEL_MODE_KEY); if(v) return v; }catch(e){} }
  return state.wheelMode;
}

function setWheelMode(mode){
  state.wheelMode = mode;
  if(LS){ try{ LS.setItem(WHEEL_MODE_KEY, mode); }catch(e){} }
}

/* ---------------- side panel order (Items / Recent changes / Information) ----------------
   A layout preference, not tied to any run -- lets the person stack the
   three panels in whichever order suits them, to save vertical space when
   more than one is open at once. */
const PANEL_ORDER_KEY = 'slapViewerPanelOrder';
const DEFAULT_PANEL_ORDER = ['sidePanel', 'changesPanel', 'infoPanel'];
function loadPanelOrder(){
  if(LS){
    try{
      const raw = LS.getItem(PANEL_ORDER_KEY);
      if(raw){
        const parsed = JSON.parse(raw);
        if(Array.isArray(parsed) && DEFAULT_PANEL_ORDER.every(id => parsed.includes(id))) return parsed;
      }
    }catch(e){}
  }
  return DEFAULT_PANEL_ORDER.slice();
}
function savePanelOrder(){
  if(LS){ try{ LS.setItem(PANEL_ORDER_KEY, JSON.stringify(state.panelOrder)); }catch(e){} }
}
function applyPanelOrder(){
  const stack = document.getElementById('sideStack');
  if(!stack) return;
  state.panelOrder.forEach(id=>{
    const el = document.getElementById(id);
    if(el) stack.appendChild(el); // re-appending an existing node moves it -- iterating in order stacks them correctly
  });
}
function movePanel(id, dir){
  const idx = state.panelOrder.indexOf(id);
  const newIdx = idx + dir;
  if(idx < 0 || newIdx < 0 || newIdx >= state.panelOrder.length) return;
  const order = state.panelOrder;
  [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
  savePanelOrder();
  applyPanelOrder();
  updatePanelMoveButtons();
}
function updatePanelMoveButtons(){
  document.querySelectorAll('.panel-move').forEach(btn=>{
    const id = btn.getAttribute('data-panel');
    const dir = Number(btn.getAttribute('data-dir'));
    const idx = state.panelOrder.indexOf(id);
    btn.disabled = (dir < 0 && idx <= 0) || (dir > 0 && idx >= state.panelOrder.length - 1);
  });
}

/* ---------------- edits persistence + undo/redo history + change log ---------------- */

function loadEditsFromStorage(runId){
  if(!LS) return {};
  try{ return JSON.parse(LS.getItem(scopedKey(EDITS_PREFIX, runId)) || '{}') || {}; }
  catch(e){ return {}; }
}

function saveEditsToStorage(runId){
  if(!LS) return;
  try{ LS.setItem(scopedKey(EDITS_PREFIX, runId), JSON.stringify(getEdits(runId))); }catch(e){}
}

function getEdits(runId){
  if(!state.runEdits[runId]) state.runEdits[runId] = loadEditsFromStorage(runId);
  return state.runEdits[runId];
}

function getEditFor(runId, storeCode, period, locCode, part){
  // must go through getEdits() so a run's persisted edits get lazily loaded
  // from localStorage on first access -- reading state.runEdits directly
  // here previously meant edits from an earlier session silently failed to
  // show up until the user made a brand-new edit in the current session.
  const e = getEdits(runId);
  return e?.[storeCode]?.[period]?.[locCode]?.[part];
}

function setEditRaw(runId, storeCode, period, locCode, part, value){
  const e = getEdits(runId);
  e[storeCode] = e[storeCode] || {};
  e[storeCode][period] = e[storeCode][period] || {};
  e[storeCode][period][locCode] = e[storeCode][period][locCode] || {};
  e[storeCode][period][locCode][part] = value;
  saveEditsToStorage(runId);
}

function normalizeEdit(runId, storeCode, period, locCode, part){
  const e = getEdits(runId);
  if(!e) return;
  const v = e?.[storeCode]?.[period]?.[locCode]?.[part];
  if(v === undefined) return;
  const orig = getOriginalAssignment(runId, storeCode, period, locCode, part);
  const origCode = orig ? String(orig.itemCode) : null;
  const vCode = (v === null || v === '') ? null : String(v);
  const isBaseline = (vCode === null && (origCode === null || origCode === '')) || (vCode !== null && vCode === origCode);
  if(!isBaseline) return;
  delete e[storeCode][period][locCode][part];
  const locObj = e[storeCode][period][locCode];
  if(locObj && !Object.keys(locObj).length) delete e[storeCode][period][locCode];
  const periodObj = e[storeCode][period];
  if(periodObj && !Object.keys(periodObj).length) delete e[storeCode][period];
  if(e[storeCode] && !Object.keys(e[storeCode]).length) delete e[storeCode];
  saveEditsToStorage(runId);
}

function hasAnyEdits(runId){
  const e = getEdits(runId);
  if(!e) return false;
  return Object.values(e).some(byPeriod =>
    Object.values(byPeriod).some(byLoc =>
      Object.values(byLoc).some(byPart => Object.keys(byPart).length > 0)));
}

function loadHistoryFromStorage(runId){
  if(!LS) return null;
  try{ const raw = LS.getItem(scopedKey(HISTORY_PREFIX, runId)); return raw ? JSON.parse(raw) : null; }
  catch(e){ return null; }
}

function saveHistoryToStorage(runId){
  if(!LS) return;
  try{ LS.setItem(scopedKey(HISTORY_PREFIX, runId), JSON.stringify(getHistory(runId))); }catch(e){}
}

function getHistory(runId){
  if(!state.editHistory[runId]) state.editHistory[runId] = loadHistoryFromStorage(runId) || { past: [], future: [] };
  return state.editHistory[runId];
}

function pushHistory(runId, meta){
  const h = getHistory(runId);
  h.past.push({ snap: JSON.stringify(getEdits(runId)), meta: meta || null });
  if(h.past.length > 1000) h.past.shift();
  h.future = [];
  saveHistoryToStorage(runId);
}


/*------------------------------------------------------------------*/
/**
 * Inverts action metadata for undo logging.
 */

function invertMeta(meta) {
  if (!meta?.payload) return null;
  const { type, payload } = meta;

  switch (type) {
    case 'added':
      return { type: 'removed', payload: { item: payload.item, ctx: payload.ctx } };

    case 'removed':
      return { type: 'added', payload: { item: payload.item, ctx: payload.ctx } };

    case 'edited':
      return {
        type: 'edited',
        payload: { item: payload.prevItem, prevItem: payload.item, ctx: payload.ctx }
      };

    case 'swapped':
      return {
        type: 'swapped',
        payload: {
          itemA: payload.itemB, ctxA: payload.ctxB,
          itemB: payload.itemA, ctxB: payload.ctxA
        }
      };

    default:
      return { type, payload };
  }
}

/**
 * Shared engine for undo and redo operations.
 */

function stepHistory(runId, isUndo) {
  const h = getHistory(runId);
  const source = isUndo ? h.past : h.future;
  const target = isUndo ? h.future : h.past;

  if (!source?.length) return;

  const raw = source.pop();
  const entry = typeof raw === 'string' ? { snap: raw, meta: null } : raw;

  // Preserve current state onto the opposing stack
  const before = getEdits(runId);
  target.push({ snap: JSON.stringify(before), meta: entry.meta });
  saveHistoryToStorage(runId);

  // Apply restored snapshot
  const restored = JSON.parse(entry.snap);
  state.runEdits[runId] = restored;
  saveEditsToStorage(runId);

  // Process logging and active context
  if (entry.meta) {
    const change = isUndo ? invertMeta(entry.meta) : entry.meta;
    if (change) logChange(runId, change.type, change.payload);

    const ctx = entry.meta.payload?.ctx || entry.meta.payload?.ctxA;
    if (ctx?.storeCode) state.currentStore = ctx.storeCode;
  }
}


function undo(runId) {
  stepHistory(runId, true);
}


function redo(runId) {
  stepHistory(runId, false);
}
/*------------------------------------------------------------------*/


function discardEdits(runId){
  state.runEdits[runId] = {};
  state.editHistory[runId] = { past: [], future: [] };
  state.changeLog[runId] = [];
  if(LS){
    try{
      LS.removeItem(scopedKey(EDITS_PREFIX, runId));
      LS.removeItem(scopedKey(HISTORY_PREFIX, runId));
      LS.removeItem(scopedKey(CHANGELOG_PREFIX, runId));
    }catch(e){}
  }
}

function loadChangeLogFromStorage(runId){
  if(!LS) return [];
  try{ return JSON.parse(LS.getItem(scopedKey(CHANGELOG_PREFIX, runId)) || '[]') || []; }
  catch(e){ return []; }
}

function saveChangeLogToStorage(runId){
  if(!LS) return;
  try{ LS.setItem(scopedKey(CHANGELOG_PREFIX, runId), JSON.stringify(state.changeLog[runId] || [])); }catch(e){}
}

function getChangeLog(runId){
  if(!state.changeLog[runId]) state.changeLog[runId] = loadChangeLogFromStorage(runId);
  return state.changeLog[runId];
}

function logChange(runId, type, payload){
  const log = getChangeLog(runId);
  log.unshift({ type, ...payload, at: Date.now() });
  if(log.length > 150) log.length = 150;
  saveChangeLogToStorage(runId);
}

/* ---------------- item catalog ---------------- */

function getCatalog(runId){
  const run = state.runs[runId];
  if(!run) return {};
  if(run._catalogCache) return run._catalogCache;

  // Excel imports carry the complete items sheet as itemCatalog, so the
  // picker/filter can show items that are not currently assigned anywhere.
  if(run.itemCatalog && typeof run.itemCatalog === 'object'){
    const catalog = {};
    Object.entries(run.itemCatalog).forEach(([code, item])=>{
      if(item == null) return;
      catalog[String(code)] = {
        itemCode: item.itemCode ?? code,
        itemDesc: item.itemDesc || '',
        itemDesign: item.itemDesign || '',
        itemColor: item.itemColor || '',
        crossSectionArea: item.crossSectionArea ?? null,
        backColor: item.backColor || '',
        fontColor: item.fontColor || '',
      };
    });
    run._catalogCache = catalog;
    return catalog;
  }

  // Backward-compatible path for legacy JSON runs which only carry item data
  // on assignment rows.
  const catalog = {};
  Object.values(run.stores || {}).forEach(store=>{
    Object.values(store.assignments || {}).forEach(rows=>{
      (rows || []).forEach(a=>{
        if(a.itemCode == null) return;
        const code = String(a.itemCode);
        if(!catalog[code]) catalog[code] = {
          itemCode: a.itemCode, itemDesc: a.itemDesc, itemDesign: a.itemDesign,
          itemColor: a.itemColor, backColor: a.backColor, fontColor: a.fontColor,
        };
      });
    });
  });
  run._catalogCache = catalog;
  return catalog;
}

function getItemsPerLocator(runId, storeCode){
  const run = state.runs[runId];
  const store = run && run.stores && run.stores[storeCode];
  const storeValue = Number(store && store.itemsPerLocator);
  if(Number.isFinite(storeValue) && storeValue > 0) return Math.max(1, Math.round(storeValue));
  const runValue = Number(run && run.itemsPerLocator);
  if(Number.isFinite(runValue) && runValue > 0) return Math.max(1, Math.round(runValue));
  return 1;
}

function getOriginalAssignment(runId, storeCode, period, locCode, part){
  const run = state.runs[runId];
  const store = run && run.stores[storeCode];
  if(!store) return null;
  const rows = store.assignments[period] || [];
  return rows.find(r => r.locatorNameCode === locCode && r.part === part) || null;
}

function getEffectiveAssignment(runId, storeCode, period, locCode, part){
  const editVal = getEditFor(runId, storeCode, period, locCode, part);
  if(editVal !== undefined){
    if(editVal === null) return null;
    return getCatalog(runId)[String(editVal)] || null;
  }
  return getOriginalAssignment(runId, storeCode, period, locCode, part);
}

/* ---------------- period-over-period stability ----------------
   Preserving a locator's assigned item from one period to the next is a
   core objective of the underlying model; reassigning it to a different
   item counts as a negative. This compares each locator+part to its own
   value in the *immediately previous* period (period 0 has nothing to
   compare against, so it's excluded from the count). `effectiveFn` lets
   the same logic compute either the baseline (original data) or the
   current (with manual edits applied) score. */
function computeStability(runId, storeCode, effectiveFn){
  const run = state.runs[runId];
  const store = run && run.stores[storeCode];
  if(!store) return { total: 0, stable: 0, pct: 100, churnMap: {} };
  const periods = run.periods;
  const itemsPerLocator = getItemsPerLocator(runId, storeCode);
  let total = 0, stable = 0;
  const churnMap = {}; // `${period}|${locCode}|${part}` -> true if changed from the previous period
  for(let i=1; i<periods.length; i++){
    const prevP = String(periods[i-1]), curP = String(periods[i]);
    store.locators.forEach(loc=>{
      for(let part=1; part<=itemsPerLocator; part++){
        const prevA = effectiveFn(storeCode, prevP, loc.locatorNameCode, part);
        const curA = effectiveFn(storeCode, curP, loc.locatorNameCode, part);
        const prevCode = prevA ? String(prevA.itemCode) : null;
        const curCode = curA ? String(curA.itemCode) : null;
        total++;
        const changed = prevCode !== curCode;
        if(!changed) stable++;
        churnMap[`${curP}|${loc.locatorNameCode}|${part}`] = changed;
      }
    });
  }
  return { total, stable, pct: total ? Math.round(100 * stable / total) : 100, churnMap };
}
function baselineAssignmentFn(runId){
  return (storeCode, period, locCode, part) => getOriginalAssignment(runId, storeCode, period, locCode, part);
}
function currentAssignmentFn(runId){
  return (storeCode, period, locCode, part) => getEffectiveAssignment(runId, storeCode, period, locCode, part);
}

/* ---------------- period-to-period difference summary ----------------
   Per locator/part cell, classify the transition between two periods
   (using the live, edit-inclusive assignment): newly assigned (was
   empty, now has an item), released (had an item, now empty), relocated
   (had a different item), or unchanged (same item, or still empty). */
function computePeriodDiff(runId, storeCode, periodBefore, periodAfter){
  const run = state.runs[runId];
  const store = run && run.stores[storeCode];
  const result = { newlyAssigned: 0, released: 0, relocated: 0, unchanged: 0, total: 0 };
  if(!store) return result;
  const pb = String(periodBefore), pa = String(periodAfter);
  store.locators.forEach(loc=>{
  	const itemsPerLocator = getItemsPerLocator(runId, storeCode);
    for(let part=1; part<=itemsPerLocator; part++){
      const before = getEffectiveAssignment(runId, storeCode, pb, loc.locatorNameCode, part);
      const after = getEffectiveAssignment(runId, storeCode, pa, loc.locatorNameCode, part);
      const beforeCode = before ? String(before.itemCode) : null;
      const afterCode = after ? String(after.itemCode) : null;
      result.total++;
      if(beforeCode === null && afterCode === null) result.unchanged++;
      else if(beforeCode === null) result.newlyAssigned++;
      else if(afterCode === null) result.released++;
      else if(beforeCode === afterCode) result.unchanged++;
      else result.relocated++;
    }
  });
  return result;
}

/** Everything the Locator Detail panel needs for one locator, across all periods. */
function getLocatorDetailData(runId, storeCode, locCode){
  const run = state.runs[runId];
  const store = run.stores[storeCode];
  const loc = store.locators.find(l => l.locatorNameCode === locCode);
  const perPart = {};
  const itemsPerLocator = getItemsPerLocator(runId, storeCode);
  for(let part=1; part<=itemsPerLocator; part++){
    perPart[part] = run.periods.map(p => ({
      period: p,
      item: getEffectiveAssignment(runId, storeCode, String(p), locCode, part),
    }));
  }
  return { loc, perPart, periods: run.periods };
}

/* ---------------- centralized edit application (keeps undo + log consistent) ---------------- */

function applyEdit(runId, storeCode, period, locCode, part, newItemCodeOrNull, opts){
  opts = opts || {};
  const prev = getEffectiveAssignment(runId, storeCode, period, locCode, part);
  const prevCode = prev?.itemCode != null ? String(prev.itemCode) : null;
  const newCode = newItemCodeOrNull != null ? String(newItemCodeOrNull) : null;

  // No-op: avoid dirtying history/logs if values match
  if (prevCode === newCode) return false;

  // Resolve new item reference
  const catalog = getCatalog(runId);
  const newItem = newCode ? (catalog?.[newCode] ?? { itemCode: newCode }) : null;

  // Determine transition type
  const type = !prev ? 'added' : !newItem ? 'removed' : 'edited';
  const payload = {
    item: type === 'removed' ? prev : newItem,
    prevItem: type === 'edited' ? prev : null,
    ctx: { storeCode, locCode, part, period },
  };

  // Record history (post-mutation so snapshots capture the new state)
  if (!opts.skipHistoryPush) {
    pushHistory(runId, { type, payload });
  }
    // Audit logging
  if (!opts.silentLog) {
    logChange(runId, type, payload);
  }
  
  // Apply mutations
  setEditRaw(runId, storeCode, period, locCode, part, newItemCodeOrNull);
  normalizeEdit(runId, storeCode, period, locCode, part);



  return true;
}

function swapParts(a, b) {
  if (a.storeCode !== b.storeCode) {
    showToast('Cross-store swap is not allowed', 'warn');
    return false;
  }

  // No-op if identical target
  if (a.period === b.period && a.locCode === b.locCode && a.part === b.part) {
    return false;
  }

  const runId = state.currentRun;
  const aItem = getEffectiveAssignment(runId, a.storeCode, a.period, a.locCode, a.part);
  const bItem = getEffectiveAssignment(runId, b.storeCode, b.period, b.locCode, b.part);

  // Swapping two empty slots is a no-op
  if (!aItem && !bItem) return false;

  const toCtx = ({ storeCode, locCode, part, period }) => ({ storeCode, locCode, part, period });
  const payload = {
    itemA: aItem ?? null,
    ctxA: toCtx(a),
    itemB: bItem ?? null,
    ctxB: toCtx(b),
  };
  
  pushHistory(runId, { type: 'swapped', payload });
  logChange(runId, 'swapped', payload);
  // Perform mutations without individual history pushes or audit logs
  const editOpts = { silentLog: true, skipHistoryPush: true };
  applyEdit(runId, a.storeCode, a.period, a.locCode, a.part, bItem?.itemCode ?? null, editOpts);
  applyEdit(runId, b.storeCode, b.period, b.locCode, b.part, aItem?.itemCode ?? null, editOpts);



  showToast('Swap applied', 'success');
  render();
  return true;
}

function clearPart(storeCode, period, locCode, part){
  applyEdit(state.currentRun, storeCode, period, locCode, part, null);
  render();
}

/* ---------------- state ---------------- */

const state = {
  runs: {}, runOrder: [], currentRun: null, currentStore: null,
  runSettings: {}, runEdits: {}, editHistory: {}, changeLog: {},
  importedChangeLog: {}, // runId -> array of strings, from a previously-exported _changeLog
  infoLog: [], // session-wide messages: errors, warnings, notices
  panelOpen: false, changesOpen: false, infoOpen: false,
  editMode: false,
  wheelMode: 'vertical',
};

/* ---------------- information panel: errors, warnings, notices ---------------- */

function pushInfo(type, message){
  state.infoLog.unshift({ type, message, at: Date.now() });
  if(state.infoLog.length > 300) state.infoLog.length = 300;
  renderInfoPanel();
}

function clearInfoLog(){
  state.infoLog = [];
  renderInfoPanel();
}

function validateRunData(runData){
  const warnings = [];
  let missingColor = 0, badGeometry = 0;
  Object.values(runData.stores || {}).forEach(store=>{
    (store.locators || []).forEach(loc=>{
      if(loc.centerX == null || loc.centerY == null || !loc.width || !loc.height) badGeometry++;
    });
    Object.values(store.assignments || {}).forEach(rows=>{
      (rows || []).forEach(r=>{ if(!r.backColor) missingColor++; });
    });
  });
  if(missingColor) warnings.push(`${missingColor} assignment row(s) are missing a BackColor and will render with a default fill.`);
  if(badGeometry) warnings.push(`${badGeometry} locator(s) have missing or zero width/height/coordinates and may not render correctly.`);
  return warnings;
}


function simpleHash(str){
  let h = 0;
  for(let i=0;i<str.length;i++){ h = (Math.imul(31,h) + str.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(16);
}

function loadRun(runData, keyOverride){
  const key = keyOverride || String(runData.runId);
  Object.values(runData.stores || {}).forEach(store=>{
    if(Array.isArray(store.locators)) store.locators = store.locators.map(normalizeKeys);
    if(store.assignments){
      Object.keys(store.assignments).forEach(pk=>{
        store.assignments[pk] = (store.assignments[pk] || []).map(normalizeKeys);
      });
    }
  });
  // fingerprint of the original (pre-edit) data, so an exported file can be
  // checked against whichever base data a downstream tool currently has
  runData._baseVersion = simpleHash(JSON.stringify(runData.stores));
  state.runs[key] = runData;
  if(!state.runOrder.includes(key)) state.runOrder.push(key);
  return key;
}

function pickStoreForRun(key){
  const stores = state.runs[key].stores;
  if(state.currentStore && stores[state.currentStore]) return state.currentStore;
  return Object.keys(stores)[0];
}

/* ---------------- run/store JSON loading ---------------- */

function removeRun(key){
  if(state.lockedRunId === key) releaseLock(key);
  delete state.runs[key];
  state.runOrder = state.runOrder.filter(k => k !== key);
  if(state.currentRun === key){
    state.currentRun = state.runOrder[0] || null;
    state.currentStore = state.currentRun ? pickStoreForRun(state.currentRun) : null;
    if(!state.currentRun) state.editMode = false;
  }
  render();
}

/* ---------------- settings export / import (file-based) ---------------- */

function exportSettingsFile(){
  const out = {};
  Object.entries(state.runSettings).forEach(([runId, s])=>{
    out[runId] = { fontScale: s.fontScale, labelScaleByStore: s.labelScaleByStore, searchText: s.searchText, selectedItems: Array.from(s.selectedItems), zoomByStore: s.zoomByStore, zoomByStorePeriod: s.zoomByStorePeriod, zoomMode: s.zoomMode, labelMode: s.labelMode, showEditStripes: s.showEditStripes, showEditTooltips: s.showEditTooltips, includeChangeLogInExport: s.includeChangeLogInExport, showChurnBadges: s.showChurnBadges, showOnlyChanged: s.showOnlyChanged, viewMode: s.viewMode };
  });
  downloadJson(out, 'slap_viewer_settings.json');
}

function downloadJson(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function itemPlain(item){ return item ? `${item.itemCode}${item.itemDesc ? ' (' + item.itemDesc + ')' : ''}` : 'empty'; }

function formatChangeLogForExport(runId){
  const log = getChangeLog(runId);
  return log.slice().reverse().map(entry=>{ // oldest first, for a readable history
    const at = new Date(entry.at).toISOString();
    let desc;
    if(entry.type === 'edited'){
      desc = `Changed ${itemPlain(entry.prevItem)} -> ${itemPlain(entry.item)} at ${entry.ctx.locCode} part ${entry.ctx.part} (${storeNameFor(runId, entry.ctx.storeCode)}, ${periodLabel(entry.ctx.period)})`;
    } else if(entry.type === 'added'){
      desc = `Added ${itemPlain(entry.item)} at ${entry.ctx.locCode} part ${entry.ctx.part} (${storeNameFor(runId, entry.ctx.storeCode)}, ${periodLabel(entry.ctx.period)})`;
    } else if(entry.type === 'removed'){
      desc = `Removed ${itemPlain(entry.item)} from ${entry.ctx.locCode} part ${entry.ctx.part} (${storeNameFor(runId, entry.ctx.storeCode)}, ${periodLabel(entry.ctx.period)})`;
    } else if(entry.type === 'swapped'){
      desc = `Swapped ${itemPlain(entry.itemA)} (${entry.ctxA.locCode} p${entry.ctxA.part}, ${storeNameFor(runId, entry.ctxA.storeCode)}) with ${itemPlain(entry.itemB)} (${entry.ctxB.locCode} p${entry.ctxB.part}, ${storeNameFor(runId, entry.ctxB.storeCode)})`;
    } else if(entry.type === 'undo' || entry.type === 'redo'){
      const n = (entry.changes || []).length;
      desc = `${CHANGE_LABEL[entry.type]}${n ? ': ' + n + ' part(s) affected' : ''}`;
    } else {
      desc = entry.type;
    }
    return `${at} - ${desc}`;
  });
}

function exportEditedJson(){
  if(!state.currentRun) return;
  const run = state.runs[state.currentRun];
  const clone = JSON.parse(JSON.stringify(run));
  delete clone._catalogCache;
  delete clone.itemCatalog;
  delete clone.itemsPlan;
  delete clone.itemsAffinity;
  delete clone._sourceFormat;
  delete clone._sourceFileName;
  delete clone._baseVersion;
  const edits = getEdits(state.currentRun);
  const catalog = getCatalog(state.currentRun);
  Object.entries(edits).forEach(([storeCode, byPeriod])=>{
    const store = clone.stores[storeCode];
    if(!store) return;
    Object.entries(byPeriod).forEach(([period, byLoc])=>{
      let rows = store.assignments[period] || [];
      Object.entries(byLoc).forEach(([locCode, byPart])=>{
        Object.entries(byPart).forEach(([partStr, val])=>{
          const part = Number(partStr);
          rows = rows.filter(r => !(r.locatorNameCode === locCode && r.part === part));
          if(val !== null && val !== undefined){
            const item = catalog[String(val)];
            if(item){
              const origRow = ((run.stores[storeCode] && run.stores[storeCode].assignments[period]) || [])
                .find(r => r.locatorNameCode === locCode && r.part === part);
              rows.push({
                locatorNameCode: locCode, part,
                itemCode: item.itemCode, itemDesc: item.itemDesc, itemDesign: item.itemDesign,
                itemColor: item.itemColor, backColor: item.backColor, fontColor: item.fontColor,
                assignedCapSqm: origRow ? origRow.assignedCapSqm : null,
              });
            }
          }
        });
      });
      store.assignments[period] = rows;
    });
  });
  if(currentSettings().includeChangeLogInExport){
    clone._changeLog = formatChangeLogForExport(state.currentRun);
  }
  clone._session = {
    runId: state.currentRun,
    sessionId: getSessionId(),
    baseVersion: run._baseVersion || null,
    exportedAt: new Date().toISOString(),
  };
  downloadJson(denormalizeExport(clone), `assignment_${state.currentRun}_edited.json`);
}

// Reverse-map normalized assignment-row fields back to the original SQL-export
// schema before download. Scoped to assignment rows only (not the whole tree) --
// `locators` intentionally stays camelCase, matching the existing export script's
// convention, which was never part of the complaint and shouldn't be touched.

const ASSIGNMENT_ROW_DENORMALIZE = {
  locatorNameCode: 'LocatorNameCode',
  part: 'LocatorPart',
  itemCode: 'ItemCode',
  itemDesc: 'ItemDesc',
  itemDesign: 'ItemDesign',
  itemColor: 'ItemColor',
  backColor: 'BackColor',
  fontColor: 'FontColor',
  assignedCapSqm: 'AssignedCapSqm',
};

function denormalizeAssignmentRow(row){
  const out = {};
  Object.entries(row).forEach(([k, v])=>{
    out[ASSIGNMENT_ROW_DENORMALIZE[k] || k] = v;
  });
  return out;
}

function denormalizeExport(clone){
  Object.values(clone.stores || {}).forEach(store=>{
    Object.keys(store.assignments || {}).forEach(period=>{
      store.assignments[period] = (store.assignments[period] || []).map(denormalizeAssignmentRow);
    });
  });
  return clone;
}
/* ---------------- settings modal ---------------- */

