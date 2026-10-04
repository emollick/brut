// All GLSL lives here. ShaderMaterial + GLSL3: three supplies position/normal,
// modelMatrix/viewMatrix/projectionMatrix/cameraPosition; we declare our own outputs.

export const COMMON = /* glsl */`
#define PI 3.14159265359
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float sat(float x){ return clamp(x, 0.0, 1.0); }
float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
vec3 vn3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash33(i), hash33(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash33(i + vec3(0.0, 1.0, 0.0)), hash33(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash33(i + vec3(0.0, 0.0, 1.0)), hash33(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash33(i + vec3(0.0, 1.0, 1.0)), hash33(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
`;

// ---------------------------------------------------------------- environment
export const ENV_UNIFORMS = /* glsl */`
uniform vec3 uSunDir;      // towards the key light (sun, or moon at night)
uniform vec3 uSunCol;      // key light radiance
uniform vec3 uSkyDir;      // towards the actual sun (drives sky glow even below the horizon)
uniform vec3 uAmb[6];      // ambient cube +X -X +Y -Y +Z -Z
uniform vec3 uSkyZen;
uniform vec3 uSkyHor;
uniform vec3 uSkyGlow;
uniform vec3 uGroundFar;
uniform vec3 uCloudLit;
uniform vec3 uCloudDark;
uniform vec3 uSunDisc;
uniform vec4 uCloud;       // cover, drift x, drift y, opacity
uniform vec4 uWeather;     // wet, snow, night, lit-window fraction
uniform vec4 uFog;         // density, height falloff, sun in-scatter, spare
uniform vec4 uSeason;      // leaf turn, bare, dry grass, spare
uniform float uTime;
uniform sampler2D uNoise;
vec4 nz(vec2 p){ return texture(uNoise, p * (1.0 / 256.0)); }
float fbmC(vec2 p){
  float a = nz(p).r; a += nz(p * 2.02 + 31.7).g * 0.5; a += nz(p * 4.03 + 11.3).b * 0.25; a += nz(p * 8.01 + 5.1).a * 0.125;
  return a / 1.875;
}
vec3 ambientCube(vec3 n){
  vec3 n2 = n * n;
  vec3 a = n2.x * (n.x < 0.0 ? uAmb[1] : uAmb[0]) + n2.y * (n.y < 0.0 ? uAmb[3] : uAmb[2]) + n2.z * (n.z < 0.0 ? uAmb[5] : uAmb[4]);
  return a + uAmb[3] * (1.0 - n2.y) * 0.55;
}
vec3 skyBase(vec3 d){
  float t = pow(1.0 - clamp(d.y, 0.0, 1.0), 3.0);
  vec3 c = mix(uSkyZen, uSkyHor, t);
  float mu = max(dot(d, uSkyDir), 0.0);
  c += uSkyGlow * (0.55 * pow(mu, 5.0) * (0.25 + 0.75 * t) + 0.45 * pow(mu, 40.0));
  c = mix(c, uGroundFar, smoothstep(0.0, -0.06, d.y));
  return c;
}
float cloudShadow(vec2 xz){
  float n = fbmC(xz * 0.004 + uCloud.yz * 0.6);
  float thr = mix(0.8, 0.15, uCloud.x);
  return 1.0 - smoothstep(thr, thr + 0.2, n) * 0.72 * uCloud.w * (1.0 - smoothstep(0.75, 1.0, uCloud.x));
}
`;

export const SKY_FULL = /* glsl */`
vec3 skyFull(vec3 d){
  vec3 c = skyBase(d);
  float night = uWeather.z;
  if (night > 0.01 && d.y > 0.0) {
    vec3 q = d * 330.0; vec3 qi = floor(q); float h = hash13(qi);
    vec3 qf = fract(q) - 0.5;
    float st = step(0.9965, h) * smoothstep(0.34, 0.0, length(qf)) * (0.25 + 0.75 * fract(h * 917.0));
    c += vec3(0.75, 0.82, 1.0) * st * night * 2.2 * smoothstep(0.0, 0.25, d.y) * (1.0 - uCloud.x * uCloud.w);
  }
  float dens = 0.0; vec3 cl = vec3(0.0);
  if (d.y > 0.004) {
    vec2 p = d.xz / (d.y + 0.14) * 1.5 + uCloud.yz;
    float n = fbmC(p * 1.4) * 0.62 + fbmC(p * 5.3 + 7.1) * 0.38;
    float thr = mix(0.74, 0.2, uCloud.x);
    dens = smoothstep(thr, thr + 0.13, n);
    float n2 = fbmC(p * 1.4 + uSkyDir.xz * 0.22) * 0.62 + fbmC(p * 5.3 + 7.1 + uSkyDir.xz * 0.22) * 0.38;
    float lit = clamp(0.5 + (n - n2) * 2.6, 0.0, 1.0);
    cl = mix(uCloudDark, uCloudLit, lit);
    float mu = max(dot(d, uSkyDir), 0.0);
    cl += uSkyGlow * pow(mu, 8.0) * 0.5 * (1.0 - dens * 0.5);
    dens *= smoothstep(0.004, 0.11, d.y) * uCloud.w;
  }
  float mu2 = dot(d, uSkyDir);
  c += uSunDisc * smoothstep(0.99988, 0.99996, mu2) * (1.0 - dens);
  c = mix(c, cl, dens);
  return c;
}
`;

// ------------------------------------------------------------------- shadows
export const SHADOW = /* glsl */`
uniform highp sampler2DShadow uShA;
uniform highp sampler2DShadow uShB;
uniform mat4 uShMatA;
uniform mat4 uShMatB;
uniform vec4 uShInfo;   // texel world size A, B; filter radius (uv) A, B
uniform vec4 uJit;      // jitter x, y, frame index, taps scale
const vec2 POI[12] = vec2[12](
  vec2(-0.326,-0.406), vec2(-0.840,-0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
  vec2( 0.962,-0.195), vec2( 0.473,-0.480), vec2( 0.519, 0.767), vec2( 0.185,-0.893),
  vec2( 0.507, 0.064), vec2( 0.896, 0.412), vec2(-0.322,-0.933), vec2(-0.792,-0.598));
float shadowPCF(highp sampler2DShadow sm, vec3 c, float rad, mat2 R){
  float s = 0.0;
  for (int i = 0; i < 12; i++) { vec2 o = R * POI[i] * rad; s += textureLod(sm, vec3(c.xy + o, c.z), 0.0); }
  return s / 12.0;
}
float sunShadow(vec3 wp, vec3 n){
  float ang = ign(gl_FragCoord.xy + uJit.z * 7.13) * 6.2831853;
  float ca = cos(ang), sa = sin(ang);
  mat2 R = mat2(ca, sa, -sa, ca);
  vec3 pa = wp + n * (uShInfo.x * 1.7) + uSunDir * (uShInfo.x * 0.8);
  vec3 a = (uShMatA * vec4(pa, 1.0)).xyz;
  vec2 e = abs(a.xy - 0.5) * 2.0;
  float edge = max(e.x, e.y);
  float sA = 1.0, sB = 1.0;
  if (edge < 1.0 && a.z < 1.0) sA = shadowPCF(uShA, a, uShInfo.z, R);
  if (edge > 0.8) {
    vec3 pb = wp + n * (uShInfo.y * 1.7) + uSunDir * (uShInfo.y * 0.8);
    vec3 b = (uShMatB * vec4(pb, 1.0)).xyz;
    if (b.x > 0.0 && b.x < 1.0 && b.y > 0.0 && b.y < 1.0 && b.z < 1.0) sB = shadowPCF(uShB, b, uShInfo.w, R);
  }
  return mix(sA, sB, smoothstep(0.8, 1.0, edge));
}
`;

// ------------------------------------------------------------ world (vertex)
export const WORLD_VERT = /* glsl */`
in vec3 aSurf;
in mat4 iM;
in vec3 iColor;
in vec4 iMat;       // material id, finish + 8*role, taper, seed
uniform vec4 uObj;  // build height, ghost, selected, light seed
uniform vec4 uObj2; // age, vigor, spare, spare
uniform float uTime;
uniform vec4 uWind; // dir x, dir z, strength, gust phase
uniform vec4 uLod;  // px per metre at 1 m, ortho flag, min px, spare
out vec3 vWorld;
out vec3 vLocal;
out vec3 vNrmW;
out vec3 vTex;
out vec3 vNrmU;
flat out vec4 vMat;
flat out vec3 vColor;
out vec3 vUnit;
flat out vec3 vSize;
out vec3 vMisc;     // metres below element top, cylindrical u (m), cylinder flag
#define PI 3.14159265359
void main(){
  vec3 p = position; vec3 n = normal;
  float matId = floor(iMat.x + 0.5);
  float role = floor(iMat.y / 8.0 + 0.01);
  float taper = iMat.z;
  float f = mix(1.0, taper, p.y + 0.5);
  float fp = taper - 1.0;
  vec3 n2 = vec3(n.x, n.y * f - (p.x * n.x + p.z * n.z) * fp, n.z);
  p.xz *= f;
  mat3 m = mat3(iM);
  vec3 s2 = vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2]));
  vec3 sc = sqrt(s2);
  if (matId == 4.0) {
    float l = sin(position.x * 9.0 + iMat.w * 40.0) * sin(position.y * 8.0 + iMat.w * 17.0) * sin(position.z * 10.0 + iMat.w * 29.0);
    p *= 1.0 + 0.13 * l;
  }
  vec3 nL = normalize(m * (n2 / s2));
  vec4 pL = iM * vec4(p, 1.0);
  vec3 pL0 = pL.xyz;
  if (role == 2.0) {
    float ph = uTime * 1.7 + pL.x * 0.21 + pL.z * 0.17 + uWind.w;
    float amt = uWind.z * 0.0032 * pL.y * pL.y;
    pL.xz += uWind.xy * amt * (0.6 + 0.4 * sin(ph) + 0.25 * sin(ph * 2.7 + 1.3));
  }
  vec4 wp = modelMatrix * pL;
  vWorld = wp.xyz; vLocal = pL.xyz;
  vNrmW = normalize(mat3(modelMatrix) * nL);
  vec3 a0 = m[0] / sc.x, a1 = m[1] / sc.y, a2 = m[2] / sc.z;
  vTex = vec3(dot(a0, pL0), dot(a1, pL0), dot(a2, pL0));
  vNrmU = n; vMat = iMat; vColor = iColor; vUnit = position + 0.5; vSize = sc;
  vMisc = vec3((0.5 - position.y) * sc.y, aSurf.x * PI * 0.5 * (sc.x + sc.z) * f, aSurf.z);
  gl_Position = projectionMatrix * viewMatrix * wp;
  float mid = max(min(sc.x, sc.y), min(max(sc.x, sc.y), sc.z));
  float dist = uLod.y > 0.5 ? 1.0 : max(length(wp.xyz - cameraPosition), 0.1);
  if (mid * uLod.x / dist < uLod.z) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const WORLD_FRAG_HEAD = /* glsl */`
