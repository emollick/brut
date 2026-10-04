// Deferred pipeline: shadows -> G-buffer -> ambient occlusion -> composite (light, sky, air, or ink)
// -> progressive accumulation when nothing moves -> bloom -> develop -> film.
import * as THREE from 'three';
import * as S from './shaders.js';

const v3 = (x = 0, y = 0, z = 0) => ({ value: new THREE.Vector3(x, y, z) });
const v4 = (x = 0, y = 0, z = 0, w = 0) => ({ value: new THREE.Vector4(x, y, z, w) });
const m4 = () => ({ value: new THREE.Matrix4() });

export const LENSES = {
  beton:     { name: 'Béton', id: 0, mono: 0, grade: [1.13, 1.06, 0.5, 0.0], grain: 0.03, vig: 0.26, bloom: 0.05 },
  silver:    { name: 'Silver', id: 0, mono: 1, grade: [1.25, 0.0, 0.0, 0.0], grain: 0.085, vig: 0.42, bloom: 0.07 },
  maquette:  { name: 'Maquette', id: 1, studio: 1, dof: 1, grade: [1.02, 0.9, 0.15, 0.0], grain: 0.018, vig: 0.3, bloom: 0.03 },
  ink:       { name: 'Ink', id: 2, ink: [0.045, 0.045, 0.055], paper: [0.90, 0.875, 0.815], shade: [0.50, 0.49, 0.46], hatch: 1, detail: 1, lw: 1.0, grain: 0.02, vig: 0.12 },
  blueprint: { name: 'Blueprint', id: 2, ink: [0.86, 0.91, 1.0], paper: [0.035, 0.115, 0.36], shade: [0.07, 0.19, 0.5], hatch: 0, detail: 1, lw: 1.0, grain: 0.03, vig: 0.3 },
  poche:     { name: 'Figure-ground', id: 2, ink: [0.03, 0.03, 0.035], paper: [0.92, 0.905, 0.86], shade: [0.03, 0.03, 0.035], hatch: 0, detail: 0, lw: 1.0, grain: 0.015, vig: 0.08, figure: 1 },
  frame:     { name: 'Structure', id: 0, structure: 1, mono: 0, grade: [1.05, 0.8, 0.2, 0.0], grain: 0.03, vig: 0.24, bloom: 0.04 },
};

export const TIERS = {
  low:    { label: 'Fast',     scale: 0.66, maxPx: 1.5e6, shadow: 2048, shadowFar: 1024, accum: 16, refl: false },
  medium: { label: 'Balanced', scale: 0.85, maxPx: 2.6e6, shadow: 2048, shadowFar: 2048, accum: 32, refl: true },
  high:   { label: 'Fine',     scale: 1.0,  maxPx: 4.2e6, shadow: 3072, shadowFar: 4096, accum: 48, refl: true },
  ultra:  { label: 'Finest',   scale: 1.5,  maxPx: 6.4e6, shadow: 4096, shadowFar: 4096, accum: 64, refl: true },
};

function halton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }

export class Pipeline {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    r.autoClear = false;
    this.gl = r.getContext();
    r.setPixelRatio(1);
    this.errors = [];
    r.debug.onShaderError = (gl, program, vs, fs) => {
      const msg = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs)].filter(Boolean).join('\n');
      this.errors.push(msg);
      console.error('SHADER', msg);
    };
    this.floatOK = !!this.gl.getExtension('EXT_color_buffer_float') || !!this.gl.getExtension('EXT_color_buffer_half_float');
    this.w = 2; this.h = 2; this.scale = 1; this.maxPx = 3.4e6; this.tier = 'high';
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const big = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) >= 8192 && !coarse;
    this.coarse = coarse;
    this.quality = { shadow: big ? 3072 : 2048, shadowFar: big ? 4096 : 2048, ao: true, accum: 48, bloom: true, fxaa: true, refl: true };
    this.renderables = new Set();
    this.placeholder = new THREE.MeshBasicMaterial();
    this.lens = 'beton';
    this.lensCfg = LENSES.beton;
    this.accumN = 0; this.frame = 0; this.lastKey = '';
    this.exposureBias = 1;
    this.sel = []; this.hover = [];
    this.crop = 0;
    this.overlayHooks = [];

    this._noise();
    const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
    this.black = black;
    this.clearTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); this.clearTex.needsUpdate = true;
    const U = this.U = {
      uSunDir: v3(0.3, 0.8, 0.5), uSunCol: v3(3, 3, 3), uSkyDir: v3(0.3, 0.8, 0.5),
      uAmb: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3(0.3, 0.3, 0.3)) },
      uSkyZen: v3(), uSkyHor: v3(), uSkyGlow: v3(), uGroundFar: v3(), uCloudLit: v3(), uCloudDark: v3(), uSunDisc: v3(),
      uCloud: v4(), uWeather: v4(), uFog: v4(), uSeason: v4(), uWind: v4(1, 0, 0.3, 0),
      uTime: { value: 0 }, uNoise: { value: this.noise },
      uShA: { value: null }, uShB: { value: null }, uShMatA: m4(), uShMatB: m4(), uShInfo: v4(), uJit: v4(),
      uLampMap: { value: black }, uSite: v4(512, 1, 0, 0), uClip: v4(1, 0, 0, 0), uClipOn: { value: 0 }, uLens: v4(),
      uPlanA: { value: black }, uPlanB: { value: black }, uOverlay: { value: black }, uOverlayP: v4(),
      uReflTex: { value: black }, uReflOn: { value: 0 }, uRes: { value: new THREE.Vector2(2, 2) },
    };
    const mk = (vs, fs, uniforms, o = {}) => new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vs, fragmentShader: fs, uniforms, ...o });
    const obj = () => ({ uObj: v4(1e6, 0, 0, 0), uObj2: v4() });
    const envU = { uSunDir: U.uSunDir, uSunCol: U.uSunCol, uSkyDir: U.uSkyDir, uAmb: U.uAmb, uSkyZen: U.uSkyZen, uSkyHor: U.uSkyHor, uSkyGlow: U.uSkyGlow, uGroundFar: U.uGroundFar, uCloudLit: U.uCloudLit, uCloudDark: U.uCloudDark, uSunDisc: U.uSunDisc, uCloud: U.uCloud, uWeather: U.uWeather, uFog: U.uFog, uSeason: U.uSeason, uTime: U.uTime, uNoise: U.uNoise };
    const shU = { uShA: U.uShA, uShB: U.uShB, uShMatA: U.uShMatA, uShMatB: U.uShMatB, uShInfo: U.uShInfo, uJit: U.uJit };
    const vsU = () => ({ uTime: U.uTime, uWind: U.uWind, uLod: v4(1000, 0, 0.5, 0) });
    const clipU = { uClip: U.uClip, uClipOn: U.uClipOn, uLens: U.uLens };
    const worldG = (refl) => mk(S.WORLD_VERT, S.WORLD_FRAG, { ...envU, ...shU, ...vsU(), ...clipU, ...obj(), uLampMap: U.uLampMap, uSite: U.uSite, uRefl: { value: refl } }, { side: refl ? THREE.BackSide : THREE.FrontSide });
    const groundG = (refl) => mk(S.GROUND_VERT, S.GROUND_FRAG, { ...envU, ...shU, ...clipU, uPlanA: U.uPlanA, uPlanB: U.uPlanB, uOverlay: U.uOverlay, uOverlayP: U.uOverlayP, uLampMap: U.uLampMap, uReflTex: U.uReflTex, uReflOn: U.uReflOn, uRes: U.uRes, uSite: U.uSite, uRefl: { value: refl } }, { side: THREE.DoubleSide });
    this.mats = {
      world: {
        g: worldG(0),
        refl: worldG(1),
        cut: mk(S.WORLD_VERT, S.WORLD_FRAG, { ...envU, ...shU, ...vsU(), ...clipU, ...obj(), uLampMap: U.uLampMap, uSite: U.uSite, uRefl: { value: 0 } }, { side: THREE.DoubleSide }),
        shadow: mk(S.WORLD_VERT, S.WORLD_SHADOW_FRAG, { ...vsU(), ...clipU, ...obj() }, { side: THREE.BackSide, colorWrite: false }),
        mask: mk(S.WORLD_VERT, S.WORLD_MASK_FRAG, { ...vsU(), ...clipU, ...obj(), uMaskCol: v4(1, 0, 0, 1) }, { depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true }),
        top: mk(S.WORLD_VERT, S.WORLD_TOP_FRAG, { ...vsU(), ...clipU, ...obj() }, { side: THREE.DoubleSide }),
      },
      ground: {
        g: groundG(0), refl: null, cut: groundG(0), shadow: null, mask: null,
        top: mk(S.GROUND_VERT, S.GROUND_TOP_FRAG, {}, { side: THREE.DoubleSide }),
      },
    };
    this.mats.ovl = { fwd: mk(S.WORLD_VERT, S.WORLD_OVL_FRAG, { ...envU, ...shU, ...vsU(), ...clipU, ...obj(), uOvl: v4(0.4, 1, 0, 0) }, { depthWrite: false, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor }) };
    this.ovlScene = new THREE.Scene();
    this.bloomAmt = 0; this.bloomTex = null; this.frozenTime = 0; this.lastUiKey = '';

    // fullscreen passes
    const fsq = new THREE.BufferGeometry();
    fsq.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(fsq, this.placeholder); this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    this.quadCam = new THREE.Camera();
    const fs = (frag, uniforms) => mk(S.FS_VERT, frag, uniforms, { depthTest: false, depthWrite: false });
    const tex = () => ({ value: null });
    this.P = {
      ao: fs(S.AO_FRAG, { tDepth: tex(), tNormal: tex(), uProj: m4(), uInvProj: m4(), uRes: U.uRes, uAO: v4(1.1, 7, 1, 0), uPix: { value: new THREE.Vector2() } }),
      blur: fs(S.AO_BLUR_FRAG, { tAO: tex(), tDepth: tex(), tNormal: tex(), uDir: { value: new THREE.Vector2() }, uInvProj: m4(), uPix: { value: new THREE.Vector2() } }),
      comp: fs(S.COMPOSITE_FRAG, { ...envU, tDirect: tex(), tAmbient: tex(), tNormal: tex(), tDepth: tex(), tAO: tex(), uInvProj: m4(), uInvView: m4(), uInvViewProj: m4(), uCamPos: v3(), uRes: U.uRes, uLens: U.uLens, uCam: v4(), uInk: v3(), uPaper: v3(1, 1, 1), uShade: v3(0.6, 0.6, 0.6), uInkP: v4(1, 5, 0, 0), uPix: { value: new THREE.Vector2() } }),
      resolve: fs(S.RESOLVE_FRAG, { tCur: tex(), tHist: tex(), uAlpha: { value: 1 } }),
      copy: fs(S.COPY_FRAG, { tSrc: tex() }),
      down: fs(S.BLOOM_DOWN_FRAG, { tSrc: tex(), uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } }),
      up: fs(S.BLOOM_UP_FRAG, { tSrc: tex(), tBase: tex(), uTexel: { value: new THREE.Vector2() } }),
      develop: fs(S.DEVELOP_FRAG, { tHdr: tex(), tBloom: tex(), tDepth: tex(), tOvl: tex(), uTone: v4(1, 0.05, 1, 0), uGrade: v4(1, 1, 0, 0), uGrade2: v4(1, 0, 0, 0), uDof: v4(), uProjInfo: v4(), uRes: U.uRes }),
      final: fs(S.FINAL_FRAG, { tLdr: tex(), tMask: tex(), uRes: U.uRes, uFilm: v4(0.03, 0.2, 0, 1), uSel: v4(), uAccent: v3(1.0, 0.32, 0.08), uCrop: v4() }),
      reflResolve: fs(S.REFL_RESOLVE_FRAG, { tDirect: tex(), tAmbient: tex(), tDepth: tex() }),
    };

    this.shadowCam = [new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3000), new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3000)];
    this.shadowFocus = new THREE.Vector3(); this.shadowRadius = [120, 640];
    this._bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this._tmpV = new THREE.Vector3(); this._tmpV2 = new THREE.Vector3(); this._tmpM = new THREE.Matrix4();
    this._buildShadowTargets();
    this.mirrorCam = new THREE.Camera(); this.mirrorCam.matrixAutoUpdate = false; this.mirrorCam.matrixWorldAutoUpdate = false;
    this.rt = null;
    this.reflWanted = false;
    this.stats = { ms: 0, calls: 0, tris: 0 };
  }

  // registry used by BatchSet and the ground
  add(mesh) { this.renderables.add(mesh); }
  remove(mesh) { this.renderables.delete(mesh); }

  _noise() {
    const n = 256, d = new Uint8Array(n * n * 4);
    let s = 1234567;
    for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s >> 16) & 255; }
    const t = this.noise = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  }
  _buildShadowTargets() {
    if (this.shadowRT) for (const t of this.shadowRT) { t.depthTexture.dispose(); t.dispose(); }
    const mkS = (size) => {
      const rt = new THREE.WebGLRenderTarget(size, size, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, stencilBuffer: false });
      const dt = new THREE.DepthTexture(size, size);
      dt.type = THREE.UnsignedIntType; dt.compareFunction = THREE.LessEqualCompare;
      dt.minFilter = THREE.LinearFilter; dt.magFilter = THREE.LinearFilter;
      rt.depthTexture = dt;
      return rt;
    };
    this.shadowRT = [mkS(this.quality.shadow), mkS(this.quality.shadowFar)];
    this.U.uShA.value = this.shadowRT[0].depthTexture; this.U.uShB.value = this.shadowRT[1].depthTexture;
  }
  // how hard to work: chosen from a timing at start-up, or by hand
  setTier(name) {
    const T = TIERS[name]; if (!T) return;
    this.tier = name; this.scale = T.scale; this.maxPx = T.maxPx;
    const q = this.quality, was = q.shadow + '/' + q.shadowFar;
    q.shadow = T.shadow; q.shadowFar = T.shadowFar; q.accum = T.accum; q.refl = T.refl;
    if (q.shadow + '/' + q.shadowFar !== was) this._buildShadowTargets();
    this.accumN = 0; this.lastKey = '';
  }
  setSize(cssW, cssH, dpr) {
    const sc = Math.min(dpr, 2) * this.scale;
    let w = Math.max(2, Math.round(cssW * sc)), h = Math.max(2, Math.round(cssH * sc));
    const maxPx = this.maxPx;
    if (w * h > maxPx) { const k = Math.sqrt(maxPx / (w * h)); w = Math.round(w * k); h = Math.round(h * k); }
    if (w === this.w && h === this.h && this.rt) return;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.U.uRes.value.set(w, h);
    if (this.rt) {
      const R = this.rt;
      R.gbuf.depthTexture.dispose();
      for (const k of ['gbuf', 'aoA', 'aoB', 'hdr', 'ovl', 'accA', 'accB', 'ldr', 'mask', 'reflG', 'refl']) R[k].dispose();
      R.reflG.depthTexture.dispose();
      for (const b of R.bloom) b.dispose();
    }
    const HF = THREE.HalfFloatType, NE = THREE.NearestFilter, LI = THREE.LinearFilter;
    const one = (ww, hh, type, filt, depth = false) => new THREE.WebGLRenderTarget(ww, hh, { type, format: THREE.RGBAFormat, minFilter: filt, magFilter: filt, depthBuffer: depth, stencilBuffer: false });
    const R = this.rt = {};
    R.gbuf = new THREE.WebGLRenderTarget(w, h, { count: 3, type: HF, format: THREE.RGBAFormat, minFilter: NE, magFilter: NE, depthBuffer: true, stencilBuffer: false });
    const dt = new THREE.DepthTexture(w, h); dt.type = THREE.UnsignedIntType; dt.minFilter = NE; dt.magFilter = NE;
    R.gbuf.depthTexture = dt;
    R.aoA = one(w, h, THREE.UnsignedByteType, LI); R.aoB = one(w, h, THREE.UnsignedByteType, LI);
    R.hdr = one(w, h, HF, LI);
    R.ovl = new THREE.WebGLRenderTarget(w, h, { type: HF, format: THREE.RGBAFormat, minFilter: LI, magFilter: LI, depthBuffer: true, stencilBuffer: false });
    R.ovl.depthTexture = dt;        // overlays are depth-tested against the scene
    R.accA = one(w, h, HF, LI); R.accB = one(w, h, HF, LI);
    R.ldr = one(w, h, THREE.UnsignedByteType, LI);
    R.mask = one(Math.ceil(w / 2), Math.ceil(h / 2), THREE.UnsignedByteType, LI);
    const rw = Math.ceil(w / 2), rh = Math.ceil(h / 2);
    R.reflG = new THREE.WebGLRenderTarget(rw, rh, { count: 3, type: HF, format: THREE.RGBAFormat, minFilter: NE, magFilter: NE, depthBuffer: true, stencilBuffer: false });
    const rdt = new THREE.DepthTexture(rw, rh); rdt.type = THREE.UnsignedIntType; rdt.minFilter = NE; rdt.magFilter = NE;
    R.reflG.depthTexture = rdt;
    R.refl = one(rw, rh, HF, LI);
    R.bloom = [];
    let bw = Math.ceil(w / 2), bh = Math.ceil(h / 2);
    for (let i = 0; i < 6 && bw > 8 && bh > 8; i++) { R.bloom.push(one(bw, bh, HF, LI)); bw = Math.ceil(bw / 2); bh = Math.ceil(bh / 2); }
    R.bloomUp = R.bloom.map(b => one(b.width, b.height, HF, LI));
    this.accumN = 0;
  }
  setLens(name) {
    if (!LENSES[name]) return;
    this.lens = name; this.lensCfg = LENSES[name]; this.accumN = 0;
  }
  invalidate() { this.accumN = 0; }

  _pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }
  _assign(pass, filter) {
    for (const m of this.renderables) {
      const mat = this.mats[m.userData.kind] && this.mats[m.userData.kind][pass];
      const on = !!mat && !m.userData.empty && !m.userData.hidden && (!filter || filter(m));
      m.visible = on;
      if (on) m.material = mat;
    }
  }
  _fitShadow(i, center, radius, dir, size) {
    const cam = this.shadowCam[i];
    const D = 1500;
    // snap the centre to whole texels in light space so the map does not swim
    const up = Math.abs(dir.y) > 0.99 ? this._tmpV.set(0, 0, 1) : this._tmpV.set(0, 1, 0);
    const rightV = new THREE.Vector3().crossVectors(up, dir).normalize();
    const upV = new THREE.Vector3().crossVectors(dir, rightV).normalize();
    const texel = (2 * radius) / size;
    const cx = Math.round(center.dot(rightV) / texel) * texel, cy = Math.round(center.dot(upV) / texel) * texel, cz = center.dot(dir);
    const c = new THREE.Vector3().addScaledVector(rightV, cx).addScaledVector(upV, cy).addScaledVector(dir, cz);
    cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius; cam.near = 1; cam.far = 2 * D;
    cam.position.copy(c).addScaledVector(dir, D);
    cam.up.copy(upV);
    cam.lookAt(c);
    cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const M = i === 0 ? this.U.uShMatA.value : this.U.uShMatB.value;
    M.copy(this._bias).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    return texel;
  }

  // The scene is re-rendered only while something is changing or the image is still refining.
  // People, traffic and weather are drawn every frame as an overlay on top of the settled image.
  render(F) {
    const t0 = performance.now();
    const { scene, rig, env } = F;
    const r = this.renderer, R = this.rt, U = this.U, P = this.P, L = this.lensCfg, Q = this.quality;
    if (!R) return false;
    const key = rig.stamp + '|' + F.stamp + '|' + this.lens + '|' + this.w + 'x' + this.h;
    const still = !rig.moving && key === this.lastKey && !F.animating;
    this.lastKey = key;
    if (!still) { this.accumN = 0; this.frozenTime = F.time; }
    const sceneDirty = this.accumN < Q.accum;
    let ovlActive = false;
    for (const h of this.overlayHooks) if (h.active()) { ovlActive = true; break; }
    const uiKey = this.sel.length + '|' + this.hover.length + '|' + (this.sel[0] ? this.sel[0].group.id : 0) + '|' + (this.hover[0] ? this.hover[0].group.id : 0) + '|' + this.crop + '|' + ovlActive + '|' + this.exposureBias + '|' + (F.dof ? 1 : 0);
    if (!sceneDirty && !ovlActive && uiKey === this.lastUiKey) { this.stats.ms = 0; return false; }
    this.lastUiKey = uiKey;
    const n = this.accumN;
    this.frame++;
    U.uTime.value = still ? this.frozenTime : F.time;
    U.uLens.value.set(L.id, L.structure ? 1 : 0, L.lw || 1, L.detail === undefined ? 1 : L.detail);
    U.uSite.value.w = F.grid || 0;
    U.uSite.value.y = env.lat >= 0 ? 1 : -1;
    const cam = rig.camera;
    cam.isOrthographicCamera = rig.ortho; cam.isPerspectiveCamera = !rig.ortho;
    const pix = rig.pixWorld * (rig.height / this.h);

    if (sceneDirty) {
      // sub-pixel jitter (only while refining) and soft-shadow jitter
      const jx = n > 0 ? (halton(n, 2) - 0.5) : 0, jy = n > 0 ? (halton(n, 3) - 0.5) : 0;
      U.uJit.value.set(jx, jy, n > 0 ? n : (this.frame % 8), 0);
      cam.projectionMatrix.copy(rig.proj);
      if (n > 0) {
        const e = cam.projectionMatrix.elements, ax = 2 * jx / this.w, ay = 2 * jy / this.h;
        e[0] += ax * e[3]; e[4] += ax * e[7]; e[8] += ax * e[11]; e[12] += ax * e[15];
        e[1] += ay * e[3]; e[5] += ay * e[7]; e[9] += ay * e[11]; e[13] += ay * e[15];
      }
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

      // ---- shadows ----
      const sdir = this._tmpV2.copy(U.uSunDir.value);
      if (n > 0) {   // while refining, sample the sun as a disc: real penumbrae
        const a = halton(n, 5) * Math.PI * 2, rr = Math.sqrt(halton(n, 7)) * 0.011;
        const ux = new THREE.Vector3(1, 0, 0); if (Math.abs(sdir.x) > 0.9) ux.set(0, 0, 1);
        const t1 = new THREE.Vector3().crossVectors(sdir, ux).normalize(), t2 = new THREE.Vector3().crossVectors(sdir, t1);
        sdir.addScaledVector(t1, Math.cos(a) * rr).addScaledVector(t2, Math.sin(a) * rr).normalize();
      }
      const focus = this.shadowFocus;
      if (rig.mode === 'walk') { focus.copy(rig.pos).addScaledVector(rig.fwd, 30); focus.y = 0; this.shadowRadius[0] = 75; }
      else { focus.set(rig.c.tx, 0, rig.c.tz); this.shadowRadius[0] = Math.max(45, Math.min(260, (rig.ortho ? rig.c.dist * Math.tan(rig.c.fov * 0.00873) * 1.9 : rig.c.dist * 0.6))); }
      const tA = this._fitShadow(0, focus, this.shadowRadius[0], sdir, Q.shadow);
      const tB = this._fitShadow(1, new THREE.Vector3(focus.x * 0.5, 0, focus.z * 0.5), this.shadowRadius[1], sdir, Q.shadowFar);
      const soft = n > 0 ? 0.9 : 1.0;
      U.uShInfo.value.set(tA, tB, Math.max((n > 0 ? 0.06 : 0.2) / (2 * this.shadowRadius[0]), soft * 1.3 / Q.shadow), soft * 1.3 / Q.shadowFar);
      if (F.clip) { U.uClip.value.copy(F.clip); U.uClipOn.value = 1; } else U.uClipOn.value = 0;
      const shM = this.mats.world.shadow;
      for (let i = 0; i < 2; i++) {
        shM.uniforms.uLod.value.set((i === 0 ? Q.shadow : Q.shadowFar) / (2 * this.shadowRadius[i]), 1, 0.6, 0);
        this._assign('shadow', m => m.userData.set ? m.userData.set.castShadow : true);
        r.setRenderTarget(this.shadowRT[i]); r.clear(true, true, false);
        r.render(scene, this.shadowCam[i]);
      }

      // ---- mirror pass for water and wet ground ----
      const wantRefl = (this.reflWanted || env.wetness > 0.25) && L.id === 0 && !F.clip && Q.refl !== false;
      U.uReflOn.value = 0;
      if (wantRefl) {
        const mc = this.mirrorCam;
        const mir = this._tmpM.makeScale(1, -1, 1);
        mc.matrixWorldInverse.multiplyMatrices(cam.matrixWorldInverse, mir);
        mc.matrixWorld.copy(mc.matrixWorldInverse).invert();
        mc.projectionMatrix.copy(cam.projectionMatrix); mc.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
        mc.isOrthographicCamera = rig.ortho; mc.isPerspectiveCamera = !rig.ortho;
        const wm = this.mats.world.refl;
        wm.uniforms.uLod.value.set(rig.pxPerM * 0.5, rig.ortho ? 1 : 0, 0.9, 0);
        U.uClip.value.set(0, -1, 0, 0.02); U.uClipOn.value = 1;      // nothing below the mirror plane
        this._assign('refl');
        r.setRenderTarget(R.reflG); r.setClearColor(0x000000, 0); r.clear(true, true, false);
        r.render(scene, mc);
        P.reflResolve.uniforms.tDirect.value = R.reflG.textures[0]; P.reflResolve.uniforms.tAmbient.value = R.reflG.textures[1]; P.reflResolve.uniforms.tDepth.value = R.reflG.depthTexture;
        this._pass(P.reflResolve, R.refl);
        U.uReflTex.value = R.refl.texture; U.uReflOn.value = 1;
      }

      // ---- G-buffer ----
      if (F.clip) { U.uClip.value.copy(F.clip); U.uClipOn.value = 1; } else U.uClipOn.value = 0;
      const gpass = F.clip ? 'cut' : 'g';
      this.mats.world[gpass].uniforms.uLod.value.set(rig.pxPerM, rig.ortho ? 1 : 0, 0.5, 0);
      this._assign(gpass);
      r.setRenderTarget(R.gbuf); r.setClearColor(0x000000, 0); r.clear(true, true, false);
      r.render(scene, cam);
      this.stats.calls = r.info.render.calls; this.stats.tris = r.info.render.triangles;

      // ---- ambient occlusion ----
      if (Q.ao) {
        const u = P.ao.uniforms;
        u.tDepth.value = R.gbuf.depthTexture; u.tNormal.value = R.gbuf.textures[2];
        u.uProj.value.copy(cam.projectionMatrix); u.uInvProj.value.copy(cam.projectionMatrixInverse);
        u.uAO.value.set(1.2, 7.5, L.id === 1 ? 1.25 : 1.0, n > 0 ? n : 0);
        u.uPix.value.set(pix, rig.ortho ? 1 : 0);
        this._pass(P.ao, R.aoA);
        const b = P.blur.uniforms;
        b.tDepth.value = R.gbuf.depthTexture; b.tNormal.value = R.gbuf.textures[2]; b.uInvProj.value.copy(cam.projectionMatrixInverse); b.uPix.value.copy(u.uPix.value);
        b.tAO.value = R.aoA.texture; b.uDir.value.set(1 / this.w, 0); this._pass(P.blur, R.aoB);
        b.tAO.value = R.aoB.texture; b.uDir.value.set(0, 1 / this.h); this._pass(P.blur, R.aoA);
      } else { r.setRenderTarget(R.aoA); r.setClearColor(0xffffff, 1); r.clear(true, false, false); r.setClearColor(0x000000, 0); }

      // ---- composite ----
      {
        const u = P.comp.uniforms;
        u.tDirect.value = R.gbuf.textures[0]; u.tAmbient.value = R.gbuf.textures[1]; u.tNormal.value = R.gbuf.textures[2]; u.tDepth.value = R.gbuf.depthTexture; u.tAO.value = R.aoA.texture;
        u.uInvProj.value.copy(cam.projectionMatrixInverse); u.uInvView.value.copy(rig.invView);
        u.uInvViewProj.value.multiplyMatrices(cam.projectionMatrix, rig.view).invert();
        u.uCamPos.value.copy(rig.pos);
        const camDist = rig.mode === 'walk' ? 120 : rig.c.dist;
        u.uCam.value.set(rig.ortho ? 1 : 0, rig.focusDistance(), rig.ortho ? 0.12 : 420 / Math.max(420, camDist), rig.near);
        u.uPix.value.set(pix, rig.ortho ? 1 : 0);
        if (L.id === 2) {
          u.uInk.value.fromArray(L.ink); u.uPaper.value.fromArray(L.paper); u.uShade.value.fromArray(L.shade);
          u.uInkP.value.set(L.hatch ? 1 : 0, Math.max(3.2, this.h / 230), 0, L.figure ? 1 : 0);
        }
        this._pass(P.comp, R.hdr);
      }
      // ---- resolve / accumulate ----
      {
        const u = P.resolve.uniforms;
        u.tCur.value = R.hdr.texture; u.tHist.value = R.accA.texture; u.uAlpha.value = 1 / (n + 1);
        this._pass(P.resolve, R.accB);
        const t = R.accA; R.accA = R.accB; R.accB = t;
        this.accumN = n + 1;
      }
      // ---- bloom ----
      this.bloomAmt = (Q.bloom && L.bloom) ? L.bloom * (1 + env.night * 1.6) : 0;
      if (this.bloomAmt > 0) {
        let src = R.accA;
        for (let i = 0; i < R.bloom.length; i++) {
          const u = P.down.uniforms; u.tSrc.value = src.texture; u.uTexel.value.set(1 / src.width, 1 / src.height); u.uFirst.value = i === 0 ? 1 : 0;
          this._pass(P.down, R.bloom[i]); src = R.bloom[i];
        }
        let acc = R.bloom[R.bloom.length - 1];
        for (let i = R.bloom.length - 2; i >= 0; i--) {
          const u = P.up.uniforms; u.tSrc.value = acc.texture; u.tBase.value = R.bloom[i].texture; u.uTexel.value.set(1 / acc.width, 1 / acc.height);
          this._pass(P.up, R.bloomUp[i]); acc = R.bloomUp[i];
        }
        this.bloomTex = acc.texture;
      }
    }

    // ---- overlays: drawn against the scene depth, never accumulated ----
    if (ovlActive) {
      cam.projectionMatrix.copy(rig.proj); cam.projectionMatrixInverse.copy(rig.invProj);
      if (F.clip) { U.uClip.value.copy(F.clip); U.uClipOn.value = 1; } else U.uClipOn.value = 0;
      this.mats.ovl.fwd.uniforms.uLod.value.set(rig.pxPerM, rig.ortho ? 1 : 0, 0.4, 0);
      r.setRenderTarget(R.ovl); r.setClearColor(0x000000, 0); r.clear(true, false, false);
      for (const h of this.overlayHooks) if (h.active()) h.draw(r, cam, F, this);
    }
    // ---- develop ----
    {
      const u = P.develop.uniforms;
      u.tHdr.value = R.accA.texture; u.tDepth.value = R.gbuf.depthTexture;
      u.tOvl.value = ovlActive ? R.ovl.texture : this.clearTex;
      u.tBloom.value = this.bloomAmt > 0 ? this.bloomTex : R.accA.texture;
      const g = L.grade || [1, 1, 0, 0];
      u.uTone.value.set(env.exposure * this.exposureBias, this.bloomAmt || 0, L.id === 2 ? 0 : 1, L.mono ? 1 : 0);
      u.uGrade.value.set(g[0], g[1], g[2], g[3]);
      u.uGrade2.value.set(this.bloomAmt > 0 ? 1 / R.bloom.length : 1, 0, 0, 0);
      const dofOn = (L.dof || F.dof) && !rig.ortho ? 1 : 0;
      u.uDof.value.set(dofOn, rig.focusDistance(), rig.focusDistance() * (F.dofRange || 0.55), this.h * 0.011);
      u.uProjInfo.value.set(rig.near, rig.far, rig.ortho ? 1 : 0, 0);
      this._pass(P.develop, R.ldr);
    }
    // ---- selection mask ----
    const haveSel = (this.sel.length + this.hover.length) > 0 && !F.hideSelection;
    if (haveSel) {
      cam.projectionMatrix.copy(rig.proj); cam.projectionMatrixInverse.copy(rig.invProj);
      const mm = this.mats.world.mask;
      mm.uniforms.uLod.value.set(rig.pxPerM, rig.ortho ? 1 : 0, 0.5, 0);
      r.setRenderTarget(R.mask); r.setClearColor(0x000000, 0); r.clear(true, false, false);
      for (let pass = 0; pass < 2; pass++) {
        const list = pass === 0 ? this.sel : this.hover;
        if (!list.length) continue;
        const setOf = new Set(list);
        this._assign('mask', m => setOf.has(m.userData.set));
        mm.uniforms.uMaskCol.value.set(pass === 0 ? 1 : 0, pass === 1 ? 1 : 0, 0, 1);
        r.render(scene, cam);
      }
    }
    // ---- film ----
    {
      const u = P.final.uniforms;
      u.tLdr.value = R.ldr.texture; u.tMask.value = R.mask.texture;
      u.uFilm.value.set(L.grain || 0.03, L.vig || 0.2, still ? 0.37 : F.time, (Q.fxaa && n < 6) ? 1 : 0);
      u.uSel.value.set(haveSel ? 1 : 0, 0, 0, 0);
      u.uCrop.value.set(this.crop, 0.62, 0, 0);
      this._pass(P.final, null);
    }
    r.setRenderTarget(null);
    this.stats.ms = performance.now() - t0;
    return true;
  }
}