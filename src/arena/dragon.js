import * as THREE from 'three';

// ─── Le dragon de l'arène ──────────────────────────────────────────
// Piloté par le membre qui a lancé le Défi (sur sa machine) ; ailleurs,
// il suit l'état reçu par le réseau, en douceur.

const SKINS = {
  demon: { key: 'demon', scale: 3 },
  noir: { key: 'blackDragon', scale: 2.8 },
  drake: { key: 'drake', scale: 3.2 },
};

export const DRAGON = {
  speed: 27,
  vspeed: 15,
  breathRange: 24,
  breathAngle: 0.44,   // demi-ouverture du cône (radians)
  breathDps: 24,
  fuelMax: 100,
  fuelUse: 32,
  fuelRegen: 20,
  biteCd: 3.5,
  biteTime: 0.45,
  biteDmg: 32,
  biteReach: 6.5,
  roarCd: 12,
  roarRadius: 20,
  roarDmg: 10,
  roarStun: 1.6,
};

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (k, dt) => 1 - Math.exp(-k * dt);

// Dragon dessiné en code, si les modèles 3D n'ont pas pu se charger.
function fallbackDragon() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x5a1010, roughness: 0.6, emissive: 0x200000 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 7, 6, 12).rotateX(Math.PI / 2), m);
  body.position.y = 4;
  g.add(body);
  const head = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4, 8).rotateX(Math.PI / 2), m);
  head.position.set(0, 5.5, 7);
  g.add(head);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), new THREE.MeshStandardMaterial({ color: 0x3a0808, side: THREE.DoubleSide }));
    w.position.set(s * 5.5, 5.5, 0);
    w.rotation.x = -Math.PI / 2;
    g.add(w);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root: g, play() {}, update() {}, glow() {}, fade() {}, fallback: true };
}

export class Dragon {
  constructor(scene, models, skin, particles) {
    const def = SKINS[skin] || SKINS.demon;
    this.particles = particles;
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.inst = (models && models.instance(def.key, { glow: 0xff3010, glowI: 0.05 })) || (models && models.instance('demon')) || fallbackDragon();
    if (!this.inst.fallback) this.inst.root.scale.setScalar(def.scale);
    this.root.add(this.inst.root);
    scene.add(this.root);

    // Gabarit : bouche, centre du corps, rayon de touche.
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.inst.root, true);
    const size = box.getSize(new THREE.Vector3());
    this.length = size.z;
    this.bodyY = (box.min.y + box.max.y) / 2;
    this.mouthLocal = new THREE.Vector3(0, THREE.MathUtils.lerp(this.bodyY, box.max.y, 0.3), box.max.z * 0.93);
    this.hitRadius = Math.max(size.z * 0.3, 4);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.bank = 0;
    this.aim = new THREE.Vector3(0, 0, 1);
    this.target = new THREE.Vector3();
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.fuel = DRAGON.fuelMax;
    this.breathing = false;
    this.biteT = 0;
    this.biteCd = 0;
    this.roarCd = 0;
    this.airborne = true;
    this.dying = -1;
    this.visible = true;
    this.anim = '';

    this.fireColor = new THREE.Color(0xff3010);
    this.fireLight = new THREE.PointLight(0xff7a2a, 0, 46, 1.6);
    scene.add(this.fireLight);
    this._m = new THREE.Vector3();
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  mouth(out = new THREE.Vector3()) {
    return out.copy(this.mouthLocal).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')).add(this.pos);
  }

