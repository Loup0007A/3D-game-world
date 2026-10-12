import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, createSimplex, fbm } from '../core/noise.js';
import { BIOME, WORLD_SIZE, SEA_LEVEL } from './terrain.js';

// ─── Outils géométrie ──────────────────────────────────────────
function prep(geo, color, jitter = 0, rand = Math.random) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  if (jitter) {
    // Déformation cohérente : mêmes sommets -> même décalage.
    const cache = new Map();
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      let o = cache.get(key);
      if (!o) { o = [(rand() - 0.5) * jitter, (rand() - 0.5) * jitter, (rand() - 0.5) * jitter]; cache.set(key, o); }
      pos.setXYZ(i, pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]);
    }
  }
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    if (typeof color === 'function') color(pos.getX(i), pos.getY(i), pos.getZ(i), c);
    else c.set(color);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function buildModels(rand) {
  const BARK = 0x5b3b1f, BARK2 = 0x3e2a17;
  const models = {};

  // Chêne
  {
    const parts = [prep(new THREE.CylinderGeometry(0.22, 0.38, 3.2, 7).translate(0, 1.6, 0), BARK)];
    const blobs = [[0, 4.2, 0, 2.2], [1.1, 3.7, 0.4, 1.6], [-1.0, 3.8, -0.5, 1.7], [0.2, 5.2, -0.3, 1.5], [-0.3, 3.9, 1.1, 1.4]];
    for (const [x, y, z, r] of blobs) parts.push(prep(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), 0x3d7a2a, 0.35, rand));
    models.oak = { geo: mergeGeometries(parts), sway: 0.006, swayStart: 2.5 };
  }
  // Sapin
  {
    const parts = [prep(new THREE.CylinderGeometry(0.16, 0.28, 2.2, 6).translate(0, 1.1, 0), BARK2)];
    const layers = [[2.3, 3.0, 3.0], [1.8, 2.6, 4.6], [1.25, 2.2, 6.0], [0.7, 1.6, 7.2]];
    for (const [r, h, y] of layers) parts.push(prep(new THREE.ConeGeometry(r, h, 8).translate(0, y, 0), 0x1f5a31, 0.12, rand));
    models.pine = { geo: mergeGeometries(parts), sway: 0.004, swayStart: 2 };
  }
  // Sapin enneigé
  {
    const parts = [prep(new THREE.CylinderGeometry(0.16, 0.28, 2.2, 6).translate(0, 1.1, 0), BARK2)];
    const layers = [[2.1, 2.8, 2.9], [1.6, 2.4, 4.4], [1.1, 2.0, 5.7], [0.6, 1.4, 6.8]];
    for (const [r, h, y] of layers) {
      const base = y - h / 2;
      parts.push(prep(new THREE.ConeGeometry(r, h, 8).translate(0, y, 0), (x, py, z, c) => {
        const t = (py - base) / h;
        c.set(t > 0.45 ? 0xf3f6fb : 0x234f3a);
      }, 0.1, rand));
    }
    models.snowpine = { geo: mergeGeometries(parts), sway: 0.003, swayStart: 2 };
  }
  // Palmier
  {
    const parts = [];
    let x = 0, y = 0;
    for (let k = 0; k < 6; k++) {
      const seg = new THREE.CylinderGeometry(0.17 - k * 0.012, 0.22 - k * 0.012, 1.05, 6);
      seg.rotateZ(-0.06 * k);
      seg.translate(x, y + 0.5, 0);
      parts.push(prep(seg, k % 2 ? 0x8a6a3a : 0x735428));
      x += 0.07 * k;
      y += 1.0;
    }
    for (let k = 0; k < 8; k++) {
      const leaf = new THREE.BoxGeometry(0.5, 0.06, 3.2, 1, 1, 4);
      const p = leaf.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const zz = p.getZ(i) + 1.6;
        p.setY(i, p.getY(i) - zz * zz * 0.09);
        p.setX(i, p.getX(i) * (1 - zz / 4));
      }
      leaf.translate(0, 0, 1.6);
      leaf.rotateY((k / 8) * Math.PI * 2 + rand() * 0.3);
      leaf.translate(x, y + 0.1, 0);
      parts.push(prep(leaf, 0x3f8a2e));
    }
    for (let k = 0; k < 3; k++) {
      parts.push(prep(new THREE.SphereGeometry(0.18, 6, 5).translate(x + Math.cos(k * 2.1) * 0.25, y - 0.15, Math.sin(k * 2.1) * 0.25), 0x4a3418));
    }
    models.palm = { geo: mergeGeometries(parts), sway: 0.004, swayStart: 3 };
  }
  // Cactus
  {
    const G = 0x4f8a3c;
    const parts = [prep(new THREE.CylinderGeometry(0.38, 0.42, 4.2, 8).translate(0, 2.1, 0), G)];
    parts.push(prep(new THREE.SphereGeometry(0.38, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 4.2, 0), G));
    for (const side of [-1, 1]) {
      const y0 = side > 0 ? 1.8 : 2.4;
      parts.push(prep(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 7).rotateZ(Math.PI / 2).translate(side * 0.75, y0, 0), G));
      parts.push(prep(new THREE.CylinderGeometry(0.22, 0.24, 1.5, 7).translate(side * 1.15, y0 + 0.65, 0), G));
      parts.push(prep(new THREE.SphereGeometry(0.22, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(side * 1.15, y0 + 1.4, 0), G));
    }
    parts.push(prep(new THREE.IcosahedronGeometry(0.16, 0).translate(0.1, 4.55, 0), 0xf0507a));
    models.cactus = { geo: mergeGeometries(parts), sway: 0, swayStart: 99 };
  }
  // Saule de marais
  {
    const parts = [prep(new THREE.CylinderGeometry(0.28, 0.55, 3.0, 7).translate(0, 1.5, 0), 0x3b3322)];
    parts.push(prep(new THREE.SphereGeometry(2.6, 9, 6).scale(1, 0.55, 1).translate(0, 3.6, 0), 0x55692c, 0.4, rand));
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const r = 1.6 + rand() * 0.8;
      const len = 1.8 + rand() * 1.4;
      parts.push(prep(new THREE.CylinderGeometry(0.08, 0.03, len, 4).translate(Math.cos(a) * r, 3.4 - len / 2, Math.sin(a) * r), 0x6b7a35));
    }
    models.willow = { geo: mergeGeometries(parts), sway: 0.01, swayStart: 1 };
  }
  // Buisson
  {
    const parts = [];
    for (let k = 0; k < 4; k++) parts.push(prep(new THREE.IcosahedronGeometry(0.7 + rand() * 0.4, 1).translate((rand() - 0.5) * 1.2, 0.5 + rand() * 0.3, (rand() - 0.5) * 1.2), 0x3f7a2c, 0.2, rand));
    models.bush = { geo: mergeGeometries(parts), sway: 0.02, swayStart: 0.2 };
  }
  // Rocher
  {
    const g = prep(new THREE.DodecahedronGeometry(1.2, 1).scale(1.3, 0.8, 1).translate(0, 0.4, 0), (x, y, z, c) => c.set(y > 0.9 ? 0x8d857c : 0x6f6861), 0.5, rand);
    models.rock = { geo: g, sway: 0, swayStart: 99 };
  }
  // Herbe
  {
    // Brins = simples triangles, normales vers le haut (éclairage doux).
    const pos = [], colors = [], normals = [];
    const lo = new THREE.Color(0x2f5d1f), hi = new THREE.Color(0xa6cf5e);
    for (let k = 0; k < 9; k++) {
      const a = rand() * Math.PI;
      const w = 0.06, hgt = 0.35 + rand() * 0.35;
      const cx = (rand() - 0.5) * 0.7, cz = (rand() - 0.5) * 0.7;
      const dx = Math.cos(a) * w, dz = Math.sin(a) * w;
      const lean = (rand() - 0.5) * 0.4;
      // Deux faces (ordres opposés) : pas besoin de DoubleSide, normales toujours vers le haut.
      pos.push(cx - dx, 0, cz - dz, cx + dx, 0, cz + dz, cx + lean, hgt, cz + lean * 0.5);
      pos.push(cx + dx, 0, cz + dz, cx - dx, 0, cz - dz, cx + lean, hgt, cz + lean * 0.5);
      for (let v = 0; v < 6; v++) normals.push(0, 1, 0);
      colors.push(lo.r, lo.g, lo.b, lo.r, lo.g, lo.b, hi.r, hi.g, hi.b);
      colors.push(lo.r, lo.g, lo.b, lo.r, lo.g, lo.b, hi.r, hi.g, hi.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    models.grass = { geo: g, sway: 0.2, swayStart: 0, noShadow: true, smooth: true };
  }
  // Fleur
  {
    const parts = [prep(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 3).translate(0, 0.25, 0), 0x3a6a24)];
    parts.push(prep(new THREE.IcosahedronGeometry(0.12, 0).translate(0, 0.55, 0), 0xffffff));
    models.flower = { geo: mergeGeometries(parts), sway: 0.25, swayStart: 0.1, noShadow: true, tintAll: true };
  }
  return models;
}

