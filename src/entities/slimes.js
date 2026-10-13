import * as THREE from 'three';
import { clamp, lerp } from '../core/noise.js';
import { SEA_LEVEL, WORLD_SIZE, BIOME } from '../world/terrain.js';

// Types d'Échos. move : hop (saute), float (vole), walk (marche lourde), blink (se téléporte).
// shot : attaque à distance (lob = projectile en cloche, bolt = trait rapide en
// ligne droite, rock = gros rocher lent) ; count/spread = salve en éventail.
export const TYPES = {
  green: { color: 0x7be36a, hp: 2, dmg: 12, scale: 1, speed: 5.5, score: 10, move: 'hop',
    shot: { kind: 'lob', dmg: 9, cd: 3.4, range: 20, speed: 17 } },
  bog: { color: 0x9b6bff, hp: 3, dmg: 14, scale: 1.15, speed: 5, score: 15, move: 'hop',
    shot: { kind: 'lob', dmg: 11, cd: 3.0, range: 22, speed: 17, count: 2, spread: 2 } },
  frost: { color: 0x8fdcff, hp: 3, dmg: 14, scale: 1.1, speed: 6, score: 15, move: 'hop',
    shot: { kind: 'bolt', dmg: 10, cd: 3.2, range: 26, speed: 24 } },
  king: { color: 0xff5a5a, hp: 6, dmg: 22, scale: 1.9, speed: 4.2, score: 40, move: 'hop', crown: true,
    shot: { kind: 'lob', dmg: 13, cd: 3.4, range: 26, speed: 18, count: 3, spread: 2.6 } },
  wisp: { color: 0xfff09a, hp: 1, dmg: 9, scale: 0.55, speed: 8.5, score: 12, move: 'float', glow: 1.6,
    shot: { kind: 'bolt', dmg: 7, cd: 2.2, range: 24, speed: 28 } },
  spitter: { color: 0xff8a3c, hp: 3, dmg: 10, scale: 1.05, speed: 4.2, score: 20, move: 'hop', ranged: true,
    shot: { kind: 'lob', dmg: 11, cd: 2.0, range: 30, speed: 19, count: 3, spread: 1.6 } },
  golem: { color: 0x8a8178, hp: 10, dmg: 26, scale: 1.55, speed: 2.6, score: 50, move: 'walk', knockMul: 0.25, stone: true,
    shot: { kind: 'rock', dmg: 22, cd: 4.2, range: 28, speed: 14 } },
  shade: { color: 0x3a2a5c, hp: 3, dmg: 18, scale: 1.0, speed: 6.5, score: 30, move: 'blink', glow: 0.9,
    shot: { kind: 'bolt', dmg: 14, cd: 2.6, range: 22, speed: 32, color: 0xb070ff } },
  boss: { color: 0xd23a5a, hp: 18, dmg: 20, scale: 3.4, speed: 4.6, score: 400, move: 'hop', crown: true, knockMul: 0.08, boss: true,
    shot: { kind: 'lob', dmg: 16, cd: 3.2, range: 40, speed: 20, count: 3, spread: 3 } },
};

// Renfort général des Échos : plus résistants, plus forts, plus rapides, et
// repèrent le joueur de plus loin.
const BUFF = { hp: 1.8, dmg: 1.7, speed: 1.4, aggro: 1.4, density: 1.25 };
// Délai d'avertissement avant un tir (l'Écho brille) : laisse le temps d'esquiver.
const WINDUP = 0.42;

