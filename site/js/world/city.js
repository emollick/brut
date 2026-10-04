// The city: a list of buildings, each a DNA plus a place on the site.
import * as THREE from 'three';
import { Builder, BatchSet } from '../gfx/batch.js';
import { generate } from '../arch/gen.js';
import { TYPES, sanitize } from '../arch/dna.js';
import { BUILD_R } from './ground.js';
import { clamp } from '../util.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3();
let NEXT_ID = 1;

export class Building {
  constructor(dna, x, z, rot) {
    this.id = NEXT_ID++;
    this.dna = dna; this.x = x; this.z = z; this.y = 0; this.rot = rot || 0;
    this.set = new BatchSet('world');
    this.stats = {}; this.masses = []; this.count = 0;
    this.rise = null;        // construction animation {t, dur, h}
    this.name = '';
    this.year = 0;           // sim year it was built (for patina)
  }
  place() {
    const g = this.set.group;
    g.position.set(this.x, this.y, this.z); g.rotation.set(0, this.rot, 0);
    g.updateMatrix(); g.updateMatrixWorld(true);
  }
  // local <-> world on the ground plane
  toLocal(wx, wz, out) {
    const c = Math.cos(this.rot), s = Math.sin(this.rot), dx = wx - this.x, dz = wz - this.z;
    out[0] = dx * c - dz * s; out[1] = dx * s + dz * c; return out;
  }
  toWorld(lx, lz, out) {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    out[0] = this.x + lx * c + lz * s; out[1] = this.z - lx * s + lz * c; return out;
  }
}

export class City {
  constructor(pipe, scene, ground) {
    this.pipe = pipe; this.scene = scene; this.ground = ground;
    this.B = new Builder();
    this.list = [];
    this.stamp = 0;
    this.apronTimer = 0; this.apronsDirty = false;
    this.rasterDirty = true;
    this.onChange = null;
    this.yearNow = 0;
  }
  bump() { this.stamp++; this.rasterDirty = true; if (this.onChange) this.onChange(); }

  add(dna, x, z, rot = 0, o = {}) {
    const b = new Building(sanitize({ ...dna }), x, z, rot);
    if (o.id) { b.id = o.id; NEXT_ID = Math.max(NEXT_ID, o.id + 1); }
    b.name = o.name || this._name(b);
    b.year = o.year !== undefined ? o.year : this.yearNow;
    b.y = o.y || 0;
    this.scene.add(b.set.group);
    this.list.push(b);
    this.regen(b);
    if (o.rise) b.rise = { t: 0, dur: 0.9 + Math.min(4.5, (b.stats.height || 20) * 0.035), h: (b.stats.height || 20) + 4 };
    this.apronsDirty = true;
    this.bump();
    return b;
  }
  _name(b) {
    const T = TYPES[b.dna.type];
    const n = this.list.filter(o => o.dna.type === b.dna.type).length + 1;
    return `${T.label} ${n}`;
  }
  regen(b) {
    b.stats = generate(this.B, b.dna);
    b.masses = this.B.masses.slice();
    b.lights = this.B.lights.slice();
    b.vol = this.B.vol;
    b.count = this.B.count;
    b.set.sync(this.B, this.pipe);
    b.set.obj.w = (b.id * 0.618) % 1;
    b.set.obj2.x = b.dna.age || 0;
    b.set.obj2.y = b.dna.planting || 0;
    if (!b.set.obj2.z) b.set.obj2.z = 1;
    b.place();
  }
  update(b, { shape = true } = {}) {
    if (shape) this.regen(b); else b.place();
    this.apronsDirty = true;
    this.bump();
  }
  move(b, x, z) {
    const r = Math.hypot(x, z);
    if (r > BUILD_R) { x *= BUILD_R / r; z *= BUILD_R / r; }
    b.x = x; b.z = z; b.place();
    this.apronsDirty = true; this.bump();
  }
  remove(b) {
    const i = this.list.indexOf(b);
    if (i < 0) return;
    this.list.splice(i, 1);
    b.set.dispose(this.pipe);
    this.apronsDirty = true;
    this.bump();
  }
  clear() { for (const b of this.list.slice()) this.remove(b); }

  tick(dt) {
    let anim = false;
    for (const b of this.list) {
      if (b.rise) {
        b.rise.t += dt;
        const k = clamp(b.rise.t / b.rise.dur, 0, 1), e = 1 - Math.pow(1 - k, 2.2);
        b.set.obj.x = k >= 1 ? 1e6 : e * b.rise.h;
        if (k >= 1) b.rise = null;
        anim = true;
      }
    }
    if (this.apronsDirty) {
      this.apronTimer -= dt;
      if (this.apronTimer <= 0) { this.syncAprons(); this.apronTimer = 0.12; }
    }
    if (anim) this.stamp++;
    return anim;
  }
  syncAprons() {
    const out = [];
    for (const b of this.list) {
      const f = b.stats.foot; if (!f) continue;
      const p = b.toWorld(f.cx || 0, f.cz || 0, [0, 0]);
      if (f.light) continue;                       // megastructures and decks leave the ground alone
      if (f.round) out.push({ t: 'disc', k: 'paving', x: p[0], z: p[1], rx: f.w / 2 + 4, rz: f.d / 2 + 4 });
      else out.push({ t: 'rect', k: 'paving', x: p[0], z: p[1], w: f.w + 9, d: f.d + 11, rot: b.rot, r: 2 });
    }
    this.ground.aprons = out;
    this.ground.redraw();
    this.apronsDirty = false;
  }

