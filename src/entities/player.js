import * as THREE from 'three';
import { clamp, lerp } from '../core/noise.js';
import { SEA_LEVEL, WORLD_SIZE } from '../world/terrain.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...extra });

function part(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Petit explorateur articulé, tourné vers +Z.
function buildModel() {
  const M = {
    tunic: mat(0x2f6f72),
    tunicDark: mat(0x1f4d50),
    skin: mat(0xf0c39a),
    pants: mat(0x4b3a2c),
    boots: mat(0x2b2019),
    scarf: mat(0xd2643a),
    belt: mat(0x6b4a2a),
    eye: mat(0x161616, { roughness: 0.3 }),
    wood: mat(0x7a5532),
    crystal: new THREE.MeshStandardMaterial({ color: 0x9ff3ff, emissive: 0x4fe0ff, emissiveIntensity: 2.2, roughness: 0.2 }),
  };
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.92;
  root.add(hips);

  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(part(new THREE.CapsuleGeometry(0.27, 0.42, 6, 12), M.tunic, 0, 0.36, 0));
  torso.add(part(new THREE.CylinderGeometry(0.3, 0.33, 0.24, 12), M.tunicDark, 0, 0.02, 0));
  torso.add(part(new THREE.TorusGeometry(0.285, 0.04, 6, 16).rotateX(Math.PI / 2), M.belt, 0, 0.14, 0));
  torso.add(part(new THREE.BoxGeometry(0.1, 0.08, 0.04), mat(0xd9b35a, { metalness: 0.6, roughness: 0.3 }), 0, 0.14, 0.29));
  // Écharpe
  torso.add(part(new THREE.TorusGeometry(0.2, 0.07, 8, 16).rotateX(Math.PI / 2), M.scarf, 0, 0.72, 0));
  const tail = new THREE.Group();
  tail.position.set(0.1, 0.7, -0.18);
  tail.add(part(new THREE.BoxGeometry(0.13, 0.45, 0.04).translate(0, -0.22, 0), M.scarf));
  torso.add(tail);

  const head = new THREE.Group();
  head.position.y = 0.98;
  torso.add(head);
  head.add(part(new THREE.SphereGeometry(0.23, 18, 14), M.skin));
  // Capuche / cheveux
  const hood = part(new THREE.SphereGeometry(0.255, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M.scarf, 0, 0.02, -0.02);
  hood.rotation.x = -0.35;
  head.add(hood);
  head.add(part(new THREE.SphereGeometry(0.035, 8, 6), M.eye, -0.08, 0.02, 0.205));
  head.add(part(new THREE.SphereGeometry(0.035, 8, 6), M.eye, 0.08, 0.02, 0.205));
  head.add(part(new THREE.SphereGeometry(0.03, 6, 5), mat(0xe8a882), 0, -0.04, 0.225));

  const mkArm = (side) => {
    const sh = new THREE.Group();
    sh.position.set(side * 0.36, 0.6, 0);
    sh.add(part(new THREE.CapsuleGeometry(0.075, 0.32, 4, 8).translate(0, -0.22, 0), M.tunic));
    sh.add(part(new THREE.SphereGeometry(0.075, 8, 6), M.skin, 0, -0.5, 0));
    torso.add(sh);
    return sh;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  // Bâton avec cristal lumineux dans la main droite
  const staff = new THREE.Group();
  staff.position.set(0, -0.5, 0.02);
  staff.add(part(new THREE.CylinderGeometry(0.025, 0.03, 1.5, 6).translate(0, 0.15, 0), M.wood));
  const gem = part(new THREE.OctahedronGeometry(0.09, 0), M.crystal, 0, 0.95, 0);
  gem.castShadow = false;
  staff.add(gem);
  staff.rotation.x = Math.PI / 2 - 0.25;
  armR.add(staff);

  const mkLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.13, 0, 0);
    hip.add(part(new THREE.CapsuleGeometry(0.09, 0.6, 4, 8).translate(0, -0.42, 0), M.pants));
    hip.add(part(new THREE.BoxGeometry(0.17, 0.13, 0.28).translate(0, -0.85, 0.04), M.boots));
    hips.add(hip);
    return hip;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  return { root, hips, torso, head, armL, armR, legL, legR, staff, gem, tail, crystalMat: M.crystal };
}

export class Player {
  constructor() {
    this.model = buildModel();
    this.object = this.model.root;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.radius = 0.4;

    this.maxHealth = 100;
    this.health = 100;
    this.maxStamina = 100;
    this.stamina = 100;
    this.staminaLock = 0;
    this.lastDamage = -99;
    this.invuln = 0;
    this.alive = true;

    this.onGround = false;
    this.swimming = false;
    this.wasSwimming = false;
    this.running = false;
    this.speed2D = 0;
    this.airTime = 0;
    this.minAirVy = 0;

    this.attackT = -1;
    this.attackCooldown = 0;
    this.attackHitDone = false;
    this.walkPhase = 0;

    this.lantern = new THREE.PointLight(0x7fe8ff, 0, 14, 1.6);
    this.lantern.position.set(0, 0.95, 0);
    this.model.staff.add(this.lantern);

    this.events = [];
  }

  spawn(p) {
    this.pos.copy(p).add(new THREE.Vector3(0, 1.5, 0));
    this.vel.set(0, 0, 0);
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.alive = true;
    this.object.visible = true;
  }

  damage(amount, from) {
    if (this.invuln > 0 || !this.alive) return false;
    this.health = Math.max(this.health - amount, 0);
    this.lastDamage = performance.now() / 1000;
    this.invuln = 0.6;
    if (from) {
      const push = new THREE.Vector3(this.pos.x - from.x, 0, this.pos.z - from.z).normalize().multiplyScalar(9);
      this.vel.x += push.x; this.vel.z += push.z;
      this.vel.y = Math.max(this.vel.y, 5);
    }
    this.events.push({ type: 'hurt', amount });
    if (this.health <= 0) { this.alive = false; this.events.push({ type: 'death' }); }
    return true;
  }

  startAttack() {
    if (this.attackCooldown > 0 || !this.alive) return false;
    this.attackT = 0;
    this.attackCooldown = 0.55;
    this.attackHitDone = false;
    this.events.push({ type: 'swing' });
    return true;
  }

  update(dt, input, cam, world) {
    const { terrain, vegetation, water, elapsed, night } = world;
    const now = performance.now() / 1000;
    this.invuln = Math.max(this.invuln - dt, 0);
    this.attackCooldown = Math.max(this.attackCooldown - dt, 0);

    const axis = this.alive ? input.moveAxis() : { x: 0, y: 0 };
    const { fwd, right } = cam.basis();
    const wish = new THREE.Vector3().addScaledVector(fwd, axis.y).addScaledVector(right, axis.x);
    const moving = wish.lengthSq() > 0.01;
    if (moving) wish.normalize().multiplyScalar(Math.min(Math.hypot(axis.x, axis.y), 1));

    const ground = terrain.heightAt(this.pos.x, this.pos.z);
    const surface = water.surfaceAt(this.pos.x, this.pos.z, elapsed);
    const deep = surface - ground > 1.25;
    this.swimming = deep && this.pos.y < surface - 0.35;

    const wantRun = input.down('ShiftLeft', 'ShiftRight') && moving && this.staminaLock <= 0;
    this.running = wantRun && this.stamina > 0;

    let maxSpeed;
    if (this.swimming) maxSpeed = this.running ? 5.5 : 3.4;
    else maxSpeed = this.running ? 11.5 : 6.2;

    // Accélération : vive au sol, réduite en l'air.
    const accel = this.swimming ? 4 : this.onGround ? 14 : 3.2;
    const tx = wish.x * maxSpeed, tz = wish.z * maxSpeed;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x = lerp(this.vel.x, tx, k);
    this.vel.z = lerp(this.vel.z, tz, k);

    // Pentes raides : on glisse.
    const n = terrain.normalAt(this.pos.x, this.pos.z);
    if (this.onGround && !this.swimming && n.y < 0.66) {
      this.vel.x += n.x * 28 * dt;
      this.vel.z += n.z * 28 * dt;
    }

    if (this.swimming) {
      const targetY = surface - 1.05;
      this.vel.y = lerp(this.vel.y, (targetY - this.pos.y) * 4, 1 - Math.exp(-6 * dt));
      if (input.hit('Space')) this.vel.y = 7.5; // élan pour sortir de l'eau
      this.onGround = false;
    } else {
      this.vel.y -= 30 * dt;
      if (this.onGround && input.hit('Space') && this.alive) {
        this.vel.y = 11;
        this.onGround = false;
        this.stamina = Math.max(this.stamina - 6, 0);
        this.events.push({ type: 'jump' });
      }
    }

    this.pos.addScaledVector(this.vel, dt);

    // Limites du monde
    const lim = WORLD_SIZE / 2 - 8;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);
    vegetation.resolve(this.pos, this.radius);

    const gNew = terrain.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= gNew) {
      if (!this.onGround && !this.swimming) {
        const impact = -this.minAirVy;
        if (impact > 21) this.damage((impact - 21) * 4.5);
        if (this.airTime > 0.25) this.events.push({ type: 'land', impact });
      }
      this.pos.y = gNew;
      this.vel.y = Math.max(this.vel.y, 0);
      this.onGround = true;
      this.airTime = 0;
      this.minAirVy = 0;
    } else if (!this.swimming) {
      // Colle au sol en descente douce.
      if (this.onGround && this.pos.y - gNew < 0.6 && this.vel.y <= 0) {
        this.pos.y = gNew;
      } else {
        this.onGround = false;
        this.airTime += dt;
        this.minAirVy = Math.min(this.minAirVy, this.vel.y);
      }
    }

    if (this.swimming !== this.wasSwimming) {
      this.events.push({ type: this.swimming ? 'splash' : 'exitWater' });
      this.wasSwimming = this.swimming;
    }

    // Endurance et vie
    if (this.running) this.stamina -= (this.swimming ? 14 : 16) * dt;
    else if (this.swimming) this.stamina -= 3.5 * dt;
    else this.stamina += (moving ? 16 : 26) * dt;
    if (this.stamina <= 0) {
      this.stamina = 0;
      if (!this.swimming) this.staminaLock = 1.2;
    }
    this.staminaLock = Math.max(this.staminaLock - dt, 0);
    this.stamina = Math.min(this.stamina, this.maxStamina);
    if (this.swimming && this.stamina <= 0) {
      // Épuisé dans l'eau : on se noie lentement.
      this.health -= 7 * dt;
      this.lastDamage = now;
      if (this.health <= 0 && this.alive) { this.health = 0; this.alive = false; this.events.push({ type: 'death' }); }
    }
    if (this.alive && now - this.lastDamage > 6) this.health = Math.min(this.health + 2.5 * dt, this.maxHealth);

    this.speed2D = Math.hypot(this.vel.x, this.vel.z);

    // Orientation
    let targetFacing = this.facing;
    if (this.attackT >= 0) targetFacing = Math.atan2(fwd.x, fwd.z);
    else if (this.speed2D > 0.5) targetFacing = Math.atan2(this.vel.x, this.vel.z);
    let d = targetFacing - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * (1 - Math.exp(-dt * 14));

    // Attaque
    let hitNow = false;
    if (this.attackT >= 0) {
      this.attackT += dt;
      if (!this.attackHitDone && this.attackT > 0.14) { this.attackHitDone = true; hitNow = true; }
      if (this.attackT > 0.42) this.attackT = -1;
    }

    // Lanterne la nuit
    this.lantern.intensity = lerp(this.lantern.intensity, night > 0.5 ? 6 : 0, 1 - Math.exp(-dt * 2));
    this.model.crystalMat.emissiveIntensity = 1.6 + Math.sin(elapsed * 3) * 0.4 + (this.attackT >= 0 ? 3 : 0);

    this._animate(dt, elapsed, moving);
    return { hitNow };
  }

  attackPoint() {
    return new THREE.Vector3(this.pos.x + Math.sin(this.facing) * 1.6, this.pos.y + 1, this.pos.z + Math.cos(this.facing) * 1.6);
  }

  _animate(dt, t, moving) {
    const M = this.model;
    const o = this.object;
    o.position.copy(this.pos);
    o.rotation.y = this.facing;
    o.visible = this.alive && (this.invuln <= 0 || Math.floor(t * 20) % 2 === 0);

    const sp = this.speed2D;
    this.walkPhase += dt * (this.swimming ? 4 : sp * 1.55);
    const ph = this.walkPhase;
    const sw = this.swimming ? 0 : clamp(sp / 6, 0, 1.3);

    const damp = (cur, target, rate = 14) => lerp(cur, target, 1 - Math.exp(-dt * rate));

    let legL = Math.sin(ph) * 0.8 * sw, legR = -legL;
    let armL = -Math.sin(ph) * 0.7 * sw, armR = -armL;
    let lean = sw * 0.12 + (this.running ? 0.12 : 0);
    let bob = Math.abs(Math.sin(ph)) * 0.07 * sw;
    let armLz = 0.08, armRz = -0.08;
    let tilt = 0;

    if (!this.onGround && !this.swimming) {
      legL = 0.5; legR = -0.3; armL = -0.4; armR = -0.4; armLz = 0.5; armRz = -0.5; lean = 0.05;
    }
    if (this.swimming) {
      lean = 0.1;
      tilt = 1.25;
      armL = Math.sin(ph) * 1.6 - 1.5;
      armR = Math.sin(ph + Math.PI) * 1.6 - 1.5;
      legL = Math.sin(ph * 2) * 0.4; legR = -legL;
      bob = 0.05 + Math.sin(t * 2.5) * 0.04;
    }
    if (!moving && this.onGround) {
      bob = Math.sin(t * 2) * 0.012;
    }
    if (this.attackT >= 0) {
      const a = this.attackT / 0.42;
      armR = a < 0.3 ? lerp(0, -2.6, a / 0.3) : lerp(-2.6, 0.6, Math.min((a - 0.3) / 0.4, 1));
      armRz = -0.3;
    }

    M.legL.rotation.x = damp(M.legL.rotation.x, legL);
    M.legR.rotation.x = damp(M.legR.rotation.x, legR);
    M.armL.rotation.x = damp(M.armL.rotation.x, armL);
    M.armR.rotation.x = this.attackT >= 0 ? armR : damp(M.armR.rotation.x, armR);
    M.armL.rotation.z = damp(M.armL.rotation.z, armLz);
    M.armR.rotation.z = damp(M.armR.rotation.z, armRz);
    M.torso.rotation.x = damp(M.torso.rotation.x, lean, 8);
    M.hips.rotation.x = damp(M.hips.rotation.x, tilt, 6);
    M.hips.position.y = damp(M.hips.position.y, 0.92 + bob, 20);
    M.tail.rotation.x = damp(M.tail.rotation.x, 0.3 + clamp(sp / 8, 0, 1.2) + Math.sin(t * 9) * 0.08 * sw, 10);
    M.head.rotation.x = damp(M.head.rotation.x, this.swimming ? -1.1 : 0, 8);
  }
}

export { SEA_LEVEL };
