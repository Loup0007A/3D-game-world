import * as THREE from 'three';
import { WORLD_SIZE, SEA_LEVEL } from './terrain.js';

// Eau stylisée : vagues, reflets du ciel, écume sur les côtes, transparence selon la profondeur.
export class Water {
  constructor(terrain) {
    const size = WORLD_SIZE * 2.2;
    const geo = new THREE.PlaneGeometry(size, size, 280, 280);
    geo.rotateX(-Math.PI / 2);

    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDepthTex: { value: null },
        uWorldSize: { value: WORLD_SIZE },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(1, 1, 1) },
        uSkyColor: { value: new THREE.Color(0.7, 0.8, 0.9) },
        uDay: { value: 1 },
        uShallow: { value: new THREE.Color(0x2fc4c0) },
        uDeep: { value: new THREE.Color(0x0b3d6b) },
      },
    ]);
    this.uniforms.uDepthTex.value = terrain.depthTexture;

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        uniform float uTime;
        varying vec3 vWorld;
        float wave(vec2 p, vec2 d, float f, float s) { return sin(dot(p, d) * f + uTime * s); }
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float h = 0.0;
          h += wave(wp.xz, normalize(vec2(1.0, 0.3)), 0.08, 1.1) * 0.22;
          h += wave(wp.xz, normalize(vec2(-0.4, 1.0)), 0.13, 1.6) * 0.12;
          h += wave(wp.xz, normalize(vec2(0.7, -0.8)), 0.21, 2.1) * 0.06;
          wp.y += h;
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform sampler2D uDepthTex;
        uniform float uWorldSize;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSkyColor;
        uniform float uDay;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        varying vec3 vWorld;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        float ripples(vec2 p) {
          float n = vnoise(p * 0.35 + vec2(uTime * 0.25, uTime * 0.1));
          n += 0.5 * vnoise(p * 0.9 - vec2(uTime * 0.18, -uTime * 0.3));
          n += 0.25 * vnoise(p * 2.1 + vec2(-uTime * 0.4, uTime * 0.22));
          return n;
        }

        void main() {
          vec2 uv = (vWorld.xz + uWorldSize * 0.5) / uWorldSize;
          float ground = -30.0;
          if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
            ground = texture2D(uDepthTex, uv).r * 60.0 - 30.0;
          }
          float depth = vWorld.y - ground;

          // Normale : dérivée numérique du bruit de surface.
          float e = 0.35;
          float r0 = ripples(vWorld.xz);
          float rx = ripples(vWorld.xz + vec2(e, 0.0));
          float rz = ripples(vWorld.xz + vec2(0.0, e));
          vec3 n = normalize(vec3((r0 - rx) * 1.4, 1.0, (r0 - rz) * 1.4));

          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
          fres = mix(0.04, 1.0, fres);

          vec3 water = mix(uShallow, uDeep, smoothstep(0.0, 9.0, depth));
          water *= mix(0.12, 1.0, uDay);
          vec3 col = mix(water, uSkyColor, fres * 0.75);

          vec3 R = reflect(-uSunDir, n);
          float spec = pow(max(dot(R, V), 0.0), 180.0) * 3.0;
          col += uSunColor * spec * max(uSunDir.y, 0.0);

          // Écume près du rivage.
          float foamBand = 1.0 - smoothstep(0.0, 1.6, depth);
          float foamNoise = vnoise(vWorld.xz * 0.8 + vec2(uTime * 0.6, 0.0)) * 0.6 + 0.4 * sin(depth * 6.0 - uTime * 2.5);
          float foam = smoothstep(0.35, 0.75, foamBand * (0.7 + foamNoise));
          col = mix(col, vec3(0.95, 0.98, 1.0) * mix(0.2, 1.0, uDay), foam);

          float alpha = mix(0.35, 0.94, smoothstep(0.0, 5.0, depth));
          alpha = max(alpha, foam);
          alpha = max(alpha, fres * 0.9);
          if (depth < -0.05) discard;

          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = SEA_LEVEL;
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
  }

  update(elapsed, env) {
    const u = this.uniforms;
    u.uTime.value = elapsed;
    u.uSunDir.value.copy(env.lightDir);
    u.uSunColor.value.copy(env.light.color).multiplyScalar(env.dayFactor);
    u.uSkyColor.value.copy(env.fogColor);
    u.uDay.value = Math.max(env.dayFactor, 0.15);
  }

  // Hauteur approximative de la surface (pour la nage).
  surfaceAt(x, z, t) {
    const d1 = (x * 0.958 + z * 0.287) * 0.08 + t * 1.1;
    const d2 = (x * -0.371 + z * 0.928) * 0.13 + t * 1.6;
    return SEA_LEVEL + Math.sin(d1) * 0.22 + Math.sin(d2) * 0.12;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
