// ─── Réseau de l'arène ─────────────────────────────────────────────
// Comme les raids : le jeu ne parle qu'à la page du S.I.D. qui l'affiche
// (postMessage) ; c'est elle qui relaie les échanges en temps réel
// (Supabase Realtime, canal « arena:<id> ») entre le dragon, les joueurs et
// la tribune.
//
//  jeu → S.I.D.  { type: 'mv-arena', action: 'ready' | 'send' | 'end' | 'close', … }
//  S.I.D. → jeu  { type: 'sid-arena', action: 'joined' | 'event' | 'error', … }
//
// Mode d'essai hors S.I.D. : ?local=1&role=…&me=…&name=… relie les onglets
// d'un même navigateur (BroadcastChannel), sans serveur.

const params = new URLSearchParams(location.search);

export class ArenaNet {
  constructor() {
    this.handlers = {};
    this.me = null;
    this.info = null;
    this.local = params.get('local') === '1';
    this.embedded = window.self !== window.top;
    if (this.local) {
      this.bc = new BroadcastChannel(`arena-${params.get('arena') || 'test'}`);
      this.bc.onmessage = (e) => this._on(e.data);
    } else {
      window.addEventListener('message', (e) => {
        if (e.source !== window.parent) return;
        const d = e.data;
        if (!d || d.type !== 'sid-arena') return;
        this._on(d);
      });
    }
  }

  get available() { return this.local || this.embedded; }

  on(name, fn) { this.handlers[name] = fn; }
  _emit(name, ...a) { this.handlers[name]?.(...a); }

  _post(msg) {
    if (this.local) return;
    try { window.parent.postMessage({ type: 'mv-arena', ...msg }, '*'); } catch { /* parent inaccessible */ }
  }

  ready() {
    if (this.local) {
      // Essai : la configuration vient de l'adresse.
      const players = (params.get('players') || 'p1:Joueur').split(',').map((s) => { const [id, name] = s.split(':'); return { id, name: name || id }; });
      const me = { id: params.get('me') || 'dragon', name: params.get('name') || 'Dragon' };
      setTimeout(() => this._on({
        type: 'sid-arena', action: 'joined', me, role: params.get('role') || 'dragon',
        battle: {
          id: params.get('arena') || 'test',
          actor: { id: params.get('actor') || 'dragon', name: params.get('actorName') || 'Dragon' },
          players, skin: params.get('skin') || 'demon', finale: params.get('finale') || null, spectators: true,
        },
      }), 50);
      return;
    }
    this._post({ action: 'ready' });
  }

  send(event, payload = {}) {
    if (!this.me) return;
    if (this.local) { this.bc.postMessage({ type: 'sid-arena', action: 'event', event, payload, from: this.me }); return; }
    this._post({ action: 'send', event, payload });
  }

  end(result) { this._post({ action: 'end', ...result }); }
  close() { this._post({ action: 'close' }); }

  _on(d) {
    if (!d || d.type !== 'sid-arena') return;
    if (d.action === 'joined') {
      this.me = d.me;
      this.info = d;
      this._emit('joined', d);
    } else if (d.action === 'event') {
      const from = d.from || {};
      if (this.me && from.id === this.me.id) return;
      this._emit('event', d.event, d.payload || {}, from);
    } else if (d.action === 'error') {
      this._emit('error', d.message || 'Connexion impossible.');
    }
  }
}
