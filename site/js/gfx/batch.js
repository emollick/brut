// Builder: generators call box()/cyl()/... and it fills flat instance arrays.
// Batch: one instanced draw per primitive type, fed from a Builder.
import * as THREE from 'three';
import { PRIM, PRIM_COUNT, prims } from './prims.js';

// material ids (iMat.x)
export const M = { CONC: 0, GLASS: 1, PAINT: 2, METAL: 3, PLANT: 4, WOOD: 5, LAMP: 6, FIG: 7, WATER: 8, SOIL: 9, CAR: 10, SHADOW: 11 };
// concrete finishes (iMat.y low 3 bits)
export const FIN = { BOARD_H: 0, BOARD_V: 1, RIB: 2, HAMMER: 3, PANEL: 4, PRECAST: 5, SMOOTH: 6 };
// roles (iMat.y / 8): 0 infill, 1 structure, 2 tree (sways), 3 site furniture
export const ROLE = { INFILL: 0, STRUCT: 1, TREE: 2, SITE: 3 };

export function pen(m, c, f = 0, role = 0) { return { m, c, f, role }; }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

export class Builder {
  constructor() {
    this.b = [];
    for (let i = 0; i < PRIM_COUNT; i++) this.b.push({ n: 0, cap: 0, M: null, C: null, A: null });
    this.begin();
  }
  begin() {
    for (const b of this.b) b.n = 0;
    this.base = null; this.bases = [];
    this.fo = [0, 0, 0]; this.fr = 0; this.fc = 1; this.fs = 0;
    this.min = [1e9, 1e9, 1e9]; this.max = [-1e9, -1e9, -1e9];
    this.vol = 0; this.count = 0; this.seedN = 1;
    this.masses = [];   // coarse boxes for picking: [cx,cy,cz,sx,sy,sz,rot]
    this.stats = {};
    this.lights = [];   // lamp positions (local): [x,y,z,strength]
    return this;
  }
  // frame: where the next primitives are placed, relative to the current base
  frame(ox = 0, oy = 0, oz = 0, rot = 0) {
    const b = this.base;
    if (b) {
      const c = Math.cos(b[3]), s = Math.sin(b[3]);
      this.fo[0] = b[0] + ox * c + oz * s; this.fo[1] = b[1] + oy; this.fo[2] = b[2] - ox * s + oz * c;
      rot += b[3];
    } else { this.fo[0] = ox; this.fo[1] = oy; this.fo[2] = oz; }
    this.fr = rot; this.fc = Math.cos(rot); this.fs = Math.sin(rot);
    return this;
  }
  // base: lets one generator place another (a bar inside a megastructure) at an offset
  pushBase(x, y, z, rot = 0) {
    const b = this.base;
    let nb;
    if (b) { const c = Math.cos(b[3]), s = Math.sin(b[3]); nb = [b[0] + x * c + z * s, b[1] + y, b[2] - x * s + z * c, b[3] + rot]; }
    else nb = [x, y, z, rot];
    (this.bases || (this.bases = [])).push(b || null);
    this.base = nb;
    this.frame(0, 0, 0, 0);
  }
  popBase() { this.base = this.bases.pop(); this.frame(0, 0, 0, 0); }
  _grow(b) {
    const cap = Math.max(64, b.cap * 2);
    const Mx = new Float32Array(cap * 16), C = new Float32Array(cap * 3), A = new Float32Array(cap * 4);
    if (b.M) { Mx.set(b.M); C.set(b.C); A.set(b.A); }
    b.M = Mx; b.C = C; b.A = A; b.cap = cap;
  }
  _attrs(b, pn, taper) {
    const i = b.n, c = pn.c;
    b.C[i * 3] = c[0]; b.C[i * 3 + 1] = c[1]; b.C[i * 3 + 2] = c[2];
    // cheap deterministic per-instance seed
    let s = (this.seedN = (this.seedN * 16807) % 2147483647);
    b.A[i * 4] = pn.m; b.A[i * 4 + 1] = (pn.f || 0) + 8 * (pn.role || 0); b.A[i * 4 + 2] = taper; b.A[i * 4 + 3] = (s & 0xffff) / 65536;
    b.n++; this.count++;
  }
  _bound(x, y, z, r, ry) {
    const mn = this.min, mx = this.max;
    if (x - r < mn[0]) mn[0] = x - r; if (y - ry < mn[1]) mn[1] = y - ry; if (z - r < mn[2]) mn[2] = z - r;
    if (x + r > mx[0]) mx[0] = x + r; if (y + ry > mx[1]) mx[1] = y + ry; if (z + r > mx[2]) mx[2] = z + r;
  }
  // centre (cx,cy,cz), full sizes (sx,sy,sz), rotation about Y, taper = top/bottom scale in xz
  put(prim, cx, cy, cz, sx, sy, sz, pn, rot = 0, taper = 1) {
    const b = this.b[prim];
    if (b.n === b.cap) this._grow(b);
    const x = this.fo[0] + cx * this.fc + cz * this.fs, z = this.fo[2] - cx * this.fs + cz * this.fc, y = this.fo[1] + cy;
    let c = this.fc, s = this.fs;
    if (rot !== 0) { const r = this.fr + rot; c = Math.cos(r); s = Math.sin(r); }
    const Mx = b.M, o = b.n * 16;
    Mx[o] = c * sx; Mx[o + 1] = 0; Mx[o + 2] = -s * sx; Mx[o + 3] = 0;
    Mx[o + 4] = 0; Mx[o + 5] = sy; Mx[o + 6] = 0; Mx[o + 7] = 0;
    Mx[o + 8] = s * sz; Mx[o + 9] = 0; Mx[o + 10] = c * sz; Mx[o + 11] = 0;
    Mx[o + 12] = x; Mx[o + 13] = y; Mx[o + 14] = z; Mx[o + 15] = 1;
    const tm = taper > 1 ? taper : 1;
    this._bound(x, y, z, 0.5 * Math.hypot(sx, sz) * tm, sy * 0.5);
    if (pn.m === M.CONC) this.vol += sx * sy * sz * (prim === PRIM.BOX ? 1 : prim === PRIM.WEDGE ? 0.5 : 0.7) * (0.5 + 0.5 * taper);
    this._attrs(b, pn, taper);
  }
  box(cx, cy, cz, sx, sy, sz, pn, rot, taper) { this.put(PRIM.BOX, cx, cy, cz, sx, sy, sz, pn, rot, taper); }
  cyl(cx, cy, cz, dx, h, dz, pn, rot, taper) { this.put(PRIM.CYL, cx, cy, cz, dx, h, dz, pn, rot, taper); }
  wedge(cx, cy, cz, sx, sy, sz, pn, rot) { this.put(PRIM.WEDGE, cx, cy, cz, sx, sy, sz, pn, rot, 1); }
  sph(cx, cy, cz, dx, dy, dz, pn, rot) { this.put(PRIM.SPH, cx, cy, cz, dx, dy, dz, pn, rot, 1); }
  blob(cx, cy, cz, dx, dy, dz, pn, rot) { this.put(PRIM.BLOB, cx, cy, cz, dx, dy, dz, pn, rot, 1); }
  vault(cx, cy, cz, sx, sy, sz, pn, rot) { this.put(PRIM.VAULT, cx, cy, cz, sx, sy, sz, pn, rot, 1); }
  tube(cx, cy, cz, dx, h, dz, pn, rot, taper) { this.put(PRIM.TUBE, cx, cy, cz, dx, h, dz, pn, rot, taper); }
  // box given by its bottom-centre (handy for anything standing on a level)
  boxB(cx, y0, cz, sx, sy, sz, pn, rot, taper) { this.put(PRIM.BOX, cx, y0 + sy * 0.5, cz, sx, sy, sz, pn, rot, taper); }
  cylB(cx, y0, cz, dx, h, dz, pn, rot, taper) { this.put(PRIM.CYL, cx, y0 + h * 0.5, cz, dx, h, dz, pn, rot, taper); }
  // arbitrary orientation: euler XYZ (radians) in the current frame
  putE(prim, cx, cy, cz, sx, sy, sz, rx, ry, rz, pn, taper = 1) {
    const b = this.b[prim];
    if (b.n === b.cap) this._grow(b);
    const x = this.fo[0] + cx * this.fc + cz * this.fs, z = this.fo[2] - cx * this.fs + cz * this.fc, y = this.fo[1] + cy;
    _e.set(rx, ry + this.fr, rz, 'YXZ'); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    b.M.set(_m.elements, b.n * 16);
    const r = 0.5 * Math.hypot(sx, sy, sz);
    this._bound(x, y, z, r, r);
    if (pn.m === M.CONC) this.vol += sx * sy * sz * (prim === PRIM.BOX ? 1 : 0.7);
    this._attrs(b, pn, taper);
  }
  // a prismatic member between two points (columns, struts, raking legs)
  strut(prim, x0, y0, z0, x1, y1, z1, w, d, pn, taper = 1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(dx, dz), pitch = Math.acos(Math.max(-1, Math.min(1, dy / len)));
    this.putE(prim, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, w, len, d, pitch, yaw, 0, pn, taper);
  }
  // open = 1: something you can pick but walk and blow through (an undercroft)
  mass(cx, cy, cz, sx, sy, sz, rot = 0, open = 0) {
    const x = this.fo[0] + cx * this.fc + cz * this.fs, z = this.fo[2] - cx * this.fs + cz * this.fc;
    this.masses.push([x, this.fo[1] + cy, z, sx, sy, sz, this.fr + rot, open]);
  }
  light(x, y, z, k = 1) {
    this.lights.push([this.fo[0] + x * this.fc + z * this.fs, this.fo[1] + y, this.fo[2] - x * this.fs + z * this.fc, k]);
  }
  sphere(out = new THREE.Sphere()) {
    const mn = this.min, mx = this.max;
    if (mn[0] > mx[0]) { out.center.set(0, 0, 0); out.radius = 1; return out; }
    out.center.set((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);
    out.radius = 0.5 * Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) + 0.5;
    return out;
  }
}

