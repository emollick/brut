// Sound, all synthesised: wind, rain, the hum of the place, birds, and the knocks and thuds of building.
import { activity } from './sim/life.js';

export function installAudio(app) {
  let ctx = null, master = null, noiseBuf = null;
  const L = {};      // layers
  const S = app.sound = { on: false, muted: false };
  try { S.muted = localStorage.getItem('brut-mute') === '1'; } catch (e) { /* no storage */ }

  function noise(seconds = 3) {
    const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = last * 0.02 + w * 0.98; d[i] = last; }
    return b;
  }
  function loopNoise(filterType, freq, q, gain) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    return { f, g };
  }
  function start() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = S.muted ? 0 : 0.6; master.connect(ctx.destination);
      noiseBuf = noise(4);
      L.wind = loopNoise('bandpass', 420, 0.7, 0);
      L.gust = loopNoise('bandpass', 900, 1.6, 0);
      L.rain = loopNoise('highpass', 2600, 0.5, 0);
      L.rainLow = loopNoise('lowpass', 500, 0.4, 0);
      L.hum = loopNoise('lowpass', 110, 0.9, 0);
      S.on = true;
    } catch (e) { ctx = null; }
  }
  const now = () => ctx.currentTime;
  function env(g, peak, attack, decay, t0 = now()) { g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay); }
  function tone(freq, freq2, dur, peak, type = 'sine', when = 0) {
    if (!ctx || S.muted) return;
    const t0 = now() + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t0 + dur);
    env(g, peak, 0.004, dur, t0); o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function burst(filterType, freq, dur, peak, when = 0, q = 0.7) {
    if (!ctx || S.muted) return;
    const t0 = now() + when, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true; f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    env(g, peak, 0.003, dur, t0); src.connect(f); f.connect(g); g.connect(master); src.start(t0, Math.random() * 2); src.stop(t0 + dur + 0.05);
  }
  // ---- one-shots ----
  const fx = {
    place() { tone(96, 38, 0.5, 0.5); burst('lowpass', 240, 0.45, 0.35); burst('bandpass', 1500, 0.08, 0.06, 0.02); },
    raze() { burst('lowpass', 180, 1.3, 0.5); burst('bandpass', 700, 0.5, 0.12, 0.05); tone(60, 28, 1.0, 0.3); },
    select() { tone(210, 170, 0.07, 0.12, 'triangle'); burst('bandpass', 2400, 0.03, 0.04); },
    tick() { burst('bandpass', 3200, 0.018, 0.035, 0, 2); },
    tool() { tone(330, 300, 0.05, 0.07, 'triangle'); },
    shutter() { burst('bandpass', 3000, 0.035, 0.22, 0, 1.2); burst('bandpass', 1700, 0.05, 0.18, 0.11, 1.2); tone(140, 90, 0.06, 0.1, 'square', 0.1); },
    lens() { burst('bandpass', 2100, 0.04, 0.09, 0, 3); tone(520, 500, 0.03, 0.03, 'triangle', 0.03); },
    step() { burst('lowpass', 300, 0.07, 0.07); },
    plant() { burst('bandpass', 900, 0.09, 0.07, 0, 0.8); },
    water() { burst('bandpass', 1300, 0.3, 0.07, 0, 0.6); tone(500, 240, 0.25, 0.03); },
    paper() { burst('highpass', 3500, 0.12, 0.05); },
  };
  S.play = (name) => { if (ctx && fx[name]) fx[name](); };
  S.setMuted = (m) => { S.muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.6, now(), 0.05); try { localStorage.setItem('brut-mute', m ? '1' : '0'); } catch (e) { /* ignore */ } app.emit('sound'); };

  // ---- the standing sound of the place follows the weather and the hour ----
  let birdT = 2, stepT = 0, tickT = 0;
  app.hooks.push((dt) => {
    if (!ctx || ctx.state !== 'running') return false;
    const e = app.env, t = now(), w = e.w.wind, rain = app.weather ? app.weather.rain : 0;
    const high = app.rig.mode === 'walk' ? 0.6 : Math.min(1, app.rig.c.dist / 500);      // further up, more wind and less street
    L.wind.g.gain.setTargetAtTime(0.02 + w * 0.085 * (0.6 + high * 0.6), t, 0.8);
    L.wind.f.frequency.setTargetAtTime(300 + w * 420 + Math.sin(app.time * 0.23) * 90, t, 0.6);
    L.gust.g.gain.setTargetAtTime(Math.max(0, Math.sin(app.time * 0.31) * Math.sin(app.time * 0.127 + 1.3)) * w * 0.05, t, 0.5);
    L.rain.g.gain.setTargetAtTime(rain * 0.085, t, 0.6);
    L.rainLow.g.gain.setTargetAtTime(rain * 0.07, t, 0.6);
    const act = activity(e.hour) * (app.study.life ? 1 : 0.3);
    L.hum.g.gain.setTargetAtTime((0.05 + act * 0.16) * (1 - high * 0.5) * (app.city.list.length ? 1 : 0.2), t, 1.5);
    // birds by day in dry weather, a cricket pulse on warm nights
    birdT -= dt;
    if (birdT <= 0) {
      const day = 1 - e.night, dry = rain < 0.2 && e.snowCover < 0.3, trees = Math.min(1, app.props.trees.length / 200);
      if (day > 0.5 && dry && trees > 0.05 && !S.muted) {
        const n = 2 + ((Math.random() * 4) | 0), base = 2400 + Math.random() * 2200, vol = 0.014 + Math.random() * 0.02;
        for (let i = 0; i < n; i++) tone(base * (0.9 + Math.random() * 0.3), base * (1.05 + Math.random() * 0.5), 0.05 + Math.random() * 0.06, vol * trees, 'sine', i * (0.07 + Math.random() * 0.06));
        birdT = 0.6 + Math.random() * (e.hour < 9 ? 2.2 : 5.5);
      } else if (e.night > 0.8 && dry && e.season < 0.5 && !S.muted) {
        for (let i = 0; i < 5; i++) tone(4100, 4050, 0.03, 0.008, 'sine', i * 0.055);
        birdT = 0.55 + Math.random() * 0.3;
      } else birdT = 1.5;
    }
    return false;
  });
  // ---- wire the events ----
  app.on('built', () => S.play('place'));
  app.on('select', (b) => { if (b) S.play('select'); });
  app.on('tool', () => S.play('tool'));
  app.on('lens', () => S.play('lens'));
  app.on('view', () => S.play('lens'));
  app.on('param', () => { const t = performance.now(); if (t - tickT > 70) { tickT = t; S.play('tick'); } });
  app.on('demolished', () => S.play('raze'));
  app.on('shutter', () => S.play('shutter'));
  app.on('planted', () => S.play('plant'));
  app.on('shape', (k) => S.play(k === 'water' ? 'water' : 'paper'));
  app.hooks.push((dt) => {          // footsteps on foot
    if (app.rig.mode !== 'walk' || app.rig.walk.fly || !app.walking) return false;
    stepT -= dt; if (stepT <= 0) { S.play('step'); stepT = 0.48; }
    return false;
  });
  const wake = () => { start(); if (ctx && ctx.state === 'suspended') ctx.resume(); };
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake, { passive: true });
  document.addEventListener('visibilitychange', () => { if (ctx) { if (document.hidden) ctx.suspend(); else ctx.resume(); } });
}
