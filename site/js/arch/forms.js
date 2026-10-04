// The other families: stacked modules, plug-in capsules, drums, megastructures, halls,
// monuments, engineering works and raised decks.
import { PRIM } from '../gfx/prims.js';
import { pens, tree, clamp, lerp, M, ROLE, pen } from './common.js';
import { genBar } from './bar.js';
import { hash2 } from '../util.js';

const PI = Math.PI, TAU = PI * 2;

// ------------------------------------------------------------------ cluster
export function genCluster(B, d, R) {
  const P = pens(d);
  const { mW, mL, mH, nx, nz, levels, lift } = d;
  const sz = 0.5 * clamp(d.shift, 0, 1);
  const Xmax = nx * mW * 0.5, Zmax = nz * mL * 0.5;
  const placed = [];           // per level: list of {x,z}
  let count = 0, top = 0;
  const overlap = (a, b) => Math.max(0, mW - Math.abs(a.x - b.x)) * Math.max(0, mL - Math.abs(a.z - b.z)) / (mW * mL);
  for (let l = 0; l < levels; l++) {
    const row = [];
    const ox = ((l >> 1) & 1) * sz * mW, oz = (l & 1) * sz * mL;
    for (let i = -1; i <= nx; i++) for (let k = -1; k <= nz; k++) {
      const x = (i - (nx - 1) / 2) * mW + ox, z = (k - (nz - 1) / 2) * mL + oz;
      if (Math.abs(x) > Xmax + 0.01 || Math.abs(z) > Zmax + 0.01) continue;
      const dist = Math.max(Math.abs(z) / (Zmax + 0.01), 0.65 * Math.abs(x) / (Xmax + 0.01));
      const env = levels * (1 - d.slope * Math.pow(dist, 1.15)) + (hash2(i * 3 + d.seed, k * 5) - 0.5) * 2.2 * d.slope;
      if (l >= env) continue;
      if (hash2(i + l * 17 + d.seed * 3, k + l * 31) > d.fill + (l === 0 ? 0.25 : 0) + (env - l > 3 ? 0.12 : 0)) continue;
      const m = { x, z };
      if (l > 0) {
        let sup = 0; for (const b of placed[l - 1]) sup += overlap(m, b);
        if (sup < 0.3) continue;
      }
      row.push(m);
    }
    placed.push(row);
  }
  const t = 0.22, dp = clamp(d.fdepth, 0.2, 2);
  for (let l = 0; l < levels; l++) {
    const y0 = lift + l * mH;
    for (const m of placed[l]) {
      count++; top = Math.max(top, y0 + mH);
      B.box(m.x, y0 + t / 2, m.z, mW - 0.04, t, mL - 0.04, P.S);
      B.box(m.x, y0 + mH - t / 2 - 0.02, m.z, mW - 0.04, t, mL - 0.04, P.S);
      B.box(m.x - mW / 2 + t / 2 + 0.02, y0 + mH / 2 - 0.01, m.z, t, mH - 2 * t - 0.02, mL - 0.04, P.S);
      B.box(m.x + mW / 2 - t / 2 - 0.02, y0 + mH / 2 - 0.01, m.z, t, mH - 2 * t - 0.02, mL - 0.04, P.S);
      for (const s of [-1, 1]) {
        const zz = m.z + s * (mL / 2 - dp);
        const wi = (mW - 2 * t) * lerp(0.15, 0.6, d.solid);
        B.box(m.x + (mW / 2 - t - wi / 2 - 0.02) * (s > 0 ? -1 : 1), y0 + mH / 2, zz, wi, mH - 2 * t - 0.04, 0.16, (d.accentAt === 'panels' && P.acc(count)) || P.I);
        B.box(m.x + (wi / 2) * (s > 0 ? 1 : -1), y0 + mH / 2, zz - s * 0.03, mW - 2 * t - wi - 0.04, mH - 2 * t - 0.04, 0.06, P.G);
        const a = P.acc(count + (s > 0 ? 1 : 0));
        if (a && d.accentAt === 'reveals') B.box(m.x - mW / 2 + t + 0.035, y0 + mH / 2, m.z + s * (mL / 2 - dp / 2), 0.03, mH - 2 * t - 0.06, dp - 0.1, a);
      }
      // is the roof open to the sky?
      let cover = 0;
      if (l + 1 < levels) for (const b of placed[l + 1]) cover += overlap(m, b);
      if (cover < 0.72) {
        const yT = y0 + mH - 0.02, hp = 0.95, tp = 0.14;
        B.boxB(m.x, yT, m.z + mL / 2 - tp / 2 - 0.03, mW - 0.1, hp, tp, P.I); B.boxB(m.x, yT, m.z - mL / 2 + tp / 2 + 0.03, mW - 0.1, hp, tp, P.I);
        B.boxB(m.x + mW / 2 - tp / 2 - 0.03, yT, m.z, tp, hp, mL - 0.4, P.I); B.boxB(m.x - mW / 2 + tp / 2 + 0.03, yT, m.z, tp, hp, mL - 0.4, P.I);
        if (cover < 0.4 && R.chance(d.planting)) {
          const n = 1 + R.int(0, 2);
          for (let q = 0; q < n; q++) { const s = 0.9 + R() * 1.2; B.blob(m.x + (R() - 0.5) * (mW - 1.4), yT + 0.5, m.z + (R() - 0.5) * (mL - 1.6), s * 1.3, s, s * 1.3, P.plant); }
          if (R.chance(d.planting * 0.4)) tree(B, P, m.x + (R() - 0.5) * 2, yT, m.z + (R() - 0.5) * 3, 2.6 + R() * 2, 'round', R);
        }
      }
      if (l === 0 && lift > 0.4) { B.boxB(m.x - mW * 0.3, 0, m.z, 0.3, lift, mL * 0.55, P.S); B.boxB(m.x + mW * 0.3, 0, m.z, 0.3, lift, mL * 0.55, P.S); }
    }
  }
  // lift and stair towers through the heap
  const nc = Math.max(1, Math.round(nx / 4));
  for (let c = 0; c < nc; c++) {
    const x = ((c + 0.5) / nc - 0.5) * nx * mW;
    let h = 0;
    for (let l = 0; l < levels; l++) for (const m of placed[l]) if (Math.abs(m.x - x) < mW * 1.6 && Math.abs(m.z) < mL * 0.9) h = Math.max(h, lift + (l + 1) * mH);
    if (h > 0) { B.boxB(x, 0, 0, 3.4, h + 3.2, 3.4, P.C); top = Math.max(top, h + 3.2); }
  }
  B.mass(0, top / 2, 0, nx * mW, top, nz * mL);
  const gfa = count * mW * mL;
  B.stats = { gfa, floors: levels, height: top, dwellings: d.use === 'housing' ? Math.round(gfa / 75) : 0, pop: d.use === 'housing' ? Math.round(gfa / 75 * 2.6) : 0, jobs: d.use !== 'housing' ? Math.round(gfa / 20) : 0,
    foot: { w: nx * mW + 2, d: nz * mL + 2, cx: 0, cz: 0 }, doors: [[0, -Zmax - 3], [0, Zmax + 3]], ext: { H: top } };
}

