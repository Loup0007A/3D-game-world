import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// ─── Modèles 3D animés (niveau 101) ─────────────────────────────────
// Fichiers dans public/models (auteurs et licences : public/models/CREDITS.md).
// Chaque modèle est ramené à la taille d'une créature « échelle 1 » du jeu,
// tête vers +Z, puis multiplié par l'échelle du type (TYPES[…].scale).
//   fit  : axe de référence ('z' longueur, 'y' hauteur) et sa taille voulue
//   lift : 'feet' = pieds au sol ; 'center' = centre du corps à la hauteur y
//   clips: nom des animations utiles

export const MODEL_DEFS = {
  drake: { file: 'drake.glb', fit: 'z', size: 5.6, lift: 'center', y: 1.3, clips: { fly: 'Flying' } },
  demon: { file: 'demon-dragon.glb', fit: 'z', size: 6, lift: 'center', y: 1.3, clips: { fly: 'flying_skeletal.3', idle: 'idle_skeletal.3', run: 'running_skeletal.3' } },
  blackDragon: { file: 'black-dragon.glb', fit: 'z', size: 6.4, lift: 'feet', clips: { idle: 'Scene' } },
  manticore: { file: 'manticore.glb', fit: 'z', size: 4.4, lift: 'feet', clips: { idle: 'Armature|idle', walk: 'Armature|walk.forward', attack: 'Armature|attack_front', attack2: 'Armature|attack_side' } },
  golem: { file: 'golem.glb', fit: 'y', size: 2.7, lift: 'feet', clips: { walk: 'Take 001' }, crystals: ['Chest_M', 'Shoulder_R', 'Shoulder_L', 'Head_M', 'Spine2_M'] },
};

// Dossier des modèles : à côté de la page en local, un niveau au-dessus du
// script une fois construit (les pages /1/ … /101/ partagent assets/).
const here = import.meta.url;
const BASE = import.meta.env.DEV || import.meta.env.MODE === 'single' ? './models/' : new URL('../models/', here).href;

const crystalGeo = new THREE.OctahedronGeometry(1, 0).scale(0.35, 1.4, 0.35);

export class ModelLibrary {
  constructor() {
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.templates = {};
    this.ready = null;
  }

  // Charge tous les modèles (une seule fois). Ne rejette jamais : un modèle
  // qui ne charge pas est simplement remplacé par la créature dessinée en code.
  load() {
    if (!this.ready) this.ready = Promise.all(Object.keys(MODEL_DEFS).map((k) => this._load(k))).then(() => { this.done = true; return this; });
    return this.ready;
  }

  async _load(key) {
    const def = MODEL_DEFS[key];
    try {
      const gltf = await this.loader.loadAsync(BASE + def.file);
      const scene = gltf.scene;
      const clips = {};
      for (const [k, name] of Object.entries(def.clips)) {
        const c = gltf.animations.find((a) => a.name === name);
        if (c) clips[k] = c;
      }
      // Pose de référence : début de la première animation.
      const ref = clips.fly || clips.idle || clips.walk;
      const mx = ref ? new THREE.AnimationMixer(scene) : null;
      if (mx) { mx.clipAction(ref).play(); mx.update(0); }
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene, true);
      if (mx) { mx.stopAllAction(); mx.uncacheRoot(scene); }
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const s = def.size / (def.fit === 'y' ? size.y : size.z);
      const offset = new THREE.Vector3(-center.x * s, def.lift === 'feet' ? -box.min.y * s : def.y - center.y * s, -center.z * s);
      scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.frustumCulled = false; // les ailes sortent souvent de la boîte de repos
        }
      });
      this.templates[key] = { scene, clips, s, offset, def };
    } catch (e) {
      console.warn(`Modèle ${def.file} indisponible :`, e?.message || e);
    }
  }

  has(key) { return !!this.templates[key]; }

  // Crée une créature à partir d'un modèle chargé. tint : { color, glow, glowI }
  instance(key, tint = {}) {
    const t = this.templates[key];
    if (!t) return null;
    return new ModelInstance(t, tint);
  }
}

