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
  // Rôdeur : prend son élan (cercle d'avertissement) puis charge en ligne droite.
  charger: { color: 0x9c6b3c, hp: 4, dmg: 22, scale: 1.2, speed: 4.5, score: 25, move: 'charge', horns: true },
  // Grondeur : fonce sur toi, gonfle… et explose.
  bomber: { color: 0xff3b1f, hp: 2, dmg: 30, scale: 0.9, speed: 6.5, score: 20, move: 'hop', bomb: true, glow: 0.6 },
  // Moucherons : petits, rapides, toujours en essaim.
  swarm: { color: 0xc8ff4a, hp: 1, dmg: 5, scale: 0.35, speed: 10, score: 4, move: 'float', glow: 1.2 },
  // Mage des Échos : reste à distance, tire et appelle des renforts.
  summoner: { color: 0x6a5cff, hp: 5, dmg: 8, scale: 1.1, speed: 4, score: 45, move: 'hop', ranged: true, glow: 0.5, summoner: true,
    shot: { kind: 'bolt', dmg: 10, cd: 2.8, range: 26, speed: 22, color: 0xa594ff } },
  // Mimique : déguisée en artefact, elle attend qu'on s'approche.
  mimic: { color: 0xd9a441, hp: 7, dmg: 24, scale: 1.15, speed: 6, score: 80, move: 'hop', mimic: true },
  // ── Niveau caché 101 : créatures originales, très dures ──
  chimera: { color: 0xc8913a, hp: 12, dmg: 30, scale: 1.6, speed: 7, score: 600, move: 'walk', knockMul: 0.15, model: 'chimera', pounce: true,
    shot: { kind: 'bolt', dmg: 18, cd: 2.4, range: 30, speed: 26, count: 3, spread: 2, color: 0xff7a2a } },
  wyvern: { color: 0x3a3f9a, hp: 11, dmg: 26, scale: 1.4, speed: 10, score: 700, move: 'fly', knockMul: 0.1, model: 'wyvern',
    shot: { kind: 'bolt', dmg: 20, cd: 2.2, range: 46, speed: 36, color: 0xbfe6ff } },
  behemoth: { color: 0x5b6470, hp: 28, dmg: 40, scale: 2.2, speed: 3.4, score: 1200, move: 'walk', knockMul: 0.02, stone: true, model: 'behemoth',
    shot: { kind: 'rock', dmg: 30, cd: 3.2, range: 38, speed: 15, count: 2, spread: 3, color: 0x8ff6ff } },
  primordial: { color: 0x2b1d0e, glow: 0.85, hp: 46, dmg: 34, scale: 4.2, speed: 9, score: 10000, move: 'fly', knockMul: 0.0, boss: true, dragon: true, primordial: true,
    shot: { kind: 'bolt', dmg: 22, cd: 1.8, range: 70, speed: 30, count: 7, spread: 2.6, color: 0xffd34d } },
  // Dragon : gardien des joueurs dont la Puissance atteint 90. Vole, plonge
  // sur sa cible et crache des gerbes de feu.
  dragon: { color: 0x8a1424, hp: 34, dmg: 26, scale: 2.1, speed: 8, score: 1500, move: 'fly', knockMul: 0.04, boss: true, dragon: true,
    shot: { kind: 'bolt', dmg: 15, cd: 2.6, range: 48, speed: 26, count: 5, spread: 2.2, color: 0xff6a1a } },
};

// Modèle du dragon (formes simples, ailes animées).
function buildDragon(mat, o = {}) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: o.horn ?? 0x2a0a10, roughness: 0.6, flatShading: true, emissive: o.hornGlow ?? 0x000000, emissiveIntensity: 0.8 });
  const wingMat = new THREE.MeshStandardMaterial({ color: o.wing ?? 0x5a0d18, emissive: o.wingGlow ?? 0x300008, emissiveIntensity: 0.4, roughness: 0.7, side: THREE.DoubleSide, flatShading: true });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), mat);
  body.scale.set(0.9, 0.8, 1.7);
  body.position.y = 1.2;
  body.castShadow = true;
  g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 1.3, 8).rotateX(-Math.PI / 3), mat);
  neck.position.set(0, 1.75, 1.35);
  g.add(neck);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.1, 6).rotateX(Math.PI / 2), mat);
  head.position.set(0, 2.25, 2.15);
  g.add(head);
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 5), dark);
    horn.position.set(sx * 0.2, 2.6, 1.85);
    horn.rotation.x = -0.7;
    g.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: o.eye ?? 0xffb020 }));
    eye.position.set(sx * 0.2, 2.38, 2.3);
    g.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.6, 7).rotateX(-Math.PI / 2), mat);
  tail.position.set(0, 1.05, -2.2);
  g.add(tail);
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.lineTo(3.4, 0.5); wingShape.lineTo(2.6, -0.6); wingShape.lineTo(1.6, -0.3); wingShape.lineTo(0.9, -1.0); wingShape.lineTo(0, -0.7);
  const wingGeo = new THREE.ShapeGeometry(wingShape).rotateX(-Math.PI / 2);
  const wings = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.5, 1.55, 0.3);
    const w = new THREE.Mesh(wingGeo, wingMat);
    w.scale.set(sx * (o.wingScale ?? 1), 1, o.wingScale ?? 1);
    w.castShadow = true;
    pivot.add(w);
    g.add(pivot);
    wings.push(pivot);
  }
  // Primordial : couronne de cornes et épines dorsales lumineuses.
  if (o.crown) {
    for (let k = 0; k < 5; k++) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.8, 5), dark);
      h.position.set((k - 2) * 0.13, 2.65, 1.75 - Math.abs(k - 2) * 0.05);
      h.rotation.x = -0.4;
      h.rotation.z = (k - 2) * 0.25;
      g.add(h);
    }
    for (let k = 0; k < 6; k++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 4), dark);
      sp.position.set(0, 1.85 - k * 0.04, 0.9 - k * 0.45);
      g.add(sp);
    }
  }
  return { group: g, body, wings, wingMat };
}

// ─── Le Primordial (niveau 101), modélisé à la main ──────────────────
// Obsidienne fissurée d'or, crâne à mâchoire mobile, quatre yeux, cornes
// recourbées, couronne flottante, ailes membraneuses à doigts d'os, cage
// thoracique ouverte sur un cœur qui bat, queue terminée par une lame et aura.

// Texture de fissures lumineuses (utilisée comme carte d'émission).
function crackTexture(w = 512, h = 256, n = 46, seed = 7) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  let r = seed;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI * 2;
    const len = 6 + Math.floor(rnd() * 14);
    g.strokeStyle = `rgba(255,${190 + Math.floor(rnd() * 60)},120,${0.55 + rnd() * 0.45})`;
    g.shadowColor = '#ffb040';
    g.shadowBlur = 6;
    g.lineWidth = 1 + rnd() * 2.2;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < len; k++) {
      a += (rnd() - 0.5) * 1.1;
      x += Math.cos(a) * 9; y += Math.sin(a) * 9;
      g.lineTo(x, y);
      if (rnd() < 0.18) { g.moveTo(x, y); a += (rnd() < 0.5 ? -1 : 1) * 0.9; }
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Tube effilé le long d'une courbe (cornes, doigts des ailes).
function taperedTube(points, r0, r1 = r0 * 0.12, segs = 14, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const p = geo.attributes.position;
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, c);
    const rr = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(p, idx).sub(c).multiplyScalar(rr).add(c);
      p.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

// Os entre deux points (ailes, côtes).
function boneBetween(a, b, r0, r1, mat) {
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, d.length(), 6), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  return m;
}

