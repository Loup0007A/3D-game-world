import * as THREE from 'three';

// ─── Cinématiques ──────────────────────────────────────────────────
// Bandes noires, caméra qui suit des plans (de « from » vers « to », en
// regardant de « look » vers « lookTo »), sous-titres. Espace / clic : plan
// suivant ; Échap ou « Passer » : fin de la cinématique.

const ease = (t) => t * t * (3 - 2 * t);

export class Cinematic {
  constructor() {
    this.active = false;
    this.shots = [];
    this.i = 0;
    this.t = 0;
    this.resolve = null;
    this.focus = new THREE.Vector3();
    const root = document.createElement('div');
    root.className = 'cine hidden';
    root.innerHTML = `
      <div class="cine-bar top"></div><div class="cine-bar bottom"></div>
      <div class="cine-title"></div>
      <p class="cine-text"></p>
      <button class="cine-skip" type="button">Passer ▸</button>`;
    document.body.appendChild(root);
    this.root = root;
    this.titleEl = root.querySelector('.cine-title');
    this.textEl = root.querySelector('.cine-text');
    root.querySelector('.cine-skip').addEventListener('click', (e) => { e.stopPropagation(); this.stop(); });
    root.addEventListener('click', () => this.next());
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'Escape') { e.preventDefault(); this.stop(); }
      else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.next(); }
    });
  }

  // shots : [{ from, to, look, lookTo, dur, title, text }] (vecteurs THREE)
  play(shots) {
    this.shots = shots;
    this.i = 0;
    this.t = 0;
    this.active = true;
    this.root.classList.remove('hidden');
    requestAnimationFrame(() => this.root.classList.add('on'));
    this._show();
    return new Promise((r) => { this.resolve = r; });
  }

  _show() {
    const s = this.shots[this.i];
    this.titleEl.textContent = s.title || '';
    this.titleEl.classList.toggle('show', !!s.title);
    this.textEl.classList.remove('in');
    void this.textEl.offsetWidth;
    this.textEl.textContent = s.text || '';
    if (s.text) this.textEl.classList.add('in');
    s.onStart?.();
  }

  next() {
    if (!this.active) return;
    this.i++;
    this.t = 0;
    if (this.i >= this.shots.length) this.stop();
    else this._show();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.root.classList.remove('on');
    setTimeout(() => this.root.classList.add('hidden'), 450);
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }

  update(dt, camera) {
    if (!this.active) return;
    const s = this.shots[this.i];
    this.t += dt;
    const k = ease(Math.min(this.t / s.dur, 1));
    camera.position.lerpVectors(s.from, s.to || s.from, k);
    this.focus.lerpVectors(s.look, s.lookTo || s.look, k);
    camera.lookAt(this.focus);
    if (s.shake) {
      camera.position.x += (Math.random() - 0.5) * s.shake;
      camera.position.y += (Math.random() - 0.5) * s.shake;
    }
    if (this.t >= s.dur + (s.hold ?? 1.2)) this.next();
  }
}
