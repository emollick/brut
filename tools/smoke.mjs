// Headless check of the generators: every type, every preset, plus random mutations.
//   node tools/smoke.mjs
import { register } from 'node:module';
register('./three-hook.mjs', import.meta.url);
const { Builder } = await import('../site/js/gfx/batch.js');
const { generate } = await import('../site/js/arch/gen.js');
const { TYPES, TYPE_ORDER, makeDNA, mutate, randomize } = await import('../site/js/arch/dna.js');
const { rng } = await import('../site/js/util.js');

const B = new Builder();
let fails = 0, total = 0, maxN = 0;
const check = (label, d) => {
  total++;
  try {
    const s = generate(B, d);
    let bad = 0;
    for (const b of B.b) for (let i = 0; i < b.n * 16; i++) if (!Number.isFinite(b.M[i])) { bad++; break; }
    if (bad || !(s.height >= 0) || B.count === 0) { fails++; console.log('BAD ', label, { bad, height: s.height, count: B.count }); }
    maxN = Math.max(maxN, B.count);
    return B.count;
  } catch (e) { fails++; console.log('THROW', label, e.stack.split('\n').slice(0, 3).join(' | ')); return 0; }
};
for (const t of TYPE_ORDER) {
  const T = TYPES[t], row = [];
  row.push('base:' + check(t + '/base', makeDNA(t)));
  for (const p of Object.keys(T.presets)) row.push(p + ':' + check(t + '/' + p, makeDNA(t, p)));
  console.log(t.padEnd(11), row.join('  '));
  const R = rng(t.length * 977 + 5);
  for (let i = 0; i < 300; i++) check(t + '/random' + i, randomize(t, R));
  let d = makeDNA(t);
  for (let i = 0; i < 300; i++) { d = mutate(d, 1, R); check(t + '/walk' + i, d); }
}
console.log(`${total} generated, ${fails} failed, largest ${maxN} instances`);
process.exit(fails ? 1 : 0);
