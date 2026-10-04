// Whole estates laid out in one gesture, each after a planning doctrine of the period.
import { makeDNA } from './arch/dna.js';
import { BUILD_R } from './world/ground.js';
import { rng, clamp } from './util.js';

export const DOCTRINES = {
  radiant: { label: 'Towers in the park', blurb: 'Tall blocks stand far apart on open ground, all turned to the same sun. The ground is lawn and trees. After the Ville Radieuse.' },
  streets: { label: 'Streets in the sky', blurb: 'Long deck-access blocks join end to end and bend around courts, so a milk float could drive along the third floor. After Park Hill.' },
  lowrise: { label: 'Low-rise, high-density', blurb: 'Stepped terraces face each other across a pedestrian street. Every flat gets a terrace and nobody lives above the sixth floor.' },
  micro: { label: 'Microrayon', blurb: 'Precast slabs ring a green with a school and a kindergarten at its centre, everything a family needs within a short walk.' },
  metabolist: { label: 'Metabolist', blurb: 'A megastructure spine carries services; capsule towers and drums plug in beside it and can be replaced as the city grows.' },
  civic: { label: 'Civic centre', blurb: 'A hall on a plinth at the head of a pool, offices either side, a monument at the foot. One axis, held by trees.' },
};

export function layEstate(app, rect, doctrine) {
  const { city, ground, props } = app;
  const R = rng((Math.random() * 1e9) | 0);
  const c = Math.cos(rect.rot), s = Math.sin(rect.rot);
  const W = rect.w, D = rect.d;
  const P = (lx, lz) => [rect.x + lx * c + lz * s, rect.z - lx * s + lz * c];
  const made = [];
  const put = (type, preset, lx, lz, rot = 0, over = {}) => {
    const p = P(lx, lz);
    if (Math.hypot(p[0], p[1]) > BUILD_R) return null;
    const b = city.add({ ...makeDNA(type, preset), seed: R.int(1, 998), age: clamp(0.2 + R() * 0.3, 0, 1), ...over }, p[0], p[1], rect.rot + rot, { rise: true, year: app.years });
    b.rise.t = -made.length * 0.18;            // one after another
    made.push(b); return b;
  };
  const shape = (o) => {
    if (o.t === 'line') { const pts = []; for (let i = 0; i < o.pts.length; i += 2) { const p = P(o.pts[i], o.pts[i + 1]); pts.push(+p[0].toFixed(1), +p[1].toFixed(1)); } ground.shapes.push({ ...o, pts }); }
    else { const p = P(o.x, o.z); ground.shapes.push({ ...o, x: p[0], z: p[1], rot: rect.rot + (o.rot || 0) }); }
  };
  const trees = (lx, lz, r, n, k = 'mix') => { const p = P(lx, lz); props.grove(p[0], p[1], r, n, k, 11, R); };
  const treeRow = (x0, z0, x1, z1, sp, k = 'round', h = 12) => { const a = P(x0, z0), b = P(x1, z1); props.row(a[0], a[1], b[0], b[1], sp, k, h, 0.4, R); };
  const lamps = (x0, z0, x1, z1, sp = 28) => { const a = P(x0, z0), b = P(x1, z1); props.lampRow(a[0], a[1], b[0], b[1], sp); };
  const H = Math.PI / 2;

  switch (doctrine) {
    case 'radiant': {
      shape({ t: 'rect', k: 'lawn', x: 0, z: 0, w: W, d: D });
      const nx = Math.max(1, Math.floor(W / 150)), nz = Math.max(1, Math.floor(D / 120));
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
        const x = ((i + 0.5) / nx - 0.5) * W, z = ((k + 0.5) / nz - 0.5) * D;
        if ((i + k) % 3 === 2) put('tower', R.pick(['Point block', 'Barbican', 'Trellick']), x, z, R.pick([0, H]), { floors: R.int(20, 34) });
        else put('slab', 'Marseille', x, z, H, { bays: clamp(Math.round((D / nz - 34) / 3.9), 8, 26), floors: R.int(12, 18), accent: R.pick(['poly', 'red', 'ochre', 'blue']) });
        trees(x + (R() - 0.5) * 30, z + 44, 16, 6);
      }
      shape({ t: 'line', k: 'paving', pts: [-W / 2, -D / 2, W / 2, D / 2], w: 4 });
      shape({ t: 'line', k: 'paving', pts: [-W / 2, D / 2, W / 2, -D / 2], w: 4 });
      shape({ t: 'line', k: 'asphalt', pts: [-W / 2, -D / 2 - 6, W / 2, -D / 2 - 6], w: 9 });
      treeRow(-W / 2, -D / 2 + 6, W / 2, -D / 2 + 6, 10, 'poplar', 18);
      break;
    }
    case 'streets': {
      shape({ t: 'rect', k: 'lawn', x: 0, z: 0, w: W, d: D });
      // a chain of blocks walking across the site, turning at each joint
      let x = -W / 2 + 20, z = -D / 2 + 30, ang = 0;
      const turnA = [0.9, -0.9, -0.9, 0.9, 0.9, -0.9];
      for (let i = 0; i < 8; i++) {
        const len = clamp(60 + R() * 50, 50, 120);
        const ex = x + Math.cos(ang) * len, ez = z + Math.sin(ang) * len;
        if (Math.abs(ex) > W / 2 - 8 || Math.abs(ez) > D / 2 - 8) { ang += turnA[i % 6] * 1.4; continue; }
        put('slab', 'Park Hill', (x + ex) / 2, (z + ez) / 2, -ang, { bays: Math.round(len / 3.4), floors: clamp(7 + i + R.int(-1, 2), 5, 14), accent: R.pick(['ochre', 'red', 'orange']), core: 'ends' });
        trees((x + ex) / 2 - Math.sin(ang) * 34, (z + ez) / 2 + Math.cos(ang) * 34, 14, 5);
        x = ex + Math.cos(ang) * 4; z = ez + Math.sin(ang) * 4; ang += turnA[i % 6];
      }
      shape({ t: 'line', k: 'paving', pts: [-W / 2 + 10, D / 2 - 10, 0, 0, W / 2 - 10, D / 2 - 14], w: 4 });
      break;
    }
    case 'lowrise': {
      const pairs = Math.max(1, Math.floor(D / 96));
      for (let k = 0; k < pairs; k++) {
        const z = ((k + 0.5) / pairs - 0.5) * D, bays = clamp(Math.round((W - 20) / 4.2), 8, 40);
        shape({ t: 'rect', k: 'paving', x: 0, z, w: W - 8, d: 15 });
        put('terrace', 'Alexandra Road', 0, z - 24, 0, { bays, floors: R.int(5, 7), planting: 0.9 });
        put('terrace', 'Alexandra Road', 0, z + 24, Math.PI, { bays, floors: R.int(4, 6), planting: 0.9 });
        treeRow(-W / 2 + 12, z, W / 2 - 12, z, 16, 'round', 9);
        lamps(-W / 2 + 12, z + 5, W / 2 - 12, z + 5, 30);
        if (k < pairs - 1) shape({ t: 'rect', k: 'lawn', x: 0, z: z + D / pairs / 2, w: W - 8, d: 14 });
      }
      break;
    }
    case 'micro': {
      shape({ t: 'rect', k: 'lawn', x: 0, z: 0, w: W - 40, d: D - 40 });
      const nx = Math.max(1, Math.floor((W - 60) / 100)), nz = Math.max(1, Math.floor((D - 60) / 100));
      for (let i = 0; i < nx; i++) for (const sd of [-1, 1]) put('slab', 'Microrayon', ((i + 0.5) / nx - 0.5) * (W - 60), sd * (D / 2 - 14), sd > 0 ? Math.PI : 0, { bays: clamp(Math.round(((W - 60) / nx - 16) / 3.2), 8, 30), floors: R.pick([9, 9, 12, 16]) });
      for (let k = 0; k < nz; k++) for (const sd of [-1, 1]) put('slab', 'Microrayon', sd * (W / 2 - 14), ((k + 0.5) / nz - 0.5) * (D - 110), sd > 0 ? -H : H, { bays: clamp(Math.round(((D - 110) / nz - 16) / 3.2), 6, 24), floors: R.pick([5, 9, 9]) });
      put('hall', 'Works', 0, 0, 0, { width: clamp(W * 0.2, 24, 48), length: clamp(D * 0.14, 16, 40), height: 7.5, roof: 'flat', walls: 'slots', portico: 'canopy', plinth: 0.5 });
      put('drum', 'Rotunda', W * 0.2, D * 0.16, 0, { radius: 11, floors: 2, floorH: 4 });
      put('tower', 'Point block', -W * 0.26, D * 0.2, 0, { floors: 18 });
      shape({ t: 'rect', k: 'gravel', x: -W * 0.12, z: -D * 0.18, w: 26, d: 18 });
      shape({ t: 'line', k: 'paving', pts: [-W / 2 + 30, -D / 2 + 30, 0, 0, W / 2 - 30, D / 2 - 30], w: 4 });
      shape({ t: 'line', k: 'paving', pts: [-W / 2 + 30, D / 2 - 30, 0, 0, W / 2 - 30, -D / 2 + 30], w: 4 });
      for (let i = 0; i < 8; i++) trees((R() - 0.5) * (W - 110), (R() - 0.5) * (D - 110), 12, 5, 'round');
      break;
    }
    case 'metabolist': {
      const long = W >= D, Lm = Math.max(W, D), S = Math.min(W, D);
      const spine = (t, off) => long ? [t, off] : [off, t];
      shape({ t: 'line', k: 'asphalt', pts: [...spine(-Lm / 2, 0), ...spine(Lm / 2, 0)], w: 12 });
      const nm = Math.max(1, Math.floor(Lm / 130));
      for (let i = 0; i < nm; i++) {
        const t = ((i + 0.5) / nm - 0.5) * Lm, p = spine(t, 0);
        put('mega', R.pick(['Tbilisi', 'Space frame']), p[0], p[1], long ? 0 : H, { bars: R.int(3, 6), barL: clamp(Lm / nm * 0.8, 50, 110), lift: 12 });
      }
      const nt = Math.max(2, Math.floor(Lm / 70));
      for (let i = 0; i < nt; i++) {
        const t = ((i + 0.5) / nt - 0.5) * Lm, side = (i & 1) ? 1 : -1, p = spine(t, side * Math.min(S / 2 - 22, 90));
        if (i % 3 === 2) put('drum', R.pick(['Corn cob', 'Torres', 'Saucer']), p[0], p[1], 0);
        else put('capsule', R.pick(['Nakagin', 'Helix', 'Colony']), p[0], p[1], R() * 3);
        const q = spine(t, side * Math.min(S / 2 - 22, 90) * 0.5);
        put('deck', 'Walkway', q[0], q[1], long ? H : 0, { length: Math.min(S / 2 - 22, 90) * 0.9, deckH: 7, stairs: 1 });
      }
      break;
    }
    default: { // civic
      shape({ t: 'rect', k: 'paving', x: 0, z: 0, w: W, d: D, r: 4 });
      const pool = clamp(D * 0.42, 30, 170);
      shape({ t: 'rect', k: 'water', x: 0, z: D * 0.06, w: clamp(W * 0.12, 8, 18), d: pool });
      put('hall', R.pick(['Assembly', 'Theatre', 'Kunsthalle']), 0, -D / 2 + 46, 0, { width: clamp(W * 0.36, 30, 70), length: 54 });
      put('monument', R.pick(['Wings', 'Flower', 'Needle', 'Eye']), 0, D / 2 - 26, R() * 0.6);
      if (W > 150) { put('cantilever', 'City Hall', -W / 2 + 44, -D * 0.1, H, { bays: 8, depth: 30 }); put('cantilever', 'Library', W / 2 - 44, -D * 0.1, -H); }
      for (const sd of [-1, 1]) { treeRow(sd * clamp(W * 0.12, 14, 22), D * 0.06 - pool / 2, sd * clamp(W * 0.12, 14, 22), D * 0.06 + pool / 2, 12); lamps(sd * clamp(W * 0.2, 22, 34), -D / 2 + 90, sd * clamp(W * 0.2, 22, 34), D / 2 - 40); }
      break;
    }
  }
  ground.redraw();
  city.apronsDirty = true;
  return made;
}
