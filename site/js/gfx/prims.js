// Unit primitives. Every solid in the city is an instance of one of these,
// placed by a 4x4 matrix. All are centred on the origin and fit the unit cube.
// Attributes: position, normal, aSurf (u around, unused, mode) where mode 1
// marks a cylindrical side whose texture runs around the circumference.
import * as THREE from 'three';

export const PRIM = { BOX: 0, CYL: 1, WEDGE: 2, SPH: 3, VAULT: 4, TUBE: 5, BLOB: 6 };
export const PRIM_COUNT = 7;

class GB {
  constructor() { this.p = []; this.n = []; this.s = []; this.i = []; }
  v(p, n, s = [0, 0, 0]) {
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    this.p.push(p[0], p[1], p[2]);
    this.n.push(n[0] / l, n[1] / l, n[2] / l);
    this.s.push(s[0], s[1], s[2]);
    return this.p.length / 3 - 1;
  }
  // Winding is fixed up against the vertex normals, so callers never have to think about it.
  tri(a, b, c) {
    const P = this.p, N = this.n;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az;
    const e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az;
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    const nx = N[a * 3] + N[b * 3] + N[c * 3], ny = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], nz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (cx * cx + cy * cy + cz * cz < 1e-14) return;
    if (cx * nx + cy * ny + cz * nz < 0) this.i.push(a, c, b); else this.i.push(a, b, c);
  }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  face(loop, n) { // flat polygon, fan-triangulated
    const ids = loop.map(p => this.v(p, n));
    for (let k = 1; k < ids.length - 1; k++) this.tri(ids[0], ids[k], ids[k + 1]);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.s, 3));
    g.setIndex(this.i);
    return g;
  }
}

function box() {
  const g = new GB(), h = 0.5;
  g.face([[h, -h, -h], [h, h, -h], [h, h, h], [h, -h, h]], [1, 0, 0]);
  g.face([[-h, -h, -h], [-h, h, -h], [-h, h, h], [-h, -h, h]], [-1, 0, 0]);
  g.face([[-h, h, -h], [h, h, -h], [h, h, h], [-h, h, h]], [0, 1, 0]);
  g.face([[-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h]], [0, -1, 0]);
  g.face([[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]], [0, 0, 1]);
  g.face([[-h, -h, -h], [h, -h, -h], [h, h, -h], [-h, h, -h]], [0, 0, -1]);
  return g.build();
}

function cyl(N = 24) {
  const g = new GB(), h = 0.5;
  const bot = [], top = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    bot.push(g.v([c * h, -h, s * h], [c, 0, s], [i / N, 0, 1]));
    top.push(g.v([c * h, h, s * h], [c, 0, s], [i / N, 0, 1]));
  }
  for (let i = 0; i < N; i++) g.quad(bot[i], bot[i + 1], top[i + 1], top[i]);
  for (const y of [h, -h]) {
    const n = [0, Math.sign(y), 0];
    const c0 = g.v([0, y, 0], n);
    const ring = [];
    for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; ring.push(g.v([Math.cos(a) * h, y, Math.sin(a) * h], n)); }
    for (let i = 0; i < N; i++) g.tri(c0, ring[i], ring[i + 1]);
  }
  return g.build();
}

function wedge() { // right triangular prism: full height at z=-0.5, falling to nothing at z=+0.5
  const g = new GB(), h = 0.5;
  const A = [-h, -h, -h], B = [h, -h, -h], C = [h, -h, h], D = [-h, -h, h], E = [-h, h, -h], F = [h, h, -h];
  g.face([A, B, C, D], [0, -1, 0]);
  g.face([B, A, E, F], [0, 0, -1]);
  g.face([D, C, F, E], [0, 1, 1]);
  g.face([A, D, E], [-1, 0, 0]);
  g.face([B, F, C], [1, 0, 0]);
  return g.build();
}

function sphere(W = 20, H = 12) {
  const g = new GB();
  const rows = [];
  for (let j = 0; j <= H; j++) {
    const th = (j / H) * Math.PI, row = [];
    for (let i = 0; i <= W; i++) {
      const ph = (i / W) * Math.PI * 2;
      const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      row.push(g.v([n[0] * 0.5, n[1] * 0.5, n[2] * 0.5], n));
    }
    rows.push(row);
  }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) g.quad(rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]);
  return g.build();
}

function vault(N = 14) { // half-elliptic barrel along X, flat base at y=-0.5, crown at y=+0.5
  const g = new GB(), h = 0.5;
  const L = [], R = [];
  for (let j = 0; j <= N; j++) {
    const th = (j / N) * Math.PI, z = h * Math.cos(th), y = -h + Math.sin(th);
    const n = [0, Math.sin(th), 2 * Math.cos(th)];
    L.push(g.v([-h, y, z], n)); R.push(g.v([h, y, z], n));
  }
  for (let j = 0; j < N; j++) g.quad(L[j], R[j], R[j + 1], L[j + 1]);
  g.face([[-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h]], [0, -1, 0]);
  for (const x of [-h, h]) {
    const n = [Math.sign(x), 0, 0];
    const c0 = g.v([x, -h, 0], n), ring = [];
    for (let j = 0; j <= N; j++) { const th = (j / N) * Math.PI; ring.push(g.v([x, -h + Math.sin(th), h * Math.cos(th)], n)); }
    for (let j = 0; j < N; j++) g.tri(c0, ring[j], ring[j + 1]);
  }
  return g.build();
}

export const TUBE_K = 0.8; // inner / outer radius of the ring primitive
function tube(N = 28) {
  const g = new GB(), h = 0.5, k = TUBE_K;
  const ob = [], ot = [], ib = [], it = [], tb = [[], []], bb = [[], []];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    ob.push(g.v([c * h, -h, s * h], [c, 0, s], [i / N, 0, 1])); ot.push(g.v([c * h, h, s * h], [c, 0, s], [i / N, 0, 1]));
    ib.push(g.v([c * h * k, -h, s * h * k], [-c, 0, -s], [i / N, 0, 1])); it.push(g.v([c * h * k, h, s * h * k], [-c, 0, -s], [i / N, 0, 1]));
    tb[0].push(g.v([c * h, h, s * h], [0, 1, 0])); tb[1].push(g.v([c * h * k, h, s * h * k], [0, 1, 0]));
    bb[0].push(g.v([c * h, -h, s * h], [0, -1, 0])); bb[1].push(g.v([c * h * k, -h, s * h * k], [0, -1, 0]));
  }
  for (let i = 0; i < N; i++) {
    g.quad(ob[i], ob[i + 1], ot[i + 1], ot[i]);
    g.quad(ib[i], ib[i + 1], it[i + 1], it[i]);
    g.quad(tb[0][i], tb[0][i + 1], tb[1][i + 1], tb[1][i]);
    g.quad(bb[0][i], bb[0][i + 1], bb[1][i + 1], bb[1][i]);
  }
  return g.build();
}

let cache = null;
export function prims() {
  if (!cache) cache = [box(), cyl(), wedge(), sphere(), vault(), tube(), sphere(12, 8)];
  return cache;
}
