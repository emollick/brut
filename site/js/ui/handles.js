// Grips on the selected building: pull the roof for storeys, an end for bays, a corner to turn it.
import * as THREE from 'three';
import { TYPES, PARAMS } from '../arch/dna.js';
import { clamp } from '../util.js';

const m = (v, dp = 0) => (+v).toFixed(dp);
const SPECS = {
  bar: (d, e) => [
    { p: 'floors', ax: 'y', at: [0, e.H + 2.5, (e.zF + e.zB) / 2], per: d.floorH, txt: () => `${d.floors} storeys · ${m(d.floors * d.floorH + d.lift)} m` },
    { p: 'bays', ax: 'x', at: [e.xE + 2.5, (e.lift + e.H) / 2, 0], per: d.bayW / 2, txt: () => `${d.bays} bays · ${m(d.bays * d.bayW)} m` },
    { p: 'depth', ax: 'z', at: [0, (e.lift + e.H) / 2, e.zF + 2.5], per: 0.5, txt: () => `${m(d.depth, 1)} m deep` },
    { p: 'lift', ax: 'y', at: [-e.xE - 1.5, e.lift, e.zF + 1.5], per: 1, txt: () => d.lift > 0 ? `lifted ${m(d.lift, 1)} m` : 'on the ground', cls: 'lo' },
  ],
  cluster: (d, e) => [
    { p: 'levels', ax: 'y', at: [0, e.H + 2.5, 0], per: d.mH, txt: () => `${d.levels} levels` },
    { p: 'nx', ax: 'x', at: [d.nx * d.mW / 2 + 2.5, e.H * 0.4, 0], per: d.mW / 2, txt: () => `${d.nx} rows` },
    { p: 'nz', ax: 'z', at: [0, e.H * 0.4, d.nz * d.mL / 2 + 2.5], per: d.mL / 2, txt: () => `${d.nz} ranks` },
  ],
  capsule: (d, e) => [{ p: 'floors', ax: 'y', at: [0, e.H + 2, 0], per: d.floorH, txt: () => `${d.floors} floors of capsules` }],
  drum: (d, e) => [
    { p: 'floors', ax: 'y', at: [0, e.H + 3, 0], per: d.floorH, txt: () => `${d.floors} storeys · ${m(e.H)} m` },
    { p: 'radius', ax: 'x', at: [d.radius + 3, e.H * 0.5 + e.lift * 0.5, 0], per: 1, txt: () => `radius ${m(d.radius, 1)} m` },
    { p: 'lift', ax: 'y', at: [-d.radius - 1.5, d.lift, 0], per: 1, txt: () => d.lift > 0 ? `lifted ${m(d.lift, 1)} m` : 'on the ground', cls: 'lo' },
  ],
  mega: (d, e) => [
    { p: 'bars', ax: 'y', at: [0, e.H + 3, 0], per: d.barF * d.floorH + d.gap, txt: () => `${d.bars} bars` },
    { p: 'barL', ax: 'x', at: [d.barL / 2 + 3, e.H * 0.5, -d.span / 2], per: 0.5, txt: () => `bars ${m(d.barL)} m long` },
    { p: 'lift', ax: 'y', at: [-d.span / 2 - 6, d.lift, -d.span / 2 - 6], per: 1, txt: () => `first bar at ${m(d.lift, 1)} m`, cls: 'lo' },
  ],
  hall: (d, e) => [
    { p: 'height', ax: 'y', at: [0, d.plinth + d.height + 3, 0], per: 1, txt: () => `${m(d.height, 1)} m high` },
    { p: 'width', ax: 'x', at: [d.width / 2 + 3, d.plinth + d.height * 0.5, 0], per: 0.5, txt: () => `${m(d.width)} m wide` },
    { p: 'length', ax: 'z', at: [0, d.plinth + d.height * 0.5, d.length / 2 + 3], per: 0.5, txt: () => `${m(d.length)} m long` },
  ],
  monument: (d, e) => [{ p: 'height', ax: 'y', at: [0, d.mound + d.height + 2, 0], per: 1, txt: () => `${m(d.height)} m` }],
  works: (d, e) => [
    { p: 'height', ax: 'y', at: [0, d.height + 3, 0], per: 1, txt: () => `${m(d.height)} m` },
    { p: 'radius', ax: 'x', at: [d.radius + 3, d.height * 0.5, 0], per: 1, txt: () => `radius ${m(d.radius, 1)} m` },
  ],
  deck: (d, e) => [
    { p: 'deckH', ax: 'y', at: [0, e.H + 2.5, 0], per: Math.max(1, d.floors), txt: () => `deck at ${m(d.deckH, 1)} m` },
    { p: 'width', ax: 'x', at: [d.width / 2 + 2.5, e.H, 0], per: 0.5, txt: () => `${m(d.width)} m wide` },
    { p: 'length', ax: 'z', at: [0, e.H, d.length / 2 + 2.5], per: 0.5, txt: () => `${m(d.length)} m long` },
  ],
};
const GLYPH = { y: '↕', x: '↔', z: '⤢', r: '⟳' };

