import * as THREE from 'three';
import { clamp } from '../core/noise.js';

// Compétences d'Ilo. Débloquées par les éclats de mémoire (voir story.js).
export const SKILLS = {
  dash: { name: 'Ruée', key: 'E', short: 'E', icon: '➶', desc: 'Bond fulgurant dans la direction choisie. Invulnérable pendant la ruée. Marche aussi en l\'air.', cd: 1.1 },
  doubleJump: { name: 'Double saut', key: 'Espace ×2', short: '␣␣', icon: '⇈', desc: 'Un second saut en plein vol, avec salto.', passive: true },
  bolt: { name: 'Éclat', key: 'Clic droit / R', short: 'R', icon: '✦', desc: 'Lance un éclat de cristal là où vise la caméra.', cd: 0.8 },
  glide: { name: 'Planeur', key: 'Maintenir Espace', short: '␣…', icon: '🜁', desc: 'En chute, maintiens Espace pour déployer des ailes de lumière et planer. Plus de dégâts de chute.', passive: true },
  nova: { name: 'Onde', key: 'C', short: 'C', icon: '◎', desc: 'Onde de choc autour de toi : repousse et blesse tous les Échos proches.', cd: 7 },
};
export const SKILL_ORDER = ['dash', 'doubleJump', 'bolt', 'glide', 'nova'];

// Améliorations données par les éclats une fois toutes les compétences acquises.
export const UPGRADES = [
  { id: 'hp', label: '+20 vie max' },
  { id: 'st', label: '+20 endurance max' },
  { id: 'cd', label: 'Recharges −15 %' },
  { id: 'bolt', label: 'Éclat : +1 dégât' },
  { id: 'nova', label: 'Onde : rayon +25 %' },
];

const boltGeo = new THREE.OctahedronGeometry(0.22, 0);
const boltMat = new THREE.MeshBasicMaterial({ color: 0xbffaff });

export class SkillSystem {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.unlocked = new Set();
    this.upgrades = { hp: 0, st: 0, cd: 0, bolt: 0, nova: 0 };
    this.cooldowns = { dash: 0, bolt: 0, nova: 0 };
    this.bolts = [];
    this.events = [];

