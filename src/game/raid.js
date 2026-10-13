import * as THREE from 'three';

// ─── Raid de boss à plusieurs ──────────────────────────────────────
// Le jeu ne parle qu'à la page du S.I.D. qui l'affiche (postMessage) ;
// c'est elle qui ouvre le raid côté serveur, prévient les membres et
// relaie les échanges en temps réel (Supabase Realtime) entre joueurs.
//
//  jeu → S.I.D.  { type: 'mv-raid', action: 'request' | 'ready' | 'send' | 'won' | 'leave', … }
//  S.I.D. → jeu  { type: 'sid-raid', action: 'joined' | 'event' | 'error', … }
//
// Événements échangés entre joueurs (action 'send' / 'event') :
//  pos  { x, y, z, ry, hp, alive }    position de chaque joueur (~8 fois/s)
//  hit  { dmg }                        dégâts infligés au boss
//  boss { hp, maxHp, x, y, z, ry }     état du boss, envoyé par l'hôte
//  won  {}                             boss vaincu

const params = new URLSearchParams(location.search);
export const embedded = window !== window.top;

// Joueur venu aider : ?raid=<id>&raid_chapter=N (l'histoire est dans ?story=).
export const helperRaid = (() => {
  const id = params.get('raid');
  const ch = parseInt(params.get('raid_chapter'), 10);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !(ch >= 1 && ch <= 10)) return null;
  return { id, chapter: ch, dragon: params.get('raid_dragon') === '1' };
})();

// Puissance du joueur sur le S.I.D. (pour le dragon), transmise par la page.
export const sidPuissance = Number(params.get('sid_puissance')) || 0;

const nameCanvas = (name, color) => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.strokeText(name, 128, 42);
  g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  g.fillText(name, 128, 42);
  return c;
};

function colorFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.75, 0.6).getHex();
}

export class Raid {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.id = null;
    this.isHost = false;
    this.me = null;
    this.dragon = false;
    this.peers = new Map();
    this.boss = null;        // dernier état du boss reçu de l'hôte
    this.bossAt = 0;
    this.sendT = 0;
    this.bossT = 0;
    this.handlers = {};
    window.addEventListener('message', (e) => {
      if (e.source !== window.parent) return;
      const d = e.data;
      if (!d || d.type !== 'sid-raid') return;
      this._onMessage(d);
    });
  }

  on(name, fn) { this.handlers[name] = fn; }
  _emit(name, ...a) { this.handlers[name]?.(...a); }
  _post(msg) { try { window.parent.postMessage({ type: 'mv-raid', ...msg }, '*'); } catch { /* parent inaccessible */ } }

  // Appel à l'aide (joueur mort face au boss).
  request(info) { this._post({ action: 'request', ...info }); }
  // Joueur venu aider : prêt à recevoir le raid.
  ready(id) { this._post({ action: 'ready', raid: id }); }
  send(event, payload = {}) { if (this.active) this._post({ action: 'send', event, payload }); }
  won() { if (this.active) this._post({ action: 'won' }); }
  leave() {
    if (this.active) this._post({ action: 'leave' });
    this.active = false;
    for (const p of this.peers.values()) this._removePeer(p);
    this.peers.clear();
  }

  get helpers() { return this.peers.size; }

  _onMessage(d) {
    if (d.action === 'joined') {
      this.active = true;
      this.id = d.raidId;
      this.isHost = !!d.isHost;
      this.me = d.me || null;
      this.dragon = !!d.dragon;
      this._emit('joined', d);
    } else if (d.action === 'error') {
      this._emit('error', d.message || 'Raid impossible.');
    } else if (d.action === 'event' && this.active) {
      const from = d.from || {};
      if (this.me && from.id === this.me.id) return;
      const p = d.payload || {};
      switch (d.event) {
        case 'pos': this._updatePeer(from, p); break;
        case 'hit': if (Number.isFinite(p.dmg) && p.dmg > 0) this._emit('hit', p.dmg, from); break;
        case 'boss':
          if (!this.isHost) { this.boss = p; this.bossAt = performance.now(); this._emit('boss', p); }
          break;
        case 'won': this._emit('won', from); break;
        case 'bye': this._removePeer(this.peers.get(from.id)); this.peers.delete(from.id); this._emit('peers', this.peers.size); break;
        default: break;
      }
    }
  }

  _updatePeer(from, p) {
    if (!from.id || ![p.x, p.y, p.z].every(Number.isFinite)) return;
    let peer = this.peers.get(from.id);
    if (!peer) {
      const color = colorFor(from.id);
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.9, 4, 10), mat);
      body.position.y = 0.85;
      body.castShadow = true;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat);
      head.position.y = 1.75;
      g.add(head);
      const tex = new THREE.CanvasTexture(nameCanvas(String(from.name || 'Allié').slice(0, 18), color));
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      label.scale.set(3.2, 0.8, 1);
      label.position.y = 2.6;
      label.renderOrder = 10;
      g.add(label);
      g.position.set(p.x, p.y, p.z);
      this.scene.add(g);
      peer = { id: from.id, name: from.name, group: g, mat, target: new THREE.Vector3(p.x, p.y, p.z), ry: 0, seen: 0 };
      this.peers.set(from.id, peer);
      this._emit('peers', this.peers.size, peer);
    }
    peer.target.set(p.x, p.y, p.z);
    peer.ry = p.ry || 0;
    peer.alive = p.alive !== false;
    peer.seen = performance.now();
  }

  _removePeer(peer) {
    if (!peer) return;
    this.scene.remove(peer.group);
    peer.group.traverse((o) => { if (o.isMesh || o.isSprite) { o.geometry?.dispose?.(); o.material.map?.dispose?.(); o.material.dispose(); } });
  }

  // À chaque image : envoi de sa position (et de l'état du boss pour l'hôte),
  // déplacement en douceur des alliés.
  update(dt, player, boss) {
    if (!this.active) return;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.12;
      this.send('pos', { x: +player.pos.x.toFixed(2), y: +player.pos.y.toFixed(2), z: +player.pos.z.toFixed(2), ry: +(player.object?.rotation.y || 0).toFixed(2), hp: Math.round(player.health), alive: player.alive });
    }
    if (this.isHost && boss && boss.dying < 0) {
      this.bossT -= dt;
      if (this.bossT <= 0) {
        this.bossT = 0.15;
        this.send('boss', { hp: +boss.hp.toFixed(2), maxHp: boss.maxHp, x: +boss.pos.x.toFixed(2), y: +boss.pos.y.toFixed(2), z: +boss.pos.z.toFixed(2), ry: +boss.object.rotation.y.toFixed(2) });
      }
    }
    const now = performance.now();
    for (const [id, p] of this.peers) {
      if (now - p.seen > 20000) { this._removePeer(p); this.peers.delete(id); this._emit('peers', this.peers.size); continue; }
      p.group.position.lerp(p.target, 1 - Math.exp(-dt * 10));
      p.group.rotation.y = p.ry;
      p.group.visible = p.alive !== false || Math.floor(now / 250) % 2 === 0;
    }
  }

  // L'hôte a-t-il donné des nouvelles du boss récemment ?
  get bossFresh() { return !this.isHost && this.boss && performance.now() - this.bossAt < 1500; }
}
