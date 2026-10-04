// The bar family: slab, tower, ziggurat, inverted pyramid. One generator; the section
// parameters (undercroft, steps, tiers, profile) move it between them.
import { PRIM } from '../gfx/prims.js';
import { pens, tree, clamp } from './common.js';
import { facade, RECESSED, slabInset } from './facade.js';

const TS = 0.3;   // slab
const TW = 0.22;  // cross-wall

export function barPlates(d) {
  const n = d.floors, T = Math.max(1, d.tier | 0), tiers = Math.ceil(n / T);
  const L = d.bays * d.bayW, D = d.depth;
  const prof = (t) => {
    // every profile reads the same way: a positive step moves in, a negative one jetties out
    if (d.profile === 'diamond') return Math.min(t, tiers - 1 - t);
    if (d.profile === 'cap') return t >= tiers - Math.max(1, Math.round(tiers * 0.25)) ? 1 : 0;
    return t;
  };
  const plates = [];
  for (let k = 0; k < n; k++) {
    const m = prof(Math.floor(k / T));
    let zF = D / 2 - m * d.stepF, zB = -D / 2 + m * d.stepB, xE = L / 2 - m * d.stepE * d.bayW;
    if (zF - zB < 4) { const c = (zF + zB) / 2; zF = c + 2; zB = c - 2; }
    xE = Math.max(xE, d.bayW * 0.5);
    plates.push({ zF, zB, xE });
  }
  return plates;
}