// ------------------------------------------------------------------ capsules
export function genCapsule(B, d, R) {
  const P = pens(d);
  const cs = 5.4, fh = d.floorH, lift = d.lift;
  const capPen = pen(M.PAINT, [0.74, 0.73, 0.69], 0, ROLE.INFILL);
  const spacing = cs + d.capL * 1.5 + 1.2;
  let count = 0, top = 0;
  const per = Math.ceil(d.capsN / 4);
  for (let c = 0; c < d.cores; c++) {
    const cx = (c - (d.cores - 1) / 2) * spacing, cz = (c & 1) ? 1.6 : -1.6;
    const nf = Math.max(2, d.floors - (c & 1) * 2 - (c > 1 ? 1 : 0));
    const H = lift + nf * fh;
    B.boxB(cx, 0, cz, cs, H + d.coreH, cs, P.C);
    B.boxB(cx, H + d.coreH, cz, cs + 0.8, 1.6, cs + 0.8, P.C);
    top = Math.max(top, H + d.coreH + 1.6);
    B.mass(cx, (H + d.coreH) / 2, cz, cs + d.capL * 2, H + d.coreH, cs + d.capL * 2);
    if (d.top === 'mast') { B.cylB(cx, H + d.coreH + 1.6, cz, 0.9, 9, 0.9, P.metal, 0, 0.25); top = Math.max(top, H + d.coreH + 10.6); }
    if (d.top === 'disc') { B.cylB(cx, H + d.coreH + 1.6, cz, cs * 2.6, 2.4, cs * 2.6, P.S); B.cylB(cx, H + d.coreH + 2.2, cz, cs * 2.62, 1.1, cs * 2.62, P.G); top = Math.max(top, H + d.coreH + 4); }
    for (let f = 0; f < nf; f++) {
      for (let j = 0; j < d.capsN; j++) {
        if (hash2(c * 131 + f * 7 + d.seed, j * 13 + f) > d.fill) continue;
        const face = j % 4, slot = Math.floor(j / 4);
        const ang = face * PI / 2;
        const pin = per === 1 ? ((f & 1) ? 1 : -1) * (cs * 0.5 - d.capW * 0.5) * 0.9 : 0;
        const lat = ((slot + 0.5) / per - 0.5) * Math.max(0, cs - d.capW) * (per > 1 ? 1.9 : 0) + pin;
        const out = cs / 2 + d.capL / 2 + 0.12 + (hash2(f + c * 9, j) - 0.5) * 0.3;
        const y = lift + f * fh + ((face & 1) ? fh * 0.5 : 0) + (fh - 0.22) / 2;
        if (y + fh / 2 > H + d.coreH) continue;
        // outward (sin a, cos a); lateral (cos a, -sin a)
        const sa = Math.sin(ang), ca = Math.cos(ang);
        const px = cx + sa * out + ca * lat, pz = cz + ca * out - sa * lat;
        const a = d.accentAt === 'panels' ? P.acc(c * 7 + f * 3 + j) : null;
        B.box(px, y, pz, d.capW, fh - 0.22, d.capL, (a && hash2(f * 3 + j, c + d.seed) < 0.3) ? a : capPen, ang);
        const wx = cx + sa * (out + d.capL / 2 + 0.03) + ca * lat, wz = cz + ca * (out + d.capL / 2 + 0.03) - sa * lat;
        const wd = Math.min(1.35, d.capW * 0.5, fh * 0.5);
        B.putE(PRIM.TUBE, wx, y, wz, wd * 1.3, 0.12, wd * 1.3, PI / 2, ang, 0, capPen);
        B.putE(PRIM.CYL, wx, y, wz, wd * 1.06, 0.06, wd * 1.06, PI / 2, ang, 0, P.G);
        count++;
      }
    }
    if (c > 0) {      // bridges back to the previous core
      const px = (c - 1 - (d.cores - 1) / 2) * spacing;
      for (let f = 2; f < Math.min(nf, d.floors - 2); f += 3) B.box((cx + px) / 2, lift + f * fh + 1.2, 0, spacing - cs + 0.4, 2.3, 1.9, P.C);
    }
  }
  if (lift > 2) {
    const pw = spacing * (d.cores - 1) + cs + d.capL * 1.6, ph = Math.min(lift - 0.3, 5.2);
    B.boxB(0, 0, 0, pw, ph, cs + d.capL * 1.4, P.S);
    B.box(0, ph * 0.5, (cs + d.capL * 1.4) / 2 + 0.012, pw - 2, ph * 0.55, 0.03, P.G);
    B.box(0, ph * 0.5, -(cs + d.capL * 1.4) / 2 - 0.012, pw - 2, ph * 0.55, 0.03, P.G);
    B.mass(0, ph / 2, 0, pw, ph, cs + d.capL * 1.4);
  }
  const w = spacing * (d.cores - 1) + cs + d.capL * 2 + 1;
  B.stats = { gfa: count * d.capW * d.capL + d.cores * cs * cs * d.floors * 0.3, floors: d.floors, height: top, dwellings: d.use === 'housing' ? count : 0, pop: d.use === 'housing' ? Math.round(count * 1.2) : 0, jobs: d.use !== 'housing' ? count : 0,
    foot: { w, d: cs + d.capL * 2 + 4, cx: 0, cz: 0 }, doors: [[0, -(cs / 2 + d.capL + 3)], [0, cs / 2 + d.capL + 3]], ext: { H: top } };
}

