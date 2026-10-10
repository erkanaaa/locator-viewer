/* ==========================================================================
   modal.js -- the overlay dialogs: assign-item picker, settings, and the
   multi-session take-over / resume-edits prompts.
   ========================================================================== */

function openEditPicker(storeCode, period, loc, part){
  document.querySelectorAll('.modal-overlay').forEach(n => n.remove());
  const root = document.getElementById('modalRoot');
  const catalog = getCatalog(state.currentRun);
  const items = Object.values(catalog).sort((a,b)=> String(a.itemDesc||'').localeCompare(String(b.itemDesc||'')));

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-head">
        <div><h4>Assign item</h4><div class="loc-code">${loc.locatorNameCode} &middot; part ${part}</div></div>
        <button class="modal-close" id="mClose">&times;</button>
      </div>
      <div class="modal-body">
        <input class="modal-search" id="mSearch" placeholder="Search item code / description" />
        <button class="modal-clear-btn" id="mClear">Clear this part (make it empty)</button>
        <div class="modal-list" id="mList"></div>
      </div>
    </div>
  `;
  root.appendChild(overlay);
  function close(){ overlay.remove(); }
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) close(); });
  overlay.querySelector('#mClose').onclick = close;
  overlay.querySelector('#mClear').onclick = ()=>{ clearPart(storeCode, period, loc.locatorNameCode, part); close(); };
  const listEl = overlay.querySelector('#mList');
  function renderList(query){
    const q = normalizeFa(query);
    const filtered = q ? items.filter(it =>
      normalizeFa(it.itemCode).includes(q) || normalizeFa(it.itemDesc).includes(q) ||
      normalizeFa(it.itemColor).includes(q) || normalizeFa(it.itemDesign).includes(q)
    ) : items;
    const shown = filtered.slice(0, 200);
    listEl.innerHTML = '';
    if(!shown.length){ listEl.innerHTML = `<div class="hint">No items match.</div>`; return; }
    shown.forEach(it=>{
      const row = document.createElement('div');
      row.className = 'modal-item';
      row.innerHTML = `<div class="swatch" style="background:${escapeHtml(it.backColor||'')}"></div>
        <div style="min-width:0;">
          <div class="legend-code">${escapeHtml(it.itemCode)}</div>
          <div style="font-size:11.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(it.itemDesc||'')} ${it.itemColor?(' \u2014 '+escapeHtml(it.itemColor)):''}</div>
        </div>`;
      row.onclick = ()=>{
        applyEdit(state.currentRun, storeCode, period, loc.locatorNameCode, part, it.itemCode);
        close(); render();
      };
      listEl.appendChild(row);
    });
  }
  renderList('');
  const searchEl = overlay.querySelector('#mSearch');
  searchEl.addEventListener('input', ()=> renderList(searchEl.value));
  searchEl.focus();
}

/* ---------------- SVG generation for one period ---------------- */

function openSettingsModal(){
  document.querySelectorAll('.modal-overlay').forEach(n => n.remove());
  const root = document.getElementById('modalRoot');
  const hasRun = !!state.currentRun;
  const s = hasRun ? currentSettings() : null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-head">
        <h4>Settings</h4>
        <button class="modal-close" id="sClose">&times;</button>
      </div>
      <div class="modal-body">
        ${hasRun ? `
        <div class="settings-section">
          <h5>Zoom behavior</h5>
          <label class="radio-row"><input type="radio" name="zoomMode" value="horizontal" ${s.zoomMode==='horizontal'?'checked':''}/> Horizontal only — change locator length, keep height fixed; label size follows zoom without distortion</label>
          <label class="radio-row"><input type="radio" name="zoomMode" value="both" ${s.zoomMode==='both'?'checked':''}/> Both directions — scale locator width and height together</label>
        </div>
        <div class="settings-section">
          <h5>Locator part label</h5>
          <label class="radio-row"><input type="radio" name="labelMode" value="both" ${s.labelMode==='both'?'checked':''}/> Design &amp; color</label>
          <label class="radio-row"><input type="radio" name="labelMode" value="design" ${s.labelMode==='design'?'checked':''}/> Design only</label>
          <label class="radio-row"><input type="radio" name="labelMode" value="color" ${s.labelMode==='color'?'checked':''}/> Color only</label>
        </div>
        <div class="settings-section">
          <h5>Edit mode</h5>
          <label class="check-row"><input type="checkbox" id="stripeToggle" ${s.showEditStripes?'checked':''}/> Show diagonal stripes on edited parts</label>
          <label class="check-row"><input type="checkbox" id="editTooltipToggle" ${s.showEditTooltips?'checked':''}/> Show locator-part tooltips while editing</label>
          <label class="check-row"><input type="checkbox" id="changeLogExportToggle" ${s.includeChangeLogInExport?'checked':''}/> Include recent-changes log when exporting edited JSON</label>
        </div>
        <div class="settings-section">
          <h5>Period-over-period stability</h5>
          <label class="check-row"><input type="checkbox" id="churnBadgeToggle" ${s.showChurnBadges?'checked':''}/> Flag locators whose item changed from the previous period</label>
        </div>
        ` : `<div class="hint" style="margin:0;">Load a run to see per-run settings here.</div>`}
        <div class="settings-section">
          <h5>Mouse wheel</h5>
          <label class="radio-row"><input type="radio" name="wheelMode" value="vertical" ${getWheelMode()!=='horizontal'?'checked':''}/> Scroll vertically (default)</label>
          <label class="radio-row"><input type="radio" name="wheelMode" value="horizontal" ${getWheelMode()==='horizontal'?'checked':''}/> Scroll through periods horizontally</label>
        </div>
        <div class="settings-section">
          <h5>Backup &amp; restore settings</h5>
          <div class="settings-btn-row">
            <button class="settings-btn" id="sExport">Export settings&hellip;</button>
            <button class="settings-btn" id="sImport">Import settings&hellip;</button>
          </div>
        </div>
      </div>
    </div>
  `;
  root.appendChild(overlay);
  function close(){ overlay.remove(); }
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) close(); });
  overlay.querySelector('#sClose').onclick = close;
  overlay.querySelector('#sExport').onclick = exportSettingsFile;
  overlay.querySelector('#sImport').onclick = ()=> document.getElementById('settingsFileInput').click();
  overlay.querySelectorAll('input[name="wheelMode"]').forEach(r=>{
    r.addEventListener('change', ()=> setWheelMode(r.value));
  });
  if(hasRun){
    overlay.querySelectorAll('input[name="zoomMode"]').forEach(r=>{
      r.addEventListener('change', changeZoomMode);
    });
    overlay.querySelectorAll('input[name="labelMode"]').forEach(r=>{
      r.addEventListener('change', ()=>{ s.labelMode = r.value; persistCurrent(); renderPeriods(); });
    });
    overlay.querySelector('#stripeToggle').addEventListener('change', (e)=>{
      s.showEditStripes = e.target.checked; persistCurrent(); renderPeriods();
    });
    overlay.querySelector('#editTooltipToggle').addEventListener('change', (e)=>{
      s.showEditTooltips = e.target.checked; persistCurrent();
      if(!e.target.checked) hideTooltip();
    });
    overlay.querySelector('#changeLogExportToggle').addEventListener('change', (e)=>{
      s.includeChangeLogInExport = e.target.checked; persistCurrent();
    });
    overlay.querySelector('#churnBadgeToggle').addEventListener('change', (e)=>{
      s.showChurnBadges = e.target.checked; persistCurrent(); renderPeriods();
    });
  }
}

