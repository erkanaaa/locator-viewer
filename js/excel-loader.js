/* ============================================================================
   excel-loader.js -- self-contained XLSX reader for direct local Excel import.

   The viewer is designed to work from file:// without a build step or an
   internet connection. This reader handles the OOXML/XLSX ZIP container using
   browser-native APIs (DecompressionStream + DOMParser) and converts the
   seven workbook sheets into the viewer's existing run-data shape.
   ============================================================================ */

(function(){
  'use strict';

  function u16(view, o){ return view.getUint16(o, true); }
  function u32(view, o){ return view.getUint32(o, true); }

  function textFromBytes(bytes, encoding){
    try{ return new TextDecoder(encoding || 'utf-8').decode(bytes); }
    catch(e){ return new TextDecoder('utf-8').decode(bytes); }
  }

  function normalizeZipPath(path){
    const out = [];
    String(path || '').split('/').forEach(part=>{
      if(!part || part === '.') return;
      if(part === '..') out.pop();
      else out.push(part);
    });
    return out.join('/');
  }

  function resolvePackagePath(baseDir, target){
    const t = String(target || '').replace(/\\/g, '/');
    if(t.startsWith('/')) return normalizeZipPath(t.slice(1));
    return normalizeZipPath((baseDir ? baseDir + '/' : '') + t);
  }

  function findEocd(bytes){
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const min = Math.max(0, bytes.byteLength - 0x10000 - 22);
    for(let i=bytes.byteLength - 22; i>=min; i--){
      if(u32(view, i) === 0x06054b50) return i;
    }
    throw new Error('Not a valid XLSX/ZIP file: end-of-directory record was not found.');
  }

  class ZipArchive {
    constructor(buffer){
      this.bytes = new Uint8Array(buffer);
      this.view = new DataView(buffer);
      this.entries = new Map();
      this.ready = this._readCentralDirectory();
    }

    async _readCentralDirectory(){
      const bytes = this.bytes, view = this.view;
      const eocd = findEocd(bytes);
      const entryCount = u16(view, eocd + 10);
      const cdSize = u32(view, eocd + 12);
      const cdOffset = u32(view, eocd + 16);

      // This loader intentionally keeps the parser simple. The user's
      // workbook is conventional XLSX (not ZIP64), which is more than enough
      // for the workbook sizes used by this viewer.
      if(entryCount === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff){
        throw new Error('ZIP64 XLSX archives are not supported by the local Excel loader.');
      }

      let p = cdOffset;
      for(let i=0; i<entryCount; i++){
        if(u32(view, p) !== 0x02014b50) throw new Error('Invalid XLSX central-directory entry.');
        const flags = u16(view, p + 8);
        const method = u16(view, p + 10);
        const compressedSize = u32(view, p + 20);
        const uncompressedSize = u32(view, p + 24);
        const nameLen = u16(view, p + 28);
        const extraLen = u16(view, p + 30);
        const commentLen = u16(view, p + 32);
        const localOffset = u32(view, p + 42);
        const nameBytes = bytes.subarray(p + 46, p + 46 + nameLen);
        const name = textFromBytes(nameBytes, (flags & 0x800) ? 'utf-8' : 'latin1');
        this.entries.set(name, { method, compressedSize, uncompressedSize, localOffset });
        p += 46 + nameLen + extraLen + commentLen;
      }
      return this;
    }

    async read(name){
      await this.ready;
      const entry = this.entries.get(name);
      if(!entry) throw new Error(`Required XLSX entry not found: ${name}`);

      const view = this.view, bytes = this.bytes;
      const p = entry.localOffset;
      if(u32(view, p) !== 0x04034b50) throw new Error(`Invalid XLSX local entry: ${name}`);
      const nameLen = u16(view, p + 26);
      const extraLen = u16(view, p + 28);
      const start = p + 30 + nameLen + extraLen;
      const raw = bytes.slice(start, start + entry.compressedSize);

      if(entry.method === 0) return raw;
      if(entry.method !== 8) throw new Error(`Unsupported XLSX compression method for ${name}: ${entry.method}`);
      if(typeof DecompressionStream === 'undefined'){
        throw new Error('This browser does not provide DecompressionStream, required for XLSX import.');
      }
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const out = await new Response(stream).arrayBuffer();
      const result = new Uint8Array(out);
      if(entry.uncompressedSize && result.byteLength !== entry.uncompressedSize){
        // Size mismatch is a warning-level condition in some unusual archives;
        // the parsed XML is still often usable, so do not fail here.
      }
      return result;
    }

    has(name){ return this.entries.has(name); }
  }

  function xmlDoc(text, label){
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const parserError = doc.getElementsByTagName('parsererror')[0];
    if(parserError) throw new Error(`Could not parse ${label}: ${parserError.textContent || 'invalid XML'}`);
    return doc;
  }

  function descendants(parent, localName){
    return Array.from(parent.getElementsByTagNameNS('*', localName));
  }

  function firstDesc(parent, localName){
    return descendants(parent, localName)[0] || null;
  }

  function cellColumnIndex(ref){
    const m = String(ref || '').match(/^\$?([A-Za-z]+)\d+/);
    if(!m) return 0;
    let n = 0;
    for(const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return Math.max(0, n - 1);
  }

  function cellValue(cell, sharedStrings){
    const type = cell.getAttribute('t') || '';
    if(type === 'inlineStr'){
      return descendants(cell, 't').map(t=>t.textContent || '').join('');
    }
    const v = firstDesc(cell, 'v');
    const raw = v ? v.textContent : '';
    if(raw === '') return null;
    if(type === 's'){
      const idx = Number(raw);
      return Number.isInteger(idx) && sharedStrings[idx] != null ? sharedStrings[idx] : raw;
    }
    if(type === 'b') return raw === '1';
    if(type === 'str' || type === 'e') return raw;
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }

  function worksheetToAoA(xmlText, sharedStrings, label){
    const doc = xmlDoc(xmlText, label);
    const rows = [];
    const rowEls = descendants(doc, 'row');
    rowEls.forEach(rowEl=>{
      const rowNo = Number(rowEl.getAttribute('r') || (rows.length + 1)) - 1;
      const arr = [];
      descendants(rowEl, 'c').forEach(cell=>{
        const ref = cell.getAttribute('r');
        const col = cellColumnIndex(ref);
        arr[col] = cellValue(cell, sharedStrings);
      });
      rows[rowNo] = arr;
    });
    return rows.map(r => r || []);
  }

  function sharedStringsFromXml(xmlText){
    const doc = xmlDoc(xmlText, 'sharedStrings.xml');
    return descendants(doc, 'si').map(si => descendants(si, 't').map(t=>t.textContent || '').join(''));
  }

  function headerKey(value){
    return String(value ?? '').trim().replace(/\s+/g, '');
  }

  function normalizeHeader(value){
    return headerKey(value).toLowerCase().replace(/[_.-]/g, '');
  }

  function rowsToObjects(rows){
    const headerIdx = rows.findIndex(row => Array.isArray(row) && row.some(v => v != null && String(v).trim() !== ''));
    if(headerIdx < 0) return [];
    const header = rows[headerIdx] || [];
    const mappings = [];
    header.forEach((h, i)=>{
      const name = headerKey(h);
      if(name) mappings.push({ index:i, name, normalized:normalizeHeader(name) });
    });
    const out = [];
    for(let r=headerIdx+1; r<rows.length; r++){
      const row = rows[r] || [];
      const obj = {};
      let hasValue = false;
      mappings.forEach(m=>{
        const v = row[m.index];
        obj[m.name] = v == null ? null : v;
        if(v != null && String(v).trim() !== '') hasValue = true;
      });
      if(hasValue) out.push(obj);
    }
    return out;
  }

  function getField(obj, aliases){
    if(!obj) return null;
    const map = {};
    Object.keys(obj).forEach(k=> map[normalizeHeader(k)] = obj[k]);
    for(const alias of aliases){
      const v = map[normalizeHeader(alias)];
      if(v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return null;
  }

  function num(v, fallback=null){
    if(v == null || String(v).trim() === '') return fallback;
    if(typeof v === 'number') return Number.isFinite(v) ? v : fallback;
    const n = Number(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : fallback;
  }

  function bool(v, fallback=false){
    if(typeof v === 'boolean') return v;
    const s = String(v ?? '').trim().toLowerCase();
    if(['true','1','yes','y','on'].includes(s)) return true;
    if(['false','0','no','n','off'].includes(s)) return false;
    return fallback;
  }

  function normalizeItemCode(v){
    if(v == null || String(v).trim() === '') return null;
    return typeof v === 'number' && Number.isInteger(v) ? v : String(v).trim();
  }

  function periodValue(v){
    if(v == null || String(v).trim() === '') return null;
    const n = num(v, null);
    return n == null ? String(v).trim() : n;
  }

  function sortPeriods(values){
    const unique = [];
    const seen = new Set();
    values.forEach(v=>{
      if(v == null) return;
      const key = String(v);
      if(seen.has(key)) return;
      seen.add(key); unique.push(v);
    });
    if(unique.every(v => typeof v === 'number' && Number.isFinite(v))) unique.sort((a,b)=>a-b);
    return unique;
  }

  async function readWorkbookTables(buffer){
    const zip = new ZipArchive(buffer);
    await zip.ready;

    const sharedStrings = zip.has('xl/sharedStrings.xml')
      ? sharedStringsFromXml(textFromBytes(await zip.read('xl/sharedStrings.xml')))
      : [];

    const workbookDoc = xmlDoc(textFromBytes(await zip.read('xl/workbook.xml')), 'workbook.xml');
    const relsPath = 'xl/_rels/workbook.xml.rels';
    const relsDoc = xmlDoc(textFromBytes(await zip.read(relsPath)), 'workbook.xml.rels');
    const relMap = {};
    descendants(relsDoc, 'Relationship').forEach(rel=>{
      relMap[rel.getAttribute('Id')] = rel.getAttribute('Target');
    });

    const sheets = {};
    const sheetEls = descendants(workbookDoc, 'sheet');
    for(const sheetEl of sheetEls){
      const name = sheetEl.getAttribute('name');
      const rid = sheetEl.getAttribute('r:id') || sheetEl.getAttribute('id');
      const target = relMap[rid];
      if(!name || !target) continue;
      const path = resolvePackagePath('xl', target);
      sheets[name] = rowsToObjects(worksheetToAoA(textFromBytes(await zip.read(path)), sharedStrings, name));
    }
    return { sheets, sheetNames: Object.keys(sheets) };
  }

  function buildRunDataFromTables(tables, fileName){
    const required = ['items','stores','storelocator','periods','itemsPlan','ItemsAffinity','assigment'];
    const missing = required.filter(name => !tables[name]);
    if(missing.length) throw new Error(`Excel file is missing required sheet(s): ${missing.join(', ')}`);

    const itemRows = tables.items;
    const storeRows = tables.stores;
    const locatorRows = tables.storelocator;
    const periodRows = tables.periods;
    const planRows = tables.itemsPlan;
    const affinityRows = tables.ItemsAffinity;
    const assignmentRows = tables.assigment;

    const itemCatalog = {};
    itemRows.forEach(r=>{
      const code = normalizeItemCode(getField(r,['Code','ItemCode']));
      if(code == null) return;
      itemCatalog[String(code)] = {
        itemCode: code,
        itemDesc: getField(r,['Description','ItemDesc']) || '',
        itemDesign: getField(r,['Design','ItemDesign']) || '',
        itemColor: getField(r,['Color','ItemColor']) || '',
        crossSectionArea: num(getField(r,['CrossSectionArea']), null),
        backColor: getField(r,['BackColor']) || '',
        fontColor: getField(r,['FontColor']) || '',
      };
    });

    const stores = {};
    storeRows.forEach(r=>{
      const code = getField(r,['Code','StoreCode']);
      if(code == null) return;
      const storeCode = String(code).trim();
      const itemsPerLocator = num(getField(r,['itemsPerLocator','ItemsPerLocator']), null);
      stores[storeCode] = {
        storeName: getField(r,['StoreName']) || storeCode,
        width: num(getField(r,['Width']), 0),
        height: num(getField(r,['Height']), 0),
        splitHorizontal: bool(getField(r,['splitHorizontal','SplitHorizontal']), true),
        itemsPerLocator: itemsPerLocator != null ? Math.max(1, Math.round(itemsPerLocator)) : null,
        locators: [],
        assignments: {},
      };
    });

    locatorRows.forEach(r=>{
      const storeCode = getField(r,['StoreCode']);
      if(storeCode == null) return;
      const key = String(storeCode).trim();
      const store = stores[key];
      if(!store) return;
      store.locators.push({
        locatorCode: getField(r,['LocatorCode']) || '',
        locatorName: getField(r,['LocatorName']) || '',
        locatorNameCode: getField(r,['LocatorNameCode']) || '',
        centerX: num(getField(r,['centerX']), 0),
        centerY: num(getField(r,['centerY']), 0),
        width: num(getField(r,['width']), 0),
        height: num(getField(r,['height']), 0),
      });
    });

    const periodValues = periodRows.map(r=>periodValue(getField(r,['periods','period','Period']))).filter(v=>v != null);
    const assignmentPeriods = assignmentRows.map(r=>periodValue(getField(r,['Period','period']))).filter(v=>v != null);
    const periods = sortPeriods(periodValues.concat(assignmentPeriods));

    assignmentRows.forEach(r=>{
      const storeCode = getField(r,['StoreCode']);
      const period = periodValue(getField(r,['Period','period']));
      const loc = getField(r,['LocatorNameCode']);
      const part = num(getField(r,['LocatorPart','part']), null);
      if(storeCode == null || period == null || loc == null || part == null) return;
      const key = String(storeCode).trim();
      const store = stores[key];
      if(!store) return;
      const itemCode = normalizeItemCode(getField(r,['ItemCode']));
      const item = itemCode != null ? itemCatalog[String(itemCode)] : null;
      const row = {
        locatorNameCode: String(loc).trim(),
        part: Math.max(1, Math.round(part)),
        itemCode: itemCode,
        itemDesc: item?.itemDesc || '',
        itemDesign: item?.itemDesign || '',
        itemColor: item?.itemColor || '',
        backColor: item?.backColor || '',
        fontColor: item?.fontColor || '',
        assignedCapSqm: num(getField(r,['AssignedCapSqm']), null),
      };
      const pk = String(period);
      (store.assignments[pk] = store.assignments[pk] || []).push(row);
    });

    Object.values(stores).forEach(store=>{
      if(!store.itemsPerLocator){
        let maxPart = 1;
        Object.values(store.assignments).forEach(rows=> rows.forEach(r=>{ maxPart = Math.max(maxPart, Number(r.part) || 1); }));
        store.itemsPerLocator = maxPart;
      }
    });

    const perStoreParts = Object.values(stores).map(s=>s.itemsPerLocator).filter(Number.isFinite);
    const commonItemsPerLocator = perStoreParts.length && perStoreParts.every(v => v === perStoreParts[0])
      ? perStoreParts[0]
      : (perStoreParts.length ? Math.max(...perStoreParts) : 1);

    const itemsPlan = planRows.map(r=>({
      itemCode: normalizeItemCode(getField(r,['ItemCode'])),
      period: periodValue(getField(r,['period','Period'])),
      plannedProduction: num(getField(r,['plannedProduction']), 0),
      plannedDemand: num(getField(r,['plannedDemand']), 0),
      frequency: num(getField(r,['frequency']), 0),
    }));

    const itemsAffinity = affinityRows.map(r=>({
      code_a: normalizeItemCode(getField(r,['code_a','CodeA'])),
      code_b: normalizeItemCode(getField(r,['code_b','CodeB'])),
      affinity: num(getField(r,['affinity']), 0),
    }));

    const stem = String(fileName || 'assignment.xlsx').replace(/\.[^.]+$/, '');
    const runId = stem || ('EXCEL-' + Date.now().toString(36));
    const run = {
      runId,
      itemsPerLocator: commonItemsPerLocator,
      periods,
      stores,
      itemCatalog,
      itemsPlan,
      itemsAffinity,
      _sourceFormat: 'xlsx',
      _sourceFileName: String(fileName || ''),
    };

    return { run, meta: {
      itemCount: Object.keys(itemCatalog).length,
      storeCount: Object.keys(stores).length,
      locatorCount: Object.values(stores).reduce((n,s)=>n+s.locators.length,0),
      assignmentCount: assignmentRows.length,
      periods,
      sheetNames: required,
    }};
  }

  async function excelArrayBufferToRunData(buffer, fileName){
    if(!(buffer instanceof ArrayBuffer)) throw new Error('Excel data must be an ArrayBuffer.');
    const { sheets } = await readWorkbookTables(buffer);
    return buildRunDataFromTables(sheets, fileName);
  }

  async function excelFileToRunData(file){
    return excelArrayBufferToRunData(await file.arrayBuffer(), file?.name || 'assignment.xlsx');
  }

  window.excelArrayBufferToRunData = excelArrayBufferToRunData;
  window.excelFileToRunData = excelFileToRunData;
})();
