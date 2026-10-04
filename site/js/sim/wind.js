// Wind study: air at head height, solved on a 2D lattice (D2Q9 lattice Boltzmann with a
// Smagorinsky term so it stays stable at city scale), shown as drifting traces.
// It is a picture of where wind funnels and where it is sheltered, not a wind-tunnel result:
// the flow is two-dimensional, so downdraughts off tall faces are not in it.
import * as THREE from 'three';
import * as S from '../gfx/shaders.js';

const N = 256, HALF = 480, CS = (HALF * 2) / N;
const EX = [0, 1, 0, -1, 0, 1, -1, -1, 1], EY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
const WT = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];
const U0 = 0.09, NP = 2400, TRAIL = 11;

export class WindStudy {
  constructor(app) {
    this.app = app; this.on = false;
    this.f = new Float32Array(N * N * 9); this.g = new Float32Array(N * N * 9);
    this.solid = new Uint8Array(N * N);
    this.ux = new Float32Array(N * N); this.uy = new Float32Array(N * N);
    this.mean = new Float32Array(N * N);
    this.key = ''; this.steps = 0; this.result = null;
    this.wx = 1; this.wy = 0;
    // traces
    this.px = new Float32Array(NP * TRAIL); this.pz = new Float32Array(NP * TRAIL); this.life = new Float32Array(NP); this.sp = new Float32Array(NP);
    const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(NP * (TRAIL - 1) * 6 * 3); this.col = new Float32Array(NP * (TRAIL - 1) * 6 * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.matL = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: S.TRACE_VERT, fragmentShader: S.TRACE_FRAG, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
    this.matL.side = THREE.DoubleSide;
    this.lines = new THREE.Mesh(g, this.matL); this.lines.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.lines);
    app.pipe.overlayHooks.push({ active: () => this.on, draw: (r, cam) => r.render(this.scene, cam) });
  }
  setOn(on) { this.on = on; this.key = ''; this.app.touch(); }
  reset() {
    const app = this.app, a = app.env.windAngle;
    this.wx = Math.cos(a); this.wy = Math.sin(a);
    app.city.occupancy(N, HALF, 0.4, 2.2, false, this.solid);
    const ux = this.wx * U0, uy = this.wy * U0, f = this.f;
    for (let c = 0; c < N * N; c++) for (let k = 0; k < 9; k++) f[c * 9 + k] = feq(k, 1, ux, uy);
    this.mean.fill(1); this.steps = 0; this.result = null;
    for (let p = 0; p < NP; p++) this.spawn(p, true);
  }
  spawn(p, anywhere) {
    let x, z;
    if (anywhere || Math.random() < 0.35) { x = (Math.random() * 2 - 1) * HALF * 0.96; z = (Math.random() * 2 - 1) * HALF * 0.96; }
    else {  // come in on the windward edge
      const t = (Math.random() * 2 - 1) * HALF * 0.98;
      if (Math.abs(this.wx) > Math.abs(this.wy)) { x = -Math.sign(this.wx) * HALF * 0.97; z = t; } else { z = -Math.sign(this.wy) * HALF * 0.97; x = t; }
    }
    for (let k = 0; k < TRAIL; k++) { this.px[p * TRAIL + k] = x; this.pz[p * TRAIL + k] = z; }
    this.life[p] = 2 + Math.random() * 7;
  }
  step() {
    const f = this.f, g = this.g, solid = this.solid, ux0 = this.wx * U0, uy0 = this.wy * U0;
    const tau0 = 0.515, C2 = 0.16 * 0.16;
    // collide
    for (let c = 0; c < N * N; c++) {
      if (solid[c]) continue;
      const o = c * 9;
      const f0 = f[o], f1 = f[o + 1], f2 = f[o + 2], f3 = f[o + 3], f4 = f[o + 4], f5 = f[o + 5], f6 = f[o + 6], f7 = f[o + 7], f8 = f[o + 8];
      const rho = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8;
      const ux = (f1 - f3 + f5 - f6 - f7 + f8) / rho, uy = (f2 - f4 + f5 + f6 - f7 - f8) / rho;
      this.ux[c] = ux; this.uy[c] = uy;
      const usq = 1.5 * (ux * ux + uy * uy);
      let pxx = 0, pyy = 0, pxy = 0;
      const e = _e;
      for (let k = 0; k < 9; k++) {
        const cu = 3 * (EX[k] * ux + EY[k] * uy);
        e[k] = WT[k] * rho * (1 + cu + 0.5 * cu * cu - usq);
        const d = f[o + k] - e[k];
        pxx += EX[k] * EX[k] * d; pyy += EY[k] * EY[k] * d; pxy += EX[k] * EY[k] * d;
      }
      const Q = Math.sqrt(pxx * pxx + pyy * pyy + 2 * pxy * pxy);
      const tau = 0.5 * (tau0 + Math.sqrt(tau0 * tau0 + 18 * C2 * Q / rho));
      const om = 1 / tau;
      for (let k = 0; k < 9; k++) f[o + k] += om * (e[k] - f[o + k]);
    }
    // stream (pull), bounce back off solids, hold the free stream at the edges
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const c = j * N + i, o = c * 9;
      const edge = i < 2 || j < 2 || i > N - 3 || j > N - 3;
      if (edge) { for (let k = 0; k < 9; k++) g[o + k] = feq(k, 1, ux0, uy0); continue; }
      if (solid[c]) continue;
      for (let k = 0; k < 9; k++) {
        const s = (j - EY[k]) * N + (i - EX[k]);
        g[o + k] = solid[s] ? f[o + OPP[k]] : f[s * 9 + k];
      }
      // sponge near the edges soaks up reflections
      const m = Math.min(i, j, N - 1 - i, N - 1 - j);
      if (m < 14) { const w = (14 - m) / 14 * 0.12; for (let k = 0; k < 9; k++) g[o + k] += w * (feq(k, 1, ux0, uy0) - g[o + k]); }
    }
    this.f = g; this.g = f;
    this.steps++;
  }
  vel(x, z, out) {
    const fx = (x + HALF) / CS - 0.5, fz = (z + HALF) / CS - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 1 || j < 1 || i > N - 3 || j > N - 3) { out[0] = this.wx * U0; out[1] = this.wy * U0; out[2] = 0; return out; }
    const tx = fx - i, tz = fz - j, c = j * N + i;
    const ux = this.ux, uy = this.uy;
    out[0] = (ux[c] * (1 - tx) + ux[c + 1] * tx) * (1 - tz) + (ux[c + N] * (1 - tx) + ux[c + N + 1] * tx) * tz;
    out[1] = (uy[c] * (1 - tx) + uy[c + 1] * tx) * (1 - tz) + (uy[c + N] * (1 - tx) + uy[c + N + 1] * tx) * tz;
    out[2] = this.solid[c] | this.solid[c + 1] | this.solid[c + N] | this.solid[c + N + 1];
    return out;
  }
  update(dt) {
    if (!this.on) return false;
    const app = this.app;
    const key = app.city.stamp + '|' + app.env.windAngle.toFixed(3);
    if (key !== this.key) { this.key = key; this.reset(); }
    const nstep = this.steps < 400 ? 5 : 2;
    for (let s = 0; s < nstep; s++) this.step();
    // running mean of speed for the comfort figure
    if (this.steps % 12 === 0) {
      let open = 0, calm = 0, windy = 0;
      const m = this.mean;
      for (let c = 0; c < N * N; c++) {
        if (this.solid[c]) continue;
        const r = Math.hypot(this.ux[c], this.uy[c]) / U0;
        m[c] += (r - m[c]) * 0.08;
        const i = c % N, j = (c / N) | 0, x = (i + 0.5) * CS - HALF, z = (j + 0.5) * CS - HALF;
        if (x * x + z * z > 440 * 440) continue;
        open++; if (m[c] <= 1.12) calm++; if (m[c] > 1.4) windy++;
      }
      if (this.steps > 500) { const res = { calm: open ? calm / open : 1, windy: open ? windy / open : 0 }; const first = !this.result; this.result = res; if (first || this.steps % 240 === 0) app.emit('studyResult', 'wind'); }
    }
    // move the traces
    const v = _v, scale = (CS / 1) * 60 * Math.min(dt, 0.05) * 5.5;   // lattice units -> metres this frame, sped up to be readable
    const px = this.px, pz = this.pz, pos = this.pos, col = this.col;
    const rig = app.rig, wid = Math.max(0.3, (rig.mode === 'walk' ? 20 : rig.c.dist) * 0.0011);
    let q = 0, qc = 0;
    for (let p = 0; p < NP; p++) {
      const b = p * TRAIL;
      for (let k = TRAIL - 1; k > 0; k--) { px[b + k] = px[b + k - 1]; pz[b + k] = pz[b + k - 1]; }
      this.vel(px[b], pz[b], v);
      const sp = Math.hypot(v[0], v[1]) / U0;
      this.sp[p] += (sp - this.sp[p]) * 0.2;
      px[b] += v[0] * scale; pz[b] += v[1] * scale;
      this.life[p] -= dt;
      if (this.life[p] <= 0 || v[2] || Math.abs(px[b]) > HALF * 0.98 || Math.abs(pz[b]) > HALF * 0.98) this.spawn(p, false);
      const s = this.sp[p];
      // slow air cool and faint, fast air hot
      let r, g, bl, a;
      if (s < 0.6) { r = 0.45; g = 0.62; bl = 0.85; a = 0.18 + s * 0.3; }
      else if (s < 1.2) { const t = (s - 0.6) / 0.6; r = 0.45 + 0.5 * t; g = 0.62 + 0.33 * t; bl = 0.85 + 0.1 * t; a = 0.36 + 0.3 * t; }
      else { const t = Math.min(1, (s - 1.2) / 0.7); r = 0.95 + 0.05 * t; g = 0.95 - 0.6 * t; bl = 0.95 - 0.85 * t; a = 0.66 + 0.34 * t; }
      const fadeIn = Math.min(1, this.life[p] * 1.2);
      // each trace is a ribbon lying flat, tapering to its tail
      for (let k = 0; k < TRAIL - 1; k++) {
        const x0 = px[b + k], z0 = pz[b + k], x1 = px[b + k + 1], z1 = pz[b + k + 1];
        let dx = x0 - x1, dz = z0 - z1; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        const t0 = 1 - k / (TRAIL - 1), t1 = 1 - (k + 1) / (TRAIL - 1);
        const w0 = wid * (0.25 + 0.75 * t0), w1 = wid * (0.25 + 0.75 * t1), a0 = a * t0 * fadeIn, a1 = a * t1 * fadeIn;
        const ax = x0 - dz * w0, az = z0 + dx * w0, bx = x0 + dz * w0, bz = z0 - dx * w0, cx = x1 - dz * w1, cz = z1 + dx * w1, ex = x1 + dz * w1, ez = z1 - dx * w1;
        pos[q++] = ax; pos[q++] = 1.8; pos[q++] = az; pos[q++] = bx; pos[q++] = 1.8; pos[q++] = bz; pos[q++] = cx; pos[q++] = 1.8; pos[q++] = cz;
        pos[q++] = bx; pos[q++] = 1.8; pos[q++] = bz; pos[q++] = ex; pos[q++] = 1.8; pos[q++] = ez; pos[q++] = cx; pos[q++] = 1.8; pos[q++] = cz;
        for (let v6 = 0; v6 < 6; v6++) { col[qc++] = r; col[qc++] = g; col[qc++] = bl; col[qc++] = (v6 === 0 || v6 === 1 || v6 === 3) ? a0 : a1; }
      }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aCol.needsUpdate = true;
    return false;
  }
}
const _e = new Float32Array(9), _v = [0, 0, 0];
function feq(k, rho, ux, uy) { const cu = 3 * (EX[k] * ux + EY[k] * uy); return WT[k] * rho * (1 + cu + 0.5 * cu * cu - 1.5 * (ux * ux + uy * uy)); }