    // Anneau de l'onde de choc, réutilisé.
    this.novaUniforms = { uT: { value: 1 }, uColor: { value: new THREE.Color(0x7ff0ff) } };
    this.novaMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 1, 64, 1).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: this.novaUniforms,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `
          uniform float uT; uniform vec3 uColor; varying vec2 vUv;
          void main(){
            float r = length(vUv - 0.5) * 2.0;
            float band = smoothstep(0.55, 0.95, r) * smoothstep(1.0, 0.92, r);
            gl_FragColor = vec4(uColor * 2.0, band * (1.0 - uT));
          }`,
      })
    );
    this.novaMesh.visible = false;
    this.novaMesh.renderOrder = 6;
    this.novaMesh.frustumCulled = false;
    scene.add(this.novaMesh);
    this.novaT = 1;
    this.novaCenter = new THREE.Vector3();
    this.novaRadius = 7;
  }

  has(id) { return this.unlocked.has(id); }

  unlock(id, player) {
    this.unlocked.add(id);
    this.apply(player);
  }

  upgrade(id, player) {
    this.upgrades[id] = (this.upgrades[id] || 0) + 1;
    this.apply(player);
  }

  apply(player) {
    player.abilities.dash = this.has('dash');
    player.abilities.doubleJump = this.has('doubleJump');
    player.abilities.glide = this.has('glide');
    const hp = player.baseMaxHealth + this.upgrades.hp * 20;
    if (hp !== player.maxHealth) { player.health += hp - player.maxHealth; player.maxHealth = hp; }
    player.maxStamina = player.baseMaxStamina + this.upgrades.st * 20;
  }

  get cdMult() { return Math.pow(0.85, this.upgrades.cd); }

  serialize() { return { unlocked: [...this.unlocked], upgrades: { ...this.upgrades } }; }
  load(data, player) {
    this.unlocked = new Set(data?.unlocked || []);
    this.upgrades = { hp: 0, st: 0, cd: 0, bolt: 0, nova: 0, ...(data?.upgrades || {}) };
    this.cooldowns = { dash: 0, bolt: 0, nova: 0 };
    this.apply(player);
  }
  reset(player) { this.load(null, player); }

  // Fraction de recharge restante (0 = prêt) pour l'interface.
  cooldownFrac(id) {
    const def = SKILLS[id];
    if (!def.cd) return 0;
    return clamp(this.cooldowns[id] / (def.cd * this.cdMult), 0, 1);
  }

  update(dt, ctx) {
    const { input, player, cam, camera, terrain, slimes, enabled } = ctx;
    for (const k in this.cooldowns) this.cooldowns[k] = Math.max(this.cooldowns[k] - dt, 0);

    if (enabled && player.alive) {
      // Ruée
      if (this.has('dash') && input.hit('KeyE') && this.cooldowns.dash <= 0) {
        const w = player.wish && player.wish.lengthSq() > 0.01 ? player.wish.clone() : null;
        if (player.startDash(w)) this.cooldowns.dash = SKILLS.dash.cd * this.cdMult;
        else this.events.push({ type: 'fail', id: 'dash' });
      }
      // Éclat
      if (this.has('bolt') && (input.hit('KeyR') || input.hit('Mouse2')) && this.cooldowns.bolt <= 0) {
        this._fireBolt(player, cam, camera, terrain, slimes);
        this.cooldowns.bolt = SKILLS.bolt.cd * this.cdMult;
      }
      // Onde
      if (this.has('nova') && input.hit('KeyC') && this.cooldowns.nova <= 0) {
        this._nova(player, slimes);
        this.cooldowns.nova = SKILLS.nova.cd * this.cdMult;
      }
    }

    // Projectiles
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      if (b.lock && b.lock.dying < 0) {
        const want = b.lock.pos.clone().add(new THREE.Vector3(0, 0.45 * b.lock.T.scale, 0)).sub(b.mesh.position).normalize().multiplyScalar(42);
        b.vel.lerp(want, 1 - Math.exp(-dt * 8));
      }
      b.mesh.lookAt(b.mesh.position.clone().add(b.vel));
      const step = b.vel.clone().multiplyScalar(dt);
      b.mesh.position.add(step);
      const p = b.mesh.position;
      this.particles.burst(p, 0x7ff0ff, 2, { speed: 0.6, up: 0.2, gravity: 0, size: 0.28, life: 0.35, spread: 0.1 });
      let hit = false;
      if (slimes.hitArea(p, 0.7, p.clone().sub(step), 1 + this.upgrades.bolt, 7) > 0) hit = true;
      if (!hit && p.y < terrain.heightAt(p.x, p.z) - 0.05) hit = true;
      if (hit || b.life <= 0) {
        this.particles.burst(p, 0xa8f7ff, 26, { speed: 5, up: 3, gravity: -6, size: 0.32, life: 0.7 });
        this.events.push({ type: 'boltHit', pos: p.clone() });
        this.scene.remove(b.mesh);
        this.bolts.splice(i, 1);
      }
    }

    // Anneau de l'onde
    if (this.novaT < 1) {
      this.novaT = Math.min(this.novaT + dt / 0.45, 1);
      const r = this.novaRadius * (1 - (1 - this.novaT) ** 3);
      this.novaMesh.scale.set(r, 1, r);
      this.novaMesh.position.copy(this.novaCenter);
      this.novaUniforms.uT.value = this.novaT;
      this.novaMesh.visible = this.novaT < 1;
    }
  }

  _fireBolt(player, cam, camera, terrain, slimes) {
    // Vise ce que regarde la caméra : marche le long du rayon jusqu'au relief.
    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    let target = origin.clone().addScaledVector(dir, 70);
    for (let d = 2; d < 70; d += 1.5) {
      const p = origin.clone().addScaledVector(dir, d);
      if (p.y < terrain.heightAt(p.x, p.z)) { target = p; break; }
    }
    // Visée assistée : l'Écho le plus proche de l'axe de visée (cône de ~25°).
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    let lock = null, bestScore = Infinity;
    for (const sl of slimes.list) {
      if (sl.dying >= 0) continue;
      const to = new THREE.Vector3(sl.pos.x - player.pos.x, 0, sl.pos.z - player.pos.z);
      const dist = to.length();
      if (dist > 40 || dist < 0.5) continue;
      const ang = Math.acos(clamp(to.divideScalar(dist).dot(flat), -1, 1));
      if (ang > 0.45) continue;
      const score = ang * 30 + dist;
      if (score < bestScore) { bestScore = score; lock = sl; }
    }
    if (lock) target = lock.pos.clone().add(new THREE.Vector3(0, 0.45 * lock.T.scale, 0));
    const start = player.pos.clone().add(new THREE.Vector3(Math.sin(player.facing) * 0.6, 1.35, Math.cos(player.facing) * 0.6));
    const v = target.sub(start);
    if (v.lengthSq() < 1) v.set(Math.sin(player.facing), 0, Math.cos(player.facing));
    v.normalize().multiplyScalar(42);
    const mesh = new THREE.Mesh(boltGeo, boltMat);
    mesh.position.copy(start);
    mesh.scale.set(1, 1, 1.8);
    this.scene.add(mesh);
    this.bolts.push({ mesh, vel: v, life: 1.6, lock });
    player.facing = Math.atan2(v.x, v.z);
    player.attackT = 0.3; // petit geste du bras
    player.attackHitDone = true;
    player.flash = 4;
    this.particles.burst(start, 0xbffaff, 12, { speed: 2, up: 1, gravity: 0, size: 0.3, life: 0.3 });
    this.events.push({ type: 'bolt' });
  }

  _nova(player, slimes) {
    this.novaRadius = 7 * (1 + this.upgrades.nova * 0.25);
    this.novaCenter.copy(player.pos).add(new THREE.Vector3(0, 0.3, 0));
    this.novaT = 0;
    this.novaMesh.visible = true;
    const hits = slimes.hitArea(player.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), this.novaRadius, player.pos, 1, 16);
    player.flash = 6;
    player.vel.y = Math.max(player.vel.y, 3);
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      const p = player.pos.clone().add(new THREE.Vector3(Math.cos(a) * 1.2, 0.4, Math.sin(a) * 1.2));
      this.particles.burst(p, 0x7ff0ff, 2, { speed: 9, up: 1.5, gravity: -2, size: 0.35, life: 0.6, spread: 0.2 });
    }
    this.events.push({ type: 'nova', hits });
  }

  clear() {
    for (const b of this.bolts) this.scene.remove(b.mesh);
    this.bolts = [];
    this.novaT = 1;
    this.novaMesh.visible = false;
  }
}