/* ---------------- top action bar (edit-mode-aware) ---------------- */

function showTakeOverPrompt(runId, onTakeOver){
  document.querySelectorAll('.modal-overlay').forEach(n=>n.remove());
  const lock = readLock(runId);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="width:400px;">
      <div class="modal-head"><h4>Being edited elsewhere</h4><button class="modal-close" id="tClose">&times;</button></div>
      <div class="modal-body">
        <div class="hint" style="margin:0;">Run ${escapeXml(runId)} is currently open for editing in another session${lock ? ' (last active '+relTime(lock.lastHeartbeat)+')' : ''}. You can keep viewing read-only, or take over -- the other session will be switched to read-only automatically.</div>
        <div class="settings-btn-row">
          <button class="settings-btn warn" id="tTakeOver">Take over editing</button>
          <button class="settings-btn" id="tCancel">Stay read-only</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(overlay);
  const close = ()=> overlay.remove();
  overlay.querySelector('#tClose').onclick = close;
  overlay.querySelector('#tCancel').onclick = close;
  overlay.querySelector('#tTakeOver').onclick = ()=>{ close(); onTakeOver(); };
}

function showResumePrompt(runId, other){
  document.querySelectorAll('.modal-overlay').forEach(n=>n.remove());
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="width:400px;">
      <div class="modal-head"><h4>Unsaved edits found</h4><button class="modal-close" id="rClose">&times;</button></div>
      <div class="modal-body">
        <div class="hint" style="margin:0;">Run ${escapeXml(runId)} has unsaved edits from another session on this device (e.g. a tab that was closed without exporting). What would you like to do?</div>
        <div class="settings-btn-row" style="flex-direction:column; align-items:stretch;">
          <button class="settings-btn" id="rResume">Resume those edits in this tab</button>
          <button class="settings-btn warn" id="rDiscard">Discard them</button>
          <button class="settings-btn" id="rIgnore">Leave as-is (view read-only)</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(overlay);
  const close = ()=> overlay.remove();
  overlay.querySelector('#rClose').onclick = close;
  overlay.querySelector('#rIgnore').onclick = close;
  overlay.querySelector('#rResume').onclick = ()=>{
    migrateSessionData(runId, other.sessionId, getSessionId());
    close(); render();
    pushInfo('info', `Resumed edits from a previous session for run ${runId}.`);
  };
  overlay.querySelector('#rDiscard').onclick = ()=>{
    cleanupSessionData(runId, other.sessionId);
    close();
    pushInfo('info', `Discarded old session data for run ${runId}.`);
  };
}

