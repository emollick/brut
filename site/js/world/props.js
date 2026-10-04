// Trees and street lighting: everything on the ground that is not a building.
import * as THREE from 'three';
import { Builder, BatchSet, M, ROLE, pen } from '../gfx/batch.js';
import { pens, tree } from '../arch/common.js';
import { rng, clamp } from '../util.js';
import { SITE_HALF } from './ground.js';

export const TREE_KINDS = { round: 'Plane', poplar: 'Poplar', pine: 'Pine' };

export class Props {
  constructor(pipe, scene, city) {
    this.pipe = pipe; this.scene = scene; this.city = city;
    this.trees = [];      // {x,z,h,k,s}
    this.lamps = [];      // {x,z,h}
    this.B = new Builder();
    this.treeSet = new BatchSet('world'); scene.add(this.treeSet.group);
    this.lampSet = new BatchSet('world'); scene.add(this.lampSet.group);
    this.lampSet.castShadow = false;
    this.P = pens({ tone: 0.4, value: 0.45, finish: 'smooth', accent: 'none' });
    this.growth = 1;      // 0.35 saplings .. 1 mature .. 1.3 overgrown
    this.dirty = true; this.lampDirty = true;
    this.stamp = 0;
    const cv = this.lampCv = document.createElement('canvas'); cv.width = cv.height = 512;
    this.lampCx = cv.getContext('2d');
    const t = this.lampTex = new THREE.CanvasTexture(cv);
    t.flipY = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    pipe.U.uLampMap.value = t;
  }
  addTree(x, z, h, k = 'round') { this.trees.push({ x, z, h: h || 9 + Math.random() * 6, k, s: (Math.random() * 1e6) | 0 }); this.dirty = true; }
  addLamp(x, z, h = 6.5) { this.lamps.push({ x, z, h }); this.lampDirty = true; this.dirty = true; }
  eraseNear(x, z, r) {
    const n0 = this.trees.length + this.lamps.length;
    this.trees = this.trees.filter(t => Math.hypot(t.x - x, t.z - z) > r);
    this.lamps = this.lamps.filter(t => Math.hypot(t.x - x, t.z - z) > r);
    if (this.trees.length + this.lamps.length !== n0) { this.dirty = true; this.lampDirty = true; }
    return n0 - this.trees.length - this.lamps.length;
  }
  clear() { this.trees = []; this.lamps = []; this.dirty = true; this.lampDirty = true; }
  // a line of trees between two points
  row(x0, z0, x1, z1, spacing, k = 'round', h = 11, jitter = 0.6, R = Math.random) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / spacing));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.trees.push({ x: x0 + (x1 - x0) * t + (R() - 0.5) * jitter, z: z0 + (z1 - z0) * t + (R() - 0.5) * jitter, h: h * (0.85 + R() * 0.3), k, s: (R() * 1e6) | 0 });
    }
    this.dirty = true;
  }
  grove(x, z, r, n, k = 'round', h = 11, R = Math.random) {
    for (let i = 0; i < n; i++) {
      const a = R() * 6.283, rr = Math.sqrt(R()) * r;
      this.trees.push({ x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr, h: h * (0.7 + R() * 0.6), k: k === 'mix' ? (R() < 0.3 ? 'pine' : R() < 0.2 ? 'poplar' : 'round') : k, s: (R() * 1e6) | 0 });
    }
    this.dirty = true;
  }
  lampRow(x0, z0, x1, z1, spacing = 26, h = 6.5) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / spacing));
    for (let i = 0; i <= n; i++) this.lamps.push({ x: x0 + (x1 - x0) * i / n, z: z0 + (z1 - z0) * i / n, h });
    this.lampDirty = true; this.dirty = true;
  }
  rebuild() {
    const B = this.B, P = this.P;
    B.begin();
    const detail = (this.tier === 'low' || this.tier === 'medium') ? 0.5 : 1;      // fewer, larger masses on slower machines
    for (const t of this.trees) tree(B, P, t.x, 0, t.z, t.h * this.growth, t.k, rng(t.s), detail);
    this.treeSet.sync(B, this.pipe);
    B.begin();
    const pole = pen(M.CONC, [0.3, 0.3, 0.29], 6, ROLE.SITE);
    for (const l of this.lamps) {
      B.boxB(l.x, 0, l.z, 0.22, l.h, 0.22, pole, 0, 0.7);
      B.boxB(l.x, l.h, l.z, 0.9, 0.12, 0.9, pole);
      B.sph(l.x, l.h - 0.22, l.z, 0.5, 0.42, 0.5, P.lamp);
    }
    this.lampSet.sync(B, this.pipe);
    this.dirty = false; this.stamp++;
  }
  // pools of light, drawn from above; buildings add their own door and undercroft lights
  drawLampMap() {
    const cx = this.lampCx, n = 512, k = n / (SITE_HALF * 2);
    cx.globalCompositeOperation = 'source-over'; cx.fillStyle = '#000'; cx.fillRect(0, 0, n, n);
    cx.globalCompositeOperation = 'lighter';
    const spot = (x, z, r, c, a) => {
      const px = (x / (SITE_HALF * 2) + 0.5) * n, pz = (z / (SITE_HALF * 2) + 0.5) * n, pr = r * k;
      const g = cx.createRadialGradient(px, pz, 0, px, pz, pr);
      g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(0.25, `rgba(${c},${a * 0.55})`); g.addColorStop(0.6, `rgba(${c},${a * 0.14})`); g.addColorStop(1, `rgba(${c},0)`);
      cx.fillStyle = g; cx.beginPath(); cx.arc(px, pz, pr, 0, 6.283); cx.fill();
    };
    for (const l of this.lamps) spot(l.x, l.z, l.h * 3.4, '255,150,60', 0.85);
    const p = [0, 0];
    for (const b of this.city.list) {
      for (const L of (b.lights || [])) { b.toWorld(L[0], L[2], p); spot(p[0], p[1], 9 + L[3] * 9, L[3] > 1.5 ? '255,215,160' : '255,190,120', clamp(0.5 * L[3], 0.2, 1)); }
    }
    this.lampTex.needsUpdate = true;
    this.lampDirty = false;
  }
  update() {
    let changed = false;
    if (this.pipe.tier !== this.tier) { this.tier = this.pipe.tier; this.dirty = true; }
    if (this.dirty) { this.rebuild(); changed = true; }
    if (this.lampDirty) { this.drawLampMap(); changed = true; }
    return changed;
  }
  serialize() { return { t: this.trees.map(t => [+t.x.toFixed(1), +t.z.toFixed(1), +t.h.toFixed(1), t.k, t.s]), l: this.lamps.map(l => [+l.x.toFixed(1), +l.z.toFixed(1), l.h]) }; }
  load(o) {
    this.trees = (o && o.t || []).map(a => ({ x: a[0], z: a[1], h: a[2], k: a[3], s: a[4] }));
    this.lamps = (o && o.l || []).map(a => ({ x: a[0], z: a[1], h: a[2] }));
    this.dirty = true; this.lampDirty = true;
  }
}
