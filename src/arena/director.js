import * as THREE from 'three';

// ─── Réalisateur de la tribune ─────────────────────────────────────
// Caméra « retransmission » : des plans de quelques secondes (plan large,
// poursuite du dragon, face au dragon, épaule d'un joueur, contre-plongée,
// vue du ciel), et des coupes sur les moments forts (souffle, joueur à
// terre, rugissement).

const damp = (k, dt) => 1 - Math.exp(-k * dt);

export class Director {
  constructor(camera) {
    this.camera = camera;
    this.shot = 'orbit';
    this.t = 0;
    this.len = 5;
    this.pos = new THREE.Vector3(0, 60, 0);
    this.look = new THREE.Vector3();
    this.focusId = null;
    this.angle = Math.random() * Math.PI * 2;
    this.locked = 0;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
  }

  // Coupe forcée (événement) : garde le plan au moins « hold » secondes.
  cut(shot, focusId = null, hold = 3) {
    if (this.locked > 0 && shot === this.shot) return;
    this.shot = shot;
    this.focusId = focusId;
    this.t = 0;
    this.len = hold + 1.5;
    this.locked = hold;
    this.snap = true;
  }

  _pick(ctx) {
    const alive = ctx.heroes.filter((h) => h.alive);
    const r = Math.random();
    let shot;
    if (ctx.dragon.breathing && r < 0.5) shot = 'face';
    else if (r < 0.2) shot = 'orbit';
    else if (r < 0.42) shot = 'chase';
    else if (r < 0.62 && alive.length) shot = 'shoulder';
    else if (r < 0.78) shot = 'low';
    else if (r < 0.88) shot = 'top';
    else shot = 'face';
    this.shot = shot;
    this.focusId = alive.length ? alive[Math.floor(Math.random() * alive.length)].id : null;
    this.t = 0;
    this.len = 4 + Math.random() * 3;
    this.snap = true;
  }

  update(dt, ctx) {
    const { dragon, heroes, center, terrain } = ctx;
    this.t += dt;
    this.locked = Math.max(this.locked - dt, 0);
    if (this.t > this.len && this.locked <= 0) this._pick(ctx);

    const d = dragon.center(this._v);
    const hero = heroes.find((h) => h.id === this.focusId && h.alive) || heroes.find((h) => h.alive) || heroes[0];
    const hp = hero ? hero.pos.clone() : center.clone();
    const mid = this._w.copy(d).lerp(hp, 0.5);
    const fwd = dragon.forward();
    const desired = new THREE.Vector3();
    const look = new THREE.Vector3();

    switch (this.shot) {
      case 'chase':
        desired.copy(d).addScaledVector(fwd, -dragon.length * 1.4).add(new THREE.Vector3(0, dragon.length * 0.45, 0));
        look.copy(d).addScaledVector(fwd, dragon.length);
        break;
      case 'face':
        desired.copy(dragon.mouth()).addScaledVector(fwd, dragon.length * 0.9).add(new THREE.Vector3(Math.sin(this.t * 0.3) * 4, 1.5, 0));
        look.copy(dragon.mouth());
        break;
      case 'shoulder': {
        const toD = d.clone().sub(hp).setY(0).normalize();
        const side = new THREE.Vector3(-toD.z, 0, toD.x);
        desired.copy(hp).addScaledVector(toD, -6).addScaledVector(side, 2.2).add(new THREE.Vector3(0, 2.6, 0));
        look.copy(d);
        break;
      }
      case 'low': {
        const a = this.angle + this.t * 0.15;
        desired.set(mid.x + Math.cos(a) * 16, 0, mid.z + Math.sin(a) * 16);
        desired.y = terrain.heightAt(desired.x, desired.z) + 1.2;
        look.copy(d);
        break;
      }
      case 'top':
        desired.copy(mid).add(new THREE.Vector3(Math.cos(this.angle) * 8, 70, Math.sin(this.angle) * 8));
        look.copy(mid);
        break;
      case 'finale':
        // Plans posés par la cinématique de fin (pos / look donnés de l'extérieur).
        desired.copy(this.fixedPos || this.pos);
        look.copy(this.fixedLook || mid);
        break;
      default: {
        const a = this.angle + this.t * 0.08;
        desired.set(center.x + Math.cos(a) * 75, center.y + 38, center.z + Math.sin(a) * 75);
        look.copy(mid);
      }
    }
    const minY = terrain.heightAt(desired.x, desired.z) + 1;
    if (desired.y < minY) desired.y = minY;
    if (this.snap) { this.pos.copy(desired); this.look.copy(look); this.snap = false; }
    else { this.pos.lerp(desired, damp(this.shot === 'chase' ? 4 : 2.5, dt)); this.look.lerp(look, damp(5, dt)); }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