// One instanced mesh per primitive type; lives inside a Group that carries the object transform.
export class BatchSet {
  constructor(kind = 'world') {
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = true;
    this.kind = kind;
    this.meshes = new Array(PRIM_COUNT).fill(null);
    this.obj = new THREE.Vector4(1e6, 0, 0, 0);   // build height, ghost, selected, light seed
    this.obj2 = new THREE.Vector4(0, 0, 0, 0);    // age, vigor, hot, spare
    this.castShadow = true;
    this.count = 0;
  }
  sync(B, registry) {
    const base = prims();
    const sph = B.sphere();
    this.count = 0;
    for (let i = 0; i < PRIM_COUNT; i++) {
      const src = B.b[i];
      let mesh = this.meshes[i];
      if (src.n === 0) { if (mesh) mesh.visible = false, mesh.userData.empty = true; continue; }
      let g = mesh ? mesh.geometry : null;
      if (!mesh || mesh.userData.cap < src.n) {
        const cap = Math.max(32, Math.ceil(src.n * 1.25));
        const ng = new THREE.InstancedBufferGeometry();
        ng.index = base[i].index;
        ng.setAttribute('position', base[i].attributes.position);
        ng.setAttribute('normal', base[i].attributes.normal);
        ng.setAttribute('aSurf', base[i].attributes.aSurf);
        const aM = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
        const aC = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        const aA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
        aM.setUsage(THREE.DynamicDrawUsage); aC.setUsage(THREE.DynamicDrawUsage); aA.setUsage(THREE.DynamicDrawUsage);
        ng.setAttribute('iM', aM); ng.setAttribute('iColor', aC); ng.setAttribute('iMat', aA);
        if (mesh) { mesh.geometry.dispose(); mesh.geometry = ng; }
        else {
          mesh = new THREE.Mesh(ng, registry.placeholder);
          mesh.userData.kind = this.kind;
          mesh.userData.set = this;
          mesh.onBeforeRender = onBeforeRenderObj;
          this.meshes[i] = mesh;
          this.group.add(mesh);
          registry.add(mesh);
        }
        mesh.userData.cap = cap;
        g = ng;
      }
      g.attributes.iM.array.set(src.M.subarray(0, src.n * 16)); g.attributes.iM.needsUpdate = true;
      g.attributes.iColor.array.set(src.C.subarray(0, src.n * 3)); g.attributes.iColor.needsUpdate = true;
      g.attributes.iMat.array.set(src.A.subarray(0, src.n * 4)); g.attributes.iMat.needsUpdate = true;
      g.instanceCount = src.n;
      if (!g.boundingSphere) g.boundingSphere = new THREE.Sphere();
      g.boundingSphere.copy(sph);
      mesh.visible = true; mesh.userData.empty = false;
      this.count += src.n;
    }
  }
  dispose(registry) {
    for (const m of this.meshes) if (m) { registry.remove(m); m.geometry.dispose(); this.group.remove(m); }
    this.meshes.fill(null);
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}

function onBeforeRenderObj(renderer, scene, camera, geometry, material) {
  const u = material.uniforms;
  if (!u || !u.uObj) return;
  const set = this.userData.set;
  u.uObj.value.copy(set.obj);
  u.uObj2.value.copy(set.obj2);
  material.uniformsNeedUpdate = true;
}