/* ---------------- period-to-period difference view ---------------- */
function showPeriodDiffModal(storeCode, periodBefore, periodAfter){
  document.querySelectorAll('.modal-overlay').forEach(n=>n.remove());
  const runId = state.currentRun;
  const store = state.runs[runId].stores[storeCode];
  const itemsPerLocator = getItemsPerLocator(runId, storeCode);
  const diff = computePeriodDiff(runId, storeCode, periodBefore, periodAfter);
  const churnBefore = null; // thumbnails: no churn badges, keep them clean and simple
  const thumbBefore = buildSvgMarkup(store, storeCode, itemsPerLocator, String(periodBefore), churnBefore, true).svg;
  const thumbAfter = buildSvgMarkup(store, storeCode, itemsPerLocator, String(periodAfter), churnBefore, true).svg;
  const labelBefore = periodBefore === 0 ? 'Baseline' : 'Period ' + periodBefore;
  const labelAfter = periodAfter === 0 ? 'Baseline' : 'Period ' + periodAfter;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="width:560px;">
      <div class="modal-head">
        <h4>${labelBefore} &rarr; ${labelAfter}</h4>
        <button class="modal-close" id="dClose">&times;</button>
      </div>
      <div class="modal-body">
        <div class="diff-thumbs">
          <div class="diff-thumb-wrap">
            <div class="diff-thumb">${thumbBefore}</div>
            <div class="diff-thumb-label">${labelBefore}</div>
          </div>
          <div class="diff-arrow">
            ${icon('compare')}
            <span>${diff.relocated} moved</span>
          </div>
          <div class="diff-thumb-wrap">
            <div class="diff-thumb">${thumbAfter}</div>
            <div class="diff-thumb-label">${labelAfter}</div>
          </div>
        </div>
        <div class="diff-stats">
          <div class="diff-stat"><span class="diff-dot added"></span>${diff.newlyAssigned} newly assigned</div>
          <div class="diff-stat"><span class="diff-dot removed"></span>${diff.released} released</div>
          <div class="diff-stat"><span class="diff-dot relocated"></span>${diff.relocated} relocated</div>
          <div class="diff-stat"><span class="diff-dot unchanged"></span>${diff.unchanged} unchanged</div>
        </div>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(overlay);
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) overlay.remove(); });
  overlay.querySelector('#dClose').onclick = ()=> overlay.remove();
  overlay.querySelectorAll('.diff-thumb svg').forEach(svg=>{
    svg.setAttribute('width', '220');
    svg.removeAttribute('height');
  });
}

