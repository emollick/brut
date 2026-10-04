// Dispatch: DNA -> instances.
import { TYPES, sanitize } from './dna.js';
import { rng } from '../util.js';
import { genBar } from './bar.js';
import { genCluster, genCapsule, genDrum, genMega, genHall, genMonument, genWorks, genDeck } from './forms.js';

const GEN = { bar: genBar, cluster: genCluster, capsule: genCapsule, drum: genDrum, mega: genMega, hall: genHall, monument: genMonument, works: genWorks, deck: genDeck };

export function generate(B, dna) {
  const d = sanitize({ ...dna });
  const T = TYPES[d.type];
  B.begin();
  const R = rng((d.seed | 0) * 7919 + 101);
  GEN[T.gen](B, d, R);
  B.frame(0, 0, 0, 0);
  if (!B.stats.foot) B.stats.foot = { w: 20, d: 20, cx: 0, cz: 0 };
  if (!B.masses.length) B.mass(0, 5, 0, 10, 10, 10);
  if (!B.lights.length) for (const p of (B.stats.doors || [])) B.light(p[0], 3, p[1], B.stats.civic ? 1.8 : 1);
  return B.stats;
}
