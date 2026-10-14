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

// Lissage exponentiel indépendant du framerate.
const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ─── Modèle : Ilo, articulée (genoux, coudes), tournée vers +Z ────────
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
    wing: new THREE.MeshBasicMaterial({ color: 0x7ff0ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  };
  const root = new THREE.Group();
  root.rotation.order = 'YXZ'; // lacet puis roulis : on peut pencher dans les virages
  const hips = new THREE.Group();
  hips.position.y = 0.92;
  root.add(hips);

  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(part(new THREE.CapsuleGeometry(0.27, 0.42, 6, 12), M.tunic, 0, 0.36, 0));
  torso.add(part(new THREE.CylinderGeometry(0.3, 0.33, 0.24, 12), M.tunicDark, 0, 0.02, 0));
  torso.add(part(new THREE.TorusGeometry(0.285, 0.04, 6, 16).rotateX(Math.PI / 2), M.belt, 0, 0.14, 0));
  torso.add(part(new THREE.BoxGeometry(0.1, 0.08, 0.04), mat(0xd9b35a, { metalness: 0.6, roughness: 0.3 }), 0, 0.14, 0.29));
  torso.add(part(new THREE.TorusGeometry(0.2, 0.07, 8, 16).rotateX(Math.PI / 2), M.scarf, 0, 0.72, 0));
  const tail = new THREE.Group();
  tail.position.set(0.1, 0.7, -0.18);
  tail.add(part(new THREE.BoxGeometry(0.13, 0.25, 0.04).translate(0, -0.12, 0), M.scarf));
  const tail2 = new THREE.Group();
  tail2.position.y = -0.24;
  tail2.add(part(new THREE.BoxGeometry(0.12, 0.28, 0.035).translate(0, -0.13, 0), M.scarf));
  tail.add(tail2);
  torso.add(tail);

  // Ailes de lumière (planeur), cachées par défaut.
  const wings = new THREE.Group();
  wings.position.set(0, 0.62, -0.2);
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(s * 0.9, 0.55, s * 1.7, 0.25);
    shape.quadraticCurveTo(s * 1.2, -0.05, s * 1.45, -0.35);
    shape.quadraticCurveTo(s * 0.7, -0.2, 0, -0.15);
    const w = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), M.wing);
    w.rotation.y = s * 0.25;
    wings.add(w);
  }
  wings.scale.setScalar(0.001);
  torso.add(wings);

  const head = new THREE.Group();
  head.position.y = 0.98;
  torso.add(head);
  head.add(part(new THREE.SphereGeometry(0.23, 18, 14), M.skin));
  const hood = part(new THREE.SphereGeometry(0.255, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M.scarf, 0, 0.02, -0.02);
  hood.rotation.x = -0.35;
  head.add(hood);
  head.add(part(new THREE.SphereGeometry(0.035, 8, 6), M.eye, -0.08, 0.02, 0.205));
  head.add(part(new THREE.SphereGeometry(0.035, 8, 6), M.eye, 0.08, 0.02, 0.205));
  head.add(part(new THREE.SphereGeometry(0.03, 6, 5), mat(0xe8a882), 0, -0.04, 0.225));

  // Bras : épaule -> avant-bras (coude)
  const mkArm = (side) => {
    const sh = new THREE.Group();
    sh.position.set(side * 0.36, 0.6, 0);
    sh.add(part(new THREE.CapsuleGeometry(0.075, 0.17, 4, 8).translate(0, -0.13, 0), M.tunic));
    const fore = new THREE.Group();
    fore.position.y = -0.28;
    fore.add(part(new THREE.CapsuleGeometry(0.068, 0.15, 4, 8).translate(0, -0.11, 0), M.tunic));
    fore.add(part(new THREE.SphereGeometry(0.072, 8, 6), M.skin, 0, -0.25, 0));
    sh.add(fore);
    torso.add(sh);
    return { sh, fore };
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  const staff = new THREE.Group();
  staff.position.set(0, -0.25, 0.02);
  staff.add(part(new THREE.CylinderGeometry(0.025, 0.03, 1.5, 6).translate(0, 0.15, 0), M.wood));
  const gem = part(new THREE.OctahedronGeometry(0.09, 0), M.crystal, 0, 0.95, 0);
  gem.castShadow = false;
  staff.add(gem);
  staff.rotation.x = Math.PI / 2 - 0.25;
  armR.fore.add(staff);

  // Jambes : hanche -> tibia (genou) -> botte
  const mkLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.13, 0, 0);
    hip.add(part(new THREE.CapsuleGeometry(0.095, 0.26, 4, 8).translate(0, -0.2, 0), M.pants));
    const shin = new THREE.Group();
    shin.position.y = -0.43;
    shin.add(part(new THREE.CapsuleGeometry(0.085, 0.24, 4, 8).translate(0, -0.18, 0), M.pants));
    shin.add(part(new THREE.BoxGeometry(0.17, 0.13, 0.28).translate(0, -0.42, 0.04), M.boots));
    hip.add(shin);
    hips.add(hip);
    return { hip, shin };
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  return { root, hips, torso, head, armL, armR, legL, legR, staff, gem, tail, tail2, wings, crystalMat: M.crystal, mats: M };
}

