import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';

// ─── Artefacts cachés ───────────────────────────────────────────
// Environ 35 par île, sans faisceau ni repère sur la carte : de petites
// pierres runiques qui ne scintillent que de près. Chacun renforce le
// héros pour toute l'histoire (voir ARTEFACT dans main.js).

export const ARTEFACTS_PER_ISLAND = 35;

// Artefacts légendaires (tirés au sort pour chaque artefact de l'île) :
//  - « Dieu vivant » (1 %) : chaque attaque terrasse l'ennemi d'un coup ;
//  - « Bouclier divin » (3 %) : 2 attaques ennemies sur 3 ratent.
// Leur pouvoir dure jusqu'à la fin de l'île (passage du portail).
export const LEGENDARY = {
  god: { chance: 0.01, name: 'Dieu vivant', color: 0xfff6c8, emissive: 0xffd34d },
  shield: { chance: 0.03, name: 'Bouclier divin', color: 0x9fe8ff, emissive: 0x2fb8ff },
};

const runeGeo = new THREE.OctahedronGeometry(0.32, 0);
const baseGeo = new THREE.CylinderGeometry(0.35, 0.5, 0.35, 6);
const baseMat = new THREE.MeshStandardMaterial({ color: 0x5d5650, roughness: 0.95, flatShading: true });
const sparkGeo = new THREE.SphereGeometry(0.05, 6, 4);

// Deux sortes, pour varier : ambre et sang.
const KINDS = [
  { color: 0xffb347, emissive: 0xff7a00 },
  { color: 0xff5470, emissive: 0xc8102e },
];
const mats = KINDS.map((k) => new THREE.MeshStandardMaterial({ color: k.color, emissive: k.emissive, emissiveIntensity: 0.5, roughness: 0.25, metalness: 0.3, flatShading: true }));
const sparkMats = KINDS.map((k) => new THREE.MeshBasicMaterial({ color: k.color, transparent: true, opacity: 0.9, depthWrite: false }));

export class Artifacts {
  // avoid : points (Vector3) à éviter (reliques, arche).
  constructor(scene, terrain, seed, count = ARTEFACTS_PER_ISLAND, avoid = []) {
    this.scene = scene;
    const rand = mulberry32(seed ^ 0xa27e5);
    // Bien répartis sur toute l'île, souvent en forêt ou en altitude.
    const pts = terrain.scatterLand(count, 60, rand, avoid);
    this.items = pts.map((p, i) => {
      const kind = i % KINDS.length;
      const roll = rand();
      const legend = roll < LEGENDARY.god.chance ? 'god' : roll < LEGENDARY.god.chance + LEGENDARY.shield.chance ? 'shield' : null;
      const g = new THREE.Group();
      g.position.copy(p);
      g.rotation.y = rand() * Math.PI * 2;
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.1;
      base.castShadow = base.receiveShadow = true;
      g.add(base);
      const L = legend && LEGENDARY[legend];
      const rune = new THREE.Mesh(runeGeo, L
        ? new THREE.MeshStandardMaterial({ color: L.color, emissive: L.emissive, emissiveIntensity: 0.8, roughness: 0.15, metalness: 0.6, flatShading: true })
        : mats[kind].clone());
      if (L) rune.scale.setScalar(1.35);
      rune.position.y = 0.75;
      rune.scale.y = 1.6;
      rune.castShadow = true;
      g.add(rune);
      const sparks = [];
      for (let k = 0; k < 4; k++) {
        const s = new THREE.Mesh(sparkGeo, L ? new THREE.MeshBasicMaterial({ color: L.color, transparent: true, opacity: 0.95, depthWrite: false }) : sparkMats[kind]);
        s.userData.a = (k / 4) * Math.PI * 2;
        g.add(s);
        sparks.push(s);
      }
      g.visible = false;
      scene.add(g);
      return { group: g, rune, sparks, kind, legend, color: L ? L.color : KINDS[kind].color, pos: p.clone(), taken: false, phase: rand() * 10 };
    });
  }

  get total() { return this.items.length; }
  get collected() { return this.items.filter((a) => a.taken).length; }

  markTaken(i) {
    const a = this.items[i];
    if (!a || a.taken) return;
    a.taken = true;
    a.group.visible = false;
  }

  takenIndices() { return this.items.map((a, i) => (a.taken ? i : -1)).filter((i) => i >= 0); }

  update(dt, t, player, onCollect) {
    for (const a of this.items) {
      if (a.taken) continue;
      const dx = a.pos.x - player.pos.x, dz = a.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      // Invisible de loin : il faut fouiller l'île.
      a.group.visible = d < 55;
      if (!a.group.visible) continue;
      const near = 1 - Math.min(d / 14, 1);
      a.rune.rotation.y = t * 1.2 + a.phase;
      a.rune.position.y = (a.legend ? 1.0 : 0.75) + Math.sin(t * 2 + a.phase) * 0.08;
      a.rune.material.emissiveIntensity = 0.35 + near * 2.2;
      a.sparks.forEach((s, k) => {
        const ang = s.userData.a + t * 1.8;
        s.position.set(Math.cos(ang) * 0.55, 0.75 + Math.sin(t * 3 + k) * 0.25, Math.sin(ang) * 0.55);
        s.visible = d < 14;
      });
      if (d < 1.9 && Math.abs(player.pos.y - a.pos.y) < 2.5 && player.alive) {
        a.taken = true;
        a.group.visible = false;
        onCollect(a);
      }
    }
  }

  dispose() {
    for (const a of this.items) { this.scene.remove(a.group); a.rune.material.dispose(); }
    this.items = [];
  }
}
