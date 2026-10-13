import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';
import { BIOME_NAMES } from '../world/terrain.js';

const RELIC_COLORS = [0x5ff2ff, 0xffd24a, 0xff7ad9, 0x8dff6a, 0xb28bff, 0xff9a4a, 0x6aa8ff];

const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8b8580, roughness: 0.95, flatShading: true });
const runeMat = new THREE.MeshStandardMaterial({ color: 0x6c6763, roughness: 0.9, flatShading: true });

function beam(color, height = 160) {
  const geo = new THREE.CylinderGeometry(0.35, 0.9, height, 12, 1, true);
  geo.translate(0, height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uH: { value: height }, uOpacity: { value: 1 } },
    vertexShader: `varying float vY; varying vec2 vUv; void main(){ vY = position.y; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uTime; uniform float uH; uniform float uOpacity;
      varying float vY; varying vec2 vUv;
      void main(){
        float t = vY / uH;
        float a = (1.0 - t) * (1.0 - t) * 0.35;
        a *= 0.75 + 0.25 * sin(vY * 0.4 - uTime * 4.0 + vUv.x * 6.2831);
        gl_FragColor = vec4(uColor * 1.4, a * uOpacity);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 4;
  return m;
}

// ─── Reliques à collecter ───────────────────────────────────────
export class Relics {
  constructor(scene, terrain, seed, count, avoid) {
    this.scene = scene;
    const rand = mulberry32(seed ^ 0xa11ce);
    const pts = terrain.scatterLand(count, 220, rand, avoid);
    this.items = pts.map((p, i) => {
      const color = RELIC_COLORS[i % RELIC_COLORS.length];
      const g = new THREE.Group();
      g.position.copy(p);
      // Socle de pierre
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 0.8, 7), stoneMat);
      ped.position.y = 0.2; ped.castShadow = ped.receiveShadow = true;
      g.add(ped);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.2 + rand() * 0.8, 0.3), runeMat);
        st.position.set(Math.cos(a) * 2.6, 0.4, Math.sin(a) * 2.6);
        st.rotation.set((rand() - 0.5) * 0.3, -a, (rand() - 0.5) * 0.3);
        st.castShadow = st.receiveShadow = true;
        g.add(st);
      }
      const gemMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.4, roughness: 0.15, metalness: 0.2 });
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), gemMat);
      gem.position.y = 2.0;
      gem.scale.y = 1.5;
      g.add(gem);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.04, 6, 32), gemMat);
      ring.position.y = 2.0;
      g.add(ring);
      const b = beam(color);
      g.add(b);
      scene.add(g);
      return { group: g, gem, ring, beam: b, color, pos: p.clone(), taken: false, guarded: false, biome: BIOME_NAMES[terrain.biomeAt(p.x, p.z)] };
    });
  }

  get total() { return this.items.length; }

  // Relique déjà prise (partie chargée) : on éteint son cristal.
  markTaken(i) {
    const r = this.items[i];
    if (!r || r.taken) return;
    r.taken = true;
    r.guarded = true;
    r.gem.visible = r.ring.visible = r.beam.visible = false;
  }
  get collected() { return this.items.filter((r) => r.taken).length; }

  nearest(p) {
    let best = null, bd = Infinity;
    for (const r of this.items) {
      if (r.taken) continue;
      const d = Math.hypot(r.pos.x - p.x, r.pos.z - p.z);
      if (d < bd) { bd = d; best = r; }
    }
    return best ? { relic: best, dist: bd } : null;
  }

  update(dt, t, player, onCollect, onApproach) {
    for (const r of this.items) {
      r.beam.material.uniforms.uTime.value = t;
      if (r.taken) {
        r.beam.material.uniforms.uOpacity.value = Math.max(r.beam.material.uniforms.uOpacity.value - dt, 0);
        r.gem.scale.multiplyScalar(Math.exp(-dt * 6));
        r.ring.scale.multiplyScalar(Math.exp(-dt * 6));
        continue;
      }
      r.gem.rotation.y = t * 1.4;
      r.gem.position.y = 2.0 + Math.sin(t * 2 + r.pos.x) * 0.2;
      r.ring.rotation.x = t * 0.9;
      r.ring.rotation.y = t * 1.3;
      r.ring.position.y = r.gem.position.y;
      const d = player.pos.distanceTo(new THREE.Vector3(r.pos.x, r.pos.y + 0.6, r.pos.z));
      if (!r.guarded && d < 45) { r.guarded = true; onApproach(r); }
      if (d < 2.4 && player.alive) {
        r.taken = true;
        onCollect(r);
      }
    }
  }

  dispose() {
    for (const r of this.items) {
      this.scene.remove(r.group);
      r.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material !== stoneMat && o.material !== runeMat) o.material.dispose(); } });
    }
  }
}

// ─── Portail vers le monde suivant ──────────────────────────────
export class Portal {
  constructor(scene, terrain, pos) {
    this.scene = scene;
    this.active = false;
    this.pos = pos.clone();
    const g = new THREE.Group();
    g.position.copy(pos);
    // Plateforme
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.6, 1.2, 10), stoneMat);
    base.position.y = -0.1; base.castShadow = base.receiveShadow = true;
    g.add(base);
    // Arche : deux piliers + demi-ellipse de blocs
    const addBlock = (x, y, rz) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.8), stoneMat);
      b.position.set(x, y, 0);
      b.rotation.z = rz;
      b.castShadow = b.receiveShadow = true;
      g.add(b);
    };
    for (const sx of [-1, 1]) { addBlock(sx * 2.6, 0.95, 0); addBlock(sx * 2.6, 1.8, 0); }
    const blocks = 11;
    for (let i = 0; i < blocks; i++) {
      const a = (i / (blocks - 1)) * Math.PI;
      addBlock(Math.cos(a) * 2.6, 2.4 + Math.sin(a) * 3.0, a);
    }
    this.runes = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const m = new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0x000000, roughness: 0.6, flatShading: true });
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.3, 5), m);
      s.position.set(Math.cos(a) * 3.6, 1.1, Math.sin(a) * 3.6);
      s.castShadow = true;
      g.add(s);
      this.runes.push(s);
    }
    this.uniforms = { uTime: { value: 0 }, uActive: { value: 0 } };
    const door = new THREE.Shape();
    door.moveTo(-2.15, 0.5);
    door.lineTo(2.15, 0.5);
    door.lineTo(2.15, 2.4);
    door.absellipse(0, 2.4, 2.15, 2.6, 0, Math.PI, false);
    door.lineTo(-2.15, 0.5);
    const disc = new THREE.Mesh(
      new THREE.ShapeGeometry(door, 32),
      new THREE.ShaderMaterial({
        transparent: true, side: THREE.DoubleSide, depthWrite: false,
        uniforms: this.uniforms,
        vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          uniform float uTime; uniform float uActive; varying vec2 vP;
          void main(){
            vec2 p = (vP - vec2(0.0, 2.4)) / vec2(2.15, 2.6) * 0.5;
            float r = length(p) * 2.0;
            float a = atan(p.y, p.x);
            float sw = sin(a * 5.0 + r * 12.0 - uTime * 4.0) * 0.5 + 0.5;
            float sw2 = sin(a * 3.0 - r * 8.0 + uTime * 2.5) * 0.5 + 0.5;
            vec3 c1 = vec3(0.45, 0.2, 1.0), c2 = vec3(0.2, 0.95, 1.0);
            vec3 col = mix(c1, c2, sw * sw2) * (1.4 - r) * 2.2;
            float edge = smoothstep(1.25, 0.8, r);
            float alpha = edge * mix(0.12, 0.92, uActive);
            col = mix(vec3(0.25, 0.25, 0.3) * sw, col, uActive);
            gl_FragColor = vec4(col, alpha);
          }`,
      })
    );
    g.add(disc);
    this.disc = disc;
    this.beam = beam(0xb98cff, 220);
    this.beam.visible = false;
    g.add(this.beam);
    // Orienter l'arche face au centre de l'île.
    g.rotation.y = Math.atan2(-pos.x, -pos.z);
    this.group = g;
    scene.add(g);
  }

  activate() {
    this.active = true;
    this.beam.visible = true;
    this.runes.forEach((r) => { r.material.emissive.set(0xa77bff); r.material.emissiveIntensity = 2; });
  }

  update(dt, t, player) {
    this.uniforms.uTime.value = t;
    this.uniforms.uActive.value += ((this.active ? 1 : 0) - this.uniforms.uActive.value) * Math.min(dt * 2, 1);
    this.beam.material.uniforms.uTime.value = t;
    if (!this.active) return false;
    const local = this.group.worldToLocal(player.pos.clone());
    return Math.abs(local.x) < 2.2 && Math.abs(local.z) < 1.2 && local.y < 5 && player.alive;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material !== stoneMat) o.material.dispose(); } });
  }
}

