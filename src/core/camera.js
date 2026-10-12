import * as THREE from 'three';
import { clamp, lerp } from './noise.js';

// Caméra troisième personne : orbite autour du joueur, évite le relief.
export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI; // regarde vers -Z au départ
    this.pitch = 0.32;
    this.distance = 7;
    this.targetDistance = 7;
    this.currentDist = 7;
    this.target = new THREE.Vector3();
    this.shake = 0;
    this._tmp = new THREE.Vector3();
  }

  rotate(dx, dy) {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch + dy, -0.55, 1.25);
  }

  zoom(steps) {
    this.targetDistance = clamp(this.targetDistance + steps * 1.1, 3, 16);
  }

  // Avant/droite à plat, déduits de la caméra : le joueur va où on regarde.
  basis() {
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    return { fwd, right };
  }

  update(dt, focus, terrain, waterLevel, blocker) {
    this.target.lerp(focus, 1 - Math.exp(-dt * 14));
    this.distance = lerp(this.distance, this.targetDistance, 1 - Math.exp(-dt * 8));

    const cp = Math.cos(this.pitch);
    const dir = this._tmp.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    // Recule tant que le terrain ne coupe pas la ligne de vue.
    let allowed = this.distance;
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const d = (i / steps) * this.distance;
      const x = this.target.x + dir.x * d;
      const y = this.target.y + dir.y * d;
      const z = this.target.z + dir.z * d;
      if (terrain.heightAt(x, z) + 0.5 > y || (blocker && d > 1.5 && blocker.blocks(x, y, z))) { allowed = Math.max(d - 0.6, 1.2); break; }
    }
    // Rapproche vite, éloigne doucement.
    const k = allowed < this.currentDist ? 20 : 3;
    this.currentDist = lerp(this.currentDist, allowed, 1 - Math.exp(-dt * k));

    const pos = this.camera.position;
    pos.copy(this.target).addScaledVector(dir, this.currentDist);
    const minY = terrain.heightAt(pos.x, pos.z) + 0.45;
    if (pos.y < minY) pos.y = minY;
    // Évite d'avoir la caméra pile dans la surface de l'eau.
    if (Math.abs(pos.y - waterLevel) < 0.25) pos.y = waterLevel + (pos.y > waterLevel ? 0.25 : -0.25);

    if (this.shake > 0) {
      this.shake = Math.max(this.shake - dt * 2.5, 0);
      const s = this.shake * this.shake * 0.4;
      pos.x += (Math.random() - 0.5) * s;
      pos.y += (Math.random() - 0.5) * s;
      pos.z += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.target.x, this.target.y + 0.2, this.target.z);
  }
}