export function installHandles(app, layer, canvas) {
  const { rig, city } = app;
  const o = new THREE.Vector3(), dir = new THREE.Vector3(), p = new THREE.Vector3(), w0 = new THREE.Vector3(), ax = new THREE.Vector3();
  const tip = document.createElement('div'); tip.className = 'grip-tip'; tip.hidden = true; layer.appendChild(tip);
  let els = [], specs = [], forB = null, drag = null;

  const ndcOf = (e) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)]; };
  const worldOf = (b, at, out) => { const q = b.toWorld(at[0], at[2], [0, 0]); return out.set(q[0], b.y + at[1], q[1]); };
  const axisOf = (b, a, out) => {
    if (a === 'y') return out.set(0, 1, 0);
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    return a === 'x' ? out.set(c, 0, -s) : out.set(s, 0, c);
  };
  // parameter of the point on line (P0, A) nearest the pointer ray
  function along(e, P0, A) {
    const n = ndcOf(e); rig.ray(n[0], n[1], o, dir);
    w0.copy(P0).sub(o);
    const b = A.dot(dir), dd = A.dot(w0), ee = dir.dot(w0), den = 1 - b * b;
    if (den < 1e-4) return null;
    return (b * ee - dd) / den;
  }

  function build() {
    for (const e of els) e.remove();
    els = []; specs = [];
    const b = app.sel; forB = b;
    if (!b || rig.mode === 'walk') return;
    const gen = TYPES[b.dna.type].gen;
    specs = (SPECS[gen] ? SPECS[gen](b.dna, b.stats.ext || {}) : []).slice();
    const f = b.stats.foot || { w: 20, d: 20, cx: 0, cz: 0 };
    specs.push({ rot: true, ax: 'r', at: [(f.cx || 0) + f.w / 2 + 5, 0.2, (f.cz || 0) + f.d / 2 + 5], txt: () => `${m(((b.rot * 180 / Math.PI) % 360 + 360) % 360)}°` });
    specs.forEach((s, i) => {
      const el = document.createElement('button');
      el.className = 'grip ' + (s.cls || '') + (s.rot ? ' rot' : '');
      el.textContent = GLYPH[s.ax]; el.tabIndex = -1;
      el.title = s.rot ? 'Turn' : (PARAMS[s.p] ? PARAMS[s.p].label : s.p);
      el.addEventListener('pointerdown', (e) => start(e, i));
      layer.appendChild(el); els.push(el);
    });
  }
  function start(e, i) {
    e.preventDefault(); e.stopPropagation();
    const b = app.sel, s = specs[i]; if (!b) return;
    try { els[i].setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    if (s.rot) drag = { i, rot: true, a0: Math.atan2(-s.at[2], s.at[0]) };
    else {
      const P0 = worldOf(b, s.at, new THREE.Vector3()), A = axisOf(b, s.ax, new THREE.Vector3());
      drag = { i, P0, A, t0: along(e, P0, A) || 0, v0: b.dna[s.p], per: s.per, p: s.p };
    }
    els[i].classList.add('on');
    const move = (ev) => {
      if (!drag) return;
      if (drag.rot) {
        const n = ndcOf(ev), g = rig.groundPoint(n[0], n[1], b.y);
        if (g) { let r = Math.atan2(-(g.z - b.z), g.x - b.x) - drag.a0; if (!ev.shiftKey) r = Math.round(r / (Math.PI / 36)) * (Math.PI / 36); app.rotateTo(b, r); }
      } else {
        const t = along(ev, drag.P0, drag.A); if (t === null) return;
        const P = PARAMS[drag.p]; let v = drag.v0 + (t - drag.t0) / drag.per;
        v = P.t === 'i' ? Math.round(v) : Math.round(v / (P.step || 0.1)) * (P.step || 0.1);
        v = clamp(v, P.min, P.max);
        if (v !== b.dna[drag.p]) app.setParam(b, drag.p, v, false);
      }
      const sp = specs[drag.i]; if (sp) { tip.textContent = sp.txt(); tip.hidden = false; }
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (els[i]) els[i].classList.remove('on');
      tip.hidden = true; drag = null;
      app.commit('grip'); build();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }

  app.on('select', build);
  app.on('view', build);
  app.on('param', ({ b }) => { if (b === app.sel && !drag) build(); else if (b === app.sel) { const gen = TYPES[b.dna.type].gen; const fresh = SPECS[gen] ? SPECS[gen](b.dna, b.stats.ext || {}) : []; fresh.forEach((s, i) => { if (specs[i] && !specs[i].rot) { specs[i].at = s.at; specs[i].txt = s.txt; } }); } });
  app.on('city', () => { if (app.sel !== forB || !app.sel) build(); });

  app.hooks.push(() => {
    const b = app.sel;
    if (!b || !els.length) return false;
    const r = canvas.getBoundingClientRect();
    const show = app.tool.mode === 'select' && !app.hideUI;
    for (let i = 0; i < els.length; i++) {
      const s = specs[i], el = els[i];
      worldOf(b, s.at, p); rig.project(p, p);
      const vis = show && p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
      el.style.display = vis ? '' : 'none';
      if (!vis) continue;
      const x = (p.x * 0.5 + 0.5) * r.width, y = (-p.y * 0.5 + 0.5) * r.height;
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      if (drag && drag.i === i) tip.style.transform = `translate(${(x + 22).toFixed(1)}px,${(y - 12).toFixed(1)}px)`;
    }
    return false;
  });
}