in vec3 vWorld;
in vec3 vLocal;
in vec3 vNrmW;
in vec3 vTex;
in vec3 vNrmU;
flat in vec4 vMat;
flat in vec3 vColor;
in vec3 vUnit;
flat in vec3 vSize;
in vec3 vMisc;
uniform vec4 uObj;
uniform vec4 uObj2;
uniform vec4 uClip;     // world plane (n, d); fragments with n.p + d > 0 are cut away
uniform float uClipOn;
uniform vec4 uLens;     // lens id, structure-only, ink detail, spare
void cutaway(){
  if (vLocal.y > uObj.x) discard;
  if (uClipOn > 0.5 && dot(vWorld, uClip.xyz) + uClip.w > 0.0) discard;
}
`;

export const WORLD_SHADOW_FRAG = COMMON + WORLD_FRAG_HEAD + /* glsl */`
out vec4 o;
void main(){
  cutaway();
  if (uObj.y > 0.5) discard;
  // sunlight finds its way through a crown, so the shade under a tree is dappled
  if (floor(vMat.x + 0.5) == 4.0 && floor(vMat.y / 8.0 + 0.01) == 2.0) {
    if (vn3(vTex * 1.25).x * 0.6 + vn3(vTex * 3.1).x * 0.4 < 0.47) discard;
  }
  o = vec4(1.0);
}
`;

export const WORLD_MASK_FRAG = WORLD_FRAG_HEAD + /* glsl */`
out vec4 o;
uniform vec4 uMaskCol;
void main(){
  cutaway();
  o = uMaskCol;
}
`;

// top-down rasters: height of the first surface below the camera, or a big number when that
// surface is a back face (the camera plane is inside a solid)
export const WORLD_TOP_FRAG = WORLD_FRAG_HEAD + /* glsl */`
out vec4 o;
void main(){
  if (vLocal.y > uObj.x) discard;
  if (uObj.y > 0.5) discard;
  float matId = floor(vMat.x + 0.5);
  float role = floor(vMat.y / 8.0 + 0.01);
  if (role == 2.0 || matId == 7.0 || matId == 10.0) discard;
  o = vec4(gl_FrontFacing ? vWorld.y : 9000.0, matId, 0.0, 1.0);
}
`;

// ---------------------------------------------------------- world (G-buffer)
export const WORLD_FRAG = COMMON + WORLD_FRAG_HEAD + ENV_UNIFORMS + SHADOW + /* glsl */`
layout(location = 0) out vec4 oDirect;   // sunlight + emission | litness
layout(location = 1) out vec4 oAmbient;  // skylight          | ink tone
layout(location = 2) out vec4 oNormal;   // view normal       | element id
uniform sampler2D uLampMap;
uniform vec4 uSite;      // plan half-size (m), north sign, season, grid
uniform float uRefl;     // 1 when rendering the mirror pass

// ---- formwork ----
vec2 boards(vec2 p, float bw, float seed){        // p.x runs along the board
  float bc = p.y / bw; float bi = floor(bc); float bf = fract(bc);
  float jx = p.x / 3.4 + hash11(bi * 7.13 + seed * 31.0) * 9.0; float ji = floor(jx); float jf = fract(jx);
  float pid = hash12(vec2(bi, ji) + seed * 17.0);
  float fwy = fwidth(bc); float fwx = fwidth(jx);
  float lod = 1.0 - smoothstep(0.3, 0.95, fwy);
  float grain = nz(vec2(p.x * 5.0 + pid * 90.0, bc * 13.0)).r - 0.5;
  float eg = min(bf, 1.0 - bf);
  float line = 1.0 - smoothstep(0.0, 0.04 + fwy, eg);
  float ex = min(jf, 1.0 - jf) * 3.4;
  float butt = 1.0 - smoothstep(0.0, 0.007 + fwx * 3.4, ex);
  float t = 1.0 + ((pid - 0.5) * 0.17 + grain * 0.11) * lod - (line * 0.24 + butt * 0.16) * lod;
  float h = ((pid - 0.5) * 0.8 - line * 1.4 - butt + grain * 0.9) * lod;
  return vec2(t, h);
}
vec2 ribs(vec2 p, float pitch){
  float rc = p.x / pitch; float rf = fract(rc); float fw = fwidth(rc);
  float lod = 1.0 - smoothstep(0.25, 0.85, fw);
  float prof = abs(rf - 0.5) * 2.0;
  float chip = nz(vec2(floor(rc) * 3.7, p.y * 8.0)).r;
  float ridge = smoothstep(0.8, 0.2, prof + (chip - 0.5) * 0.55);
  float t = mix(0.83, mix(0.62, 1.07, ridge), lod);
  return vec2(t, (ridge * 2.4 + chip * 0.5) * lod);
}
vec2 panels(vec2 p, vec2 size, float seed, float holes){
  vec2 pc = p / size; vec2 pi = floor(pc); vec2 pf = fract(pc); vec2 fw = fwidth(pc);
  float lod = 1.0 - smoothstep(0.02, 0.12, max(fw.x, fw.y));
  float pid = hash12(pi + seed * 13.0);
  vec2 e = min(pf, 1.0 - pf) * size;
  float joint = 1.0 - smoothstep(0.004, 0.014 + max(fw.x * size.x, fw.y * size.y), min(e.x, e.y));
  vec2 hc = p / vec2(0.6, 0.45); vec2 hf = (fract(hc) - 0.5) * vec2(0.6, 0.45);
  float hfw = fwidth(hc.x) * 0.6;
  float hole = (1.0 - smoothstep(0.011, 0.017 + hfw, length(hf))) * (1.0 - smoothstep(0.004, 0.02, hfw)) * holes;
  float t = 1.0 + (pid - 0.5) * 0.085 * lod - joint * 0.28 * lod - hole * 0.5;
  return vec2(t, (pid - 0.5) * 0.3 * lod - joint * 1.2 * lod - hole * 2.5);
}
vec3 bump(vec3 N, vec3 P, float h, float k){
  vec3 dpx = dFdx(P), dpy = dFdy(P);
  float hx = dFdx(h), hy = dFdy(h);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 g = sign(det) * (hx * r1 + hy * r2);
  return normalize(abs(det) * N - k * g);
}