// --------------------------------------------------------------------- drum
export function genDrum(B, d, R) {
  const P = pens(d);
  const n = d.floors, fh = d.floorH, lift = d.lift, H = n * fh, r0 = d.radius;
  const rAt = (f) => r0 * (1 + d.swell * Math.pow(n > 1 ? f / n : 0, 1.6));
  const hb = 0.4 + d.solid * 0.85;
  let gfa = 0;
  const radial = (prim, a, rad, y, sx, sy, sz, pn, taper) => B.put(prim, Math.cos(a) * rad, y, Math.sin(a) * rad, sx, sy, sz, pn, PI / 2 - a, taper);
  const coreD = Math.max(3.2, r0 * 0.34);
  B.cylB(0, 0, 0, coreD, lift + H + 2.4 + d.coreH, coreD, P.C);
  for (let f = 0; f < n; f++) {
    const y = lift + f * fh, r = rAt(f), r1 = rAt(f + 1);
    gfa += PI * r * r;
    if (d.ring === 'blank') {
      B.cylB(0, y, 0, r * 2, fh, r * 2, P.S, 0, r1 / r);
      if (f % 2 === 0) for (let q = 0; q < 6; q++) { const a = q / 6 * TAU + f * 0.4; radial(PRIM.BOX, a, r + 0.02, y + fh * 0.5, 0.5, fh * 0.7, 0.05, P.G); }
      continue;
    }
    B.cylB(0, y - 0.25, 0, r * 2, 0.25 + (d.ring === 'bands' ? hb : 0.08), r * 2, P.S, 0, 1);
    const gy = y + (d.ring === 'bands' ? hb : 0.08), gh = fh - 0.25 - (d.ring === 'bands' ? hb : 0.08);
    B.cylB(0, gy, 0, (r - 0.35) * 2, gh, (r - 0.35) * 2, P.G, 0, (r1 - 0.35) / (r - 0.35));
    if (d.petals > 0 && d.ring !== 'fins') {
      const rp = PI * r / d.petals * 1.12, off = (d.rhythm === 'alt' || (f & 1)) ? 0.5 : 0;
      for (let j = 0; j < d.petals; j++) {
        const a = (j + off * 0) / d.petals * TAU;
        radial(PRIM.CYL, a, r - 0.2, y - 0.25 + (0.25 + hb) / 2, rp * 2, 0.25 + hb, clamp(d.fdepth, 0.4, 4) * 2, (d.accentAt === 'panels' && P.acc(j + f)) || P.I);
        if (R.chance(d.planting * 0.4)) radial(PRIM.BLOB, a, r - 0.2 + d.fdepth * 0.6, y + hb + 0.2, 1.2, 0.8, 0.9, P.plant);
      }
    }
  }
  B.cylB(0, lift + H - 0.25, 0, rAt(n) * 2, 0.4, rAt(n) * 2, P.S);
  if (d.ring === 'fins') {
    const nf = Math.max(8, Math.round(TAU * r0 / 4.2) * d.finN), tp = rAt(n) / r0;
    for (let j = 0; j < nf; j++) {
      const a = j / nf * TAU;
      // fins follow the flare by leaning outward
      const ro = rAt(n) + d.fdepth / 2, ri = r0 + d.fdepth / 2;
      B.strut(PRIM.BOX, Math.cos(a) * ri, lift - 0.25, Math.sin(a) * ri, Math.cos(a) * ro, lift + H + 0.6, Math.sin(a) * ro, d.fdepth, 0.22, P.S);
    }
  }
  // undercroft
  if (lift > 0.4) {
    if (d.supports !== 'none') {
      const ns = Math.max(6, Math.round(TAU * r0 / 7));
      for (let j = 0; j < ns; j++) {
        const a = (j + 0.5) / ns * TAU;
        if (d.supports === 'blades' || d.supports === 'piers') radial(PRIM.BOX, a, r0 * 0.72, (lift - 0.25) / 2, 0.4, lift - 0.25, r0 * 0.36, P.S, d.supports === 'piers' ? 1.6 : 1);
        else if (d.supports === 'vlegs') B.strut(PRIM.BOX, Math.cos(a) * r0 * 0.45, 0, Math.sin(a) * r0 * 0.45, Math.cos(a) * r0 * 0.88, lift - 0.25, Math.sin(a) * r0 * 0.88, 0.6, 0.8, P.S);
        else radial(PRIM.CYL, a, r0 * 0.84, (lift - 0.25) / 2, 0.75, lift - 0.25, 0.75, P.S);
      }
    }
    if (d.top === 'saucer' || d.supports === 'none') {       // the underside of the dish
      const hh = Math.min(lift * 0.4, r0 * 0.45);
      B.cylB(0, lift - 0.25 - hh, 0, r0 * 0.9, hh, r0 * 0.9, P.S, 0, 1 / 0.45);
    }
  }
  const yR = lift + H + 0.15, rT = rAt(n);
  let top = yR + 2.4 + d.coreH;
  switch (d.top) {
    case 'disc': {
      const ns = 10; for (let j = 0; j < ns; j++) radial(PRIM.BOX, j / ns * TAU, rT * 0.7, yR + 1.4, 0.4, 2.8, 1.2, P.S);
      B.cylB(0, yR + 2.8, 0, rT * 2.5, 0.7, rT * 2.5, P.S); B.cylB(0, yR, 0, rT * 1.36, 2.8, rT * 1.36, P.G);
      top = Math.max(top, yR + 3.5); break;
    }
    case 'saucer': B.sph(0, yR, 0, rT * 2, rT * 0.7, rT * 2, P.T); top = Math.max(top, yR + rT * 0.35); break;
    case 'dome': B.sph(0, yR, 0, rT * 1.96, rT * 1.5, rT * 1.96, P.T); top = Math.max(top, yR + rT * 0.75); break;
    case 'crownring': {
      const ns = Math.max(12, Math.round(TAU * rT / 2.6));
      for (let j = 0; j < ns; j++) radial(PRIM.BOX, j / ns * TAU, rT - 0.9, yR + 2.2, 0.3, 4.4, 1.7, P.S, 0.55);
      top = Math.max(top, yR + 4.4); break;
    }
    case 'mast': B.cylB(0, yR + 2.4 + d.coreH, 0, 1.4, r0 * 2.6, 1.4, P.metal, 0, 0.15); top += r0 * 2.6; break;
    default: break;
  }
  const rm = Math.max(r0, rT) + (d.petals > 0 ? d.fdepth : 0) + (d.ring === 'fins' ? d.fdepth : 0);
  B.mass(0, (lift + H) / 2 + lift / 2 * 0, 0, rm * 1.8, lift + H, rm * 1.8);
  B.stats = { gfa, floors: n, height: top, dwellings: d.use === 'housing' ? Math.round(gfa * 0.8 / 80) : 0, pop: d.use === 'housing' ? Math.round(gfa * 0.8 / 80 * 2.4) : 0, jobs: d.use === 'work' ? Math.round(gfa / 20) : d.use === 'civic' ? Math.round(gfa / 60) : 0,
    foot: { w: rm * 2 + 2, d: rm * 2 + 2, cx: 0, cz: 0, round: 1 }, doors: [[0, -rm - 3], [rm + 3, 0]], ext: { H: lift + H, lift, r: r0, fh }, civic: d.use === 'civic' };
}

