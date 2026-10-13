// Clavier, souris (pointer lock) et tactile.
// On lit e.code (touche physique) : ZQSD en AZERTY = WASD en QWERTY.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // appuis de cette frame
    this.lookDX = 0;
    this.lookDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.attackQueued = false;
    this.touchMove = { x: 0, y: 0 };
    this.touchActive = false;
    this.enabled = true;
    this.sensitivity = 1;
    this.invertY = false;

    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.lockTime = performance.now();
      this.lookDX = this.lookDY = 0;
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      // Chrome envoie parfois un énorme saut juste après le verrouillage : on l'ignore.
      if (performance.now() - (this.lockTime || 0) < 120) return;
      if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
      if (!this.locked) {
        // Repli : glisser avec le clic droit pour tourner la caméra.
        if (e.buttons & 2) { this.lookDX += e.movementX; this.lookDY += e.movementY; }
        return;
      }
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.attackQueued = true;
      if (e.button === 2) { this.pressed.add('Mouse2'); this.keys.add('Mouse2'); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.keys.delete('Mouse2');
    });
    canvas.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this._setupTouch();
  }

  requestLock() {
    if (this.isTouch) return;
    try {
      const p = this.canvas.requestPointerLock();
      p?.catch?.(() => {});
    } catch { /* navigateur sans pointer lock */ }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  _setupTouch() {
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    const stick = document.getElementById('touch-stick');
    const knob = document.getElementById('touch-knob');
    if (!stick) return;
    let stickId = null, lookId = null, lx = 0, ly = 0;
    const R = 50;
    window.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.target.closest?.('.touch-btn, .panel, button')) continue;
        if (t.clientX < window.innerWidth * 0.45 && stickId === null) {
          stickId = t.identifier;
          stick.style.left = `${t.clientX - 60}px`;
          stick.style.top = `${t.clientY - 60}px`;
          stick.classList.add('on');
          this.touchActive = true;
        } else if (lookId === null) {
          lookId = t.identifier; lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          const r = stick.getBoundingClientRect();
          let dx = t.clientX - (r.left + 60), dy = t.clientY - (r.top + 60);
          const d = Math.hypot(dx, dy);
          if (d > R) { dx *= R / d; dy *= R / d; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.touchMove.x = dx / R;
          this.touchMove.y = -dy / R;
        } else if (t.identifier === lookId) {
          this.lookDX += (t.clientX - lx) * 2.2;
          this.lookDY += (t.clientY - ly) * 2.2;
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          stickId = null;
          this.touchMove.x = this.touchMove.y = 0;
          knob.style.transform = '';
          stick.classList.remove('on');
          this.touchActive = false;
        }
        if (t.identifier === lookId) lookId = null;
      }
    };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);

    const bind = (id, code) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); this.keys.add(code); this.pressed.add(code); if (code === 'Attack') this.attackQueued = true; }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); this.keys.delete(code); }, { passive: false });
    };
    bind('touch-jump', 'Space');
    bind('touch-run', 'ShiftLeft');
    bind('touch-attack', 'Attack');
    bind('touch-dash', 'KeyE');
    bind('touch-bolt', 'KeyR');
    bind('touch-nova', 'KeyC');
    bind('touch-shield', 'Digit1');
    bind('touch-heal', 'Digit2');
    bind('touch-lightning', 'Digit3');
    bind('touch-chrono', 'Digit4');
    bind('touch-roots', 'Digit5');
  }

  down(...codes) { return this.enabled && codes.some((c) => this.keys.has(c)); }
  hit(code) { return this.enabled && this.pressed.has(code); }

  // Axe de déplacement : x = droite, y = avant.
  moveAxis() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0, y = 0;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    x += this.touchMove.x;
    y += this.touchMove.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  consumeLook() {
    const s = 0.0022 * this.sensitivity;
    const r = { dx: this.lookDX * s, dy: this.lookDY * s * (this.invertY ? -1 : 1) };
    this.lookDX = this.lookDY = 0;
    return r;
  }
  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }
  consumeAttack() {
    const a = this.attackQueued || this.hit('KeyF');
    this.attackQueued = false;
    return this.enabled && a;
  }
  endFrame() { this.pressed.clear(); }
}