// Ordre d'apparition des nouveaux Échos au fil des histoires.
export const ENEMY_UNLOCK = { wisp: 6, spitter: 16, golem: 30, shade: 48 };

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
const golemGeo = new THREE.DodecahedronGeometry(0.75, 0).translate(0, 0.55, 0);
const wispGeo = new THREE.IcosahedronGeometry(0.6, 1).translate(0, 0.45, 0);
const eyeGeo = new THREE.SphereGeometry(0.09, 8, 6);
const pupilGeo = new THREE.SphereGeometry(0.045, 6, 5);
const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
const glowEyeMat = new THREE.MeshBasicMaterial({ color: 0xffd25a });
const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
const crownMat = new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide });
const globGeo = new THREE.SphereGeometry(0.28, 10, 8);
const boltGeo = new THREE.CapsuleGeometry(0.12, 0.7, 4, 8).rotateX(Math.PI / 2);
const rockGeo = new THREE.DodecahedronGeometry(0.55, 0);
const shotMats = new Map();
function shotMat(color, stone) {
  const key = `${color}:${stone ? 1 : 0}`;
  if (!shotMats.has(key)) {
    shotMats.set(key, stone
      ? new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true, emissive: 0xff5020, emissiveIntensity: 0.25 })
      : new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.3 }));
  }
  return shotMats.get(key);
}
const rootGeo = new THREE.ConeGeometry(0.12, 1.3, 4).translate(0, 0.5, 0);
const rootMat = new THREE.MeshStandardMaterial({ color: 0x6fae45, emissive: 0x2c5a18, emissiveIntensity: 0.6, roughness: 0.9, flatShading: true });

class Slime {
  constructor(type, pos, mods) {
    const T = { ...TYPES[type] };
    T.hp = Math.max(1, Math.round(T.hp * mods.hp));
    T.dmg = Math.round(T.dmg * mods.dmg);
    T.speed *= mods.speed;
    T.knockMul = T.knockMul ?? 1;
    this.type = type;
    this.T = T;
    this.hp = T.hp;
    this.maxHp = T.hp;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.hopTimer = Math.random();
    this.onGround = true;
    this.squash = 0;
    this.hurtT = 0;
    this.dying = -1;
    this.attackCd = 0;
    this.shootCd = 1.2 + Math.random() * 1.5;
    this.windT = -1;
    this.blinkCd = 2 + Math.random() * 2;
    this.slamT = -1;
    this.rootT = 0;
    this.wander = Math.random() * Math.PI * 2;
    this.phase = Math.random() * 10;
    this.guard = null;
    this.flyY = 1.6 + Math.random();

    this.mat = new THREE.MeshStandardMaterial({
      color: T.color,
      roughness: T.stone ? 0.95 : 0.15,
      metalness: 0,
      transparent: !T.stone,
      opacity: T.stone ? 1 : 0.88,
      emissive: T.color,
      emissiveIntensity: T.glow ?? 0.18,
      flatShading: !!T.stone,
    });
    const g = new THREE.Group();
    const body = new THREE.Mesh(T.stone ? golemGeo : type === 'wisp' ? wispGeo : bodyGeo, this.mat);
    body.castShadow = true;
    g.add(body);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, type === 'shade' || T.stone ? glowEyeMat : eyeMat);
      e.position.set(s * 0.2, T.stone ? 0.75 : 0.5, T.stone ? 0.6 : 0.55);
      if (type !== 'shade' && !T.stone) {
        const p = new THREE.Mesh(pupilGeo, pupilMat);
        p.position.set(0, 0, 0.06);
        e.add(p);
      }
      g.add(e);
    }
    if (T.crown) {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.22, 6, 1, true), crownMat);
      crown.position.y = 1.0;
      g.add(crown);
    }
    if (T.ranged) {
      const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.35, 8).rotateX(Math.PI / 2), this.mat);
      snout.position.set(0, 0.45, 0.62);
      g.add(snout);
    }
    this.body = body;
    this.object = g;
    this.object.scale.setScalar(T.scale);
  }
}

// Gère l'apparition, l'IA, les combats et la mort des Échos.
export class SlimeManager {
  constructor(scene, terrain, diff = {}) {
    this.scene = scene;
    this.terrain = terrain;
    this.list = [];
    this.globs = [];
    this.rings = [];
    this.rootMeshes = [];
    this.spawnTimer = 2;
    this.events = [];
    this.slowT = 0;
    this.boss = null;
    this.playerDmgMul = 1;
    this.setDifficulty(diff);
  }