void main(){
  cutaway();
  float matId = floor(vMat.x + 0.5);
  float fin = mod(floor(vMat.y + 0.5), 8.0);
  float role = floor(vMat.y / 8.0 + 0.01);
  float seed = vMat.w;
  float lens = uLens.x;
  if (uLens.y > 0.5 && role != 1.0 && matId < 4.0) {            // structure lens: infill becomes a ghost
    discard;
  }
  if (uObj.y > 0.5 && ign(gl_FragCoord.xy + 3.0) > 0.62) discard; // placement ghost

  if (!gl_FrontFacing && uClipOn > 0.5 && uRefl < 0.5) {     // the cut face of a solid: poche
    float pm = floor(vMat.x + 0.5);
    vec3 pc = pm == 1.0 ? vec3(0.10, 0.13, 0.15) : (pm == 4.0 ? vec3(0.04, 0.07, 0.03) : vec3(0.035, 0.033, 0.032));
    if (uLens.x > 0.5 && uLens.x < 1.5) pc = pm == 1.0 ? vec3(0.4, 0.45, 0.5) : vec3(0.16, 0.15, 0.14);
    oDirect = vec4(0.0);
    oAmbient = vec4(pc * (0.6 + 0.8 * ambientCube(-uClip.xyz)), 0.04);
    oNormal = vec4(normalize(mat3(viewMatrix) * (-uClip.xyz)), 1.777);
    return;
  }
  vec3 Ng = normalize(vNrmW);
  if (!gl_FrontFacing) Ng = -Ng;
  vec3 N = Ng;
  vec3 V = normalize(cameraPosition - vWorld);
  if (isOrthographic) V = normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
  vec3 an = abs(vNrmU);
  vec2 uv; float vert = 1.0;
  if (vMisc.z > 0.5) uv = vec2(vMisc.y, vTex.y);
  else if (an.y > an.x && an.y > an.z) { uv = vTex.xz; vert = 0.0; }
  else if (an.x > an.z) uv = vec2(vTex.z, vTex.y);
  else uv = vec2(vTex.x, vTex.y);

  vec3 alb = vColor;
  vec3 emis = vec3(0.0);
  float spec = 0.0, gloss = 24.0, tone = 1.0, refl = 0.0, f0 = 0.04;
  float folLit = 1.0, folAO = 1.0;
  float wet = uWeather.x, snow = uWeather.y;
  float age = uObj2.x;
  float up = Ng.y;
  float id = 1.0 + fract(seed * 61.7 + matId * 0.137 + 0.05);     // ids >= 1 are built things, < 1 is ground

  if (lens > 1.5) {
    // ---- ink / blueprint lenses only need tone and clean normals ----
    if (matId == 1.0) tone = 0.34;
    else if (matId == 2.0) tone = 0.62;
    else if (matId == 3.0) tone = 0.3;
    else if (matId == 4.0) tone = role == 2.0 ? 0.82 : 0.76;
    else if (matId == 7.0) tone = 0.2;
    else if (matId == 8.0) tone = 0.7;
    float ndl0 = dot(N, uSunDir);
    float sh0 = ndl0 > 0.0 ? sunShadow(vWorld, Ng) : 0.0;
    oDirect = vec4(vec3(0.0), sh0 * smoothstep(0.0, 0.12, ndl0));
    oAmbient = vec4(vec3(0.0), tone);
    oNormal = vec4(normalize(mat3(viewMatrix) * N), id);
    return;
  }

  if (matId == 0.0) {
    // ================= concrete =================
    float h = 0.0;
    vec2 r = vec2(1.0, 0.0);
    if (vert > 0.5) {
      if (fin < 0.5) r = boards(uv, 0.15, seed);
      else if (fin < 1.5) r = boards(uv.yx, 0.15, seed);
      else if (fin < 2.5) r = ribs(uv, 0.11);
      else if (fin < 3.5) { float g = nz(uv * 46.0).r; float g2 = nz(uv * 110.0).g; r = vec2(0.86 + 0.2 * g + (g2 > 0.78 ? -0.14 : 0.0), g * 1.6); }
      else if (fin < 4.5) r = panels(uv, vec2(1.8, 0.9), seed, 1.0);
      else if (fin < 5.5) { r = panels(uv, vec2(3.0, 3.0), seed, 0.0); float g = nz(uv * 70.0).r; r.x *= 0.92 + 0.16 * g; r.y += g; }
      else r = vec2(1.0 + (nz(uv * 3.0).r - 0.5) * 0.05, 0.0);
    } else {
      r = boards(uv, 0.2, seed);                 // slabs and soffits are cast on boards too
      r.x = mix(1.0, r.x, up < 0.0 ? 1.0 : 0.35);
      r.y *= up < 0.0 ? 1.0 : 0.3;
    }
    alb *= r.x; h = r.y;
    // pour lifts, mottling, grain
    float lift = uv.y / 3.0;
    alb *= 1.0 + (hash11(floor(lift) + seed * 5.0) - 0.5) * 0.055 * vert;
    alb *= 0.9 + 0.2 * nz(uv * 0.11 + seed * 31.0).r;
    alb *= 0.94 + 0.12 * nz(uv * 1.7).g;
    alb *= 0.96 + 0.08 * nz(uv * 23.0).b;
    alb *= 1.0 + (seed - 0.5) * 0.05;
    // ---- weathering ----
    if (age > 0.001) {
      float dirt = 0.0;
      if (vert > 0.5) {
        float n1 = nz(vec2(uv.x * 2.1 + seed * 40.0, seed * 97.0 + 0.5)).r;
        float n2 = nz(vec2(uv.x * 12.0, 3.7 + seed * 13.0)).g;
        float len = 0.25 + 4.5 * n1 * n1;
        float streak = smoothstep(len, 0.0, vMisc.x) * (0.3 + 0.7 * n2) * smoothstep(0.3, 0.65, n1 * 0.65 + n2 * 0.35);
        dirt += streak * 0.6 + exp(-vMisc.x / 0.35) * 0.22;
        dirt += smoothstep(1.4, 0.0, vLocal.y) * (0.25 + 0.3 * nz(uv * 0.8).r);           // splash zone
      } else if (up > 0.0) {
        dirt += 0.18 + 0.35 * fbmC(uv * 1.3 + seed * 9.0);
      }
      dirt *= age;
      alb *= mix(vec3(1.0), vec3(0.42, 0.40, 0.37), sat(dirt));
      float north = sat(dot(Ng, vec3(0.0, 0.0, -uSite.y)));
      float moss = sat(age - 0.35) * smoothstep(0.52, 0.8, nz(uv * 0.35 + 7.0).r + north * 0.22 + smoothstep(2.5, 0.0, vLocal.y) * 0.2 + (up > 0.5 ? 0.12 : 0.0));
      alb = mix(alb, vec3(0.2, 0.26, 0.11) * (0.7 + 0.6 * nz(uv * 9.0).g), moss * 0.75);
      float rust = sat(age - 0.85) * 3.0 * smoothstep(0.86, 0.95, nz(vec2(uv.x * 5.0, seed * 50.0)).a) * smoothstep(2.5, 0.2, vMisc.x) * vert;
      alb = mix(alb, vec3(0.42, 0.2, 0.08), rust * 0.6);
    }
    // ---- rain and snow ----
    if (wet > 0.001) {
      float shelter = up < -0.3 ? 0.0 : 1.0;
      float run = vert > 0.5 ? (0.55 + 0.45 * nz(vec2(uv.x * 3.0, uv.y * 0.15)).r) * smoothstep(8.0, 0.0, vMisc.x) + 0.35 : 1.0;
      float w = wet * shelter * sat(run);
      alb *= mix(1.0, 0.58, w);
      spec = 0.25 * w; gloss = mix(24.0, 220.0, w);
      refl = w * (up > 0.5 ? 0.5 : 0.08);
    }
    N = bump(N, vWorld, h * 0.004, lens > 0.5 ? 0.0 : 1.0);
    if (lens > 0.5) alb = vec3(0.84, 0.83, 0.81);
  } else if (matId == 1.0) {
    // ================= glazing =================
    vec2 q; vec2 dim;
    if (an.z >= an.x) { q = vUnit.xy * vSize.xy; dim = vSize.xy; } else { q = vUnit.zy * vSize.zy; dim = vSize.zy; }
    float nM = max(1.0, floor(dim.x / 1.3 + 0.5)); float mw = dim.x / nM;
    float mx = abs(fract(q.x / mw + 0.5) - 0.5) * mw;
    float fr = min(min(q.x, dim.x - q.x), min(q.y, dim.y - q.y));
    float tr = dim.y > 2.3 ? abs(q.y - 0.95) : 9.0;
    float fwq = fwidth(q.x) + fwidth(q.y);
    float bar = min(min(fr - 0.03, mx - 0.012), tr - 0.012);
    float frame = 1.0 - smoothstep(0.02, 0.03 + fwq, bar);
    frame *= 1.0 - smoothstep(0.02, 0.09, fwq);
    float pane = hash12(vec2(floor(q.x / mw), seed * 113.0) + uObj.w * 7.0);
    float blind = fract(pane * 7.31);
    float curtain = step(0.84, fract(pane * 3.17));
    float shade = max(curtain * 0.7, step(dim.y * (0.45 + 0.5 * blind), q.y) * step(0.62, blind));
    // float glass is never quite flat: each pane leans its own way and catches the sun alone
    vec2 pv = vec2(fract(pane * 91.7), fract(pane * 37.3)) - 0.5;
    vec3 T1 = normalize(cross(Ng, vec3(0.0, 1.0, 0.001))); vec3 T2 = cross(Ng, T1);
    N = normalize(Ng + (T1 * pv.x + T2 * pv.y) * 0.03 * (1.0 - frame));
    vec3 glassCol = vec3(0.010, 0.014, 0.016);
    vec3 inner = mix(glassCol, vec3(0.05, 0.048, 0.043) * (0.6 + 0.6 * fract(pane * 11.3)), shade);
    alb = mix(inner, vColor, frame);
    spec = mix(1.0, 0.05, frame); gloss = 2400.0; f0 = mix(0.1 + 0.08 * fract(pane * 23.1), 0.04, frame);
    refl = mix(1.0, 0.0, frame);
    tone = mix(0.36, 0.25, frame);
    // lit rooms at night
    float lit = step(fract(pane * 5.77 + uObj.w), uWeather.w * uObj2.z) * (1.0 - frame);
    if (lit > 0.0 && lens < 0.5) {
      float temp = fract(pane * 9.1);
      vec3 lc = temp < 0.5 ? vec3(1.0, 0.60, 0.26) : (temp < 0.8 ? vec3(1.0, 0.78, 0.50) : (temp < 0.93 ? vec3(0.78, 0.9, 1.0) : vec3(0.45, 0.62, 1.0)));
      float room = 0.45 + 0.55 * smoothstep(0.0, dim.y, q.y);
      room *= 1.0 - 0.55 * step(q.y, 0.9) * step(0.5, fract(pane * 13.7));
      emis = lc * room * (0.5 + 1.3 * fract(pane * 17.3)) * mix(1.0, 0.4, shade) * 0.34;
      alb = mix(alb, lc * 0.3, 0.5);
    }
    if (lens > 0.5) { alb = mix(vec3(0.28, 0.33, 0.36), vec3(0.8), frame); emis = vec3(0.0); }
  } else if (matId == 2.0) {
    alb *= 0.92 + 0.16 * nz(uv * 2.0).r;
    if (age > 0.001) alb = mix(alb, vec3(lum(alb)) * 0.9 + 0.05, sat(age * 0.55));
    spec = 0.12; gloss = 60.0; tone = 0.6;
  } else if (matId == 3.0) {
    spec = 0.3; gloss = 90.0; tone = 0.3;
    if (lens > 0.5) alb = vec3(0.5);
  } else if (matId == 4.0) {
    // ================= planting =================
    // A crown is a handful of soft masses and the leaves are noise: sprays that catch the light or sit
    // in each other's shade, an edge eaten away to nothing, and gaps that open on the dark inside.
    float expo = fin < 0.5 ? 0.85 : (fin - 1.0) / 6.0;         // how far out in the crown this mass sits
    float decid = step(vColor.b * 2.2, vColor.g);              // blue-green conifers keep their needles
    vec3 lp = vTex;
    float pxm = length(fwidth(vWorld));                        // metres per pixel: detail fades before it can shimmer
    vec3 nA = vn3(lp * 0.8 + seed * 23.0), nB = vn3(lp * 2.3), nC = vn3(lp * 5.6), nD = vn3(lp * 13.0);
    float kB = 1.0 - smoothstep(0.5, 1.5, pxm * 2.3), kC = 1.0 - smoothstep(0.5, 1.5, pxm * 5.6), kD = 1.0 - smoothstep(0.5, 1.5, pxm * 13.0);
    float lf = 0.5 + (nB.x - 0.5) * 0.3 * kB + (nC.x - 0.5) * 0.55 * kC + (nD.x - 0.5) * 0.55 * kD;
    if (role == 2.0 && decid > 0.5 && uSeason.y > 0.01 && nC.y * 0.6 + nD.y * 0.4 < uSeason.y * 0.62) discard;   // bare in winter
    if (lens < 0.5) {
      if (abs(dot(Ng, V)) < 0.08 + 0.6 * lf + 0.12 * (nA.x - 0.5)) discard;
      if (lf < 0.24) discard;
      vec3 pert = (nB - 0.5) * kB + (nC - 0.5) * 0.8 * kC + (nD - 0.5) * 0.5 * kD;
      N = normalize(Ng + pert.yzx * 1.5);
      alb *= 0.8 + 0.4 * fract(seed * 13.7);
      alb = mix(alb, alb * vec3(1.4, 1.2, 0.6), sat(nA.y * 1.4 - 0.3) * 0.35);       // newer, yellower growth here and there
      float open = smoothstep(0.3, 0.68, lf);                  // 0 down between the sprays, 1 on leaves out in the open
      folLit = mix(0.42, 1.16, open);
      folAO = mix(0.62, 1.0, open) * mix(0.52, 1.0, expo) * mix(0.78, 1.0, smoothstep(0.0, 0.75, vUnit.y));
    }
    alb = mix(alb, vec3(0.5, 0.24, 0.05) * (0.6 + 0.9 * nA.x), uSeason.x * step(0.3, fract(seed * 7.7)) * 0.85 * decid);
    alb = mix(alb, vec3(0.19, 0.16, 0.12), uSeason.y * 0.85 * decid);
    tone = 0.82;
    if (lens > 0.5) alb = vec3(0.7, 0.76, 0.66);
  } else if (matId == 5.0) {
    alb *= 0.8 + 0.4 * nz(vec2(uv.x * 9.0, uv.y * 1.5)).r; tone = 0.6;
    if (lens > 0.5) alb = vec3(0.62, 0.56, 0.48);
  } else if (matId == 6.0) {
    float night = uWeather.z;
    emis = vColor * night * 7.0; alb = vec3(0.8); tone = 1.0;
  } else if (matId == 7.0) {
    tone = 0.25;
    if (lens > 0.5) alb = vec3(0.3);
  } else if (matId == 8.0) {
    alb = vec3(0.02, 0.035, 0.035); spec = 1.0; gloss = 500.0; refl = 1.0; tone = 0.7;
    N = normalize(N + vec3(nz(vWorld.xz * 6.0 + uTime * 0.8).r - 0.5, 0.0, nz(vWorld.xz * 6.0 - uTime * 0.7).g - 0.5) * 0.08);
  } else if (matId == 9.0) {
    alb *= 0.75 + 0.5 * nz(vWorld.xz * 14.0).r; tone = 0.7;
    if (lens > 0.5) alb = vec3(0.7);
  } else {
    spec = 0.5; gloss = 120.0; refl = 0.25; tone = 0.5;      // vehicles
  }

  // snow settles on anything that faces the sky
  if (snow > 0.001 && matId != 1.0 && matId != 6.0) {
    float cover = smoothstep(0.45, 0.8, N.y + (nz(vWorld.xz * 1.3).r - 0.5) * 0.5) * smoothstep(0.0, 0.5, snow + nz(vWorld.xz * 0.2).g * 0.3 - 0.15);
    cover += (1.0 - cover) * snow * 0.18 * smoothstep(0.3, 1.0, nz(uv * 3.0).b) * step(-0.2, up);
    alb = mix(alb, vec3(0.86, 0.89, 0.94), cover);
    spec *= 1.0 - cover; refl *= 1.0 - cover;
  }
  // formwork still on the newest lift while a building is going up
  if (uObj.x < 9000.0) {
    float form = smoothstep(uObj.x - 3.4, uObj.x - 0.4, vLocal.y);
    alb = mix(alb, vec3(0.52, 0.36, 0.17) * (0.75 + 0.5 * nz(vec2(uv.x * 0.5, uv.y * 7.0)).r), form * 0.9);
  }
  if (uObj.y > 0.5) alb = mix(alb, vec3(1.0, 0.36, 0.12), 0.35);

  // ---- lighting ----
  float ndl = dot(N, uSunDir);
  float ndlG = dot(Ng, uSunDir);
  float sh = 0.0, lam = 0.0;
  vec3 thru = vec3(0.0);
  if (matId == 4.0 && lens < 0.5) {
    // leaves face every way, so light wraps well past the terminator; where nothing but this one
    // mass stands between a leaf and the sun, it glows from behind
    sh = sunShadow(vWorld, ndlG > 0.0 ? Ng : -Ng);
    lam = sat(ndl * 0.6 + 0.4) * folLit;
    float fwd = sat(dot(V, -uSunDir) * 0.5 + 0.5);
    thru = alb * vec3(2.3, 1.9, 0.4) * smoothstep(0.15, -0.45, ndlG) * (0.3 + 0.7 * fwd * fwd) * mix(0.45, 1.0, folLit) * 0.5;
  } else {
    if (ndlG > 0.0) sh = sunShadow(vWorld, Ng);
    lam = sat(ndl) * smoothstep(-0.02, 0.06, ndlG);
  }
  float csh = cloudShadow(vWorld.xz);
  vec3 sun = uSunCol * sh * csh;
  vec3 direct = (alb * lam + thru) * sun;
  vec3 Hh = normalize(uSunDir + V);
  direct += sun * spec * pow(sat(dot(N, Hh)), gloss) * min((gloss + 8.0) * 0.04, 18.0) * step(0.0, ndlG);
  vec3 amb = alb * ambientCube(N) * folAO;
  if (refl > 0.001) {
    float fres = f0 + (1.0 - f0) * pow(1.0 - sat(dot(N, V)), 5.0);
    vec3 R = reflect(-V, N);
    vec3 sky = skyBase(normalize(vec3(R.x, abs(R.y) * 0.9 + 0.02, R.z)));
    // below the horizon a pane mirrors the ground and the city in front of it, not the sky
    vec3 envc = up > 0.5 ? sky : mix(uGroundFar * 0.55 + sky * 0.06, sky, smoothstep(-0.14, 0.06, R.y));
    amb = mix(amb, envc, fres * refl);
  }
  // street lighting, pooled in a top-down map
  float night = uWeather.z;
  if (night > 0.01) {
    vec2 luv = vWorld.xz / (uSite.x * 2.0) + 0.5;
    vec3 lamp = texture(uLampMap, luv).rgb;
    float hf = exp(-max(vWorld.y - 0.0, 0.0) / 7.0);
    amb += alb * lamp * hf * (0.35 + 0.65 * sat(N.y * 0.5 + 0.5)) * night;
  }
  float sel = uObj.z;
  oDirect = vec4(direct + emis + alb * sel * vec3(0.10, 0.04, 0.0), sh * smoothstep(0.0, 0.12, ndlG));
  oAmbient = vec4(amb, tone);
  oNormal = vec4(normalize(mat3(viewMatrix) * N), id);
}
`;

// -------------------------------------------------------------------- ground
export const GROUND_VERT = /* glsl */`
out vec3 vWorld;
out vec3 vNrm;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz; vNrm = normal;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const GROUND_TOP_FRAG = /* glsl */`
in vec3 vWorld;
out vec4 o;
void main(){ o = vec4(vWorld.y, -1.0, 0.0, 1.0); }
`;

