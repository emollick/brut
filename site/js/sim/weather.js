// Falling rain and snow, in a box of air that travels with the camera.
import * as THREE from 'three';
import * as S from '../gfx/shaders.js';

export class Weather {
  constructor(app) {
    this.app = app; this.rain = 0; this.snow = 0;
    const NR = 7000, NS = 6000;
    const seedR = new Float32Array(NR * 2 * 3), endR = new Float32Array(NR * 2);
    for (let i = 0; i < NR; i++) {
      const a = Math.random(), b = Math.random(), c = Math.random();
      for (let k = 0; k < 2; k++) { seedR[(i * 2 + k) * 3] = a; seedR[(i * 2 + k) * 3 + 1] = b; seedR[(i * 2 + k) * 3 + 2] = c; endR[i * 2 + k] = k; }
    }
    const gr = new THREE.BufferGeometry();
    gr.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NR * 2 * 3), 3));
    gr.setAttribute('aSeed', new THREE.BufferAttribute(seedR, 3)); gr.setAttribute('aEnd', new THREE.BufferAttribute(endR, 1));
    const blend = { depthWrite: false, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
    const U = this.U = { uTime: { value: 0 }, uBoxC: { value: new THREE.Vector3() }, uRain: { value: new THREE.Vector4(80, 30, 1.5, 6) }, uWindXZ: { value: new THREE.Vector2() }, uTint: { value: new THREE.Vector3(0.6, 0.65, 0.7) }, uPx: { value: 1000 }, uK: { value: 1 } };
    this.rainMesh = new THREE.LineSegments(gr, new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: S.RAIN_VERT, fragmentShader: S.RAIN_FRAG, uniforms: U, ...blend }));
    const seedS = new Float32Array(NS * 3); for (let i = 0; i < seedS.length; i++) seedS[i] = Math.random();
    const gs = new THREE.BufferGeometry();
    gs.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3)); gs.setAttribute('aSeed', new THREE.BufferAttribute(seedS, 3));
    this.snowMesh = new THREE.Points(gs, new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: S.SNOW_VERT, fragmentShader: S.SNOW_FRAG, uniforms: U, ...blend }));
    this.rainMesh.frustumCulled = false; this.snowMesh.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.rainMesh, this.snowMesh);
    this.t = 0;
    app.pipe.overlayHooks.push({ active: () => (this.rain > 0.02 || this.snow > 0.02) && app.pipe.lensCfg.id !== 2 && !app.rig.ortho, draw: (r, cam) => this.draw(r, cam) });
  }
  update(dt) {
    const env = this.app.env, part = env.w.part;
    this.rain += ((part === 1 ? 1 : 0) - this.rain) * (1 - Math.exp(-dt * 0.8));
    this.snow += ((part === 2 ? 1 : 0) - this.snow) * (1 - Math.exp(-dt * 0.6));
    this.t += dt;
  }
  draw(r, cam) {
    const app = this.app, rig = app.rig, env = app.env, U = this.U;
    const size = rig.mode === 'walk' ? 46 : Math.min(300, Math.max(46, rig.c.dist * 0.42));
    U.uBoxC.value.copy(rig.pos).addScaledVector(rig.fwd, size * 0.42);
    U.uWindXZ.value.copy(env.windDir).multiplyScalar(env.w.wind);
    U.uTime.value = this.t; U.uPx.value = rig.pxPerM;
    const light = app.pipe.U.uAmb.value[2];
    const lum = 0.35 + 1.1 * (light.x + light.y + light.z) / 3;
    if (this.rain > 0.02) {
      U.uRain.value.set(size, size * 0.5, size * 0.03, size * 0.16);
      U.uTint.value.set(0.55 * lum, 0.6 * lum, 0.66 * lum); U.uK.value = this.rain;
      this.rainMesh.visible = true; this.snowMesh.visible = false; r.render(this.scene, cam);
    }
    if (this.snow > 0.02) {
      U.uRain.value.set(size, size * 0.045, 0, size * 0.03);
      U.uTint.value.set(0.9 * lum, 0.92 * lum, 0.96 * lum); U.uK.value = this.snow;
      this.rainMesh.visible = false; this.snowMesh.visible = true; r.render(this.scene, cam);
    }
  }
}