const WALK = 5.2;
const RUN = 11;

export class Player {
  constructor() {
    this.model = buildModel();
    this.object = this.model.root;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.radius = 0.4;

    this.baseMaxHealth = 100;
    this.baseMaxStamina = 100;
    this.maxHealth = 100;
    this.health = 100;
    this.maxStamina = 100;
    this.stamina = 100;
    this.staminaLock = 0;
    this.lastDamage = -99;
    this.invuln = 0;
    this.alive = true;

    // Compétences de déplacement (débloquées par l'histoire).
    this.abilities = { dash: false, doubleJump: false, glide: false, slam: false, tripleJump: false, waterWalk: false, secondWind: false };
    this.shieldT = 0;
    this.regen = 2.5;
    this.meleeDmg = 1;
    this.speedMul = 1; // butin « Plume de vent »
    this.wardCharges = 0; // butin « Fiole de garde »
    this.slamming = false;
    this.diffDmg = 1;

    this.onGround = false;
    this.swimming = false;
    this.wasSwimming = false;
    this.running = false;
    this.runBlend = 0;
    this.speed2D = 0;
    this.airTime = 0;
    this.minAirVy = 0;
    this.lastGround = 0;
    this.jumpBuffer = 0;
    this.airJumps = 0;
    this.airDashUsed = false;
    this.gliding = false;
    this.glideBlend = 0;
    this.dashT = 0;
    this.dashDir = new THREE.Vector3();
    this.turnRate = 0;
    this.roll = 0;
    this.landDip = 0;
    this.flipT = 9;
    this.visY = 0;
    this.accelLean = 0;
    this.prevSpeed = 0;

    this.attackT = -1;
    this.attackCooldown = 0;
    this.attackHitDone = false;
    this.phase = 0;
    this.lastStepSign = 1;

    this.lantern = new THREE.PointLight(0x7fe8ff, 0, 14, 1.6);
    this.lantern.position.set(0, 0.95, 0);
    this.model.staff.add(this.lantern);

    this.events = [];
  }

  // Tenue propre à chaque héros.
  setOutfit(tunic, scarf, pants) {
    const M = this.model.mats;
    M.tunic.color.set(tunic);
    M.tunicDark.color.set(tunic).multiplyScalar(0.7);
    M.scarf.color.set(scarf);
    M.pants.color.set(pants);
  }

  spawn(p) {
    this.pos.copy(p).add(new THREE.Vector3(0, 1.5, 0));
    this.vel.set(0, 0, 0);
    this.visY = this.pos.y;
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.alive = true;
    this.dashT = 0;
    this.gliding = false;
    this.slamming = false;
    this.shieldT = 0;
    this.invuln = 1;
    this.object.visible = true;
  }