export const GROUND_FRAG = COMMON + ENV_UNIFORMS + SHADOW + /* glsl */`
layout(location = 0) out vec4 oDirect;
layout(location = 1) out vec4 oAmbient;
layout(location = 2) out vec4 oNormal;
in vec3 vWorld;
in vec3 vNrm;
uniform sampler2D uPlanA;     // paving, asphalt, water
uniform sampler2D uPlanB;     // lawn, markings, gravel
uniform sampler2D uOverlay;
uniform sampler2D uLampMap;
uniform sampler2D uReflTex;
uniform vec4 uOverlayP;       // mode, scale, opacity, spare
uniform vec4 uSite;           // plan half-size, north sign, season, grid opacity
uniform vec4 uLens;
uniform vec2 uRes;
uniform float uReflOn;
uniform float uRefl;
uniform vec4 uClip;
uniform float uClipOn;

vec3 heat(float t){
  t = sat(t);
  vec3 a = vec3(0.07, 0.09, 0.30), b = vec3(0.10, 0.45, 0.62), c = vec3(0.93, 0.80, 0.30), d = vec3(0.92, 0.30, 0.12);
  return t < 0.33 ? mix(a, b, t / 0.33) : (t < 0.66 ? mix(b, c, (t - 0.33) / 0.33) : mix(c, d, (t - 0.66) / 0.34));
}

void main(){
  if (uRefl > 0.5) discard;                 // the ground is never cut by a section, only what stands on it
  vec2 w = vWorld.xz;
  vec2 puv = w / (uSite.x * 2.0) + 0.5;
  float inSite = step(0.0, puv.x) * step(puv.x, 1.0) * step(0.0, puv.y) * step(puv.y, 1.0);
  vec3 pa = texture(uPlanA, puv).rgb * inSite;
  vec3 pb = texture(uPlanB, puv).rgb * inSite;
  float paving = smoothstep(0.4, 0.6, pa.r), asphalt = smoothstep(0.4, 0.6, pa.g), water = smoothstep(0.45, 0.6, pa.b);
  float lawn = smoothstep(0.4, 0.6, pb.r), mark = smoothstep(0.35, 0.65, pb.g), gravel = smoothstep(0.4, 0.6, pb.b);
  float lens = uLens.x;
  float wet = uWeather.x, snow = uWeather.y;
  vec3 N = normalize(vNrm);
  vec3 V = normalize(cameraPosition - vWorld);
  if (isOrthographic) V = normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
  float dist = length(cameraPosition - vWorld);
  float tone = 1.0, spec = 0.0, gloss = 30.0, refl = 0.0, mirror = 0.0;

  // ---- meadow and far country ----
  float n1 = fbmC(w * 0.012), n2 = nz(w * 0.7).r, n3 = nz(w * 5.0).g;
  vec3 gA = mix(vec3(0.078, 0.098, 0.040), vec3(0.135, 0.140, 0.058), n1);
  vec3 straw = vec3(0.225, 0.188, 0.094);
  float dry = smoothstep(0.25, 0.75, n1 * 0.6 + nz(w * 0.05).a * 0.4 + (uSeason.z - 0.5) * 0.45) * 0.6 + uSeason.y * 0.35;
  float blades = nz(w * 29.0).r * 0.6 + nz(w * 61.0 + 3.0).b * 0.4;
  vec3 grass = mix(gA, straw, dry) * (0.78 + 0.3 * n2) * (0.88 + 0.24 * n3) * (0.7 + 0.6 * blades);
  float hgt = vWorld.y;
  float slope = 1.0 - N.y;
  vec3 wood = vec3(0.022, 0.040, 0.020) * (0.7 + 0.6 * nz(w * 0.09).b);
  float woods = smoothstep(0.5, 0.62, fbmC(w * 0.0035 + 3.0) + sat(hgt / 220.0) * 0.25) * smoothstep(8.0, 30.0, hgt);
  // farmed country beyond the site: a quilt of fields with hedges
  float rr = length(w);
  float farm = smoothstep(540.0, 760.0, rr) * (1.0 - smoothstep(0.03, 0.12, slope)) * (1.0 - smoothstep(60.0, 140.0, hgt));
  if (farm > 0.001) {
    vec2 q = mat2(0.94, 0.34, -0.34, 0.94) * w + vec2(fbmC(w * 0.003), fbmC(w * 0.003 + 9.0)) * 120.0;
    vec2 qc = q / vec2(170.0, 105.0);
    vec2 cell = floor(qc), cf = fract(qc);
    float fq = hash12(cell);
    vec3 fieldC = fq < 0.3 ? vec3(0.19, 0.16, 0.08) : (fq < 0.55 ? vec3(0.07, 0.10, 0.036) : (fq < 0.8 ? vec3(0.125, 0.125, 0.055) : vec3(0.105, 0.078, 0.05)));
    fieldC *= 0.85 + 0.3 * nz(w * 0.06).r;
    float fwq = max(fwidth(qc.x), fwidth(qc.y));
    float hedge = (1.0 - smoothstep(0.0, 0.03 + fwq, min(min(cf.x, 1.0 - cf.x), min(cf.y, 1.0 - cf.y)))) * (1.0 - smoothstep(0.03, 0.12, fwq));
    fieldC = mix(fieldC, vec3(0.025, 0.042, 0.022), hedge);
    grass = mix(grass, fieldC, farm);
  }
  grass = mix(grass, wood, woods);
  grass = mix(grass, vec3(0.30, 0.28, 0.25), smoothstep(0.25, 0.5, slope));
  vec3 alb = grass;
  tone = 0.94;
  // mown lawn
  float stripe = 0.94 + 0.06 * step(0.5, fract((w.x + w.y) * 0.09));
  alb = mix(alb, vec3(0.088, 0.116, 0.042) * (0.86 + 0.2 * n2) * (0.8 + 0.4 * blades) * stripe, lawn);
  // gravel
  alb = mix(alb, vec3(0.42, 0.37, 0.29) * (0.7 + 0.6 * nz(w * 11.0).r), gravel);
  // ---- paving ----
  if (paving > 0.001) {
    vec2 fc = w / 0.75; vec2 fi = floor(fc); vec2 ff = fract(fc); vec2 fwf = fwidth(fc);
    float lodf = 1.0 - smoothstep(0.2, 0.7, max(fwf.x, fwf.y));
    float fid = hash12(fi);
    float fj = 1.0 - smoothstep(0.0, 0.03 + max(fwf.x, fwf.y), min(min(ff.x, 1.0 - ff.x), min(ff.y, 1.0 - ff.y)));
    vec2 bc = w / 6.0; vec2 bfr = fract(bc); vec2 fwb = fwidth(bc);
    float bj = 1.0 - smoothstep(0.004, 0.012 + max(fwb.x, fwb.y), min(min(bfr.x, 1.0 - bfr.x), min(bfr.y, 1.0 - bfr.y)));
    bj *= 1.0 - smoothstep(0.05, 0.25, max(fwb.x, fwb.y));
    vec3 pv = vec3(0.335, 0.322, 0.300) * (1.0 + (fid - 0.5) * 0.16 * lodf - fj * 0.22 * lodf - bj * 0.3);
    pv *= 0.86 + 0.28 * fbmC(w * 0.35) ;
    pv *= 0.95 + 0.1 * n3;
    alb = mix(alb, pv, paving); tone = mix(tone, 0.985, paving);
  }
  // ---- asphalt and kerbs ----
  if (pa.g > 0.02) {
    vec3 as = vec3(0.07, 0.07, 0.075) * (0.8 + 0.4 * nz(w * 0.22).r) * (0.85 + 0.3 * nz(w * 9.0).g);
    as = mix(as, vec3(0.62, 0.6, 0.52), mark * 0.9);
    alb = mix(alb, as, asphalt);
    float kerb = smoothstep(0.12, 0.3, pa.g) * (1.0 - smoothstep(0.45, 0.6, pa.g));
    alb = mix(alb, vec3(0.36, 0.35, 0.33), kerb * 0.9);
    tone = mix(tone, 0.8, asphalt);
  }
  // ---- water ----
  if (pa.b > 0.02) {
    float rim = smoothstep(0.1, 0.3, pa.b) * (1.0 - smoothstep(0.42, 0.52, pa.b));
    alb = mix(alb, vec3(0.36, 0.35, 0.33), rim * 0.95);
    if (water > 0.01) {
      vec2 rp = w * 1.4;
      vec3 rn = vec3(nz(rp + uTime * vec2(0.9, 0.5)).r - nz(rp * 1.7 - uTime * vec2(0.6, 0.8)).g, 0.0, nz(rp * 1.3 + uTime * vec2(-0.5, 0.7)).b - nz(rp * 2.1 + uTime * vec2(0.4, -0.9)).a);
      float calm = 0.05 / (1.0 + dist * 0.004);
      N = normalize(mix(N, normalize(vec3(rn.x * calm, 1.0, rn.z * calm)), water));
      alb = mix(alb, vec3(0.012, 0.03, 0.03), water);
      spec = mix(spec, 1.0, water); gloss = mix(gloss, 600.0, water); refl = max(refl, water); mirror = water; tone = mix(tone, 0.72, water);
    }
  }
  // ---- rain: darkened, glossy, puddled ----
  if (wet > 0.001) {
    float hard = max(paving, asphalt);
    float pud = smoothstep(0.52, 0.66, fbmC(w * 0.11 + 5.0) + (wet - 1.0) * 0.25) * hard * (1.0 - water);
    alb *= mix(1.0, 0.55, wet * (1.0 - water));
    refl = max(refl, wet * hard * 0.55 + pud);
    mirror = max(mirror, pud * 0.9 + wet * hard * 0.25);
    spec = max(spec, wet * hard * 0.6); gloss = mix(gloss, 300.0, wet * hard);
    if (pud > 0.01) {
      float rip = nz(w * 7.0 + uTime * 3.0).r - 0.5;
      N = normalize(mix(N, vec3(rip * 0.05, 1.0, rip * 0.05), pud));
    }
  }
  if (snow > 0.001) {
    float cover = smoothstep(0.0, 0.5, snow + n1 * 0.3 - 0.12) * (1.0 - water) * (1.0 - asphalt * 0.55);
    alb = mix(alb, vec3(0.86, 0.89, 0.94) * (0.94 + 0.06 * n3), cover);
    refl *= 1.0 - cover; mirror *= 1.0 - cover; spec *= 1.0 - cover;
  }
  // surveyors' grid while building
  if (uSite.w > 0.001) {
    vec2 g10 = abs(fract(w / 10.0 + 0.5) - 0.5) * 10.0; vec2 fwg = fwidth(w);
    float l10 = 1.0 - smoothstep(0.0, 0.06 + fwg.x, min(g10.x, g10.y));
    vec2 g50 = abs(fract(w / 50.0 + 0.5) - 0.5) * 50.0;
    float l50 = 1.0 - smoothstep(0.0, 0.14 + fwg.x * 1.5, min(g50.x, g50.y));
    float fade = (1.0 - smoothstep(250.0, 900.0, dist)) * inSite * uSite.w;
    alb = mix(alb, vec3(0.9, 0.88, 0.8), max(l10 * 0.16, l50 * 0.4) * fade);
  }
  if (lens > 0.5 && lens < 1.5) {                           // card model
    float card = 0.8 - 0.07 * asphalt - 0.04 * (1.0 - max(paving, asphalt)) * (1.0 - water);
    alb = mix(vec3(card), vec3(0.34, 0.42, 0.46), water);
  }

  float id = 0.013 + 0.11 * paving + 0.23 * asphalt + 0.37 * water + 0.07 * lawn;
  float ndl = dot(N, uSunDir);
  float sh = ndl > 0.0 ? sunShadow(vWorld, vec3(0.0, 1.0, 0.0)) : 0.0;
  if (lens > 1.5) {
    oDirect = vec4(vec3(0.0), sh * smoothstep(0.0, 0.1, ndl));
    oAmbient = vec4(vec3(0.0), tone);
    oNormal = vec4(normalize(mat3(viewMatrix) * normalize(vNrm)), id);
    return;
  }
  float csh = cloudShadow(w);
  vec3 sun = uSunCol * sh * csh;
  vec3 direct = alb * sun * sat(ndl);
  vec3 Hh = normalize(uSunDir + V);
  direct += sun * spec * pow(sat(dot(N, Hh)), gloss) * min((gloss + 8.0) * 0.04, 14.0);
  vec3 amb = alb * ambientCube(N);
  if (refl > 0.001) {
    float fres = 0.07 + 0.93 * pow(1.0 - sat(dot(N, V)), 4.0);
    vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.01;
    vec3 rc = skyBase(normalize(R));
    if (uReflOn > 0.5 && mirror > 0.01) {
      vec2 suv = gl_FragCoord.xy / uRes + N.xz * 0.5;
      vec4 m = texture(uReflTex, suv);
      rc = mix(rc, m.rgb, m.a * mirror);
    }
    amb = mix(amb, rc, fres * refl);
  }
  float night = uWeather.z;
  if (night > 0.01) {
    vec2 luv = w / (uSite.x * 2.0) + 0.5;
    amb += alb * texture(uLampMap, luv).rgb * night * inSite;
  }
  vec3 em = vec3(0.0);
  if (uOverlayP.x > 0.5 && inSite > 0.5) {
    vec4 ov = texture(uOverlay, puv);
    float v = ov.r * uOverlayP.y;
    vec3 hc = heat(v);
    float bands = 0.85 + 0.15 * step(0.5, fract(v * 8.0));
    float k = uOverlayP.z * ov.a;
    direct *= 1.0 - k; amb *= 1.0 - k * 0.8;
    em = hc * bands * k * 0.9 * (0.35 + 0.65 * lum(ambientCube(vec3(0.0, 1.0, 0.0)) + uSunCol * 0.3));
  }
  oDirect = vec4(direct + em, sh * smoothstep(0.0, 0.1, ndl));
  oAmbient = vec4(amb, tone);
  oNormal = vec4(normalize(mat3(viewMatrix) * N), id);
}
`;

