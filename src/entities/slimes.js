import * as THREE from 'three';
import { clamp, lerp } from '../core/noise.js';
import { SEA_LEVEL, WORLD_SIZE, BIOME } from '../world/terrain.js';

const TYPES = {
  green: { color: 0x7be36a, hp: 2, dmg: 12, scale: 1, speed: 5.5, score: 10 },
  bog: { color: 0x9b6bff, hp: 3, dmg: 14, scale: 1.15, speed: 5, score: 15 },
  king: { color: 0xff5a5a, hp: 6, dmg: 22, scale: 1.9, speed: 4.2, score: 40 },
  frost: { color: 0x8fdcff, hp: 3, dmg: 14, scale: 1.1, speed: 6, score: 15 },
};

const bodyGeo = (() => {
  const g = new THREE.SphereGeometry(0.7, 24, 16);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < -0.25) p.setY(i, -0.25 + (y + 0.25) * 0.25); // base aplatie
  }
  g.translate(0, 0.32, 0);
  g.computeVertexNormals();
  return g;
})();
const eyeGeo = new THREE.SphereGeometry(0.09, 8, 6);
const pupilGeo = new THREE.SphereGeometry(0.045, 6, 5);
const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });

class Slime {
  constructor(type, pos) {
    const T = TYPES[type];
    this.type = type;
    this.T = T;
    this.hp = T.hp;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.hopTimer = Math.random();
    this.onGround = true;
    this.squash = 0;
    this.hurtT = 0;
    this.dying = -1;
    this.attackCd = 0;
    this.wander = Math.random() * Math.PI * 2;
    this.guard = null;

    this.mat = new THREE.MeshStandardMaterial({
      color: T.color, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.88,
      emissive: T.color, emissiveIntensity: 0.18,
    });
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, this.mat);
    body.castShadow = true;
    g.add(body);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(s * 0.2, 0.5, 0.55);
      const p = new THREE.Mesh(pupilGeo, pupilMat);
      p.position.set(0, 0, 0.06);
      e.add(p);
      g.add(e);
    }
    if (type === 'king') {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.22, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide }));
      crown.position.y = 1.0;
      g.add(crown);
    }
    this.body = body;
    this.object = g;
    this.object.scale.setScalar(T.scale);
  }
}

