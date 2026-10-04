// Camera rig: one object, several ways of looking.
//   orbit   – perspective, turns about a point on the ground
//   axo     – parallel projection at any angle (isometric, elevation, plan)
//   oblique – plan oblique: the plan stays true, heights are drawn straight up the sheet
//   walk    – eye level, free look
import * as THREE from 'three';

const D2R = Math.PI / 180;
const _v = new THREE.Vector3(), _a = new THREE.Vector4(), _b = new THREE.Vector4();

export class Rig {
  constructor() {
    this.mode = 'orbit';
    this.g = { tx: 0, ty: 0, tz: 0, yaw: 0.6, pitch: 0.42, dist: 520, fov: 32, rise: 0 };   // goals
    this.c = { ...this.g };                                                                  // current
    this.walk = { x: 0, y: 1.65, z: 120, yaw: 0, pitch: 0, fov: 62, rise: 0, fly: false };
    this.aspect = 16 / 9; this.height = 720;
    this.camera = new THREE.Camera();
    this.camera.matrixAutoUpdate = false; this.camera.matrixWorldAutoUpdate = false;
    this.view = new THREE.Matrix4(); this.invView = new THREE.Matrix4();
    this.proj = new THREE.Matrix4(); this.invProj = new THREE.Matrix4();
    this.viewProj = new THREE.Matrix4(); this.invViewProj = new THREE.Matrix4();
    this.pos = new THREE.Vector3(); this.fwd = new THREE.Vector3(); this.right = new THREE.Vector3(); this.up = new THREE.Vector3();
    this.ortho = false; this.near = 1; this.far = 9000; this.pxPerM = 1000; this.pixWorld = 0.001;
    this.moving = true; this.stamp = 0;
    this.limit = 900;
  }
  get target() { return _v.set(this.c.tx, this.c.ty, this.c.tz); }
  setMode(m) { if (this.mode !== m) { this.mode = m; this.moving = true; this.stamp++; } }
  snap() { Object.assign(this.c, this.g); this.moving = true; this.stamp++; }
  set(o, snap = false) { Object.assign(this.g, o); if (snap) this.snap(); }

  orbit(dYaw, dPitch) {
    if (this.mode === 'walk') {
      this.walk.yaw += dYaw; this.walk.pitch = Math.max(-1.45, Math.min(1.45, this.walk.pitch - dPitch));
      this.stamp++; return;
    }
    this.g.yaw += dYaw;
    const lo = this.mode === 'axo' ? 0 : 0.035, hi = Math.PI / 2;
    this.g.pitch = Math.max(lo, Math.min(hi, this.g.pitch + dPitch));
  }
  // keep the ground point under the cursor fixed while zooming
  zoomAt(nx, ny, factor) {
    if (this.mode === 'walk') { this.walk.fov = Math.max(12, Math.min(95, this.walk.fov * factor)); this.stamp++; return; }
    const before = this.groundPoint(nx, ny);
    const d0 = this.g.dist;
    this.g.dist = Math.max(10, Math.min(3200, this.g.dist * factor));
    if (!before) return;
    const k = 1 - this.g.dist / d0;
    this.g.tx += (before.x - this.g.tx) * k; this.g.tz += (before.z - this.g.tz) * k;
    this._clampTarget();
  }
  panGround(dx, dz) { this.g.tx += dx; this.g.tz += dz; this._clampTarget(); }
  _clampTarget() {
    const r = Math.hypot(this.g.tx, this.g.tz);
    if (r > this.limit) { this.g.tx *= this.limit / r; this.g.tz *= this.limit / r; }
  }
  walkMove(fwd, side, upv, dt, fast) {
    const w = this.walk, sp = (fast ? 26 : 5.5) * dt * (w.fly ? 2.2 : 1);
    const cy = Math.cos(w.yaw), sy = Math.sin(w.yaw);
    const nx = w.x + (-sy * fwd + cy * side) * sp, nz = w.z + (-cy * fwd - sy * side) * sp;
    if (!this.blocked || !this.blocked(nx, nz, w.y)) { w.x = nx; w.z = nz; }
    else if (!this.blocked(nx, w.z, w.y)) w.x = nx;
    else if (!this.blocked(w.x, nz, w.y)) w.z = nz;
    if (w.fly) w.y = Math.max(1.2, Math.min(400, w.y + upv * sp));
    if (fwd || side || upv) this.stamp++;
  }

