import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, clamp } from '../core/noise.js';
import { SEA_LEVEL, WORLD_SIZE, BIOME } from '../world/terrain.js';

function colorize(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function animatedMaterial(shared, chunk, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1, ...opts });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nfloat fid = float(gl_InstanceID);\n${chunk}`);
  };
  return m;
}

// ─── Poissons : bancs avec comportement de boids ─────────────────
export class FishSchool {
  constructor(terrain, seed, shared) {
    this.terrain = terrain;
    const rand = mulberry32(seed ^ 0x51f15e);
    const body = colorize(new THREE.SphereGeometry(0.22, 10, 7).scale(0.55, 0.8, 1.6), 0xffffff);
    const tail = colorize(new THREE.ConeGeometry(0.2, 0.32, 4).scale(0.25, 1, 1).rotateX(Math.PI / 2).translate(0, 0, -0.45), 0xffffff);
    const fin = colorize(new THREE.ConeGeometry(0.08, 0.2, 3).scale(0.2, 1, 1).translate(0, 0.2, 0), 0xffffff);
    const eyeL = colorize(new THREE.SphereGeometry(0.035, 5, 4).translate(0.1, 0.05, 0.22), 0x111111);
    const eyeR = colorize(new THREE.SphereGeometry(0.035, 5, 4).translate(-0.1, 0.05, 0.22), 0x111111);
    const geo = mergeGeometries([body, tail, fin, eyeL, eyeR]);
    geo.computeVertexNormals();
    const mat = animatedMaterial(shared, `
      float amp = smoothstep(0.25, -0.6, position.z) * 0.16;
      transformed.x += sin(uTime * 11.0 + fid * 1.7 + position.z * 5.0) * amp;`);

    const palette = [0xff7a3d, 0xffc53d, 0x3da5ff, 0xff8fc7, 0x9cff5c, 0xf2f2f2, 0x6ef0d6];
    this.fish = [];
    const half = WORLD_SIZE / 2 - 20;
    let schools = 0, tries = 0;
    while (schools < 26 && tries < 3000) {
      tries++;
      const cx = (rand() * 2 - 1) * half, cz = (rand() * 2 - 1) * half;
      const g = terrain.heightAt(cx, cz);
      if (g > -2.5 || g < -16) continue;
      schools++;
      const col = palette[Math.floor(rand() * palette.length)];
      const n = 6 + Math.floor(rand() * 9);
      for (let i = 0; i < n; i++) {
        const p = new THREE.Vector3(cx + (rand() - 0.5) * 6, 0, cz + (rand() - 0.5) * 6);
        p.y = Math.max(g + 0.8, -1.5 - rand() * 2);
        const a = rand() * Math.PI * 2;
        this.fish.push({ p, v: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(2), col, school: schools, speed: 2.2 + rand() * 1.2, scale: 0.8 + rand() * 0.6 });
      }
    }
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(this.fish.length, 1));
    this.mesh.count = this.fish.length;
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    const c = new THREE.Color();
    this.fish.forEach((f, i) => this.mesh.setColorAt(i, c.set(f.col)));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._fwd = new THREE.Vector3(0, 0, 1);
    this._tmp = new THREE.Vector3();
  }

  update(dt, player, playerInWater) {
    const F = this.fish;
    const sep = new THREE.Vector3(), ali = new THREE.Vector3(), coh = new THREE.Vector3(), steer = new THREE.Vector3();
    const T = this.terrain;
    for (let i = 0; i < F.length; i++) {
      const f = F[i];
      sep.set(0, 0, 0); ali.set(0, 0, 0); coh.set(0, 0, 0);
      let nb = 0;
      for (let j = 0; j < F.length; j++) {
        if (i === j) continue;
        const o = F[j];
        const dx = f.p.x - o.p.x, dy = f.p.y - o.p.y, dz = f.p.z - o.p.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 36) continue;
        if (o.school === f.school) { ali.add(o.v); coh.add(o.p); nb++; }
        if (d2 < 1.2) sep.add(this._tmp.set(dx, dy, dz).divideScalar(d2 + 0.01));
      }
      steer.set(0, 0, 0);
      if (nb) {
        ali.divideScalar(nb).sub(f.v).multiplyScalar(0.8);
        coh.divideScalar(nb).sub(f.p).multiplyScalar(0.5);
        steer.add(ali).add(coh);
      }
      steer.addScaledVector(sep, 1.6);

      // Évite les côtes : regarde devant.
      const ax = f.p.x + f.v.x * 1.2, az = f.p.z + f.v.z * 1.2;
      const ahead = T.heightAt(ax, az);
      if (ahead > -1.4) {
        const gx = T.heightAt(f.p.x + 2, f.p.z) - T.heightAt(f.p.x - 2, f.p.z);
        const gz = T.heightAt(f.p.x, f.p.z + 2) - T.heightAt(f.p.x, f.p.z - 2);
        steer.x -= gx * 3; steer.z -= gz * 3;
        steer.addScaledVector(f.v, -1.2);
      }
      // Fuit le joueur.
      const px = f.p.x - player.x, pz = f.p.z - player.z, py = f.p.y - player.y;
      const pd2 = px * px + pz * pz + py * py;
      const fear = playerInWater ? 60 : 16;
      let speed = f.speed;
      if (pd2 < fear) {
        steer.add(this._tmp.set(px, py * 0.3, pz).normalize().multiplyScalar(8));
        speed *= 2.4;
      }
      // Profondeur
      const ground = T.heightAt(f.p.x, f.p.z);
      if (f.p.y < ground + 0.6) steer.y += 3;
      if (f.p.y > SEA_LEVEL - 0.6) steer.y -= 3;
      steer.y -= f.v.y * 0.5;

      f.v.addScaledVector(steer, dt * 2);
      const l = f.v.length();
      if (l > 0.001) f.v.multiplyScalar(lerpN(l, speed, dt * 2) / l);
      f.p.addScaledVector(f.v, dt);
      if (f.p.y > SEA_LEVEL - 0.4) f.p.y = SEA_LEVEL - 0.4;
      if (f.p.y < ground + 0.3) f.p.y = ground + 0.3;

      this._q.setFromUnitVectors(this._fwd, this._tmp.copy(f.v).normalize());
      this.mesh.setMatrixAt(i, this._m.compose(f.p, this._q, this._s.setScalar(f.scale)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.dispose(); }
}

function lerpN(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }

// ─── Oiseaux : volées qui tournent au-dessus des terres ──────────
export class Birds {
  constructor(terrain, seed, shared) {
    const rand = mulberry32(seed ^ 0xb12d5);
    const body = colorize(new THREE.ConeGeometry(0.12, 0.7, 5).rotateX(Math.PI / 2), 0x2d2d33);
    const wings = [];
    for (const s of [-1, 1]) {
      const w = new THREE.BufferGeometry();
      w.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, s * 1.1, 0.05, -0.05, 0, 0, -0.22], 3));
      w.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
      wings.push(colorize(w, 0x3b3b44));
    }
    const geo = mergeGeometries([body.deleteAttribute('normal') && body, ...wings].map((g) => { if (!g.attributes.normal) g.computeVertexNormals(); return g; }));
    const mat = animatedMaterial(shared, `
      float flap = sin(uTime * 9.0 + fid * 2.3);
      transformed.y += flap * abs(position.x) * 0.55;`, { side: THREE.DoubleSide, roughness: 0.8 });
    this.flocks = [];
    const N = 4;
    this.birds = [];
    for (let k = 0; k < N; k++) {
      const c = new THREE.Vector3((rand() - 0.5) * WORLD_SIZE * 0.6, 0, (rand() - 0.5) * WORLD_SIZE * 0.6);
      this.flocks.push({ c, h: 45 + rand() * 30, r: 30 + rand() * 40, w: (rand() < 0.5 ? -1 : 1) * (0.15 + rand() * 0.1), drift: rand() * Math.PI * 2 });
      const n = 6 + Math.floor(rand() * 8);
      for (let i = 0; i < n; i++) this.birds.push({ f: k, off: rand() * Math.PI * 2, rr: (rand() - 0.5) * 12, hh: (rand() - 0.5) * 6 });
    }
    this.mesh = new THREE.InstancedMesh(geo, mat, this.birds.length);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this.terrain = terrain;
  }

  update(dt, t) {
    for (const f of this.flocks) {
      f.drift += dt * 0.05;
      f.c.x += Math.cos(f.drift) * dt * 3;
      f.c.z += Math.sin(f.drift) * dt * 3;
      const lim = WORLD_SIZE * 0.4;
      if (Math.abs(f.c.x) > lim || Math.abs(f.c.z) > lim) f.drift += Math.PI * dt;
    }
    this.birds.forEach((b, i) => {
      const f = this.flocks[b.f];
      const a = t * f.w + b.off;
      const r = f.r + b.rr;
      const x = f.c.x + Math.cos(a) * r, z = f.c.z + Math.sin(a) * r;
      const ground = Math.max(this.terrain.heightAt(x, z), 0);
      const y = ground + f.h + b.hh + Math.sin(t * 0.7 + b.off) * 2;
      const dir = f.w > 0 ? 1 : -1;
      this._e.set(0, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir) , -0.35 * dir);
      this._q.setFromEuler(this._e);
      this.mesh.setMatrixAt(i, this._m.compose(this._p.set(x, y, z), this._q, this._s));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.dispose(); }
}

export { BIOME };
