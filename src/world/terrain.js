import * as THREE from 'three';
import { mulberry32, createSimplex, fbm, ridged, clamp, lerp, smoothstep } from '../core/noise.js';

export const WORLD_SIZE = 1400;
export const RES = 340;
export const SEA_LEVEL = 0;

export const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, SNOW: 5, SWAMP: 6, MOUNTAIN: 7 };
export const BIOME_NAMES = ['Océan', 'Plage', 'Plaines', 'Forêt', 'Désert', 'Toundra', 'Marais', 'Montagnes'];

const C = (hex) => new THREE.Color(hex);
const COLORS = {
  beach: C(0xe6d39c),
  plains: C(0x6fa743),
  plains2: C(0x9bb84e),
  forest: C(0x2e6a2b),
  forest2: C(0x3f7d2c),
  desert: C(0xe3c27f),
  desert2: C(0xd09a5c),
  snow: C(0xf1f4fa),
  swamp: C(0x46562b),
  swamp2: C(0x5a6233),
  rock: C(0x7b7268),
  rock2: C(0x5d5853),
  seabed: C(0xc9b98b),
  deep: C(0x4c6363),
};

export class Terrain {
  constructor(seed) {
    this.seed = seed;
    const rand = mulberry32(seed);
    this.n = Array.from({ length: 8 }, () => createSimplex(rand));
    const N = RES + 1;
    this.N = N;
    this.cell = WORLD_SIZE / RES;
    this.heights = new Float32Array(N * N);
    this.temp = new Float32Array(N * N);
    this.moist = new Float32Array(N * N);
    this.biomes = new Uint8Array(N * N);
    this.colors = new Float32Array(N * N * 3);
    this._generate();
    this.mesh = this._buildMesh();
    this.depthTexture = this._buildDepthTexture();
    this.mapCanvas = this._buildMapCanvas();
  }

  // ─── Génération ────────────────────────────────────────────
  _rawHeight(x, z) {
    const [n0, n1, n2, n3] = this.n;
    const half = WORLD_SIZE / 2;
    // Distorsion de domaine pour des côtes organiques.
    const wx = x + fbm(n1, x * 0.0021, z * 0.0021, 3) * 90;
    const wz = z + fbm(n1, x * 0.0021 + 40, z * 0.0021 - 40, 3) * 90;
    const d = Math.hypot(wx / half, wz / half);
    const cont = fbm(n0, wx * 0.0019, wz * 0.0019, 5);
    const mask = 1 - smoothstep(0.42, 0.98, d + cont * 0.18);
    const e = (cont * 0.5 + 0.55) * mask * 1.25 - 0.3;

    if (e < 0) return e * 55;

    const hills = fbm(n2, x * 0.009, z * 0.009, 4) * 3.5;
    const mountainMask = smoothstep(0.05, 0.45, fbm(n3, x * 0.0013 + 11, z * 0.0013 - 7, 3)) * smoothstep(0.08, 0.35, e);
    const peaks = Math.pow(ridged(n2, x * 0.0045 + 300, z * 0.0045, 5), 1.6) * 110 * mountainMask;
    const shore = smoothstep(0, 0.06, e);
    return e * 22 + hills * shore + peaks;
  }