  // diff : { hp, dmg, speed, density, kingChance, aggro, types: [...] }
  setDifficulty(diff) {
    const d = { hp: 1, dmg: 1, speed: 1, density: 1, kingChance: 0.04, aggro: 26, types: [], ...diff };
    this.diff = {
      ...d,
      hp: d.hp * BUFF.hp,
      dmg: d.dmg * BUFF.dmg,
      speed: d.speed * BUFF.speed,
      aggro: d.aggro * BUFF.aggro,
      density: d.density * BUFF.density,
    };
  }

  spawn(type, pos) {
    const mods = type === 'boss' ? { hp: this.diff.hp * (this.diff.bossHp ?? 1), dmg: this.diff.dmg, speed: Math.min(this.diff.speed, 1.3 * BUFF.speed) } : this.diff;
    const s = new Slime(type, pos, mods);
    if (type === 'wisp') s.pos.y += s.flyY;
    this.list.push(s);
    this.scene.add(s.object);
    if (type === 'boss') { this.boss = s; s.summonCd = 8; s.leapCd = 5; s.volleyCd = 6; }
    return s;
  }

  _typeFor(x, z, night) {
    const b = this.terrain.biomeAt(x, z);
    const types = this.diff.types;
    const r = Math.random();
    if (r < this.diff.kingChance) return 'king';
    // Nouveaux Échos selon l'histoire.
    if (types.includes('shade') && night > 0.5 && Math.random() < 0.18) return 'shade';
    if (types.includes('golem') && (b === BIOME.MOUNTAIN || b === BIOME.SNOW || Math.random() < 0.08) && Math.random() < 0.3) return 'golem';
    if (types.includes('spitter') && Math.random() < 0.22) return 'spitter';
    if (types.includes('wisp') && night > 0.5 && Math.random() < 0.28) return 'wisp';
    if (b === BIOME.SWAMP) return 'bog';
    if (b === BIOME.SNOW || b === BIOME.MOUNTAIN) return 'frost';
    return 'green';
  }

  guardType(x, z, i, night) {
    if (i === 0 && this.diff.kingChance > 0.05) return 'king';
    return this._typeFor(x, z, night);
  }

  // ── Effets de compétences ──
  slowAll(sec) { this.slowT = Math.max(this.slowT, sec); }
  rootArea(center, radius, sec, dmg = 1) {
    let n = 0;
    for (const s of this.list) {
      if (s.dying >= 0) continue;
      if (Math.hypot(s.pos.x - center.x, s.pos.z - center.z) < radius + 0.5 * s.T.scale) {
        s.rootT = s.T.boss ? sec * 0.4 : sec;
        s.vel.set(0, s.vel.y, 0);
        n++;
        // Petites racines visuelles
        for (let k = 0; k < 5; k++) {
          const m = new THREE.Mesh(rootGeo, rootMat);
          const a = (k / 5) * Math.PI * 2;
          m.position.set(s.pos.x + Math.cos(a) * 0.6 * s.T.scale, s.pos.y, s.pos.z + Math.sin(a) * 0.6 * s.T.scale);
          m.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
          m.scale.setScalar(s.T.scale);
          this.scene.add(m);
          this.rootMeshes.push({ m, t: s.rootT });
        }
      }
    }
    this.hitArea(center, radius, center, dmg, 0.1);
    return n;
  }