const glowSprite = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,220,140,0.8)');
  gr.addColorStop(1, 'rgba(255,160,40,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

function buildPrimordial(mat) {
  const g = new THREE.Group();
  const cracks = crackTexture();
  mat.color.set(0x17131b);
  mat.emissive.set(0xffb030);
  mat.emissiveMap = cracks;
  mat.metalness = 0.55;
  mat.roughness = 0.36;
  mat.flatShading = false;
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xcdbf9e, roughness: 0.55, metalness: 0.05 });
  const hornMat = new THREE.MeshStandardMaterial({ color: 0x1d1719, roughness: 0.4, metalness: 0.4, emissive: 0x6a2a00, emissiveIntensity: 0.35 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xc08000, emissiveIntensity: 1.6, metalness: 0.9, roughness: 0.25 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  const membraneTex = crackTexture(256, 256, 30, 99);
  const membrane = new THREE.MeshStandardMaterial({ color: 0x2c0a0e, emissive: 0xff5a14, emissiveMap: membraneTex, emissiveIntensity: 0.9, roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.94 });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffc040 });
  const add = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };

  // Corps : long ovoïde d'obsidienne, cage thoracique d'os sur le poitrail,
  // et le cœur qui brille entre les côtes.
  const back = add(new THREE.SphereGeometry(1, 24, 16), mat, 0, 1.35, -0.1);
  back.scale.set(0.9, 0.82, 2.05);
  const hips = add(new THREE.SphereGeometry(0.7, 16, 12), mat, 0, 1.2, -1.5);
  hips.scale.set(1.05, 0.9, 1.2);
  for (let k = 0; k < 5; k++) {
    const z = 1.15 - k * 0.32;
    const rib = add(new THREE.TorusGeometry(0.86 - k * 0.03, 0.045, 6, 20, Math.PI * 0.9), boneMat, 0, 1.33, z);
    rib.rotation.set(0.12, 0, Math.PI * 1.05);
  }
  const core = add(new THREE.SphereGeometry(0.34, 16, 12), coreMat, 0, 0.82, 0.75);
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite, color: 0xffb030, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  coreGlow.scale.setScalar(2.4);
  core.add(coreGlow);

  // Cou : long, lisse, en col de cygne, hérissé d'épines.
  const neckPts = [];
  for (let k = 0; k < 7; k++) {
    const t = k / 6;
    neckPts.push(new THREE.Vector3(0, 1.7 + Math.sin(t * Math.PI * 0.62) * 1.55, 1.3 + t * 1.75 - Math.sin(t * Math.PI) * 0.25));
  }
  const neck = new THREE.Mesh(taperedTube(neckPts, 0.5, 0.27, 16, 10), mat);
  neck.castShadow = true;
  g.add(neck);
  neckPts.forEach((p, k) => {
    if (k === 0) return;
    const sp = add(new THREE.ConeGeometry(0.07, 0.5 - k * 0.04, 5), hornMat, p.x, p.y + 0.38 - k * 0.02, p.z - 0.1);
    sp.rotation.x = -0.65;
  });

  // Tête (groupe à part : elle suit la cible) : crâne, museau, mâchoire, dents, yeux, cornes.
  const head = new THREE.Group();
  const hp = neckPts[6];
  head.position.set(hp.x, hp.y + 0.1, hp.z + 0.2);
  g.add(head);
  const skull = add(new THREE.SphereGeometry(0.45, 16, 12), mat, 0, 0.05, 0, head);
  skull.scale.set(0.85, 0.72, 1.15);
  const snout = add(new THREE.ConeGeometry(0.3, 1.15, 7).rotateX(Math.PI / 2), mat, 0, -0.02, 0.75, head);
  snout.scale.set(1, 0.62, 1);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.2, 0.15);
  head.add(jaw);
  const jawM = add(new THREE.ConeGeometry(0.24, 1.05, 6).rotateX(Math.PI / 2), mat, 0, 0, 0.55, jaw);
  jawM.scale.set(1, 0.45, 1);
  for (let k = 0; k < 6; k++) {
    for (const sx of [-1, 1]) {
      const z = 0.35 + k * 0.15;
      const tooth = add(new THREE.ConeGeometry(0.035, 0.18 - k * 0.012, 4), boneMat, sx * (0.17 - k * 0.022), -0.16, z, head);
      tooth.rotation.x = Math.PI;
      const low = add(new THREE.ConeGeometry(0.03, 0.14 - k * 0.01, 4), boneMat, sx * (0.14 - k * 0.018), 0.08, z + 0.05 - 0.15, jaw);
      low.position.z = 0.25 + k * 0.14;
    }
  }
  const eyes = [];
  for (const sx of [-1, 1]) {
    for (const [dy, dz, r] of [[0.12, 0.32, 0.075], [0.02, 0.2, 0.05]]) {
      const e = add(new THREE.SphereGeometry(r, 8, 6), eyeMat, sx * 0.27, dy, dz, head);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite, color: 0xffe080, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glow.scale.setScalar(r * 4.2);
      e.add(glow);
      eyes.push(glow);
    }
    // Grandes cornes recourbées vers l'arrière, puis vers le haut.
    head.add(Object.assign(new THREE.Mesh(taperedTube([
      new THREE.Vector3(sx * 0.25, 0.2, -0.1), new THREE.Vector3(sx * 0.55, 0.45, -0.6), new THREE.Vector3(sx * 0.7, 0.4, -1.25),
      new THREE.Vector3(sx * 0.62, 0.85, -1.75), new THREE.Vector3(sx * 0.45, 1.35, -1.6),
    ], 0.13, 0.015, 18), hornMat), { castShadow: true }));
    // Cornes secondaires
    for (let k = 0; k < 2; k++) {
      head.add(new THREE.Mesh(taperedTube([
        new THREE.Vector3(sx * (0.2 + k * 0.08), 0.28 - k * 0.12, -0.2 - k * 0.1), new THREE.Vector3(sx * (0.45 + k * 0.15), 0.35 - k * 0.2, -0.75 - k * 0.15), new THREE.Vector3(sx * (0.5 + k * 0.2), 0.55 - k * 0.3, -1.1 - k * 0.2),
      ], 0.06, 0.01, 10), hornMat));
    }
  }
  // Couronne d'or qui flotte au-dessus du crâne.
  const crown = new THREE.Group();
  crown.position.set(0, 0.95, -0.25);
  head.add(crown);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const sp = add(new THREE.ConeGeometry(0.06, 0.45 + (k % 3 === 0 ? 0.25 : 0), 5), gold, Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, crown);
    sp.rotation.z = -Math.cos(a) * 0.25;
    sp.rotation.x = Math.sin(a) * 0.25;
  }
  const ring = add(new THREE.TorusGeometry(0.5, 0.025, 6, 32), gold, 0, -0.18, 0, crown);
  ring.rotation.x = Math.PI / 2;

  // Épines dorsales, de plus en plus grandes vers les épaules.
  for (let k = 0; k < 7; k++) {
    const z = 0.9 - k * 0.42;
    const h = 0.55 + Math.sin((k / 6) * Math.PI) * 0.45;
    const sp = add(new THREE.ConeGeometry(0.11, h, 5), hornMat, 0, 2.05 - k * 0.04 + h * 0.3, z);
    sp.rotation.x = -0.55;
  }

  // Pattes repliées sous le corps (cuisse, jambe, griffes d'os).
  for (const [x, z, r, front] of [[-0.62, 0.95, 0.16, 1], [0.62, 0.95, 0.16, 1], [-0.72, -1.45, 0.24, 0], [0.72, -1.45, 0.24, 0]]) {
    const hip = new THREE.Vector3(x, 1.15, z);
    const knee = new THREE.Vector3(x * 1.08, 0.62, z + (front ? 0.35 : -0.25));
    const foot = new THREE.Vector3(x * 1.05, 0.38, z - (front ? 0.25 : 0.85));
    g.add(boneBetween(hip, knee, r, r * 0.8, mat), boneBetween(knee, foot, r * 0.75, r * 0.5, mat));
    for (let c = -1; c <= 1; c++) {
      const cl = add(new THREE.ConeGeometry(0.04, 0.32, 4), boneMat, foot.x + c * 0.08, foot.y - 0.08, foot.z - 0.12);
      cl.rotation.x = -2.2;
    }
  }

  // Queue : six segments effilés articulés (elle fouette l'air), épines et
  // une lame d'or au bout.
  const tail = [];
  let parent = g;
  let r0 = 0.5;
  const seg0 = new THREE.Group();
  seg0.position.set(0, 1.18, -2.15);
  g.add(seg0);
  parent = seg0;
  for (let k = 0; k < 6; k++) {
    const len = 0.85 - k * 0.04, r1 = r0 * 0.72;
    const piece = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 10).rotateX(Math.PI / 2).translate(0, 0, -len / 2), mat);
    piece.castShadow = true;
    parent.add(piece);
    const sp = add(new THREE.ConeGeometry(0.06, 0.4 * (1 - k * 0.12), 4), hornMat, 0, r0 * 0.85, -len * 0.4, parent);
    sp.rotation.x = -0.7;
    const joint = new THREE.Group();
    joint.position.set(0, -0.03, -len);
    joint.rotation.x = 0.05;
    parent.add(joint);
    tail.push(joint);
    parent = joint;
    r0 = r1;
  }
  const blade = add(new THREE.ConeGeometry(0.22, 1.0, 4).rotateX(-Math.PI / 2), gold, 0, 0, -0.45, parent);
  blade.scale.set(1.7, 0.22, 1);

  // Ailes : bras, doigts d'os et membrane festonnée.
  const wings = [];
  const S = (x, y) => new THREE.Vector3(x, 0, -y); // forme (x vers l'extérieur, y vers l'arrière) → aile
  const wrist = [2.0, -0.25];
  const tips = [[4.7, 0.35], [4.2, 1.5], [3.25, 2.3], [2.0, 2.5]];
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(wrist[0], wrist[1]);
  shape.lineTo(tips[0][0], tips[0][1]);
  for (let k = 1; k < tips.length; k++) {
    const [ax, ay] = tips[k - 1], [bx, by] = tips[k];
    shape.quadraticCurveTo((ax + bx) / 2 - (ax + bx - 2 * wrist[0]) * 0.18, (ay + by) / 2 - (ay + by - 2 * wrist[1]) * 0.18, bx, by);
  }
  shape.quadraticCurveTo(1.1, 1.6, 0.15, 1.85);
  shape.lineTo(0, 0);
  const memGeo = new THREE.ShapeGeometry(shape, 10).rotateX(-Math.PI / 2);
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.62, 1.95, 0.45);
    // Ailes relevées en V et un peu rejetées en arrière : visibles même de profil.
    const raise = new THREE.Group();
    raise.rotation.set(0, -sx * 0.15, sx * 0.4);
    raise.scale.setScalar(1.2);
    pivot.add(raise);
    const wing = new THREE.Group();
    wing.scale.set(sx, 1, 1);
    raise.add(wing);
    const mem = new THREE.Mesh(memGeo, membrane);
    mem.castShadow = true;
    wing.add(mem);
    wing.add(boneBetween(S(0, 0), S(...wrist), 0.11, 0.08, boneMat));
    for (const tp of tips) wing.add(boneBetween(S(...wrist), S(...tp), 0.06, 0.02, boneMat));
    const claw = add(new THREE.ConeGeometry(0.06, 0.35, 4), boneMat, wrist[0], 0.1, -wrist[1] + 0.15, wing);
    claw.rotation.x = 0.8;
    g.add(pivot);
    wings.push(pivot);
  }

  // Aura : poussière d'or et de néant qui tourne autour du corps.
  const N = 260;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const ca = new THREE.Color(0xffc040), cb = new THREE.Color(0x9a40ff);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 2.6, y = 0.4 + Math.random() * 2.8;
    pos.set([Math.cos(a) * r, y, Math.sin(a) * r * 1.3], i * 3);
    const c = Math.random() < 0.7 ? ca : cb;
    col.set([c.r, c.g, c.b], i * 3);
  }
  const ag = new THREE.BufferGeometry();
  ag.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  ag.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const aura = new THREE.Points(ag, new THREE.PointsMaterial({ size: 0.13, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(aura);

  // Animation propre : cœur qui bat, mâchoire, queue, couronne, aura.
  // Moitié des PV : tout vire au rouge.
  const red = new THREE.Color(0xff2a10), goldC = new THREE.Color(0xffb030);
  let enraged = false;
  const animate = (t, dt, s) => {
    const rage = s.hp < s.maxHp * 0.5;
    if (rage !== enraged) {
      enraged = rage;
      const c = rage ? red : goldC;
      mat.emissive.copy(c); coreMat.color.copy(c); coreGlow.material.color.copy(c);
      eyes.forEach((e) => e.material.color.copy(rage ? red : new THREE.Color(0xffe080)));
      membrane.emissive.copy(rage ? red : new THREE.Color(0xff5a14));
    }
    const beat = Math.pow(Math.max(0, Math.sin(t * (rage ? 5 : 3))), 8);
    core.scale.setScalar(1 + beat * 0.35);
    coreGlow.material.opacity = 0.55 + beat * 0.45;
    const open = s.windT >= 0 ? 0.55 : 0.08 + Math.max(0, Math.sin(t * 0.7)) * 0.1;
    jaw.rotation.x = THREE.MathUtils.lerp(jaw.rotation.x, open, 1 - Math.exp(-dt * 10));
    tail.forEach((j, k) => { j.rotation.y = Math.sin(t * 1.7 - k * 0.55) * 0.16; j.rotation.x = 0.05 + Math.sin(t * 1.1 - k * 0.4) * 0.05; });
    crown.rotation.y += dt * 0.6;
    crown.position.y = 0.95 + Math.sin(t * 2) * 0.05;
    aura.rotation.y -= dt * 0.35;
    head.rotation.z = Math.sin(t * 0.9) * 0.06;
  };
  return { group: g, body: back, wings, wingMat: membrane, tail, animate };
}

// Chimère : corps de lion, tête de chèvre sur le dos, queue de serpent.
function buildChimera(mat) {
  const g = new THREE.Group();
  const mane = new THREE.MeshStandardMaterial({ color: 0x6b3a12, roughness: 0.9, flatShading: true });
  const goatMat = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.7, flatShading: true });
  const snakeMat = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.4, flatShading: true });
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xff6020 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.4, 6, 12).rotateX(Math.PI / 2), mat);
  body.position.y = 1.1;
  body.castShadow = true;
  g.add(body);
  for (const [x, z] of [[-0.35, 0.6], [0.35, 0.6], [-0.35, -0.6], [0.35, -0.6]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.9, 7), mat);
    leg.position.set(x, 0.45, z);
    g.add(leg);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), mat);
  head.position.set(0, 1.55, 1.25);
  g.add(head);
  const maneM = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), mane);
  maneM.scale.set(1, 1, 0.7);
  maneM.position.set(0, 1.5, 1.05);
  g.add(maneM);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.35), mat);
  jaw.position.set(0, 1.38, 1.55);
  g.add(jaw);
  // Tête de chèvre sur le dos
  const goat = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 6).rotateX(Math.PI / 2.4), goatMat);
  goat.position.set(0, 1.95, 0.1);
  g.add(goat);
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 5, 10, Math.PI * 1.2), goatMat);
    horn.position.set(sx * 0.14, 2.1, 0.05);
    horn.rotation.set(0, sx * 1.2, 0);
    g.add(horn);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), eyeM);
    e.position.set(sx * 0.16, 1.65, 1.6);
    g.add(e);
  }
  // Queue-serpent
  const tail = [];
  for (let k = 0; k < 6; k++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(0.16 - k * 0.012, 8, 6), snakeMat);
    seg.position.set(0, 1.2 + k * 0.18, -1.0 - k * 0.22);
    g.add(seg);
    tail.push(seg);
  }
  const snakeHead = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.35, 6).rotateX(-Math.PI / 2), snakeMat);
  snakeHead.position.set(0, 2.35, -2.25);
  g.add(snakeHead);
  return { group: g, body, tail };
}