  damage(amount, from) {
    if (this.invuln > 0 || !this.alive) return false;
    // Fiole de garde (butin) : absorbe les prochains coups ennemis.
    if (from && this.wardCharges > 0) {
      this.wardCharges--;
      this.invuln = 0.35;
      this.events.push({ type: 'ward', left: this.wardCharges });
      return false;
    }
    // « Bouclier divin » : 2 attaques ennemies sur 3 ratent (pas les chutes).
    if (from && this.divineShield && Math.random() < 2 / 3) {
      this.invuln = 0.25;
      this.events.push({ type: 'dodge' });
      return false;
    }
    if (this.shieldT > 0) {
      this.invuln = 0.3;
      this.events.push({ type: 'shieldHit' });
      return false;
    }
    this.health = Math.max(this.health - amount, 0);
    this.lastDamage = performance.now() / 1000;
    this.invuln = 0.6;
    if (from) {
      const push = new THREE.Vector3(this.pos.x - from.x, 0, this.pos.z - from.z).normalize().multiplyScalar(9);
      this.vel.x += push.x; this.vel.z += push.z;
      this.vel.y = Math.max(this.vel.y, 5);
      this.onGround = false;
    }
    this.events.push({ type: 'hurt', amount });
    if (this.health <= 0) { this.alive = false; this.events.push({ type: 'death' }); }
    return true;
  }

  startAttack() {
    if (!this.alive || this.dashT > 0) return false;
    // Frappe céleste : plongeon depuis les airs.
    if (this.abilities.slam && !this.onGround && !this.swimming && this.airTime > 0.15 && !this.slamming) {
      this.slamming = true;
      this.vel.y = -34;
      this.vel.x *= 0.3; this.vel.z *= 0.3;
      this.minAirVy = 0;
      this.gliding = false;
      this.events.push({ type: 'slamStart' });
      return true;
    }
    if (this.attackCooldown > 0) return false;
    this.attackT = 0;
    this.attackCooldown = 0.55;
    this.attackHitDone = false;
    this.events.push({ type: 'swing' });
    return true;
  }

  // Ruée : appelée par le système de compétences. dir = direction voulue (ou null).
  startDash(dir) {
    if (!this.alive || this.swimming || this.dashT > 0) return false;
    if (!this.onGround && this.airDashUsed) return false;
    if (this.stamina < 15) return false;
    this.stamina -= 22;
    if (!dir || dir.lengthSq() < 0.01) dir = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    this.dashDir.copy(dir).setY(0).normalize();
    this.dashT = 0.22;
    this.invuln = Math.max(this.invuln, 0.28);
    if (!this.onGround) this.airDashUsed = true;
    this.facing = Math.atan2(this.dashDir.x, this.dashDir.z);
    this.events.push({ type: 'dash' });
    return true;
  }

