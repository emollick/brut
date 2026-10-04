// Pens (material + colour presets for one building) and small shared pieces.
import { M, ROLE, pen } from '../gfx/batch.js';
import { accentColor } from './dna.js';
import { lerp, clamp, hash2 } from '../util.js';

const FINMAP = { boardH: 0, boardV: 1, rib: 2, hammer: 3, panel: 4, precast: 5, smooth: 6 };

export function concreteColor(tone = 0.45, value = 0.5) {
  const cool = [0.300, 0.312, 0.322], warm = [0.425, 0.368, 0.288];
  const k = lerp(0.42, 1.28, value);
  return [lerp(cool[0], warm[0], tone) * k, lerp(cool[1], warm[1], tone) * k, lerp(cool[2], warm[2], tone) * k];
}

export function pens(d) {
  const c = concreteColor(d.tone, d.value), f = FINMAP[d.finish] ?? 0;
  const coreF = f === 0 ? 1 : (f === 4 || f === 6 || f === 5) ? 2 : (f === 1 ? 2 : f);
  const mul = (k) => [c[0] * k, c[1] * k, c[2] * k];
  const accs = [];
  for (let i = 0; i < 6; i++) { const a = accentColor(d.accent, i); accs.push(a ? pen(M.PAINT, a, 0, ROLE.INFILL) : null); }
  return {
    S: pen(M.CONC, c, f, ROLE.STRUCT),               // slabs, walls, columns
    I: pen(M.CONC, mul(1.06), f, ROLE.INFILL),       // parapets, panels, skins
    C: pen(M.CONC, mul(0.9), coreF, ROLE.STRUCT),    // cores take a contrasting finish
    T: pen(M.CONC, mul(0.98), 6, ROLE.STRUCT),       // fair-faced
    G: pen(M.GLASS, [0.028, 0.026, 0.024], 0, ROLE.INFILL),
    Gw: pen(M.GLASS, [0.5, 0.49, 0.46], 0, ROLE.INFILL),
    metal: pen(M.METAL, [0.022, 0.022, 0.025], 0, ROLE.INFILL),
    plant: pen(M.PLANT, [0.060, 0.115, 0.034], 0, ROLE.INFILL),
    tree: pen(M.PLANT, [0.046, 0.088, 0.028], 0, ROLE.TREE),
    trunk: pen(M.WOOD, [0.11, 0.085, 0.06], 0, ROLE.TREE),
    soil: pen(M.SOIL, [0.085, 0.065, 0.045], 0, ROLE.INFILL),
    wood: pen(M.WOOD, [0.2, 0.125, 0.065], 0, ROLE.INFILL),
    water: pen(M.WATER, [0.02, 0.04, 0.04], 0, ROLE.INFILL),
    lamp: pen(M.LAMP, [1.0, 0.62, 0.28], 0, ROLE.SITE),
    acc: (i) => accs[Math.abs(i | 0) % 6],
    hasAccent: !!accs[0],
    color: c,
  };
}

// which cells of a façade grid take the feature
export function pattern(rhythm, i, j, seed) {
  switch (rhythm) {
    case 'alt': return (j & 1) === 0;
    case 'rows': return (i & 1) === 0;
    case 'checker': return ((i + j) & 1) === 0;
    case 'random': return hash2(i * 7 + seed * 13, j * 11 + seed) < 0.62;
    default: return true;
  }
}

