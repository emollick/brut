// Pointer, wheel, touch and keys: the camera, and whichever tool is in hand.
import * as THREE from 'three';
import { Builder, BatchSet } from '../gfx/batch.js';
import { generate } from '../arch/gen.js';
import { TYPES, makeDNA, PARAMS } from '../arch/dna.js';
import { BUILD_R } from '../world/ground.js';
import { clamp, rng } from '../util.js';

// which parameter a placing drag stretches, and metres per unit of it
const STRETCH = { bar: ['bays', d => d.bayW], cluster: ['nx', d => d.mW], hall: ['width', () => 1], mega: ['barL', () => 1], deck: ['width', () => 1] };

export function installInput(app, canvas, overlay) {
  const { rig, city, ground, props, pipe } = app;
  const o = new THREE.Vector3(), d = new THREE.Vector3(), gp = new THREE.Vector3();
  const keys = new Set();
  const ghostB = new Builder(), ghost = new BatchSet('world');
  ghost.obj.y = 1; ghost.castShadow = false; ghost.group.visible = false;
  app.scene.add(ghost.group);
  let ghostKey = '', ghostOn = false;
  const st = { down: false, btn: 0, x: 0, y: 0, sx: 0, sy: 0, moved: false, mode: null, id: -1, anchor: null, grabOff: null, pts: null, last: null };
  const touches = new Map();
  let pinch = null;

  const ndc = (e) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)]; };
  const groundAt = (e, y = 0) => { const n = ndc(e); return rig.groundPoint(n[0], n[1], y, gp) ? gp.clone() : null; };
  const pickAt = (e) => { const n = ndc(e); rig.ray(n[0], n[1], o, d); return city.pick(o, d); };

  // ---------------------------------------------------------------- ghost
  function setGhost(dna, x, z, rot, y = 0) {
    const key = JSON.stringify(dna);
    if (key !== ghostKey) { generate(ghostB, dna); ghost.sync(ghostB, pipe); ghostKey = key; ghost.obj.y = 1; }
    ghost.group.position.set(x, y, z); ghost.group.rotation.set(0, rot, 0); ghost.group.updateMatrixWorld(true);
    if (!ghostOn) { ghostOn = true; ghost.group.visible = true; for (const m of ghost.meshes) if (m) m.userData.hidden = false; }
    app.touch();
  }
  function hideGhost() {
    if (!ghostOn) return;
    ghostOn = false; ghost.group.visible = false;
    for (const m of ghost.meshes) if (m) m.userData.hidden = true;
    app.touch();
  }
  app.hideGhost = hideGhost;
  function toolDNA() {
    const t = app.tool;
    if (!t.dna) t.dna = { ...makeDNA(t.type, t.preset), seed: 1 + ((Math.random() * 998) | 0) };
    return t.dna;
  }

  // ---------------------------------------------------------------- overlay previews
  const svgNS = 'http://www.w3.org/2000/svg';
  const prev = document.createElementNS(svgNS, 'polygon'); prev.setAttribute('class', 'prev'); overlay.appendChild(prev);
  const prevL = document.createElementNS(svgNS, 'polyline'); prevL.setAttribute('class', 'prevl'); overlay.appendChild(prevL);
  const proj = new THREE.Vector3();
  const toScreen = (x, y, z) => { rig.project(proj.set(x, y, z), proj); const r = canvas.getBoundingClientRect(); return [(proj.x * 0.5 + 0.5) * r.width, (-proj.y * 0.5 + 0.5) * r.height, proj.z]; };
  app.toScreen = toScreen;
  let preview = null;         // {kind:'rect'|'line', ...} redrawn every frame so it follows the camera
  app.hooks.push(() => {
    if (!preview) { prev.setAttribute('points', ''); prevL.setAttribute('points', ''); return false; }
    if (preview.kind === 'rect') {
      const c = rectCorners(preview);
      prev.setAttribute('points', c.map(p => { const s = toScreen(p[0], 0.05, p[1]); return s[0].toFixed(1) + ',' + s[1].toFixed(1); }).join(' '));
      prevL.setAttribute('points', '');
    } else {
      const p = preview.pts, out = [];
      for (let i = 0; i < p.length; i += 2) { const s = toScreen(p[i], 0.05, p[i + 1]); out.push(s[0].toFixed(1) + ',' + s[1].toFixed(1)); }
      prevL.setAttribute('points', out.join(' ')); prev.setAttribute('points', '');
      prevL.style.strokeWidth = Math.max(2, preview.w * rig.pxPerM / (rig.ortho ? 1 : Math.max(20, rig.c.dist))) + 'px';
    }
    return false;
  });
  function rectCorners(p) {
    const c = Math.cos(p.rot), s = Math.sin(p.rot), hw = p.w / 2, hd = p.d / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c]);
  }
  // a rectangle dragged corner to corner, squared up to the way the camera is facing
  function dragRect(a, b) {
    const rot = Math.round(rig.c.yaw / (Math.PI / 12)) * (Math.PI / 12);
    const c = Math.cos(rot), s = Math.sin(rot), dx = b.x - a.x, dz = b.z - a.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    return { kind: 'rect', x: mx, z: mz, w: Math.abs(lx), d: Math.abs(lz), rot };
  }

  // ---------------------------------------------------------------- pointer
  function onDown(e) {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { cancelDrag(); pinch = pinchState(); return; }
      if (touches.size > 2) return;
    }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events have no capture */ }
    canvas.focus({ preventScroll: true });
    st.down = true; st.btn = e.button; st.x = st.sx = e.clientX; st.y = st.sy = e.clientY; st.moved = false; st.id = e.pointerId;
    st.mode = null; st.anchor = null; st.pts = null;
    if (rig.mode === 'walk') { st.mode = 'look'; if (e.pointerType === 'mouse' && canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch (err) { /* not allowed */ } } return; }
    if (e.button === 2 || (e.button === 0 && e.altKey)) { st.mode = 'orbit'; return; }
    if (e.button === 1 || (e.button === 0 && keys.has(' '))) { st.mode = 'pan'; st.anchor = groundAt(e); return; }
    const t = app.tool, g = groundAt(e);
    if (t.mode === 'select') {
      const hit = pickAt(e);
      if (hit) {
        app.select(hit.b);
        st.mode = 'move'; st.b = hit.b;
        const gg = groundAt(e, hit.b.y) || g;
        st.grabOff = gg ? [hit.b.x - gg.x, hit.b.z - gg.z] : [0, 0];
      } else { st.mode = e.pointerType === 'touch' ? 'pan' : 'panOrDeselect'; st.anchor = g; }
    } else if (t.mode === 'build') {
      if (!g) return;
      st.mode = 'place'; st.anchor = placePoint(e) || g; st.rot = app.lastBuild.rot || 0;
    } else if (t.mode === 'ground') {
      if (!g) return;
      st.anchor = g;
      if (t.shape === 'line') { st.mode = 'line'; st.pts = [g.x, g.z]; }
      else st.mode = 'rect';
    } else if (t.mode === 'tree' || t.mode === 'lamp') {
      if (!g) return;
      st.mode = 'scatter'; st.last = g; scatter(g);
    } else if (t.mode === 'erase') {
      if (!g) return;
      st.mode = 'erase'; st.pts = [g.x, g.z]; props.eraseNear(g.x, g.z, 9);
    } else if (t.mode === 'estate') {
      if (!g) return; st.mode = 'rect'; st.anchor = g;
    } else if (t.mode === 'raze') {
      const hit = pickAt(e); if (hit) app.demolish(hit.b);
    } else if (t.mode === 'walk') {
      if (g) { app.setView('walk', { x: g.x, z: g.z }); app.setTool({ mode: 'select' }); }
    }
  }
  function placePoint(e) {
    if (app.stack) { const hit = pickAt(e); if (hit) { const n = ndc(e); rig.ray(n[0], n[1], o, d); const p = o.clone().addScaledVector(d, hit.t + 0.5); const y = city.roofAt(p.x, p.z); p.y = y; return p; } }
    const g = groundAt(e); if (g) g.y = 0; return g;
  }
  function scatter(g) {
    const t = app.tool;
    if (t.mode === 'tree') {
      const n = t.brush > 1 ? 3 : 1;
      for (let i = 0; i < n; i++) props.addTree(g.x + (Math.random() - 0.5) * (n > 1 ? 14 : 0), g.z + (Math.random() - 0.5) * (n > 1 ? 14 : 0), (t.kind === 'poplar' ? 17 : 11) * (0.8 + Math.random() * 0.45), t.kind || 'round');
    } else props.addLamp(g.x, g.z, 6.5);
  }

  function onMove(e) {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size >= 2) { doPinch(); return; }
    }
    if (document.pointerLockElement === canvas) { rig.orbit(-e.movementX * 0.0022, e.movementY * 0.0022); return; }
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.down) { hoverMove(e); return; }
    if (e.pointerId !== st.id) return;
    st.x = e.clientX; st.y = e.clientY;
    if (!st.moved && Math.hypot(e.clientX - st.sx, e.clientY - st.sy) > 4) st.moved = true;
    if (!st.moved) return;
    const t = app.tool;
    switch (st.mode) {
      case 'look': rig.orbit(-dx * 0.004, dy * 0.004); break;
      case 'orbit': rig.orbit(-dx * 0.0055, dy * 0.0045); break;
      case 'pan': case 'panOrDeselect': {
        const g = groundAt(e);
        if (g && st.anchor) { const mx = st.anchor.x - g.x, mz = st.anchor.z - g.z; rig.panGround(mx, mz); rig.c.tx = rig.g.tx; rig.c.tz = rig.g.tz; rig.stamp++; }
        break;
      }
      case 'move': {
        const g = groundAt(e, st.b.y);
        if (g) { let x = g.x + st.grabOff[0], z = g.z + st.grabOff[1]; if (!e.shiftKey) { x = Math.round(x); z = Math.round(z); } app.moveTo(st.b, x, z); }
        break;
      }
      case 'place': {
        const g = groundAt(e, st.anchor.y);
        if (!g) break;
        const dna = toolDNA(), vx = g.x - st.anchor.x, vz = g.z - st.anchor.z, len = Math.hypot(vx, vz);
        if (len > 3) {
          let rot = Math.atan2(-vz, vx);
          if (!e.shiftKey) rot = Math.round(rot / (Math.PI / 36)) * (Math.PI / 36);
          st.rot = rot;
          const S = STRETCH[TYPES[dna.type].gen];
          if (S && len > 8) { const p = PARAMS[S[0]]; let v = (2 * len) / S[1](dna); v = p.t === 'i' ? Math.round(v) : Math.round(v); dna[S[0]] = clamp(v, p.min, p.max); }
        }
        setGhost(dna, st.anchor.x, st.anchor.z, st.rot, st.anchor.y);
        break;
      }
      case 'rect': { const g = groundAt(e); if (g) preview = dragRect(st.anchor, g); app.touch(); break; }
      case 'line': {
        const g = groundAt(e); if (!g) break;
        const p = st.pts, n = p.length;
        if (Math.hypot(g.x - p[n - 2], g.z - p[n - 1]) > 7) p.push(g.x, g.z);
        preview = { kind: 'line', pts: p.concat([g.x, g.z]), w: t.w || 5 }; app.touch();
        break;
      }
      case 'scatter': { const g = groundAt(e); if (g && Math.hypot(g.x - st.last.x, g.z - st.last.z) > (t.mode === 'lamp' ? 24 : (t.kind === 'poplar' ? 7 : 11))) { scatter(g); st.last = g; } break; }
      case 'erase': {
        const g = groundAt(e); if (!g) break;
        const p = st.pts; if (Math.hypot(g.x - p[p.length - 2], g.z - p[p.length - 1]) > 5) { p.push(g.x, g.z); props.eraseNear(g.x, g.z, 9); }
        preview = { kind: 'line', pts: p, w: 16 }; app.touch();
        break;
      }
      default: break;
    }
  }
  function hoverMove(e) {
    const t = app.tool;
    if (rig.mode === 'walk') return;
    if (t.mode === 'select' || t.mode === 'raze') { const hit = pickAt(e); app.hover(hit ? hit.b : null); canvas.style.cursor = hit ? 'pointer' : ''; }
    else if (t.mode === 'build') {
      const p = placePoint(e);
      if (p && Math.hypot(p.x, p.z) < BUILD_R + 20) setGhost(toolDNA(), p.x, p.z, app.lastBuild.rot || 0, p.y); else hideGhost();
    }
  }
  function onUp(e) {
    if (e.pointerType === 'touch') { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; }
    if (!st.down || e.pointerId !== st.id) return;
    st.down = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const t = app.tool;
    switch (st.mode) {
      case 'panOrDeselect': if (!st.moved) app.select(null); break;
      case 'move': if (st.moved) app.commit('move'); break;
      case 'place': {
        const dna = toolDNA();
        hideGhost();
        app.place({ ...dna }, st.anchor.x, st.anchor.z, st.rot, { y: st.anchor.y });
        t.dna = null;
        if (!e.shiftKey) app.setTool({ mode: 'select' });
        break;
      }
      case 'rect': {
        if (preview && preview.w > 2 && preview.d > 2) {
          if (t.mode === 'estate') app.emit('estate', { ...preview, doctrine: t.doctrine });
          else app.addShape(t.shape === 'disc' ? { t: 'disc', k: t.kind, x: preview.x, z: preview.z, rx: preview.w / 2, rz: preview.d / 2, rot: preview.rot } : { t: 'rect', k: t.kind, x: preview.x, z: preview.z, w: preview.w, d: preview.d, rot: preview.rot, r: t.kind === 'water' ? 0 : 0 });
        }
        preview = null; break;
      }
      case 'line': {
        const p = st.pts, g = groundAt(e);
        if (g) p.push(g.x, g.z);
        if (p.length >= 4) app.addShape({ t: 'line', k: t.kind, pts: p.map(v => +v.toFixed(1)), w: t.w || 5 });
        preview = null; break;
      }
      case 'scatter': app.commit('plant'); app.emit('planted'); break;
      case 'erase': {
        const p = st.pts;
        if (p.length < 4) p.push(p[0] + 0.5, p[1] + 0.5);
        app.addShape({ t: 'line', k: 'meadow', pts: p.map(v => +v.toFixed(1)), w: 16 });
        preview = null; break;
      }
      default: break;
    }
    st.mode = null;
  }
  function cancelDrag() { st.down = false; st.mode = null; preview = null; hideGhost(); }

  // ---------------------------------------------------------------- touch: two fingers pan, pinch, twist
  function pinchState() {
    const [a, b] = [...touches.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }
  function doPinch() {
    const n = pinchState(), r = canvas.getBoundingClientRect();
    const nx = ((n.cx - r.left) / r.width) * 2 - 1, ny = -(((n.cy - r.top) / r.height) * 2 - 1);
    if (rig.mode === 'walk') { rig.orbit(-(n.cx - pinch.cx) * 0.004, (n.cy - pinch.cy) * 0.004); pinch = n; return; }
    rig.zoomAt(nx, ny, pinch.d / Math.max(20, n.d));
    let da = n.a - pinch.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    rig.orbit(-da, (n.cy - pinch.cy) * 0.004);
    pinch = n;
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; if (e.pointerId === st.id) cancelDrag(); });
  canvas.addEventListener('pointerleave', () => { if (!st.down) { hideGhost(); app.hover(null); } });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const n = ndc(e);
    const k = e.deltaMode === 1 ? 30 : 1;
    rig.zoomAt(n[0], n[1], Math.exp(clamp(e.deltaY * k, -240, 240) * (e.ctrlKey ? 0.006 : 0.0014)));
  }, { passive: false });
  canvas.addEventListener('dblclick', (e) => { const hit = pickAt(e); if (hit) app.focus(hit.b); else { const g = groundAt(e); if (g) rig.set({ tx: g.x, tz: g.z }); } });
  document.addEventListener('pointerlockchange', () => { app.emit('lock', document.pointerLockElement === canvas); });

  // ---------------------------------------------------------------- keys
  const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); };
  window.addEventListener('keydown', (e) => {
    if (typing()) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.add(k);
    if (e.ctrlKey || e.metaKey) {
      if (k === 'z') { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); }
      else if (k === 'y') { e.preventDefault(); app.redo(); }
      else if (k === 'c' && app.sel) { app.copyDNA(app.sel); }
      else if (k === 'v' && app.sel) { app.pasteDNA(app.sel); }
      else if (k === 'd' && app.sel) { e.preventDefault(); app.duplicate(app.sel); }
      return;
    }
    if (rig.mode === 'walk') {
      if (k === 'Escape') { if (document.pointerLockElement) document.exitPointerLock(); app.setView('orbit'); }
      else if (k === 'f') { rig.walk.fly = !rig.walk.fly; if (!rig.walk.fly) rig.walk.y = 1.65; rig.stamp++; app.emit('view', 'walk'); }
      if (k === ' ') e.preventDefault();
      app.emit('key', k);
      return;
    }
    switch (k) {
      case 'Escape': if (app.tool.mode !== 'select') { cancelDrag(); app.setTool({ mode: 'select' }); } else app.select(null); break;
      case 'Delete': case 'Backspace': if (app.sel) app.demolish(app.sel); break;
      case 'v': app.setTool({ mode: 'select' }); break;
      case 'b': app.setTool({ mode: 'build', type: app.lastBuild.type, preset: app.lastBuild.preset }); break;
      case 'x': app.setTool({ mode: 'raze' }); break;
      case 'm': if (app.sel) app.mutate(app.sel, e.shiftKey ? 0.7 : 0.3); break;
      case '[': if (app.sel) app.rotateTo(app.sel, app.sel.rot + Math.PI / 12, true); break;
      case ']': if (app.sel) app.rotateTo(app.sel, app.sel.rot - Math.PI / 12, true); break;
      case ' ': e.preventDefault(); break;
      default: break;
    }
    app.emit('key', k);
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); });
  window.addEventListener('blur', () => keys.clear());

  // held keys move the camera every frame
  app.hooks.push((dt) => {
    if (!keys.size || typing()) return false;
    const fwd = (keys.has('w') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('s') || keys.has('ArrowDown') ? 1 : 0);
    const side = (keys.has('d') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('a') || keys.has('ArrowLeft') ? 1 : 0);
    if (rig.mode === 'walk') {
      const up = (keys.has(' ') ? 1 : 0) - (keys.has('c') ? 1 : 0);
      rig.walkMove(fwd, side, up, dt, keys.has('Shift'));
      app.walking = !!(fwd || side);
      return !!(fwd || side || up);
    }
    const turn = (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0), tilt = (keys.has('r') ? 1 : 0) - (keys.has('f') ? 1 : 0);
    if (fwd || side) {
      const sp = rig.g.dist * 0.9 * dt, cy = Math.cos(rig.g.yaw), sy = Math.sin(rig.g.yaw);
      rig.panGround((-sy * fwd + cy * side) * sp, (-cy * fwd - sy * side) * sp);
    }
    if (turn || tilt) rig.orbit(turn * dt * 1.4, tilt * dt * 0.9);
    return false;
  });

  app.cancelDrag = cancelDrag;
  app.ghost = ghost;
}