// Matériau avec vent (injection dans le shader standard).
function windMaterial(shared, model) {
  const { sway, swayStart } = model;
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.88, metalness: 0,
    flatShading: !model.smooth, side: model.side ?? THREE.FrontSide,
  });
  if (sway > 0) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = shared.uTime;
      shader.uniforms.uWind = shared.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 ip = vec3(0.0);
          #endif
          float hh = max(position.y - ${swayStart.toFixed(2)}, 0.0);
          float ph = ip.x * 0.07 + ip.z * 0.05;
          float gust = 0.6 + 0.4 * sin(uTime * 0.35 + ip.x * 0.01);
          float k = hh * hh * ${sway.toFixed(4)} * uWind * gust;
          transformed.x += sin(uTime * 1.7 + ph) * k;
          transformed.z += cos(uTime * 1.25 + ph * 1.3) * k * 0.6;`
        );
    };
  }
  return mat;
}

const PLACE = {
  [BIOME.FOREST]: [['oak', 0.17], ['pine', 0.15], ['bush', 0.07], ['rock', 0.006]],
  [BIOME.PLAINS]: [['oak', 0.018], ['bush', 0.035], ['rock', 0.006]],
  [BIOME.DESERT]: [['cactus', 0.03], ['rock', 0.012]],
  [BIOME.SNOW]: [['snowpine', 0.11], ['rock', 0.02]],
  [BIOME.SWAMP]: [['willow', 0.07], ['bush', 0.09]],
  [BIOME.BEACH]: [['palm', 0.03], ['rock', 0.008]],
  [BIOME.MOUNTAIN]: [['rock', 0.04], ['pine', 0.015]],
};
const RADIUS = { oak: 0.5, pine: 0.4, snowpine: 0.4, palm: 0.35, cactus: 0.55, willow: 0.6, rock: 1.3, bush: 0 };
// Volume du feuillage (rayon, bas, haut) pour que la caméra ne rentre pas dedans.
const CANOPY = { oak: [2.6, 2.2, 6.6], pine: [2.2, 1.4, 8], snowpine: [2.0, 1.4, 7.5], willow: [2.8, 1.5, 5], palm: [1.2, 0, 5.5], cactus: [1.0, 0, 4.6] };

export class Vegetation {
  constructor(terrain, seed, exclude = []) {
    this.group = new THREE.Group();
    this.shared = { uTime: { value: 0 }, uWind: { value: 1 } };
    const rand = mulberry32(seed ^ 0x9e3779b9);
    const clump = createSimplex(rand);
    this.models = buildModels(rand);
    this.colliders = new Map(); // hash spatial
    this.cellSize = 8;

    const placements = {};
    for (const k of Object.keys(this.models)) placements[k] = [];

    const half = WORLD_SIZE / 2;
    const step = 4.5;
    const n = new THREE.Vector3();
    for (let z = -half + step; z < half - step; z += step) {
      for (let x = -half + step; x < half - step; x += step) {
        const px = x + (rand() - 0.5) * step * 0.9;
        const pz = z + (rand() - 0.5) * step * 0.9;
        const h = terrain.heightAt(px, pz);
        if (h < SEA_LEVEL + 0.6) continue;
        if (exclude.some((e) => Math.hypot(px - e.x, pz - e.z) < e.r)) continue;
        const b = terrain.biomeAt(px, pz);
        const list = PLACE[b];
        if (!list) continue;
        terrain.normalAt(px, pz, n);
        const dens = 0.35 + 0.65 * (fbm(clump, px * 0.012, pz * 0.012, 3) * 0.5 + 0.5) * 1.4;
        let r = rand();
        for (const [type, p] of list) {
          let prob = p * dens;
          if (type === 'palm' && h > 4) prob = 0;
          if (type !== 'rock' && n.y < 0.8) prob = 0;
          if (r < prob) {
            placements[type].push([px, h, pz]);
            break;
          }
          r -= prob;
        }
      }
    }

    // Herbe et fleurs : plus denses, sans collision.
    const grassStep = 2.2;
    for (let z = -half; z < half; z += grassStep) {
      for (let x = -half; x < half; x += grassStep) {
        const px = x + (rand() - 0.5) * grassStep;
        const pz = z + (rand() - 0.5) * grassStep;
        const b = terrain.biomeAt(px, pz);
        if (b !== BIOME.PLAINS && b !== BIOME.FOREST && b !== BIOME.SWAMP) continue;
        const h = terrain.heightAt(px, pz);
        if (h < SEA_LEVEL + 0.4) continue;
        const d = fbm(clump, px * 0.02 + 50, pz * 0.02, 2);
        if (rand() < 0.42 + d * 0.4) placements.grass.push([px, h, pz]);
        else if (b === BIOME.PLAINS && d > 0.15 && rand() < 0.2) placements.flower.push([px, h, pz]);
      }
    }

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    const flowerCols = [0xff5d73, 0xffd23f, 0xf8f8ff, 0xb57bff, 0xff9a3c];
    this.counts = {};

    for (const [type, list] of Object.entries(placements)) {
      if (!list.length) continue;
      const model = this.models[type];
      const mat = windMaterial(this.shared, model);
      const mesh = new THREE.InstancedMesh(model.geo, mat, list.length);
      mesh.name = type;
      mesh.castShadow = !model.noShadow;
      mesh.receiveShadow = true;
      for (let i = 0; i < list.length; i++) {
        const [x, y, z] = list[i];
        const sc = type === 'grass' ? 0.65 + rand() * 0.55 : type === 'rock' ? 0.5 + rand() * 1.6 : 0.75 + rand() * 0.6;
        q.setFromAxisAngle(up, rand() * Math.PI * 2);
        s.set(sc, sc * (type === 'rock' ? 0.6 + rand() * 0.6 : 0.9 + rand() * 0.25), sc);
        mesh.setMatrixAt(i, m.compose(p.set(x, y - 0.15, z), q, s));
        if (type === 'flower') col.set(flowerCols[Math.floor(rand() * flowerCols.length)]);
        else if (type === 'grass') {
          const b = terrain.biomeAt(x, z);
          col.setHSL(b === BIOME.SWAMP ? 0.2 : 0.25 + rand() * 0.05, 0.4, 0.5 + rand() * 0.12).multiplyScalar(1.9);
        } else {
          const v = 0.85 + rand() * 0.3;
          col.setRGB(v, v * (0.95 + rand() * 0.1), v);
        }
        mesh.setColorAt(i, col);
        const rad = RADIUS[type];
        if (rad) this._addCollider(x, z, rad * sc, type, y, sc);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.counts[type] = list.length;
    }
  }

  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  _addCollider(x, z, r, type, y = 0, sc = 1) {
    const ix = Math.floor(x / this.cellSize), iz = Math.floor(z / this.cellSize);
    const k = this._key(ix, iz);
    if (!this.colliders.has(k)) this.colliders.set(k, []);
    const cn = CANOPY[type];
    this.colliders.get(k).push({ x, z, r, type, y, cr: cn ? cn[0] * sc : 0, cy0: cn ? y + cn[1] * sc : 0, cy1: cn ? y + cn[2] * sc : 0 });
  }

  // Vrai si le point est dans un feuillage ou un tronc (caméra).
  blocks(x, y, z) {
    const ix = Math.floor(x / this.cellSize), iz = Math.floor(z / this.cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = this.colliders.get(this._key(ix + dx, iz + dz));
        if (!list) continue;
        for (const c of list) {
          const d = Math.hypot(x - c.x, z - c.z);
          if (c.cr && d < c.cr && y > c.cy0 && y < c.cy1) return true;
          if (d < c.r + 0.3 && y < c.y + 3) return true;
        }
      }
    }
    return false;
  }

  // Repousse un cercle (x,z,r) hors des troncs. Modifie pos en place.
  resolve(pos, radius) {
    const ix = Math.floor(pos.x / this.cellSize), iz = Math.floor(pos.z / this.cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = this.colliders.get(this._key(ix + dx, iz + dz));
        if (!list) continue;
        for (const c of list) {
          const ox = pos.x - c.x, oz = pos.z - c.z;
          const d = Math.hypot(ox, oz);
          const min = c.r + radius;
          if (d < min && d > 1e-4) {
            pos.x = c.x + (ox / d) * min;
            pos.z = c.z + (oz / d) * min;
          }
        }
      }
    }
  }

  update(elapsed) {
    this.shared.uTime.value = elapsed;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh) { o.material.dispose(); o.dispose?.(); }
    });
    for (const m of Object.values(this.models)) m.geo.dispose();
  }
}
