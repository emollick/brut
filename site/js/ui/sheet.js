// Drawing furniture for the line lenses: a title block, a north point, a scale bar,
// and in parallel projections the name of each building.
import * as THREE from 'three';
import { el, dayLabel, hourLabel } from './ui.js';

const PROJ = { orbit: 'Perspective', iso: 'Isometric', oblique: 'Plan oblique', plan: 'Plan', elevation: 'Elevation', walk: 'Eye level' };
const STEPS = [5, 10, 20, 50, 100, 200, 500, 1000];

export function installSheet(app, root, canvas) {
  const { rig, pipe, env, city } = app;
  const title = el('b'), sub = el('span');
  const bar = el('div', 'scalebar', [el('i'), el('i'), el('em', null, '0'), el('em'), el('em')]);
  const north = el('div', 'north', null, { html: '<svg viewBox="0 0 40 40" width="46" height="46"><circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" stroke-width="1.6"/><polygon points="20,2 26,22 20,18 14,22"/><text x="20" y="38" text-anchor="middle" font-size="0">N</text></svg><em>N</em>' });
  const block = el('div', 'tblock', [title, sub, bar]);
  const labels = el('div', 'dlabels');
  const box = el('div', 'drawing', [labels, north, block]); box.hidden = true;
  root.append(box);
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  const pool = [];
  let n = 0;
  app.hooks.push(() => {
    const show = pipe.lensCfg.id === 2 && !app.titleUp && !app.hideUI;
    if (box.hidden === show) box.hidden = !show;
    if (!show || (n++ % 2)) return false;
    const r = canvas.getBoundingClientRect();
    title.textContent = app.name;
    sub.textContent = `${PROJ[app.view] || 'Perspective'} · ${dayLabel(env.day)}, ${hourLabel(env.hour)}`;
    // scale bar: only honest when the projection has one scale
    const flat = rig.ortho;
    bar.style.display = flat ? '' : 'none';
    if (flat) {
      let L = STEPS[STEPS.length - 1];
      for (const s of STEPS) if (s * rig.pxPerM >= 84) { L = s; break; }
      bar.style.width = (L * rig.pxPerM).toFixed(1) + 'px';
      bar.children[3].textContent = String(L / 2); bar.children[4].textContent = L + ' m';
    }
    // north point
    rig.project(p.set(rig.c.tx, 0, rig.c.tz), p); rig.project(q.set(rig.c.tx, 0, rig.c.tz - 40), q);
    const ang = Math.atan2((q.x - p.x) * r.width, (q.y - p.y) * r.height);
    north.firstChild.style.transform = `rotate(${ang.toFixed(3)}rad)`;
    // names
    const want = flat ? city.list : [];
    while (pool.length < want.length) { const e = el('span'); labels.append(e); pool.push(e); }
    for (let i = 0; i < pool.length; i++) {
      const e = pool[i], b = want[i];
      if (!b) { if (e.style.display !== 'none') e.style.display = 'none'; continue; }
      const f = b.stats.foot || { cx: 0, cz: 0 }, w = b.toWorld(f.cx || 0, f.cz || 0, [0, 0]);
      rig.project(p.set(w[0], b.y + (b.stats.height || 0), w[1]), p);
      if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) { e.style.display = 'none'; continue; }
      e.style.display = '';
      if (e.textContent !== b.name) e.textContent = b.name;
      e.style.transform = `translate(${((p.x * 0.5 + 0.5) * r.width).toFixed(1)}px,${((-p.y * 0.5 + 0.5) * r.height).toFixed(1)}px)`;
    }
    return false;
  });
}