// Béhémoth de Cristal : bloc de roche hérissé de cristaux.
function buildBehemoth(mat) {
  const g = new THREE.Group();
  const crystal = new THREE.MeshStandardMaterial({ color: 0x8ff6ff, emissive: 0x30c8ff, emissiveIntensity: 1.2, roughness: 0.1, metalness: 0.3, flatShading: true });
  const body = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), mat);
  body.scale.set(1.2, 0.85, 1.5);
  body.position.y = 1.3;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), mat);
  head.position.set(0, 1.4, 1.7);
  g.add(head);
  for (const [x, z] of [[-0.8, 0.8], [0.8, 0.8], [-0.8, -0.8], [0.8, -0.8]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 1.0, 6), mat);
    leg.position.set(x, 0.5, z);
    g.add(leg);
  }
  for (let k = 0; k < 9; k++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.18 + (k % 3) * 0.06, 0.9 + (k % 4) * 0.3, 5), crystal);
    c.position.set(Math.sin(k * 2.4) * 0.7, 2.1 + (k % 2) * 0.1, -0.9 + (k / 8) * 1.8);
    c.rotation.set(Math.sin(k) * 0.4, 0, Math.cos(k * 1.7) * 0.4);
    g.add(c);
  }
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color: 0x8ff6ff }));
    e.position.set(sx * 0.22, 1.55, 2.2);
    g.add(e);
  }
  return { group: g, body };
}