// ------------------------------------------------------------- megastructure
export function genMega(B, d, R) {
  const P = pens(d);
  const s = d.span / 2, fh = d.floorH, bh = d.barF * fh;
  const sub = { ...d, type: 'slab', floors: d.barF, lift: 0, depth: d.depth, stepF: 0, stepB: 0, stepE: 0, tier: 1, profile: 'linear', supports: 'none', core: 'none', coreH: 0, bridgeN: 3,
    back: d.front, ends: 'ribbon', supEvery: 2, crown: 'none' };
  sub.bays = Math.max(2, Math.round(d.barL / 6.5)); sub.bayW = d.barL / sub.bays;
  let gfa = 0, top = 0;
  const used = [[0, 0], [0, 0]];
  for (let b = 0; b < d.bars; b++) {
    const dir = b & 1, side = ((b >> 1) & 1) ? 1 : -1;
    const y = d.lift + b * (bh + d.gap);
    const slide = (hash2(b + d.seed, 3) - 0.5) * (d.barL - d.span) * 0.5;
    if (dir === 0) B.pushBase(slide, y, side * s, 0); else B.pushBase(side * s, y, slide, PI / 2);
    genBar(B, { ...sub, crown: b === d.bars - 1 ? d.crown : (d.gap > 2 ? 'parapet' : 'none'), seed: d.seed + b }, R);
    B.popBase();
    gfa += B.stats.gfa; top = Math.max(top, y + bh);
    for (const e of [-1, 1]) { const ix = dir === 0 ? (e > 0 ? 1 : 0) : (side > 0 ? 1 : 0), iz = dir === 0 ? (side > 0 ? 1 : 0) : (e > 0 ? 1 : 0); used[ix][iz] = Math.max(used[ix][iz], y + bh); }
  }
  const cw = Math.min(8, d.depth * 0.6);
  for (let ix = 0; ix < 2; ix++) for (let iz = 0; iz < 2; iz++) {
    const h = used[ix][iz]; if (h <= 0) continue;
    const x = (ix ? 1 : -1) * s, z = (iz ? 1 : -1) * s, ht = h + 2.4 + d.coreH;
    B.boxB(x, 0, z, cw, ht, cw, P.C);
    B.box(x, ht / 2 + 1, z + cw / 2 + 0.012, 0.55, ht - 6, 0.03, P.G); B.box(x + cw / 2 + 0.012, ht / 2 + 1, z, 0.03, ht - 6, 0.55, P.G);
    B.boxB(x, ht, z, cw + 0.8, 1.8, cw + 0.8, P.C);
    B.mass(x, ht / 2, z, cw, ht, cw);
    top = Math.max(top, ht + 1.8);
  }
  const ext = d.barL + d.depth;
  B.stats = { gfa, floors: d.bars * d.barF, height: top, dwellings: d.use === 'housing' ? Math.round(gfa * 0.8 / 78) : 0, pop: d.use === 'housing' ? Math.round(gfa * 0.8 / 78 * 2.4) : 0, jobs: d.use === 'work' ? Math.round(gfa * 0.78 / 18) : 0,
    foot: { w: ext * 0.8, d: ext * 0.8, cx: 0, cz: 0, light: 1 }, doors: [[-s, -s - 6], [s, s + 6]], ext: { H: top, lift: d.lift } };
}