// Gère l'apparition, l'IA, les combats et la mort des slimes.
export class SlimeManager {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.list = [];
    this.spawnTimer = 2;
    this.events = [];
  }

  spawn(type, pos) {
    const s = new Slime(type, pos);
    this.list.push(s);
    this.scene.add(s.object);
    return s;
  }

  _typeFor(x, z, level) {
    const b = this.terrain.biomeAt(x, z);
    if (Math.random() < 0.04 + level * 0.02) return 'king';
    if (b === BIOME.SWAMP) return 'bog';
    if (b === BIOME.SNOW || b === BIOME.MOUNTAIN) return 'frost';
    return 'green';
  }

  update(dt, player, ctx) {
    const { night, level, elapsed } = ctx;
    const T = this.terrain;

    // Apparitions : la nuit partout, le jour seulement dans les marais.
    const maxCount = Math.round((night > 0.5 ? 7 : 2) + level * 2);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && player.alive) {
      this.spawnTimer = night > 0.5 ? 3.5 : 7;
      const wild = this.list.filter((s) => !s.guard && s.dying < 0).length;
      if (wild < maxCount) {
        for (let tries = 0; tries < 12; tries++) {
          const a = Math.random() * Math.PI * 2;
          const r = 35 + Math.random() * 35;
          const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
          if (!T.isInside(x, z, 20)) continue;
          const h = T.heightAt(x, z);
          if (h < SEA_LEVEL + 0.5) continue;
          const b = T.biomeAt(x, z);
          if (night < 0.5 && b !== BIOME.SWAMP) continue;
          this.spawn(this._typeFor(x, z, level), new THREE.Vector3(x, h, z));
          break;
        }
      }
    }

    for (const s of this.list) {
      if (s.dying >= 0) {
        s.dying += dt;
        const k = 1 - s.dying / 0.35;
        s.object.scale.set(s.T.scale * (1 + s.dying * 3), s.T.scale * Math.max(k, 0.01), s.T.scale * (1 + s.dying * 3));
        s.mat.opacity = Math.max(k * 0.88, 0);
        continue;
      }
      s.attackCd = Math.max(s.attackCd - dt, 0);
      s.hurtT = Math.max(s.hurtT - dt, 0);

      const toP = new THREE.Vector3(player.pos.x - s.pos.x, 0, player.pos.z - s.pos.z);
      const dist = toP.length();
      const aggro = player.alive && !player.swimming && (dist < 26 || (s.guard && dist < 34));

      // Fond au lever du jour (sauf marais et gardiens).
      if (night < 0.3 && !s.guard && T.biomeAt(s.pos.x, s.pos.z) !== BIOME.SWAMP && Math.random() < dt * 0.25) {
        this.kill(s, false);
        continue;
      }
      if (dist > 160 && !s.guard) { this.kill(s, false); continue; }

      s.hopTimer -= dt;
      if (s.onGround && s.hopTimer <= 0) {
        let dir;
        if (aggro) dir = toP.normalize();
        else if (s.guard && s.pos.distanceTo(s.guard) > 10) dir = new THREE.Vector3(s.guard.x - s.pos.x, 0, s.guard.z - s.pos.z).normalize();
        else { s.wander += (Math.random() - 0.5) * 1.5; dir = new THREE.Vector3(Math.cos(s.wander), 0, Math.sin(s.wander)); }
        const sp = aggro ? s.T.speed : s.T.speed * 0.4;
        s.vel.set(dir.x * sp, aggro ? 7 : 5, dir.z * sp);
        s.onGround = false;
        s.hopTimer = aggro ? 0.55 + Math.random() * 0.3 : 1.2 + Math.random() * 1.5;
        s.squash = -0.3;
        s.object.rotation.y = Math.atan2(dir.x, dir.z);
      }

      if (!s.onGround) s.vel.y -= 24 * dt;
      s.pos.addScaledVector(s.vel, dt);
      const g = T.heightAt(s.pos.x, s.pos.z);
      if (g < SEA_LEVEL - 0.3) {
        // Pas dans l'eau : rebrousse chemin.
        s.pos.addScaledVector(s.vel, -dt * 2);
        s.vel.x *= -0.5; s.vel.z *= -0.5;
      }
      const gy = T.heightAt(s.pos.x, s.pos.z);
      if (s.pos.y <= gy) {
        if (!s.onGround) s.squash = 0.45;
        s.pos.y = gy;
        s.vel.set(0, 0, 0);
        s.onGround = true;
      }
      if (aggro && s.onGround) s.object.rotation.y = lerpAngle(s.object.rotation.y, Math.atan2(toP.x, toP.z), dt * 6);

      // Contact avec le joueur
      const reach = 0.9 * s.T.scale + player.radius;
      const dy = Math.abs(player.pos.y + 0.6 - (s.pos.y + 0.4 * s.T.scale));
      if (dist < reach && dy < 1.4 * s.T.scale && s.attackCd <= 0 && player.alive) {
        if (player.damage(s.T.dmg, s.pos)) this.events.push({ type: 'slimeHit', slime: s });
        s.attackCd = 1;
      }

      // Squash & stretch
      s.squash = lerp(s.squash, 0, 1 - Math.exp(-dt * 8));
      const st = s.onGround ? s.squash : clamp(-s.vel.y * 0.04, -0.25, 0.25);
      const breathe = Math.sin(elapsed * 3 + s.wander) * 0.03;
      const sc = s.T.scale;
      s.object.scale.set(sc * (1 + st + breathe), sc * (1 - st - breathe), sc * (1 + st + breathe));
      s.object.position.copy(s.pos);
      s.mat.emissiveIntensity = s.hurtT > 0 ? 1.5 : 0.18 + night * 0.25;
    }

    // Nettoyage
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      if (s.dying > 0.35) {
        this.scene.remove(s.object);
        s.mat.dispose();
        this.list.splice(i, 1);
      }
    }
  }

  // Frappe tout slime dans un rayon autour du point d'attaque.
  hitArea(point, radius, from) {
    let hits = 0;
    for (const s of this.list) {
      if (s.dying >= 0) continue;
      const c = s.pos.clone().add(new THREE.Vector3(0, 0.4 * s.T.scale, 0));
      if (c.distanceTo(point) < radius + 0.6 * s.T.scale) {
        s.hp -= 1;
        s.hurtT = 0.18;
        const push = new THREE.Vector3(s.pos.x - from.x, 0, s.pos.z - from.z).normalize();
        s.vel.set(push.x * 9 / s.T.scale, 6, push.z * 9 / s.T.scale);
        s.onGround = false;
        s.hopTimer = 0.9;
        hits++;
        if (s.hp <= 0) this.kill(s, true);
        else this.events.push({ type: 'slimeHurt', slime: s });
      }
    }
    return hits;
  }

  kill(s, byPlayer) {
    if (s.dying >= 0) return;
    s.dying = 0;
    this.events.push({ type: byPlayer ? 'slimeKilled' : 'slimeMelt', slime: s, pos: s.pos.clone(), color: s.T.color, score: s.T.score });
  }

  clear() {
    for (const s of this.list) { this.scene.remove(s.object); s.mat.dispose(); }
    this.list = [];
  }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * clamp(t, 0, 1);
}

export { WORLD_SIZE };