// Variantes de dragons (niveau 101).
export const DRAGON_TINTS = {
  fire: { body: 0x8a1424, wing: 0x5a0d18, wingGlow: 0x401000, shot: 0xff6a1a, eye: 0xffb020 },
  frost: { body: 0x3a7fb8, wing: 0x9fd8ff, wingGlow: 0x103050, shot: 0xb8f0ff, eye: 0xe0ffff },
  void: { body: 0x2a1048, wing: 0x5a2a90, wingGlow: 0x300060, shot: 0xb070ff, eye: 0xff40ff },
};

// Niveau 101 : modèle 3D (entities/models.js) et teinte de chaque créature.
// Clé = type, ou « type:teinte » pour les trois dragons.
export const MODEL_ROLES = {
  wyvern: { key: 'drake', color: 0x9aa2c4, glow: 0x3a58ff, glowI: 0.05 },
  chimera: { key: 'manticore', glow: 0xff5a1a, glowI: 0.04 },
  behemoth: { key: 'golem', color: 0x8c98b0, glow: 0x30c8ff, glowI: 0.06, crystal: 0x5fdcff, hitR: 1.15 },
  'dragon:fire': { key: 'demon', glow: 0xff4010, glowI: 0.1 },
  'dragon:frost': { key: 'drake', color: 0xd8f0ff, glow: 0x60c8ff, glowI: 0.16 },
  'dragon:void': { key: 'blackDragon', color: 0xb8a8d8, glow: 0x6a20d0, glowI: 0.05, move: 'perch', hitR: 1.1 },
};

// Renfort général des Échos (équilibré pour rester jouable dès la 1re histoire).
const BUFF = { hp: 1.3, dmg: 1.2, speed: 1.2, aggro: 1.25, density: 1.1 };
// Tirs : rares et lents à préparer au début, plus nourris dans les dernières
// histoires (tier = 0 → 1 selon la difficulté de l'histoire).
const SHOT = { cdEarly: 1.8, cdLate: 1.0, windEarly: 0.7, windLate: 0.42, dmgEarly: 0.6, dmgLate: 1.0 };

// Ordre d'apparition des nouveaux Échos au fil des histoires.
export const ENEMY_UNLOCK = { wisp: 4, charger: 9, spitter: 14, bomber: 21, golem: 28, swarm: 36, shade: 44, summoner: 55, mimic: 63 };

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
const hornMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.5 });
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
const eliteMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
const hurtGlow = new THREE.Color(0xff5030);
const deathGlow = new THREE.Color(0xffd080);
const rootGlow = new THREE.Color(0x4a9a20);
const shotGlow = new THREE.Color();
const rootMat = new THREE.MeshStandardMaterial({ color: 0x6fae45, emissive: 0x2c5a18, emissiveIntensity: 0.6, roughness: 0.9, flatShading: true });