// A tree made of the same primitives as everything else. The finish slot of a leaf pen carries how
// exposed that mass is (1 deep in the crown .. 7 out at the top), which the shader reads as shade.
const leafPens = (c) => { const a = []; for (let f = 0; f < 8; f++) a.push(pen(M.PLANT, c, f, ROLE.TREE)); return a; };
const LEAF = [[0.040, 0.078, 0.026], [0.050, 0.086, 0.024], [0.034, 0.070, 0.030], [0.058, 0.088, 0.030]].map(leafPens);
const NEEDLE = [[0.020, 0.046, 0.030], [0.024, 0.050, 0.027]].map(leafPens);
const CYPRESS = leafPens([0.026, 0.056, 0.027]);
const BARK = pen(M.WOOD, [0.075, 0.062, 0.05], 0, ROLE.TREE);
const GOLD = 2.39996;
export function tree(B, P, x, y, z, h, kind, R, detail = 1) {
  const r1 = R || Math.random;
  const tw = h * 0.04 + 0.1;
  const lvl = (v) => clamp(Math.round(v), 2, 7);
  if (kind === 'poplar') {                  // a column: masses stacked up a hidden stem
    const r = h * 0.085, n = detail < 0.75 ? 4 : 7;
    B.cylB(x, y, z, tw, h * 0.5, tw, BARK, 0, 0.6);
    B.blob(x, y + h * 0.56, z, r * 1.7, h * 0.84, r * 1.7, CYPRESS[1]);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), a = i * GOLD + r1();
      const s = r * 2.4 * (0.5 + 0.62 * Math.sin(Math.PI * Math.min(1, 0.22 + u * 0.8)));
      B.blob(x + Math.cos(a) * r * 0.35, y + h * (0.2 + u * 0.7), z + Math.sin(a) * r * 0.35, s, h * (n < 7 ? 0.3 : 0.2), s, CYPRESS[lvl(3 + u * 4)]);
    }
    return;
  }
  if (kind === 'pine') {                    // stone pine: a flat cloud on a bare, leaning trunk
    const r = h * 0.3, pp = NEEDLE[(r1() * 2) | 0], top = h * 0.76;
    const lx = (r1() - 0.5) * h * 0.14, lz = (r1() - 0.5) * h * 0.14;
    B.strut(1, x, y, z, x + lx, y + top, z + lz, tw * 1.1, tw * 1.1, BARK, 0.55);
    const n = detail < 0.75 ? 4 : 7 + ((r1() * 3) | 0);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + r1() * 1.2;
      B.strut(1, x + lx * 0.8, y + top * 0.8, z + lz * 0.8, x + lx + Math.cos(a) * r * 0.55, y + top + h * 0.03, z + lz + Math.sin(a) * r * 0.55, tw * 0.42, tw * 0.42, BARK, 0.6);
    }
    B.blob(x + lx, y + top + h * 0.06, z + lz, r * 1.6, h * 0.12, r * 1.6, pp[2]);
    for (let i = 0; i < n; i++) {
      const a = i * GOLD + r1() * 0.8, rr = r * Math.sqrt((i + 0.5) / n) * 0.74;
      const s = r * (0.7 + r1() * 0.4) * (n < 7 ? 1.3 : 1);
      B.blob(x + lx + Math.cos(a) * rr, y + top + h * (0.07 + r1() * 0.06), z + lz + Math.sin(a) * rr, s, s * 0.5, s, pp[lvl(4 + r1() * 3)]);
    }
    return;
  }
  // plane or lime: a clear stem, limbs, a dark heart, and masses of leaf round it
  const lp = LEAF[(r1() * LEAF.length) | 0];
  const th = h * (0.29 + r1() * 0.06), cw = h * (0.27 + r1() * 0.05), ch = (h - th) * 0.5, cy = th + ch * 0.96;
  B.cylB(x, y, z, tw, th + ch * 0.5, tw, BARK, 0, 0.55);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + r1() * 1.3, rr = cw * (0.45 + r1() * 0.25);
    B.strut(1, x, y + th * (0.78 + r1() * 0.15), z, x + Math.cos(a) * rr, y + cy + ch * (r1() * 0.3 - 0.15), z + Math.sin(a) * rr, tw * 0.5, tw * 0.5, BARK, 0.5);
  }
  B.blob(x, y + cy, z, cw * 1.5, ch * 1.6, cw * 1.5, lp[1]);
  const n = detail < 0.75 ? 5 : 9 + ((r1() * 4) | 0), big = n < 9 ? 1.3 : 1;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;                                   // up a golden-angle spiral, from under the equator to the pole
    const el = -0.55 + u * 1.5, a = i * GOLD + r1() * 0.7;
    const rr = Math.cos(el) * cw * (0.5 + r1() * 0.16), yy = Math.sin(el) * ch * (0.68 + r1() * 0.16);
    const s = cw * (0.76 + r1() * 0.32) * big;
    B.blob(x + Math.cos(a) * rr, y + cy + yy, z + Math.sin(a) * rr, s, s * (0.72 + r1() * 0.2), s, lp[lvl(2.5 + u * 4.5 + r1())]);
  }
}
export { M, ROLE, pen, lerp, clamp };
