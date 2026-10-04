// The city you arrive in: an estate laid out on one long axis of water.
import { makeDNA } from './arch/dna.js';
import { rng } from './util.js';

export function demoCity(app) {
  const { city, ground, props } = app;
  const R = rng(1971);
  const rnd = () => R();
  const put = (type, preset, x, z, rot = 0, over = {}) => city.add({ ...makeDNA(type, preset), ...over }, x, z, rot);
  const S = ground.shapes;
  const H = Math.PI / 2;

  // ---- ground works ----
  const ring = [];
  for (let i = 0; i <= 48; i++) {
    const a = i / 48 * Math.PI * 2, rx = 392, rz = 372;
    const k = Math.pow(Math.abs(Math.cos(a)), 0.7) * Math.sign(Math.cos(a)), s = Math.pow(Math.abs(Math.sin(a)), 0.7) * Math.sign(Math.sin(a));
    ring.push(k * rx, s * rz);
  }
  S.push({ t: 'line', k: 'asphalt', pts: ring, w: 10 });
  S.push({ t: 'line', k: 'asphalt', pts: [392, -30, 270, -40, 250, -170], w: 8 });
  S.push({ t: 'line', k: 'asphalt', pts: [-392, 60, -250, 70, -215, 150, -215, 250, -150, 368], w: 8 });
  S.push({ t: 'line', k: 'asphalt', pts: [60, 372, 70, 290, 150, 268, 268, 250, 372, 150], w: 8 });
  S.push({ t: 'line', k: 'asphalt', pts: [-250, -372, -262, -250, -300, -170, -392, -120], w: 8 });
  // the esplanade and its water
  S.push({ t: 'rect', k: 'paving', x: 0, z: -15, w: 78, d: 400 });
  S.push({ t: 'rect', k: 'paving', x: 0, z: -205, w: 150, d: 110 });
  S.push({ t: 'rect', k: 'paving', x: 0, z: 196, w: 110, d: 70, r: 6 });
  S.push({ t: 'rect', k: 'water', x: 0, z: 2, w: 17, d: 196 });
  S.push({ t: 'rect', k: 'water', x: 0, z: -128, w: 46, d: 30 });
  // lawns and cross paths
  for (const s of [-1, 1]) {
    S.push({ t: 'rect', k: 'lawn', x: s * 27, z: 2, w: 14, d: 196 });
    S.push({ t: 'line', k: 'paving', pts: [s * 39, -70, s * 150, -70], w: 5 });
    S.push({ t: 'line', k: 'paving', pts: [s * 39, 40, s * 170, 40], w: 5 });
    S.push({ t: 'line', k: 'paving', pts: [s * 39, 130, s * 120, 150, s * 190, 210], w: 4 });
  }
  S.push({ t: 'line', k: 'paving', pts: [-150, -70, -230, -120, -262, -250], w: 5 });
  S.push({ t: 'line', k: 'paving', pts: [150, -70, 190, -120, 250, -170], w: 5 });
  S.push({ t: 'disc', k: 'water', x: 232, z: 196, rx: 26, rz: 20 });
  S.push({ t: 'disc', k: 'lawn', x: -215, z: -20, rx: 60, rz: 46 });
  S.push({ t: 'rect', k: 'gravel', x: -168, z: 222, w: 70, d: 30, rot: 0.3 });

  // ---- civic axis ----
  put('hall', 'Assembly', 0, -214, 0, { width: 62, length: 58, height: 19, plinth: 2.5, finish: 'panel', value: 0.6, tone: 0.5, age: 0.12 });
  put('monument', 'Wings', 0, 198, 0.5, { height: 34, mound: 2.5, age: 0.18 });
  put('cantilever', 'Library', 104, -232, 0.12, { age: 0.1, value: 0.62 });
  put('hall', 'Theatre', -110, -232, -0.1, { width: 44, length: 56, age: 0.16 });

  // ---- housing: slabs in echelon to the east ----
  put('slab', 'Marseille', 112, -86, H + 0.05, { seed: 3, age: 0.14 });
  put('slab', 'Marseille', 178, 22, H + 0.05, { seed: 4, bays: 20, age: 0.16, accent: 'poly' });
  put('slab', 'Marseille', 112, 128, H + 0.05, { seed: 5, bays: 18, floors: 15, age: 0.12 });
  // terraces stepping down to the water on the west
  put('terrace', 'Alexandra Road', -86, -10, H, { bays: 34, age: 0.14, planting: 0.9, seed: 8 });
  put('cluster', 'Habitat', -196, 92, 0.18, { seed: 12, age: 0.1 });
  put('slab', 'Park Hill', -236, -52, 0.5, { bays: 26, floors: 9, age: 0.19, seed: 9 });
  // towers
  put('tower', 'Trellick', -160, -168, 0.25, { age: 0.18 });
  put('tower', 'Barbican', -246, -152, 0.9, { floors: 38, age: 0.16 });
  put('tower', 'Torre', -208, -258, -0.35, { floors: 30, age: 0.1 });
  put('drum', 'Corn cob', 214, 150, 0, { floors: 28, age: 0.12 });
  put('drum', 'Corn cob', 262, 236, 0, { floors: 22, radius: 10, age: 0.14, seed: 2 });
  put('capsule', 'Nakagin', 80, 236, 0.4, { age: 0.1 });
  // work
  put('mega', 'Tbilisi', 236, -196, 0.35, { age: 0.12 });
  put('slab', 'Ministry', 300, -52, H - 0.2, { bays: 14, age: 0.1 });
  put('deck', 'Car park', -168, 222, 0.3, { age: 0.18 });
  put('works', 'Water tower', -300, 232, 0, { age: 0.21 });
  put('works', 'Stack', 322, 96, 0, { height: 96, age: 0.18 });
  put('deck', 'Walkway', -40, -130, H, { length: 70, deckH: 5.5, stairs: 2 });

  // ---- trees ----
  for (const s of [-1, 1]) {
    props.row(s * 14, -92, s * 14, 96, 12.5, 'round', 12, 0.3, rnd);
    props.row(s * 34, -100, s * 34, 106, 12.5, 'round', 13, 0.3, rnd);
    props.lampRow(s * 39, -150, s * 39, 150, 30);
  }
  // poplars on the ring road
  for (let i = 0; i < ring.length - 2; i += 2) {
    const x0 = ring[i], z0 = ring[i + 1], x1 = ring[i + 2], z1 = ring[i + 3];
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l;
    props.row(x0 + nx * 9, z0 + nz * 9, x1 + nx * 9, z1 + nz * 9, 9, 'poplar', 19, 1.2, rnd);
    if ((i / 2) % 2 === 0) props.addLamp(x0 - nx * 7, z0 - nz * 7, 8);
  }
  const groves = [[150, -150, 30, 16], [60, -20, 16, 6], [62, 84, 20, 9], [-150, 40, 26, 14], [-150, -90, 22, 10], [-300, -30, 34, 20], [150, 222, 26, 12], [-60, 262, 34, 18], [300, 180, 30, 16], [20, -300, 36, 16], [-330, 130, 30, 18], [300, -270, 34, 18], [-80, 150, 20, 8], [226, 70, 18, 8]];
  for (const [x, z, r, n] of groves) props.grove(x, z, r, n, 'mix', 11, rnd);
  props.grove(-215, -20, 40, 9, 'round', 15, rnd);
  for (let i = 0; i < 90; i++) {
    const a = rnd() * 6.283, r = 410 + rnd() * 60;
    props.grove(Math.cos(a) * r, Math.sin(a) * r, 14, 3, rnd() < 0.5 ? 'pine' : 'round', 12, rnd);
  }
  for (const b of city.list) b.year = 0;
  app.years = 26;
  city.syncAprons();
}
