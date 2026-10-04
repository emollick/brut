// BRUT — boot and main loop.
import * as THREE from 'three';
import { Pipeline } from './gfx/pipeline.js';
import { Env } from './gfx/env.js';
import { Rig } from './gfx/rig.js';
import { Ground } from './world/ground.js';
import { City } from './world/city.js';
import { Props } from './world/props.js';
import { makeDNA } from './arch/dna.js';
import { demoCity } from './demo.js';
import { installActions } from './actions.js';
import { installUI } from './ui/ui.js';
import { installInput } from './ui/input.js';
import { installHandles } from './ui/handles.js';
import { installIO } from './io.js';
import { SunStudy } from './sim/sun.js';
import { WindStudy } from './sim/wind.js';
import { Life } from './sim/life.js';
import { Weather } from './sim/weather.js';
import { installAudio } from './audio.js';
import { installSheet } from './ui/sheet.js';

const canvas = document.getElementById('gl');
const root = document.getElementById('ui');
const params = new URLSearchParams(location.search);
function fatal(msg) {
  const d = document.createElement('div'); d.className = 'fatal';
  d.innerHTML = '<h1>BRUT</h1><p></p>'; d.lastChild.textContent = msg;
  document.body.append(d);
  throw new Error(msg);
}
let pipe;
try { pipe = new Pipeline(canvas); } catch (e) { fatal('This needs WebGL 2, and the browser would not start it. A current Chrome, Edge, Firefox or Safari on a machine with a working graphics driver will run it.'); }
if (!pipe.floatOK) fatal('This needs floating-point render targets, which this browser or graphics driver does not offer.');
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (window.BRUT && window.BRUT.toast) window.BRUT.toast('The graphics driver dropped the picture. Reload the page to carry on; the city is saved.', 60000); });
const scene = new THREE.Scene();
const env = new Env(pipe.U);
const rig = new Rig();
const ground = new Ground(pipe, scene);
const city = new City(pipe, scene, ground);
const props = new Props(pipe, scene, city);

const app = {
  pipe, scene, env, rig, ground, city, props, THREE,
  time: 0, stamp: 0, forceSize: null, grid: 0, clip: null, hooks: [], frameCount: 0, fps: 60, view: 'orbit',
  touch() { this.stamp++; },
};
window.BRUT = app;
canvas.tabIndex = 0;

installActions(app);
installIO(app, canvas);
app.sunStudy = new SunStudy(app);
app.windStudy = new WindStudy(app);
app.life = new Life(app);
app.weather = new Weather(app);
installAudio(app);
const ui = installUI(app, root);
installSheet(app, root, canvas);
installInput(app, canvas, ui.overlay);
installHandles(app, ui.grips, canvas);
rig.blocked = (x, z) => app.life.inside(x, z);

function size() {
  let w = canvas.clientWidth, h = canvas.clientHeight;
  if (app.forceSize) { w = app.forceSize[0]; h = app.forceSize[1]; }
  if (!w || !h) { w = 1280; h = 720; }
  app.cssW = w; app.cssH = h;
  pipe.setSize(w, h, app.forceSize ? 1 : (window.devicePixelRatio || 1));
}

app.step = function (dt) {
  size();
  app.time += dt;
  let animating = false;
  for (const h of app.hooks) animating = h(dt) || animating;
  env.update(dt, app.time);
  // the sky and ground are still changing while the weather turns
  const W = app.WEATHER[env.weather];
  if (Math.abs(env.w.cover - W.cover) > 0.004 || Math.abs(env.w.fog - W.fog) > 1e-5 || Math.abs(env.wetness - W.wet) > 0.01 || Math.abs(env.snowCover - W.snow) > 0.01) animating = true;
  if (app.titleUp && !app.developing) rig.g.yaw += dt * 0.022;
  rig.update(dt, app.cssW, app.cssH);
  animating = city.tick(dt) || animating;
  if (props.update()) app.stamp++;
  if (!app.developing) {
    app.sunStudy.update(dt);
    app.windStudy.update(dt);
    app.life.update(dt, env.hour);
    app.weather.update(dt);
  }
  app.frameCount++;
  return pipe.render({ scene, rig, env, time: app.time, dt, stamp: app.stamp + city.stamp * 1000003, animating, grid: app.grid, clip: app.clip,
    hideSelection: app.photo.on || app.hideUI || app.titleUp, dof: app.photo.on && app.photo.dof, dofRange: 0.3 });
};

// time a few frames on the GPU and choose how hard to work
function calibrate() {
  const forced = params.get('q');
  if (forced) { pipe.setTier(forced); return; }
  const gl = pipe.gl;
  app.step(1 / 60); app.step(1 / 60); gl.finish();
  const t0 = performance.now();
  for (let i = 0; i < 4; i++) { rig.stamp++; app.step(1 / 60); }
  gl.finish();
  const ms = (performance.now() - t0) / 4;
  app.calibMs = ms;
  let tier = ms < 3.2 ? 'ultra' : ms < 9 ? 'high' : ms < 22 ? 'medium' : 'low';
  if (pipe.coarse && tier === 'ultra') tier = 'high';
  pipe.setTier(tier);
}
const ORDER = ['low', 'medium', 'high', 'ultra'];
let last = performance.now(), slow = 0;
function loop(now) {
  const raw = (now - last) / 1000;
  const dt = Math.min(0.1, raw); last = now;
  app.fps += (1 / Math.max(dt, 1e-3) - app.fps) * 0.05;
  // if it is plainly struggling while visible, step the quality down a notch
  if (raw < 0.25 && document.visibilityState === 'visible' && !app.developing && !params.get('q')) {
    slow = raw > 0.04 ? slow + raw : Math.max(0, slow - raw * 0.5);
    if (slow > 3.5) { const i = ORDER.indexOf(pipe.tier); if (i > 0) { pipe.setTier(ORDER[i - 1]); app.emit('lens'); } slow = 0; }
  }
  if (!app.developing) { try { app.step(dt); } catch (e) { if (!app.lastError) console.error(e); app.lastError = String(e && e.stack || e); } }
  requestAnimationFrame(loop);
}

