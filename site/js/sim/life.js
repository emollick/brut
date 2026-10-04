// People and traffic. Residents leave one door and walk to another, going round buildings
// and water; cars run the roads. They are drawn over the settled image every frame.
import { Builder, BatchSet, M, ROLE, pen } from '../gfx/batch.js';
import { PRIM } from '../gfx/prims.js';
import { hexToLin, clamp, lerp } from '../util.js';
import { BUILD_R } from '../world/ground.js';

const COATS = [0x26282c, 0x3a3630, 0x54483a, 0x6b6257, 0x2f3b4a, 0x7a2a22, 0x8a7a55, 0x1f2a24, 0x9a958a, 0x44506a].map(h => pen(M.FIG, hexToLin(h)));
const SKIN = [0xc79a7a, 0x8a5a3c, 0xe0b99a, 0x5c3a28].map(h => pen(M.FIG, hexToLin(h)));
const CARS = [0xb58a2a, 0x8fa9bb, 0xd9d4c4, 0x2e4a3a, 0x9c2f24, 0x6f7276, 0xcbb894, 0x23262b, 0x3a5a8c].map(h => pen(M.CAR, hexToLin(h)));
const SHADOW = pen(M.SHADOW, [0, 0, 0]);
const HEAD = pen(M.LAMP, [1.0, 0.9, 0.65]), TAIL = pen(M.LAMP, [0.9, 0.06, 0.03]), GLASSY = pen(M.CAR, [0.02, 0.03, 0.035]);

// how busy the streets are through the day (0..1)
export function activity(h) {
  if (h < 5.5) return 0.03; if (h < 7) return lerp(0.03, 0.75, (h - 5.5) / 1.5); if (h < 9) return 1.0; if (h < 11) return lerp(1.0, 0.55, (h - 9) / 2);
  if (h < 16) return 0.55; if (h < 17.5) return lerp(0.55, 1.0, (h - 16) / 1.5); if (h < 19) return 1.0; if (h < 23) return lerp(1.0, 0.12, (h - 19) / 4);
  return lerp(0.12, 0.03, h - 23);
}
// share of windows lit, given that it is dark out
export function lightsOn(h) {
  if (h < 1) return lerp(0.2, 0.07, h); if (h < 5) return 0.05; if (h < 7.5) return lerp(0.05, 0.36, (h - 5) / 2.5);
  if (h < 16) return 0.3; if (h < 21.5) return lerp(0.42, 0.62, (h - 16) / 5.5); return lerp(0.62, 0.2, (h - 21.5) / 2.5);
}