  center(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.bodyY, this.pos.z);
  }

  // Une boule lumineuse touche-t-elle le dragon (corps ou tête) ?
  hits(p, pad = 0.6) {
    if (this.dying >= 0) return false;
    if (this.center(this._m).distanceTo(p) < this.hitRadius + pad) return true;
    return this.mouth(this._m).distanceTo(p) < 2.6 + pad;
  }

  // Pilotage local (le lanceur du Défi). basis : avant/droite de la caméra ;
  // aim : direction visée (souffle, morsure).
  control(dt, input, basis, aim, ctx) {
    const { terrain, center, radius, ceiling, breathHeld, frozen } = ctx;
    this.biteCd = Math.max(this.biteCd - dt, 0);
    this.roarCd = Math.max(this.roarCd - dt, 0);
    this.aim.copy(aim);

    const axis = frozen ? { x: 0, y: 0 } : input.moveAxis();
    const up = frozen ? 0 : (input.down('Space') ? 1 : 0) - (input.down('ShiftLeft', 'ShiftRight', 'ControlLeft') ? 1 : 0);
    const want = new THREE.Vector3().addScaledVector(basis.fwd, axis.y).addScaledVector(basis.right, axis.x);
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(DRAGON.speed);
    want.y = up * DRAGON.vspeed;

    if (this.biteT > 0) {
      this.biteT = Math.max(this.biteT - dt, 0);
      this.vel.copy(this.aim).multiplyScalar(48);
    } else {
      this.vel.lerp(want, damp(3.2, dt));
    }
    this.pos.addScaledVector(this.vel, dt);

    // Sol, plafond, bord de l'arène.
    const ground = terrain.heightAt(this.pos.x, this.pos.z) + 0.6;
    if (this.pos.y < ground) { this.pos.y = ground; if (this.vel.y < 0) this.vel.y = 0; }
    if (this.pos.y > ceiling) { this.pos.y = ceiling; if (this.vel.y > 0) this.vel.y = 0; }
    const dx = this.pos.x - center.x, dz = this.pos.z - center.z, d = Math.hypot(dx, dz);
    if (d > radius) { this.pos.x = center.x + (dx / d) * radius; this.pos.z = center.z + (dz / d) * radius; }
    this.airborne = this.pos.y > ground + 2.5;

    // Souffle : tant qu'on tient, s'il reste du feu.
    if (breathHeld && !frozen && this.fuel > (this.breathing ? 0 : 15)) this.breathing = true;
    else if (!breathHeld || this.fuel <= 0) this.breathing = false;
    this.fuel = this.breathing ? Math.max(this.fuel - DRAGON.fuelUse * dt, 0) : Math.min(this.fuel + DRAGON.fuelRegen * dt, DRAGON.fuelMax);

    // Orientation : vers la visée en attaque, sinon vers la trajectoire.
    const hs = Math.hypot(this.vel.x, this.vel.z);
    let goalYaw = this.yaw;
    if (this.breathing || this.biteT > 0) goalYaw = Math.atan2(this.aim.x, this.aim.z);
    else if (hs > 2) goalYaw = Math.atan2(this.vel.x, this.vel.z);
    const dy = wrap(goalYaw - this.yaw);
    this.yaw = wrap(this.yaw + dy * damp(this.breathing ? 9 : 4, dt));
    const goalPitch = this.breathing || this.biteT > 0 ? -Math.asin(THREE.MathUtils.clamp(this.aim.y, -0.9, 0.9)) * 0.7 : THREE.MathUtils.clamp(-this.vel.y * 0.025, -0.35, 0.35);
    this.pitch += (goalPitch - this.pitch) * damp(5, dt);
    this.bank += (THREE.MathUtils.clamp(-dy * 1.2, -0.5, 0.5) - this.bank) * damp(4, dt);
  }

  startBite() {
    if (this.biteCd > 0 || this.dying >= 0) return false;
    this.biteCd = DRAGON.biteCd;
    this.biteT = DRAGON.biteTime;
    return true;
  }

  startRoar() {
    if (this.roarCd > 0 || this.dying >= 0) return false;
    this.roarCd = DRAGON.roarCd;
    return true;
  }

  // Ailleurs : on suit l'état reçu.
  applyState(s) {
    this.target.set(s.x, s.y, s.z);
    this.targetYaw = s.ry;
    this.targetPitch = s.pi || 0;
    this.hp = s.hp;
    this.maxHp = s.mhp || this.maxHp;
    this.breathing = !!s.b;
    this.airborne = !!s.f;
    if (s.ax != null) this.aim.set(s.ax, s.ay, s.az).normalize();
    if (s.k) this.biteT = Math.max(this.biteT, 0.2);
    // Vitesse : les autres pages prolongent le vol entre deux nouvelles.
    if (s.vx != null) this.vel.set(s.vx, s.vy || 0, s.vz || 0); else this.vel.set(0, 0, 0);
    if (!this.seen) { this.pos.copy(this.target); this.yaw = this.targetYaw; }
    this.seen = performance.now();
  }

  follow(dt) {
    const age = this.seen ? Math.min((performance.now() - this.seen) / 1000, 0.45) : 0;
    this._pred = (this._pred || new THREE.Vector3()).copy(this.target).addScaledVector(this.vel, age);
    this.pos.lerp(this._pred, damp(9, dt));
    const dy = wrap(this.targetYaw - this.yaw);
    this.yaw = wrap(this.yaw + dy * damp(9, dt));
    this.pitch += (this.targetPitch - this.pitch) * damp(8, dt);
    this.bank += (THREE.MathUtils.clamp(-dy * 1.2, -0.5, 0.5) - this.bank) * damp(4, dt);
    this.biteT = Math.max(this.biteT - dt, 0);
  }

  state() {
    return {
      x: +this.pos.x.toFixed(2), y: +this.pos.y.toFixed(2), z: +this.pos.z.toFixed(2),
      ry: +this.yaw.toFixed(3), pi: +this.pitch.toFixed(3),
      ax: +this.aim.x.toFixed(3), ay: +this.aim.y.toFixed(3), az: +this.aim.z.toFixed(3),
      vx: +this.vel.x.toFixed(1), vy: +this.vel.y.toFixed(1), vz: +this.vel.z.toFixed(1),
      hp: Math.round(this.hp), mhp: this.maxHp, b: this.breathing ? 1 : 0, f: this.airborne ? 1 : 0, k: this.biteT > 0 ? 1 : 0,
    };
  }

  // Rendu : position, animation, feu.
  render(dt, elapsed) {
    this.root.position.copy(this.pos);
    this.root.rotation.set(this.pitch, this.yaw, this.bank);
    this.root.visible = this.visible;
    const moving = Math.hypot(this.vel.x, this.vel.z) > 3 || this.target.distanceTo(this.pos) > 0.5;
    const anim = this.airborne || this.dying >= 0 ? 'fly' : moving ? 'run' : 'idle';
    if (anim !== this.anim) { this.anim = anim; this.inst.play(anim, anim === 'fly' && this.biteT > 0 ? 1.8 : 1); }
    this.inst.update(dt);
    this.inst.glow(this.breathing ? 0.25 : 0.05 + Math.max(0, Math.sin(elapsed * 2)) * 0.04, this.fireColor);

    const m = this.mouth(this._m);
    if (this.breathing && this.visible) {
      const dir = this.aim.lengthSq() > 0.5 ? this.aim : this.forward();
      this.particles.spray(m, dir, 0xffa040, 26, { speed: 30, cone: 0.16, life: 0.75, size: 1.6, spread: 0.6 });
      this.particles.spray(m, dir, 0xff3a10, 12, { speed: 22, cone: 0.24, life: 0.9, size: 2.4, spread: 0.8 });
      if (Math.random() < 0.4) this.particles.spray(m, dir, 0x444444, 4, { speed: 10, cone: 0.35, life: 1.6, size: 2.6, gravity: 2 });
      this.fireLight.position.copy(m).addScaledVector(dir, 8);
      this.fireLight.intensity = 60 + Math.random() * 30;
    } else {
      this.fireLight.intensity *= 0.85;
    }
  }

  // Un joueur (position des pieds p) est-il dans le cône du souffle ?
  inBreath(p) {
    if (!this.breathing) return false;
    const m = this.mouth(this._m);
    const v = new THREE.Vector3(p.x - m.x, p.y + 1 - m.y, p.z - m.z);
    const d = v.length();
    if (d > DRAGON.breathRange) return false;
    if (d < 2.5) return true;
    return v.normalize().angleTo(this.aim.lengthSq() > 0.5 ? this.aim : this.forward()) < DRAGON.breathAngle;
  }

  dispose(scene) {
    scene.remove(this.root);
    scene.remove(this.fireLight);
    this.inst.dispose?.();
  }
}
