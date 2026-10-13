import * as THREE from 'three';
import { clamp } from '../core/noise.js';

// Les 16 compétences. key = texte affiché, code = touche physique (e.code).
export const SKILLS = {
  dash: { name: 'Ruée', key: 'E', short: 'E', code: 'KeyE', icon: '➶', desc: 'Bond fulgurant dans la direction choisie. Invulnérable pendant la ruée. Marche aussi en l\'air.', cd: 1.1 },
  doubleJump: { name: 'Double saut', key: 'Espace ×2', short: '␣␣', icon: '⇈', desc: 'Un second saut en plein vol, avec salto.', passive: true },
  bolt: { name: 'Éclat', key: 'Clic droit / R', short: 'R', code: 'KeyR', icon: '✦', desc: 'Lance un éclat de cristal. Visée assistée vers l\'ennemi le plus proche du viseur.', cd: 0.8 },
  glide: { name: 'Planeur', key: 'Maintenir Espace', short: '␣…', icon: '🜁', desc: 'En chute, maintiens Espace pour planer. Plus de dégâts de chute.', passive: true },
  nova: { name: 'Onde', key: 'C', short: 'C', code: 'KeyC', icon: '◎', desc: 'Onde de choc autour de toi : repousse et blesse tous les ennemis proches.', cd: 7 },
  shield: { name: 'Bouclier', key: '1', short: '1', code: 'Digit1', icon: '⛉', desc: 'Une bulle de lumière absorbe tous les coups pendant 4 secondes.', cd: 14 },
  slam: { name: 'Frappe céleste', key: 'Clic en l\'air', short: '⤓', icon: '⤓', desc: 'En l\'air, frappe pour plonger : onde au sol qui blesse et repousse.', passive: true },
  heal: { name: 'Souffle', key: '2', short: '2', code: 'Digit2', icon: '✚', desc: 'Rend 40 % de la vie en 2 secondes.', cd: 22 },
  companion: { name: 'Compagnon', key: 'auto', short: '◈', icon: '◈', desc: 'Un petit esprit tourne autour de toi et tire sur les ennemis proches.', passive: true },
  lightning: { name: 'Foudre', key: '3', short: '3', code: 'Digit3', icon: 'ϟ', desc: 'Un éclair saute d\'ennemi en ennemi (jusqu\'à 5).', cd: 9 },
  tripleJump: { name: 'Triple saut', key: 'Espace ×3', short: '␣³', icon: '⇮', desc: 'Un troisième saut en plein vol.', passive: true },
  chrono: { name: 'Ralenti', key: '4', short: '4', code: 'Digit4', icon: '⧗', desc: 'Le temps ralentit pour tous les ennemis pendant 5 secondes.', cd: 24 },
  waterWalk: { name: 'Pas sur l\'eau', key: 'courir', short: '≈', icon: '≈', desc: 'En courant, tu cours sur l\'eau.', passive: true },
  roots: { name: 'Racines', key: '5', short: '5', code: 'Digit5', icon: '❦', desc: 'Des racines immobilisent les ennemis autour de toi pendant 3 secondes.', cd: 13 },
  magnet: { name: 'Aimant', key: 'auto', short: '⊛', icon: '⊛', desc: 'Les orbes de soin viennent à toi de loin.', passive: true },
  secondWind: { name: 'Second souffle', key: 'auto', short: '∞', icon: '∞', desc: 'Courir fatigue moins, l\'endurance revient plus vite.', passive: true },
};
export const SKILL_ORDER = ['dash', 'doubleJump', 'bolt', 'glide', 'nova', 'shield', 'slam', 'heal', 'companion', 'lightning', 'tripleJump', 'chrono', 'waterWalk', 'roots', 'magnet', 'secondWind'];

// Améliorations données par les éclats une fois les compétences du chapitre acquises.
export const UPGRADES = [
  { id: 'hp', label: '+20 vie max' },
  { id: 'st', label: '+20 endurance max' },
  { id: 'cd', label: 'Recharges −10 %' },
  { id: 'bolt', label: 'Éclat : +1 dégât' },
  { id: 'nova', label: 'Onde : rayon +20 %' },
  { id: 'melee', label: 'Bâton : +1 dégât' },
];