class Slime {
  constructor(type, pos, mods, inst = null) {
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
    if (inst) {
      // Créature du niveau 101 représentée par un modèle 3D animé.
      this.mat.transparent = false;
      this.mat.opacity = 1;
      this.model = inst;
      this.object = inst.root;
      this.wings = [];
      this.object.scale.setScalar(T.scale);
      this.flyY = 9;
      this.diveCd = 6;
      return;
    }
    if (T.dragon || T.model) {
      this.mat.transparent = false;
      this.mat.opacity = 1;
      this.mat.roughness = 0.45;
      this.mat.flatShading = true;
      let d;
      if (T.model === 'chimera') d = buildChimera(this.mat);
      else if (T.model === 'behemoth') d = buildBehemoth(this.mat);
      else if (T.model === 'wyvern') { this.mat.emissiveIntensity = 0.3; d = buildDragon(this.mat, { wing: 0x6a74d8, wingGlow: 0x1a2060, eye: 0xbfe6ff, wingScale: 1.3 }); }
      else if (T.primordial) { d = buildPrimordial(this.mat); this.hitR = 0.9; }
      else d = buildDragon(this.mat);
      this.body = d.body;
      this.wings = d.wings;
      this.wingMat = d.wingMat;
      this.tail = d.tail;
      if (d.animate) this.animate = (t, dt) => d.animate(t, dt, this);
      this.object = d.group;
      this.object.scale.setScalar(T.scale);
      this.flyY = T.primordial ? 14 : 9;
      this.diveCd = 6;
      return;
    }
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
    if (T.horns) {
      for (const sx of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.55, 6), hornMat);
        horn.position.set(sx * 0.32, 0.78, 0.35);
        horn.rotation.set(0.9, 0, -sx * 0.5);
        g.add(horn);
      }
    }
    if (T.bomb) {
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 5), hornMat);
      fuse.position.y = 0.95;
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), sparkMat);
      spark.position.y = 1.15;
      g.add(fuse, spark);
      this.spark = spark;
    }
    if (T.summoner) {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 7), new THREE.MeshStandardMaterial({ color: 0x2a2060, roughness: 0.7 }));
      hat.position.y = 1.15;
      g.add(hat);
    }
    if (T.mimic) {
      // Déguisement : une pierre runique comme les artefacts cachés.
      const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff7a00, emissiveIntensity: 0.9, roughness: 0.25, flatShading: true }));
      rune.scale.y = 1.6;
      rune.position.y = 0.75;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0x5d5650, roughness: 0.95, flatShading: true }));
      base.position.y = 0.1;
      this.disguise = new THREE.Group();
      this.disguise.add(rune, base);
      this.disguiseRune = rune;
      for (let k = 0; k < 6; k++) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), eyeMat);
        tooth.position.set(-0.3 + k * 0.12, 0.3, 0.6);
        tooth.rotation.x = Math.PI;
        g.add(tooth);
      }
    }
    if (T.ranged) {
      const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.35, 8).rotateX(Math.PI / 2), this.mat);
      snout.position.set(0, 0.45, 0.62);
      g.add(snout);
    }
    this.body = body;
    this.object = g;
    if (this.disguise) {
      // Tant qu'elle se cache, seule la pierre runique est visible.
      g.children.forEach((c) => { c.visible = false; });
      g.add(this.disguise);
      this.disguised = true;
    }
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
    this.godMode = false;
    this.meteors = [];
    this.setDifficulty(diff);
  }

  // diff : { hp, dmg, speed, density, kingChance, aggro, types: [...] }
  setDifficulty(diff) {
    const d = { hp: 1, dmg: 1, speed: 1, density: 1, kingChance: 0.04, aggro: 26, types: [], ...diff };
    this.diff = {
      eliteChance: 0.04,
      ...d,
      hp: d.hp * BUFF.hp,
      dmg: d.dmg * BUFF.dmg,
      speed: d.speed * BUFF.speed,
      aggro: d.aggro * BUFF.aggro,
      density: d.density * BUFF.density,
    };
    // 0 à la 1re histoire, 1 à la 100e (diff.dmg va de 1 à 2,4).
    this.tier = clamp((d.dmg - 1) / 1.4, 0, 1);
    this.windup = lerp(SHOT.windEarly, SHOT.windLate, this.tier);
  }

  spawn(type, pos, opts = {}) {
    const mods = TYPES[type].boss ? { hp: this.diff.hp * (this.diff.bossHp ?? 1), dmg: this.diff.dmg, speed: Math.min(this.diff.speed, 1.3 * BUFF.speed) } : this.diff;
    const role = this.models ? MODEL_ROLES[opts.tint ? `${type}:${opts.tint}` : type] : null;
    const inst = role ? this.models.instance(role.key, role) : null;
    const s = new Slime(type, pos, mods, inst);
    if (inst) {
      s.hitR = role.hitR ?? 1;
      if (role.move) s.T = { ...s.T, move: role.move };
    }
    if (opts.notBoss) s.T = { ...s.T, boss: false };
    if (opts.tint && DRAGON_TINTS[opts.tint]) {
      const t = DRAGON_TINTS[opts.tint];
      s.mat.color.set(t.body); s.mat.emissive.set(t.body);
      if (s.wingMat) { s.wingMat.color.set(t.wing); s.wingMat.emissive.set(t.wingGlow); }
      s.T = { ...s.T, color: t.body, shot: { ...s.T.shot, color: t.shot } };
    }
    if (opts.hpMul) { s.hp = s.maxHp = Math.round(s.maxHp * opts.hpMul); }
    if (type === 'wisp' || type === 'swarm' || s.T.move === 'fly') s.pos.y += s.flyY;
    s.object.position.copy(s.pos);
    // Élite : plus grosse, plus dure, couronnée d'or… et toujours un butin.
    if (opts.elite || (!s.T.boss && type !== 'swarm' && type !== 'mimic' && Math.random() < this.diff.eliteChance)) this._makeElite(s);
    this.list.push(s);
    this.scene.add(s.object);
    if (s.T.boss) { this.boss = s; s.summonCd = 8; s.leapCd = 5; s.volleyCd = 6; }
    return s;
  }

  _makeElite(s) {
    s.elite = true;
    s.hp = s.maxHp = Math.max(2, Math.round(s.maxHp * 2.5));
    s.T = { ...s.T, dmg: Math.round(s.T.dmg * 1.3), scale: s.T.scale * 1.3, score: s.T.score * 4, knockMul: (s.T.knockMul ?? 1) * 0.5 };
    s.object.scale.setScalar(s.T.scale);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 24), eliteMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 1.25;
    s.object.add(halo);
    s.halo = halo;
  }

  // Moucherons : toujours en essaim.
  spawnSwarm(pos, n = 5) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.spawn('swarm', pos.clone().add(new THREE.Vector3(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5)));
    }
  }

  // Mimiques posées à la création de l'île (elles ne bougent pas avant qu'on approche).
  placeMimics(points) {
    for (const p of points) {
      const m = this.spawn('mimic', p);
      m.guard = p.clone();
    }
  }

  _typeFor(x, z, night) {
    const b = this.terrain.biomeAt(x, z);
    const types = this.diff.types;
    const r = Math.random();
    if (r < this.diff.kingChance) return 'king';
    // Nouveaux Échos selon l'histoire.
    if (types.includes('summoner') && Math.random() < 0.07) return 'summoner';
    if (types.includes('shade') && night > 0.5 && Math.random() < 0.18) return 'shade';
    if (types.includes('swarm') && Math.random() < 0.12) return 'swarm';
    if (types.includes('bomber') && Math.random() < 0.13) return 'bomber';
    if (types.includes('charger') && (b !== BIOME.SWAMP) && Math.random() < 0.16) return 'charger';
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
      dmg: opts.dmg ?? Math.round(11 * this.diff.dmg * lerp(SHOT.dmgEarly, SHOT.dmgLate, this.tier)),
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
        dmg: Math.max(1, Math.round(sh.dmg * this.diff.dmg * lerp(SHOT.dmgEarly, SHOT.dmgLate, this.tier))),
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
          const t = this._typeFor(x, z, night);
          if (t === 'swarm') this.spawnSwarm(new THREE.Vector3(x, h, z));
          else this.spawn(t, new THREE.Vector3(x, h, z));
          break;
        }
      }
    }

    for (const s of this.list) {
      if (s.dying >= 0) {
        s.dying += dt;
        const k = 1 - s.dying / 0.35;
        if (s.model) {
          // Grande créature : elle s'effondre et s'efface, sans s'aplatir.
          s.object.scale.setScalar(s.T.scale * (1 - s.dying * 0.4));
          s.object.position.y -= dt * 4;
          s.model.fade(k);
          s.model.glow(2.5 * k, deathGlow);
          s.model.update(dt * 0.5);
          continue;
        }
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

      if (s.disguised) {
        // Mimique déguisée : immobile, scintille comme un artefact… jusqu'à ce qu'on approche.
        s.disguiseRune.rotation.y += dt * 1.2;
        s.disguiseRune.material.emissiveIntensity = 0.35 + Math.max(0, 1 - dist / 14) * 2.2;
        s.object.position.copy(s.pos);
        if (dist < 4 && player.alive) {
          s.disguised = false;
          s.disguise.visible = false;
          s.object.children.forEach((c) => { if (c !== s.disguise && c !== s.halo) c.visible = true; });
          s.vel.set(0, 9, 0);
          s.onGround = false;
          s.attackCd = 0.4;
          this.events.push({ type: 'mimic', pos: s.pos.clone() });
        }
        continue;
      }
      if (s.T.boss && s.net && performance.now() - s.net.at < 1500) {
        // Raid : le boss est dirigé par l'hôte, on suit sa position.
        s.pos.lerp(s.net.pos, 1 - Math.exp(-dt * 8));
        s.object.rotation.y = lerpAngle(s.object.rotation.y, s.net.ry, dt * 8);
        s.onGround = mv !== 'fly';
        if (s.wings) s.wings.forEach((w, k) => { w.rotation.z = (k ? -1 : 1) * Math.sin(elapsed * 6) * 0.6; });
      } else if (mv === 'fly') {
        // Dragon : tourne au-dessus de sa cible, plonge régulièrement.
        s.diveCd -= sdt;
        const ground = Math.max(T.heightAt(s.pos.x, s.pos.z), SEA_LEVEL);
        let goal;
        if (s.resting > 0) {
          // Posé au sol après un piqué : c'est le moment de frapper.
          s.resting -= sdt;
          goal = new THREE.Vector3(s.pos.x, ground + 1.2, s.pos.z);
        } else if (s.diving > 0) {
          s.diving -= sdt;
          goal = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
          if (s.diving <= 0 || dist < 3) { s.diving = 0; s.resting = 2.8; }
        } else {
          const a = s.phase * 0.45;
          const c = aggro ? player.pos : (s.guard || s.pos);
          goal = new THREE.Vector3(c.x + Math.cos(a) * 14, Math.max(T.heightAt(c.x, c.z), SEA_LEVEL) + s.flyY, c.z + Math.sin(a) * 14);
          if (aggro && s.diveCd <= 0 && dist < 40) {
            s.diving = 1.6;
            s.diveCd = 5 + Math.random() * 3;
            this._ring(player.pos, 4, 0xff5020, 1.0);
          }
        }
        const want = goal.sub(s.pos);
        const l = want.length();
        const sp = s.T.speed * (s.diving > 0 ? 2.4 : s.resting > 0 ? 0.3 : 1);
        if (l > 0.01) want.multiplyScalar(Math.min(sp, l * 2) / l);
        if (!rooted) s.vel.lerp(want, 1 - Math.exp(-sdt * 2.5));
        else s.vel.multiplyScalar(0.8);
        s.pos.addScaledVector(s.vel, sdt);
        if (s.pos.y < ground + 1.2) s.pos.y = ground + 1.2;
        s.onGround = false;
        const face = aggro && s.diving <= 0 ? Math.atan2(toP.x, toP.z) : Math.atan2(s.vel.x, s.vel.z);
        s.object.rotation.y = lerpAngle(s.object.rotation.y, face, sdt * 4);
        s.wings.forEach((w, k) => { w.rotation.z = (k ? -1 : 1) * Math.sin(elapsed * (s.diving > 0 ? 3 : 6)) * (s.diving > 0 ? 0.2 : 0.65); });
      } else if (mv === 'float') {
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
        // Golem, Béhémoth, Chimère : marche lourde, frappe le sol (cercle d'avertissement).
        const slamR = 3.6 * Math.max(1, s.T.scale / 1.55);
        // Chimère : bond sur sa proie, onde à l'atterrissage.
        if (s.T.pounce) {
          s.pounceCd = (s.pounceCd ?? 2.5) - sdt;
          if (s.pouncing && s.landed) {
            s.pouncing = false;
            this.events.push({ type: 'slam', pos: s.pos.clone(), radius: 4 });
            this._areaDamage(player, s.pos, 4, s.T.dmg);
          } else if (!s.pouncing && aggro && !rooted && s.onGround && s.pounceCd <= 0 && dist > 5 && dist < 20) {
            const t = 0.9;
            s.vel.set(toP.x / t, 0.5 * 24 * t, toP.z / t);
            s.onGround = false;
            s.pouncing = true;
            s.pounceCd = 3.5 + Math.random() * 1.5;
            this._ring(player.pos, 4, 0xff7a2a, t);
          }
          if (s.tail) s.tail.forEach((seg, k) => { seg.position.x = Math.sin(elapsed * 3 + k * 0.6) * 0.12 * k; });
        }
        if (s.pouncing) {
          // en l'air : on laisse le saut se faire
        } else if (s.slamT >= 0) {
          s.slamT += sdt;
          if (s.slamT > 0.75) {
            this.events.push({ type: 'slam', pos: s.pos.clone(), radius: slamR, big: s.T.scale > 2 });
            this._areaDamage(player, s.pos, slamR, s.T.dmg);
            s.slamT = -1;
            s.attackCd = 2.2;
            s.squash = 0.5;
          }
        } else {
          if (aggro && dist < slamR * 0.9 && s.attackCd <= 0 && !rooted) {
            s.slamT = 0;
            this._ring(s.pos, slamR, 0xff6040, 0.75);
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
        s.landed = false;
        s.pos.addScaledVector(s.vel, sdt);
        this._ground(s);
        if (s.pouncing && s.onGround) { s.vel.x *= 0.2; s.vel.z *= 0.2; }
        if (aggro) s.object.rotation.y = lerpAngle(s.object.rotation.y, Math.atan2(toP.x, toP.z), sdt * 5);
      } else if (mv === 'perch') {
        // Dragon du Néant : posé, ailes ouvertes. Il écrase le sol quand on
        // l'approche et se téléporte autour de sa proie dans un éclat de néant.
        const slamR = 3.6 * Math.max(1, s.T.scale / 1.55);
        s.blinkCd -= sdt;
        if (s.slamT >= 0) {
          s.slamT += sdt;
          if (s.slamT > 0.75) {
            this.events.push({ type: 'slam', pos: s.pos.clone(), radius: slamR, big: true });
            this._areaDamage(player, s.pos, slamR, s.T.dmg);
            s.slamT = -1;
            s.attackCd = 2.2;
            s.blinkCd = Math.min(s.blinkCd, 1.4);
          }
        } else if (aggro && dist < slamR * 0.9 && s.attackCd <= 0 && !rooted) {
          s.slamT = 0;
          this._ring(s.pos, slamR, 0xb070ff, 0.75);
        } else if (aggro && s.blinkCd <= 0 && !rooted) {
          for (let tries = 0; tries < 10; tries++) {
            const a = Math.random() * Math.PI * 2, r = 13 + Math.random() * 9;
            const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
            const h = T.heightAt(x, z);
            if (!T.isInside(x, z, 20) || h < SEA_LEVEL + 0.3) continue;
            this.events.push({ type: 'blink', from: s.pos.clone() });
            s.pos.set(x, h, z);
            this.events.push({ type: 'blink', from: s.pos.clone() });
            s.object.rotation.y = Math.atan2(player.pos.x - x, player.pos.z - z);
            break;
          }
          s.blinkCd = 6 + Math.random() * 3;
        }
        s.vel.x = 0; s.vel.z = 0;
        s.vel.y -= 24 * sdt;
        s.pos.addScaledVector(s.vel, sdt);
        this._ground(s);
        if (aggro) s.object.rotation.y = lerpAngle(s.object.rotation.y, Math.atan2(toP.x, toP.z), sdt * 3);
      } else if (mv === 'charge') {
        // Rôdeur : élan (0,6 s), charge rectiligne, puis souffle quelques instants.
        s.chargeCd = (s.chargeCd ?? 2) - sdt;
        if (s.chargeT > 0) {
          s.chargeT -= sdt;
          s.vel.x = s.chargeDir.x * 24;
          s.vel.z = s.chargeDir.z * 24;
          if (s.chargeT <= 0) { s.restT = 1.2; s.vel.x = s.vel.z = 0; }
        } else if (s.windupT > 0) {
          s.windupT -= sdt;
          s.vel.x *= 0.8; s.vel.z *= 0.8;
          s.object.rotation.y = lerpAngle(s.object.rotation.y, Math.atan2(toP.x, toP.z), sdt * 10);
          if (s.windupT <= 0) {
            s.chargeDir = toP.clone().normalize();
            s.chargeT = 0.75;
            this.events.push({ type: 'charge', pos: s.pos.clone() });
          }
        } else if (s.restT > 0) {
          s.restT -= sdt;
        } else if (aggro && !rooted && s.chargeCd <= 0 && dist > 4 && dist < 20) {
          s.windupT = 0.6;
          s.chargeCd = 3.5 + Math.random() * 1.5;
          this._ring(s.pos.clone().add(toP.clone().normalize().multiplyScalar(Math.min(dist, 16) / 2)), 2.5, 0xffa040, 0.6);
        } else if (!rooted) {
          const sp = aggro ? s.T.speed : s.T.speed * 0.4;
          const dir = aggro ? toP.clone().normalize() : new THREE.Vector3(Math.cos(s.wander), 0, Math.sin(s.wander));
          if (!aggro) s.wander += (Math.random() - 0.5) * dt;
          s.vel.x = lerp(s.vel.x, dir.x * sp, 1 - Math.exp(-sdt * 4));
          s.vel.z = lerp(s.vel.z, dir.z * sp, 1 - Math.exp(-sdt * 4));
          if (aggro) s.object.rotation.y = lerpAngle(s.object.rotation.y, Math.atan2(toP.x, toP.z), sdt * 5);
        }
        if (rooted) { s.vel.x = 0; s.vel.z = 0; s.chargeT = 0; }
        s.vel.y -= 24 * sdt;
        s.pos.addScaledVector(s.vel, sdt);
        this._ground(s);
      } else {
        this._groundMove(s, toP, dist, aggro, sdt, rooted, 0);
      }

      // Grondeur : la mèche s'allume près du joueur, puis tout saute.
      if (s.T.bomb) {
        if (s.fuse === undefined && aggro && dist < 3.2) { s.fuse = 0.9; this.events.push({ type: 'fuse', pos: s.pos.clone() }); }
        if (s.fuse !== undefined) {
          s.fuse -= sdt;
          s.squash = Math.sin(s.fuse * 30) * 0.25;
          if (s.spark) s.spark.visible = Math.floor(s.fuse * 12) % 2 === 0;
          if (s.fuse <= 0) { this._explode(s, player); continue; }
        }
      }
      // Mage des Échos : appelle deux renforts de temps en temps.
      if (s.T.summoner && aggro && !rooted) {
        s.summonT = (s.summonT ?? 4) - sdt;
        if (s.summonT <= 0 && this.list.length < 40) {
          s.summonT = 9;
          for (let k = 0; k < 2; k++) {
            const a = Math.random() * Math.PI * 2;
            const x = s.pos.x + Math.cos(a) * 3, z = s.pos.z + Math.sin(a) * 3;
            const h = T.heightAt(x, z);
            if (h > SEA_LEVEL + 0.3) this.spawn('green', new THREE.Vector3(x, h, z));
          }
          this.events.push({ type: 'summon', pos: s.pos.clone() });
        }
      }
      if (s.halo) s.halo.rotation.z += dt * 2;

      // Attaques à distance : tous les Échos tirent, après un bref éclat
      // d'avertissement.
      const sh = s.T.shot;
      if (sh && !rooted && player.alive) {
        if (s.windT >= 0) {
          s.windT += sdt;
          if (s.windT >= this.windup) {
            s.windT = -1;
            if (aggro) this._fire(s, player, toP);
          }
        } else if (aggro) {
          s.shootCd -= sdt;
          if (s.shootCd <= 0 && dist < sh.range && dist > 3.5) {
            s.windT = 0;
            const enrage = s.T.boss && s.hp < s.maxHp * 0.5 ? 0.7 : 1;
            s.shootCd = (sh.cd * lerp(SHOT.cdEarly, SHOT.cdLate, this.tier) * enrage * (0.85 + Math.random() * 0.3)) / Math.sqrt(this.diff.speed / BUFF.speed);
          }
        }
      } else if (rooted) s.windT = -1;
      if (s.T.boss) this._bossAI(s, player, toP, dist, sdt);

      // Contact
      const reach = 0.9 * s.T.scale + player.radius;
      const cy = s.pos.y + 0.4 * s.T.scale;
      const dy = Math.abs(player.pos.y + 0.6 - cy);
      if (!s.T.bomb && dist < reach && dy < 1.4 * s.T.scale && s.attackCd <= 0 && player.alive && !rooted) {
        const dmg = s.chargeT > 0 ? Math.round(s.T.dmg * 1.4) : s.T.dmg;
        if (player.damage(dmg, s.pos)) this.events.push({ type: 'slimeHit', slime: s });
        s.attackCd = 1;
        if (s.chargeT > 0) { s.chargeT = 0; s.restT = 1.2; }
      }

      // Squash & stretch
      s.squash = lerp(s.squash, 0, 1 - Math.exp(-dt * 8));
      const st = s.T.dragon || s.model ? 0 : s.onGround ? s.squash : clamp(-s.vel.y * 0.04, -0.25, 0.25);
      const breathe = s.model ? 0 : Math.sin(elapsed * 3 + s.wander) * 0.03;
      const sc = s.T.scale * (s.slamT >= 0 ? 1 + s.slamT * (s.model ? 0.06 : 0.25) : 1);
      s.object.scale.set(sc * (1 + st + breathe), sc * (1 - st - breathe), sc * (1 + st + breathe));
      s.object.position.copy(s.pos);
      if (mv === 'float') s.object.position.y += Math.sin(elapsed * 4 + s.phase) * 0.15;
      const base = s.T.glow ?? 0.18;
      s.mat.emissiveIntensity = s.hurtT > 0 ? 1.8 : rooted ? 0.05 : s.windT >= 0 ? 1.2 + 1.6 * (s.windT / this.windup) : base + night * 0.25 + (this.slowT > 0 ? 0.5 : 0);
      if (s.model) this._animateModel(s, sdt, rooted);
      if (s.animate) s.animate(elapsed, sdt);
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

    // Météores du Primordial
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t -= sdt;
      if (m.t <= 0) {
        this.events.push({ type: 'slam', pos: m.pos.clone(), radius: 3, boom: true });
        this._areaDamage(player, m.pos, 3, m.dmg);
        this.meteors.splice(i, 1);
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
        s.model?.dispose();
        this.list.splice(i, 1);
      }
    }
  }

  // Modèle 3D : animation selon ce que fait la créature, éclats (coup reçu,
  // attaque qui se prépare, racines).
  _animateModel(s, sdt, rooted) {
    const m = s.model;
    const hs = Math.hypot(s.vel.x, s.vel.z);
    const mv = s.T.move;
    if (mv === 'fly') m.play('fly', s.diving > 0 ? 1.7 : s.resting > 0 ? 0.7 : 1);
    else if (mv === 'perch') m.play('idle', s.slamT >= 0 || s.windT >= 0 ? 1.8 : 1);
    else if (s.pouncing || s.slamT >= 0 || s.windT >= 0) m.play('attack', 1.3);
    else if (hs > 0.6 && !rooted) m.play('walk', clamp((hs / Math.max(s.T.speed, 1)) * 1.4, 0.6, 2.2));
    else m.play('idle', 1);
    m.update(rooted ? sdt * 0.15 : sdt);
    if (s.hurtT > 0) m.glow(2.2, hurtGlow);
    else if (s.windT >= 0) m.glow(0.4 + 1.6 * (s.windT / this.windup), shotGlow.set(s.T.shot?.color ?? 0xffffff));
    else if (rooted) m.glow(0.25, rootGlow);
    else m.glow(m.glowBase + (this.slowT > 0 ? 0.3 : 0));
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
      s.hopTimer = aggro ? 0.45 + Math.random() * 0.25 + keep * 0.8 : 1.2 + Math.random() * 1.5;
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
    // Primordial : pluie de météores annoncée par des cercles, de plus en plus dense.
    if (s.T.primordial) {
      s.meteorCd = (s.meteorCd ?? 6) - sdt;
      if (s.meteorCd <= 0 && dist < 80) {
        const n = s.hp < s.maxHp * 0.33 ? 9 : enraged ? 7 : 5;
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2, r = k === 0 ? 0 : 3 + Math.random() * 9;
          const p = new THREE.Vector3(player.pos.x + Math.cos(a) * r, 0, player.pos.z + Math.sin(a) * r);
          p.y = Math.max(this.terrain.heightAt(p.x, p.z), SEA_LEVEL);
          this._ring(p, 3, 0xffd34d, 1.3);
          this.meteors.push({ pos: p, t: 1.3, dmg: Math.round(s.T.dmg * 0.9) });
        }
        s.meteorCd = enraged ? 6 : 8;
      }
    }
    s.leapCd -= sdt; s.summonCd -= sdt; s.volleyCd -= sdt;
    const netControlled = s.net && performance.now() - s.net.at < 1500;
    if (!s.T.dragon && !netControlled && s.leapCd <= 0 && s.onGround && dist < 40) {
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
        if (s.T.primordial && this.list.filter((o) => o.type === 'wyvern' && o.dying < 0).length >= 2) break;
        const m = this.spawn(s.T.primordial ? 'wyvern' : this._typeFor(x, z, 1), new THREE.Vector3(x, h, z));
        m.guard = s.pos.clone();
        if (s.T.primordial) break;
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
      if (c.distanceTo(point) < radius + (s.hitR ?? 0.6) * s.T.scale) {
        this.damage(s, dmg, from, knock);
        hits++;
      }
    }
    return hits;
  }

  damage(s, dmg, from, knock = 9) {
    if (s.dying >= 0) return;
    // Bonus d'attaque du héros (artefacts cachés) ; « Dieu vivant » : un coup suffit.
    const dealt = this.godMode ? s.hp + 1 : dmg * this.playerDmgMul;
    s.hp -= dealt;
    if (s === this.boss && this.onBossDamage) this.onBossDamage(dealt);
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

  // Raid : dégâts infligés au boss par un allié (sans recul ni renvoi).
  remoteBossDamage(dmg) {
    const s = this.boss;
    if (!s || s.dying >= 0) return;
    s.hp -= dmg;
    s.hurtT = 0.12;
    if (s.hp <= 0) this.kill(s, true);
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

  _explode(s, player) {
    const r = 4;
    this.events.push({ type: 'slam', pos: s.pos.clone(), radius: r, big: false, boom: true });
    this._areaDamage(player, s.pos, r, s.T.dmg);
    // L'explosion blesse aussi les Échos voisins.
    for (const o of this.list) {
      if (o !== s && o.dying < 0 && !o.T.boss && o.pos.distanceTo(s.pos) < r) { o.hp -= 2; if (o.hp <= 0) this.kill(o, true); }
    }
    s.fuse = undefined;
    this.kill(s, true);
  }

  kill(s, byPlayer) {
    if (s.dying >= 0) return;
    if (s.T.bomb && byPlayer && s.fuse === undefined && !s.exploding) {
      // Abattu avant d'exploser, le grondeur saute quand même (plus faiblement) : ça blesse les Échos voisins.
      s.exploding = true;
      this.events.push({ type: 'slam', pos: s.pos.clone(), radius: 3, boom: true });
      for (const o of this.list) if (o !== s && o.dying < 0 && !o.T.boss && o.pos.distanceTo(s.pos) < 3) { o.hp -= 1; if (o.hp <= 0) this.kill(o, true); }
    }
    s.dying = 0;
    if (s === this.boss) { this.boss = null; this.lastBossPos = s.pos.clone(); }
    this.events.push({ type: byPlayer ? 'slimeKilled' : 'slimeMelt', slime: s, pos: s.pos.clone(), color: s.T.color, score: s.T.score, boss: !!s.T.boss, elite: !!s.elite, kind: s.type });
  }

  clear() {
    for (const s of this.list) { this.scene.remove(s.object); s.mat.dispose(); s.model?.dispose(); }
    for (const g of this.globs) this.scene.remove(g.m);
    for (const r of this.rings) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); }
    for (const r of this.rootMeshes) this.scene.remove(r.m);
    this.list = [];
    this.globs = [];
    this.rings = [];
    this.rootMeshes = [];
    this.boss = null;
    this.slowT = 0;
    this.meteors = [];
  }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * clamp(t, 0, 1);
}

export { WORLD_SIZE };