class ModelInstance {
  constructor(t, tint) {
    this.key = t.def.file;
    this.root = new THREE.Group();
    const inner = new THREE.Group();
    inner.scale.setScalar(t.s);
    inner.position.copy(t.offset);
    const model = cloneSkinned(t.scene);
    inner.add(model);
    this.root.add(inner);
    // Matériaux propres à chaque créature (teinte, éclat quand on la touche).
    this.mats = [];
    const tintC = tint.color != null ? new THREE.Color(tint.color) : null;
    this.glowColor = new THREE.Color(tint.glow ?? 0x000000);
    this.glowBase = tint.glowI ?? 0;
    model.traverse((o) => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const cl = list.map((m) => {
        const c = m.clone();
        if (tintC) c.color.multiply(tintC);
        c.userData.baseEmissive = c.emissive ? c.emissive.clone() : null;
        c.userData.baseEmissiveI = c.emissiveIntensity ?? 1;
        c.userData.baseOpacity = c.opacity;
        c.userData.baseTransparent = c.transparent;
        this.mats.push(c);
        return c;
      });
      o.material = Array.isArray(o.material) ? cl : cl[0];
    });
    // Cristaux lumineux accrochés aux os (Béhémoth).
    if (t.def.crystals) this._addCrystals(t.def.crystals, tint.crystal ?? 0x8ff6ff);
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const [k, clip] of Object.entries(t.clips)) {
      const a = this.mixer.clipAction(clip);
      a.time = Math.random() * clip.duration;
      this.actions[k] = a;
    }
    this.current = null;
    // Pose animée dès l'apparition (sinon, pendant la cinématique, la créature
    // resterait dans sa pose de repos d'origine).
    this.play(this.actions.fly ? 'fly' : this.actions.idle ? 'idle' : 'walk');
    this.mixer.update(0);
    this.glow(this.glowBase, this.glowColor);
  }

  _addCrystals(names, color) {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: 0x1890ff, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.2, flatShading: true, transparent: true, opacity: 0.92 });
    this.crystalMat = mat;
    const ws = new THREE.Vector3();
    this.root.updateMatrixWorld(true);
    let k = 0;
    this.root.traverse((o) => {
      if (!o.isBone || !names.some((n) => o.name.startsWith(n))) return;
      o.getWorldScale(ws);
      const unit = 1 / (Math.abs(ws.x) || 1); // 1 m du jeu (à l'échelle 1) dans l'espace de l'os
      const n = o.name.startsWith('Chest') || o.name.startsWith('Spine') ? 4 : 3;
      for (let i = 0; i < n; i++, k++) {
        const c = new THREE.Mesh(crystalGeo, mat);
        const sz = (0.3 + ((k * 37) % 10) / 30) * unit;
        c.scale.setScalar(sz);
        c.position.set(Math.sin(k * 2.3) * 0.25 * unit, Math.cos(k * 1.7) * 0.25 * unit, Math.sin(k * 3.1) * 0.25 * unit);
        c.rotation.set(Math.sin(k) * 1.2, k, Math.cos(k * 1.3) * 1.2);
        c.castShadow = true;
        o.add(c);
      }
    });
  }

  // Joue l'animation « key » en fondu. Sans cette animation, le modèle garde
  // la sienne (marche ralentie au repos, accélérée pour attaquer).
  play(key, timeScale = 1) {
    let k = key;
    if (!this.actions[k]) {
      if (k === 'idle' && this.actions.walk) { k = 'walk'; timeScale *= 0.3; }
      else if (k === 'attack' && this.actions.walk) { k = 'walk'; timeScale *= 1.6; }
      else k = this.current || Object.keys(this.actions)[0];
    }
    const a = this.actions[k];
    if (!a) return;
    a.timeScale = timeScale;
    if (k === this.current) return;
    const prev = this.actions[this.current];
    if (prev) { a.reset().setEffectiveWeight(1).play(); a.crossFadeFrom(prev, 0.3, false); }
    else a.play(); // première animation : on garde la phase tirée au hasard
    this.current = k;
  }

  update(dt) { this.mixer.update(dt); }

  // Éclat (blessure, charge d'une attaque) : intensité et couleur d'émission.
  // Les parties qui brillent déjà (yeux…) gardent leur couleur et s'intensifient.
  glow(intensity, color) {
    const col = color || this.glowColor;
    for (const m of this.mats) {
      if (!m.emissive) continue;
      if (m.emissiveMap) { m.emissiveIntensity = m.userData.baseEmissiveI * (1 + intensity); continue; }
      m.emissive.copy(col);
      m.emissiveIntensity = intensity;
    }
  }

  // Disparition (mort) : k de 1 à 0.
  fade(k) {
    for (const m of this.mats) { m.transparent = true; m.opacity = m.userData.baseOpacity * Math.max(k, 0); m.depthWrite = k > 0.5; }
    if (this.crystalMat) { this.crystalMat.transparent = true; this.crystalMat.opacity = Math.max(k, 0); }
  }

  dispose() {
    this.mixer.stopAllAction();
    for (const m of this.mats) m.dispose();
    this.crystalMat?.dispose();
  }
}