// --------------------------------------------------------------------- hall
export function genHall(B, d, R) {
  const P = pens(d);
  const w = d.width, l = d.length, h = d.height, y0 = d.plinth;
  if (y0 > 0.1) {
    B.boxB(0, 0, 0, w + 9, y0, l + 9, P.S);
    const ns = Math.max(2, Math.ceil(y0 / 0.34)), sw = Math.min(w * 0.62, 40);
    for (let i = 0; i < ns; i++) B.boxB(0, 0, l / 2 + 4.5 + (ns - i - 0.5) * 0.62, sw, (i + 1) * y0 / ns, 0.62, P.S);
    for (const s of [-1, 1]) B.boxB(s * (sw / 2 + 0.8), 0, l / 2 + 4.5 + ns * 0.31, 1.6, y0 + 0.9, ns * 0.62, P.S);
  }
  B.mass(0, (y0 + h) / 2, 0, w, y0 + h, l);
  const glazed = d.walls === 'glazed' || d.walls === 'fins';
  if (glazed) {
    B.boxB(0, y0, 0, w - 1.4, h - 1.0, l - 1.4, P.G);
    B.boxB(0, y0 + h - 1.0, 0, w, 1.0, l, P.S);
    const nc = Math.max(2, Math.round(w / 9)), ncl = Math.max(2, Math.round(l / 9));
    if (d.walls === 'glazed') {
      for (let i = 0; i <= nc; i++) for (const s of [-1, 1]) B.boxB(-w / 2 + 0.35 + i / nc * (w - 0.7), y0, s * (l / 2 - 0.35), 0.7, h - 1, 0.7, P.S);
      for (let i = 1; i < ncl; i++) for (const s of [-1, 1]) B.boxB(s * (w / 2 - 0.35), y0, -l / 2 + 0.35 + i / ncl * (l - 0.7), 0.7, h - 1, 0.7, P.S);
    } else {
      const sp = 4.4 / Math.max(1, d.finN), dp = d.fdepth, nf = Math.round(w / sp), nfl = Math.round(l / sp);
      for (let i = 0; i <= nf; i++) for (const s of [-1, 1]) B.boxB(-w / 2 + i / nf * w, y0, s * (l / 2 - 0.7 + dp / 2), 0.3, h - 0.6, dp + 1.4, P.S);
      for (let i = 1; i < nfl; i++) for (const s of [-1, 1]) B.boxB(s * (w / 2 - 0.7 + dp / 2), y0, -l / 2 + i / nfl * l, dp + 1.4, h - 0.6, 0.3, P.S);
    }
  } else {
    B.boxB(0, y0, 0, w, h, l, P.S);
    if (d.walls === 'slots') {
      const sp = 5, nl = Math.round(l / sp), nw = Math.round(w / sp);
      for (let i = 0; i < nl; i++) for (const s of [-1, 1]) B.box(s * (w / 2 + 0.012), y0 + h * 0.52, -l / 2 + (i + 0.5) * l / nl, 0.03, h * 0.72, 0.5, P.G);
      for (let i = 0; i < nw; i++) B.box(-w / 2 + (i + 0.5) * w / nw, y0 + h * 0.52, -l / 2 - 0.012, 0.5, h * 0.72, 0.03, P.G);
    } else if (d.walls === 'relief') {
      const n = Math.floor((w + l) * h / 55);
      for (let q = 0; q < n; q++) {
        const face = R.int(0, 3), along = face < 2 ? l : w, bw2 = 1.5 + R() * 5, bh2 = 1 + R() * 3.5, t = 0.15 + R() * 0.7;
        const u = (R() - 0.5) * (along - bw2 - 1), v = y0 + 1 + R() * Math.max(0.5, h - bh2 - 2) + bh2 / 2;
        if (face < 2) B.box((face ? 1 : -1) * (w / 2 + t / 2), v, u, t, bh2, bw2, P.I);
        else B.box(u, v, (face === 2 ? 1 : -1) * (l / 2 + t / 2), bw2, bh2, t, P.I);
      }
    } else if (d.walls === 'holes') {
      // a second wall stands off the first, cut with triangles
      const off = 3.2, t = 0.5, nb = Math.max(2, Math.round(l / 12)), nbw = Math.max(2, Math.round(w / 12));
      for (const s of [-1, 1]) {
        const x = s * (w / 2 + off);
        B.boxB(x, y0, 0, t, h * 0.12, l + off * 2, P.S); B.boxB(x, y0 + h * 0.86, 0, t, h * 0.14, l + off * 2, P.S);
        for (let i = 0; i < nb; i++) {
          const z = -l / 2 + (i + 0.5) * l / nb, bl = l / nb;
          B.wedge(x, y0 + h * 0.49, z - bl / 4, bl / 2, h * 0.74, t, P.S, 0);
          B.wedge(x, y0 + h * 0.49, z + bl / 4, bl / 2, h * 0.74, t, P.S, PI);
        }
        for (const e of [-1, 1]) B.boxB(x, y0, e * (l / 2 + off - 0.4), t, h, 0.8, P.S);
      }
      for (const s of [-1, 1]) {
        const z = s * (l / 2 + off);
        B.boxB(0, y0 + h * 0.86, z, w + off * 2, h * 0.14, t, P.S);
        for (let i = 0; i <= nbw; i++) B.boxB(-w / 2 - off + 0.6 + i / nbw * (w + off * 2 - 1.2), y0, z, 1.2, h * 0.86, t, P.S);
      }
      B.boxB(0, y0 + h, 0, w + off * 2 + 0.6, 0.6, l + off * 2 + 0.6, P.S);
    }
    B.box(0, y0 + 2.3, l / 2 + 0.012, Math.min(w * 0.5, 26), 4.2, 0.03, P.G);      // doors
  }
  // roof
  const yR = y0 + h;
  let top = yR;
  switch (d.roof) {
    case 'flat': B.boxB(0, yR, 0, w + 4, 1.1, l + 4, P.S); B.boxB(0, yR + 1.1, 0, w - 4, 0.6, l - 4, P.S); top = yR + 1.7; break;
    case 'folded': {
      const nfold = Math.max(2, Math.round(l / 6)), fw = l / nfold, rise = clamp(fw * 0.42, 1.4, 4);
      for (let i = 0; i < nfold; i++) {
        const z = -l / 2 + (i + 0.5) * fw;
        B.wedge(0, yR + rise / 2, z + fw / 4, w + 3, rise, fw / 2, P.S, 0);
        B.wedge(0, yR + rise / 2, z - fw / 4, w + 3, rise, fw / 2, P.S, PI);
      }
      top = yR + rise; break;
    }
    case 'vaults': {
      const nv = Math.max(1, Math.round(w / 8)), vw = w / nv;
      for (let i = 0; i < nv; i++) B.vault(-w / 2 + (i + 0.5) * vw, yR + vw * 0.22, 0, l + 2.4, vw * 0.44, vw - 0.3, P.S, PI / 2);
      top = yR + vw * 0.44; break;
    }
    case 'saw': {
      const nt = Math.max(1, Math.round(l / 7)), tw = l / nt;
      for (let i = 0; i < nt; i++) {
        const z = -l / 2 + (i + 0.5) * tw;
        B.wedge(0, yR + 1.5, z, w, 3, tw, P.S, 0);
        B.box(0, yR + 1.6, z - tw / 2 - 0.025, w - 2, 2.2, 0.04, P.G);
      }
      top = yR + 3; break;
    }
    case 'butterfly': {
      const rise = clamp(w * 0.16, 2, 9);
      B.wedge(-w / 4 - 0.5, yR + rise / 2, 0, l + 2, rise, w / 2 + 1, P.S, PI / 2);
      B.wedge(w / 4 + 0.5, yR + rise / 2, 0, l + 2, rise, w / 2 + 1, P.S, -PI / 2);
      top = yR + rise; break;
    }
    case 'pyramid': {
      const rise = clamp(h * 0.5, 3, 14);
      B.boxB(0, yR, 0, w * 0.62, rise, l * 0.62, P.S, 0, 1.75);
      B.boxB(0, yR + rise, 0, w * 1.085, 1.2, l * 1.085, P.S);
      top = yR + rise + 1.2; break;
    }
    case 'shell': B.vault(0, yR + w * 0.19, 0, l + 3, w * 0.38, w + 2, P.S, PI / 2); top = yR + w * 0.38; break;
    default: break;
  }
  if (d.fly > 0.05) {
    const fw = w * 0.44, fl = l * 0.27, fhh = h * (0.5 + d.fly * 1.15);
    B.boxB(0, yR - 0.5, -l * 0.2, fw, fhh, fl, P.C);
    B.boxB(0, yR - 0.5 + fhh, -l * 0.2, fw + 0.8, 0.5, fl + 0.8, P.C);
    top = Math.max(top, yR + fhh);
    B.mass(0, yR + fhh / 2, -l * 0.2, fw, fhh, fl);
  }
  // portico on the front
  const zf = l / 2;
  if (d.portico === 'columns') {
    const nc = Math.max(3, Math.round(w / 6.5));
    B.boxB(0, yR - 1.2, zf + 4, w + 3, 1.2, 8, P.S);
    for (let i = 0; i <= nc; i++) B.cylB(-w / 2 + 0.8 + i / nc * (w - 1.6), y0, zf + 7, 1.15, h - 1.2, 1.15, P.S);
  } else if (d.portico === 'piers') {
    const nc = Math.max(2, Math.round(w / 9));
    B.boxB(0, yR - 1.6, zf + 3.5, w + 2, 1.6, 7, P.S);
    for (let i = 0; i <= nc; i++) B.boxB(-w / 2 + 0.5 + i / nc * (w - 1), y0, zf + 5, 0.9, h - 1.6, 4, P.S, 0, 1.0);
  } else if (d.portico === 'canopy') {
    const cw = Math.min(w * 0.66, 34), cy = y0 + Math.min(h * 0.4, 6);
    B.boxB(0, cy, zf + 5.5, cw, 0.8, 11, P.S);
    B.wedge(0, cy - 0.7, zf + 5.5, cw, 1.4, 11, P.S, PI);
    for (const s of [-1, 1]) B.boxB(s * (cw / 2 - 1.2), y0, zf + 2.2, 1.1, cy - y0, 4.4, P.S);
  }
  if (d.planting > 0.3 && y0 > 0.5) for (const s of [-1, 1]) { B.boxB(s * (w / 2 + 2.6), y0, zf + 2, 3, 0.8, 3, P.I); if (R.chance(d.planting)) tree(B, P, s * (w / 2 + 2.6), y0 + 0.8, zf + 2, 4 + R() * 2, 'round', R); }
  const gfa = w * l * (1 + Math.floor(h / 9));
  B.stats = { gfa, floors: 1 + Math.floor(h / 9), height: top, dwellings: 0, pop: 0, jobs: Math.round(gfa / 70),
    foot: { w: w + (d.walls === 'holes' ? 8 : 0) + (y0 > 0.1 ? 9 : 0), d: l + 14, cx: 0, cz: 3 }, doors: [[0, zf + 12], [-w * 0.3, zf + 12], [w * 0.3, zf + 12]], ext: { H: h, w, l, plinth: y0 }, civic: true };
}