  update(dt, w, h) {
    this.aspect = w / h; this.height = h;
    const c = this.c, g = this.g;
    const k = 1 - Math.exp(-dt * 13);
    let moved = 0;
    for (const key in g) {
      let d = g[key] - c[key];
      if (Math.abs(d) < 1e-5) { c[key] = g[key]; continue; }
      c[key] += d * k; moved += Math.abs(d) / (Math.abs(g[key]) + 1);
    }
    this.moving = moved > 2e-5;
    if (this.moving) this.stamp++;
    const cam = this.camera;
    if (this.mode === 'walk') {
      const wk = this.walk;
      const cp = Math.cos(wk.pitch), sp = Math.sin(wk.pitch), cy = Math.cos(wk.yaw), sy = Math.sin(wk.yaw);
      this.pos.set(wk.x, wk.y, wk.z);
      this.fwd.set(-sy * cp, sp, -cy * cp);
      this.right.set(cy, 0, -sy);
      this.up.crossVectors(this.right, this.fwd).normalize();
      this.ortho = false; this.near = 0.25; this.far = 9000;
      const t = Math.tan(wk.fov * 0.5 * D2R) * this.near;
      this.proj.makePerspective(-t * this.aspect, t * this.aspect, t, -t, this.near, this.far);
      this.proj.elements[9] = wk.rise;
      this.pxPerM = h / (2 * Math.tan(wk.fov * 0.5 * D2R)); this.pixWorld = 1 / this.pxPerM;
    } else {
      const pitch = this.mode === 'oblique' ? Math.PI / 2 : c.pitch;
      const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
      this.fwd.set(-cp * sy, -sp, -cp * cy);
      this.right.set(cy, 0, -sy);
      this.up.set(-sp * sy, cp, -sp * cy);
      const ortho = this.mode === 'axo' || this.mode === 'oblique';
      this.ortho = ortho;
      const halfH = c.dist * Math.tan(c.fov * 0.5 * D2R);
      if (ortho) {
        const D = 2600;
        this.pos.set(c.tx - this.fwd.x * D, c.ty - this.fwd.y * D, c.tz - this.fwd.z * D);
        this.near = D - 1300; this.far = D + 2600;      // keep the hills out of the way of a parallel view
        this.proj.makeOrthographic(-halfH * this.aspect, halfH * this.aspect, halfH, -halfH, this.near, this.far);
        if (this.mode === 'oblique') {      // true plan; one metre of height is one metre up the sheet
          const s = 1 / halfH;
          this.proj.elements[9] = s; this.proj.elements[13] += s * D;
        }
        this.pxPerM = h / (2 * halfH); this.pixWorld = 1 / this.pxPerM;
      } else {
        this.pos.set(c.tx - this.fwd.x * c.dist, c.ty - this.fwd.y * c.dist, c.tz - this.fwd.z * c.dist);
        this.near = Math.max(0.5, c.dist * 0.02); this.far = c.dist + 9000;
        const t = Math.tan(c.fov * 0.5 * D2R) * this.near;
        this.proj.makePerspective(-t * this.aspect, t * this.aspect, t, -t, this.near, this.far);
        this.proj.elements[9] = c.rise;
        this.pxPerM = h / (2 * Math.tan(c.fov * 0.5 * D2R)); this.pixWorld = 1 / this.pxPerM;
      }
    }
    const e = cam.matrixWorld.elements, r = this.right, u = this.up, f = this.fwd, p = this.pos;
    e[0] = r.x; e[1] = r.y; e[2] = r.z; e[3] = 0;
    e[4] = u.x; e[5] = u.y; e[6] = u.z; e[7] = 0;
    e[8] = -f.x; e[9] = -f.y; e[10] = -f.z; e[11] = 0;
    e[12] = p.x; e[13] = p.y; e[14] = p.z; e[15] = 1;
    this.invView.copy(cam.matrixWorld);
    this.view.copy(cam.matrixWorld).invert();
    cam.matrixWorldInverse.copy(this.view);
    this.invProj.copy(this.proj).invert();
    this.viewProj.multiplyMatrices(this.proj, this.view);
    this.invViewProj.copy(this.viewProj).invert();
  }
  // world ray through a point of the screen (NDC)
  ray(nx, ny, origin, dir) {
    _a.set(nx, ny, -1, 1).applyMatrix4(this.invViewProj); _a.divideScalar(_a.w);
    _b.set(nx, ny, 1, 1).applyMatrix4(this.invViewProj); _b.divideScalar(_b.w);
    origin.set(_a.x, _a.y, _a.z);
    dir.set(_b.x - _a.x, _b.y - _a.y, _b.z - _a.z).normalize();
  }
  groundPoint(nx, ny, y = 0, out = new THREE.Vector3()) {
    const o = new THREE.Vector3(), d = new THREE.Vector3();
    this.ray(nx, ny, o, d);
    if (Math.abs(d.y) < 1e-5) return null;
    const t = (y - o.y) / d.y;
    if (t < 0) return null;
    return out.set(o.x + d.x * t, y, o.z + d.z * t);
  }
  project(p, out = new THREE.Vector3()) { // world -> NDC (z > 1 or w < 0 means behind)
    _a.set(p.x, p.y, p.z, 1).applyMatrix4(this.viewProj);
    out.set(_a.x / _a.w, _a.y / _a.w, _a.w > 0 ? _a.z / _a.w : 2);
    return out;
  }
  focusDistance() {
    if (this.mode === 'walk') return 40;
    return this.ortho ? 2600 : this.c.dist;
  }
  state() { return { mode: this.mode, g: { ...this.g }, walk: { ...this.walk } }; }
  load(s) { if (!s) return; this.mode = s.mode || 'orbit'; Object.assign(this.g, s.g); Object.assign(this.walk, s.walk || {}); this.snap(); }
}
