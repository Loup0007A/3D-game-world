// Sons synthétisés avec WebAudio : aucun fichier à charger.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.6;
    this.muted = false;
  }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this._ambient();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  _noiseBuffer(sec = 2) {
    const len = this.ctx.sampleRate * sec;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // bruit brun
      d[i] = last * 3.5;
    }
    return buf;
  }

  _ambient() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer(4);
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    this.windGain = c.createGain();
    this.windGain.gain.value = 0.12;
    src.connect(f).connect(this.windGain).connect(this.master);
    src.start();
    // Modulation lente du vent
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain();
    lg.gain.value = 0.06;
    lfo.connect(lg).connect(this.windGain.gain);
    lfo.start();
    this.windFilter = f;
  }

  setUnderwater(u) {
    if (!this.windFilter) return;
    this.windFilter.frequency.setTargetAtTime(u ? 180 : 420, this.ctx.currentTime, 0.2);
  }

  _tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, attack = 0.01 } = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(freq + slide, 20), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noise(dur, { vol = 0.3, freq = 1200, q = 1, type = 'bandpass', delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this._nb || (this._nb = this._noiseBuffer(1));
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  relic() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this._tone(f, 0.9, { type: 'triangle', vol: 0.18, delay: i * 0.08 }));
  }
  portalOpen() {
    [262, 330, 392, 523, 659, 784].forEach((f, i) => this._tone(f, 1.6, { type: 'sine', vol: 0.16, delay: i * 0.12 }));
  }
  warp() { this._tone(200, 1.5, { type: 'sawtooth', vol: 0.12, slide: 1200 }); this._noise(1.2, { freq: 800, vol: 0.2 }); }
  swing() { this._noise(0.18, { freq: 2400, q: 0.8, vol: 0.18 }); }
  hit() { this._tone(180, 0.15, { type: 'square', vol: 0.12, slide: -90 }); this._noise(0.1, { freq: 600, vol: 0.25 }); }
  squish() { this._tone(320, 0.25, { type: 'sine', vol: 0.25, slide: -240 }); this._noise(0.2, { freq: 500, vol: 0.2, q: 2 }); }
  hurt() { this._tone(140, 0.3, { type: 'sawtooth', vol: 0.15, slide: -60 }); }
  jump() { this._tone(260, 0.12, { type: 'sine', vol: 0.08, slide: 140 }); }
  land() { this._noise(0.12, { freq: 300, vol: 0.2, type: 'lowpass' }); }
  splash() { this._noise(0.5, { freq: 900, q: 0.6, vol: 0.3 }); this._noise(0.3, { freq: 2500, vol: 0.12, delay: 0.05 }); }
  heal() { [660, 880, 1100].forEach((f, i) => this._tone(f, 0.4, { type: 'sine', vol: 0.12, delay: i * 0.06 })); }
  death() { [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.6, { type: 'triangle', vol: 0.16, delay: i * 0.18 })); }
  click() { this._tone(880, 0.06, { type: 'square', vol: 0.05 }); }
}