  _ring(pos, radius, color, life) {
    const geo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos).add(new THREE.Vector3(0, 0.15, 0));
    m.scale.set(radius, 1, radius);
    this.scene.add(m);
    const r = { m, life, max: life };
    this.rings.push(r);
    return r;
  }

  // Projectile : 'lob' (en cloche), 'bolt' (ligne droite), 'rock' (gros, en cloche).
  _shoot(from, target, speed = 16, opts = {}) {
    const kind = opts.kind || 'lob';
    const color = opts.color ?? 0xff8a3c;
    const m = new THREE.Mesh(kind === 'bolt' ? boltGeo : kind === 'rock' ? rockGeo : globGeo, shotMat(color, kind === 'rock'));
    m.position.copy(from);
    const d = new THREE.Vector3().subVectors(target, from);
    let v, gravity;
    if (kind === 'bolt') {
      v = d.clone().normalize().multiplyScalar(speed);
      gravity = 0;
      m.lookAt(target);
    } else {
      gravity = kind === 'rock' ? 22 : 18;
      const flat = Math.hypot(d.x, d.z);
      const t = Math.max(flat / speed, 0.4);
      v = new THREE.Vector3(d.x / t, (d.y + 0.5 * gravity * t * t) / t, d.z / t);
    }
    this.scene.add(m);
    this.globs.push({
      m, v, gravity, kind, color,
      life: kind === 'bolt' ? 2.2 : 4,
      dmg: opts.dmg ?? Math.round(11 * this.diff.dmg),
      radius: kind === 'rock' ? 1.3 : kind === 'bolt' ? 0.75 : 0.9,
      spin: kind === 'rock' ? 6 : 0,
    });
    this.events.push({ type: 'spit', pos: from.clone(), kind });
  }

  // Tir d'un Écho (avec visée anticipée et salve éventuelle).
  _fire(s, player, toP) {
    const sh = s.T.shot;
    const from = s.pos.clone().add(new THREE.Vector3(0, (s.T.move === 'float' ? 0.45 : 0.6) * s.T.scale, 0));
    const lead = sh.kind === 'bolt' ? 0.25 : 0.45;
    const aim = player.pos.clone().add(new THREE.Vector3(player.vel.x * lead, 0.8, player.vel.z * lead));
    const n = sh.count || 1;
    const side = new THREE.Vector3(-toP.z, 0, toP.x).normalize();
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? 0 : (k - (n - 1) / 2) * (sh.spread || 2);
      this._shoot(from, aim.clone().addScaledVector(side, off), sh.speed * Math.sqrt(this.diff.speed / BUFF.speed) * 1.1, {
        kind: sh.kind,
        color: sh.color ?? s.T.color,
        dmg: Math.round(sh.dmg * this.diff.dmg),
      });
    }
  }

  update(dt, player, ctx) {
    const { night, elapsed } = ctx;
    const T = this.terrain;
    this.slowT = Math.max(this.slowT - dt, 0);
    const slow = this.slowT > 0 ? 0.35 : 1;
    const sdt = dt * slow;

    // Apparitions : la nuit partout, le jour seulement dans les marais.
    const maxCount = Math.round(((night > 0.5 ? 7 : 2) + 2) * this.diff.density);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && player.alive) {
      this.spawnTimer = (night > 0.5 ? 3.5 : 7) / Math.sqrt(this.diff.density);
      const wild = this.list.filter((s) => !s.guard && s.dying < 0 && !s.T.boss).length;
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
          this.spawn(this._typeFor(x, z, night), new THREE.Vector3(x, h, z));
          break;
        }
      }
    }

    for (const s of this.list) {
      if (s.dying >= 0) {
        s.dying += dt;
        const k = 1 - s.dying / 0.35;
        s.object.scale.set(s.T.scale * (1 + s.dying * 3), s.T.scale * Math.max(k, 0.01), s.T.scale * (1 + s.dying * 3));
        s.mat.transparent = true;
        s.mat.opacity = Math.max(k * 0.88, 0);
        continue;
      }
      s.attackCd = Math.max(s.attackCd - sdt, 0);
      s.hurtT = Math.max(s.hurtT - dt, 0);
      s.rootT = Math.max(s.rootT - dt, 0);
      s.phase += sdt;

      const toP = new THREE.Vector3(player.pos.x - s.pos.x, 0, player.pos.z - s.pos.z);
      const dist = toP.length();
      const aggroR = s.T.boss ? 80 : this.diff.aggro;
      const aggro = player.alive && !player.swimming && (dist < aggroR || (s.guard && dist < aggroR + 8));

      // Fond au lever du jour (sauf marais, gardiens, golems et boss).
      if (night < 0.3 && !s.guard && !s.T.stone && !s.T.boss && T.biomeAt(s.pos.x, s.pos.z) !== BIOME.SWAMP && Math.random() < dt * 0.25) {
        this.kill(s, false);
        continue;
      }
      if (dist > 160 && !s.guard && !s.T.boss) { this.kill(s, false); continue; }

      const rooted = s.rootT > 0;
      const mv = s.T.move;

      if (mv === 'float') {
        // Feu follet : vole, tourne autour puis fonce.
        const target = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
        const goal = aggro ? target.clone().add(new THREE.Vector3(Math.cos(s.phase * 1.7) * 3, Math.sin(s.phase * 2.3) * 0.8, Math.sin(s.phase * 1.7) * 3).multiplyScalar(s.attackCd > 0 ? 1.4 : 0.15)) : new THREE.Vector3(s.pos.x + Math.cos(s.wander) * 5, T.heightAt(s.pos.x, s.pos.z) + s.flyY, s.pos.z + Math.sin(s.wander) * 5);
        s.wander += dt * 0.3;
        const want = goal.sub(s.pos);
        const l = want.length();
        if (l > 0.01) want.multiplyScalar(Math.min(s.T.speed, l * 3) / l);
        if (!rooted) s.vel.lerp(want, 1 - Math.exp(-sdt * 3));
        else s.vel.multiplyScalar(0.8);
        s.pos.addScaledVector(s.vel, sdt);
        const minY = Math.max(T.heightAt(s.pos.x, s.pos.z), SEA_LEVEL) + 0.6;
        if (s.pos.y < minY) s.pos.y = minY;
        s.object.rotation.y = Math.atan2(s.vel.x, s.vel.z);
      } else if (mv === 'blink') {
        // Ombre : se téléporte près du joueur, puis charge.
        s.blinkCd -= sdt;
        if (aggro && s.blinkCd <= 0 && !rooted) {
          const a = Math.random() * Math.PI * 2;
          const x = player.pos.x + Math.cos(a) * 6, z = player.pos.z + Math.sin(a) * 6;
          if (T.heightAt(x, z) > SEA_LEVEL + 0.3) {
            this.events.push({ type: 'blink', from: s.pos.clone() });
            s.pos.set(x, T.heightAt(x, z), z);
            this.events.push({ type: 'blink', from: s.pos.clone() });
          }
          s.blinkCd = 3.5 + Math.random() * 2;
        }
        this._groundMove(s, toP, dist, aggro, sdt, rooted, 0.4);
        // Presque invisible de loin la nuit.
        const vis = clamp(1 - (dist - 6) / 10, 0.12, 1);
        s.mat.opacity = lerp(s.mat.opacity, (night > 0.5 ? vis : 0.85) * 0.9, 1 - Math.exp(-dt * 4));
      } else if (mv === 'walk') {
        // Golem : marche lourde, frappe le sol (cercle d'avertissement).
        if (s.slamT >= 0) {
          s.slamT += sdt;
          if (s.slamT > 0.75) {
            this.events.push({ type: 'slam', pos: s.pos.clone(), radius: 3.6 });
            this._areaDamage(player, s.pos, 3.6, s.T.dmg);
            s.slamT = -1;
            s.attackCd = 2.2;
            s.squash = 0.5;
          }
        } else {
          if (aggro && dist < 3.2 && s.attackCd <= 0 && !rooted) {
            s.slamT = 0;
            this._ring(s.pos, 3.6, 0xff6040, 0.75);
          } else if (!rooted) {
            const sp = aggro ? s.T.speed : s.T.speed * 0.4;
            const dir = aggro ? toP.clone().normalize() : new THREE.Vector3(Math.cos(s.wander), 0, Math.sin(s.wander));
            if (!aggro) s.wander += (Math.random() - 0.5) * dt;
            s.vel.x = lerp(s.vel.x, dir.x * sp, 1 - Math.exp(-sdt * 4));
            s.vel.z = lerp(s.vel.z, dir.z * sp, 1 - Math.exp(-sdt * 4));
          }
        }
        if (rooted) { s.vel.x = 0; s.vel.z = 0; }
        s.vel.y -= 24 * sdt;
        s.pos.addScaledVector(s.vel, sdt);
        this._ground(s);
        if (aggro) s.object.rotation.y = lerpAngle(s.object.rotation.y, Math.atan2(toP.x, toP.z), sdt * 5);
      } else {
        this._groundMove(s, toP, dist, aggro, sdt, rooted, 0);
      }

      // Attaques à distance : tous les Échos tirent, après un bref éclat
      // d'avertissement.
      const sh = s.T.shot;
      if (sh && !rooted && player.alive) {
        if (s.windT >= 0) {
          s.windT += sdt;
          if (s.windT >= WINDUP) {
            s.windT = -1;
            if (aggro) this._fire(s, player, toP);
          }
        } else if (aggro) {
          s.shootCd -= sdt;
          if (s.shootCd <= 0 && dist < sh.range && dist > 3.5) {
            s.windT = 0;
            const enrage = s.T.boss && s.hp < s.maxHp * 0.5 ? 0.7 : 1;
            s.shootCd = (sh.cd * enrage * (0.85 + Math.random() * 0.3)) / Math.sqrt(this.diff.speed / BUFF.speed);
          }
        }
      } else if (rooted) s.windT = -1;
      if (s.T.boss) this._bossAI(s, player, toP, dist, sdt);

      // Contact
      const reach = 0.9 * s.T.scale + player.radius;
      const cy = s.pos.y + 0.4 * s.T.scale;
      const dy = Math.abs(player.pos.y + 0.6 - cy);
      if (dist < reach && dy < 1.4 * s.T.scale && s.attackCd <= 0 && player.alive && !rooted) {
        if (player.damage(s.T.dmg, s.pos)) this.events.push({ type: 'slimeHit', slime: s });
        s.attackCd = 1;
      }

      // Squash & stretch
      s.squash = lerp(s.squash, 0, 1 - Math.exp(-dt * 8));
      const st = s.onGround ? s.squash : clamp(-s.vel.y * 0.04, -0.25, 0.25);
      const breathe = Math.sin(elapsed * 3 + s.wander) * 0.03;
      const sc = s.T.scale * (s.slamT >= 0 ? 1 + s.slamT * 0.25 : 1);
      s.object.scale.set(sc * (1 + st + breathe), sc * (1 - st - breathe), sc * (1 + st + breathe));
      s.object.position.copy(s.pos);
      if (mv === 'float') s.object.position.y += Math.sin(elapsed * 4 + s.phase) * 0.15;
      const base = s.T.glow ?? 0.18;
      s.mat.emissiveIntensity = s.hurtT > 0 ? 1.8 : rooted ? 0.05 : s.windT >= 0 ? 1.2 + 1.6 * (s.windT / WINDUP) : base + night * 0.25 + (this.slowT > 0 ? 0.5 : 0);
    }

    // Projectiles des cracheurs
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const g = this.globs[i];
      g.life -= sdt;
      g.v.y -= g.gravity * sdt;
      g.m.position.addScaledVector(g.v, sdt);
      if (g.spin) { g.m.rotation.x += g.spin * sdt; g.m.rotation.z += g.spin * 0.7 * sdt; }
      const p = g.m.position;
      let done = g.life <= 0;
      if (!done && player.alive && p.distanceTo(player.pos.clone().add(new THREE.Vector3(0, 0.9, 0))) < g.radius) {
        player.damage(g.dmg, p);
        done = true;
      }
      if (!done && (p.y < T.heightAt(p.x, p.z) || p.y < SEA_LEVEL - 0.5)) done = true;
      if (done) {
        if (g.kind === 'rock') this.events.push({ type: 'slam', pos: p.clone(), radius: 2 });
        this.events.push({ type: 'splat', pos: p.clone(), color: g.color });
        this.scene.remove(g.m);
        this.globs.splice(i, 1);
      }
    }

    // Cercles d'avertissement
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      r.m.material.opacity = 0.25 + 0.5 * Math.abs(Math.sin(r.life * 14));
      if (r.life <= 0) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.rootMeshes.length - 1; i >= 0; i--) {
      const r = this.rootMeshes[i];
      r.t -= dt;
      if (r.t <= 0) { this.scene.remove(r.m); this.rootMeshes.splice(i, 1); }
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

  _ground(s) {
    const T = this.terrain;
    const g = T.heightAt(s.pos.x, s.pos.z);
    if (g < SEA_LEVEL - 0.3 && !s.T.boss) {
      s.pos.x -= s.vel.x * 0.05; s.pos.z -= s.vel.z * 0.05;
      s.vel.x *= -0.5; s.vel.z *= -0.5;
    }
    const gy = Math.max(T.heightAt(s.pos.x, s.pos.z), s.T.boss ? SEA_LEVEL : -99);
    if (s.pos.y <= gy) {
      if (!s.onGround) { s.squash = 0.45; s.landed = true; }
      s.pos.y = gy;
      s.vel.y = 0;
      if (s.T.move === 'hop') s.vel.x = s.vel.z = 0;
      s.onGround = true;
    } else if (s.pos.y > gy + 0.05) s.onGround = false;
  }

  _groundMove(s, toP, dist, aggro, sdt, rooted, keep) {
    s.hopTimer -= sdt;
    if (s.onGround && s.hopTimer <= 0 && !rooted) {
      let dir;
      if (aggro) {
        dir = toP.clone().normalize();
        // Le cracheur garde ses distances.
        if (s.T.ranged && dist < 10) dir.negate();
      } else if (s.guard && s.pos.distanceTo(s.guard) > 10) dir = new THREE.Vector3(s.guard.x - s.pos.x, 0, s.guard.z - s.pos.z).normalize();
      else { s.wander += (Math.random() - 0.5) * 1.5; dir = new THREE.Vector3(Math.cos(s.wander), 0, Math.sin(s.wander)); }
      const sp = aggro ? s.T.speed : s.T.speed * 0.4;
      s.vel.set(dir.x * sp, aggro ? 7 : 5, dir.z * sp);
      s.onGround = false;
      s.hopTimer = aggro ? 0.36 + Math.random() * 0.22 + keep * 0.7 : 1.2 + Math.random() * 1.5;
      s.squash = -0.3;
      s.object.rotation.y = Math.atan2(dir.x, dir.z);
    }
    if (!s.onGround) s.vel.y -= 24 * sdt;
    s.pos.addScaledVector(s.vel, sdt);
    s.landed = false;
    this._ground(s);
    if (aggro && s.onGround) s.object.rotation.y = lerpAngle(s.object.rotation.y, Math.atan2(toP.x, toP.z), sdt * 6);
  }

  _areaDamage(player, center, radius, dmg) {
    const d = Math.hypot(player.pos.x - center.x, player.pos.z - center.z);
    if (d < radius && player.pos.y - center.y < 2.5 && player.alive) player.damage(dmg, center);
  }

  // Gardien : bonds écrasants, invocations, salves (phase 2).
  _bossAI(s, player, toP, dist, sdt) {
    if (s.rootT > 0) return;
    const enraged = s.hp < s.maxHp * 0.5;
    s.leapCd -= sdt; s.summonCd -= sdt; s.volleyCd -= sdt;
    if (s.leapCd <= 0 && s.onGround && dist < 40) {
      // Grand bond vers le joueur, onde à l'atterrissage.
      const t = 1.1;
      s.vel.set(toP.x / t, 0.5 * 24 * t, toP.z / t);
      s.onGround = false;
      s.hopTimer = 2;
      s.leaping = true;
      s.leapTarget = player.pos.clone();
      this._ring(player.pos, 6, 0xff3050, t);
      s.leapCd = enraged ? 4.5 : 6.5;
    }
    if (s.leaping && s.landed) {
      s.leaping = false;
      this.events.push({ type: 'slam', pos: s.pos.clone(), radius: 6, big: true });
      this._areaDamage(player, s.pos, 6, s.T.dmg);
    }
    if (s.summonCd <= 0) {
      const n = enraged ? 4 : 2;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const x = s.pos.x + Math.cos(a) * 5, z = s.pos.z + Math.sin(a) * 5;
        const h = this.terrain.heightAt(x, z);
        if (h < SEA_LEVEL + 0.2) continue;
        const m = this.spawn(this._typeFor(x, z, 1), new THREE.Vector3(x, h, z));
        m.guard = s.pos.clone();
      }
      this.events.push({ type: 'summon', pos: s.pos.clone() });
      s.summonCd = enraged ? 10 : 14;
    }
    if (enraged && s.volleyCd <= 0 && dist < 30) {
      const from = s.pos.clone().add(new THREE.Vector3(0, 1.6 * s.T.scale * 0.5, 0));
      for (let k = -2; k <= 2; k++) {
        const side = new THREE.Vector3(-toP.z, 0, toP.x).normalize().multiplyScalar(k * 2.5);
        this._shoot(from, player.pos.clone().add(side).add(new THREE.Vector3(0, 0.8, 0)), 18);
      }
      s.volleyCd = 5;
    }
  }

  // Frappe tout Écho dans un rayon autour du point d'attaque.
  hitArea(point, radius, from, dmg = 1, knock = 9) {
    let hits = 0;
    for (const s of this.list) {
      if (s.dying >= 0) continue;
      const c = s.pos.clone().add(new THREE.Vector3(0, 0.4 * s.T.scale, 0));
      if (c.distanceTo(point) < radius + 0.6 * s.T.scale) {
        this.damage(s, dmg, from, knock);
        hits++;
      }
    }
    return hits;
  }

  damage(s, dmg, from, knock = 9) {
    if (s.dying >= 0) return;
    // Bonus d'attaque du héros (artefacts cachés).
    s.hp -= dmg * this.playerDmgMul;
    s.hurtT = 0.18;
    const k = knock * s.T.knockMul;
    if (k > 0.5 && s.rootT <= 0) {
      const push = new THREE.Vector3(s.pos.x - from.x, 0, s.pos.z - from.z);
      if (push.lengthSq() < 1e-4) push.set(1, 0, 0);
      push.normalize();
      s.vel.set(push.x * k / s.T.scale, s.T.move === 'float' ? 0 : 4 + k * 0.25, push.z * k / s.T.scale);
      if (s.T.move !== 'float') s.onGround = false;
      s.hopTimer = 0.9;
    }
    if (s.hp <= 0) this.kill(s, true);
    else this.events.push({ type: 'slimeHurt', slime: s });
  }

  // Écho vivant le plus proche (compagnon, foudre).
  nearest(p, maxDist, exclude = []) {
    let best = null, bd = maxDist;
    for (const s of this.list) {
      if (s.dying >= 0 || exclude.includes(s)) continue;
      const d = s.pos.distanceTo(p);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  kill(s, byPlayer) {
    if (s.dying >= 0) return;
    s.dying = 0;
    if (s === this.boss) this.boss = null;
    this.events.push({ type: byPlayer ? 'slimeKilled' : 'slimeMelt', slime: s, pos: s.pos.clone(), color: s.T.color, score: s.T.score, boss: !!s.T.boss });
  }

  clear() {
    for (const s of this.list) { this.scene.remove(s.object); s.mat.dispose(); }
    for (const g of this.globs) this.scene.remove(g.m);
    for (const r of this.rings) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); }
    for (const r of this.rootMeshes) this.scene.remove(r.m);
    this.list = [];
    this.globs = [];
    this.rings = [];
    this.rootMeshes = [];
    this.boss = null;
    this.slowT = 0;
  }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * clamp(t, 0, 1);
}

export { WORLD_SIZE };