export function genBar(B, d, R) {
  const P = pens(d);
  const n = d.floors, fh = d.floorH, lift = d.lift, bw0 = d.bayW;
  const L = d.bays * bw0, D = d.depth;
  const plates = barPlates(d);
  const yOf = (k) => lift + k * fh;
  const Htop = yOf(n);
  const dp = d.fdepth;
  const insF = slabInset(d.front, dp), insB = slabInset(d.back, dp), insE = slabInset(d.ends, dp);
  const skipEnd = !!RECESSED[d.ends];

  // ---- runs of identical floors ----
  const runs = [];
  for (let k = 0; k < n; k++) {
    const p = plates[k], r = runs[runs.length - 1];
    if (r && Math.abs(r.p.zF - p.zF) < 1e-4 && Math.abs(r.p.zB - p.zB) < 1e-4 && Math.abs(r.p.xE - p.xE) < 1e-4) r.k1 = k + 1;
    else runs.push({ k0: k, k1: k + 1, p });
  }

  // ---- floor slabs ----
  let gfa = 0;
  for (let j = 0; j <= n; j++) {
    const a = plates[Math.max(0, j - 1)], b = plates[Math.min(n - 1, j)];
    const roof = j === n;
    const zF = Math.max(a.zF, b.zF) - (roof ? 0 : insF), zB = Math.min(a.zB, b.zB) + (roof ? 0 : insB), xE = Math.max(a.xE, b.xE) - (roof ? 0 : insE);
    const first = j === 0 && lift > 0;
    const t = first ? 0.55 : TS;                    // the table the building stands on is thicker
    B.box(0, yOf(j) - t / 2, (zF + zB) / 2, xE * 2, t, zF - zB, P.S);
    if (j < n) gfa += (plates[j].zF - plates[j].zB) * plates[j].xE * 2;
  }

  // ---- runs: cross-walls and façades ----
  for (const r of runs) {
    const p = r.p, nF = r.k1 - r.k0, y0 = yOf(r.k0), H = nF * fh;
    const W = p.xE * 2, nb = Math.max(1, Math.round(W / bw0)), bw = W / nb;
    const De = p.zF - p.zB, nbE = Math.max(1, Math.round(De / Math.max(3, Math.min(bw0, 5)))), bwE = De / nbE;
    const zc = (p.zF + p.zB) / 2;
    B.frame(0, 0, 0, 0);
    for (let j = 0; j <= nb; j++) {
      if (skipEnd && (j === 0 || j === nb)) continue;
      B.box(-p.xE + j * bw, y0 + (H - TS) / 2, zc, TW, H - TS, De, P.S);
    }
    B.mass(0, y0 + H / 2, zc, W, H, De);
    const ground = lift === 0 && r.k0 === 0;
    const o = { nF, fh, ts: TS, tw: TW, dp, P, k0: r.k0, R, solid: d.solid, rhythm: d.rhythm, finN: d.finN, seed: d.seed, plant: d.planting, accentAt: d.accentAt, ground, cornerFins: skipEnd };
    B.frame(0, y0, p.zF, 0); facade(B, d.front, { ...o, W, nb, bw, side: 'front' });
    B.frame(0, y0, p.zB, Math.PI); facade(B, d.back, { ...o, W, nb, bw, side: 'back' });
    const oe = { ...o, W: De, nb: nbE, bw: bwE, side: 'end', ownFins: true, cornerFins: false };
    B.frame(p.xE, y0, zc, Math.PI / 2); facade(B, d.ends, oe);
    B.frame(-p.xE, y0, zc, -Math.PI / 2); facade(B, d.ends, oe);
    // terraces: wherever this run is wider than the next, the roof needs an edge
    const nx = runs[runs.indexOf(r) + 1];
    if (nx) {
      B.frame(0, 0, 0, 0);
      const yT = yOf(r.k1), hp = 1.05, tp = 0.16, q = nx.p;
      const planter = (cx, cz, sx, sz) => {
        B.boxB(cx, yT, cz, sx, hp, sz, P.I);
        if (d.planting > 0.25 && Math.max(sx, sz) > 4) {
          const along = sx > sz, len = Math.max(sx, sz), nP = Math.floor(len / 2.2);
          for (let i = 0; i < nP; i++) if (R.chance(d.planting * 0.8)) {
            const t = (i + 0.5) / nP - 0.5, s = 0.9 + R() * 1.1;
            B.blob(cx + (along ? t * len : -Math.sign(cx) * 0.5), yT + hp + 0.1, cz + (along ? -Math.sign(cz - zc) * 0.55 : t * len), s * 1.4, s, s * 1.1, P.plant);
          }
        }
      };
      if (p.zF - q.zF > 0.6) planter(0, p.zF - tp / 2 - 0.02, W, tp);
      if (q.zB - p.zB > 0.6) planter(0, p.zB + tp / 2 + 0.02, W, tp);
      if (p.xE - q.xE > 0.6) { planter(p.xE - tp / 2 - 0.02, zc, tp, De - 0.4); planter(-p.xE + tp / 2 + 0.02, zc, tp, De - 0.4); }
    }
  }
  B.frame(0, 0, 0, 0);
  const p0 = plates[0], pT = plates[n - 1];
  const zc0 = (p0.zF + p0.zB) / 2, D0 = p0.zF - p0.zB;

  // ---- undercroft ----
  if (lift > 0.4) {
    const W = p0.xE * 2, nb = Math.max(1, Math.round(W / bw0)), bw = W / nb;
    const every = Math.max(1, d.supEvery | 0), inset = Math.min(2.4, D0 * 0.2), hs = lift - 0.55;
    const lines = [];
    for (let j = 0; j <= nb; j += every) lines.push(-p0.xE + j * bw);
    if ((nb % every) !== 0) lines.push(p0.xE);
    for (const x of lines) {
      const xi = clamp(x, -p0.xE + 0.6, p0.xE - 0.6);
      switch (d.supports) {
        case 'pilotis': {
          const dia = clamp(0.5 + lift * 0.045, 0.55, 1.3);
          B.cylB(xi, 0, p0.zF - inset, dia, hs, dia, P.S); B.cylB(xi, 0, p0.zB + inset, dia, hs, dia, P.S);
          if (D0 > 22) B.cylB(xi, 0, zc0, dia, hs, dia, P.S);
          break;
        }
        case 'piers': {
          const w = clamp(lift * 0.16, 0.8, 1.5), dd = clamp(D0 * 0.14, 1.6, 3.2);
          B.boxB(xi, 0, p0.zF - inset - dd * 0.3, w, hs, dd * 0.62, P.S, 0, 1.75);
          B.boxB(xi, 0, p0.zB + inset + dd * 0.3, w, hs, dd * 0.62, P.S, 0, 1.75);
          break;
        }
        case 'blades':
          B.boxB(xi, 0, zc0, 0.42, hs, D0 - inset * 1.4, P.S);
          break;
        case 'vlegs': {
          const s = clamp(lift * 0.07, 0.5, 1.0);
          B.strut(PRIM.BOX, xi, 0, zc0 + 0.5, xi, hs, p0.zF - inset * 0.6, s, s * 1.25, P.S);
          B.strut(PRIM.BOX, xi, 0, zc0 - 0.5, xi, hs, p0.zB + inset * 0.6, s, s * 1.25, P.S);
          B.boxB(xi, 0, zc0, s * 1.6, 0.5, s * 3.2, P.S);
          break;
        }
        case 'arcade':
          B.boxB(xi, 0, p0.zF - 0.45, 0.85, hs, 0.85, P.S); B.boxB(xi, 0, p0.zB + 0.45, 0.85, hs, 0.85, P.S);
          break;
        default: break;
      }
    }
    if (d.supports === 'arcade') {
      B.box(0, lift - 0.55 - 0.45, p0.zF - 0.45, W, 0.9, 0.6, P.S); B.box(0, lift - 0.55 - 0.45, p0.zB + 0.45, W, 0.9, 0.6, P.S);
    }
    // glazed entrance hall tucked under the table
    if (lift >= 2.8 && W > 14) {
      const lw = Math.min(W * 0.3, 16), lh = Math.min(lift - 0.55, 3.4), ld = Math.max(3, D0 - inset * 2 - 2.2);
      const lx = d.core === 'end' ? p0.xE - lw / 2 - 2 : 0;
      B.boxB(lx, 0, zc0, lw, lh, ld, P.G);
      B.boxB(lx, lh, zc0, lw + 1.2, 0.2, ld + 1.6, P.S);
    }
    B.mass(0, lift / 2, zc0, W * 0.96, lift, D0 * 0.9, 0, 1);
    for (let x = -W / 2 + 6; x < W / 2; x += 14) B.light(x, lift - 1, zc0, 1);
  } else {
    // doors at grade on the back
    const W = p0.xE * 2;
    const nd = Math.max(1, Math.round(W / 40));
    for (let i = 0; i < nd; i++) {
      const x = (i + 0.5) / nd * W - W / 2;
      B.boxB(x, 2.7, p0.zB - 1.5, 5, 0.22, 3.4, P.S);
      B.boxB(x, 0, p0.zB - 0.31, 3.2, 2.5, 0.06, P.G);
      B.light(x, 2.4, p0.zB - 2, 1.2);
      B.boxB(x - 2.2, 0, p0.zB - 2.9, 0.3, 2.7, 0.3, P.S); B.boxB(x + 2.2, 0, p0.zB - 2.9, 0.3, 2.7, 0.3, P.S);
    }
  }

  // ---- circulation cores ----
  const cw = 4.4, cd = clamp(D * 0.55, 4.5, 8), coreTop = Htop + 2.6 + d.coreH;
  const xMin = Math.min(...plates.map(p => p.xE));
  const coreBox = (x, z, w, dd, top, glassOnX) => {
    B.boxB(x, 0, z, w, top, dd, P.C);
    B.mass(x, top / 2, z, w, top, dd);
    if (top > 9) {
      if (glassOnX) B.box(x + Math.sign(x || 1) * (w / 2 + 0.012), top / 2 + 0.6, z, 0.03, top - 4.2, 0.55, P.G);
      else B.box(x, top / 2 + 0.6, z - dd / 2 - 0.012, 0.55, top - 4.2, 0.03, P.G);
    }
  };
  const motorRoom = (x, z, w, dd, top) => B.boxB(x, top, z, w + 0.7, 2.2, dd + 0.7, P.C);
  switch (d.core) {
    case 'internal': {
      const xs = d.bays >= 9 ? [-xMin * 0.5, xMin * 0.5] : [0];
      for (const x of xs) {
        if (lift > 0.4) B.boxB(x, 0, zc0, 3.6, lift, Math.min(6, D0 * 0.5), P.C);
        B.boxB(x, Htop, (pT.zF + pT.zB) / 2, 3.8, 2.6 + d.coreH, Math.min(6, (pT.zF - pT.zB) * 0.5), P.C);
      }
      break;
    }
    case 'end': coreBox(xMin + cw / 2 - 0.4, zc0, cw, cd, coreTop, true); motorRoom(xMin + cw / 2 - 0.4, zc0, cw, cd, coreTop); break;
    case 'ends':
      for (const s of [-1, 1]) { coreBox(s * (xMin + cw / 2 - 0.4), zc0, cw, cd, coreTop, true); motorRoom(s * (xMin + cw / 2 - 0.4), zc0, cw, cd, coreTop); }
      break;
    case 'detached': {
      const g = 3.4, x = -(p0.xE + g + cw / 2);
      coreBox(x, zc0, cw, cd, coreTop, true);
      const every = Math.max(1, d.bridgeN | 0);
      for (let k = 0; k < n; k += every) {
        const y = yOf(k) + 1.35;
        if (plates[k].xE < p0.xE - 0.5) continue;
        B.box(-(p0.xE + g / 2), y, zc0, g + 0.5, 2.7, 2.6, P.C);
        B.box(-(p0.xE + g / 2), y + 0.2, zc0 + 1.312, g - 0.5, 1.1, 0.03, P.G);
        B.box(-(p0.xE + g / 2), y + 0.2, zc0 - 1.312, g - 0.5, 1.1, 0.03, P.G);
      }
      if (d.crown === 'boiler') {       // plant room slung off the head of the service tower
        B.boxB(x - 0.9, coreTop - 6.2, zc0, cw + 3.4, 5.6, cd + 2.6, P.C);
        B.box(x - 0.9, coreTop - 3.2, zc0 + (cd + 2.6) / 2 + 0.012, cw + 2.4, 1.5, 0.03, P.G);
        B.box(x - 0.9, coreTop - 3.2, zc0 - (cd + 2.6) / 2 - 0.012, cw + 2.4, 1.5, 0.03, P.G);
        B.box(x - 0.9 - (cw + 3.4) / 2 - 0.012, coreTop - 3.2, zc0, 0.03, 1.5, cd + 1.6, P.G);
        B.cylB(x + 0.6, coreTop, zc0 + 1.2, 0.7, 4.5, 0.7, P.C); B.cylB(x + 0.6, coreTop, zc0 - 0.6, 0.55, 3.2, 0.55, P.C);
      } else motorRoom(x, zc0, cw, cd, coreTop);
      break;
    }
    case 'spine': {
      const ns = Math.max(1, Math.round(d.bays / 7));
      const zBmin = Math.max(...plates.map(p => p.zB));
      for (let i = 0; i < ns; i++) {
        const x = ((i + 0.5) / ns - 0.5) * xMin * 2;
        coreBox(x, zBmin - 1.5, 3.2, 3.4, coreTop - 1.2, false);
      }
      break;
    }
    default: break;
  }

  // ---- roof ----
  const yR = Htop, WT = pT.xE * 2, DT = pT.zF - pT.zB, zcT = (pT.zF + pT.zB) / 2;
  const parapet = (h) => {
    B.boxB(0, yR, pT.zF - 0.1, WT, h, 0.2, P.I); B.boxB(0, yR, pT.zB + 0.1, WT, h, 0.2, P.I);
    B.boxB(pT.xE - 0.1, yR, zcT, 0.2, h, DT - 0.4, P.I); B.boxB(-pT.xE + 0.1, yR, zcT, 0.2, h, DT - 0.4, P.I);
  };
  switch (d.crown) {
    case 'parapet': parapet(1.1); break;
    case 'terrace': {
      parapet(1.3);
      const at = (f) => f * WT * 0.5;
      B.cylB(at(-0.62), yR, zcT + DT * 0.12, 3.4, 5.2, 3.4, P.S, 0, 0.5);          // ventilation stack
      B.cylB(at(-0.62), yR + 5.2, zcT + DT * 0.12, 1.7, 1.9, 1.7, P.S, 0, 1.9);
      B.vault(at(-0.2), yR + 2.2, zcT - DT * 0.1, DT * 0.5, 4.4, 9, P.S, Math.PI / 2);   // gymnasium
      B.boxB(at(0.18), yR, zcT, 0.3, 3.6, DT * 0.55, P.S);                         // free-standing screen
      B.boxB(at(0.44), yR, zcT + DT * 0.15, 6.5, 3.0, DT * 0.34, P.S);             // nursery
      B.boxB(at(0.44), yR + 3.0, zcT + DT * 0.15, 7.6, 0.22, DT * 0.34 + 1.2, P.S);
      B.boxB(at(0.72), yR, zcT - DT * 0.16, 5.2, 0.35, 3.4, P.I);                  // paddling pool
      B.boxB(at(0.72), yR + 0.3, zcT - DT * 0.16, 4.6, 0.08, 2.8, P.water);
      B.wedge(at(0.12), yR + 0.8, zcT - DT * 0.28, 2.2, 1.6, 6, P.S, Math.PI / 2);  // ramp
      break;
    }
    case 'tanks': {
      parapet(0.7);
      const nt = Math.max(1, Math.round(WT / 22));
      for (let i = 0; i < nt; i++) {
        const x = ((i + 0.5) / nt - 0.5) * WT * 0.8;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.boxB(x + sx * 1.1, yR, zcT + sz * 1.1, 0.25, 1.2, 0.25, P.S);
        B.cylB(x, yR + 1.2, zcT, 3.6, 3.0, 3.6, P.S);
        B.boxB(x + 5, yR, zcT - DT * 0.12, 4.6, 2.6, Math.min(5, DT * 0.4), P.C);
      }
      break;
    }
    case 'boiler': {
      parapet(0.8);
      if (d.core !== 'detached') {
        const bl = Math.min(WT * 0.32, 14);
        B.boxB(pT.xE - bl / 2 + 1.2, yR + 0.3, zcT, bl, 4.4, DT + 2.6, P.C);
        B.box(pT.xE - bl / 2 + 1.2, yR + 2.9, zcT + DT / 2 + 1.312, bl - 1, 1.5, 0.03, P.G);
        B.box(pT.xE - bl / 2 + 1.2, yR + 2.9, zcT - DT / 2 - 1.312, bl - 1, 1.5, 0.03, P.G);
        B.cylB(pT.xE - bl / 2, yR + 4.7, zcT + 1, 0.8, 5.5, 0.8, P.C); B.cylB(pT.xE - bl / 2 + 1.6, yR + 4.7, zcT - 0.6, 0.6, 4, 0.6, P.C);
      }
      break;
    }
    case 'parasol': {
      const hc = Math.max(4.5, fh * 1.6), ov = 3;
      const nc = Math.max(2, Math.round(WT / (bw0 * 2)));
      for (let i = 0; i <= nc; i++) {
        const x = -pT.xE + 0.6 + (i / nc) * (WT - 1.2);
        B.boxB(x, yR, pT.zF - 0.8, 0.55, hc, 1.2, P.S); B.boxB(x, yR, pT.zB + 0.8, 0.55, hc, 1.2, P.S);
      }
      B.boxB(0, yR + hc, zcT, WT + ov * 2, 0.4, DT + ov * 2, P.S);
      B.boxB(0, yR + hc + 0.4, pT.zF + ov - 0.15, WT + ov * 2, 1.3, 0.3, P.S); B.boxB(0, yR + hc + 0.4, pT.zB - ov + 0.15, WT + ov * 2, 1.3, 0.3, P.S);
      B.boxB(pT.xE + ov - 0.15, yR + hc + 0.4, zcT, 0.3, 1.3, DT + ov * 2 - 0.6, P.S); B.boxB(-pT.xE - ov + 0.15, yR + hc + 0.4, zcT, 0.3, 1.3, DT + ov * 2 - 0.6, P.S);
      break;
    }
    case 'sawtooth': {
      const nt = Math.max(1, Math.round(WT / 6)), tw2 = WT / nt;
      for (let i = 0; i < nt; i++) {
        const x = -pT.xE + (i + 0.5) * tw2;
        B.wedge(x, yR + 1.3, zcT, DT - 0.4, 2.6, tw2, P.S, Math.PI / 2);
        B.box(x - tw2 / 2 - 0.025, yR + 1.45, zcT, 0.04, 1.9, DT - 1.6, P.G);
      }
      break;
    }
    case 'vaults': {
      const nv = Math.max(1, Math.round(WT / 7)), vw = WT / nv;
      for (let i = 0; i < nv; i++) B.vault(-pT.xE + (i + 0.5) * vw, yR + vw * 0.21, zcT, DT + 1.2, vw * 0.42, vw - 0.25, P.S, Math.PI / 2);
      break;
    }
    case 'garden': {
      parapet(1.2);
      B.boxB(0, yR, zcT, WT - 1.2, 0.3, DT - 1.2, P.soil);
      const nt = Math.floor((WT * DT) / 90 * (0.4 + d.planting));
      for (let i = 0; i < nt; i++) tree(B, P, (R() - 0.5) * (WT - 5), yR + 0.3, zcT + (R() - 0.5) * (DT - 5), 3.5 + R() * 3.5, R.chance(0.3) ? 'pine' : 'round', R);
      for (let i = 0; i < nt * 2; i++) { const s = 1 + R() * 1.6; B.blob((R() - 0.5) * (WT - 3), yR + 0.5, zcT + (R() - 0.5) * (DT - 3), s * 1.5, s * 0.8, s * 1.4, P.plant); }
      break;
    }
    default: break;
  }

  // ---- what the rest of the game needs to know ----
  const eff = d.use === 'housing' ? 0.82 : 0.78;
  const dwell = d.use === 'housing' ? Math.round(gfa * eff / 78) : 0;
  B.stats = {
    gfa, floors: n, height: Math.max(Htop, d.core === 'none' || d.core === 'internal' ? 0 : coreTop),
    dwellings: dwell, pop: d.use === 'housing' ? Math.round(dwell * 2.4) : 0, jobs: d.use === 'work' ? Math.round(gfa * eff / 18) : d.use === 'civic' ? Math.round(gfa / 60) : 0,
    foot: { w: p0.xE * 2 + (d.core === 'detached' ? 9 : 0), d: D0, cx: d.core === 'detached' ? -4.5 : 0, cz: zc0 },
    doors: [[0, p0.zB - 4], [p0.xE * 0.5, p0.zF + 4], [-p0.xE * 0.5, p0.zB - 4]],
    top: [0, Htop, 0], ext: { L, D, H: Htop, lift, xE: p0.xE, zF: p0.zF, zB: p0.zB, fh, bw: bw0 },
    civic: d.use === 'civic',
  };
}