// ----------------------------------------------------------------- monument
export function genMonument(B, d, R) {
  const P = pens(d);
  const h = d.height, n = d.count, y0 = d.mound;
  if (y0 > 0.1) {
    const rr = h * 0.42 + 6;
    for (let i = 0; i < 3; i++) B.cylB(0, y0 * i / 3, 0, (rr - i * rr * 0.2) * 2, y0 / 3, (rr - i * rr * 0.2) * 2, P.S);
  }
  const lean = d.lean, spread = d.spread;
  let top = y0 + h;
  switch (d.kind) {
    case 'wings': {
      for (let i = 0; i < n; i++) {
        const yaw = i / n * TAU, sh = 5;
        for (let q = 0; q < sh; q++) {
          const f = q / (sh - 1), hh = h * (0.5 + 0.5 * Math.sin(f * PI * 0.85 + 0.35)) * (0.8 + R() * 0.3);
          const ww = h * 0.34 / sh * 1.9, lat = (f - 0.5) * h * 0.34 * spread * 1.7;
          const tilt = lean * (0.3 + 0.45 * Math.abs(f - 0.4)) + d.twist * (f - 0.5) * 0.5;
          const r = h * 0.07 + q * 0.25;
          const ox = Math.sin(yaw) * r + Math.cos(yaw) * lat, oz = Math.cos(yaw) * r - Math.sin(yaw) * lat;
          B.putE(PRIM.BOX, ox + Math.sin(yaw) * Math.sin(tilt) * hh / 2, y0 + Math.cos(tilt) * hh / 2, oz + Math.cos(yaw) * Math.sin(tilt) * hh / 2, ww, hh, h * 0.055 + R() * 0.3, tilt, yaw + d.twist * (f - 0.5), (R() - 0.5) * 0.1, P.S, 0.35 + R() * 0.4);
        }
      }
      break;
    }
    case 'flower': {
      for (let i = 0; i < n; i++) {
        const yaw = i / n * TAU + d.twist;
        let px = Math.sin(yaw) * h * 0.06, pz = Math.cos(yaw) * h * 0.06, py = y0;
        const segs = 4;
        for (let q = 0; q < segs; q++) {
          const tilt = lean * (0.15 + q * 0.5), len = h / segs * (1 + 0.25 * q * lean);
          const wd = h * (0.1 + 0.11 * q) * (0.6 + spread);
          const dx = Math.sin(yaw) * Math.sin(tilt), dz = Math.cos(yaw) * Math.sin(tilt), dy = Math.cos(tilt);
          B.putE(PRIM.BOX, px + dx * len / 2, py + dy * len / 2, pz + dz * len / 2, wd, len * 1.04, h * 0.03 + 0.25, tilt, yaw, 0, P.S, 1 + 0.9 / (q + 1.2));
          px += dx * len; py += dy * len; pz += dz * len;
        }
        top = Math.max(top, py);
      }
      B.cylB(0, y0, 0, h * 0.16, h * 0.3, h * 0.16, P.S, 0, 0.6);
      break;
    }
    case 'shards': {
      for (let i = 0; i < n; i++) {
        const yaw = i / n * TAU + d.twist * i * 0.6, tilt = lean * (0.9 + R() * 0.8), len = h * (0.7 + R() * 0.45);
        const dx = Math.sin(yaw) * Math.sin(tilt), dz = Math.cos(yaw) * Math.sin(tilt), dy = Math.cos(tilt);
        B.putE(PRIM.BOX, dx * len * 0.42, y0 + dy * len / 2 - 1, dz * len * 0.42, h * 0.2 * (0.5 + spread), len, h * 0.15, tilt, yaw, 0, P.S, 0.08);
      }
      break;
    }
    case 'gate': {
      const gap = h * (0.25 + spread * 0.7), pw = h * 0.2, pd = h * 0.26;
      for (let i = 0; i < Math.max(1, Math.round(n / 2)); i++) {
        const z = (i - (Math.max(1, Math.round(n / 2)) - 1) / 2) * pd * 1.8;
        for (const s of [-1, 1]) B.putE(PRIM.BOX, s * (gap / 2 + pw / 2) - s * Math.sin(lean * 0.4) * h * 0.25, y0 + h / 2, z, pw, h, pd, 0, 0, s * lean * 0.4, P.S, 0.8);
        B.boxB(0, y0 + h * 0.78, z, gap + pw * 2.6, h * 0.16, pd * 1.15, P.S);
      }
      break;
    }
    case 'eye': {
      const t = h * 0.14;
      B.putE(PRIM.TUBE, 0, y0 + h / 2, 0, h, t, h, PI / 2, 0, 0, P.S);
      for (let i = 0; i < n; i++) {
        const b = i / n * TAU + 0.26, R0 = h * 0.5 + h * 0.16 * (0.5 + spread), len = h * 0.3 * (0.6 + spread) * (0.7 + 0.6 * ((i * 7) % 3) / 2);
        if (Math.sin(b) < -0.75) continue;
        B.putE(PRIM.BOX, Math.cos(b) * R0, y0 + h / 2 + Math.sin(b) * R0, 0, h * 0.03 + 0.3, len, t * (0.5 + lean), 0, 0, b - PI / 2, P.S, 0.5);
      }
      B.boxB(0, y0, 0, h * 0.5, h * 0.09, t * 1.4, P.S);
      top = y0 + h * (1.1 + 0.3 * spread);
      break;
    }
    case 'needle': {
      for (let i = 0; i < n; i++) {
        const yaw = i / n * TAU, r = h * 0.05 * (0.5 + spread * 2);
        B.strut(PRIM.BOX, Math.sin(yaw) * r, y0, Math.cos(yaw) * r, Math.sin(yaw) * r * 0.12 * (1 - lean), y0 + h, Math.cos(yaw) * r * 0.12 * (1 - lean), h * 0.03 + 0.5, h * 0.045 + 0.5, P.S, 0.12);
      }
      B.tube(0, y0 + h * 0.3, 0, h * 0.13 * (0.5 + spread * 2), 0.8, h * 0.13 * (0.5 + spread * 2), P.S);
      break;
    }
    default: { // blocks
      const rad = h * (0.3 + spread * 0.6), cells = new Map();
      top = y0;
      for (let i = 0; i < n * 3; i++) {
        const a = R() * TAU, rr = Math.sqrt(R()) * rad * (1 - (i / (n * 3)) * 0.6);
        const sx = 2 + R() * h * 0.22, sy = 1.6 + R() * h * 0.2, sz = 2 + R() * h * 0.2;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        const key = Math.round(x / 4) + ',' + Math.round(z / 4);
        const base = cells.get(key) || y0;
        if (base + sy > y0 + h) continue;
        B.putE(PRIM.BOX, x, base + sy / 2 - 0.1, z, sx, sy, sz, (R() - 0.5) * lean * 0.3, R() * d.twist * PI, (R() - 0.5) * lean * 0.3, P.S, 0.85 + R() * 0.3);
        cells.set(key, base + sy * 0.92); top = Math.max(top, base + sy);
      }
    }
  }
  const ex = d.kind === 'needle' ? h * 0.3 : h * 0.9;
  B.mass(0, (y0 + h) / 2, 0, ex * 0.8, y0 + h, ex * 0.8);
  B.stats = { gfa: 0, floors: 0, height: top, dwellings: 0, pop: 0, jobs: 0, foot: { w: ex + 10, d: ex + 10, cx: 0, cz: 0, round: 1 }, doors: [[0, ex * 0.5 + 6]], ext: { H: h }, civic: true, monument: true };
}