  update(dt, input, cam, world) {
    const { terrain, vegetation, water, elapsed, night } = world;
    const now = performance.now() / 1000;
    this.invuln = Math.max(this.invuln - dt, 0);
    this.attackCooldown = Math.max(this.attackCooldown - dt, 0);
    this.jumpBuffer = Math.max(this.jumpBuffer - dt, 0);

    const axis = this.alive ? input.moveAxis() : { x: 0, y: 0 };
    const { fwd, right } = cam.basis();
    const wish = new THREE.Vector3().addScaledVector(fwd, axis.y).addScaledVector(right, axis.x);
    const inputMag = Math.min(wish.length(), 1);
    const moving = inputMag > 0.08;
    if (moving) wish.normalize();
    this.wish = wish;

    const ground = terrain.heightAt(this.pos.x, this.pos.z);
    const surface = water.surfaceAt(this.pos.x, this.pos.z, elapsed);
    const deep = surface - ground > 1.25;
    // Pas sur l'eau : en courant, la surface porte.
    this.onWater = this.abilities.waterWalk && deep && input.down('ShiftLeft', 'ShiftRight') && this.stamina > 0 && this.pos.y > surface - 0.6 && this.alive;
    this.swimming = deep && this.pos.y < surface - 0.35 && !this.onWater;

    const wantRun = input.down('ShiftLeft', 'ShiftRight') && moving && this.staminaLock <= 0;
    this.running = wantRun && this.stamina > 0;
    // Transition marche -> course progressive (pas de saut de vitesse).
    this.runBlend = damp(this.runBlend, this.running ? 1 : 0, this.running ? 4 : 5, dt);

    // ── Vitesse au sol : on tourne le vecteur vitesse au lieu de le remplacer ──
    let maxSpeed = (this.swimming ? lerp(3.4, 5.6, this.runBlend) : lerp(WALK, RUN, this.runBlend)) * (this.speedMul || 1);
    if (this.onGround && moving && !this.swimming) {
      // Plus lent en montée, un peu plus rapide en descente.
      const ahead = terrain.heightAt(this.pos.x + wish.x * 1.2, this.pos.z + wish.z * 1.2);
      maxSpeed *= clamp(1 - (ahead - ground) * 0.28, 0.62, 1.12);
    }
    const hv = new THREE.Vector2(this.vel.x, this.vel.z);
    let speed = hv.length();
    let dir = speed > 0.01 ? hv.divideScalar(speed) : new THREE.Vector2(Math.sin(this.facing), Math.cos(this.facing));

    if (this.dashT > 0) {
      this.dashT -= dt;
      const k = clamp(this.dashT / 0.22, 0, 1);
      speed = lerp(RUN * 1.05, 30, k);
      dir.set(this.dashDir.x, this.dashDir.z);
      this.vel.y = Math.max(this.vel.y, 0);
      if (Math.random() < 0.9) this.events.push({ type: 'dashTrail' });
    } else {
      const grounded = this.onGround && !this.swimming;
      const turnSpeed = this.swimming ? 4 : grounded ? lerp(13, 7.5, clamp(speed / RUN, 0, 1)) : this.gliding ? 2.2 : 3.2;
      const accel = this.swimming ? 7 : grounded ? lerp(26, 18, this.runBlend) : this.gliding ? 5 : 7;
      const decel = this.swimming ? 6 : grounded ? 32 : 2.5;
      const target = moving ? maxSpeed * inputMag : 0;
      if (moving) {
        const want = new THREE.Vector2(wish.x, wish.z);
        if (speed < 0.4) dir.copy(want);
        else {
          const cur = Math.atan2(dir.x, dir.y);
          const goal = Math.atan2(want.x, want.y);
          let diff = wrapAngle(goal - cur);
          // Demi-tour sec : freinage rapide puis repart.
          if (grounded && Math.abs(diff) > 2.5) {
            speed = Math.max(speed - decel * 1.4 * dt, 0);
            if (speed < 1.5) dir.copy(want);
          } else {
            const step = turnSpeed * dt;
            diff = clamp(diff, -step, step);
            const a = cur + diff;
            dir.set(Math.sin(a), Math.cos(a));
          }
        }
      }
      if (speed < target) speed = Math.min(target, speed + accel * dt);
      else speed = Math.max(target, speed - decel * dt);
    }
    this.vel.x = dir.x * speed;
    this.vel.z = dir.y * speed;

    // Pentes raides : on glisse.
    const n = terrain.normalAt(this.pos.x, this.pos.z);
    if (this.onGround && !this.swimming && n.y < 0.66) {
      this.vel.x += n.x * 28 * dt;
      this.vel.z += n.z * 28 * dt;
    }

    // ── Vertical : saut (tampon + coyote), double saut, planeur, nage ──
    const jumpPressed = this.alive && input.hit('Space');
    if (jumpPressed) this.jumpBuffer = 0.13;
    const canGroundJump = this.onGround || now - this.lastGround < 0.12;
    this.gliding = false;

    if (this.swimming) {
      const targetY = surface - 1.05;
      this.vel.y = lerp(this.vel.y, (targetY - this.pos.y) * 4, 1 - Math.exp(-6 * dt));
      if (jumpPressed) this.vel.y = 7.5;
      this.onGround = false;
      this.airJumps = 0;
    } else if (this.dashT <= 0) {
      if (this.jumpBuffer > 0 && canGroundJump && this.vel.y <= 4) {
        this.vel.y = 11;
        this.onGround = false;
        this.lastGround = -1;
        this.jumpBuffer = 0;
        this.stamina = Math.max(this.stamina - 5, 0);
        this.events.push({ type: 'jump' });
      } else if (jumpPressed && !this.onGround && this.abilities.doubleJump && this.airJumps < (this.abilities.tripleJump ? 2 : 1) && this.airTime > 0.08 && !this.slamming) {
        this.vel.y = 10.5;
        this.airJumps++;
        this.jumpBuffer = 0;
        this.minAirVy = 0;
        this.stamina = Math.max(this.stamina - 8, 0);
        this.flipT = 0;
        this.events.push({ type: 'doubleJump' });
      }
      const holdJump = input.down('Space');
      if (this.slamming) {
        this.vel.y = Math.min(this.vel.y, -34);
      } else if (!this.onGround && this.abilities.glide && holdJump && this.vel.y < -1 && this.stamina > 0 && this.alive) {
        this.gliding = true;
        this.vel.y = damp(this.vel.y, -2.2, 8, dt);
        this.minAirVy = 0; // pas de dégâts de chute en planant
        this.stamina -= 5 * dt;
        // Le planeur porte vers l'avant.
        const hs = Math.hypot(this.vel.x, this.vel.z);
        const g = Math.max(hs, 12.5);
        const fx = moving ? this.vel.x / (hs || 1) : Math.sin(this.facing);
        const fz = moving ? this.vel.z / (hs || 1) : Math.cos(this.facing);
        this.vel.x = damp(this.vel.x, fx * g, 2, dt);
        this.vel.z = damp(this.vel.z, fz * g, 2, dt);
      } else {
        this.vel.y -= 30 * dt;
      }
    }

    this.pos.addScaledVector(this.vel, dt);

    const lim = WORLD_SIZE / 2 - 8;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);
    vegetation.resolve(this.pos, this.radius);

