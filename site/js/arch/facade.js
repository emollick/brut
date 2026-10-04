// Façade systems. Each one fills a rectangular field of bays x floors, working in a local
// frame set by the caller: u runs along the wall, v is up, w points out of the building.
// w = 0 is the edge of the floor plate. Skins hang just outside it; loggias cut back into it.
import { pattern, clamp, lerp } from './common.js';

// façades whose openings sit back inside the plate (the end cross-wall must give way to them)
export const RECESSED = { loggia: 1, duplex: 1, punched: 1, slot: 1 };
// façades that want the floor slab to stop at the glass line (they bring their own tongues)
export const slabInset = (type, dp) => (type === 'duplex' ? dp : 0);

export function facade(B, type, o) {
  const { W, nb, bw, nF, fh, ts, tw, P, k0, R } = o;
  const dp = o.dp, H = nF * fh, u0 = -W / 2, clear = fh - ts;
  const uc = (j) => u0 + (j + 0.5) * bw;
  const on = (i, j) => pattern(o.rhythm, k0 + i, j, o.seed);
  const accAt = P.hasAccent ? o.accentAt : '';
  const green = (u, v, w, big) => {
    if (!(o.plant > 0) || !R.chance(o.plant * (big ? 0.85 : 0.45))) return;
    const s = 0.6 + R() * 0.6;
    B.blob(u + (R() - 0.5) * bw * 0.4, v + 0.12, w, s * 1.3, s * 0.7, s * 0.8, P.plant);
    if (R.chance(o.plant * 0.6)) B.blob(u + (R() - 0.5) * bw * 0.5, v - 0.3, w + 0.22, 0.6 + R() * 0.5, 0.9 + R() * 0.9, 0.3, P.plant);
  };
  const fins = (d0, d1) => { for (let j = 0; j <= nb; j++) B.box(u0 + j * bw, H / 2, (d0 + d1) / 2, tw, H, d1 - d0, P.S); };
  const cornerFins = (depth) => { if (o.cornerFins) { B.box(u0, H / 2, -depth / 2, tw, H, depth, P.S); B.box(-u0, H / 2, -depth / 2, tw, H, depth, P.S); } };

  switch (type) {
    case 'loggia': {
      const hp = 0.3 + o.solid * 0.85;
      if (o.ownFins) fins(-dp, 0); else cornerFins(dp);
      for (let i = 0; i < nF; i++) {
        const v0 = i * fh;
        for (let j = 0; j < nb; j++) {
          const u = uc(j), w = bw - tw;
          if (!on(i, j)) {                       // a closed cell: wall brought forward, small window
            B.box(u, v0 + clear / 2, -0.12, w, clear, 0.2, P.I);
            B.box(u + w * 0.14, v0 + clear * 0.6, -0.005, w * 0.4, clear * 0.4, 0.05, P.G);
            continue;
          }
          B.box(u, v0 + clear / 2, -dp - 0.03, w, clear, 0.06, P.G);
          const a = P.acc(i * 5 + j * 3 + o.seed);
          B.box(u, v0 + hp / 2, -0.07, w, hp, 0.1, (accAt === 'panels' && a) || P.I);
          if (a && accAt === 'reveals') B.box(u - w / 2 + 0.02, v0 + clear / 2, -dp / 2 - 0.02, 0.035, clear - 0.04, dp - 0.14, a);
          if (a && accAt === 'soffits') B.box(u, v0 + clear - 0.02, -dp / 2 - 0.02, w, 0.035, dp - 0.14, a);
          green(u, v0 + hp, -0.3);
        }
      }
      break;
    }
    case 'duplex': {
      const hp = 0.35 + o.solid * 0.8;
      if (o.ownFins) fins(-dp, 0); else cornerFins(dp);
      for (let j = 0; j < nb; j++) {
        const u = uc(j), w = bw - tw;
        const off = (o.rhythm === 'checker' || o.rhythm === 'alt') ? (j & 1) : 0;
        for (let i = 0; i < nF; i++) {
          const v0 = i * fh;
          const low = ((k0 + i + off) & 1) === 0;
          B.box(u, v0 + clear / 2, -dp - 0.03, w, clear, 0.06, P.G);
          const a = P.acc(i * 5 + j * 3 + o.seed);
          if (low) {
            B.box(u, v0 - ts / 2, -dp / 2, w, ts, dp, P.S);                              // floor tongue
            B.box(u, v0 + hp / 2, -0.07, w, hp, 0.1, (accAt === 'panels' && a) || P.I);  // parapet
            B.box(u, v0 + Math.min(2.26, clear - 0.2), -dp * 0.36, w, 0.09, dp * 0.6, P.I); // sun shelf
            green(u, v0 + hp, -0.3);
          } else {
            B.box(u, v0 + 0.5, -dp + 0.08, w, 1.0, 0.08, P.I);
          }
          if (a && accAt === 'reveals') B.box(u - w / 2 + 0.02, v0 + clear / 2, -dp / 2 - 0.02, 0.035, clear - 0.04, dp - 0.14, a);
          if (a && accAt === 'soffits' && !low) B.box(u, v0 + clear - 0.02, -dp / 2 - 0.02, w, 0.035, dp - 0.14, a);
        }
      }
      break;
    }
    case 'balcony': {
      const hp = 0.95 + 0.15 * o.solid, rail = o.solid < 0.3, th = rail ? 0.035 : 0.12;
      const bwid = bw * 0.84;
      for (let i = 0; i < nF; i++) {
        const v0 = i * fh;
        B.box(0, v0 - ts / 2, 0.06, W, ts, 0.16, P.I);          // slab edge trim
        for (let j = 0; j < nb; j++) {
          const u = uc(j);
          B.box(u, v0 + clear / 2, 0.05, bw - 0.02, clear, 0.06, P.G);
          if (!on(i, j) || (o.ground && i === 0)) continue;
          const a = P.acc(i * 5 + j * 3 + o.seed);
          const pp = (accAt === 'panels' && a) || (rail ? P.metal : P.I);
          B.box(u, v0 - 0.1, 0.14 + dp / 2, bwid, 0.2, dp, P.S);
          B.box(u, v0 + hp / 2, 0.14 + dp - th / 2 - 0.01, bwid, hp, th, pp);
          B.box(u - bwid / 2 + th / 2, v0 + hp / 2, 0.14 + dp / 2 - 0.01, th, hp, dp - 0.02, rail ? P.metal : P.I);
          B.box(u + bwid / 2 - th / 2, v0 + hp / 2, 0.14 + dp / 2 - 0.01, th, hp, dp - 0.02, rail ? P.metal : P.I);
          if (a && accAt === 'soffits') B.box(u, v0 - 0.215, 0.14 + dp / 2, bwid - 0.1, 0.03, dp - 0.1, a);
          green(u, v0 + hp, 0.14 + dp - 0.3, dp > 1.8);
        }
      }
      B.box(0, H - ts / 2, 0.06, W, ts, 0.16, P.I);
      break;
    }
    case 'ribbon': {
      const sill = 0.35 + o.solid * 1.0;
      for (let i = 0; i < nF; i++) {
        const v0 = i * fh;
        const a = P.acc(i * 5 + o.seed);
        B.box(0, v0 + (sill - ts) / 2, 0.1, W, sill + ts, 0.28, ((accAt === 'panels' && (i & 1)) ? a : null) || P.I);
        for (let j = 0; j < nb; j++) B.box(uc(j), v0 + sill + (clear - sill) / 2, 0.1, bw - 0.012, clear - sill, 0.06, P.G);
      }
      B.box(0, H - ts / 2, 0.1, W, ts, 0.28, P.I);
      break;
    }
    case 'fins': {
      const sill = 0.2 + o.solid * 0.7;
      for (let i = 0; i < nF; i++) {
        const v0 = i * fh;
        B.box(0, v0 + (sill - ts) / 2, 0.1, W, sill + ts, 0.24, P.I);
        for (let j = 0; j < nb; j++) B.box(uc(j), v0 + sill + (clear - sill) / 2, 0.1, bw - 0.012, clear - sill, 0.06, P.G);
      }
      B.box(0, H - ts / 2, 0.1, W, ts, 0.24, P.I);
      const n = nb * Math.max(1, o.finN), tf = 0.16;
      for (let q = 0; q <= n; q++) {
        const a = P.acc(q + o.seed);
        B.box(u0 + q * (W / n), H / 2, 0.22 + dp / 2, tf, H + 0.3, dp, P.S);
        if (a && accAt === 'reveals' && q < n) B.box(u0 + q * (W / n) + tf / 2 + 0.012, H / 2, 0.22 + dp / 2, 0.025, H, dp - 0.06, a);
      }
      B.box(0, H + 0.02, 0.22 + dp / 2, W + tf, 0.34, dp, P.S);
      break;
    }
    case 'grid': {
      const sill = 0.3 + o.solid * 0.9, cw = 0.5;
      for (let j = 0; j <= nb; j++) B.box(u0 + j * bw, H / 2, (dp - 0.1) / 2 + 0.02, cw, H, dp + 0.1, P.S);
      for (let i = 0; i <= nF; i++) B.box(0, i * fh - 0.25, (dp * 0.7 - 0.1) / 2, W, 0.6, dp * 0.7 + 0.1, P.S);
      for (let i = 0; i < nF; i++) {
        const v0 = i * fh;
        for (let j = 0; j < nb; j++) {
          const u = uc(j), a = P.acc(i * 3 + j + o.seed);
          const solidCell = !on(i, j);
          const hs = solidCell ? clear - 0.3 : sill;
          B.box(u, v0 + hs / 2 + 0.02, 0.03, bw - cw, hs, 0.1, ((accAt === 'panels' || accAt === 'reveals') && a) || P.I);
          if (!solidCell) B.box(u, v0 + sill + (clear - sill - 0.3) / 2, 0.03, bw - cw, clear - sill - 0.3, 0.06, P.G);
        }
      }
      break;
    }
    case 'pod': {
      B.box(0, H / 2 - ts / 2, 0.13, W, H + ts, 0.3, P.I);
      const pw = bw * 0.74, ph = Math.min(fh * 0.62, 2.6), tk = 0.14, z0 = 0.28;
      for (let i = 0; i < nF; i++) for (let j = 0; j < nb; j++) {
        const u = uc(j), vc = i * fh + fh * 0.5 - 0.1;
        if (!on(i, j)) { B.box(u, vc, z0 + 0.012, 0.46, ph * 0.85, 0.03, P.G); continue; }
        const zc = z0 + dp / 2, a = P.acc(i * 3 + j + o.seed);
        B.box(u, vc + ph / 2 - tk / 2, zc, pw, tk, dp, P.S);
        B.box(u, vc - ph / 2 + tk / 2, zc, pw, tk, dp, P.S);
        B.box(u - pw / 2 + tk / 2, vc, zc, tk, ph - 2 * tk, dp, P.S);
        B.box(u + pw / 2 - tk / 2, vc, zc, tk, ph - 2 * tk, dp, P.S);
        B.box(u, vc, z0 + dp * 0.3, pw - 2 * tk, ph - 2 * tk, 0.06, P.G);
        if (a && accAt === 'reveals') B.box(u, vc - ph / 2 + tk + 0.015, zc + dp * 0.1, pw - 2 * tk, 0.03, dp * 0.6, a);
      }
      break;
    }
    case 'gallery': {
      const hp = 1.1;
      for (let i = 0; i < nF; i++) {
        const v0 = i * fh;
        const deck = (o.rhythm === 'rows' ? ((k0 + i) & 1) === 0 : true) && !(o.ground && i === 0);
        B.box(0, v0 + clear / 2 - ts / 2, 0.1, W, clear + ts, 0.24, P.I);
        for (let j = 0; j < nb; j++) {
          const u = uc(j), a = P.acc(j * 3 + i + o.seed);
          if (deck || (o.ground && i === 0)) B.box(u - bw * 0.22, v0 + 1.05, 0.235, 0.95, 2.1, 0.04, a || P.wood);
          B.box(u + bw * 0.2, v0 + 1.55, 0.235, bw * 0.34, deck ? 1.0 : 1.3, 0.04, P.G);
        }
        if (deck) {
          const a = P.acc(i + o.seed);
          B.box(0, v0 - 0.11, 0.22 + dp / 2, W, 0.22, dp, P.S);
          B.box(0, v0 + hp / 2, 0.22 + dp - 0.09, W, hp, 0.16, (accAt === 'panels' && a) || P.I);
          if (a && accAt === 'soffits') B.box(0, v0 - 0.235, 0.22 + dp / 2, W - 0.1, 0.03, dp - 0.1, a);
        }
      }
      B.box(0, H - ts / 2, 0.1, W, ts, 0.24, P.I);
      break;
    }
    case 'punched':
    case 'slot': {
      const slot = type === 'slot';
      const th = clamp(dp, 0.3, 1.4);
      const winW = slot ? clamp(0.55 / bw, 0.08, 0.3) : lerp(0.8, 0.3, o.solid);
      const pw = bw * (1 - winW);
      const sill = slot ? 0.25 : 0.3 + o.solid * 0.8;
      const head = clear - (slot ? 0.2 : 0.3);
      const zc = -th / 2 + 0.02;
      for (let j = 0; j <= nb; j++) {
        let u = u0 + j * bw, w = pw;
        if (j === 0) { u += pw / 4; w = pw / 2; } else if (j === nb) { u -= pw / 4; w = pw / 2; }
        B.box(u, (H - ts) / 2, zc + 0.012, w, H + ts, th, P.S);
      }
      for (let i = 0; i <= nF; i++) {
        const a = i === 0 ? -ts : (i - 1) * fh + head, b = i === nF ? H : i * fh + sill;
        B.box(0, (a + b) / 2, zc, W, b - a, th, P.S);
      }
      for (let i = 0; i < nF; i++) for (let j = 0; j < nb; j++) {
        const u = uc(j), ww = bw - pw;
        if (on(i, j)) {
          B.box(u, i * fh + (sill + head) / 2, -th + 0.1, ww, head - sill, 0.06, P.G);
          const a = P.acc(i * 3 + j + o.seed);
          if (a && accAt === 'reveals' && th > 0.4) B.box(u - ww / 2 + 0.014, i * fh + (sill + head) / 2, -th / 2 + 0.05, 0.03, head - sill, th - 0.16, a);
        } else B.box(u, i * fh + (sill + head) / 2, zc - 0.03, ww, head - sill, th, P.I);
      }
      break;
    }
    default: { // blank
      B.box(0, H / 2 - ts / 2, 0.13, W, H + ts, 0.3, P.S);
      if (o.rhythm === 'random') {
        const n = Math.floor((W * H) / 70);
        for (let q = 0; q < n; q++) {
          const w = 1 + R() * 3.5, h = 0.8 + R() * 3, t = 0.12 + R() * 0.4;
          const u = (R() - 0.5) * (W - w - 0.6), v = 0.6 + R() * Math.max(0.1, H - h - 1.2) + h / 2;
          if (R.chance(0.3)) B.box(u, v, 0.285, 0.4, Math.min(2.6, h + 1), 0.03, P.G);
          else B.box(u, v, 0.28 + t / 2, w, h, t, P.I);
        }
      } else if (o.side === 'end' && W > 8 && H > 9) {
        B.box(0, H / 2, 0.285, 0.55, H - 3.2, 0.03, P.G);      // one stair light up the gable
      }
    }
  }
}