// -------------------------------------------------------------------- works
export function genWorks(B, d, R) {
  const P = pens(d);
  const h = d.height, r = d.radius;
  const red = pen(M.PAINT, [0.5, 0.06, 0.04]), white = pen(M.PAINT, [0.78, 0.77, 0.73]);
  let top = h, fw = r * 2 + 6;
  switch (d.kind) {
    case 'watertower': {
      const stem = h * 0.7, bowl = h * 0.3, flare = 1 + d.swell * 3.2;
      B.cylB(0, 0, 0, r * 0.62, stem + 0.5, r * 0.62, P.S, 0, 0.82);
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; B.put(PRIM.BOX, Math.cos(a) * r * 0.36, stem * 0.86, Math.sin(a) * r * 0.36, 0.3, stem * 0.28, r * 0.5, P.S, PI / 2 - a, 2.2); }
      B.cylB(0, stem, 0, r * 2 / flare, bowl * 0.7, r * 2 / flare, P.S, 0, flare);
      B.cylB(0, stem + bowl * 0.7, 0, r * 2, bowl * 0.3, r * 2, P.S);
      B.cylB(0, stem + bowl, 0, r * 2.06, 0.5, r * 2.06, P.S, 0, 0.25);
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; B.put(PRIM.BOX, Math.cos(a) * (r + 0.015), stem + bowl * 0.85, Math.sin(a) * (r + 0.015), 0.6, bowl * 0.14, 0.03, P.G, PI / 2 - a); }
      top = h + 0.5; break;
    }
    case 'chimney': {
      B.cylB(0, 0, 0, r * 2, h, r * 2, P.S, 0, 0.5);
      for (let i = 0; i < 3; i++) { const t = 0.78 + i * 0.07, rr = r * (1 - 0.5 * t) * 2 + 0.06; B.cylB(0, h * t, 0, rr, h * 0.035, rr, i % 2 ? white : red, 0, 1 - 0.035 * 0.5 / (1 - 0.5 * t)); }
      B.boxB(r * 1.6, 0, 0, r * 2.6, h * 0.1, r * 2.4, P.C);
      fw = r * 6; break;
    }
    case 'cooling': {
      const segs = 12, rAt = (t) => r * Math.sqrt(0.336 + 2.36 * (t - 0.75) * (t - 0.75) * 0.5);
      const base = 7;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs, t1 = (i + 1) / segs, ra = rAt(t0), rb = rAt(t1);
        B.put(PRIM.TUBE, 0, base + (h - base) * (t0 + t1) / 2, 0, ra * 2, (h - base) / segs + 0.02, ra * 2, P.S, 0, rb / ra);
      }
      const nl = 28, rb0 = rAt(0);
      for (let i = 0; i < nl; i++) {
        const a = i / nl * TAU, a2 = (i + ((i & 1) ? 1 : -1) * 0.5) / nl * TAU;
        B.strut(PRIM.BOX, Math.cos(a) * rb0 * 1.03, 0, Math.sin(a) * rb0 * 1.03, Math.cos(a2) * rb0 * 0.9, base + 0.3, Math.sin(a2) * rb0 * 0.9, 0.55, 0.55, P.S);
      }
      B.cylB(0, 0, 0, rb0 * 1.7, 1.2, rb0 * 1.7, P.water);
      fw = r * 2.4; break;
    }
    case 'mast': {
      const sh = h * 0.6;
      B.cylB(0, 0, 0, r * 2, sh, r * 2, P.S, 0, 0.36);
      B.cylB(0, 0, 0, r * 3.4, h * 0.03, r * 3.4, P.S, 0, 0.7);
      for (let i = 0; i < d.count; i++) {
        const y = sh * (0.86 + i * 0.07), dd = r * (2.5 - i * 0.45) * 0.9;
        B.cylB(0, y, 0, dd, 1.3, dd, P.S, 0, 1.25); B.cylB(0, y + 1.3, 0, dd * 1.2, 1.5, dd * 1.2, P.G); B.cylB(0, y + 2.8, 0, dd * 1.25, 0.7, dd * 1.25, P.S, 0, 0.8);
      }
      const my = sh * (0.86 + d.count * 0.07) + 1;
      for (let i = 0; i < 6; i++) B.cylB(0, my + (h - my) * i / 6, 0, 1.5 - i * 0.2, (h - my) / 6, 1.5 - i * 0.2, i % 2 ? white : red, 0, (1.3 - i * 0.2) / (1.5 - i * 0.2));
      fw = r * 4; break;
    }
    default: { // silos
      const n = d.count, rows = n > 4 ? 2 : 1, per = Math.ceil(n / rows);
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / per), col = i % per;
        const x = (col - (per - 1) / 2) * r * 2.05, z = (row - (rows - 1) / 2) * r * 2.05;
        B.cylB(x, 0, z, r * 2, h, r * 2, P.S);
        B.cylB(x, h, z, r * 2, r * 0.5, r * 2, P.S, 0, 0.3);
      }
      B.boxB(0, h + r * 0.3, 0, per * r * 2.05, 3.2, 3.6, P.C);
      B.box(0, h + r * 0.3 + 1.8, 1.812, per * r * 2.05 - 1.5, 1.1, 0.03, P.G);
      B.boxB(-(per * r * 1.025 + 2.6), 0, 0, 5, h + r * 0.3 + 9, 6, P.C);
      top = h + r * 0.3 + 9; fw = per * r * 2.05 + 8;
    }
  }
  B.mass(0, top / 2, 0, Math.min(fw, r * 2.4 + 2), top, Math.min(fw, r * 2.4 + 2));
  B.stats = { gfa: 0, floors: 0, height: top, dwellings: 0, pop: 0, jobs: d.kind === 'silos' || d.kind === 'cooling' ? 40 : 4, foot: { w: fw, d: d.kind === 'silos' ? r * 4.4 + 4 : fw, cx: 0, cz: 0, round: d.kind !== 'silos' ? 1 : 0 }, doors: [[0, fw / 2 + 3]], ext: { H: h, r } };
}

