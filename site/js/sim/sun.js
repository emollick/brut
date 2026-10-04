// Sun study: hours of direct sunlight reaching the ground on the chosen date.
// The sun is stepped across the sky; each step renders a shadow map and adds its share of
// the day to a ground-plane texture, which the ground shader then shows as a heat map.
import * as THREE from 'three';
import * as S from '../gfx/shaders.js';
import { sunDirection, sunTimes } from '../gfx/env.js';
import { SITE_HALF } from '../world/ground.js';

const N = 512;

export class SunStudy {
  constructor(app) {
    this.app = app;
    const pipe = app.pipe;
    this.rt = new THREE.WebGLRenderTarget(N, N, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: S.FS_VERT, fragmentShader: S.SUNHOURS_FRAG, depthTest: false, depthWrite: false,
      transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
      uniforms: { uSh: { value: pipe.shadowRT[1].depthTexture }, uShM: pipe.U.uShMatB, uDir: { value: new THREE.Vector3() }, uP: { value: new THREE.Vector2(SITE_HALF, 0.25) } },
    });
    this.result = null; this.key = ''; this.on = false; this.due = 0;
    this.buf = new Uint16Array(N * N * 4);
  }
  setOn(on) {
    this.on = on;
    const U = this.app.pipe.U;
    if (!on) { U.uOverlayP.value.set(0, 0, 0, 0); this.app.touch(); return; }
    this.key = ''; this.due = 0;
  }
  // called every frame; recomputes when the city, date or latitude has changed and things have settled
  update(dt) {
    if (!this.on) return;
    const app = this.app, env = app.env;
    const key = app.city.stamp + '|' + env.day + '|' + env.lat + '|' + app.props.stamp;
    if (key !== this.key) { this.key = key; this.due = 0.35; return; }
    if (this.due > 0) { this.due -= dt; if (this.due <= 0) this.compute(); }
  }
  compute() {
    const app = this.app, pipe = app.pipe, r = pipe.renderer, env = app.env, U = pipe.U;
    const st = sunTimes(env.lat, env.day);
    const step = 0.25, dir = new THREE.Vector3();
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 1); r.clear(true, false, false);
    const shM = pipe.mats.world.shadow;
    const clipWas = U.uClipOn.value; U.uClipOn.value = 0;
    this.mat.uniforms.uSh.value = pipe.shadowRT[1].depthTexture;
    let hours = 0;
    for (let h = st.rise + step / 2; h < st.set; h += step) {
      sunDirection(env.lat, env.day, h, dir);
      if (dir.y < 0.07) continue;                 // skimming sun under 4 degrees is not counted
      hours += step;
      pipe._fitShadow(1, new THREE.Vector3(0, 0, 0), 680, dir, pipe.quality.shadowFar);
      shM.uniforms.uLod.value.set(pipe.quality.shadowFar / 1360, 1, 0.6, 0);
      pipe._assign('shadow', m => m.userData.set ? m.userData.set.castShadow : true);
      r.setRenderTarget(pipe.shadowRT[1]); r.clear(true, true, false);
      r.render(app.scene, pipe.shadowCam[1]);
      this.mat.uniforms.uDir.value.copy(dir); this.mat.uniforms.uP.value.set(SITE_HALF, step);
      pipe._pass(this.mat, this.rt);
    }
    U.uClipOn.value = clipWas;
    // read back and take the measure: share of open ground with at least two hours
    r.readRenderTargetPixels(this.rt, 0, 0, N, N, this.buf);
    r.setRenderTarget(null);
    const occ = app.city.occupancy(N, SITE_HALF, 0, 1e4, true);
    let open = 0, ok = 0, sum = 0;
    const fromHalf = THREE.DataUtils.fromHalfFloat, cs = SITE_HALF * 2 / N, lim = 470 * 470;
    for (let j = 0; j < N; j += 2) for (let i = 0; i < N; i += 2) {
      const x = (i + 0.5) * cs - SITE_HALF, z = (j + 0.5) * cs - SITE_HALF;
      if (x * x + z * z > lim || occ[j * N + i]) continue;
      if (app.ground.surfaceAt(x, z) === 3) continue;
      const v = fromHalf(this.buf[(j * N + i) * 4]);
      open++; sum += v; if (v >= 2) ok++;
    }
    this.result = { share: open ? ok / open : 0, mean: open ? sum / open : 0, day: hours };
    U.uOverlay.value = this.rt.texture;
    U.uOverlayP.value.set(1, 1 / Math.max(6, hours), 0.8, 0);
    pipe.invalidate(); app.touch();
    app.emit('studyResult', 'sun');
  }
}