// ---- harness: drive everything without a visible tab ----
app.frames = (n = 1, dt = 1 / 60) => { let r; for (let i = 0; i < n; i++) r = app.step(dt); return r; };
app.shot = async (name = 'shot', { w = 1440, h = 810, frames = 24, q = 0.9, live = 0 } = {}) => {
  app.forceSize = [w, h];
  if (live) app.frames(live, 1 / 30); else app.frames(2, 1 / 60);
  for (let i = 0; i < frames; i++) app.step(0);
  const url = canvas.toDataURL('image/jpeg', q);
  app.forceSize = null;
  const r = await fetch('/__shot/' + name, { method: 'POST', body: url });
  return r.json();
};
app.cam = (o, mode) => { if (mode) rig.setMode(mode); rig.set(o, true); };
app.sky = (o) => { if (o.weather) env.setWeather(o.weather, true); for (const k of ['hour', 'day', 'lat']) if (o[k] !== undefined) env[k] = o[k]; app.touch(); for (let i = 0; i < 40; i++) env.update(0.5, app.time); };
app.put = (type, preset, x = 0, z = 0, rot = 0, over = {}) => city.add({ ...makeDNA(type, preset), ...over }, x, z, rot);
app.views = {
  hero:   { tx: 40, tz: 20, ty: 25, yaw: -0.5, pitch: 0.06, dist: 330, fov: 30 },
  aerial: { tx: 10, tz: -10, ty: 10, yaw: -0.75, pitch: 0.2, dist: 700, fov: 24 },
  axis:   { tx: 0, tz: -40, ty: 12, yaw: 0.02, pitch: 0.045, dist: 300, fov: 34 },
  close:  { tx: 112, tz: -86, ty: 22, yaw: -1.25, pitch: 0.03, dist: 95, fov: 38 },
};
app.shots = async (prefix, names = Object.keys(app.views), o = {}) => {
  const out = [];
  for (const n of names) { app.cam(app.views[n], 'orbit'); out.push((await app.shot(prefix + '_' + n, o)).file); }
  return out;
};

// contact sheet of every preset of one type, each alone on an empty site (destroys the current city)
app.catalogue = async (type, { cols = 3, w = 620, h = 440, yaw = -0.75, pitch = 0.2 } = {}) => {
  const { TYPES } = await import('./arch/dna.js');
  const T = TYPES[type], names = [null, ...Object.keys(T.presets)];
  city.clear(); ground.shapes = []; props.clear(); ground.aprons = []; app.years = 0; app.select(null);
  app.life.setOn(false);
  const sheet = document.createElement('canvas'), rows = Math.ceil(names.length / cols);
  sheet.width = cols * w; sheet.height = rows * h;
  const cx = sheet.getContext('2d');
  for (let i = 0; i < names.length; i++) {
    city.clear();
    const b = city.add(makeDNA(type, names[i]), 0, 0, 0);
    city.syncAprons(); props.update();
    const s = b.stats, H = s.height || 20, f = s.foot || { w: 30, d: 30 };
    rig.setMode('orbit');
    rig.set({ tx: 0, tz: 0, ty: H * 0.42, yaw, pitch, dist: Math.max(H * 1.5, f.w * 1.25, f.d * 1.25, 30) * 2.1, fov: 30, rise: 0 }, true);
    app.forceSize = [w, h];
    app.frames(2, 1 / 60); for (let k = 0; k < 20; k++) app.step(0);
    cx.drawImage(canvas, (i % cols) * w, Math.floor(i / cols) * h, w, h);
    cx.fillStyle = '#fff'; cx.font = '600 15px Archivo, sans-serif'; cx.fillText(`${T.label} / ${names[i] || 'standard'}  (${b.count})`, (i % cols) * w + 10, Math.floor(i / cols) * h + 22);
  }
  app.forceSize = null;
  const r = await fetch('/__shot/cat_' + type, { method: 'POST', body: sheet.toDataURL('image/jpeg', 0.88) });
  return r.json();
};

// ---- boot ----
async function boot() {
  if (params.has('fresh')) app.wipe();
  let loaded = false;
  if (location.hash.startsWith('#c=')) loaded = await app.loadFromHash();
  if (!loaded && !params.has('fresh') && !params.has('demo')) {
    const s = app.loadSaved();
    if (s && Array.isArray(s.city)) { try { app.restore(s); if (s.rig) rig.load(s.rig); loaded = true; } catch (e) { loaded = false; } }
  }
  if (!loaded) {
    demoCity(app);
    rig.set({ tx: 30, tz: 10, ty: 22, yaw: -0.55, pitch: 0.075, dist: 380, fov: 30 }, true);
    env.lat = 43.3; env.day = 172; env.hour = 16.9; env.setWeather('fair', true);
  }
  app.noSave = false;
  app.applyYears();
  app.undoStack.push(JSON.stringify(app.snapshot()));
  app.emit('city'); app.emit('history');
  if (rig.mode === 'walk') rig.setMode('orbit');
  calibrate();
  if (!params.has('play')) { root.classList.add('titled'); app.showTitle(); app.on('enter', () => root.classList.remove('titled')); }
  window.addEventListener('pagehide', () => app.save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) app.save(); });
  requestAnimationFrame(loop);
}
boot();