  _generate() {
    const { N, heights, temp, moist, biomes, colors } = this;
    const half = WORLD_SIZE / 2;
    const n4 = this.n[4], n5 = this.n[5], n6 = this.n[6];

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = i * this.cell - half;
        const z = j * this.cell - half;
        heights[j * N + i] = this._rawHeight(x, z);
      }
    }

    const col = new THREE.Color();
    const tmp = new THREE.Color();
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const x = i * this.cell - half;
        const z = j * this.cell - half;
        const h = heights[k];

        const t = clamp(0.52 + fbm(n4, x * 0.0011, z * 0.0011, 3) * 0.65 + (z / WORLD_SIZE) * 0.35 - Math.max(h - 12, 0) / 85, 0, 1);
        const m = clamp(0.5 + fbm(n5, x * 0.0016 + 90, z * 0.0016, 4) * 0.75, 0, 1);
        temp[k] = t;
        moist[k] = m;

        const slope = this._slopeIdx(i, j);
        const jitter = fbm(n6, x * 0.05, z * 0.05, 2);

        if (h < SEA_LEVEL) {
          biomes[k] = BIOME.OCEAN;
          col.copy(COLORS.seabed).lerp(COLORS.deep, smoothstep(0, -18, h));
        } else {
          // Poids doux des biomes : les zones se fondent les unes dans les autres.
          const wBeach = 1 - smoothstep(1.2, 3.0, h);
          const wSnow = 1 - smoothstep(0.16, 0.3, t);
          const wDesert = smoothstep(0.58, 0.72, t) * (1 - smoothstep(0.3, 0.46, m));
          const wSwamp = smoothstep(0.62, 0.76, m) * smoothstep(0.38, 0.5, t) * (1 - smoothstep(5, 12, h));
          const wForest = smoothstep(0.46, 0.6, m) * (1 - wSwamp);
          const wPlains = 0.35;
          const w = [wBeach * 1.6, wPlains, wForest, wDesert * 1.3, wSnow * 1.4, wSwamp];
          let sum = 0, best = 0, bestW = -1;
          for (let b = 0; b < w.length; b++) {
            sum += w[b];
            if (w[b] > bestW) { bestW = w[b]; best = b; }
          }
          col.setRGB(0, 0, 0);
          const add = (c, wt) => { tmp.copy(c).multiplyScalar(wt / sum); col.add(tmp); };
          add(COLORS.beach, w[0]);
          add(tmp.copy(COLORS.plains).lerp(COLORS.plains2, jitter * 0.5 + 0.5).clone(), w[1]);
          add(tmp.copy(COLORS.forest).lerp(COLORS.forest2, jitter * 0.5 + 0.5).clone(), w[2]);
          add(tmp.copy(COLORS.desert).lerp(COLORS.desert2, smoothstep(-0.3, 0.6, jitter)).clone(), w[3]);
          add(COLORS.snow, w[4]);
          add(tmp.copy(COLORS.swamp).lerp(COLORS.swamp2, jitter * 0.5 + 0.5).clone(), w[5]);

          let biome = [BIOME.BEACH, BIOME.PLAINS, BIOME.FOREST, BIOME.DESERT, BIOME.SNOW, BIOME.SWAMP][best];

          // Roche sur les pentes et en altitude, neige sur les sommets.
          const rockW = Math.max(smoothstep(0.75, 1.3, slope), smoothstep(38, 55, h));
          if (rockW > 0) col.lerp(tmp.copy(COLORS.rock).lerp(COLORS.rock2, jitter * 0.5 + 0.5), rockW);
          const peakSnow = smoothstep(62, 75, h + jitter * 6) * (1 - smoothstep(1.2, 1.8, slope));
          if (peakSnow > 0) col.lerp(COLORS.snow, peakSnow);
          if (rockW > 0.6 || h > 45) biome = BIOME.MOUNTAIN;
          biomes[k] = biome;
        }
        const v = 1 + jitter * 0.07;
        colors[k * 3] = col.r * v;
        colors[k * 3 + 1] = col.g * v;
        colors[k * 3 + 2] = col.b * v;
      }
    }
  }

  _slopeIdx(i, j) {
    const { N, heights } = this;
    const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, N - 1);
    const j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, N - 1);
    const dx = (heights[j * N + i1] - heights[j * N + i0]) / ((i1 - i0) * this.cell);
    const dz = (heights[j1 * N + i] - heights[j0 * N + i]) / ((j1 - j0) * this.cell);
    return Math.hypot(dx, dz);
  }

  _buildMesh() {
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, RES, RES);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setY(k, this.heights[k]);
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  // Texture de profondeur pour le shader d'eau (écume, transparence).
  _buildDepthTexture() {
    const { N, heights } = this;
    const data = new Uint8Array(N * N * 4);
    for (let k = 0; k < N * N; k++) {
      const v = clamp((heights[k] + 30) / 60, 0, 1) * 255;
      data[k * 4] = v; data[k * 4 + 1] = v; data[k * 4 + 2] = v; data[k * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  _buildMapCanvas() {
    const S = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(S, S);
    const half = WORLD_SIZE / 2;
    const water = new THREE.Color(0x2a6f9e);
    const deep = new THREE.Color(0x173f63);
    const c = new THREE.Color();
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const wx = (x / (S - 1)) * WORLD_SIZE - half;
        const wz = (y / (S - 1)) * WORLD_SIZE - half;
        const h = this.heightAt(wx, wz);
        if (h < SEA_LEVEL) {
          c.copy(water).lerp(deep, smoothstep(0, -20, h));
        } else {
          const gi = clamp(Math.round((wx + half) / this.cell), 0, RES);
          const gj = clamp(Math.round((wz + half) / this.cell), 0, RES);
          const k = gj * this.N + gi;
          c.setRGB(this.colors[k * 3], this.colors[k * 3 + 1], this.colors[k * 3 + 2]);
          // Ombrage simple venant du nord-ouest.
          const shade = clamp(1 + (h - this.heightAt(wx - 6, wz - 6)) * 0.06, 0.6, 1.3);
          c.multiplyScalar(shade);
        }
        const o = (y * S + x) * 4;
        const srgb = c.clone().convertLinearToSRGB();
        img.data[o] = clamp(srgb.r * 255, 0, 255);
        img.data[o + 1] = clamp(srgb.g * 255, 0, 255);
        img.data[o + 2] = clamp(srgb.b * 255, 0, 255);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  // ─── Requêtes ──────────────────────────────────────────────
  heightAt(x, z) {
    const half = WORLD_SIZE / 2;
    const gx = (x + half) / this.cell;
    const gz = (z + half) / this.cell;
    if (gx < 0 || gz < 0 || gx > RES || gz > RES) return -40;
    const i = Math.min(Math.floor(gx), RES - 1);
    const j = Math.min(Math.floor(gz), RES - 1);
    const fx = gx - i, fz = gz - j;
    const N = this.N, H = this.heights;
    // Même triangulation que PlaneGeometry : diagonale (i,j+1)-(i+1,j).
    const a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
    if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.0;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  _index(x, z) {
    const half = WORLD_SIZE / 2;
    const gi = clamp(Math.round((x + half) / this.cell), 0, RES);
    const gj = clamp(Math.round((z + half) / this.cell), 0, RES);
    return gj * this.N + gi;
  }
  biomeAt(x, z) { return this.biomes[this._index(x, z)]; }
  temperatureAt(x, z) { return this.temp[this._index(x, z)]; }
  moistureAt(x, z) { return this.moist[this._index(x, z)]; }
  isInside(x, z, margin = 0) {
    const half = WORLD_SIZE / 2 - margin;
    return Math.abs(x) < half && Math.abs(z) < half;
  }

  findSpawn() {
    for (let r = 0; r < WORLD_SIZE / 2; r += 6) {
      for (let a = 0; a < Math.PI * 2; a += 0.35) {
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const h = this.heightAt(x, z);
        const b = this.biomeAt(x, z);
        if (h > 3 && h < 18 && (b === BIOME.PLAINS || b === BIOME.FOREST || b === BIOME.BEACH)) {
          // Zone plate sur ~10 m pour poser le portail.
          let flat = true;
          for (let k = 0; k < 8 && flat; k++) {
            const aa = (k / 8) * Math.PI * 2;
            if (Math.abs(this.heightAt(x + Math.cos(aa) * 10, z + Math.sin(aa) * 10) - h) > 1.6) flat = false;
          }
          if (flat && this.normalAt(x, z).y > 0.95) return new THREE.Vector3(x, h, z);
        }
      }
    }
    return new THREE.Vector3(0, Math.max(this.heightAt(0, 0), 0) + 2, 0);
  }

  // Points répartis sur la terre ferme (reliques, etc.).
  scatterLand(count, minDist, rand, avoid = []) {
    const pts = [];
    let tries = 0;
    const half = WORLD_SIZE / 2 - 60;
    while (pts.length < count && tries < 8000) {
      tries++;
      const x = (rand() * 2 - 1) * half;
      const z = (rand() * 2 - 1) * half;
      const h = this.heightAt(x, z);
      if (h < 2 || h > 70) continue;
      if (this.normalAt(x, z).y < 0.8) continue;
      const p = new THREE.Vector3(x, h, z);
      const md = tries > 5000 ? minDist * 0.5 : minDist;
      if (pts.some((q) => q.distanceTo(p) < md)) continue;
      if (avoid.some((q) => q.distanceTo(p) < md * 0.6)) continue;
      pts.push(p);
    }
    return pts;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.depthTexture.dispose();
  }
}

export { lerp };
