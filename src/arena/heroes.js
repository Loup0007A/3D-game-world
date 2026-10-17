import * as THREE from 'three';
import { Player } from '../entities/player.js';

// ─── Joueurs vus par les autres, éclairs de lumière, bouclier ──────

export function colorFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.7, 0.55);
}

export function outfitFor(player, id) {
  const c = colorFor(id);
  const hsl = {};
  c.getHSL(hsl);
  const col = (dh, s, l) => new THREE.Color().setHSL((hsl.h + dh) % 1, s, l);
  player.setOutfit(col(0, 0.45, 0.32), col(0.45, 0.65, 0.5), col(0.08, 0.25, 0.22));
}

export function nameSprite(name, color = '#ffe9c4') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.font = 'bold 52px Outfit, system-ui, sans-serif';
  g.textAlign = 'center';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.strokeText(name, 256, 66);
  g.fillStyle = color;
  g.fillText(name, 256, 66);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(4, 0.75, 1);
  s.renderOrder = 10;
  return s;
}

const shieldGeo = new THREE.SphereGeometry(1.25, 20, 14);
export function shieldMesh() {
  const m = new THREE.Mesh(shieldGeo, new THREE.MeshBasicMaterial({ color: 0x7ff0ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.y = 0.95;
  m.visible = false;
  return m;
}

// Un autre joueur : même héros que le sien, animé à partir de ses positions.
export class RemoteHero {
  constructor(scene, id, name) {
    this.id = id;
    this.name = name;
    this.p = new Player();
    outfitFor(this.p, id);
    this.p.lantern.intensity = 0;
    this.label = nameSprite(name);
    this.label.position.y = 2.5;
    this.p.object.add(this.label);
    this.shield = shieldMesh();
    this.p.object.add(this.shield);
    scene.add(this.p.object);
    this.target = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.hp = 100;
    this.alive = true;
    this.seen = 0;
    this.ry = 0;
    this.forceVisible = false;
  }

  applyState(s) {
    this.target.set(s.x, s.y, s.z);
    if (!this.seen) { this.p.pos.copy(this.target); this.prev.copy(this.target); this.p.visY = s.y; }
    this.ry = s.ry || 0;
    this.vx = s.vx || 0;
    this.vz = s.vz || 0;
    this.hp = s.hp ?? this.hp;
    this.alive = s.a !== 0;
    this.shieldOn = !!s.sh;
    if (s.m === 3 && this.p.attackT < 0) this.p.attackT = 0.05;
    this.seen = performance.now();
  }

  update(dt, elapsed, terrain) {
    const p = this.p;
    if (!this.seen && !this.forceVisible) { p.object.visible = false; return; }
    this.prev.copy(p.pos);
    // Entre deux nouvelles, on prolonge la course.
    const age = Math.min((performance.now() - this.seen) / 1000, 0.4);
    const want = this._want || (this._want = new THREE.Vector3());
    want.copy(this.target);
    if (this.alive) { want.x += (this.vx || 0) * age; want.z += (this.vz || 0) * age; }
    p.pos.lerp(want, 1 - Math.exp(-dt * 12));
    const v = p.pos.clone().sub(this.prev).divideScalar(Math.max(dt, 1e-4));
    p.vel.copy(v);
    p.speed2D = Math.hypot(v.x, v.z);
    const ground = terrain.heightAt(p.pos.x, p.pos.z);
    p.onGround = p.pos.y - ground < 0.35;
    p.swimming = false;
    p.runBlend += ((p.speed2D > 7 ? 1 : 0) - p.runBlend) * (1 - Math.exp(-dt * 5));
    p.facing = this.ry;
    p.alive = this.alive || this.forceVisible;
    p.invuln = 0;
    if (p.attackT >= 0) { p.attackT += dt; if (p.attackT > 0.42) p.attackT = -1; }
    p._animate(dt, elapsed, p.speed2D > 0.4);
    p.events.length = 0;
    this.shield.visible = this.shieldOn && this.alive;
    this.label.visible = this.alive;
  }

  dispose(scene) {
    scene.remove(this.p.object);
  }
}

// Éclairs de lumière tirés par les joueurs.
const boltGeo = new THREE.SphereGeometry(0.28, 10, 8);
const boltMat = new THREE.MeshBasicMaterial({ color: 0xbff8ff });

export class Bolts {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.list = [];
  }

  // local : tiré par soi (lui seul vérifie la touche sur le dragon).
  fire(from, dir, local) {
    const m = new THREE.Mesh(boltGeo, boltMat);
    m.position.copy(from);
    this.scene.add(m);
    this.list.push({ m, v: dir.clone().normalize().multiplyScalar(70), life: 1.3, local });
  }

  update(dt, dragon, onHit) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.life -= dt;
      b.m.position.addScaledVector(b.v, dt);
      this.particles.burst(b.m.position, 0x8ff6ff, 2, { speed: 0.6, up: 0.2, gravity: 0, size: 0.35, life: 0.3 });
      let done = b.life <= 0;
      if (!done && dragon && dragon.hits(b.m.position)) {
        done = true;
        this.particles.burst(b.m.position, 0xbff8ff, 26, { speed: 7, up: 2, gravity: -4, size: 0.5, life: 0.6 });
        if (b.local) onHit(b.m.position);
      }
      if (done) {
        this.scene.remove(b.m);
        this.list.splice(i, 1);
      }
    }
  }
}
