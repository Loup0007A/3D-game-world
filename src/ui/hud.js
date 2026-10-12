import { WORLD_SIZE } from '../world/terrain.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export class Hud {
  constructor() {
    this.root = $('hud');
    this.hpFill = $('hp-fill');
    this.hpGhost = $('hp-ghost');
    this.stFill = $('st-fill');
    this.stBar = document.querySelector('.bar.stamina');
    this.relicRow = $('relic-row');
    this.minimap = $('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.big = $('bigmap-canvas');
    this.bctx = this.big.getContext('2d');
    this.clock = $('clock');
    this.hint = $('hint-relic');
    this.biomeToast = $('biome-toast');
    this.toastEl = $('toast');
    this.scoreVal = $('score-val');
    this.worldLabel = $('world-label');
    this.hurtEl = $('hurt');
    this.waterEl = $('underwater');
    this.clickEl = $('click-to-play');
    this._toastTimer = 0;
    this._biomeTimer = 0;
    this._lastBiome = '';
    this.mapCanvas = null;
  }

  show(v) { this.root.classList.toggle('hidden', !v); }

  setWorld(mapCanvas, relics, level) {
    this.mapCanvas = mapCanvas;
    this.worldLabel.textContent = `Monde ${level}`;
    this.relicRow.innerHTML = '';
    relics.items.forEach((r) => {
      const d = document.createElement('div');
      d.className = 'relic-dot';
      d.style.color = hex(r.color);
      this.relicRow.appendChild(d);
    });
    this._lastBiome = '';
  }

  markRelics(relics) {
    const dots = this.relicRow.children;
    relics.items.forEach((r, i) => {
      if (!dots[i]) return;
      dots[i].classList.toggle('on', r.taken);
      dots[i].style.background = r.taken ? hex(r.color) : '';
    });
  }

  toast(html, ms = 2600) {
    this.toastEl.innerHTML = html;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  biome(name) {
    if (name === this._lastBiome) return;
    this._lastBiome = name;
    this.biomeToast.textContent = name;
    this.biomeToast.classList.add('show');
    clearTimeout(this._biomeTimer);
    this._biomeTimer = setTimeout(() => this.biomeToast.classList.remove('show'), 2200);
  }

  flashHurt() {
    this.hurtEl.style.transition = 'none';
    this.hurtEl.style.opacity = '0.8';
    requestAnimationFrame(() => {
      this.hurtEl.style.transition = 'opacity 0.6s';
      this.hurtEl.style.opacity = '0';
    });
  }

  update(state) {
    const { player, env, relics, portal, score, camYaw, underwater, locked, isTouch } = state;
    const hp = (player.health / player.maxHealth) * 100;
    this.hpFill.style.width = `${hp}%`;
    this.hpGhost.style.width = `${hp}%`;
    this.stFill.style.width = `${(player.stamina / player.maxStamina) * 100}%`;
    this.stBar.classList.toggle('low', player.stamina < 25 || player.staminaLock > 0);
    this.clock.textContent = `${env.isNight() ? '☾' : '☀'} ${env.timeLabel()}`;
    this.scoreVal.textContent = score;
    this.waterEl.style.opacity = underwater ? '1' : '0';
    this.clickEl.classList.toggle('show', !locked && !isTouch);

    // Indice : relique la plus proche ou portail.
    let target = null, label = '';
    if (portal.active) {
      target = portal.pos;
      label = 'Portail ouvert';
    } else {
      const n = relics.nearest(player.pos);
      if (n) { target = n.relic.pos; label = `Relique · ${n.relic.biome}`; }
    }
    if (target) {
      const dx = target.x - player.pos.x, dz = target.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      // Angle relatif à la caméra (0 = devant).
      const ang = Math.atan2(dx, dz) - Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
      this.hint.innerHTML = `<span class="arrow" style="transform:rotate(${(-ang * 180) / Math.PI}deg)">▲</span>${label} · ${Math.round(dist)} m`;
      this.hint.style.display = '';
    } else this.hint.style.display = 'none';

    this._drawMinimap(player, relics, portal, camYaw);
  }

  _toMap(x, z, S) { return [((x / WORLD_SIZE) + 0.5) * S, ((z / WORLD_SIZE) + 0.5) * S]; }

  _drawMinimap(player, relics, portal, yaw) {
    const ctx = this.mctx, W = this.minimap.width;
    if (!this.mapCanvas) return;
    const span = 360; // mètres visibles
    const src = this.mapCanvas.width;
    const scale = src / WORLD_SIZE;
    const sx = (player.pos.x + WORLD_SIZE / 2) * scale - (span * scale) / 2;
    const sy = (player.pos.z + WORLD_SIZE / 2) * scale - (span * scale) / 2;
    ctx.save();
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#173f63';
    ctx.fillRect(0, 0, W, W);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mapCanvas, sx, sy, span * scale, span * scale, 0, 0, W, W);
    const toLocal = (x, z) => [W / 2 + ((x - player.pos.x) / span) * W, W / 2 + ((z - player.pos.z) / span) * W];

    const drawMark = (x, z, color, size, glow) => {
      let [mx, my] = toLocal(x, z);
      const dx = mx - W / 2, dy = my - W / 2;
      const d = Math.hypot(dx, dy), max = W / 2 - 8;
      if (d > max) { mx = W / 2 + (dx / d) * max; my = W / 2 + (dy / d) * max; }
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.PI / 4);
      ctx.shadowColor = color; ctx.shadowBlur = glow;
      ctx.fillStyle = color;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
      ctx.strokeRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    };
    for (const r of relics.items) if (!r.taken) drawMark(r.pos.x, r.pos.z, hex(r.color), 8, 8);
    drawMark(portal.pos.x, portal.pos.z, portal.active ? '#b98cff' : '#888', portal.active ? 10 : 7, portal.active ? 12 : 0);

    // Joueur + cône de vue
    ctx.translate(W / 2, W / 2);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const a = Math.atan2(fz, fx);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 46, a - 0.5, a + 0.5); ctx.closePath(); ctx.fill();
    ctx.rotate(Math.atan2(Math.sin(player.facing), Math.cos(player.facing)) * -1 + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6); ctx.closePath();
    ctx.stroke(); ctx.fill();
    ctx.restore();
  }

  drawBigMap(player, relics, portal) {
    const ctx = this.bctx, W = this.big.width;
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = '#173f63';
    ctx.fillRect(0, 0, W, W);
    if (this.mapCanvas) ctx.drawImage(this.mapCanvas, 0, 0, W, W);
    const mark = (x, z, color, s) => {
      const [mx, my] = this._toMap(x, z, W);
      ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.PI / 4);
      ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.fillStyle = color;
      ctx.fillRect(-s / 2, -s / 2, s, s); ctx.restore();
    };
    for (const r of relics.items) mark(r.pos.x, r.pos.z, r.taken ? 'rgba(255,255,255,0.25)' : hex(r.color), 11);
    mark(portal.pos.x, portal.pos.z, portal.active ? '#b98cff' : '#999', 13);
    const [px, py] = this._toMap(player.pos.x, player.pos.z, W);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}
