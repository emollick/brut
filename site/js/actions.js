// What the player can do, in one place. The UI and the input layer both call these.
import { LENSES } from './gfx/pipeline.js';
import { WEATHER, PLACES } from './gfx/env.js';
import { TYPES, PARAMS, makeDNA, mutate, sanitize, randomize } from './arch/dna.js';
import { SITES, BUILD_R } from './world/ground.js';
import { rng, clamp } from './util.js';

const SAVE_KEY = 'brut-city-v1';

export function installActions(app) {
  const { city, ground, props, pipe, env, rig } = app;
  const listeners = {};
  app.on = (ev, fn) => { (listeners[ev] || (listeners[ev] = [])).push(fn); };
  app.emit = (ev, a) => { for (const fn of listeners[ev] || []) fn(a); };

  Object.assign(app, {
    sel: null, hoverB: null,
    tool: { mode: 'select' },         // select | build | ground | tree | estate | raze
    lastBuild: { type: 'slab', preset: null, rot: 0 },
    name: 'Eastfield', years: 0, stack: false,
    undoStack: [], redoStack: [], clipboard: null,
    study: { sun: false, wind: false, life: true, section: false },
    playing: false, daySpeed: 0.6,     // hours of sun per real second when playing
    noSave: false,
  });

  // ---------------------------------------------------------------- selection
  app.select = (b) => {
    if (app.sel === b) return;
    if (app.sel) app.sel.set.obj.z = 0;
    app.sel = b || null;
    pipe.sel = b ? [b.set] : [];
    app.touch(); app.emit('select', b);
  };
  app.hover = (b) => {
    if (app.hoverB === b) return;
    app.hoverB = b || null;
    pipe.hover = b && b !== app.sel ? [b.set] : [];
    app.touch();
  };
  app.setTool = (t) => {
    app.tool = t;
    if (t.mode === 'build') { app.lastBuild.type = t.type; app.lastBuild.preset = t.preset || null; }
    app.grid = (t.mode === 'select') ? 0 : 1;
    if (t.mode !== 'select') app.hover(null);
    app.touch(); app.emit('tool', t);
  };

  // ---------------------------------------------------------------- history
  app.snapshot = () => ({
    v: 1, name: app.name, site: ground.site, years: app.years,
    city: city.serialize(), shapes: ground.shapes.map(s => ({ ...s })), props: props.serialize(),
    env: { lat: env.lat, day: env.day, hour: +env.hour.toFixed(2), weather: env.weather },
  });
  app.restore = (s, { keepView = true, keepEnv = false } = {}) => {
    const selId = app.sel ? app.sel.id : null;
    app.select(null);
    app.name = s.name || 'Untitled';
    if (s.site && s.site !== ground.site) ground.setSite(s.site);
    app.years = s.years || 0;
    ground.shapes = (s.shapes || []).map(o => ({ ...o }));
    city.load(s.city);
    props.load(s.props);
    if (s.env && !keepEnv) { env.lat = s.env.lat; env.day = s.env.day; env.hour = s.env.hour; env.setWeather(s.env.weather, true); }
    if (selId) { const b = city.list.find(o => o.id === selId); if (b) app.select(b); }
    app.applyYears();
    app.touch(); app.emit('city');
  };
  let saveTimer = 0;
  app.commit = (label) => {
    app.undoStack.push(JSON.stringify(app.snapshot()));
    if (app.undoStack.length > 60) app.undoStack.shift();
    app.redoStack.length = 0;
    clearTimeout(saveTimer); saveTimer = setTimeout(app.save, 600);
    app.emit('city'); app.emit('history');
  };
  app.undo = () => {
    if (app.undoStack.length < 2) return;
    app.redoStack.push(app.undoStack.pop());
    app.restore(JSON.parse(app.undoStack[app.undoStack.length - 1]), { keepEnv: true });
    app.emit('history'); app.save();
  };
  app.redo = () => {
    if (!app.redoStack.length) return;
    const s = app.redoStack.pop();
    app.undoStack.push(s);
    app.restore(JSON.parse(s), { keepEnv: true });
    app.emit('history'); app.save();
  };
  app.save = () => {
    if (app.noSave) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...app.snapshot(), rig: rig.state() })); } catch (e) { /* storage full or blocked */ }
  };
  app.loadSaved = () => {
    try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  };
  app.wipe = () => { app.noSave = true; try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } };

  // ---------------------------------------------------------------- buildings
  app.place = (dna, x, z, rot, o = {}) => {
    const r = Math.hypot(x, z);
    if (r > BUILD_R) { x *= BUILD_R / r; z *= BUILD_R / r; }
    const b = city.add(dna, x, z, rot, { rise: true, year: app.years, ...o });
    app.lastBuild.rot = rot;
    app.select(b); app.commit('build');
    app.emit('built', b);
    return b;
  };
  // live edit while a slider moves; commit when it is let go
  app.setParam = (b, key, value, final = true) => {
    if (!b) return;
    const p = PARAMS[key];
    if (p && (p.t === 'i' || p.t === 'f')) value = clamp(+value, p.min, p.max);
    if (b.dna[key] === value && !final) return;
    b.dna[key] = value;
    b.dna = sanitize(b.dna);
    city.update(b);
    app.applyYears(b);
    if (final) app.commit('edit');
    app.emit('param', { b, key });
  };
  app.setDNA = (b, dna, label = 'edit') => {
    b.dna = sanitize({ ...dna, type: b.dna.type });
    city.update(b); app.applyYears(b); app.commit(label); app.emit('select', b);
  };
  app.applyPreset = (b, preset) => app.setDNA(b, { ...makeDNA(b.dna.type, preset), seed: b.dna.seed }, 'preset');
  app.mutate = (b, amount = 0.3) => app.setDNA(b, mutate(b.dna, amount, rng((Math.random() * 1e9) | 0)), 'mutate');
  app.reroll = (b) => app.setDNA(b, randomize(b.dna.type, rng((Math.random() * 1e9) | 0)), 'reroll');
  app.changeType = (b, type) => {
    const d = makeDNA(type);
    for (const k of ['finish', 'tone', 'value', 'accent', 'accentAt', 'age', 'planting', 'seed']) if (b.dna[k] !== undefined && TYPES[type].keys.includes(k)) d[k] = b.dna[k];
    b.dna = sanitize(d); city.update(b); app.applyYears(b); app.commit('type'); app.emit('select', b);
  };
  app.moveTo = (b, x, z, final = false) => { city.move(b, x, z); if (final) app.commit('move'); app.emit('moved', b); };
  app.rotateTo = (b, rot, final = false) => { b.rot = rot; city.update(b, { shape: false }); if (final) app.commit('rotate'); app.emit('moved', b); };
  app.duplicate = (b) => {
    const off = (b.stats.foot ? b.stats.foot.d : 20) + 14;
    const p = b.toWorld(0, off, [0, 0]);
    return app.place({ ...b.dna, seed: (b.dna.seed % 998) + 1 }, p[0], p[1], b.rot);
  };
  app.demolish = (b) => {
    if (!b) return;
    if (app.sel === b) app.select(null);
    if (app.hoverB === b) app.hover(null);
    city.remove(b); app.commit('demolish'); app.emit('demolished');
  };
  app.copyDNA = (b) => { app.clipboard = { ...b.dna }; app.emit('clipboard'); };
  // paste carries the look (surface, façade, crown) onto another building, even of a different type
  app.pasteDNA = (b) => {
    if (!app.clipboard) return;
    const src = app.clipboard, d = { ...b.dna };
    const same = src.type === b.dna.type;
    for (const k of TYPES[b.dna.type].keys) {
      if (src[k] === undefined) continue;
      const g = PARAMS[k].g;
      if (same || g === 'surface' || g === 'facade' || g === 'life' || g === 'crown') d[k] = src[k];
    }
    app.setDNA(b, d, 'paste');
  };

  // ---------------------------------------------------------------- ground
  app.addShape = (s) => { ground.shapes.push(s); ground.redraw(); app.commit('ground'); app.emit('shape', s.k); };
  app.clearAll = () => { city.clear(); ground.shapes = []; props.clear(); ground.aprons = []; ground.redraw(); app.select(null); app.commit('clear'); };
  app.setSite = (name) => { if (SITES[name]) { ground.setSite(name); app.commit('site'); app.touch(); } };

  // ---------------------------------------------------------------- looking
  app.setLens = (n) => {
    if (!LENSES[n]) return;
    pipe.setLens(n); env.studio = LENSES[n].studio ? 1 : 0;
    app.touch(); app.emit('lens', n);
  };
  app.setView = (mode, o) => {
    if (mode === 'plan') { rig.setMode('axo'); rig.set({ pitch: Math.PI / 2, ...o }); }
    else if (mode === 'iso') { rig.setMode('axo'); rig.set({ pitch: 0.6155, yaw: Math.round((rig.g.yaw - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4, ...o }); }
    else if (mode === 'elevation') { rig.setMode('axo'); rig.set({ pitch: 0, ty: rig.g.dist * Math.tan(rig.g.fov * Math.PI / 360) * 0.6, yaw: Math.round(rig.g.yaw / (Math.PI / 2)) * (Math.PI / 2), ...o }); }
    else if (mode === 'oblique') { rig.setMode('oblique'); rig.set({ ...o }); }
    else if (mode === 'walk') { app.enterWalk(o); }
    else { rig.setMode('orbit'); if (rig.g.pitch > 1.2) rig.set({ pitch: 0.5 }); if (rig.g.pitch < 0.04) rig.set({ pitch: 0.2 }); rig.set({ ...o }); }
    app.view = mode; app.touch(); app.emit('view', mode);
  };
  app.enterWalk = (o = {}) => {
    const w = rig.walk;
    if (o.x !== undefined) { w.x = o.x; w.z = o.z; }
    else { const t = rig.g; w.x = t.tx + Math.sin(t.yaw) * 30; w.z = t.tz + Math.cos(t.yaw) * 30; }
    w.y = 1.65; w.yaw = o.yaw !== undefined ? o.yaw : rig.g.yaw; w.pitch = 0.04; w.fly = false;
    rig.setMode('walk');
  };
  app.focus = (b) => {
    const s = b.stats, h = (s.height || 30);
    const f = s.foot || { w: 30, d: 30 };
    rig.set({ tx: b.x, tz: b.z, ty: b.y + h * 0.4, dist: clamp(Math.max(h, f.w, f.d) * 2.6, 60, 900) });
  };

  // ---------------------------------------------------------------- sky and time
  app.setHour = (h) => { env.hour = ((h % 24) + 24) % 24; app.touch(); app.emit('time'); };
  app.setDay = (d) => { env.day = ((Math.round(d) % 365) + 365) % 365; app.touch(); app.emit('time'); };
  app.setLat = (lat) => { env.lat = lat; app.touch(); app.emit('time'); };
  app.setWeather = (w) => { if (WEATHER[w]) { env.setWeather(w); app.touch(); app.emit('weather', w); } };
  // patina: the city's age in years ages every building and grows every tree
  app.applyYears = (only) => {
    const list = only ? [only] : city.list;
    for (const b of list) {
      const yrs = Math.max(0, app.years - (b.year || 0));
      b.set.obj2.x = clamp((b.dna.age || 0) + yrs * 0.014, 0, 1.6);
    }
    if (!only) { const g = clamp(0.45 + app.years * 0.016, 0.45, 1.35); if (Math.abs(props.growth - g) > 0.004) { props.growth = g; props.dirty = true; } }
    app.touch();
  };
  app.setYears = (y) => { app.years = clamp(y, 0, 120); app.applyYears(); app.emit('years'); };

  app.totals = () => {
    const t = city.totals();
    const siteHa = Math.PI * BUILD_R * BUILD_R / 10000;
    // net residential area: the footprint of the built-up part, not the whole plateau
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const b of city.list) { minX = Math.min(minX, b.x - 40); maxX = Math.max(maxX, b.x + 40); minZ = Math.min(minZ, b.z - 40); maxZ = Math.max(maxZ, b.z + 40); }
    const ha = city.list.length ? Math.max(1, (maxX - minX) * (maxZ - minZ) / 10000) : siteHa;
    t.areaHa = ha; t.density = t.dwellings / ha; t.far = t.gfa / (ha * 10000); t.coverage = t.footprint / (ha * 10000);
    t.carbon = t.concrete * 0.32;        // tonnes CO2e, at roughly 320 kg per cubic metre of reinforced concrete
    return t;
  };
  app.PLACES = PLACES; app.WEATHER = WEATHER; app.LENSES = LENSES; app.SITES = SITES;
}