  // nearest building hit by a world ray
  pick(origin, dir) {
    let best = null, bt = 1e9;
    for (const b of this.list) {
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      const ox = origin.x - b.x, oz = origin.z - b.z;
      _o.set(ox * c - oz * s, origin.y - b.y, ox * s + oz * c);
      _d.set(dir.x * c - dir.z * s, dir.y, dir.x * s + dir.z * c);
      for (const m of b.masses) {
        const mc = Math.cos(m[6]), ms = Math.sin(m[6]);
        const px = _o.x - m[0], pz = _o.z - m[2], py = _o.y - m[1];
        const lox = px * mc - pz * ms, loz = px * ms + pz * mc;
        const ldx = _d.x * mc - _d.z * ms, ldz = _d.x * ms + _d.z * mc;
        const t = slab(lox, py, loz, ldx, _d.y, ldz, m[3] / 2, m[4] / 2, m[5] / 2);
        if (t !== null && t < bt) { bt = t; best = b; }
      }
    }
    return best ? { b: best, t: bt } : null;
  }
  // height of the tallest mass over a world point (for stacking one thing on another)
  roofAt(x, z, skip) {
    let h = 0;
    const p = [0, 0];
    for (const b of this.list) {
      if (b === skip) continue;
      b.toLocal(x, z, p);
      for (const m of b.masses) {
        const mc = Math.cos(m[6]), ms = Math.sin(m[6]);
        const lx = (p[0] - m[0]) * mc - (p[1] - m[2]) * ms, lz = (p[0] - m[0]) * ms + (p[1] - m[2]) * mc;
        if (Math.abs(lx) <= m[3] / 2 && Math.abs(lz) <= m[5] / 2) h = Math.max(h, b.y + m[1] + m[4] / 2);
      }
    }
    return h;
  }
  // Raster of what stands on the site: n x n cells over +-half metres.
  // 1 where a solid mass crosses the band yLo..yHi; undercrofts count only if `under` is set.
  occupancy(n, half, yLo = 0.3, yHi = 2.2, under = false, out = new Uint8Array(n * n)) {
    out.fill(0);
    const cs = (half * 2) / n;
    for (const b of this.list) {
      const cb = Math.cos(b.rot), sb = Math.sin(b.rot);
      for (const m of b.masses) {
        if (m[7] && !under) continue;
        const y0 = b.y + m[1] - m[4] / 2, y1 = b.y + m[1] + m[4] / 2;
        if (y1 < yLo || y0 > yHi) continue;
        const wx = b.x + m[0] * cb + m[2] * sb, wz = b.z - m[0] * sb + m[2] * cb, rot = b.rot + m[6];
        const c = Math.cos(rot), s = Math.sin(rot), hx = m[3] / 2, hz = m[5] / 2;
        const ex = Math.abs(hx * c) + Math.abs(hz * s), ez = Math.abs(hx * s) + Math.abs(hz * c);
        const i0 = Math.max(0, Math.floor((wx - ex + half) / cs)), i1 = Math.min(n - 1, Math.floor((wx + ex + half) / cs));
        const j0 = Math.max(0, Math.floor((wz - ez + half) / cs)), j1 = Math.min(n - 1, Math.floor((wz + ez + half) / cs));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const dx = (i + 0.5) * cs - half - wx, dz = (j + 0.5) * cs - half - wz;
          const lx = dx * c - dz * s, lz = dx * s + dz * c;
          if (Math.abs(lx) <= hx + cs * 0.3 && Math.abs(lz) <= hz + cs * 0.3) out[j * n + i] = 1;
        }
      }
    }
    return out;
  }
  // solid footprints at ground level as world-space boxes: [x, z, halfW, halfD, rot]
  obstacles() {
    const out = [];
    for (const b of this.list) {
      const cb = Math.cos(b.rot), sb = Math.sin(b.rot);
      for (const m of b.masses) {
        if (m[7]) continue;
        const y0 = b.y + m[1] - m[4] / 2, y1 = b.y + m[1] + m[4] / 2;
        if (y1 < 0.4 || y0 > 2.2) continue;
        out.push([b.x + m[0] * cb + m[2] * sb, b.z - m[0] * sb + m[2] * cb, m[3] / 2, m[5] / 2, b.rot + m[6]]);
      }
    }
    return out;
  }  totals() {
    let pop = 0, dw = 0, jobs = 0, gfa = 0, vol = 0, n = 0, foot = 0, tallest = 0;
    for (const b of this.list) {
      const s = b.stats; pop += s.pop || 0; dw += s.dwellings || 0; jobs += s.jobs || 0; gfa += s.gfa || 0; vol += b.vol || 0; n += b.count;
      if (s.foot && !s.foot.light) foot += s.foot.w * s.foot.d * (s.foot.round ? 0.785 : 1);
      tallest = Math.max(tallest, (s.height || 0) + b.y);
    }
    return { pop, dwellings: dw, jobs, gfa, concrete: vol, instances: n, footprint: foot, tallest, buildings: this.list.length };
  }
  serialize() {
    return this.list.map(b => ({ id: b.id, d: b.dna, x: +b.x.toFixed(2), z: +b.z.toFixed(2), y: +b.y.toFixed(2), r: +b.rot.toFixed(4), n: b.name, yr: b.year }));
  }
  load(arr) {
    this.clear();
    for (const o of arr || []) this.add(o.d, o.x, o.z, o.r, { id: o.id, name: o.n, year: o.yr, y: o.y });
    this.syncAprons();
  }
}

function slab(ox, oy, oz, dx, dy, dz, hx, hy, hz) {
  let t0 = 0, t1 = 1e9;
  const ax = [[ox, dx, hx], [oy, dy, hy], [oz, dz, hz]];
  for (const [o, d, h] of ax) {
    if (Math.abs(d) < 1e-9) { if (Math.abs(o) > h) return null; continue; }
    let a = (-h - o) / d, b = (h - o) / d;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return null;
  }
  return t0;
}
