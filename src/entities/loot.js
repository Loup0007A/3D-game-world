import * as THREE from 'three';

// ─── Butin ─────────────────────────────────────────────────────────
// Ce que lâchent les Échos (les orbes de soin restent gérées à part).
//  power  Éclat de force   : +50 % de dégâts pendant 20 s
//  swift  Plume de vent    : +35 % de vitesse pendant 15 s
//  ward   Fiole de garde   : les 2 prochains coups ennemis sont absorbés
//  focus  Parchemin d'éveil: toutes les compétences sont rechargées
//  heart  Cœur ancien (rare): +5 de vie max jusqu'à la fin du niveau
//  gem    Gemme            : +150 points

export const LOOT = {
  power: { name: 'Éclat de force', icon: '⚔️', color: 0xff4a3d, geo: () => new THREE.OctahedronGeometry(0.28, 0), score: 30 },
  swift: { name: 'Plume de vent', icon: '🪶', color: 0x7ff0ff, geo: () => new THREE.ConeGeometry(0.14, 0.6, 5), score: 30 },
  ward: { name: 'Fiole de garde', icon: '🛡️', color: 0x5aa0ff, geo: () => new THREE.CapsuleGeometry(0.16, 0.22, 4, 8), score: 30 },
  focus: { name: "Parchemin d'éveil", icon: '📜', color: 0xffe066, geo: () => new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8).rotateZ(Math.PI / 2), score: 30 },
  heart: { name: 'Cœur ancien', icon: '❤️', color: 0xff2d6f, geo: () => new THREE.DodecahedronGeometry(0.3, 0), score: 120 },
  gem: { name: 'Gemme', icon: '💎', color: 0xb070ff, geo: () => new THREE.IcosahedronGeometry(0.22, 0), score: 150 },
};

// Tables de butin : [type, poids]. « null » = rien.
const TABLES = {
  common: [[null, 70], ['power', 8], ['swift', 6], ['ward', 6], ['focus', 4], ['gem', 5], ['heart', 1]],
  elite: [['power', 25], ['swift', 15], ['ward', 20], ['focus', 15], ['gem', 15], ['heart', 10]],
  rare: [['heart', 40], ['gem', 30], ['power', 15], ['ward', 15]],
};

export function rollLoot(table) {
  const t = TABLES[table];
  const total = t.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of t) { r -= w; if (r <= 0) return k; }
  return null;
}

const geos = Object.fromEntries(Object.entries(LOOT).map(([k, v]) => [k, v.geo()]));
const mats = Object.fromEntries(Object.entries(LOOT).map(([k, v]) => [k, new THREE.MeshStandardMaterial({ color: v.color, emissive: v.color, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.2 })]));

export class Loot {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  drop(pos, kind) {
    if (!LOOT[kind]) return;
    const m = new THREE.Mesh(geos[kind], mats[kind]);
    const a = Math.random() * Math.PI * 2;
    m.position.copy(pos).add(new THREE.Vector3(Math.cos(a) * 0.8, 0.9, Math.sin(a) * 0.8));
    this.scene.add(m);
    this.items.push({ m, kind, base: m.position.y, t: 0, vy: 4 });
  }

  update(dt, t, player, onPick, magnet = 0) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const o = this.items[i];
      o.t += dt;
      // Petit saut à l'apparition, puis flottement.
      if (o.vy > -10 && o.t < 0.8) { o.vy -= 16 * dt; o.base += o.vy * dt * 0.3; }
      const target = player.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
      if (magnet && o.m.position.distanceTo(target) < magnet) {
        o.m.position.lerp(target, 1 - Math.exp(-dt * 5));
        o.base = o.m.position.y;
      }
      o.m.position.y = o.base + Math.sin(t * 3 + i) * 0.15;
      o.m.rotation.y += dt * 2.5;
      if (o.m.position.distanceTo(target) < 1.7 && player.alive) {
        onPick(o.kind, o.m.position.clone());
        this.scene.remove(o.m);
        this.items.splice(i, 1);
      } else if (o.t > 90) {
        this.scene.remove(o.m);
        this.items.splice(i, 1);
      }
    }
  }

  clear() {
    this.items.forEach((o) => this.scene.remove(o.m));
    this.items = [];
  }
}
