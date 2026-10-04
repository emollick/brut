// Files, links, prints, and the studies' on/off switches.
import * as THREE from 'three';
import { demoCity } from './demo.js';
import { layEstate } from './estate.js';
import { dayLabel, hourLabel } from './ui/ui.js';

const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = (str) => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };
async function pump(stream, bytes) { const w = stream.writable.getWriter(); w.write(bytes); w.close(); return new Uint8Array(await new Response(stream.readable).arrayBuffer()); }

export function installIO(app, canvas) {
  const { rig, env, pipe, city, ground, props } = app;

  // ---------------------------------------------------------------- files and links
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const slug = () => (app.name || 'city').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'city';
  app.exportFile = () => download(new Blob([JSON.stringify({ ...app.snapshot(), rig: rig.state() })], { type: 'application/json' }), slug() + '.brut.json');
  app.importFile = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try { const s = JSON.parse(await f.text()); if (!s || !Array.isArray(s.city)) throw new Error('not a city'); app.restore(s); if (s.rig) rig.load(s.rig); app.commit('open'); app.toast('Opened ' + (s.name || f.name) + '.'); }
      catch (e) { app.toast('That file is not a BRUT city.'); }
    };
    inp.click();
  };
  app.shareLink = async () => {
    try {
      const json = JSON.stringify({ ...app.snapshot(), rig: rig.state() });
      if (typeof CompressionStream === 'undefined') return false;
      const packed = await pump(new CompressionStream('deflate-raw'), new TextEncoder().encode(json));
      const url = location.origin + location.pathname + '#c=' + b64(packed);
      if (url.length > 60000) return false;
      await navigator.clipboard.writeText(url);
      return true;
    } catch (e) { return false; }
  };
  app.loadFromHash = async () => {
    const m = /#c=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m || typeof DecompressionStream === 'undefined') return false;
    try {
      const raw = await pump(new DecompressionStream('deflate-raw'), unb64(m[1]));
      const s = JSON.parse(new TextDecoder().decode(raw));
      if (!Array.isArray(s.city)) return false;
      app.restore(s); if (s.rig) rig.load(s.rig);
      history.replaceState(null, '', location.pathname + location.search);
      return true;
    } catch (e) { return false; }
  };
  app.loadDemo = () => {
    app.select(null);
    city.clear(); ground.shapes = []; props.clear();
    app.name = 'Eastfield'; app.years = 0;
    demoCity(app);
    app.applyYears(); app.commit('demo'); app.emit('city');
  };
  app.on('estate', (rect) => { const made = layEstate(app, rect, rect.doctrine); app.commit('estate'); if (made.length) app.toast(`${made.length} buildings laid out. Each one can still be changed.`); });

  // ---------------------------------------------------------------- studies
  app.section = { axis: 'x', pos: 0 };
  app.updateSection = () => {
    if (!app.study.section) { app.clip = null; app.touch(); return; }
    const s = app.section, c = app.clip || (app.clip = new THREE.Vector4());
    if (s.axis === 'y') c.set(0, 1, 0, -((s.pos + 1) * 0.5 * 130 + 0.5));
    else {
      // cut away whichever side the camera is on
      const cam = rig.pos, p = s.pos * 300;
      if (s.axis === 'x') { const sg = cam.z > p ? 1 : -1; c.set(0, 0, sg, -sg * p); }
      else { const sg = cam.x > p ? 1 : -1; c.set(sg, 0, 0, -sg * p); }
    }
    app.touch();
  };
  app.setStudy = (k, v) => {
    app.study[k] = v;
    if (k === 'sun' && app.sunStudy) app.sunStudy.setOn(v);
    if (k === 'wind' && app.windStudy) app.windStudy.setOn(v);
    if (k === 'life' && app.life) app.life.setOn(v);
    if (k === 'section') app.updateSection();
    app.touch(); app.emit('study', k);
  };
  let lastSide = '';
  app.hooks.push(() => {       // keep the cut on the far side as the camera goes round
    if (!app.study.section || app.section.axis === 'y') return false;
    const p = app.section.pos * 300, side = app.section.axis === 'x' ? (rig.pos.z > p ? 'a' : 'b') : (rig.pos.x > p ? 'a' : 'b');
    if (side !== lastSide) { lastSide = side; app.updateSection(); }
    return false;
  });

  // ---------------------------------------------------------------- clock
  app.togglePlay = () => { app.playing = !app.playing; app.touch(); app.emit('time'); };
  app.hooks.push((dt) => {
    if (!app.playing) return false;
    let h = env.hour + dt * app.daySpeed;
    if (h >= 24) { h -= 24; env.day = (env.day + 1) % 365; }
    env.hour = h;
    return true;
  });

  // ---------------------------------------------------------------- photographs
  app.photo = { on: false, crop: 0, dof: false, plate: 1 };
  app.setPhoto = (on) => {
    app.photo.on = on; pipe.crop = on ? app.photo.crop : 0;
    if (on) { app.select(null); app.setTool({ mode: 'select' }); }
    app.touch(); app.emit('photo');
  };
  app.develop = async (o = {}) => {
    if (app.developing) return;
    app.developing = true;
    app.toast('Developing…', 1500); app.emit('shutter');
    const asp0 = app.cssW / app.cssH, crop = app.photo.crop || 0;
    const W = 2200, H = Math.round(W / asp0);
    const wasPlaying = app.playing; app.playing = false;
    const cropWas = pipe.crop; pipe.crop = 0;
    const lifeWas = app.life && app.life.on, accWas = pipe.quality.accum;
    app.forceSize = [W, H]; app.freeze = true; pipe.quality.accum = 72;
    app.step(0); pipe.invalidate();
    for (let i = 0; i < 72; i++) { app.step(0); if (i % 8 === 7) await new Promise(r => setTimeout(r, 0)); }
    pipe.lastUiKey = ''; app.step(0);          // present once more: the canvas is read in this same task
    // crop to the chosen format
    let sx = 0, sy = 0, sw = canvas.width, sh = canvas.height;
    if (crop > 0.01) { const a = sw / sh; if (a > crop) { const nw = Math.round(sh * crop); sx = (sw - nw) >> 1; sw = nw; } else { const nh = Math.round(sw / crop); sy = (sh - nh) >> 1; sh = nh; } }
    const out = document.createElement('canvas');
    const m = o.plate ? Math.round(sw * 0.045) : 0, foot = o.plate ? Math.round(sw * 0.075) : 0;
    out.width = sw + m * 2; out.height = sh + m + (o.plate ? foot + m : 0);
    const cx = out.getContext('2d');
    if (o.plate) { cx.fillStyle = '#efece4'; cx.fillRect(0, 0, out.width, out.height); }
    cx.drawImage(canvas, sx, sy, sw, sh, m, m, sw, sh);
    if (o.plate) {
      const n = app.photo.plate++;
      cx.fillStyle = '#141414';
      cx.font = `800 ${Math.round(foot * 0.34)}px Archivo, Helvetica, Arial, sans-serif`;
      cx.textBaseline = 'alphabetic';
      cx.fillText(`${String(n).padStart(2, '0')}`, m, sh + m + foot * 0.62);
      cx.font = `500 ${Math.round(foot * 0.2)}px Archivo, Helvetica, Arial, sans-serif`;
      const sel = app.lastSel ? app.lastSel.name + ', ' : '';
      cx.fillText(`${sel}${app.name}. ${hourLabel(env.hour)}, ${dayLabel(env.day)}.`, m + foot * 0.9, sh + m + foot * 0.42);
      cx.fillStyle = '#6b6862';
      const t = app.totals();
      cx.fillText(`${Math.round(t.pop).toLocaleString('en-US')} people · ${Math.round(t.concrete).toLocaleString('en-US')} m³ of concrete`, m + foot * 0.9, sh + m + foot * 0.72);
    }
    app.forceSize = null; app.freeze = false; pipe.quality.accum = accWas; pipe.crop = cropWas; app.playing = wasPlaying;
    if (app.life) app.life.on = lifeWas;
    out.toBlob((blob) => { if (blob) download(blob, `${slug()}-${String(Date.now()).slice(-6)}.png`); app.developing = false; app.touch(); }, 'image/png');
  };
  app.on('select', (b) => { if (b) app.lastSel = b; });
}
