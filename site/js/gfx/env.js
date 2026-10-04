// Sun, sky, weather. Everything the shaders need about the air above the city.
import * as THREE from 'three';

const D2R = Math.PI / 180;

// keyed on solar elevation (deg): zenith, horizon, glow, sun radiance
const KEYS = [
  [-18, [0.0030, 0.0055, 0.015], [0.006, 0.010, 0.024], [0.00, 0.00, 0.00], [0.0, 0.0, 0.0]],
  [-8,  [0.012, 0.024, 0.075],  [0.060, 0.058, 0.095], [0.16, 0.06, 0.03], [0.0, 0.0, 0.0]],
  [-2,  [0.050, 0.095, 0.270],  [0.560, 0.330, 0.230], [1.10, 0.42, 0.14], [0.12, 0.035, 0.008]],
  [2,   [0.085, 0.170, 0.430],  [0.820, 0.540, 0.360], [1.60, 0.72, 0.26], [1.15, 0.50, 0.17]],
  [9,   [0.115, 0.250, 0.580],  [0.800, 0.700, 0.600], [1.10, 0.72, 0.44], [2.35, 1.55, 0.86]],
  [24,  [0.135, 0.290, 0.640],  [0.660, 0.740, 0.830], [0.50, 0.45, 0.38], [3.7, 3.15, 2.45]],
  [60,  [0.135, 0.275, 0.600],  [0.600, 0.700, 0.820], [0.34, 0.32, 0.30], [4.2, 3.9, 3.4]],
];

export const WEATHER = {
  clear:    { label: 'Clear',    cover: 0.10, sun: 1.00, grey: 0.00, amb: 1.00, fog: 0.00020, wet: 0, snow: 0, wind: 0.25, part: 0 },
  fair:     { label: 'Fair',     cover: 0.46, sun: 0.95, grey: 0.08, amb: 1.00, fog: 0.00026, wet: 0, snow: 0, wind: 0.40, part: 0 },
  overcast: { label: 'Overcast', cover: 1.00, sun: 0.05, grey: 0.92, amb: 1.55, fog: 0.00040, wet: 0, snow: 0, wind: 0.45, part: 0 },
  fog:      { label: 'Fog',      cover: 1.00, sun: 0.07, grey: 1.00, amb: 1.35, fog: 0.0044,  wet: 0.25, snow: 0, wind: 0.08, part: 0 },
  rain:     { label: 'Rain',     cover: 1.00, sun: 0.03, grey: 0.97, amb: 1.05, fog: 0.0012,  wet: 1, snow: 0, wind: 0.70, part: 1 },
  snow:     { label: 'Snow',     cover: 1.00, sun: 0.06, grey: 1.00, amb: 1.70, fog: 0.0020,  wet: 0, snow: 1, wind: 0.30, part: 2 },
};

export const PLACES = [
  { name: 'Marseille', lat: 43.3 }, { name: 'London', lat: 51.5 }, { name: 'Chandigarh', lat: 30.7 },
  { name: 'Brasília', lat: -15.8 }, { name: 'Tbilisi', lat: 41.7 }, { name: 'Tokyo', lat: 35.7 },
  { name: 'Boston', lat: 42.4 }, { name: 'Belgrade', lat: 44.8 }, { name: 'Montréal', lat: 45.5 },
  { name: 'São Paulo', lat: -23.5 }, { name: 'Dhaka', lat: 23.8 }, { name: 'Moscow', lat: 55.8 },
];

function lerp3(a, b, t, out) { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; }
function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// Solar position. Returns direction TO the sun; +X east, -Z north, +Y up.
export function sunDirection(latDeg, day, hour, out = new THREE.Vector3()) {
  const lat = latDeg * D2R;
  const decl = 23.44 * D2R * Math.sin(2 * Math.PI * (284 + day) / 365);
  const H = (hour - 12) * 15 * D2R;
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const az = Math.atan2(-Math.cos(decl) * Math.sin(H), Math.cos(lat) * Math.sin(decl) - Math.sin(lat) * Math.cos(decl) * Math.cos(H));
  const ce = Math.cos(el);
  out.set(ce * Math.sin(az), Math.sin(el), -ce * Math.cos(az));
  return out;
}

export function sunTimes(latDeg, day) {
  const lat = latDeg * D2R;
  const decl = 23.44 * D2R * Math.sin(2 * Math.PI * (284 + day) / 365);
  const c = -Math.tan(lat) * Math.tan(decl);
  if (c <= -1) return { rise: 0, set: 24 };
  if (c >= 1) return { rise: 12, set: 12 };
  const h = Math.acos(c) / D2R / 15;
  return { rise: 12 - h, set: 12 + h };
}