// ─── Orbes de soin lâchés par les slimes ────────────────────────
export class Orbs {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.IcosahedronGeometry(0.25, 1);
    this.mat = new THREE.MeshStandardMaterial({ color: 0xff6fa8, emissive: 0xff3d8b, emissiveIntensity: 2, roughness: 0.3 });
  }
  drop(p) {
    const m = new THREE.Mesh(this.geo, this.mat);
    m.position.copy(p).add(new THREE.Vector3(0, 0.8, 0));
    this.scene.add(m);
    this.items.push({ m, base: m.position.y, t: 0 });
  }
  update(dt, t, player, onPick, magnet = 0) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const o = this.items[i];
      o.t += dt;
      // Aimant : l'orbe file vers le joueur.
      const target = player.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
      if (magnet && o.m.position.distanceTo(target) < magnet) {
        o.m.position.lerp(target, 1 - Math.exp(-dt * 5));
        o.base = o.m.position.y;
      }
      o.m.position.y = o.base + Math.sin(t * 3 + i) * 0.15;
      o.m.rotation.y += dt * 2;
      const d = o.m.position.distanceTo(player.pos.clone().add(new THREE.Vector3(0, 0.8, 0)));
      if (d < 1.6 && player.alive) {
        onPick(o.m.position.clone());
        this.scene.remove(o.m);
        this.items.splice(i, 1);
      } else if (o.t > 60) {
        this.scene.remove(o.m);
        this.items.splice(i, 1);
      }
    }
  }
  clear() { this.items.forEach((o) => this.scene.remove(o.m)); this.items = []; }
}
