/* ==========================================================================
   drag.js -- pointer-based drag-to-swap, click-to-edit, right-click/Delete
   to clear. Exposes wirePartGroupEvents(g, ctx) and wireClearIcons(svgEl, ctx),
   called once per rendered period card from render.js's renderPeriods().
   ========================================================================== */

let dragSource = null;
let hoveredPartRef = null;

/**
 * Wires interaction for a single locator-part <g> element: hover tooltip,
 * click-to-filter (both modes, matching view-mode behavior), right-click
 * to open the item picker (edit mode only), and pointer-capture-based
 * drag-to-swap. Clearing an assignment is only ever done via the small
 * "x" clear-icon (see wireClearIcons) -- right-click used to clear
 * instantly, which made it too easy to lose an assignment by accident.
 *
 * ctx = { storeCode, pk, byLocatorLookup, byLocatorAssign, churnMap }
 */
function wirePartGroupEvents(g, ctx){
  const { storeCode, pk, byLocatorLookup, byLocatorAssign, churnMap } = ctx;
  const locCode = g.getAttribute('data-loc');
  const part = +g.getAttribute('data-part');
  const ref = { storeCode, period: pk, locCode, part };
  const editVal = getEditFor(state.currentRun, storeCode, pk, locCode, part);
  const isEdited = editVal !== undefined;
  let assign = byLocatorAssign[locCode] ? byLocatorAssign[locCode][part] : null;
  if(isEdited){
    const catalog = getCatalog(state.currentRun);
    assign = (editVal === null) ? null : (catalog[String(editVal)] || null);
  }
  const isChurned = !!(churnMap && churnMap[`${pk}|${locCode}|${part}`]);

  g.addEventListener('mouseenter', (e)=>{ hoveredPartRef = ref; showTooltip(e, byLocatorLookup[locCode], part, assign, isEdited, isChurned); });
  g.addEventListener('mousemove', positionTooltip);
  g.addEventListener('mouseleave', ()=>{ if(hoveredPartRef===ref) hoveredPartRef=null; hideTooltip(); });

  function toggleFilterFor(item){
    if(!item) return;
    const s = currentSettings();
    const code = String(item.itemCode);
    if(s.selectedItems.has(code)) s.selectedItems.delete(code);
    else s.selectedItems.add(code);
    persistCurrent();
    render();
  }

  if(state.editMode){
    g.addEventListener('contextmenu', (e)=>{ e.preventDefault(); openEditPicker(storeCode, pk, byLocatorLookup[locCode], part); });
    // Pointer-events-based drag with pointer capture: unlike a previous
    // mousedown+window-listener approach, events are captured directly to
    // `g` itself, so cleanup is guaranteed by the browser even if the
    // pointer leaves the page mid-drag (releasing outside the window,
    // fast movement, etc). A stray uncleaned mousemove/mouseup listener
    // from an earlier interrupted drag was the cause of phantom swaps
    // between unrelated parts -- this design makes that impossible,
    // since each drag's listeners live only on the element being dragged
    // and are torn down on pointerup/pointercancel/lostpointercapture.
    g.addEventListener('pointerdown', (e)=>{
      if(e.button !== 0) return;
      e.preventDefault();
      try{ g.setPointerCapture(e.pointerId); }catch(err){}
      const pid = e.pointerId;
      const startX = e.clientX, startY = e.clientY;
      const THRESHOLD = 6;
      let dragging = false;
      let lastTarget = null;

      function onMove(ev){
        if(ev.pointerId !== pid) return;
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if(!dragging && Math.hypot(dx, dy) > THRESHOLD){
          dragging = true;
          g.classList.add('dragging');
          hideTooltip();
        }
        if(dragging){
          const el = document.elementFromPoint(ev.clientX, ev.clientY);
          const targetG = el ? el.closest('.part-group') : null;
          if(targetG !== lastTarget){
            if(lastTarget) lastTarget.classList.remove('drop-target');
            if(targetG && targetG !== g) targetG.classList.add('drop-target');
            lastTarget = targetG;
          }
        }
      }
      function finish(ev){
        if(ev && ev.pointerId !== pid) return;
        g.removeEventListener('pointermove', onMove);
        g.removeEventListener('pointerup', finish);
        g.removeEventListener('pointercancel', finish);
        g.removeEventListener('lostpointercapture', finish);
        try{ g.releasePointerCapture(pid); }catch(err){}
        g.classList.remove('dragging');
        if(lastTarget) lastTarget.classList.remove('drop-target');
        if(dragging){
          if(lastTarget && lastTarget !== g){
            const dstLoc = lastTarget.getAttribute('data-loc');
            const dstPart = +lastTarget.getAttribute('data-part');
            const dstPeriod = lastTarget.getAttribute('data-period');
            swapParts({ storeCode, period: pk, locCode, part }, { storeCode, period: dstPeriod, locCode: dstLoc, part: dstPart });
          }
        } else if(ev && ev.type === 'pointerup'){
          // no real movement -- same click-to-filter behavior as view mode
          toggleFilterFor(assign);
        }
      }
      g.addEventListener('pointermove', onMove);
      g.addEventListener('pointerup', finish);
      g.addEventListener('pointercancel', finish);
      g.addEventListener('lostpointercapture', finish);
    });
  } else {
    g.addEventListener('click', ()=> toggleFilterFor(assign));
  }
}

/** Wires the small per-part "clear" (x) icons drawn in edit mode. */
function wireClearIcons(svgEl, ctx){
  const { storeCode } = ctx;
  svgEl.querySelectorAll('.clear-icon').forEach(ic=>{
    ic.addEventListener('pointerdown', (e)=> e.stopPropagation());
    ic.addEventListener('click', (e)=>{
      e.stopPropagation();
      const locCode = ic.getAttribute('data-loc');
      const part = +ic.getAttribute('data-part');
      const period = ic.getAttribute('data-period');
      applyEdit(state.currentRun, storeCode, period, locCode, part, null);
      render();
    });
  });
}

/** Wires the per-locator "i" info icons that open the Locator Detail panel. */
function wireLocatorInfoIcons(svgEl, ctx){
  const { storeCode } = ctx;
  svgEl.querySelectorAll('.locator-info-icon').forEach(ic=>{
    ic.addEventListener('pointerdown', (e)=> e.stopPropagation());
    ic.addEventListener('click', (e)=>{
      e.stopPropagation();
      const locCode = ic.getAttribute('data-loc');
      showLocatorDetail(storeCode, locCode);
    });
  });
}