export class Env {
  constructor(U) {
    this.U = U;
    this.lat = 43.3; this.day = 172; this.hour = 17.6;
    this.weather = 'fair';
    this.w = { ...WEATHER.fair };           // smoothed weather state
    this.wetness = 0; this.snowCover = 0;
    this.sun = new THREE.Vector3(); this.key = new THREE.Vector3();
    this.el = 0; this.night = 0;
    this.cloudOff = new THREE.Vector2(3.1, 7.7);
    this.windDir = new THREE.Vector2(0.8, 0.6);
    this.windAngle = 0.64;
    this.exposure = 1; this.litFrac = 0;
    this.fogScale = 1;
    this.studio = 0;                        // 1 = neutral studio light for the card-model lens
    this._t = [0, 0, 0]; this._u = [0, 0, 0]; this._v = [0, 0, 0]; this._w = [0, 0, 0];
  }
  setWeather(name, instant = false) {
    if (!WEATHER[name]) return;
    this.weather = name;
    if (instant) { this.w = { ...WEATHER[name] }; this.wetness = WEATHER[name].wet; this.snowCover = WEATHER[name].snow; }
  }
  get season() { // 0 spring equinox .. 0.25 summer .. 0.5 autumn .. 0.75 winter, flipped south of the equator
    let s = ((this.day - 80 + 365) % 365) / 365;
    if (this.lat < 0) s = (s + 0.5) % 1;
    return s;
  }
  update(dt, time) {
    const U = this.U, tgt = WEATHER[this.weather], w = this.w;
    const k = 1 - Math.exp(-dt * 0.9);
    for (const key of ['cover', 'sun', 'grey', 'amb', 'fog', 'wind']) w[key] += (tgt[key] - w[key]) * k;
    w.part = tgt.part;
    const kw = 1 - Math.exp(-dt * (tgt.wet > this.wetness ? 0.35 : 0.06));
    this.wetness += (tgt.wet - this.wetness) * kw;
    const ks = 1 - Math.exp(-dt * (tgt.snow > this.snowCover ? 0.16 : 0.05));
    this.snowCover += (tgt.snow - this.snowCover) * ks;

    sunDirection(this.lat, this.day, this.hour, this.sun);
    const el = Math.asin(this.sun.y) / D2R;
    this.el = el;
    let i = 0;
    while (i < KEYS.length - 2 && el > KEYS[i + 1][0]) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = Math.min(1, Math.max(0, (el - a[0]) / (b[0] - a[0])));
    const zen = lerp3(a[1], b[1], t, this._t), hor = lerp3(a[2], b[2], t, this._u), glow = lerp3(a[3], b[3], t, this._v), sunC = lerp3(a[4], b[4], t, this._w);
    const night = 1 - smooth(-9, -1, el);
    this.night = night;
    // overcast pulls the sky to a luminous grey lid
    const dayL = 0.02 + 0.98 * smooth(-8, 12, el);
    const g = w.grey;
    const greyZ = [0.40 * dayL, 0.43 * dayL, 0.47 * dayL], greyH = [0.60 * dayL, 0.615 * dayL, 0.63 * dayL];
    lerp3(zen, greyZ, g, zen); lerp3(hor, greyH, g, hor);
    glow[0] *= 1 - g * 0.93; glow[1] *= 1 - g * 0.93; glow[2] *= 1 - g * 0.93;
    // key light: sun by day, moon by night
    const moon = night;
    const sunK = w.sun;
    let kc = [sunC[0] * sunK, sunC[1] * sunK, sunC[2] * sunK];
    if (el < -1.5) {
      // moon rides opposite the sun, never very high
      this.key.set(-this.sun.x, 0, -this.sun.z);
      if (this.key.lengthSq() < 1e-6) this.key.set(0.5, 0, 0.5);
      this.key.normalize().multiplyScalar(0.78); this.key.y = 0.62; this.key.normalize();
      const m = 0.085 * moon * (1 - 0.6 * w.cover);
      kc = [0.55 * m, 0.72 * m, 1.0 * m];
    } else {
      this.key.copy(this.sun);
      if (this.key.y < 0.02) { this.key.y = 0.02; this.key.normalize(); }
    }
    if (this.studio > 0.5) {
      zen[0] = 0.55; zen[1] = 0.57; zen[2] = 0.60; hor[0] = 0.78; hor[1] = 0.78; hor[2] = 0.78;
      glow[0] = glow[1] = glow[2] = 0;
      const l = Math.max(0.6, (kc[0] + kc[1] + kc[2]) / 3);
      kc = [l * 1.02, l, l * 0.97];
    }
    U.uSunDir.value.copy(this.key);
    U.uSkyDir.value.copy(this.sun);
    U.uSunCol.value.set(kc[0], kc[1], kc[2]);
    U.uSkyZen.value.set(zen[0], zen[1], zen[2]);
    U.uSkyHor.value.set(hor[0], hor[1], hor[2]);
    U.uSkyGlow.value.set(glow[0], glow[1], glow[2]);
    // ambient cube
    const aI = w.amb * (this.studio > 0.5 ? 0.9 : 1.0);
    const up = [(zen[0] * 0.72 + hor[0] * 0.38) * aI, (zen[1] * 0.72 + hor[1] * 0.38) * aI, (zen[2] * 0.72 + hor[2] * 0.38) * aI];
    const sideA = [(zen[0] * 0.4 + hor[0] * 0.6) * aI * 0.52, (zen[1] * 0.4 + hor[1] * 0.6) * aI * 0.52, (zen[2] * 0.4 + hor[2] * 0.6) * aI * 0.52];
    const sideS = [sideA[0] * 1.12 + glow[0] * 0.10, sideA[1] * 1.12 + glow[1] * 0.10, sideA[2] * 1.12 + glow[2] * 0.10];
    const sinE = Math.max(0, this.key.y);
    const gAlb = this.snowCover > 0.3 ? 0.6 : 0.26;
    const sE = sinE * 0.6 + 0.12 * Math.min(1, sinE * 8);        // low sun still lights the ground it reaches
    const dn = [gAlb * (kc[0] * sE + up[0] * 0.8), gAlb * (kc[1] * sE * 0.95 + up[1] * 0.8), gAlb * (kc[2] * sE * 0.85 + up[2] * 0.8)];
    const az = Math.atan2(this.sun.x, this.sun.z);
    const sx = Math.sin(az), sz = Math.cos(az);
    const amb = U.uAmb.value;
    const side = (dx, dz, v) => { const m = (dx * sx + dz * sz) * 0.5 + 0.5; v.set(sideA[0] + (sideS[0] - sideA[0]) * m, sideA[1] + (sideS[1] - sideA[1]) * m, sideA[2] + (sideS[2] - sideA[2]) * m); };
    side(1, 0, amb[0]); side(-1, 0, amb[1]); amb[2].set(up[0], up[1], up[2]); amb[3].set(dn[0], dn[1], dn[2]); side(0, 1, amb[4]); side(0, -1, amb[5]);
    // far ground tone under the horizon line
    U.uGroundFar.value.set(hor[0] * 0.42 + 0.004, hor[1] * 0.44 + 0.005, hor[2] * 0.42 + 0.006);
    // clouds
    const litK = 0.55 + 0.45 * (1 - g);
    U.uCloudLit.value.set(
      Math.min(1.6, hor[0] * 0.55 + kc[0] * 0.24 * litK + up[0] * 0.5),
      Math.min(1.6, hor[1] * 0.55 + kc[1] * 0.24 * litK + up[1] * 0.5),
      Math.min(1.6, hor[2] * 0.55 + kc[2] * 0.24 * litK + up[2] * 0.5));
    U.uCloudDark.value.set(zen[0] * 0.45 + hor[0] * 0.22, zen[1] * 0.45 + hor[1] * 0.22, zen[2] * 0.47 + hor[2] * 0.23);
    const discK = el > -1.5 ? (22 * (1 - g)) : 0;
    U.uSunDisc.value.set(sunC[0] * discK + 0.0, sunC[1] * discK, sunC[2] * discK);
    this.windDir.set(Math.cos(this.windAngle), Math.sin(this.windAngle));
    this.cloudOff.x += this.windDir.x * dt * 0.004 * (0.4 + w.wind);
    this.cloudOff.y += this.windDir.y * dt * 0.004 * (0.4 + w.wind);
    U.uCloud.value.set(w.cover, this.cloudOff.x, this.cloudOff.y, this.studio > 0.5 ? 0 : Math.max(0.25, 1 - w.fog * 170));
    U.uWeather.value.set(this.wetness, this.snowCover, night, this.litFrac);
    U.uFog.value.set(w.fog * this.fogScale * (this.studio > 0.5 ? 0.3 : 1), 0.0045, 0, 0);
    U.uWind.value.set(this.windDir.x, this.windDir.y, w.wind, time * 0.3);
    const y = this.season;
    const turn = smooth(0.50, 0.60, y) * (1 - smooth(0.68, 0.76, y));
    const bare = y > 0.5 ? smooth(0.66, 0.76, y) : 1 - smooth(0.0, 0.1, y);
    const dry = smooth(0.12, 0.3, y) * (1 - smooth(0.6, 0.75, y));
    U.uSeason.value.set(turn, bare, dry, y);
    // exposure follows the light level
    const lumK = Math.max(kc[0], kc[1], kc[2]) * Math.max(0.15, this.key.y) + (up[0] + up[1] + up[2]) / 3 * 1.2;
    const targetExp = Math.min(7.5, Math.max(0.5, 1.0 / Math.pow(Math.max(lumK, 0.002), 0.66)));
    this.exposure += (targetExp - this.exposure) * (1 - Math.exp(-dt * 2.5));
  }
}