    let gNew = terrain.heightAt(this.pos.x, this.pos.z);
    if (this.onWater) gNew = Math.max(gNew, water.surfaceAt(this.pos.x, this.pos.z, elapsed));
    if (this.pos.y <= gNew) {
      if (this.slamming) {
        this.slamming = false;
        this.minAirVy = 0;
        this.landDip = 0.35;
        this.events.push({ type: 'slamLand', pos: new THREE.Vector3(this.pos.x, gNew, this.pos.z) });
      }
      if (!this.onGround && !this.swimming) {
        const impact = -this.minAirVy;
        if (impact > 21) this.damage((impact - 21) * 4.5 * this.diffDmg);
        if (this.airTime > 0.2) {
          this.events.push({ type: 'land', impact });
          this.landDip = clamp(impact / 40, 0.05, 0.32);
        }
      }
      this.pos.y = gNew;
      this.vel.y = Math.max(this.vel.y, 0);
      this.onGround = true;
      this.airTime = 0;
      this.minAirVy = 0;
      this.airJumps = 0;
      this.airDashUsed = false;
      this.lastGround = now;
    } else if (!this.swimming) {
      if (this.onGround && this.pos.y - gNew < 0.7 && this.vel.y <= 0) {
        this.pos.y = gNew; // colle au sol en descente
        this.lastGround = now;
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

    // ── Endurance et vie ──
    const sw = this.abilities.secondWind;
    if (this.running) this.stamina -= (this.swimming ? 14 : this.onWater ? 16 : 13) * (sw ? 0.6 : 1) * dt;
    else if (this.swimming) this.stamina -= 3.5 * dt;
    else if (!this.gliding && this.dashT <= 0) this.stamina += (moving ? 18 : 28) * (sw ? 1.5 : 1) * dt;
    if (this.stamina <= 0) {
      this.stamina = 0;
      if (!this.swimming) this.staminaLock = 1.2;
    }
    this.staminaLock = Math.max(this.staminaLock - dt, 0);
    this.stamina = Math.min(this.stamina, this.maxStamina);
    if (this.swimming && this.stamina <= 0) {
      this.health -= 7 * dt;
      this.lastDamage = now;
      if (this.health <= 0 && this.alive) { this.health = 0; this.alive = false; this.events.push({ type: 'death' }); }
    }
    if (this.alive && now - this.lastDamage > 6) this.health = Math.min(this.health + this.regen * dt, this.maxHealth);

    this.speed2D = Math.hypot(this.vel.x, this.vel.z);

    // ── Orientation (vitesse angulaire gardée pour le roulis) ──
    let targetFacing = this.facing;
    if (this.attackT >= 0) targetFacing = Math.atan2(fwd.x, fwd.z);
    else if (this.speed2D > 0.4) targetFacing = Math.atan2(this.vel.x, this.vel.z);
    const d = wrapAngle(targetFacing - this.facing);
    const prev = this.facing;
    this.facing = wrapAngle(this.facing + d * (1 - Math.exp(-dt * (this.dashT > 0 ? 30 : 12))));
    this.turnRate = damp(this.turnRate, wrapAngle(this.facing - prev) / Math.max(dt, 1e-4), 10, dt);

    // Accélération -> inclinaison avant/arrière.
    const acc = (this.speed2D - this.prevSpeed) / Math.max(dt, 1e-4);
    this.prevSpeed = this.speed2D;
    this.accelLean = damp(this.accelLean, clamp(acc * 0.012, -0.25, 0.2), 6, dt);

    // ── Attaque ──
    let hitNow = false;
    if (this.attackT >= 0) {
      this.attackT += dt;
      if (!this.attackHitDone && this.attackT > 0.14) { this.attackHitDone = true; hitNow = true; }
      if (this.attackT > 0.42) this.attackT = -1;
    }

    this.lantern.intensity = lerp(this.lantern.intensity, night > 0.5 ? 6 : 0, 1 - Math.exp(-dt * 2));
    this.model.crystalMat.emissiveIntensity = 1.6 + Math.sin(elapsed * 3) * 0.4 + (this.attackT >= 0 || this.dashT > 0 ? 3 : 0) + (this.flash || 0);
    this.flash = Math.max((this.flash || 0) - dt * 6, 0);

    this._animate(dt, elapsed, moving);
    return { hitNow };
  }

  attackPoint() {
    return new THREE.Vector3(this.pos.x + Math.sin(this.facing) * 1.6, this.pos.y + 1, this.pos.z + Math.cos(this.facing) * 1.6);
  }

  staffTip(out = new THREE.Vector3()) {
    return this.model.gem.getWorldPosition(out);
  }

  // ─── Animation procédurale ─────────────────────────────────────────
  _animate(dt, t, moving) {
    const M = this.model;
    const o = this.object;
    const D = (cur, target, rate = 14) => damp(cur, target, rate, dt);

    // Lissage vertical visuel : efface les marches du maillage.
    this.visY = this.onGround && !this.swimming ? D(this.visY, this.pos.y, 22) : this.pos.y;
    if (Math.abs(this.visY - this.pos.y) > 1.5) this.visY = this.pos.y;
    o.position.set(this.pos.x, this.visY, this.pos.z);
    o.rotation.y = this.facing;
    o.visible = this.alive && (this.invuln <= 0 || this.dashT > 0 || Math.floor(t * 20) % 2 === 0);

    const sp = this.speed2D;
    const rb = this.runBlend;
    const grounded = this.onGround && !this.swimming;

    // Phase pilotée par la distance parcourue : les pieds ne glissent pas.
    // Un cycle = deux pas. Foulée plus longue en courant.
    const stride = lerp(1.3, 2.5, rb);
    if (grounded) this.phase += (sp * dt / stride) * Math.PI * 2;
    else if (this.swimming) this.phase += dt * 4;
    const ph = this.phase;
    const s = Math.sin(ph), c = Math.cos(ph);

    // Pas : passage par zéro -> évènement (poussière, son).
    const sign = s >= 0 ? 1 : -1;
    if (grounded && sp > 2 && sign !== this.lastStepSign) this.events.push({ type: 'step', run: rb > 0.5, speed: sp });
    this.lastStepSign = sign;

    const g = grounded ? clamp(sp / WALK, 0, 1) : 0; // intensité de la marche
    const ampLeg = lerp(0.5, 0.95, rb) * g;
    const ampArm = lerp(0.42, 0.95, rb) * g;
    const knee = lerp(0.55, 1.6, rb) * g;
    const elbow = lerp(0.3, 1.35, rb);

    let thighL = -s * ampLeg, thighR = s * ampLeg;
    let kneeL = 0.08 + knee * Math.max(0, c) ** 1.4 + (rb * 0.35 * Math.max(0, s)) * g;
    let kneeR = 0.08 + knee * Math.max(0, -c) ** 1.4 + (rb * 0.35 * Math.max(0, -s)) * g;
    let armL = s * ampArm, armR = -s * ampArm;
    let elbowL = -lerp(0.18, elbow, g), elbowR = -lerp(0.25, elbow, g);
    let armLz = 0.1, armRz = -0.1;

    // Rebond : haut en milieu d'appui en marche, en phase de vol en course.
    const bobWalk = (1 - Math.abs(s)) * 0.05 - 0.02;
    const bobRun = Math.abs(s) * 0.11 - 0.06;
    let bob = lerp(bobWalk, bobRun, rb) * g;

    let lean = lerp(0.06, 0.32, rb) * g + this.accelLean;
    let twistHips = s * lerp(0.1, 0.16, rb) * g;
    let twistTorso = -s * lerp(0.16, 0.28, rb) * g;
    let swayHips = s * 0.05 * g * (1 - rb);
    let tilt = 0;
    let headPitch = 0;
    let wingScale = 0;

    // Roulis dans les virages (proportionnel à la vitesse).
    const rollTarget = grounded ? clamp(-this.turnRate * sp * 0.022, -0.32, 0.32) : clamp(-this.turnRate * sp * 0.012, -0.25, 0.25);
    this.roll = D(this.roll, rollTarget, 8);

    if (!moving && grounded && sp < 0.6) {
      // Respiration + coup d'œil autour.
      bob = Math.sin(t * 2) * 0.012;
      armLz = 0.12 + Math.sin(t * 2) * 0.02;
      armRz = -0.12 - Math.sin(t * 2) * 0.02;
      twistTorso = Math.sin(t * 0.4) * 0.06;
    }

    if (!grounded && !this.swimming) {
      const up = clamp(this.vel.y / 10, -1, 1);
      thighL = -0.7 + up * 0.2; thighR = 0.15;
      kneeL = 1.2; kneeR = 0.5 + Math.max(0, -up) * 0.4;
      armL = -0.5 - up * 0.4; armR = -0.3;
      elbowL = -0.6; elbowR = -0.8;
      armLz = 0.5 + Math.max(0, -up) * 0.4; armRz = -0.5 - Math.max(0, -up) * 0.4;
      lean = 0.1 + this.accelLean;
      bob = 0;
      if (this.flipT < 0.5) { kneeL = kneeR = 1.7; thighL = thighR = -1.3; }
    }
    if (this.gliding) {
      wingScale = 1;
      lean = 0.55;
      armL = -0.2; armR = -0.2; armLz = 1.35; armRz = -1.35; elbowL = elbowR = -0.1;
      thighL = 0.25; thighR = 0.15; kneeL = 0.3; kneeR = 0.4;
      headPitch = -0.45;
    }
    if (this.slamming) {
      lean = 0.9; headPitch = -0.6;
      armL = -2.6; armR = -2.6; elbowL = elbowR = -0.2; armLz = 0.3; armRz = -0.3;
      thighL = thighR = -0.6; kneeL = kneeR = 1.2;
    }
    if (this.dashT > 0) {
      lean = 0.75;
      armL = 1.1; armR = 1.1; elbowL = elbowR = -0.2; armLz = 0.25; armRz = -0.25;
      thighL = -0.9; thighR = 0.6; kneeL = 1.3; kneeR = 0.9;
      headPitch = -0.5;
    }
    if (this.swimming) {
      lean = 0.1;
      tilt = 1.25;
      armL = Math.sin(ph) * 1.6 - 1.5;
      armR = Math.sin(ph + Math.PI) * 1.6 - 1.5;
      elbowL = elbowR = -0.3;
      thighL = Math.sin(ph * 2) * 0.4; thighR = -thighL;
      kneeL = kneeR = 0.3;
      bob = 0.05 + Math.sin(t * 2.5) * 0.04;
      twistHips = twistTorso = swayHips = 0;
      headPitch = -1.1;
    }
    if (this.attackT >= 0) {
      const a = this.attackT / 0.42;
      armR = a < 0.3 ? lerp(0, -2.6, a / 0.3) : lerp(-2.6, 0.6, Math.min((a - 0.3) / 0.4, 1));
      elbowR = a < 0.3 ? -0.4 : -0.1;
      armRz = -0.3;
    }

    // Réception : flexion qui se relâche.
    this.landDip = D(this.landDip, 0, 7);
    if (this.landDip > 0.01) { kneeL += this.landDip * 3; kneeR += this.landDip * 3; thighL -= this.landDip * 1.5; thighR -= this.landDip * 1.5; }

    const fast = this.dashT > 0 ? 30 : 18;
    M.legL.hip.rotation.x = D(M.legL.hip.rotation.x, thighL, fast);
    M.legR.hip.rotation.x = D(M.legR.hip.rotation.x, thighR, fast);
    M.legL.shin.rotation.x = D(M.legL.shin.rotation.x, kneeL, fast);
    M.legR.shin.rotation.x = D(M.legR.shin.rotation.x, kneeR, fast);
    M.armL.sh.rotation.x = D(M.armL.sh.rotation.x, armL, 16);
    M.armR.sh.rotation.x = this.attackT >= 0 ? armR : D(M.armR.sh.rotation.x, armR, 16);
    M.armL.fore.rotation.x = D(M.armL.fore.rotation.x, elbowL, 14);
    M.armR.fore.rotation.x = D(M.armR.fore.rotation.x, elbowR, 14);
    M.armL.sh.rotation.z = D(M.armL.sh.rotation.z, armLz, 12);
    M.armR.sh.rotation.z = D(M.armR.sh.rotation.z, armRz, 12);
    // Le bâton reste à peu près horizontal malgré le coude.
    M.staff.rotation.x = Math.PI / 2 - 0.25 + M.armR.fore.rotation.x * -0.55;

    M.torso.rotation.x = D(M.torso.rotation.x, lean, 9);
    M.torso.rotation.y = D(M.torso.rotation.y, twistTorso, 12);
    M.hips.rotation.y = D(M.hips.rotation.y, twistHips, 12);
    M.hips.rotation.z = D(M.hips.rotation.z, swayHips, 12);
    // Salto du double saut : rotation directe, pas de lissage.
    this.flipT += dt;
    if (this.flipT < 0.5 && !grounded) {
      const f = this.flipT / 0.5;
      M.hips.rotation.x = (1 - (1 - f) ** 3) * Math.PI * 2;
    } else {
      M.hips.rotation.x = D(wrapAngle(M.hips.rotation.x), tilt, 8);
    }
    M.hips.position.y = D(M.hips.position.y, 0.92 + bob - this.landDip * 0.5 - (this.dashT > 0 ? 0.15 : 0), 22);
    M.head.rotation.x = D(M.head.rotation.x, headPitch - M.torso.rotation.x * 0.55, 10);
    M.head.rotation.y = D(M.head.rotation.y, -M.torso.rotation.y * 0.7 + (!moving && grounded ? Math.sin(t * 0.3) * 0.35 : 0), 6);
    o.rotation.z = this.roll;

    // Foulard qui flotte selon la vitesse.
    const flow = clamp((sp + Math.max(-this.vel.y, 0)) / 9, 0, 1.4);
    M.tail.rotation.x = D(M.tail.rotation.x, 0.25 + flow * 1.1 + Math.sin(t * 11) * 0.1 * flow, 10);
    M.tail2.rotation.x = D(M.tail2.rotation.x, flow * 0.5 + Math.sin(t * 13 + 1) * 0.25 * flow, 10);

    const ws = D(M.wings.scale.x, wingScale, wingScale ? 10 : 6);
    M.wings.scale.setScalar(Math.max(ws, 0.001));
    M.wings.visible = ws > 0.01;
    if (M.wings.visible) M.wings.children.forEach((w, i) => { w.rotation.x = Math.sin(t * 6 + i) * 0.08; });
  }
}

export { SEA_LEVEL };