// --------------------------------------------------------------------- deck
export function genDeck(B, d, R) {
  const P = pens(d);
  const W = d.width, L = d.length, levels = Math.max(1, d.floors | 0 || 1);
  const cell = clamp(Math.min(W, L) > 14 ? 8 : Math.min(W, L), 4, 9);
  const nx = Math.max(1, Math.round(W / cell)), nz = Math.max(1, Math.round(L / cell)), cw = W / nx, cl = L / nz;
  const hp = 0.5 + d.solid * 0.7, tp = 0.18;
  let top = 0;
  for (let lv = 0; lv < levels; lv++) {
    const y = d.deckH * (lv + 1), open = [];
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const x = -W / 2 + (i + 0.5) * cw, z = -L / 2 + (k + 0.5) * cl;
      const inner = i > 0 && i < nx - 1 && k > 0 && k < nz - 1;
      if (inner && lv === levels - 1 && hash2(i * 5 + d.seed, k * 3) < d.voids * 0.55) { open.push([i, k, x, z]); continue; }
      B.box(x, y - 0.25, z, cw, 0.5, cl, P.S);
    }
    for (const [i, k, x, z] of open) {                      // light wells: a rail round the hole, a tree up through it
      B.boxB(x, y, z + cl / 2 + tp / 2, cw + tp * 2, hp, tp, P.I); B.boxB(x, y, z - cl / 2 - tp / 2, cw + tp * 2, hp, tp, P.I);
      B.boxB(x + cw / 2 + tp / 2, y, z, tp, hp, cl, P.I); B.boxB(x - cw / 2 - tp / 2, y, z, tp, hp, cl, P.I);
      if (lv === 0 && R.chance(0.4 + d.planting * 0.6)) tree(B, P, x, 0, z, d.deckH + 3 + R() * 4, 'round', R);
    }
    const band = levels > 1 ? 1.25 : hp;                    // car parks read as stacked bands
    B.boxB(0, y - (levels > 1 ? 0.5 : 0), L / 2 - tp / 2, W, band, tp, P.I); B.boxB(0, y - (levels > 1 ? 0.5 : 0), -L / 2 + tp / 2, W, band, tp, P.I);
    B.boxB(W / 2 - tp / 2, y - (levels > 1 ? 0.5 : 0), 0, tp, band, L - tp * 2, P.I); B.boxB(-W / 2 + tp / 2, y - (levels > 1 ? 0.5 : 0), 0, tp, band, L - tp * 2, P.I);
    top = y + hp;
  }
  const every = Math.max(1, d.supEvery | 0), ht = d.deckH * levels - 0.5;
  for (let i = 0; i <= nx; i += every) for (let k = 0; k <= nz; k += every) {
    const x = clamp(-W / 2 + i * cw, -W / 2 + 0.6, W / 2 - 0.6), z = clamp(-L / 2 + k * cl, -L / 2 + 0.6, L / 2 - 0.6);
    if (d.supports === 'blades') B.boxB(x, 0, z, 0.4, ht, Math.min(3, cl * 0.4), P.S);
    else if (d.supports === 'piers') B.boxB(x, 0, z, 0.9, ht, 0.9, P.S, 0, 1.6);
    else if (d.supports === 'vlegs') { B.strut(PRIM.BOX, x, 0, z, x - cw * 0.22, ht, z, 0.45, 0.6, P.S); B.strut(PRIM.BOX, x, 0, z, x + cw * 0.22, ht, z, 0.45, 0.6, P.S); }
    else if (d.supports !== 'none') B.cylB(x, 0, z, 0.7, ht, 0.7, P.S);
  }
  // stairs: solid stacks of treads
  const yT = d.deckH * levels;
  for (let s = 0; s < d.stairs; s++) {
    const side = (s & 1) ? -1 : 1, along = ((Math.floor(s / 2) + 0.5) / Math.ceil(d.stairs / 2) - 0.5) * L * 0.6;
    const ns = Math.ceil(yT / 0.42), run = 0.62, sw = Math.min(3.2, L * 0.3);
    for (let i = 0; i < ns; i++) B.boxB(side * (W / 2 + (ns - i - 0.5) * run), 0, along, run, (i + 1) * yT / ns, sw, P.S);
    B.boxB(side * (W / 2 + ns * run / 2), 0, along + sw / 2 + 0.12, ns * run, yT + 0.2, 0.22, P.S);
  }
  if (levels > 1) {    // a ramp drum at one end
    const rr = Math.min(9, W * 0.3);
    for (let lv = 0; lv <= levels; lv++) B.cylB(0, d.deckH * lv + (lv ? -0.5 : 0), -L / 2 - rr * 0.9, rr * 2, lv ? 1.25 : 0.3, rr * 2, P.I);
    B.cylB(0, 0, -L / 2 - rr * 0.9, rr * 0.7, yT + 1.5, rr * 0.7, P.C);
  } else if (d.planting > 0.05 && Math.min(W, L) > 12) {
    const np = Math.floor((W * L) / 260 * (0.4 + d.planting * 1.6));
    for (let q = 0; q < np; q++) {
      const x = (R() - 0.5) * (W - 7), z = (R() - 0.5) * (L - 7), s = 2.6 + R() * 2.4;
      B.boxB(x, yT, z, s, 0.75, s, P.I); B.boxB(x, yT + 0.75, z, s - 0.3, 0.06, s - 0.3, P.soil);
      if (R.chance(0.6)) tree(B, P, x, yT + 0.75, z, 3.5 + R() * 3, R.chance(0.25) ? 'pine' : 'round', R);
      else for (let j = 0; j < 3; j++) { const b = 0.8 + R(); B.blob(x + (R() - 0.5) * s * 0.5, yT + 1.1, z + (R() - 0.5) * s * 0.5, b * 1.3, b, b * 1.3, P.plant); }
    }
  }
  B.mass(0, yT / 2, 0, W, yT + hp, L);
  B.stats = { gfa: 0, floors: levels, height: top, dwellings: 0, pop: 0, jobs: levels > 1 ? 6 : 0, foot: { w: W + (d.stairs ? 8 : 0), d: L + (levels > 1 ? 18 : 0), cx: 0, cz: levels > 1 ? -8 : 0, light: 1 }, doors: [[W / 2 + 6, 0], [-W / 2 - 6, 0]], ext: { H: yT, w: W, l: L }, deck: yT };
}
