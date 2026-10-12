import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { smoothstep, clamp, lerp } from '../core/noise.js';

const DAY_FOG = new THREE.Color(0x9cbbe0);
const DUSK_FOG = new THREE.Color(0xe39a63);
const NIGHT_FOG = new THREE.Color(0x111c33);

// Ciel, soleil, lune, étoiles, nuages et cycle jour/nuit.
export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.time = 0.32; // 0 = minuit, 0.25 = aube, 0.5 = midi, 0.75 = crépuscule
    this.dayLength = 480; // secondes pour un jour complet
    this.timeScale = 1;

    this.sky = new Sky();
    this.sky.scale.setScalar(4500);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4.5;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.0028;
    u.mieDirectionalG.value = 0.82;
    // Ciel un peu moins lumineux : plus de bleu, moins de voile blanc.
    u.uSkyScale = { value: 0.68 };
    this.sky.material.fragmentShader = 'uniform float uSkyScale;\n' + this.sky.material.fragmentShader.replace(
      'gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * uSkyScale, 1.0 );');
    scene.add(this.sky);

    this.sunDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();

    this.light = new THREE.DirectionalLight(0xffffff, 4);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    const sc = this.light.shadow.camera;
    sc.left = sc.bottom = -70;
    sc.right = sc.top = 70;
    sc.near = 1;
    sc.far = 500;
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.6;
    scene.add(this.light, this.light.target);

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a4a35, 1.1);
    scene.add(this.hemi);

    this.fogColor = new THREE.Color();
    scene.fog = new THREE.Fog(DAY_FOG.clone(), 220, 1250);

    this.stars = this._buildStars();
    scene.add(this.stars);

    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(22, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false })
    );
    scene.add(this.moon);

    this.clouds = this._buildClouds();
    scene.add(this.clouds);

    this.nightFactor = 0;
    this.dayFactor = 1;
  }

  _buildStars() {
    const N = 2600;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 1.9 - 0.9);
      const r = 2000;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float seed;
        varying float vSeed;
        uniform float uTime;
        void main() {
          vSeed = seed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 1.2 + seed * 2.6;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vSeed;
        uniform float uOpacity;
        uniform float uTime;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          float tw = 0.65 + 0.35 * sin(uTime * (1.5 + vSeed * 3.0) + vSeed * 40.0);
          vec3 col = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), vSeed);
          gl_FragColor = vec4(col * 1.6, a * uOpacity * tw);
        }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  _buildClouds() {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8a96a8, flatShading: true, transparent: true, opacity: 0.9 });
    const parts = [];
    for (let k = 0; k < 7; k++) {
      const g = new THREE.IcosahedronGeometry(10 + Math.random() * 8, 1);
      g.scale(1.4, 0.7, 1);
      g.translate((k - 3) * 11 + Math.random() * 6, Math.random() * 5, Math.random() * 12 - 6);
      parts.push(g);
    }
    const geo = mergeGeometries(parts);
    const count = 34;
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    this.cloudData = [];
    for (let i = 0; i < count; i++) {
      const d = { x: (Math.random() - 0.5) * 2200, z: (Math.random() - 0.5) * 2200, y: 170 + Math.random() * 90, s: 0.7 + Math.random() * 1.3, r: Math.random() * Math.PI };
      this.cloudData.push(d);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.r);
      inst.setMatrixAt(i, m.compose(p.set(d.x, d.y, d.z), q, s.setScalar(d.s)));
    }
    inst.frustumCulled = false;
    this.cloudMesh = inst;
    group.add(inst);
    return group;
  }

  get hours() { return (this.time * 24) % 24; }

  update(dt, focus, elapsed) {
    this.time = (this.time + (dt * this.timeScale) / this.dayLength) % 1;
    const ang = (this.time - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang); // -1..1
    const az = ang * 0.35 + 0.6;
    this.sunDir.set(Math.cos(ang) * Math.cos(az), elev, Math.cos(ang) * Math.sin(az) + 0.25).normalize();

    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    this.sky.position.copy(focus);

    const day = smoothstep(-0.08, 0.18, elev);
    const dusk = (1 - smoothstep(0.05, 0.35, Math.abs(elev))) * smoothstep(-0.2, 0.0, elev);
    this.dayFactor = day;
    this.nightFactor = 1 - smoothstep(-0.22, 0.02, elev);

    // Lumière principale : soleil le jour, lune la nuit.
    const sunUp = elev > -0.05;
    this.lightDir.copy(sunUp ? this.sunDir : this.sunDir.clone().negate());
    if (this.lightDir.y < 0.12) this.lightDir.y = 0.12;
    this.lightDir.normalize();
    this.light.position.copy(focus).addScaledVector(this.lightDir, 220);
    this.light.target.position.copy(focus);
    if (sunUp) {
      this.light.color.setRGB(1, lerp(0.62, 0.96, smoothstep(0, 0.4, elev)), lerp(0.4, 0.9, smoothstep(0, 0.45, elev)));
      this.light.intensity = lerp(0.2, 3.1, smoothstep(-0.05, 0.25, elev));
    } else {
      this.light.color.setHex(0x9ab2ff);
      this.light.intensity = 1.1 * Math.max(this.nightFactor, 0.45);
    }

    this.hemi.intensity = lerp(1.0, 1.25, day);
    this.hemi.color.setHex(0xbfd8ff).lerp(new THREE.Color(0x7d93cf), 1 - day);
    this.hemi.groundColor.setHex(0x5a4a35).lerp(new THREE.Color(0x232a3a), 1 - day);

    // Brouillard assorti à l'horizon.
    this.fogColor.copy(NIGHT_FOG).lerp(DAY_FOG, day).lerp(DUSK_FOG, dusk * 0.75);
    this.scene.fog.color.copy(this.fogColor);
    this.renderer.toneMappingExposure = lerp(0.9, 0.62, day);

    this.stars.material.uniforms.uOpacity.value = this.nightFactor;
    this.stars.material.uniforms.uTime.value = elapsed;
    this.stars.position.copy(focus);
    this.stars.rotation.y = this.time * Math.PI * 2 * 0.2;

    const moonDir = this.sunDir.clone().negate();
    this.moon.position.copy(focus).addScaledVector(moonDir, 1500);
    this.moon.visible = moonDir.y > -0.1;

    // Nuages qui dérivent, teintés selon l'heure.
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < this.cloudData.length; i++) {
      const d = this.cloudData[i];
      d.x += dt * 4;
      if (d.x - focus.x > 1100) d.x -= 2200;
      if (d.x - focus.x < -1100) d.x += 2200;
      if (d.z - focus.z > 1100) d.z -= 2200;
      if (d.z - focus.z < -1100) d.z += 2200;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, d.r);
      this.cloudMesh.setMatrixAt(i, m.compose(p.set(d.x, d.y, d.z), q, s.setScalar(d.s)));
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;
    this.cloudMesh.material.color.setRGB(1, 1, 1).lerp(new THREE.Color(0xffb48a), dusk * 0.6).multiplyScalar(lerp(0.18, 1, day));
    this.cloudMesh.material.emissive.setHex(0x8a96a8).lerp(new THREE.Color(0xc0705a), dusk * 0.7).multiplyScalar(lerp(0.08, 0.55, day));
  }

  isNight() { return this.nightFactor > 0.5; }

  timeLabel() {
    const h = this.hours;
    const hh = Math.floor(h).toString().padStart(2, '0');
    const mm = Math.floor((h % 1) * 60).toString().padStart(2, '0');
    return `${hh}:${mm}`;
  }

  setQuality(q) {
    const size = q === 'low' ? 1024 : q === 'high' ? 4096 : 2048;
    this.light.shadow.mapSize.set(size, size);
    if (this.light.shadow.map) { this.light.shadow.map.dispose(); this.light.shadow.map = null; }
  }
}

export { clamp };