// ---------------------------------------------------------------- fullscreen
export const FS_VERT = /* glsl */`
out vec2 vUv;
void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const AO_FRAG = COMMON + /* glsl */`
in vec2 vUv; out vec4 o;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform vec2 uRes;
uniform vec4 uAO;      // small radius, large radius, intensity, frame
uniform vec2 uPix;     // world size of a pixel (at 1 m if perspective), ortho flag
float pixW(float z){ return uPix.y > 0.5 ? uPix.x : uPix.x * z; }
vec3 vpos(vec2 uv){ float d = texture(tDepth, uv).r; vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
float aoR(vec2 uv, vec3 P, vec3 N, float R, float rnd, float phase){
  vec4 c0 = uProj * vec4(P, 1.0); vec4 c1 = uProj * vec4(P + vec3(R, 0.0, 0.0), 1.0);
  float rUV = min(abs(c1.x / c1.w - c0.x / c0.w) * 0.5, 0.11);
  if (rUV * uRes.x < 1.2) return 0.0;
  float aspect = uRes.x / uRes.y;
  float R2 = R * R; float sum = 0.0;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float ang = (fi + rnd) * 2.39996323 + phase;
    float rr = sqrt((fi + 0.5 + rnd * 0.5) / 9.0) * rUV;
    vec2 suv = uv + vec2(cos(ang), sin(ang) * aspect) * rr;
    vec3 Q = vpos(suv);
    vec3 v = Q - P; float vv = dot(v, v); float vn = dot(v, N);
    float f = max(R2 - vv, 0.0);
    sum += f * f * f * max((vn - 0.012 * R - 1.5 * pixW(-P.z)) / (0.01 * R2 + vv), 0.0);
  }
  return sum * 5.0 / (R2 * R2 * R2 * 9.0);
}
void main(){
  float d = texture(tDepth, vUv).r;
  if (d >= 0.999999) { o = vec4(1.0); return; }
  vec3 P = vpos(vUv);
  vec3 N = normalize(texture(tNormal, vUv).xyz);
  float rnd = ign(gl_FragCoord.xy + uAO.w * 5.37);
  float a = aoR(vUv, P, N, uAO.x, rnd, 0.0) * 0.9 + aoR(vUv, P, N, uAO.y, fract(rnd + 0.5), 1.7) * 1.25;
  o = vec4(vec3(max(0.0, 1.0 - a * uAO.z)), 1.0);
}
`;

export const AO_BLUR_FRAG = /* glsl */`
in vec2 vUv; out vec4 o;
uniform sampler2D tAO;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec2 uDir;       // texel step
uniform mat4 uInvProj;
uniform vec2 uPix;
float pixW(float z){ return uPix.y > 0.5 ? uPix.x : uPix.x * z; }
float vz(vec2 uv, float d){ vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return -v.z / v.w; }
void main(){
  float d0 = texture(tDepth, vUv).r;
  if (d0 >= 0.999999) { o = vec4(1.0); return; }
  vec3 n0 = texture(tNormal, vUv).xyz;
  float z0 = vz(vUv, d0);
  float thr = pixW(z0) * 22.0 + 0.03;
  float sum = texture(tAO, vUv).r * 0.2; float wsum = 0.2;
  float W[4] = float[4](0.17, 0.13, 0.085, 0.045);
  for (int i = 1; i <= 4; i++) {
    for (int s = -1; s <= 1; s += 2) {
      vec2 uv = vUv + uDir * float(i * s);
      float d = texture(tDepth, uv).r; vec3 n = texture(tNormal, uv).xyz;
      float w = W[i - 1] * max(0.0, dot(n, n0)) * (1.0 - smoothstep(thr * 0.5, thr, abs(vz(uv, d) - z0)));
      sum += texture(tAO, uv).r * w; wsum += w;
    }
  }
  o = vec4(vec3(sum / wsum), 1.0);
}
`;

// composite: light the G-buffer, add sky and air, or draw it as ink
export const COMPOSITE_FRAG = COMMON + ENV_UNIFORMS + SKY_FULL + /* glsl */`
in vec2 vUv; out vec4 o;
uniform sampler2D tDirect;
uniform sampler2D tAmbient;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform sampler2D tAO;
uniform mat4 uInvProj;
uniform mat4 uInvView;
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform vec2 uRes;
uniform vec4 uLens;      // lens id, structure flag, line weight, paper grain
uniform vec4 uCam;       // ortho flag, focus distance, fog distance scale, near
uniform vec3 uInk;
uniform vec3 uPaper;
uniform vec3 uShade;
uniform vec4 uInkP;      // hatch on, hatch scale, sky lines, poche
uniform vec2 uPix;       // world size of a pixel (at 1 m if perspective), ortho flag