/* ---------------- locator detail panel (cross-period) ---------------- */
function showLocatorDetail(storeCode, locCode){
  document.querySelectorAll('.modal-overlay').forEach(n=>n.remove());
  const runId = state.currentRun;
  const { loc, perPart, periods } = getLocatorDetailData(runId, storeCode, locCode);
  if(!loc) return;

  const periodRows = periods.map(p=>{
    const partLines = Object.keys(perPart).map(part=>{
      const entry = perPart[part].find(e => e.period === p);
      const item = entry && entry.item;
      const label = item ? `${escapeXml(item.itemCode)}${item.itemDesc ? ' ('+escapeXml(item.itemDesc)+')' : ''}` : 'empty';
      return `<div class="ld-part-line">Part ${part} &rarr; ${label}</div>`;
    }).join('');
    return `<div class="ld-period"><h5>${p===0?'Baseline':'Period '+p}</h5>${partLines}</div>`;
  }).join('');

  const historyLines = Object.keys(perPart).map(part=>{
    const chain = perPart[part].map(e => e.item ? escapeXml(String(e.item.itemCode)) : '&mdash;').join(' &rarr; ');
    return `<div class="ld-history-line">Part ${part}: ${chain}</div>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="width:400px;">
      <div class="modal-head">
        <h4>Locator Detail</h4>
        <button class="modal-close" id="lClose">&times;</button>
      </div>
      <div class="modal-body">
        <div class="ld-meta">
          <div><b>Locator:</b> ${escapeXml(loc.locatorNameCode)}</div>
          <div><b>Position:</b> (${loc.centerX}, ${loc.centerY})</div>
          <div><b>Size:</b> ${loc.width} &times; ${loc.height}</div>
        </div>
        <div class="ld-periods">${periodRows}</div>
        <div class="settings-section">
          <h5>Change history</h5>
          ${historyLines}
        </div>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(overlay);
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) overlay.remove(); });
  overlay.querySelector('#lClose').onclick = ()=> overlay.remove();
}

/* ---------------- help ---------------- */
function showHelpModal(){
  document.querySelectorAll('.modal-overlay').forEach(n=>n.remove());
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="width:640px; max-height:85vh;">
      <div class="modal-head">
        <h4>Help</h4>
        <button class="modal-close" id="hClose">&times;</button>
      </div>
      <div class="modal-body" style="gap:16px;">

        <div class="settings-section">
          <h5>Getting started</h5>
          <p>Click the folder icon to load one or more exported run JSON or Excel (<code>.xlsx</code> / <code>.xlsm</code>) files. Each becomes its own <b>Run</b> tab; a run's <b>Store</b> tabs appear once it's selected. Excel workbooks are read directly using these required sheets: <code>items</code>, <code>stores</code>, <code>storelocator</code>, <code>periods</code>, <code>itemsPlan</code>, <code>ItemsAffinity</code>, and <code>assigment</code>. Use the &times; on a run tab to remove it from the list (this doesn't delete anything on disk).</p>
        </div>

        <div class="settings-section">
          <h5>Viewing the floor plan</h5>
          <p>Every period for the current store is shown side by side. Period cards keep a stable UI width, while each store's floor-plan SVG is recalculated from that store's own width and height. Each locator is a rounded rectangle, split into one or more numbered parts. Hover any part for full item details.</p>
          <ul>
            <li><b>All periods Zoom / Fit</b> and <b>label size</b> controls are in the store info bar. Per-period zoom controls are in each period header.</li>
            <li><b>Zoom behavior</b> in Settings chooses <b>Horizontal only</b> (locator length changes while height stays fixed) or <b>Both directions</b> (previous width + height behavior). In horizontal-only mode, labels and locator UI badges remain visually undistorted.</li>
            <li><b>Label content</b> (design, color, or both) is set in Settings.</li>
            <li><b>Search / item filter</b> &mdash; type in the search box, or click any part or a legend entry to isolate that item; the store layout stays visible, only matching parts keep their color.</li>
            <li><b>"Changed only" filter</b> (triangle icon) shows only locators whose item differs from the previous period.</li>
            <li><b>"Changes view"</b> (layers icon) recolors every part by period-over-period status instead of its real item color: light blue = unchanged, light red = changed, empty stays empty. Period 0 (Baseline) always shows real colors, since there's no earlier period to compare it to. Recolors live as you edit.</li>
          </ul>
        </div>

        <div class="settings-section">
          <h5>Editing</h5>
          <p>Click <b>Edit mode</b> to start editing (only one session can edit a given run at a time &mdash; see Multi-session below). While editing:</p>
          <ul>
            <li><b>Click</b> a part &mdash; filters by that item (same as view mode).</li>
            <li><b>Right-click</b> a part &mdash; opens the item picker to change its assignment.</li>
            <li><b>Drag</b> one part onto another &mdash; swaps their assignments (works across periods too).</li>
            <li><b>X icon</b> on an occupied part, or the <b>Delete</b> key while hovering &mdash; clears that assignment.</li>
            <li><b>Undo / Redo</b> (or Ctrl+Z / Ctrl+Y) &mdash; a swap undoes/redoes as one atomic step.</li>
            <li>Edited parts show a light diagonal stripe (toggle in Settings).</li>
            <li><b>Discard edits</b> reverts everything back to the original data for this run.</li>
            <li><b>Export edited JSON</b> (or Ctrl+S) downloads the run with your edits merged in, using the original field names (LocatorPart, ItemCode, etc.) so it matches your source data.</li>
          </ul>
        </div>

        <div class="settings-section">
          <h5>Stability &amp; period comparison</h5>
          <p>The store info bar shows a <b>Stability</b> score &mdash; the share of locator/part pairs keeping the same item from one period to the next, compared to a fixed <b>baseline</b> computed from the original, unedited data.</p>
          <ul>
            <li>An amber warning badge marks any part whose item changed from the previous period (toggle in Settings).</li>
            <li>The compare icon in each period's header (except the first) opens a <b>Period difference</b> view: two small thumbnails plus counts of newly assigned, released, relocated, and unchanged locators.</li>
            <li>The small "i" icon on each locator opens its <b>Locator Detail</b> panel: position, size, every period's assignment, and a compact change-history chain per part.</li>
          </ul>
        </div>

        <div class="settings-section">
          <h5>Side panels</h5>
          <p>Three panels &mdash; <b>Items in view</b>, <b>Recent changes</b>, and <b>Information</b> &mdash; toggle from the toolbar (or P / H / I). They stack in one column, which only appears once at least one panel is open. Use the &uarr;/&darr; buttons in a panel's header to reorder the stack, and the trash icon there to clear that panel's contents.</p>
        </div>

        <div class="settings-section">
          <h5>Settings</h5>
          <p>The gear icon opens zoom behavior, label content, edit-stripe and churn-badge visibility, whether exported JSON includes the recent-changes log, mouse-wheel behavior (vertical scroll vs. scrolling through periods), and settings backup/restore as a file. Label size is controlled beside zoom in the store info bar and is remembered independently for each store. "Reset" (next to the gear) resets zoom/label size/filter for the current run only.</p>
        </div>

        <div class="settings-section">
          <h5>Multi-session safety</h5>
          <p>Each browser tab has its own session. Only one session can hold editing rights for a given run at a time; opening a run that's being edited elsewhere puts you in read-only mode with an option to take over (which switches the other session to read-only). Edits, settings, undo history, and the change log are all kept separately per session, so tabs never silently overwrite each other. If a run has leftover edits from an earlier session (e.g. a closed tab), you'll be asked whether to resume, discard, or leave them alone.</p>
        </div>

        <div class="settings-section">
          <h5>Keyboard shortcuts</h5>
          <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
            <tr><td style="padding:3px 8px 3px 0; color:var(--ink-soft);">E</td><td>Toggle edit mode</td></tr>
            <tr><td style="padding:3px 8px 3px 0; color:var(--ink-soft);">Ctrl+Z / Ctrl+Y</td><td>Undo / Redo (edit mode)</td></tr>
            <tr><td style="padding:3px 8px 3px 0; color:var(--ink-soft);">Ctrl+S</td><td>Export edited JSON (edit mode)</td></tr>
            <tr><td style="padding:3px 8px 3px 0; color:var(--ink-soft);">Delete / Backspace</td><td>Clear the hovered part (edit mode)</td></tr>
            <tr><td style="padding:3px 8px 3px 0; color:var(--ink-soft);">/</td><td>Focus the search box</td></tr>
            <tr><td style="padding:3px 8px 3px 0; color:var(--ink-soft);">+ / &minus; / 0</td><td>Zoom in / out / fit</td></tr>
            <tr><td style="padding:3px 8px 3px 0; color:var(--ink-soft);">P / H / I</td><td>Toggle Items / Recent changes / Information panel</td></tr>
            <tr><td style="padding:3px 8px 3px 0; color:var(--ink-soft);">,</td><td>Open Settings</td></tr>
            <tr><td style="padding:3px 8px 3px 0; color:var(--ink-soft);">?</td><td>Open this Help</td></tr>
            <tr><td style="padding:3px 8px 3px 0; color:var(--ink-soft);">Esc</td><td>Close any open modal</td></tr>
          </table>
        </div>

      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(overlay);
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) overlay.remove(); });
  overlay.querySelector('#hClose').onclick = ()=> overlay.remove();
}