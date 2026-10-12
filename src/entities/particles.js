import * as THREE from 'three';

// Pool de particules additives (étincelles, éclaboussures, poussière).
export class Particles {
  constructor(max = 3000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: window.innerHeight / 2 } },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float alpha;
        attribute vec3 color;
        varying vec3 vCol;
        varying float vA;
        uniform float uScale;
        void main() {
          vCol = color; vA = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vCol * 1.5, a * vA);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    window.addEventListener('resize', () => { mat.uniforms.uScale.value = window.innerHeight / 2; });
  }

  burst(p, color, count = 20, { speed = 4, up = 2, gravity = -6, life = 1, size = 0.3, spread = 0.3 } = {}) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.pos[i * 3] = p.x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * spread;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * speed;
      this.vel[i * 3] = Math.cos(a) * r;
      this.vel[i * 3 + 1] = up * (0.4 + Math.random());
      this.vel[i * 3 + 2] = Math.sin(a) * r;
      const v = 0.75 + Math.random() * 0.5;
      this.col[i * 3] = c.r * v; this.col[i * 3 + 1] = c.g * v; this.col[i * 3 + 2] = c.b * v;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.8);
      this.grav[i] = gravity;
      this.baseSize[i] = size * (0.6 + Math.random() * 0.8);
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const t = Math.max(this.life[i] / this.maxLife[i], 0);
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      const drag = Math.exp(-dt * 1.5);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = t;
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * t);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true; a.color.needsUpdate = true; a.size.needsUpdate = true; a.alpha.needsUpdate = true;
  }
}