vec3 viewPos(vec2 uv, float d){ vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
float fogAmt(vec3 ro, vec3 p){
  vec3 v = p - ro; float L = length(v);
  float b = uFog.y; float dy = v.y;
  float t = abs(dy) > 0.01 ? (exp(-b * ro.y) - exp(-b * p.y)) / (b * dy) : exp(-b * ro.y);
  return 1.0 - exp(-uFog.x * uCam.z * L * t);
}
void main(){
  float d = texture(tDepth, vUv).r;
  vec4 p0 = uInvViewProj * vec4(vUv * 2.0 - 1.0, -1.0, 1.0); p0 /= p0.w;
  vec4 p1 = uInvViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); p1 /= p1.w;
  vec3 rd = normalize(p1.xyz - p0.xyz);
  float lens = uLens.x;
  bool sky = d >= 0.999999;
  vec3 col;
  if (lens < 1.5) {
    if (sky) {
      vec3 sd = rd;
      if (uCam.x > 0.5) sd = normalize(vec3(rd.x, mix(0.03, 0.75, vUv.y), rd.z));
      col = uCam.x > 0.5 ? skyBase(sd) : skyFull(sd);
      if (lens > 0.5) col = mix(vec3(lum(col)), col, 0.25) * 0.9 + 0.12;
    } else {
      vec4 di = texture(tDirect, vUv); vec4 am = texture(tAmbient, vUv);
      float ao = texture(tAO, vUv).r;
      vec3 aoc = pow(vec3(ao), vec3(1.0, 1.04, 1.1));        // occluded skylight goes a touch warm
      col = di.rgb + am.rgb * aoc;
      vec3 vp = viewPos(vUv, d);
      vec3 wp = (uInvView * vec4(vp, 1.0)).xyz;
      float f = fogAmt(p0.xyz, wp);
      vec3 fd = normalize(vec3(rd.x, max(rd.y, 0.0) * 0.25 + 0.035, rd.z));
      vec3 fc = skyBase(fd);
      fc = mix(fc, uSkyHor * 1.02, 0.35);
      if (lens > 0.5) fc = mix(vec3(lum(fc)), fc, 0.25) * 0.9 + 0.12;
      col = mix(col, fc, f);
    }
  } else {
    // ------------------------------ ink ------------------------------
    vec2 px = 1.0 / uRes;
    float lw = uLens.z;
    vec4 nc = texture(tNormal, vUv);
    vec3 vp = viewPos(vUv, d);
    float zc = -vp.z;
    float eD = 0.0, eN = 0.0, eI = 0.0;
    vec2 offs[4] = vec2[4](vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0));
    float pw = (uPix.y > 0.5 ? uPix.x : uPix.x * zc) * lw;
    vec3 ncn = normalize(nc.xyz + vec3(0.0, 0.0, 1e-5));
    for (int i = 0; i < 4; i++) {
      vec2 uv = vUv + offs[i] * px * lw;
      float di = texture(tDepth, uv).r;
      vec3 qi = viewPos(uv, di);
      vec4 ni = texture(tNormal, uv);
      bool si = di >= 0.999999;
      eD = max(eD, float(si != sky));
      if (!si && !sky) {
        // distance of the neighbour from this pixel's tangent plane, in pixel footprints
        eD = max(eD, smoothstep(2.2, 4.5, abs(dot(qi - vp, ncn)) / pw));
        eN = max(eN, 1.0 - dot(normalize(ni.xyz + vec3(0.0, 0.0, 1e-5)), ncn));
        eI = max(eI, step(0.004, abs(ni.w - nc.w)));
      }
    }
    // heavy profile lines: big jumps in depth, sampled wider
    float eP = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 uv = vUv + offs[i] * px * lw * 2.2;
      float di = texture(tDepth, uv).r;
      float zi = -viewPos(uv, di).z;
      bool si = di >= 0.999999;
      eP = max(eP, (si != sky) ? 1.0 : smoothstep(18.0, 40.0, abs(zi - zc) / pw) * float(!sky));
    }
    float line = max(max(eP, eD * 0.9), max(smoothstep(0.08, 0.3, eN) * 0.8, eI * 0.42 * uLens.w));
    vec3 paper = uPaper;
    float grain = nz(gl_FragCoord.xy * 0.9).r - 0.5 + (nz(gl_FragCoord.xy * 0.11).g - 0.5) * 1.4;
    paper *= 1.0 + grain * 0.035;
    if (sky) {
      col = paper;
    } else {
      vec4 di = texture(tDirect, vUv); vec4 am = texture(tAmbient, vUv);
      float lit = di.a; float tone = am.a;
      float ao = texture(tAO, vUv).r;
      float shade = (1.0 - lit) * 0.55 + (1.0 - ao) * 0.5;
      vec3 c = mix(uShade, paper, sat(tone * (1.0 - shade * 0.75)));
      if (uInkP.x > 0.5) {
        vec2 hp = gl_FragCoord.xy / uInkP.y;
        float h1 = abs(fract((hp.x + hp.y) * 0.5) - 0.5) * 2.0;
        float h2 = abs(fract((hp.x - hp.y) * 0.5) - 0.5) * 2.0;
        float dark = sat(shade * 1.25 + (1.0 - tone) * 0.9);
        float k1 = 1.0 - smoothstep(dark * 0.75 - 0.08, dark * 0.75 + 0.08, h1);
        float k2 = (1.0 - smoothstep((dark - 0.5) * 1.2 - 0.08, (dark - 0.5) * 1.2 + 0.08, h2)) * step(0.5, dark);
        c = mix(paper, uInk, max(k1, k2) * 0.82);
      }
      c = mix(uInk, c, smoothstep(0.03, 0.09, tone));          // cut solids are filled in
      if (uInkP.w > 0.5) {                                     // figure and ground
        bool leaf = abs(tone - 0.82) < 0.012;
        if (nc.w >= 1.0) c = leaf ? mix(paper, uInk, 0.2) : uInk;
        else c = paper * (0.86 + 0.14 * smoothstep(0.7, 0.95, tone));
        line *= (nc.w >= 1.0 && !leaf) ? 0.0 : 0.5;
      }
      col = c;
    }
    col = mix(col, uInk, sat(line));
  }
  o = vec4(col, 1.0);
}
`;

export const RESOLVE_FRAG = /* glsl */`
in vec2 vUv; out vec4 o;
uniform sampler2D tCur;
uniform sampler2D tHist;
uniform float uAlpha;
void main(){
  vec3 c = texture(tCur, vUv).rgb;
  vec3 h = texture(tHist, vUv).rgb;
  o = vec4(mix(h, c, uAlpha), 1.0);
}
`;

export const COPY_FRAG = /* glsl */`
in vec2 vUv; out vec4 o;
uniform sampler2D tSrc;
void main(){ o = texture(tSrc, vUv); }
`;

export const BLOOM_DOWN_FRAG = /* glsl */`
in vec2 vUv; out vec4 o;
uniform sampler2D tSrc;
uniform vec2 uTexel;     // source texel
uniform float uFirst;
void main(){
  vec3 c = texture(tSrc, vUv).rgb * 4.0;
  c += texture(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  c += texture(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  c += texture(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  c /= 8.0;
  if (uFirst > 0.5) { float l = max(c.r, max(c.g, c.b)); c *= 1.0 / (1.0 + l * 0.04); c = min(c, vec3(60.0)); }
  o = vec4(c, 1.0);
}
`;

export const BLOOM_UP_FRAG = /* glsl */`
in vec2 vUv; out vec4 o;
uniform sampler2D tSrc;   // smaller level (already accumulated)
uniform sampler2D tBase;  // this level
uniform vec2 uTexel;      // texel of the smaller level
void main(){
  vec3 c = vec3(0.0);
  c += texture(tSrc, vUv + uTexel * vec2(-1.0, 0.0)).rgb * 2.0;
  c += texture(tSrc, vUv + uTexel * vec2( 1.0, 0.0)).rgb * 2.0;
  c += texture(tSrc, vUv + uTexel * vec2( 0.0,-1.0)).rgb * 2.0;
  c += texture(tSrc, vUv + uTexel * vec2( 0.0, 1.0)).rgb * 2.0;
  c += texture(tSrc, vUv + uTexel * vec2(-1.0,-1.0)).rgb;
  c += texture(tSrc, vUv + uTexel * vec2( 1.0,-1.0)).rgb;
  c += texture(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture(tSrc, vUv + uTexel * vec2( 1.0, 1.0)).rgb;
  c += texture(tSrc, vUv).rgb * 4.0;
  o = vec4(texture(tBase, vUv).rgb + c / 16.0, 1.0);
}
`;

// tone, colour and film
export const DEVELOP_FRAG = COMMON + /* glsl */`
in vec2 vUv; out vec4 o;
uniform sampler2D tHdr;
uniform sampler2D tBloom;
uniform sampler2D tDepth;
uniform sampler2D tOvl;     // premultiplied overlays: people, traffic, rain, wind
uniform vec4 uTone;      // exposure, bloom mix, tone-map on, mono
uniform vec4 uGrade;     // contrast, saturation, warmth, fade
uniform vec4 uGrade2;    // bloom normaliser, spare
uniform vec4 uDof;       // on, focus (view z), range, max radius px
uniform vec4 uProjInfo;  // near, far, ortho, unused
uniform vec2 uRes;
vec3 aces(vec3 x){
  const mat3 m1 = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 m2 = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = m1 * x;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(m2 * (a / b), 0.0, 1.0);
}
float viewZ(vec2 uv){
  float d = texture(tDepth, uv).r;
  float n = uProjInfo.x, f = uProjInfo.y;
  if (uProjInfo.z > 0.5) return n + d * (f - n);
  return (n * f) / (f - d * (f - n));
}
void main(){
  vec3 c;
  if (uDof.x > 0.5) {
    float z = viewZ(vUv);
    float coc = clamp(abs(z - uDof.y) / uDof.z, 0.0, 1.0) * uDof.w;
    vec3 acc = texture(tHdr, vUv).rgb; float wsum = 1.0;
    for (int i = 0; i < 30; i++) {
      float fi = float(i) + 0.5;
      float r = sqrt(fi / 30.0) * coc; float a = fi * 2.39996323;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r / uRes;
      float zi = viewZ(uv);
      float ci = clamp(abs(zi - uDof.y) / uDof.z, 0.0, 1.0) * uDof.w;
      float w = step(r, max(ci, coc * step(z, zi)) + 0.5);
      acc += texture(tHdr, uv).rgb * w; wsum += w;
    }
    c = acc / wsum;
  } else c = texture(tHdr, vUv).rgb;
  vec4 ov = texture(tOvl, vUv);
  c = c * (1.0 - ov.a) + ov.rgb;
  vec3 b = texture(tBloom, vUv).rgb * uGrade2.x;
  c = mix(c, b, uTone.y);
  if (uTone.z > 0.5) {
    c *= uTone.x;
    if (uTone.w > 0.5) { float l = max(dot(c, vec3(0.86, 0.26, -0.12)), 0.0); c = vec3(l); }
    c = aces(c);
    c = pow(c, vec3(1.0 / 2.2));
    float l = lum(c);
    c = mix(vec3(l), c, uGrade.y);
    c = (c - 0.5) * uGrade.x + 0.5;
    c += vec3(0.012, 0.0, -0.014) * uGrade.z * (1.0 - l);
    c = mix(c, c * 0.92 + 0.045, uGrade.w);
  } else {
    c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  }
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export const FINAL_FRAG = COMMON + /* glsl */`
in vec2 vUv; out vec4 o;
uniform sampler2D tLdr;
uniform sampler2D tMask;
uniform vec2 uRes;       // ldr size
uniform vec4 uFilm;      // grain, vignette, time, fxaa on
uniform vec4 uSel;       // outline on, hover on, pulse, spare
uniform vec3 uAccent;
uniform vec4 uCrop;      // letterbox aspect (0 = none), bar darkness
vec3 fxaa(vec2 uv, vec2 px){
  vec3 rgbNW = texture(tLdr, uv + vec2(-1.0, -1.0) * px).rgb;
  vec3 rgbNE = texture(tLdr, uv + vec2( 1.0, -1.0) * px).rgb;
  vec3 rgbSW = texture(tLdr, uv + vec2(-1.0,  1.0) * px).rgb;
  vec3 rgbSE = texture(tLdr, uv + vec2( 1.0,  1.0) * px).rgb;
  vec3 rgbM = texture(tLdr, uv).rgb;
  vec3 lw = vec3(0.299, 0.587, 0.114);
  float lNW = dot(rgbNW, lw), lNE = dot(rgbNE, lw), lSW = dot(rgbSW, lw), lSE = dot(rgbSE, lw), lM = dot(rgbM, lw);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float dirReduce = max((lNW + lNE + lSW + lSE) * (0.25 / 8.0), 1.0 / 128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * px;
  vec3 rgbA = 0.5 * (texture(tLdr, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(tLdr, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture(tLdr, uv + dir * -0.5).rgb + texture(tLdr, uv + dir * 0.5).rgb);
  float lB = dot(rgbB, lw);
  return (lB < lMin || lB > lMax) ? rgbA : rgbB;
}
void main(){
  vec2 px = 1.0 / uRes;
  vec3 c = uFilm.w > 0.5 ? fxaa(vUv, px) : texture(tLdr, vUv).rgb;
  // selection outline
  if (uSel.x > 0.5) {
    float m = texture(tMask, vUv).r; float mx = 0.0; float mh = texture(tMask, vUv).g; float mxh = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853982;
      vec4 s = texture(tMask, vUv + vec2(cos(a), sin(a)) * px * 2.2);
      mx = max(mx, s.r); mxh = max(mxh, s.g);
    }
    c = mix(c, uAccent, (mx - m) * 0.95);
    c = mix(c, vec3(1.0), (mxh - mh) * 0.55 * (1.0 - mx));
  }
  vec2 q = vUv - 0.5;
  c *= 1.0 - uFilm.y * smoothstep(0.25, 0.95, dot(q, q) * 2.0);
  float g = hash12(gl_FragCoord.xy + fract(uFilm.z) * 61.0) - 0.5;
  c += g * uFilm.x * (0.4 + 0.6 * (1.0 - lum(c)));
  if (uCrop.x > 0.01) {
    float asp = uRes.x / uRes.y;
    vec2 hsz = asp > uCrop.x ? vec2(uCrop.x / asp, 1.0) * 0.5 : vec2(0.5, asp / uCrop.x * 0.5);
    float inside = step(abs(q.x), hsz.x) * step(abs(q.y), hsz.y);
    c = mix(c * (1.0 - uCrop.y), c, inside);
  }
  o = vec4(c, 1.0);
}
`;

// mirror pass resolve: light the mirrored G-buffer cheaply into one RGBA target (alpha = coverage)
export const REFL_RESOLVE_FRAG = /* glsl */`
in vec2 vUv; out vec4 o;
uniform sampler2D tDirect;
uniform sampler2D tAmbient;
uniform sampler2D tDepth;
void main(){
  float d = texture(tDepth, vUv).r;
  if (d >= 0.999999) { o = vec4(0.0); return; }
  o = vec4(texture(tDirect, vUv).rgb + texture(tAmbient, vUv).rgb * 0.8, 1.0);
}
`;

// ------------------------------------------------- overlays (drawn after the scene has settled)
// people and traffic: the same instanced primitives, lit simply, plus soft blob shadows
export const WORLD_OVL_FRAG = COMMON + WORLD_FRAG_HEAD + ENV_UNIFORMS + SHADOW + /* glsl */`
out vec4 o;
uniform vec4 uOvl;     // blob shadow strength, exposure of lamps, spare, spare
void main(){
  if (uClipOn > 0.5 && dot(vWorld, uClip.xyz) + uClip.w > 0.0) discard;
  float matId = floor(vMat.x + 0.5);
  if (matId == 11.0) {                                   // a shadow laid on the ground
    vec2 q = (vUnit.xz - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.35, 1.0, length(q))) * uOvl.x * sunShadow(vWorld, vec3(0.0, 1.0, 0.0));
    o = vec4(0.0, 0.0, 0.0, a);
    return;
  }
  vec3 N = normalize(vNrmW);
  vec3 alb = vColor;
  float ndl = dot(N, uSunDir);
  float sh = sunShadow(vWorld + vec3(0.0, 0.5, 0.0), vec3(0.0, 1.0, 0.0));
  vec3 col = alb * (uSunCol * sh * (max(ndl, 0.0) * 0.8 + 0.2) + ambientCube(N));
  if (matId == 6.0) col = vColor * (0.5 + uWeather.z * 6.0);
  vec3 v = vWorld - cameraPosition; float L = length(v);
  float f = 1.0 - exp(-uFog.x * L * exp(-uFog.y * max(vWorld.y, 0.0)));
  col = mix(col, skyBase(normalize(vec3(v.x, 0.03 * L, v.z))), f);
  o = vec4(col, 1.0);
}
`;

// rain: streaks in a box that follows the camera
export const RAIN_VERT = /* glsl */`
in vec3 aSeed;
in float aEnd;
uniform float uTime;
uniform vec3 uBoxC;
uniform vec4 uRain;    // box size, fall speed, streak length, wind slant
uniform vec2 uWindXZ;
out float vA;
void main(){
  vec3 vel = vec3(uWindXZ.x * uRain.w, -uRain.y, uWindXZ.y * uRain.w);
  vec3 p = aSeed * uRain.x + vel * uTime * (0.8 + 0.4 * fract(aSeed.x * 37.0));
  p = mod(p - uBoxC + uRain.x * 0.5, uRain.x) - uRain.x * 0.5 + uBoxC;
  p -= normalize(vel) * uRain.z * aEnd * (0.6 + 0.8 * fract(aSeed.y * 51.0));
  vec4 vp = viewMatrix * vec4(p, 1.0);
  vA = (1.0 - aEnd) * smoothstep(uRain.x * 0.5, uRain.x * 0.2, length(vp.xyz)) * smoothstep(0.5, 3.0, -vp.z);
  gl_Position = projectionMatrix * vp;
}
`;
export const RAIN_FRAG = /* glsl */`
in float vA;
uniform vec3 uTint;
uniform float uK;
out vec4 o;
void main(){ o = vec4(uTint * vA * uK, vA * 0.3 * uK); }
`;
export const SNOW_VERT = /* glsl */`
in vec3 aSeed;
uniform float uTime;
uniform vec3 uBoxC;
uniform vec4 uRain;
uniform vec2 uWindXZ;
uniform float uPx;
out float vA;
void main(){
  vec3 vel = vec3(uWindXZ.x * uRain.w, -uRain.y, uWindXZ.y * uRain.w);
  vec3 p = aSeed * uRain.x + vel * uTime * (0.7 + 0.6 * fract(aSeed.x * 37.0));
  p.x += sin(uTime * 0.9 + aSeed.y * 40.0) * 0.7; p.z += cos(uTime * 0.7 + aSeed.x * 40.0) * 0.7;
  p = mod(p - uBoxC + uRain.x * 0.5, uRain.x) - uRain.x * 0.5 + uBoxC;
  vec4 vp = viewMatrix * vec4(p, 1.0);
  vA = smoothstep(uRain.x * 0.5, uRain.x * 0.2, length(vp.xyz)) * smoothstep(0.5, 3.0, -vp.z);
  gl_Position = projectionMatrix * vp;
  gl_PointSize = clamp(uPx * (0.05 + 0.05 * fract(aSeed.z * 91.0)) / max(-vp.z, 0.5), 1.0, 7.0);
}
`;
export const SNOW_FRAG = /* glsl */`
in float vA;
uniform vec3 uTint;
uniform float uK;
out vec4 o;
void main(){ vec2 q = gl_PointCoord - 0.5; float a = vA * uK * (1.0 - smoothstep(0.2, 0.5, length(q))); o = vec4(uTint * a, a * 0.9); }
`;
// wind traces: positions and colours come from the CPU
export const TRACE_VERT = /* glsl */`
in vec4 aCol;
out vec4 vCol;
void main(){ vCol = aCol; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }
`;
export const TRACE_FRAG = /* glsl */`
in vec4 vCol;
out vec4 o;
void main(){ o = vec4(vCol.rgb * vCol.a * 1.6, vCol.a * 0.45); }
`;
// accumulate sun hours on the ground plane from a shadow map
export const SUNHOURS_FRAG = /* glsl */`
in vec2 vUv; out vec4 o;
uniform highp sampler2DShadow uSh;
uniform mat4 uShM;
uniform vec3 uDir;
uniform vec2 uP;       // site half-size, hours this sample stands for
void main(){
  vec3 wp = vec3((vUv.x * 2.0 - 1.0) * uP.x, 0.35, (vUv.y * 2.0 - 1.0) * uP.x) + uDir * 0.9;
  vec3 c = (uShM * vec4(wp, 1.0)).xyz;
  float lit = 1.0;
  if (c.x > 0.0 && c.x < 1.0 && c.y > 0.0 && c.y < 1.0 && c.z < 1.0) lit = textureLod(uSh, c, 0.0);
  o = vec4(lit * uP.y, 0.0, 0.0, 0.0);
}
`;