export class Life {
  constructor(app) {
    this.app = app; this.on = true;
    const pipe = app.pipe;
    this.B = new Builder();
    this.set = new BatchSet('ovl'); this.set.castShadow = false;
    pipe.ovlScene.add(this.set.group);
    this.agents = []; this.cars = [];
    this.key = ''; this.doors = []; this.obst = []; this.roads = []; this.doorW = 0;
    this.lightT = 0;
    pipe.overlayHooks.push({
      active: () => this.on && (this.agents.length + this.cars.length) > 0 && pipe.lensCfg.id !== 2,
      draw: (r, cam, F, p) => { p._assign('fwd'); r.render(p.ovlScene, cam); },
    });
  }
  setOn(on) { this.on = on; if (!on) { this.agents.length = 0; this.cars.length = 0; } this.app.touch(); }
  survey() {
    const app = this.app, city = app.city, g = app.ground;
    this.obst = city.obstacles().map(o => [o[0], o[1], o[2] + 1.2, o[3] + 1.2, o[4]]);
    for (const s of g.shapes) if (s.k === 'water') {
      if (s.t === 'rect') this.obst.push([s.x, s.z, s.w / 2 + 0.8, s.d / 2 + 0.8, s.rot || 0]);
      else if (s.t === 'disc') this.obst.push([s.x, s.z, s.rx + 0.8, (s.rz || s.rx) + 0.8, s.rot || 0]);
    }
    this.doors = []; this.doorW = 0;
    const p = [0, 0];
    for (const b of city.list) {
      if (b.y > 1) continue;
      const st = b.stats, w = (st.pop || 0) + (st.jobs || 0) * 0.6 + (st.civic ? 260 : 0) + 12;
      for (const d of (st.doors || [])) {
        b.toWorld(d[0], d[1], p);
        if (this.inside(p[0], p[1])) continue;
        this.doors.push({ x: p[0], z: p[1], w: w / st.doors.length, home: (st.pop || 0) > 0, work: (st.jobs || 0) > 20, civic: !!st.civic });
        this.doorW += w / st.doors.length;
      }
    }
    this.roads = [];
    for (const s of g.shapes) if (s.t === 'line' && s.k === 'asphalt' && s.pts.length >= 4) {
      const pts = s.pts, cum = [0];
      for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
      const closed = Math.hypot(pts[0] - pts[pts.length - 2], pts[1] - pts[pts.length - 1]) < 12;
      this.roads.push({ pts, cum, len: cum[cum.length - 1], closed, w: s.w });
    }
    // too many cars for the road that is left? thin them
    const total = this.roads.reduce((a, r) => a + r.len, 0);
    this.carTarget = Math.round(total / 85);
    this.cars = this.cars.filter(c => c.road < this.roads.length);
    this.agents = this.agents.filter(a => !this.inside(a.x, a.z));
  }
  inside(x, z) {
    for (const o of this.obst) {
      const c = Math.cos(o[4]), s = Math.sin(o[4]), dx = x - o[0], dz = z - o[1];
      if (Math.abs(dx * c - dz * s) < o[2] - 1.0 && Math.abs(dx * s + dz * c) < o[3] - 1.0) return true;
    }
    return false;
  }
  // first obstacle a straight walk from a to b would hit
  blocked(ax, az, bx, bz, skip) {
    let best = null, bt = 1;
    for (const o of this.obst) {
      if (o === skip) continue;
      const c = Math.cos(o[4]), s = Math.sin(o[4]);
      const ox = (ax - o[0]) * c - (az - o[1]) * s, oz = (ax - o[0]) * s + (az - o[1]) * c;
      const dx = (bx - ax) * c - (bz - az) * s, dz = (bx - ax) * s + (bz - az) * c;
      let t0 = 0, t1 = 1, ok = true;
      for (const [p, d, h] of [[ox, dx, o[2]], [oz, dz, o[3]]]) {
        if (Math.abs(d) < 1e-9) { if (Math.abs(p) > h) { ok = false; break; } continue; }
        let a = (-h - p) / d, b = (h - p) / d; if (a > b) { const t = a; a = b; b = t; }
        if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < bt && t1 > 0.001) { bt = t0; best = o; }
    }
    return best;
  }
  route(ax, az, bx, bz, depth = 0, out = [ax, az]) {
    const o = depth < 9 ? this.blocked(ax, az, bx, bz) : null;
    if (!o) { out.push(bx, bz); return out; }
    const c = Math.cos(o[4]), s = Math.sin(o[4]), m = 1.6;
    let best = null, bl = 1e9;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const lx = sx * (o[2] + m), lz = sz * (o[3] + m);
      const cx = o[0] + lx * c + lz * s, cz = o[1] - lx * s + lz * c;
      if (this.blocked(ax, az, cx, cz) === o) continue;
      const l = Math.hypot(cx - ax, cz - az) + Math.hypot(bx - cx, bz - cz);
      if (l < bl) { bl = l; best = [cx, cz]; }
    }
    if (!best) { out.push(bx, bz); return out; }
    out.push(best[0], best[1]);
    return this.route(best[0], best[1], bx, bz, depth + 1, out);
  }
  pickDoor(pred) {
    if (!this.doors.length) return null;
    for (let tries = 0; tries < 8; tries++) {
      let r = Math.random() * this.doorW;
      for (const d of this.doors) { r -= d.w; if (r <= 0) { if (!pred || pred(d) || tries > 5) return d; break; } }
    }
    return this.doors[(Math.random() * this.doors.length) | 0];
  }
  spawnAgent(h) {
    const morning = h < 11, evening = h >= 16;
    const a = this.pickDoor(d => morning ? d.home : evening ? (d.work || d.civic) : true);
    let b = this.pickDoor(d => d !== a && (morning ? (d.work || d.civic) : evening ? d.home : true));
    if (!a || !b || a === b) return;
    let bx = b.x, bz = b.z;
    if (Math.random() < 0.16) { const ang = Math.random() * 6.283; bx = Math.cos(ang) * (BUILD_R + 60); bz = Math.sin(ang) * (BUILD_R + 60); }   // off to the rest of the city
    const path = this.route(a.x, a.z, bx, bz);
    const run = Math.random();
    this.agents.push({ path, seg: 0, t: 0, x: a.x, z: a.z, dx: 0, dz: 1, sp: 1.05 + run * 0.5 + (run > 0.95 ? 1.6 : 0), age: 0, done: 0,
      coat: COATS[(Math.random() * COATS.length) | 0], skin: SKIN[(Math.random() * SKIN.length) | 0], h: 0.9 + Math.random() * 0.2, off: (Math.random() - 0.5) * 1.6, ph: Math.random() * 6.3,
      child: Math.random() < 0.12 });
  }
  update(dt, hour) {
    const app = this.app, env = app.env;
    // window lights follow the clock whether or not anyone is on the street
    this.lightT -= dt;
    if (this.lightT <= 0) {
      this.lightT = 0.5;
      const base = env.night * lightsOn(hour);
      if (Math.abs(env.litFrac - base) > 0.004) { env.litFrac = base; app.touch(); }
      for (const b of app.city.list) {
        const u = b.dna.use || (b.stats.civic ? 'civic' : 'housing');
        const k = u === 'work' ? (hour > 7 && hour < 19.5 ? 1.35 : 0.1) : u === 'civic' ? (hour > 15 && hour < 23.5 ? 1.25 : 0.12) : 1;
        if (Math.abs(b.set.obj2.z - k) > 0.01) { b.set.obj2.z = k; app.touch(); }
      }
    }
    if (!this.on) return false;
    const key = app.city.stamp + '|' + app.ground.shapes.length + '|' + app.ground.site;
    if (key !== this.key) { this.key = key; this.survey(); }
    const tot = app.city.totals();
    const act = activity(hour) * (env.w.part === 1 ? 0.45 : env.w.part === 2 ? 0.6 : 1);
    const target = Math.round(clamp((tot.pop + tot.jobs * 0.5) / 9, this.doors.length > 1 ? 24 : 0, 520) * act);
    for (let i = 0; i < 4 && this.agents.length < target; i++) this.spawnAgent(hour);
    // cars
    const carT = Math.round((this.carTarget || 0) * (0.25 + 0.75 * act));
    while (this.cars.length < carT && this.roads.length) {
      const ri = (Math.random() * this.roads.length) | 0;
      this.cars.push({ road: ri, s: Math.random() * this.roads[ri].len, dir: Math.random() < 0.5 ? 1 : -1, sp: 9 + Math.random() * 6, col: CARS[(Math.random() * CARS.length) | 0], van: Math.random() < 0.15 });
    }
    if (this.cars.length > carT + 3) this.cars.length = carT;
    const B = this.B; B.begin();
    // sun shadows are faked as stretched blobs
    const sun = app.pipe.U.uSunDir.value, sh = Math.hypot(sun.x, sun.z) || 1;
    const sdx = -sun.x / sh, sdz = -sun.z / sh, slen = clamp(1 / Math.max(0.06, Math.tan(Math.asin(clamp(sun.y, 0.02, 1)))), 0.3, 9);
    const srot = Math.atan2(sdx, sdz);
    const kc = app.pipe.U.uSunCol.value, up = app.pipe.U.uAmb.value[2];
    const sunL = (kc.x + kc.y + kc.z) / 3 * Math.max(0.1, sun.y), ambL = (up.x + up.y + up.z) / 3;
    app.pipe.mats.ovl.fwd.uniforms.uOvl.value.x = clamp(sunL / (sunL + ambL * 1.4), 0, 1) * 0.62;
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const a = this.agents[i], p = a.path;
      a.age += dt;
      const x0 = p[a.seg * 2], z0 = p[a.seg * 2 + 1], x1 = p[a.seg * 2 + 2], z1 = p[a.seg * 2 + 3];
      const len = Math.hypot(x1 - x0, z1 - z0) || 0.01;
      a.t += a.sp * dt / len;
      if (a.t >= 1) { a.seg++; a.t = 0; if (a.seg * 2 + 3 >= p.length) { a.done += dt * 3; if (a.done >= 0.9) { this.agents.splice(i, 1); continue; } a.seg--; a.t = 1; } }
      const ddx = (x1 - x0) / len, ddz = (z1 - z0) / len;
      a.dx += (ddx - a.dx) * Math.min(1, dt * 6); a.dz += (ddz - a.dz) * Math.min(1, dt * 6);
      a.x = x0 + (x1 - x0) * a.t - ddz * a.off; a.z = z0 + (z1 - z0) * a.t + ddx * a.off;
      const k = Math.min(1, a.age * 2) * (1 - Math.min(1, a.done)), hgt = (a.child ? 0.68 : 1) * a.h * k;
      if (k < 0.02) continue;
      const bob = Math.abs(Math.sin(a.age * a.sp * 3.4 + a.ph)) * 0.035;
      const rot = Math.atan2(a.dx, a.dz);
      B.box(a.x + sdx * slen * hgt * 0.85, 0.03, a.z + sdz * slen * hgt * 0.85, 0.55 * hgt, 0.02, slen * hgt * 1.9 + 0.5, SHADOW, srot);
      B.put(PRIM.CYL, a.x, 0.72 * hgt + bob, a.z, 0.42 * hgt, 1.36 * hgt, 0.3 * hgt, a.coat, rot, 0.62);
      B.put(PRIM.BLOB, a.x, 1.56 * hgt + bob, a.z, 0.25 * hgt, 0.27 * hgt, 0.25 * hgt, a.skin, 0);
    }
    const night = env.night;
    for (const c of this.cars) {
      const rd = this.roads[c.road]; if (!rd) continue;
      c.s += c.sp * dt * c.dir;
      if (c.s > rd.len) { if (rd.closed) c.s -= rd.len; else { c.s = rd.len; c.dir = -1; } }
      if (c.s < 0) { if (rd.closed) c.s += rd.len; else { c.s = 0; c.dir = 1; } }
      let i = 1; while (i < rd.cum.length - 1 && rd.cum[i] < c.s) i++;
      const t = (c.s - rd.cum[i - 1]) / Math.max(0.01, rd.cum[i] - rd.cum[i - 1]);
      const x0 = rd.pts[i * 2 - 2], z0 = rd.pts[i * 2 - 1], x1 = rd.pts[i * 2], z1 = rd.pts[i * 2 + 1];
      const l = Math.hypot(x1 - x0, z1 - z0) || 1, dx = (x1 - x0) / l * c.dir, dz = (z1 - z0) / l * c.dir;
      const lane = Math.min(2.1, rd.w * 0.23);
      const x = x0 + (x1 - x0) * t - dz * lane, z = z0 + (z1 - z0) * t + dx * lane;
      const rot = Math.atan2(dx, dz), L = c.van ? 5.2 : 4.2, Hc = c.van ? 1.25 : 0.62;
      B.box(x + sdx * slen * 0.7, 0.03, z + sdz * slen * 0.7, 2.6, 0.02, L + slen * 1.3, SHADOW, srot);
      B.box(x, 0.3 + Hc / 2 + 0.12, z, 1.75, Hc + 0.25, L, c.col, rot);
      if (!c.van) B.box(x - dx * 0.25, 0.3 + Hc + 0.5, z - dz * 0.25, 1.55, 0.52, L * 0.5, GLASSY, rot);
      if (night > 0.3) {
        B.box(x + dx * (L / 2 + 0.02) - dz * 0.6, 0.62, z + dz * (L / 2 + 0.02) + dx * 0.6, 0.3, 0.16, 0.06, HEAD, rot);
        B.box(x + dx * (L / 2 + 0.02) + dz * 0.6, 0.62, z + dz * (L / 2 + 0.02) - dx * 0.6, 0.3, 0.16, 0.06, HEAD, rot);
        B.box(x - dx * (L / 2 + 0.02), 0.7, z - dz * (L / 2 + 0.02), 1.5, 0.12, 0.06, TAIL, rot);
      }
    }
    this.set.sync(B, app.pipe);
    return false;
  }
}