const boltGeo = new THREE.OctahedronGeometry(0.22, 0);
const boltMat = new THREE.MeshBasicMaterial({ color: 0xbffaff });
const compGeo = new THREE.OctahedronGeometry(0.18, 0);
const compMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });

export class SkillSystem {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.unlocked = new Set();
    this.upgrades = { hp: 0, st: 0, cd: 0, bolt: 0, nova: 0, melee: 0 };
    this.cooldowns = {};
    this.bolts = [];
    this.events = [];
    this.healT = 0;
    this.compCd = 0;

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

    // Bulle du bouclier
    this.shieldMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.25, 3),
      new THREE.MeshBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.shieldMesh.visible = false;
    scene.add(this.shieldMesh);

    // Compagnon
    this.compMesh = new THREE.Mesh(compGeo, compMat);
    this.compMesh.visible = false;
    scene.add(this.compMesh);

    // Éclairs : lignes réutilisées
    this.boltLines = [];
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
    for (const id of ['dash', 'doubleJump', 'glide', 'slam', 'tripleJump', 'waterWalk', 'secondWind']) player.abilities[id] = this.has(id);
    const hp = player.baseMaxHealth + this.upgrades.hp * 20 + (player.bonusHealth || 0);
    if (hp !== player.maxHealth) { player.health += Math.max(hp - player.maxHealth, 0); player.maxHealth = hp; player.health = Math.min(player.health, hp); }
    player.maxStamina = player.baseMaxStamina + this.upgrades.st * 20;
    player.meleeDmg = 1 + this.upgrades.melee;
  }

  get cdMult() { return Math.pow(0.9, this.upgrades.cd); }

  serialize() { return { unlocked: [...this.unlocked], upgrades: { ...this.upgrades } }; }
  load(data, player) {
    this.unlocked = new Set(data?.unlocked || []);
    this.upgrades = { hp: 0, st: 0, cd: 0, bolt: 0, nova: 0, melee: 0, ...(data?.upgrades || {}) };
    this.cooldowns = {};
    this.apply(player);
  }
  reset(player) { this.load(null, player); }

  // Fraction de recharge restante (0 = prêt) pour l'interface.
  cooldownFrac(id) {
    const def = SKILLS[id];
    if (!def.cd) return 0;
    return clamp((this.cooldowns[id] || 0) / (def.cd * this.cdMult), 0, 1);
  }

  _ready(id, input) {
    const def = SKILLS[id];
    return this.has(id) && (this.cooldowns[id] || 0) <= 0 && input.hit(def.code);
  }
  _use(id) { this.cooldowns[id] = SKILLS[id].cd * this.cdMult; }

  update(dt, ctx) {
    const { input, player, cam, camera, terrain, slimes, enabled, elapsed } = ctx;
    for (const k in this.cooldowns) this.cooldowns[k] = Math.max(this.cooldowns[k] - dt, 0);

    if (enabled && player.alive) {
      if (this._ready('dash', input)) {
        const w = player.wish && player.wish.lengthSq() > 0.01 ? player.wish.clone() : null;
        if (player.startDash(w)) this._use('dash');
      }
      if (this.has('bolt') && (this.cooldowns.bolt || 0) <= 0 && (input.hit('KeyR') || input.hit('Mouse2'))) {
        this._fireBolt(player, cam, camera, terrain, slimes);
        this._use('bolt');
      }
      if (this._ready('nova', input)) { this._nova(player, slimes); this._use('nova'); }
      if (this._ready('shield', input)) {
        player.shieldT = 4;
        this._use('shield');
        this.events.push({ type: 'shield' });
      }
      if (this._ready('heal', input)) {
        this.healT = 2;
        this._use('heal');
        this.events.push({ type: 'heal' });
      }
      if (this._ready('lightning', input)) {
        if (this._lightning(player, slimes)) this._use('lightning');
        else this.events.push({ type: 'fail' });
      }
      if (this._ready('chrono', input)) {
        slimes.slowAll(5);
        this._use('chrono');
        this.events.push({ type: 'chrono' });
      }
      if (this._ready('roots', input)) {
        slimes.rootArea(player.pos, 9, 3, 1);
        this._use('roots');
        this.events.push({ type: 'roots', pos: player.pos.clone() });
      }
    }

    // Soin progressif
    if (this.healT > 0) {
      this.healT -= dt;
      player.health = Math.min(player.health + player.maxHealth * 0.2 * dt, player.maxHealth);
      if (Math.random() < 0.5) this.particles.burst(player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.3, (Math.random() - 0.5) * 1.2)), 0x9dff9a, 1, { speed: 0.3, up: 3, gravity: 1, size: 0.3, life: 0.9, spread: 0 });
    }

    // Bouclier
    player.shieldT = Math.max((player.shieldT || 0) - dt, 0);
    this.shieldMesh.visible = player.shieldT > 0;
    if (this.shieldMesh.visible) {
      this.shieldMesh.position.copy(player.pos).add(new THREE.Vector3(0, 0.95, 0));
      this.shieldMesh.rotation.y += dt;
      this.shieldMesh.material.opacity = 0.14 + 0.06 * Math.sin(elapsed * 8) + (player.shieldT < 1 ? Math.abs(Math.sin(elapsed * 20)) * 0.1 : 0);
    }

    // Compagnon
    this.compMesh.visible = this.has('companion') && player.alive;
    if (this.compMesh.visible) {
      const a = elapsed * 2.2;
      this.compMesh.position.copy(player.pos).add(new THREE.Vector3(Math.cos(a) * 1.3, 2 + Math.sin(elapsed * 3) * 0.2, Math.sin(a) * 1.3));
      this.compMesh.rotation.y += dt * 4;
      this.compCd -= dt;
      if (this.compCd <= 0 && enabled) {
        const t = slimes.nearest(player.pos, 14);
        if (t) {
          this._spawnBolt(this.compMesh.position.clone(), t, 1, 0.7, 30);
          this.compCd = 1.3 * this.cdMult;
        } else this.compCd = 0.3;
      }
      if (Math.random() < 0.3) this.particles.burst(this.compMesh.position, 0xffe9a8, 1, { speed: 0.2, up: 0, gravity: 0, size: 0.15, life: 0.3, spread: 0 });
    }

    // Projectiles
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      if (b.lock && b.lock.dying < 0) {
        const want = b.lock.pos.clone().add(new THREE.Vector3(0, 0.45 * b.lock.T.scale, 0)).sub(b.mesh.position).normalize().multiplyScalar(b.speed);
        b.vel.lerp(want, 1 - Math.exp(-dt * 8));
      }
      b.mesh.lookAt(b.mesh.position.clone().add(b.vel));
      const step = b.vel.clone().multiplyScalar(dt);
      b.mesh.position.add(step);
      const p = b.mesh.position;
      this.particles.burst(p, b.color, 1, { speed: 0.5, up: 0.2, gravity: 0, size: 0.25 * b.scale, life: 0.3, spread: 0.1 });
      let hit = false;
      if (slimes.hitArea(p, 0.7, p.clone().sub(step), b.dmg, 7) > 0) hit = true;
      if (!hit && p.y < terrain.heightAt(p.x, p.z) - 0.05) hit = true;
      if (hit || b.life <= 0) {
        this.particles.burst(p, b.color, Math.round(26 * b.scale), { speed: 5, up: 3, gravity: -6, size: 0.32 * b.scale, life: 0.7 });
        if (hit) this.events.push({ type: 'boltHit', pos: p.clone() });
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

    // Éclairs qui s'effacent
    for (let i = this.boltLines.length - 1; i >= 0; i--) {
      const l = this.boltLines[i];
      l.t -= dt;
      l.line.material.opacity = Math.max(l.t / 0.35, 0);
      if (l.t <= 0) { this.scene.remove(l.line); l.line.geometry.dispose(); l.line.material.dispose(); this.boltLines.splice(i, 1); }
    }
  }

  _spawnBolt(start, lock, dmg, scale, speed, vel) {
    const mesh = new THREE.Mesh(boltGeo, scale < 1 ? compMat : boltMat);
    mesh.position.copy(start);
    mesh.scale.set(scale, scale, scale * 1.8);
    this.scene.add(mesh);
    const v = vel || lock.pos.clone().add(new THREE.Vector3(0, 0.45 * lock.T.scale, 0)).sub(start).normalize().multiplyScalar(speed);
    this.bolts.push({ mesh, vel: v, life: 1.6, lock, dmg, scale, speed, color: scale < 1 ? 0xffe9a8 : 0x7ff0ff });
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
    // Visée assistée : l'ennemi le plus proche de l'axe de visée (cône de ~25°).
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
    this._spawnBolt(start, lock, 1 + this.upgrades.bolt, 1, 42, v);
    player.facing = Math.atan2(v.x, v.z);
    player.attackT = 0.3; // petit geste du bras
    player.attackHitDone = true;
    player.flash = 4;
    this.particles.burst(start, 0xbffaff, 12, { speed: 2, up: 1, gravity: 0, size: 0.3, life: 0.3 });
    this.events.push({ type: 'bolt' });
  }

  _nova(player, slimes) {
    this.novaRadius = 7 * (1 + this.upgrades.nova * 0.2);
    this.novaCenter.copy(player.pos).add(new THREE.Vector3(0, 0.3, 0));
    this.novaT = 0;
    this.novaMesh.visible = true;
    this.novaUniforms.uColor.value.setHex(0x7ff0ff);
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

  // Frappe céleste : appelée par le jeu à l'atterrissage du plongeon.
  slamImpact(pos, slimes) {
    const r = 4.5 * (1 + this.upgrades.nova * 0.15);
    this.novaRadius = r;
    this.novaCenter.copy(pos).add(new THREE.Vector3(0, 0.2, 0));
    this.novaT = 0;
    this.novaMesh.visible = true;
    this.novaUniforms.uColor.value.setHex(0xffd27f);
    const hits = slimes.hitArea(pos.clone().add(new THREE.Vector3(0, 0.5, 0)), r, pos, 2 + this.upgrades.melee, 12);
    this.particles.burst(pos.clone().add(new THREE.Vector3(0, 0.2, 0)), 0xffd27f, 40, { speed: 8, up: 3, gravity: -8, size: 0.35, life: 0.7 });
    this.events.push({ type: 'slamImpact', hits });
  }

  _lightning(player, slimes) {
    let from = player.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    const hit = [];
    let target = slimes.nearest(player.pos, 18);
    const dmg = 2 + Math.floor(this.upgrades.bolt / 2);
    while (target && hit.length < 5) {
      hit.push(target);
      const to = target.pos.clone().add(new THREE.Vector3(0, 0.5 * target.T.scale, 0));
      this._zap(from, to);
      slimes.damage(target, dmg, from, 3);
      from = to;
      target = slimes.nearest(to, 10, hit);
    }
    if (hit.length) this.events.push({ type: 'lightning', n: hit.length });
    return hit.length > 0;
  }

  _zap(a, b) {
    const pts = [];
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      if (i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8));
      pts.push(p);
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xd8f6ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending }));
    this.scene.add(line);
    this.boltLines.push({ line, t: 0.35 });
    this.particles.burst(b, 0xd8f6ff, 10, { speed: 3, up: 2, gravity: 0, size: 0.3, life: 0.4 });
  }

  clear() {
    for (const b of this.bolts) this.scene.remove(b.mesh);
    this.bolts = [];
    this.novaT = 1;
    this.novaMesh.visible = false;
    this.healT = 0;
    for (const l of this.boltLines) this.scene.remove(l.line);
    this.boltLines = [];
  }
}
