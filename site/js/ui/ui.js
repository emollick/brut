// The interface: top bar, tool rail, inspector, and the console along the bottom.
import { icon } from './icons.js';
import { TYPES, TYPE_ORDER, PARAMS, GROUPS, ACCENTS, NOTES, optionsFor, makeDNA } from '../arch/dna.js';
import { WEATHER, PLACES, sunTimes } from '../gfx/env.js';
import { LENSES, TIERS } from '../gfx/pipeline.js';
import { SITES } from '../world/ground.js';
import { TREE_KINDS } from '../world/props.js';
import { DOCTRINES } from '../estate.js';
import { linToHex, hexToLin, clamp } from '../util.js';

export function el(tag, cls, kids, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const k in attrs) { if (k === 'html') e.innerHTML = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]); }
  if (kids !== undefined && kids !== null) for (const k of [].concat(kids)) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
const btn = (cls, label, onclick, attrs) => el('button', cls, label, { type: 'button', onclick, ...attrs });
const ibtn = (name, title, onclick, cls = '') => el('button', 'ib ' + cls, null, { type: 'button', html: icon(name), title, 'aria-label': title, onclick });
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], MLEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function dayLabel(d) { let m = 0, r = Math.round(d) % 365; while (r >= MLEN[m]) { r -= MLEN[m]; m++; } return `${r + 1} ${MONTHS[m]}`; }
export function hourLabel(h) { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }

export function installUI(app, root) {
  const { rig, env, city, props } = app;
  app.ui = { full: false, flyout: null, tab: 'sky', buildType: 'slab' };

  // ------------------------------------------------------------------ top bar
  const nameIn = el('input', 'cityname', null, { value: app.name, spellcheck: 'false', maxlength: '40', 'aria-label': 'City name', onchange: (e) => { app.name = e.target.value.trim() || 'Untitled'; app.commit('name'); } });
  const metrics = el('div', 'metrics');
  const undoB = ibtn('undo', 'Undo  (Ctrl+Z)', () => app.undo()), redoB = ibtn('redo', 'Redo  (Ctrl+Y)', () => app.redo());
  const muteB = el('button', 'ib snd', 'SOUND', { type: 'button', title: 'Sound on or off', onclick: () => { if (app.sound) app.sound.setMuted(!app.sound.muted); } });
  app.on('sound', () => muteB.classList.toggle('off', !!(app.sound && app.sound.muted)));
  const top = el('header', 'top', [
    el('button', 'mark', 'BRUT', { type: 'button', title: 'City figures and files', onclick: () => { app.select(null); root.classList.toggle('cityopen'); } }), nameIn, metrics,
    el('div', 'topbtns', [undoB, redoB, muteB, ibtn('help', 'Keys and help  (?)', () => toggleHelp())]),
  ]);
  function metric(label, value, unit) { return el('div', 'metric', [el('b', null, value), unit ? el('i', null, unit) : null, el('span', null, label)]); }
  function drawMetrics() {
    const t = app.totals();
    metrics.replaceChildren(
      metric('people', fmtInt(t.pop)),
      metric('dwellings', fmtInt(t.dwellings)),
      metric('per hectare', t.density.toFixed(0), 'dw'),
      metric('plot ratio', t.far.toFixed(2)),
      metric('concrete', fmtInt(t.concrete / 1000), 'k m³'),
    );
    undoB.disabled = app.undoStack.length < 2; redoB.disabled = !app.redoStack.length;
    if (document.activeElement !== nameIn) nameIn.value = app.name;
  }

  // ------------------------------------------------------------------ tool rail and flyouts
  const rail = el('nav', 'rail');
  const flyout = el('aside', 'flyout'); flyout.hidden = true;
  const TOOLS = [
    ['select', 'select', 'Select and move  (V)'], ['build', 'build', 'Build  (B)'], ['ground', 'ground', 'Ground works'],
    ['plant', 'plant', 'Trees and lamps'], ['estate', 'estate', 'Lay out an estate'], ['raze', 'raze', 'Demolish  (X)'],
  ];
  const railBtns = {};
  for (const [id, ic, title] of TOOLS) {
    railBtns[id] = el('button', 'tool', [el('span', null, null, { html: icon(ic, 22) }), el('em', null, title.split('  ')[0].split(' ')[0])], { type: 'button', title, onclick: () => pickRail(id) });
    rail.append(railBtns[id]);
  }
  function pickRail(id) {
    if (id === 'select') { app.setTool({ mode: 'select' }); openFly(null); }
    else if (id === 'raze') { app.setTool({ mode: 'raze' }); openFly(null); }
    else if (id === 'build') { openFly(app.ui.flyout === 'build' ? null : 'build'); if (app.ui.flyout === 'build') armBuild(app.ui.buildType, app.lastBuild.type === app.ui.buildType ? app.lastBuild.preset : null); }
    else if (id === 'ground') { openFly(app.ui.flyout === 'ground' ? null : 'ground'); if (app.ui.flyout === 'ground') armGround('paving', 'rect'); }
    else if (id === 'plant') { openFly(app.ui.flyout === 'plant' ? null : 'plant'); if (app.ui.flyout === 'plant') app.setTool({ mode: 'tree', kind: 'round', brush: 1 }); }
    else if (id === 'estate') { openFly(app.ui.flyout === 'estate' ? null : 'estate'); if (app.ui.flyout === 'estate') app.setTool({ mode: 'estate', doctrine: 'radiant' }); }
  }
  function openFly(which) { app.ui.flyout = which; drawFly(); }
  function armBuild(type, preset) { app.ui.buildType = type; app.setTool({ mode: 'build', type, preset: preset || null }); drawFly(); }
  function armGround(kind, shape, w) { app.setTool({ mode: 'ground', kind, shape, w }); drawFly(); }
  const GROUND = [
    ['paving', 'rect', 'Plaza', 'Drag a rectangle of paving.'], ['paving', 'line', 'Path', 'Draw a footpath.', 4], ['asphalt', 'line', 'Road', 'Draw a road. Cars use it.', 9],
    ['water', 'rect', 'Pool', 'Drag a sheet of still water.'], ['water', 'disc', 'Round pool', 'Drag an ellipse of water.'], ['lawn', 'rect', 'Lawn', 'Mown grass.'],
    ['gravel', 'rect', 'Gravel', 'A gravel court.'], ['meadow', 'rect', 'Meadow', 'Give the ground back to rough grass.'],
  ];
  function drawFly() {
    const w = app.ui.flyout, t = app.tool;
    flyout.hidden = !w;
    for (const id in railBtns) railBtns[id].classList.toggle('on', (id === 'select' && t.mode === 'select') || (id === 'raze' && t.mode === 'raze') || id === w || (id === 'plant' && w === 'plant'));
    if (!w) { flyout.replaceChildren(); return; }
    if (w === 'build') {
      const grid = el('div', 'types');
      for (const id of TYPE_ORDER) {
        const T = TYPES[id];
        grid.append(el('button', 'type' + (id === app.ui.buildType ? ' on' : ''), [el('span', null, null, { html: icon(id, 30) }), el('em', null, T.label)], { type: 'button', onclick: () => armBuild(id, null) }));
      }
      const T = TYPES[app.ui.buildType];
      const pres = el('div', 'chips', [btn('chip' + (!t.preset ? ' on' : ''), 'Standard', () => armBuild(app.ui.buildType, null))]);
      for (const p of Object.keys(T.presets)) pres.append(btn('chip' + (t.preset === p ? ' on' : ''), p, () => armBuild(app.ui.buildType, p)));
      flyout.replaceChildren(
        el('h3', null, 'Build'), grid, el('p', 'blurb', T.blurb), el('h4', null, 'In the manner of'), pres,
        el('label', 'check', [el('input', null, null, { type: 'checkbox', ...(app.stack ? { checked: '' } : {}), onchange: (e) => { app.stack = e.target.checked; } }), 'Build on top of what is under the cursor']),
        el('p', 'hint', 'Click to place. Drag to set its direction and length. Hold Shift to keep building.'),
      );
    } else if (w === 'ground') {
      const list = el('div', 'list');
      for (const [kind, shape, label, hint, wd] of GROUND) list.append(el('button', 'row' + (t.mode === 'ground' && t.kind === kind && t.shape === shape ? ' on' : ''), [el('i', 'sw sw-' + kind), el('b', null, label), el('span', null, hint)], { type: 'button', onclick: () => armGround(kind, shape, wd) }));
      list.append(el('button', 'row' + (t.mode === 'erase' ? ' on' : ''), [el('i', 'sw sw-meadow'), el('b', null, 'Rub out'), el('span', null, 'Drag to clear ground works, trees and lamps.')], { type: 'button', onclick: () => { app.setTool({ mode: 'erase' }); drawFly(); } }));
      flyout.replaceChildren(el('h3', null, 'Ground'), list, el('p', 'hint', 'Shapes square up to the direction you are looking.'));
    } else if (w === 'plant') {
      const list = el('div', 'list');
      for (const k of Object.keys(TREE_KINDS)) list.append(el('button', 'row' + (t.mode === 'tree' && t.kind === k ? ' on' : ''), [el('i', 'sw sw-' + k), el('b', null, TREE_KINDS[k]), el('span', null, k === 'round' ? 'Broad shade tree for squares and avenues.' : k === 'poplar' ? 'A dark column. Plant it in rows.' : 'A flat crown on a bare trunk.')], { type: 'button', onclick: () => { app.setTool({ mode: 'tree', kind: k, brush: t.brush || 1 }); drawFly(); } }));
      list.append(el('button', 'row' + (t.mode === 'lamp' ? ' on' : ''), [el('i', 'sw sw-lamp'), el('b', null, 'Lamp'), el('span', null, 'Lit after dark. Drag for a row.')], { type: 'button', onclick: () => { app.setTool({ mode: 'lamp' }); drawFly(); } }));
      flyout.replaceChildren(el('h3', null, 'Plant'), list,
        el('label', 'check', [el('input', null, null, { type: 'checkbox', ...(t.brush > 1 ? { checked: '' } : {}), onchange: (e) => { app.setTool({ ...app.tool, brush: e.target.checked ? 3 : 1 }); } }), 'Plant in clumps']),
        el('p', 'hint', 'Click for one. Drag for a line.'));
    } else if (w === 'estate') {
      const list = el('div', 'list');
      for (const k of Object.keys(DOCTRINES)) list.append(el('button', 'row tall' + (t.doctrine === k ? ' on' : ''), [el('b', null, DOCTRINES[k].label), el('span', null, DOCTRINES[k].blurb)], { type: 'button', onclick: () => { app.setTool({ mode: 'estate', doctrine: k }); drawFly(); } }));
      flyout.replaceChildren(el('h3', null, 'Estate'), el('p', 'blurb', 'Pick a planning doctrine, then drag a rectangle on the site. It is laid out in one go and every building in it can still be changed.'), list);
    }
  }

  // ------------------------------------------------------------------ inspector
  const insp = el('aside', 'insp');
  let rows = {};       // key -> {input, out, fmt}
  const tipline = el('div', 'tipline');
  function paramRow(b, key) {
    const p = PARAMS[key], d = b.dna;
    const row = el('div', 'prow', null, { 'data-k': key });
    const hover = () => { const n = NOTES[key] && NOTES[key][b.dna[key]]; tipline.textContent = n || p.tip || ''; };
    row.addEventListener('pointerenter', hover);
    if (p.t === 'i' || p.t === 'f') {
      const step = p.t === 'i' ? 1 : (p.step || 0.1);
      const dp = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
      const fmt = (v) => (+v).toFixed(dp) + (p.unit ? ' ' + p.unit : '');
      const out = el('output', null, fmt(d[key]));
      const input = el('input', null, null, { type: 'range', min: p.min, max: p.max, step, value: d[key], 'aria-label': p.label,
        oninput: (e) => { app.setParam(b, key, +e.target.value, false); out.textContent = fmt(b.dna[key]); },
        onchange: (e) => { app.setParam(b, key, +e.target.value, true); } });
      const lab = el('label', null, p.label, { title: 'Double-click to reset', ondblclick: () => { app.setParam(b, key, TYPES[d.type].base[key], true); } });
      row.append(el('div', 'ph', [lab, out]), input);
      rows[key] = { input, out, fmt };
    } else if (p.t === 'e') {
      const opts = optionsFor(key, d.type);
      const sel = el('select', null, Object.keys(opts).map(k => el('option', null, opts[k], { value: k, ...(d[key] === k ? { selected: '' } : {}) })), { 'aria-label': p.label, onchange: (e) => { app.setParam(b, key, e.target.value, true); hover(); } });
      row.append(el('div', 'ph', [el('label', null, p.label)]), sel);
      rows[key] = { input: sel };
    } else if (p.t === 'c') {
      const sw = el('div', 'swatches');
      for (const k of Object.keys(ACCENTS)) {
        const a = ACCENTS[k];
        const s = el('button', 'swatch' + (d[key] === k ? ' on' : '') + (k === 'none' ? ' none' : '') + (k === 'poly' ? ' poly' : ''), null, { type: 'button', title: a.label, 'aria-label': a.label, onclick: () => { app.setParam(b, key, k, true); drawInsp(); } });
        if (a.hex) s.style.background = '#' + a.hex.toString(16).padStart(6, '0');
        sw.append(s);
      }
      row.append(el('div', 'ph', [el('label', null, p.label), el('output', null, ACCENTS[d[key]].label)]), sw);
    }
    return row;
  }
  function statsLine(b) {
    const s = b.stats, parts = [];
    if (s.height) parts.push(`${s.height.toFixed(0)} m`);
    if (s.floors) parts.push(`${s.floors} storeys`);
    if (s.dwellings) parts.push(`${fmtInt(s.dwellings)} dwellings`);
    if (s.jobs && !s.dwellings) parts.push(`${fmtInt(s.jobs)} at work`);
    parts.push(`${fmtInt(b.vol)} m³ of concrete`);
    return parts.join(' · ');
  }
  let statsEl = null;
  function drawInsp() {
    rows = {};
    const b = app.sel;
    if (!b) { drawCityPanel(); return; }
    const T = TYPES[b.dna.type];
    const typeSel = el('select', 'typesel', TYPE_ORDER.map(k => el('option', null, TYPES[k].label, { value: k, ...(k === b.dna.type ? { selected: '' } : {}) })), { 'aria-label': 'Type', onchange: (e) => app.changeType(b, e.target.value) });
    const nameI = el('input', 'bname', null, { value: b.name, spellcheck: 'false', maxlength: '32', 'aria-label': 'Building name', onchange: (e) => { b.name = e.target.value.trim() || T.label; app.commit('name'); } });
    statsEl = el('p', 'stats', statsLine(b));
    const acts = el('div', 'acts', [
      ibtn('dice', 'Vary it  (M)', () => app.mutate(b, 0.3)), ibtn('dup', 'Duplicate  (Ctrl+D)', () => app.duplicate(b)), ibtn('copy', 'Copy its design  (Ctrl+C)', () => { app.copyDNA(b); toast('Design copied. Select another building and paste.'); }),
      ibtn('paste', 'Paste a copied design  (Ctrl+V)', () => app.pasteDNA(b), app.clipboard ? '' : 'dim'), ibtn('focus', 'Look at it  (double-click)', () => app.focus(b)), ibtn('trash', 'Demolish  (Delete)', () => app.demolish(b)),
    ]);
    const chips = el('div', 'chips');
    for (const p of Object.keys(T.presets)) chips.append(btn('chip', p, () => app.applyPreset(b, p)));
    chips.append(btn('chip strong', 'Surprise me', () => app.reroll(b)));
    const body = el('div', 'params');
    for (const g of Object.keys(GROUPS)) {
      const keys = T.keys.filter(k => PARAMS[k].g === g && (app.ui.full || PARAMS[k].b));
      if (!keys.length) continue;
      body.append(el('h4', null, GROUPS[g]));
      for (const k of keys) body.append(paramRow(b, k));
    }
    tipline.textContent = T.blurb;
    insp.replaceChildren(
      el('div', 'ihead', [nameI, typeSel]), statsEl, acts, el('h4', null, 'In the manner of'), chips, body,
      btn('more', app.ui.full ? 'Fewer controls' : `All ${T.keys.length} controls`, () => { app.ui.full = !app.ui.full; drawInsp(); }),
      tipline,
    );
  }
  function syncInsp() {
    const b = app.sel; if (!b) return;
    for (const k in rows) { const r = rows[k]; if (document.activeElement === r.input) continue; if (r.input.value != b.dna[k]) r.input.value = b.dna[k]; if (r.out) r.out.textContent = r.fmt(b.dna[k]); }
    if (statsEl) statsEl.textContent = statsLine(b);
  }
  function drawCityPanel() {
    const t = app.totals();
    const fig = (label, v) => el('div', 'fig', [el('span', null, label), el('b', null, v)]);
    const siteSel = el('div', 'seg', Object.keys(SITES).map(k => btn(app.ground.site === k ? 'on' : '', SITES[k].name, () => { app.setSite(k); drawInsp(); })));
    const placeSel = el('select', null, PLACES.map(p => el('option', null, `${p.name}  ${Math.abs(p.lat).toFixed(0)}°${p.lat >= 0 ? 'N' : 'S'}`, { value: p.lat, ...(Math.abs(env.lat - p.lat) < 0.01 ? { selected: '' } : {}) })), { 'aria-label': 'Latitude', onchange: (e) => { app.setLat(+e.target.value); app.commit('place'); } });
    const sun = app.sunStudy && app.sunStudy.result, wind = app.windStudy && app.windStudy.result;
    insp.replaceChildren(
      el('div', 'ihead', [el('h2', null, app.name)]),
      el('p', 'stats', `${t.buildings} buildings · ${props.trees.length} trees · tallest ${t.tallest.toFixed(0)} m`),
      el('h4', null, 'Site'), siteSel,
      el('h4', null, 'Latitude of'), placeSel,
      el('h4', null, 'Figures'),
      el('div', 'figs', [
        fig('Population', fmtInt(t.pop)), fig('Dwellings', fmtInt(t.dwellings)), fig('Workplaces', fmtInt(t.jobs)),
        fig('Density', `${t.density.toFixed(0)} dwellings / ha`), fig('Plot ratio', t.far.toFixed(2)), fig('Ground covered', `${(t.coverage * 100).toFixed(0)} %`),
        fig('Floor area', `${fmtInt(t.gfa)} m²`), fig('Concrete', `${fmtInt(t.concrete)} m³`), fig('Embodied carbon', `≈ ${fmtInt(t.carbon)} t CO₂e`),
        sun ? fig('Open ground with 2 h of sun', `${(sun.share * 100).toFixed(0)} %`) : null,
        wind ? fig('Open ground in calm air', `${(wind.calm * 100).toFixed(0)} %`) : null,
      ]),
      el('h4', null, 'City'),
      el('div', 'stack', [
        btn('wide', 'Save to a file', () => app.exportFile()), btn('wide', 'Open a file', () => app.importFile()),
        btn('wide', 'Copy a link to this city', () => app.shareLink().then(ok => toast(ok ? 'Link copied.' : 'The city is too large for a link. Save it to a file instead.'))),
        btn('wide', 'Clear the site', () => confirmBar('Clear every building and the ground?', () => app.clearAll())),
        btn('wide', 'Bring back Eastfield', () => confirmBar('Replace this city with the one you arrived in?', () => app.loadDemo())),
      ]),
      tipline,
    );
    tipline.textContent = 'Nothing selected. Click a building to change it, or pick a tool on the left.';
  }

  // ------------------------------------------------------------------ console (bottom)
  const bar = el('footer', 'bar');
  const tabs = el('div', 'tabs'), pane = el('div', 'pane');
  const clock = el('button', 'clock', null, { type: 'button', title: 'Run or stop the clock  (Space)', onclick: () => app.togglePlay() });
  const TABS = [['sky', 'Sky'], ['lens', 'Lens'], ['view', 'View'], ['study', 'Study'], ['photo', 'Photo']];
  const tabBtns = {};
  for (const [id, label] of TABS) { tabBtns[id] = btn('', label, () => { app.ui.tab = id; if (id === 'photo') app.setPhoto(true); else if (app.photo.on) app.setPhoto(false); drawPane(); }); tabs.append(tabBtns[id]); }
  bar.append(clock, tabs, pane);
  let sky = {};
  function rangeRow(label, o) {
    const out = el('output', null, o.fmt(o.value));
    const input = el('input', null, null, { type: 'range', min: o.min, max: o.max, step: o.step, value: o.value, 'aria-label': label, oninput: (e) => { o.set(+e.target.value); out.textContent = o.fmt(+e.target.value); }, ...(o.done ? { onchange: o.done } : {}) });
    return { row: el('div', 'ctl' + (o.cls ? ' ' + o.cls : ''), [el('div', 'ph', [el('label', null, label), out]), input]), input, out };
  }
  const seg = (items, cur, pick, cls = '') => el('div', 'seg ' + cls, items.map(([k, label, title]) => btn(k === cur ? 'on' : '', label, () => pick(k), title ? { title } : undefined)));
  function drawPane() {
    for (const id in tabBtns) tabBtns[id].classList.toggle('on', id === app.ui.tab);
    const tab = app.ui.tab;
    sky = {};
    if (tab === 'sky') {
      const st = sunTimes(env.lat, env.day);
      const hr = rangeRow('Hour', { min: 0, max: 24, step: 0.05, value: env.hour, fmt: hourLabel, set: (v) => app.setHour(v), cls: 'grow' });
      hr.input.style.setProperty('--rise', (st.rise / 24 * 100).toFixed(1) + '%'); hr.input.style.setProperty('--set', (st.set / 24 * 100).toFixed(1) + '%'); hr.input.classList.add('sunbar');
      const dy = rangeRow('Day', { min: 0, max: 364, step: 1, value: env.day, fmt: dayLabel, set: (v) => { app.setDay(v); const s2 = sunTimes(env.lat, env.day); hr.input.style.setProperty('--rise', (s2.rise / 24 * 100).toFixed(1) + '%'); hr.input.style.setProperty('--set', (s2.set / 24 * 100).toFixed(1) + '%'); } });
      sky = { hr, dy };
      pane.replaceChildren(hr.row, dy.row,
        el('div', 'ctl', [el('div', 'ph', [el('label', null, 'Days')]), seg([['79', 'Equinox'], ['171', 'Midsummer'], ['354', 'Midwinter']], String(env.day), (k) => { app.setDay(+k); drawPane(); })]),
        el('div', 'ctl', [el('div', 'ph', [el('label', null, 'Weather')]), seg(Object.keys(WEATHER).map(k => [k, WEATHER[k].label]), env.weather, (k) => { app.setWeather(k); drawPane(); })]));
    } else if (tab === 'lens') {
      const NOTE = { beton: 'Colour, as built.', silver: 'Black and white film through a red filter: dark skies, hard concrete.', maquette: 'A white card model under studio light.', ink: 'Line and hatch on paper.', blueprint: 'White line on blue.', poche: 'Figure and ground: what is built against what is left open.', frame: 'Structure only: slabs, walls, columns, cores.' };
      pane.replaceChildren(
        el('div', 'ctl grow', [el('div', 'ph', [el('label', null, 'Lens'), el('output', null, NOTE[app.pipe.lens])]), seg(Object.keys(LENSES).map(k => [k, LENSES[k].name]), app.pipe.lens, (k) => { app.setLens(k); drawPane(); })]),
        rangeRow('Exposure', { min: -1.5, max: 1.5, step: 0.05, value: Math.log2(app.pipe.exposureBias), fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(1) + ' stops', set: (v) => { app.pipe.exposureBias = Math.pow(2, v); app.touch(); } }).row,
        el('div', 'ctl', [el('div', 'ph', [el('label', null, 'Rendering')]), seg(Object.keys(TIERS).map(k => [k, TIERS[k].label]), app.pipe.tier, (k) => { app.pipe.setTier(k); app.touch(); drawPane(); })]));
    } else if (tab === 'view') {
      const NOTE = { orbit: 'Perspective. Right-drag turns, wheel zooms, drag the ground to move.', iso: 'Isometric: no vanishing points, all three axes at one scale.', plan: 'Straight down, north up.', oblique: 'Plan oblique: the plan stays true and heights are drawn straight up the sheet.', elevation: 'A flat face, no perspective.', walk: 'On foot. W A S D to move, F to fly, Esc to leave.' };
      const v = app.view || 'orbit';
      pane.replaceChildren(
        el('div', 'ctl grow', [el('div', 'ph', [el('label', null, 'Projection'), el('output', null, NOTE[v])]), seg([['orbit', 'Perspective'], ['iso', 'Isometric'], ['oblique', 'Plan oblique'], ['plan', 'Plan'], ['elevation', 'Elevation'], ['walk', 'Walk']], v, (k) => { if (k === 'walk') { app.setTool({ mode: 'walk' }); toast('Click the ground where you want to stand.'); } else app.setView(k); drawPane(); })]),
        rangeRow('Lens', { min: 12, max: 90, step: 1, value: rig.g.fov, fmt: (f) => `${Math.round(12 / Math.tan(f * Math.PI / 360))} mm`, set: (f) => { const k = Math.tan(rig.g.fov * Math.PI / 360) / Math.tan(f * Math.PI / 360); rig.set({ fov: f, dist: clamp(rig.g.dist * k, 10, 3200) }); } }).row,
        el('div', 'ctl', [el('div', 'ph', [el('label', null, 'Look')]), seg([['0', 'North'], ['1', 'East'], ['2', 'South'], ['3', 'West']], '', (k) => { const base = -(+k) * Math.PI / 2; rig.set({ yaw: base + Math.round((rig.g.yaw - base) / (2 * Math.PI)) * 2 * Math.PI }); })]));
    } else if (tab === 'study') {
      const s = app.study;
      const tog = (key, label, title) => btn(s[key] ? 'on' : '', label, () => { app.setStudy(key, !s[key]); drawPane(); }, { title });
      const extra = [];
      if (s.wind) extra.push(rangeRow('Wind from', { min: 0, max: 359, step: 1, value: Math.round((env.windAngle * 180 / Math.PI + 270) % 360), fmt: (v) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(v / 45) % 8] + ' ' + Math.round(v) + '°', set: (v) => { env.windAngle = (v - 270) * Math.PI / 180; app.emit('wind'); app.touch(); } }).row);
      if (s.section) extra.push(rangeRow('Cut', { min: -1, max: 1, step: 0.005, value: app.section.pos, fmt: (v) => `${(v * 300).toFixed(0)} m`, set: (v) => { app.section.pos = v; app.updateSection(); } }).row,
        el('div', 'ctl', [el('div', 'ph', [el('label', null, 'Cut along')]), seg([['x', 'East–west'], ['z', 'North–south'], ['y', 'Level']], app.section.axis, (k) => { app.section.axis = k; app.updateSection(); drawPane(); })]));
      pane.replaceChildren(
        el('div', 'ctl', [el('div', 'ph', [el('label', null, 'Studies'), el('output', null, studyNote())]), el('div', 'seg', [
          tog('sun', 'Sun hours', 'Hours of direct sun reaching the ground on this date'),
          tog('wind', 'Wind', 'Air moving through the city at head height'),
          tog('life', 'People', 'Residents, their routes, and their lights'),
          tog('section', 'Section', 'Cut the city open'),
        ])]),
        rangeRow('Years on', { min: 0, max: 100, step: 1, value: app.years, fmt: (v) => v === 0 ? 'opening day' : `${v} years`, set: (v) => app.setYears(v), done: () => app.commit('years'), cls: 'grow' }).row,
        ...extra);
    } else if (tab === 'photo') {
      const ph = app.photo;
      pane.replaceChildren(
        rangeRow('Focal length', { min: 12, max: 90, step: 1, value: rig.mode === 'walk' ? rig.walk.fov : rig.g.fov, fmt: (f) => `${Math.round(12 / Math.tan(f * Math.PI / 360))} mm`, set: (f) => { if (rig.mode === 'walk') { rig.walk.fov = f; rig.stamp++; } else { const k = Math.tan(rig.g.fov * Math.PI / 360) / Math.tan(f * Math.PI / 360); rig.set({ fov: f, dist: clamp(rig.g.dist * k, 10, 3200) }); } } }).row,
        rangeRow('Rise', { min: -0.6, max: 0.6, step: 0.01, value: rig.mode === 'walk' ? rig.walk.rise : rig.g.rise, fmt: (v) => v === 0 ? 'none' : (v > 0 ? 'up ' : 'down ') + Math.abs(v * 100).toFixed(0), set: (v) => { if (rig.mode === 'walk') { rig.walk.rise = v; rig.stamp++; } else rig.set({ rise: v }); } }).row,
        el('div', 'ctl', [el('div', 'ph', [el('label', null, 'Format')]), seg([['0', 'Full'], ['0.8', '4 × 5'], ['1', 'Square'], ['1.5', '3 × 2'], ['2.39', 'Scope']], String(ph.crop), (k) => { ph.crop = +k; app.pipe.crop = +k; app.touch(); drawPane(); })]),
        el('div', 'ctl', [el('div', 'ph', [el('label', null, 'Depth of field')]), seg([['0', 'Deep'], ['1', 'Shallow']], ph.dof ? '1' : '0', (k) => { ph.dof = k === '1'; app.touch(); drawPane(); })]),
        el('div', 'ctl', [el('div', 'ph', [el('label', null, 'Print')]), el('div', 'seg', [btn('strong', 'Develop', () => app.develop()), btn('', 'With caption', () => app.develop({ plate: true }))])]),
      );
    }
  }
  function studyNote() {
    const s = app.study, out = [];
    if (s.sun) out.push(app.sunStudy && app.sunStudy.result ? `${(app.sunStudy.result.share * 100).toFixed(0)}% of open ground gets 2 h of sun on ${dayLabel(env.day)}` : 'measuring sun…');
    if (s.wind) out.push(app.windStudy && app.windStudy.result ? `${(app.windStudy.result.calm * 100).toFixed(0)}% of open ground is calm` : 'wind settling…');
    return out.join(' · ');
  }
  function drawClock() {
    clock.innerHTML = icon(app.playing ? 'pause' : 'play', 14) + `<b>${hourLabel(env.hour)}</b><span>${dayLabel(env.day)}</span>`;
    if (app.ui.tab === 'sky' && sky.hr && document.activeElement !== sky.hr.input) { sky.hr.input.value = env.hour; sky.hr.out.textContent = hourLabel(env.hour); }
  }

  // ------------------------------------------------------------------ toasts, confirm, help, title
  const toasts = el('div', 'toasts');
  function toast(msg, ms = 3200) { const t = el('div', 'toast', msg); toasts.append(t); setTimeout(() => t.classList.add('out'), ms); setTimeout(() => t.remove(), ms + 400); }
  app.toast = toast;
  function confirmBar(msg, yes) {
    const t = el('div', 'toast ask', [el('span', null, msg), btn('strong', 'Yes', () => { t.remove(); yes(); }), btn('', 'No', () => t.remove())]);
    toasts.append(t);
  }
  const help = el('div', 'help'); help.hidden = true;
  const KEYS = [
    ['Look', [['Right-drag', 'turn the view'], ['Drag the ground', 'move across the site'], ['Wheel', 'zoom to the cursor'], ['W A S D', 'move'], ['Q E / R F', 'turn and tilt'], ['Double-click', 'centre on a building']]],
    ['Build', [['B', 'build the last type again'], ['Drag while placing', 'set direction and length'], ['Shift while placing', 'keep the tool'], ['Drag a building', 'move it'], ['Grips', 'storeys, bays, depth, undercroft, turn'], ['[ ]', 'turn by 15°']]],
    ['Change', [['M', 'vary the selected design'], ['Ctrl+C / Ctrl+V', 'copy a design onto another building'], ['Ctrl+D', 'duplicate'], ['Delete', 'demolish'], ['Ctrl+Z / Ctrl+Y', 'undo and redo']]],
    ['See', [['1 – 7', 'lenses'], ['Space', 'run or stop the clock'], ['P', 'photograph'], ['H', 'hide the interface'], ['Esc', 'put the tool down']]],
  ];
  function toggleHelp(force) {
    help.hidden = force !== undefined ? !force : !help.hidden;
    if (help.hidden) return;
    help.replaceChildren(el('div', 'sheet', [
      el('div', 'shead', [el('h2', null, 'BRUT'), ibtn('close', 'Close', () => toggleHelp(false))]),
      el('p', 'lead', 'A city builder in raw concrete. Place buildings, pull them into shape, and look at the result under different light, weather and lenses. Nothing costs anything.'),
      el('div', 'cols', KEYS.map(([h, list]) => el('div', null, [el('h4', null, h), ...list.map(([k, v]) => el('p', 'key', [el('kbd', null, k), v]))]))),
      el('p', 'fine', 'Every figure in the top bar is counted from what is built. Concrete is the volume of structure; carbon assumes about 320 kg CO₂e per cubic metre. Sun hours follow the latitude and date you choose.'),
    ]));
  }
  app.toggleHelp = toggleHelp;
  help.addEventListener('pointerdown', (e) => { if (e.target === help) toggleHelp(false); });

  const title = el('div', 'title'); title.hidden = true;
  function showTitle() {
    title.replaceChildren(el('div', 'tinner', [
      el('h1', null, 'BRUT'),
      el('p', null, 'A city in raw concrete'),
      btn('enter', 'Enter', () => { title.classList.add('gone'); app.titleUp = false; setTimeout(() => { title.hidden = true; }, 700); app.emit('enter'); setTimeout(() => toast('Click a building to reshape it. Build, on the left, adds new ones. The tabs below change the light, the lens and the way you look.', 9000), 900); }),
    ]));
    title.hidden = false; app.titleUp = true;
  }
  app.showTitle = showTitle;

  const walkHint = el('div', 'walkhint'); walkHint.hidden = true;

  // ------------------------------------------------------------------ assemble
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); overlay.setAttribute('class', 'ovl');
  const grips = el('div', 'grips');
  root.append(overlay, grips, top, rail, flyout, insp, bar, walkHint, toasts, help, title);

  // ------------------------------------------------------------------ wiring
  let metricsDue = true;
  app.on('select', (b) => { if (b) root.dataset.sel = '1'; else delete root.dataset.sel; drawInsp(); });
  app.on('param', () => { syncInsp(); metricsDue = true; });
  app.on('city', () => { metricsDue = true; if (!app.sel) drawInsp(); else syncInsp(); });
  app.on('history', () => { metricsDue = true; });
  app.on('tool', () => { if (app.tool.mode === 'select' || app.tool.mode === 'raze' || app.tool.mode === 'walk') app.ui.flyout = null; drawFly(); root.dataset.tool = app.tool.mode; });
  app.on('lens', () => { root.dataset.lens = app.pipe.lens; if (app.ui.tab === 'lens') drawPane(); });
  app.on('view', () => { if (app.ui.tab === 'view') drawPane(); root.dataset.view = rig.mode;
    walkHint.hidden = rig.mode !== 'walk';
    walkHint.textContent = rig.walk.fly ? 'Flying · W A S D · Space up, C down · F to land · Esc to leave' : 'On foot · W A S D · Shift to run · F to fly · Esc to leave'; });
  app.on('weather', () => { if (app.ui.tab === 'sky') drawPane(); });
  app.on('study', () => { if (app.ui.tab === 'study') drawPane(); if (!app.sel) drawInsp(); });
  app.on('studyResult', () => { if (app.ui.tab === 'study') drawPane(); if (!app.sel) drawInsp(); });
  app.on('years', () => {});
  app.on('clipboard', () => { if (app.sel) drawInsp(); });
  app.on('photo', () => { root.classList.toggle('photo', app.photo.on); drawPane(); });
  app.on('key', (k) => {
    if (k === '?' || k === '/') toggleHelp();
    else if (k === 'h') { app.hideUI = !app.hideUI; root.classList.toggle('bare', app.hideUI); app.touch(); }
    else if (k === ' ') app.togglePlay();
    else if (k === 'p') { app.ui.tab = 'photo'; app.setPhoto(!app.photo.on); if (!app.photo.on) app.ui.tab = 'sky'; drawPane(); }
    else if (k >= '1' && k <= '7') { app.setLens(Object.keys(LENSES)[+k - 1]); }
  });
  let tick = 0;
  app.hooks.push(() => {
    if ((tick++ % 6) === 0) { drawClock(); if (metricsDue) { drawMetrics(); metricsDue = false; } }
    return false;
  });
  drawFly(); drawInsp(); drawPane(); drawMetrics(); drawClock();
  root.dataset.tool = 'select'; root.dataset.view = 'orbit'; root.dataset.lens = app.pipe.lens;
  if (app.sound) muteB.classList.toggle('off', !!app.sound.muted);
  return { overlay, grips, toast, drawInsp, drawPane, drawMetrics };
}
