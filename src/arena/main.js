import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { Terrain } from '../world/terrain.js';
import { Water } from '../world/water.js';
import { Environment } from '../world/sky.js';
import { Player } from '../entities/player.js';
import { Particles } from '../entities/particles.js';
import { Input } from '../core/input.js';
import { ThirdPersonCamera } from '../core/camera.js';
import { Sfx } from '../core/audio.js';
import { ModelLibrary } from '../entities/models.js';
import { Cinematic } from '../game/cinematic.js';
import { ArenaNet } from './net.js';
import { Dragon, DRAGON } from './dragon.js';
import { RemoteHero, Bolts, outfitFor, shieldMesh } from './heroes.js';
import { Director } from './director.js';

// ─── L'Arène du Dragon ─────────────────────────────────────────────
// Trois rôles : le dragon (le lanceur du Défi, qui dirige aussi la partie),
// les joueurs convoqués, la tribune (spectateurs). Phases menées par le
// dragon : attente → introduction → combat → cinématique de fin → bilan.

const ARENA_SEED = 1010101;
const T = { lobby: 75, intro: 7.4, fight: 150, end: 9 };
const FINALE_LEN = { carboniser: 10.5, devorer: 10.5, chute: 8, regne: 6.5 };
const ARENA_R = 58;     // rayon où restent les joueurs
const SKY_R = 100;      // rayon où vole le dragon

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const now = () => performance.now() / 1000;
const listNames = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} et ${arr[arr.length - 1]}`);

// ─── Rendu ─────────────────────────────────────────────────────────
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 5000);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 1.5);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const env = new Environment(scene, renderer);
env.time = 0.735; // crépuscule rougeoyant, figé
env.timeScale = 0;
const particles = new Particles(5000);
scene.add(particles.points);
const input = new Input(canvas);
const cam = new ThirdPersonCamera(camera);
const sfx = new Sfx();
const cine = new Cinematic();
const net = new ArenaNet();
const director = new Director(camera);
const quality = ['low', 'medium', 'high'].includes(new URLSearchParams(location.search).get('q')) ? new URLSearchParams(location.search).get('q') : input.isTouch ? 'low' : 'medium';

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
}
window.addEventListener('resize', onResize);
onResize();
bloom.enabled = quality !== 'low';
env.setQuality(quality);

// ─── État ──────────────────────────────────────────────────────────
let world = null;            // { terrain, water, center }
let models = null;
let role = null;             // 'dragon' | 'player' | 'spectator'
let me = null;
let battle = null;           // { id, actor, players, skin, finale }
let phase = 'loading';
let phaseEnd = 0;
let phaseStart = 0;
let phaseData = {};
let elapsed = 0;
let dragon = null;
let player = null;           // héros local (rôle joueur)
let playerShield = null;
const heroes = new Map();    // joueurs distants : id → RemoteHero
const joined = new Set();    // joueurs présents (vus par le dragon)
const deaths = [];           // ordre des chutes (id)
let lastDragonMsg = 0;
let finished = false;
let sendT = 0;
let beatT = 0;
let breathHeld = false;
let shieldT = 0;
let shieldCd = 0;
let stunT = 0;
let hurtKind = 'feu';
const breathTick = new Map(); // id → temps cumulé dans le feu
let biteCheck = -1;
let autoStart = -1;
const bolts = new Bolts(scene, particles);
let finale = null;            // { kind, victim, V, D, t, charred }

const frozenInput = { moveAxis: () => ({ x: 0, y: 0 }), down: () => false, hit: () => false };

// ─── Interface ─────────────────────────────────────────────────────
function big(text, sub = '', ms = 2200) {
  const el = $('a-big');
  el.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  el.classList.add('on');
  clearTimeout(big.t);
  big.t = setTimeout(() => el.classList.remove('on'), ms);
}
function feed(text) {
  const el = document.createElement('div');
  el.className = 'af';
  el.textContent = text;
  $('a-feed').prepend(el);
  setTimeout(() => el.remove(), 7000);
  while ($('a-feed').children.length > 5) $('a-feed').lastChild.remove();
}
function hurtFlash() {
  const h = $('hurt');
  h.style.opacity = '1';
  setTimeout(() => (h.style.opacity = '0'), 160);
}

function heroName(id) {
  return battle?.players.find((p) => p.id === id)?.name || 'Un joueur';
}

// Liste unifiée des joueurs (soi compris) : { id, name, alive, hp, pos }.
function heroViews() {
  const out = [];
  for (const p of battle?.players || []) {
    if (role === 'player' && p.id === me.id && player) out.push({ id: p.id, name: p.name, alive: player.alive, hp: player.health, pos: player.pos, local: true });
    else {
      const h = heroes.get(p.id);
      if (h) out.push({ id: p.id, name: p.name, alive: h.alive, hp: h.hp, pos: h.p.pos, remote: h });
      else out.push({ id: p.id, name: p.name, alive: phase === 'lobby', hp: 100, pos: world.center.clone(), absent: true });
    }
    const last = out[out.length - 1];
    if (last && !last.local && role !== 'player' && !joined.has(last.id)) last.absent = true;
  }
  return out;
}

function renderHud() {
  if (!battle) return;
  const rem = Math.max(0, Math.ceil(phaseEnd - now()));
  $('a-title').textContent = `⚔️ Bataille du dragon · ${battle.actor.name} contre ${listNames(battle.players.map((p) => p.name))}`;
  $('a-timer').textContent = phase === 'fight' ? `${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`
    : phase === 'lobby' ? `Attente des joueurs · ${rem} s` : phase === 'intro' ? 'Le dragon arrive…' : '';
  $('a-dragon').classList.toggle('hidden', phase === 'lobby');
  document.querySelector('#a-dragon .a-dname').textContent = `🐉 ${battle.actor.name}`;
  $('a-dfill').style.width = `${Math.max(0, dragon ? dragon.hp / dragon.maxHp : 1) * 100}%`;
  const list = heroViews();
  const playersHtml = list.map((h) => `<div class="ap ${h.alive ? '' : 'dead'} ${h.local ? 'me' : ''}"><b>${esc(h.name)}${h.absent && phase === 'lobby' ? ' <span>⏳</span>' : ''}</b><div class="t"><div class="f" style="width:${Math.max(0, Math.round(h.hp))}%"></div></div></div>`).join('');
  if ($('a-players').dataset.k !== playersHtml) { $('a-players').innerHTML = playersHtml; $('a-players').dataset.k = playersHtml; }

  // Compétences
  let skills = '';
  if (role === 'dragon' && dragon) {
    const cd = (v, max) => `<div class="cd" style="height:${Math.round((v / max) * 20) * 5}%"></div>`;
    skills = `<div class="ask gauge"><i>🔥</i><span>Souffle (clic gauche)</span><div class="g"><i style="width:${Math.round(dragon.fuel / 5) * 5}%"></i></div></div>
      <div class="ask"><i>🦷</i><span>Morsure</span>${cd(dragon.biteCd, DRAGON.biteCd)}</div>
      <div class="ask"><i>📢</i><span>Rugir</span>${cd(dragon.roarCd, DRAGON.roarCd)}</div>`;
  } else if (role === 'player' && player) {
    skills = `<div class="ask"><i>✦</i><span>Éclair</span></div><div class="ask"><i>⛉</i><span>Bouclier</span><div class="cd" style="height:${Math.round((shieldCd / 9) * 20) * 5}%"></div></div>`;
  }
  if ($('a-skills').dataset.k !== skills) { $('a-skills').innerHTML = skills; $('a-skills').dataset.k = skills; }
  const fighting = phase === 'fight' || phase === 'lobby';
  $('a-click').classList.toggle('hidden', input.isTouch || input.locked || role === 'spectator' || !fighting || (role === 'player' && !player?.alive));
}

function setRoleHelp() {
  const help = {
    dragon: 'ZQSD / WASD voler · Espace monter · Maj descendre · Clic gauche (maintenu) souffle · Clic droit / A morsure · E rugir',
    player: 'ZQSD / WASD courir · Espace sauter · Maj sprint · Clic tirer un éclair (au corps à corps : frappe) · E bouclier',
    spectator: '🎥 Tribune : la caméra suit la bataille',
  };
  $('a-role').textContent = help[role] || '';
  document.body.classList.toggle('spectator', role === 'spectator');
  const t = (id, label, show = true) => { const el = $(id); if (!el) return; el.textContent = label; el.style.display = show ? '' : 'none'; };
  if (role === 'dragon') { t('touch-attack', '🔥'); t('touch-jump', '⤒'); t('touch-run', '⤓'); t('touch-dash', '📢'); t('touch-bolt', '🦷'); t('touch-nova', '', false); }
  else if (role === 'player') { t('touch-attack', '✦'); t('touch-jump', '⤒'); t('touch-run', '»'); t('touch-dash', '⛉'); t('touch-bolt', '', false); t('touch-nova', '', false); }
  $('touch-ui').classList.toggle('on', role !== 'spectator');
}

// ─── Monde ─────────────────────────────────────────────────────────
async function build() {
  const fill = $('load-fill'), msg = $('load-msg');
  const step = async (p, m) => { fill.style.width = `${p * 100}%`; msg.textContent = m; await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); };
  await step(0.1, 'Le sol se soulève…');
  const terrain = new Terrain(ARENA_SEED);
  scene.add(terrain.mesh);
  await step(0.4, 'La mer s\'agite…');
  const water = new Water(terrain);
  scene.add(water.mesh);
  const center = terrain.findSpawn();
  await step(0.6, 'Des ailes battent au loin…');
  models = await new ModelLibrary().load().catch(() => null);
  await step(0.95, 'L\'arène est prête.');
  world = { terrain, water, center };
  // Cercle de braises qui marque l'arène.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R, 0.25, 6, 160).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.55 }));
  ring.position.set(center.x, center.y + 0.6, center.z);
  scene.add(ring);
  world.ring = ring;
  renderer.compile(scene, camera);
  camera.position.set(center.x + 60, center.y + 40, center.z + 60);
  camera.lookAt(center);
}

// ─── Réseau ────────────────────────────────────────────────────────
net.on('joined', (d) => {
  role = d.role;
  me = d.me;
  battle = d.battle;
  setRoleHelp();
  dragon = new Dragon(scene, models, battle.skin, particles);
  const c = world.center;
  dragon.pos.set(c.x + 40, c.y + 45, c.z - 70);
  dragon.target.copy(dragon.pos);
  if (role === 'player') {
    player = new Player();
    outfitFor(player, me.id);
    scene.add(player.object);
    playerShield = shieldMesh();
    player.object.add(playerShield);
    const i = Math.max(0, battle.players.findIndex((p) => p.id === me.id));
    const a = Math.PI * 0.5 + (i - (battle.players.length - 1) / 2) * 0.45;
    player.spawn(new THREE.Vector3(c.x + Math.cos(a) * 9, world.terrain.heightAt(c.x + Math.cos(a) * 9, c.z + Math.sin(a) * 9), c.z + Math.sin(a) * 9));
    player.maxHealth = player.health = 100;
    player.regen = 0;
    cam.yaw = Math.PI / 2 - a; // regarde le centre de l'arène
    cam.targetDistance = 8;
  }
  if (role === 'dragon') {
    cam.targetDistance = 30;
    cam.distance = 30;
    cam.pitch = 0.22;
    setPhase('lobby', { t: T.lobby });
  }
  for (const p of battle.players) if (!(role === 'player' && p.id === me.id)) heroes.set(p.id, new RemoteHero(scene, p.id, p.name));
  $('ahud').classList.remove('hidden');
  $('loading').classList.add('hidden');
  net.send('hi', { role });
  lastDragonMsg = now();
  showLobby();
});

net.on('error', (m) => {
  // Pas encore dans l'arène : on le dit sur l'écran de chargement.
  if (!battle) { $('load-msg').textContent = `${m} Réessaie dans un instant.`; return; }
  big('Connexion perdue', m, 4000);
});

net.on('event', (ev, p, from) => {
  if (!battle) return;
  if (from.id === battle.actor.id) lastDragonMsg = now();
  switch (ev) {
    case 'hi':
      if (role === 'dragon' && p.role === 'player') { joined.add(from.id); beatT = 0; }
      if (role === 'dragon') sendPhase();
      break;
    case 'st':
      if (from.id === battle.actor.id && dragon && role !== 'dragon') dragon.applyState(p);
      else if (heroes.has(from.id)) {
        const h = heroes.get(from.id);
        const wasAlive = h.alive;
        h.applyState(p);
        if (role === 'dragon' && phase !== 'lobby') joined.add(from.id);
        if (role === 'dragon' && phase === 'lobby') joined.add(from.id);
        if (wasAlive && !h.alive && !deaths.includes(from.id)) deaths.push(from.id);
      }
      break;
    case 'phase':
      if (role !== 'dragon') onPhase(p);
      break;
    case 'bolt':
      bolts.fire(new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3(p.dx, p.dy, p.dz), false);
      sfx.bolt();
      break;
    case 'hit':
      if (role === 'dragon' && phase === 'fight' && Number.isFinite(p.dmg)) {
        dragon.hp = Math.max(0, dragon.hp - Math.min(p.dmg, 6));
        dragon.inst.glow(0.9);
      }
      break;
    case 'hurt':
      if (role === 'player' && player && p.to === me.id) takeHurt(p);
      break;
    case 'roar':
      roarFx(new THREE.Vector3(p.x, p.y, p.z));
      break;
    case 'down':
      if (!deaths.includes(from.id)) deaths.push(from.id);
      feed(p.by === 'morsure' ? `🦷 ${heroName(from.id)} a été mordu à mort` : p.by === 'rugissement' ? `📢 ${heroName(from.id)} n'a pas survécu au rugissement` : `🔥 ${heroName(from.id)} a été carbonisé`);
      break;
    default:
      break;
  }
});

function sendPhase() {
  net.send('phase', { p: phase, t: Math.max(0, phaseEnd - now()), ...phaseData, joined: [...joined] });
}

// Le dragon change de phase et prévient tout le monde.
function setPhase(p, data = {}) {
  phase = p;
  phaseStart = now();
  phaseEnd = now() + (data.t ?? 0);
  phaseData = data;
  if (role === 'dragon') sendPhase();
  enterPhase(p, data);
}

// Ailleurs : on suit le dragon.
function onPhase(d) {
  if (!d || !d.p) return;
  if (Array.isArray(d.joined)) d.joined.forEach((id) => joined.add(id));
  const changed = d.p !== phase;
  phaseEnd = now() + (d.t || 0);
  if (changed) {
    phase = d.p;
    phaseStart = now();
    phaseData = d;
    enterPhase(d.p, d);
  }
}

function enterPhase(p, d) {
  showLobby();
  if (p === 'intro') playIntro(d);
  else if (p === 'fight') { cine.stop(); faceFight(); big('COMBAT !', role === 'player' ? 'Abats le dragon !' : role === 'dragon' ? 'Carbonise-les !' : '', 1800); sfx.init(); }
  else if (p === 'finale') startFinale(d);
  else if (p === 'end') showEnd(d);
}

// Début du combat : la caméra se tourne vers l'adversaire.
function faceFight() {
  const from = role === 'player' && player ? player.pos : role === 'dragon' ? dragon.pos : null;
  if (!from) return;
  const to = role === 'player' ? dragon.pos : world.center;
  const fx = to.x - from.x, fz = to.z - from.z;
  if (Math.hypot(fx, fz) < 1) return;
  cam.yaw = Math.atan2(-fx, -fz);
  cam.pitch = role === 'player' ? 0.1 : 0.22;
}

function showLobby() {
  const el = $('a-lobby');
  if (phase !== 'lobby' || !battle) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const key = `${role}|${[...joined].join(',')}`;
  if (el.dataset.k === key) return;
  el.dataset.k = key;
  const list = battle.players.map((p) => `<li class="${joined.has(p.id) || (role === 'player' && p.id === me.id) ? 'ok' : ''}"><span>${esc(p.name)}</span><span>${joined.has(p.id) || (role === 'player' && p.id === me.id) ? '✓ dans l\'arène' : '⏳ en route'}</span></li>`).join('');
  $('lobby-list').innerHTML = list;
  if (role === 'dragon') {
    $('lobby-title').textContent = 'Tu es le dragon';
    $('lobby-text').textContent = 'Tes adversaires sont convoqués. Le combat commence dès qu\'ils sont tous là (ou quand tu le décides).';
    $('lobby-start').classList.toggle('hidden', joined.size === 0);
    $('lobby-help').textContent = 'Personne ne vient d\'ici la fin du décompte ? La bataille est annulée et les options te sont remboursées.';
  } else if (role === 'player') {
    $('lobby-title').textContent = `${battle.actor.name} t'a convoqué`;
    $('lobby-text').textContent = 'Il s\'est changé en dragon. Prépare-toi : tire des éclairs de lumière, protège-toi du feu avec ton bouclier.';
    $('lobby-start').classList.add('hidden');
    $('lobby-help').textContent = 'Tu peux déjà te déplacer dans l\'arène.';
  } else {
    $('lobby-title').textContent = 'Tribune';
    $('lobby-text').textContent = `${battle.actor.name} s'est changé en dragon et défie ${listNames(battle.players.map((p) => p.name))}. Tout le S.I.D. est convoqué pour regarder.`;
    $('lobby-start').classList.add('hidden');
    $('lobby-help').textContent = '';
  }
}
$('lobby-start').addEventListener('click', () => { if (role === 'dragon' && phase === 'lobby' && joined.size) startIntro(); });

// ─── Introduction ──────────────────────────────────────────────────
function startIntro() {
  const c = world.center;
  const a = Math.random() * Math.PI * 2;
  const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
  const S = c.clone().addScaledVector(dir, 70).add(new THREE.Vector3(0, 45, 0));
  const H = c.clone().addScaledVector(dir, 24);
  H.y = Math.max(world.terrain.heightAt(H.x, H.z), c.y) + 13;
  const n = Math.max(1, [...joined].length);
  dragon.maxHp = dragon.hp = 80 + 70 * n;
  setPhase('intro', { t: T.intro, sx: S.x, sy: S.y, sz: S.z, hx: H.x, hy: H.y, hz: H.z });
}

function playIntro(d) {
  const S = new THREE.Vector3(d.sx, d.sy, d.sz), H = new THREE.Vector3(d.hx, d.hy, d.hz), c = world.center;
  const toC = c.clone().sub(H).setY(0).normalize();
  const face = H.clone().addScaledVector(toC, 15).add(new THREE.Vector3(0, 1.5, 0));
  const playersSide = c.clone().addScaledVector(toC, 10).add(new THREE.Vector3(0, 3, 0));
  const names = listNames(battle.players.filter((p) => joined.has(p.id) || (role === 'player' && p.id === me.id)).map((p) => p.name));
  input.exitLock();
  cine.play([
    { from: c.clone().add(new THREE.Vector3(14, 4, 14)), to: c.clone().add(new THREE.Vector3(10, 3, 10)), look: S, lookTo: H.clone().add(new THREE.Vector3(0, 4, 0)), dur: 2.8, hold: 0, title: 'Défi du Dragon', text: `${battle.actor.name} s'est changé en dragon.` },
    { from: face, to: face.clone().add(new THREE.Vector3(0, 0.8, 0)), look: H.clone().add(new THREE.Vector3(0, 5, 0)), dur: 2.4, hold: 0, shake: 0.35, text: `Il convoque ${names} dans l'arène.`, onStart: () => roarFx(H, true) },
    { from: playersSide, to: playersSide.clone().addScaledVector(toC, 3), look: H.clone().add(new THREE.Vector3(0, 5, 0)), dur: 2.0, hold: 0, title: 'Combat !' },
  ]);
}

// ─── Rugissement, dégâts ───────────────────────────────────────────
function roarFx(at, quiet = false) {
  for (let k = 0; k < 3; k++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.6, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffa060, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.set(at.x, world.terrain.heightAt(at.x, at.z) + 0.3, at.z);
    scene.add(ring);
    const t0 = now() + k * 0.15;
    const tick = () => {
      const t = now() - t0;
      if (t < 0) return requestAnimationFrame(tick);
      ring.scale.setScalar(1 + t * 28);
      ring.material.opacity = Math.max(0, 0.6 - t * 0.6);
      if (t < 1) requestAnimationFrame(tick); else { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); }
    };
    requestAnimationFrame(tick);
  }
  cam.shake = Math.max(cam.shake, 1.2);
  if (sfx.ctx) { sfx._tone(85, 1.3, { type: 'sawtooth', vol: quiet ? 0.12 : 0.22, slide: -35 }); sfx._noise(1.2, { freq: 260, vol: 0.4, type: 'lowpass' }); }
}

function takeHurt(p) {
  if (!player.alive || phase !== 'fight') return;
  if (shieldT > 0 && p.k === 'feu') { particles.burst(player.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0x7ff0ff, 6, { speed: 3, size: 0.3, life: 0.3 }); return; }
  hurtKind = p.k || 'feu';
  const ok = player.damage(Math.min(p.dmg, 40), { x: p.fx ?? dragon.pos.x, z: p.fz ?? dragon.pos.z });
  if (p.k === 'feu') player.invuln = 0; // le feu brûle en continu
  if (ok) { hurtFlash(); sfx.hurt(); }
  if (p.k === 'rugissement') stunT = DRAGON.roarStun;
}

// Le dragon vérifie qui il touche (souffle, morsure, rugissement).
function hostDamage(dt) {
  for (const h of heroes.values()) {
    if (!h.alive || !joined.has(h.id)) continue;
    if (dragon.inBreath(h.target)) {
      const acc = (breathTick.get(h.id) || 0) + dt;
      if (acc >= 0.3) {
        breathTick.set(h.id, 0);
        if (!h.shieldOn) net.send('hurt', { to: h.id, dmg: Math.round(DRAGON.breathDps * 0.3), k: 'feu', fx: dragon.pos.x, fz: dragon.pos.z });
      } else breathTick.set(h.id, acc);
    }
  }
  if (biteCheck >= 0) {
    biteCheck -= dt;
    if (biteCheck < 0) {
      const m = dragon.mouth();
      for (const h of heroes.values()) {
        if (!h.alive) continue;
        if (h.target.clone().add(new THREE.Vector3(0, 1, 0)).distanceTo(m) < DRAGON.biteReach) net.send('hurt', { to: h.id, dmg: DRAGON.biteDmg, k: 'morsure', fx: dragon.pos.x, fz: dragon.pos.z });
      }
    }
  }
}

function roar() {
  if (!dragon.startRoar()) return;
  const at = dragon.pos.clone();
  net.send('roar', { x: at.x, y: at.y, z: at.z });
  roarFx(at);
  for (const h of heroes.values()) {
    if (!h.alive) continue;
    const d = Math.hypot(h.target.x - at.x, h.target.z - at.z);
    if (d < DRAGON.roarRadius && Math.abs(h.target.y - at.y) < 25) net.send('hurt', { to: h.id, dmg: DRAGON.roarDmg, k: 'rugissement', fx: at.x, fz: at.z });
  }
}

// ─── Fin de partie (dragon) ────────────────────────────────────────
function checkOutcome() {
  if (phase !== 'fight') return;
  const present = battle.players.filter((p) => joined.has(p.id));
  const alive = present.filter((p) => { const h = heroes.get(p.id); return h && h.alive && performance.now() - h.seen < 12000; });
  if (dragon.hp <= 0) return finish('joueurs', null);
  if (present.length && !alive.length) return finish('dragon', deaths[deaths.length - 1] || present[0].id);
  if (now() >= phaseEnd) return finish('dragon', alive.length ? alive[Math.floor(Math.random() * alive.length)].id : null);
}

function finish(winner, victim) {
  const kind = winner === 'joueurs' ? 'chute' : battle.finale && victim ? battle.finale : 'regne';
  const h = victim ? heroes.get(victim) : null;
  const V = h ? h.target.clone() : world.center.clone();
  setPhase('finale', { t: FINALE_LEN[kind], kind, winner, victim, vx: V.x, vy: V.y, vz: V.z, dx: dragon.pos.x, dy: dragon.pos.y, dz: dragon.pos.z });
}

// ─── Cinématiques de fin ───────────────────────────────────────────
function victimObject(id) {
  if (role === 'player' && id === me.id && player) return { obj: player.object, set: (v) => { player.alive = v; }, local: true };
  const h = heroes.get(id);
  return h ? { obj: h.p.object, set: (v) => { h.forceVisible = v; }, hero: h } : null;
}

function charMaterials(obj) {
  const mats = [];
  obj.traverse((o) => {
    if (!o.isMesh || !o.material || o.material.isMeshBasicMaterial) return;
    const m = o.material.clone();
    o.material = m;
    mats.push({ m, color: m.color.clone(), emissive: m.emissive ? m.emissive.clone() : null });
  });
  return mats;
}

function startFinale(d) {
  dragon.vel.set(0, 0, 0);
  input.exitLock();
  const kind = d.kind;
  const V = new THREE.Vector3(d.vx, d.vy, d.vz);
  V.y = world.terrain.heightAt(V.x, V.z);
  const D = new THREE.Vector3(d.dx, d.dy, d.dz);
  const victim = d.victim ? victimObject(d.victim) : null;
  const vName = d.victim ? heroName(d.victim) : '';
  finale = { kind, V, D, victim, vName, t0: now(), charred: null, gulped: false };
  if (victim) {
    victim.set(true);
    if (victim.local) { player.pos.copy(V); player.vel.set(0, 0, 0); }
    else { victim.hero.target.copy(V); victim.hero.p.pos.copy(V); }
  }
  const toV = V.clone().sub(D).setY(0).normalize();
  const side = new THREE.Vector3(-toV.z, 0, toV.x);
  const L = V.clone().addScaledVector(toV, -13);
  L.y = world.terrain.heightAt(L.x, L.z) + 0.6;
  finale.L = L;
  finale.toV = toV;
  const up = (y) => new THREE.Vector3(0, y, 0);
  const A = battle.actor.name;
  let shots;
  if (kind === 'carboniser') {
    shots = [
      { from: V.clone().addScaledVector(toV, 9).addScaledVector(side, 5).add(up(2)), to: V.clone().addScaledVector(toV, 7).addScaledVector(side, 3).add(up(1.6)), look: L.clone().add(up(6)), dur: 2.6, hold: 0, text: `${vName} est seul face au dragon…` },
      { from: V.clone().lerp(L, 0.5).addScaledVector(side, 17).add(up(4)), to: V.clone().lerp(L, 0.5).addScaledVector(side, 14).add(up(3)), look: V.clone().lerp(L, 0.45).add(up(2)), dur: 3.6, hold: 0, shake: 0.25 },
      { from: V.clone().addScaledVector(side, 4).addScaledVector(toV, 3).add(up(1.8)), to: V.clone().addScaledVector(side, 3).addScaledVector(toV, 2.5).add(up(1.4)), look: V.clone().add(up(0.9)), dur: 2.2, hold: 0, text: `${vName} a été carbonisé.` },
      { from: L.clone().addScaledVector(toV, -30).add(up(12)), to: L.clone().addScaledVector(toV, -24).add(up(9)), look: L.clone().add(up(7)), dur: 2.1, hold: 0, title: 'Le dragon règne', text: `${A} a gagné.`, onStart: () => roarFx(L, true) },
    ];
  } else if (kind === 'devorer') {
    shots = [
      { from: V.clone().addScaledVector(side, 10).add(up(3)), to: V.clone().addScaledVector(side, 8).add(up(2)), look: D.clone(), lookTo: V.clone().add(up(4)), dur: 2.6, hold: 0, text: `Le dragon fond sur ${vName}…` },
      { from: V.clone().addScaledVector(side, 12).add(up(6)), to: V.clone().addScaledVector(side, 14).add(up(14)), look: V.clone().add(up(3)), lookTo: V.clone().add(up(16)), dur: 2.2, hold: 0, shake: 0.2 },
      { from: V.clone().addScaledVector(side, 9).add(up(18)), to: V.clone().addScaledVector(side, 8).add(up(22)), look: V.clone().add(up(20)), dur: 2.0, hold: 0, shake: 0.5, text: `${vName} a été dévoré.` },
      { from: V.clone().addScaledVector(side, 40).add(up(16)), to: V.clone().addScaledVector(side, 34).add(up(20)), look: V.clone().add(up(24)), dur: 3.7, hold: 0, title: 'Le dragon règne', text: `${A} a gagné.`, onStart: () => roarFx(V.clone().add(up(22)), true) },
    ];
  } else if (kind === 'chute') {
    shots = [
      { from: D.clone().addScaledVector(side, 30).add(up(6)), to: D.clone().addScaledVector(side, 26).add(up(3)), look: D.clone(), lookTo: D.clone().setY(world.terrain.heightAt(D.x, D.z) + 2), dur: 3.6, hold: 0, shake: 0.3, text: 'Le dragon vacille…' },
      { from: world.center.clone().add(up(4)).addScaledVector(side, 6), to: world.center.clone().add(up(3)).addScaledVector(side, 4), look: D.clone().setY(world.terrain.heightAt(D.x, D.z) + 3), dur: 4.4, hold: 0, title: `${A} est terrassé`, text: `Victoire de ${listNames(battle.players.filter((p) => joined.has(p.id) || (role === 'player' && p.id === me.id)).map((p) => p.name))} !` },
    ];
  } else {
    shots = [
      { from: D.clone().add(new THREE.Vector3(30, 5, 30)), to: D.clone().add(new THREE.Vector3(24, 8, 24)), look: D.clone().add(up(4)), dur: 6.5, hold: 0, title: 'Le dragon règne', text: `${A} a vaincu ${listNames(battle.players.map((p) => p.name))}.`, onStart: () => roarFx(D, true) },
    ];
  }
  cine.play(shots);
}

// Avance de la cinématique de fin (tous les écrans).
function updateFinale(dt) {
  if (!finale) return;
  const t = now() - finale.t0;
  const { kind, V, L, toV, victim } = finale;
  const isHost = role === 'dragon';

  if (kind === 'carboniser') {
    if (isHost) {
      // Le dragon se pose face à la victime, puis souffle.
      const k = Math.min(t / 2.4, 1);
      if (t < 2.6) dragon.pos.lerpVectors(finale.D, L, k * k * (3 - 2 * k));
      dragon.yaw = Math.atan2(toV.x, toV.z);
      dragon.aim.copy(V.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(dragon.mouth()).normalize());
      dragon.breathing = t > 2.6 && t < 6.2;
      dragon.airborne = t < 2.2;
    }
    if (victim && t > 3 && !finale.charred) finale.charred = charMaterials(victim.obj);
    if (finale.charred) {
      const c = Math.min(Math.max((t - 3) / 2.6, 0), 1);
      for (const x of finale.charred) {
        x.m.color.copy(x.color).lerp(new THREE.Color(0x0b0705), c);
        if (x.m.emissive) x.m.emissive.setRGB(0.9 * c * (0.6 + Math.random() * 0.4), 0.25 * c, 0);
      }
      if (t > 3 && t < 6.2 && Math.random() < 0.6) particles.burst(V.clone().add(new THREE.Vector3(0, 1, 0)), 0xff7a20, 6, { speed: 3, up: 3, gravity: 1, size: 0.6, life: 0.7 });
      if (t > 6.2) {
        const s = Math.max(0, 1 - (t - 6.2) / 1.2);
        victim.obj.scale.setScalar(Math.max(s, 0.001));
        if (s > 0 && Math.random() < 0.8) particles.burst(V.clone().add(new THREE.Vector3(0, 0.8 * s, 0)), 0x2a2420, 8, { speed: 2, up: 1.5, gravity: -1, size: 0.45, life: 1.4, spread: 0.9 });
      }
    }
    $('burn').style.opacity = victim?.local && t > 2.8 && t < 6.4 ? '1' : '0';
  } else if (kind === 'devorer') {
    if (isHost) {
      const top = V.clone().add(new THREE.Vector3(0, 22, 0));
      if (t < 2.6) {
        const k = t / 2.6;
        dragon.pos.lerpVectors(finale.D, V.clone().addScaledVector(toV, -6).add(new THREE.Vector3(0, 1.5, 0)), k * k);
        dragon.yaw = Math.atan2(toV.x, toV.z);
      } else if (t < 6.6) {
        const k = Math.min((t - 2.6) / 3, 1);
        dragon.pos.lerpVectors(V.clone().addScaledVector(toV, -6).add(new THREE.Vector3(0, 1.5, 0)), top, k);
      } else {
        dragon.yaw += dt * 0.6;
      }
      dragon.biteT = t > 2.4 && t < 3 ? 0.2 : 0;
      dragon.airborne = true;
      dragon.breathing = false;
    }
    if (victim && t > 2.6 && t < 6.2) {
      // Saisi dans la gueule.
      const m = dragon.mouth();
      victim.obj.position.copy(m).add(new THREE.Vector3(0, -1.6, 0));
      victim.obj.rotation.z = Math.sin(t * 18) * 0.4;
      if (victim.local) player.pos.copy(victim.obj.position); else victim.hero.p.pos.copy(victim.obj.position), victim.hero.target.copy(victim.obj.position);
      if (t > 4.6) {
        const s = Math.max(0, 1 - (t - 4.6) / 0.6);
        victim.obj.scale.setScalar(Math.max(s, 0.001));
        if (!finale.gulped && s === 0) { finale.gulped = true; cam.shake = 1.5; particles.burst(m, 0x8a1010, 30, { speed: 6, up: 2, size: 0.5, life: 0.8 }); if (sfx.ctx) sfx._noise(0.5, { freq: 180, vol: 0.5, type: 'lowpass' }); }
      }
    }
  } else if (kind === 'chute') {
    if (isHost) {
      dragon.breathing = false;
      const g = world.terrain.heightAt(dragon.pos.x, dragon.pos.z) + 0.5;
      if (dragon.pos.y > g) { dragon.vel.y -= 22 * dt; dragon.pos.y = Math.max(g, dragon.pos.y + dragon.vel.y * dt); }
      dragon.bank = Math.min(dragon.bank + dt * 0.9, 1.3);
      dragon.airborne = dragon.pos.y > g + 1;
    }
    if (t > 1 && Math.random() < 0.5) particles.burst(dragon.center(), 0x332a26, 6, { speed: 3, up: 3, gravity: 1, size: 1.4, life: 1.4, spread: 3 });
    if (t > 4.5) dragon.inst.fade?.(Math.max(0.15, 1 - (t - 4.5) / 3));
  } else if (isHost) {
    dragon.breathing = false;
    dragon.yaw += dt * 0.4;
    dragon.pos.y += (world.center.y + 26 - dragon.pos.y) * (1 - Math.exp(-dt));
    dragon.airborne = true;
  }

  if (isHost && t >= FINALE_LEN[kind]) {
    finale = null;
    $('burn').style.opacity = '0';
    setPhase('end', { t: T.end, winner: phaseData.winner, victim: phaseData.victim });
  }
}

function showEnd(d) {
  cine.stop();
  finale = null;
  $('burn').style.opacity = '0';
  const w = d.winner;
  const won = (role === 'dragon' && w === 'dragon') || (role === 'player' && w === 'joueurs');
  $('end-kicker').textContent = w === 'annule' ? 'Bataille annulée' : 'Fin de la bataille';
  $('end-title').textContent = w === 'annule' ? 'Personne n\'est venu' : w === 'joueurs' ? `${battle.actor.name} est terrassé` : 'Le dragon règne';
  $('end-text').textContent = w === 'annule' ? 'Les options payées te sont remboursées.'
    : role === 'spectator' ? (w === 'joueurs' ? 'Les joueurs ont abattu le dragon !' : `${battle.actor.name} a gagné.`)
    : won ? 'Victoire !' : 'Défaite…';
  $('a-end').classList.remove('hidden');
  if (role === 'dragon' && !finished) { finished = true; net.end({ winner: w, victim: d.victim || null }); }
  setTimeout(() => net.close(), T.end * 1000);
}
$('end-close').addEventListener('click', () => net.close());

// ─── Boucle ────────────────────────────────────────────────────────
canvas.addEventListener('mousedown', (e) => {
  sfx.init();
  if ((phase === 'fight' || phase === 'lobby') && role !== 'spectator' && !input.locked && !cine.active) input.requestLock();
  if (e.button === 0) breathHeld = true;
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) breathHeld = false; });

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();

function update(dt) {
  elapsed += dt;
  const c = world.center;
  env.update(dt, cine.active ? cine.focus : c, elapsed);
  world.water.update(elapsed, env);
  world.ring.material.opacity = 0.4 + Math.sin(elapsed * 3) * 0.15;

  if (!battle) {
    const a = elapsed * 0.05;
    camera.position.set(c.x + Math.cos(a) * 80, c.y + 45, c.z + Math.sin(a) * 80);
    camera.lookAt(c);
    particles.update(dt);
    return;
  }

  // Dragon : piloté ici (lanceur), suivi ailleurs.
  if (role === 'dragon') {
    const look = input.consumeLook();
    if (!cine.active) { cam.rotate(look.dx, look.dy); }
    const scripted = phase === 'intro' || phase === 'finale' || phase === 'end';
    if (phase === 'intro') dragon.vel.set(0, 0, 0);
    if (phase === 'intro') {
      const k = Math.min((now() - phaseStart) / 3.2, 1);
      const S = new THREE.Vector3(phaseData.sx, phaseData.sy, phaseData.sz), H = new THREE.Vector3(phaseData.hx, phaseData.hy, phaseData.hz);
      dragon.pos.lerpVectors(S, H, k * k * (3 - 2 * k));
      const toC = c.clone().sub(H).setY(0).normalize();
      dragon.yaw = Math.atan2(toC.x, toC.z);
      dragon.airborne = true;
      dragon.breathing = false;
      if (now() >= phaseEnd) setPhase('fight', { t: T.fight });
    } else if (!scripted) {
      const aim = camera.getWorldDirection(tmp).clone();
      const basis = cam.basis();
      const frozen = phase !== 'fight';
      dragon.control(dt, input, basis, aim, { terrain: world.terrain, center: c, radius: SKY_R, ceiling: c.y + 75, breathHeld: breathHeld || input.down('Attack'), frozen: phase === 'lobby' ? false : frozen });
      if (phase === 'fight') {
        if (input.hit('Mouse2') || input.hit('KeyQ') || input.hit('KeyR')) { if (dragon.startBite()) { biteCheck = 0.28; if (sfx.ctx) sfx._noise(0.3, { freq: 900, vol: 0.3 }); } }
        if (input.hit('KeyE')) roar();
        hostDamage(dt);
        checkOutcome();
      }
    }
    updateFinale(dt);
    // Attente : départ auto quand tout le monde est là, annulation si personne.
    if (phase === 'lobby') {
      if (joined.size >= battle.players.length && autoStart < 0) autoStart = now() + 3;
      if (autoStart > 0 && now() >= autoStart) { autoStart = -1; startIntro(); }
      else if (now() >= phaseEnd) { if (joined.size) startIntro(); else setPhase('end', { t: T.end, winner: 'annule' }); }
      showLobby();
    }
    sendT -= dt;
    if (sendT <= 0) { sendT = 0.11; net.send('st', dragon.state()); }
    beatT -= dt;
    if (beatT <= 0) { beatT = 2; sendPhase(); }
    if (dragon.breathing && sfx.ctx && Math.random() < dt * 6) sfx._noise(0.35, { freq: 420, vol: 0.22, type: 'lowpass' });
  } else {
    dragon.follow(dt);
    updateFinale(dt);
    // Le dragon ne donne plus de nouvelles : il a fui.
    if (!finished && phase !== 'end' && phase !== 'loading' && now() - lastDragonMsg > 15) {
      finished = true;
      phase = 'end';
      if (role === 'player') net.end({ winner: 'joueurs', victim: null, raison: 'fuite_du_dragon' });
      showEnd({ winner: 'joueurs' });
      $('end-title').textContent = 'Le dragon a pris la fuite';
    }
  }
  dragon.render(dt, elapsed);
  if (dragon.breathing && role !== 'dragon' && sfx.ctx && Math.random() < dt * 4) sfx._noise(0.35, { freq: 420, vol: 0.15, type: 'lowpass' });

  // Héros distants
  for (const h of heroes.values()) h.update(dt, elapsed, world.terrain);

  // Héros local
  if (role === 'player' && player) {
    shieldCd = Math.max(shieldCd - dt, 0);
    shieldT = Math.max(shieldT - dt, 0);
    stunT = Math.max(stunT - dt, 0);
    const canAct = (phase === 'fight' || phase === 'lobby') && !cine.active && player.alive && stunT <= 0;
    const look = input.consumeLook();
    if (!cine.active) { cam.rotate(look.dx, look.dy); cam.zoom(input.consumeWheel()); }
    if (canAct && input.consumeAttack() && player.attackCooldown <= 0) shoot();
    else input.consumeAttack();
    if (canAct && input.hit('KeyE') && shieldCd <= 0) { shieldT = 1.6; shieldCd = 9; sfx.heal(); }
    const wasAlive = player.alive;
    if (!finale) {
      player.update(dt, canAct ? input : frozenInput, cam, { terrain: world.terrain, vegetation: { resolve() {} }, water: world.water, elapsed, night: 0 });
      // Reste dans l'arène.
      const dx = player.pos.x - c.x, dz = player.pos.z - c.z, d = Math.hypot(dx, dz);
      if (d > ARENA_R) { player.pos.x = c.x + (dx / d) * ARENA_R; player.pos.z = c.z + (dz / d) * ARENA_R; }
    } else {
      player._animate(dt, elapsed, false);
    }
    player.events.length = 0;
    playerShield.visible = shieldT > 0 && player.alive;
    if (wasAlive && !player.alive && phase === 'fight') {
      net.send('down', { by: hurtKind });
      sfx.death();
      big('Tu es tombé', 'La tribune te regarde…', 2600);
      deaths.push(me.id);
    }
    sendT -= dt;
    if (sendT <= 0) {
      sendT = 0.18;
      net.send('st', { x: +player.pos.x.toFixed(2), y: +player.pos.y.toFixed(2), z: +player.pos.z.toFixed(2), ry: +player.facing.toFixed(2), vx: +player.vel.x.toFixed(1), vz: +player.vel.z.toFixed(1), hp: Math.round(player.health), a: player.alive ? 1 : 0, m: player.attackT >= 0 ? 3 : 0, sh: shieldT > 0 ? 1 : 0 });
    }
    beatT -= dt;
    if (beatT <= 0 && phase === 'lobby') { beatT = 3; net.send('hi', { role }); }
  }

  bolts.update(dt, dragon, () => { net.send('hit', { dmg: 2 }); sfx.boltHit(); });
  particles.update(dt);

  // Caméra
  if (cine.active) cine.update(dt, camera);
  else if (role === 'spectator' || (role === 'player' && player && !player.alive) || phase === 'end') {
    director.update(dt, { dragon, heroes: heroViews(), center: c, terrain: world.terrain });
  } else if (role === 'dragon') {
    cam.update(dt, dragon.center(tmp).add(new THREE.Vector3(0, 3, 0)), world.terrain, -999, null);
  } else if (player) {
    const focus = tmp.copy(player.pos);
    focus.y = player.visY + 1.5;
    cam.update(dt, focus, world.terrain, world.water.surfaceAt(camera.position.x, camera.position.z, elapsed), null);
  }
  // Coupes de la tribune sur les moments forts.
  if (dragon.breathing && !update.wasBreathing) director.cut('face', null, 2.5);
  update.wasBreathing = dragon.breathing;

  renderHud();
  input.endFrame();
}

function shoot() {
  player.startAttack();
  const tip = player.staffTip(new THREE.Vector3());
  const near = dragon.hits(player.attackPoint(), 3.5);
  if (near) {
    net.send('hit', { dmg: 4 });
    particles.burst(player.attackPoint(), 0xbff8ff, 18, { speed: 5, size: 0.4, life: 0.5 });
    sfx.hit();
    return;
  }
  const dir = camera.getWorldDirection(new THREE.Vector3());
  const aimPoint = camera.position.clone().addScaledVector(dir, 90);
  const d = aimPoint.sub(tip).normalize();
  bolts.fire(tip, d, true);
  net.send('bolt', { x: +tip.x.toFixed(2), y: +tip.y.toFixed(2), z: +tip.z.toFixed(2), dx: +d.x.toFixed(3), dy: +d.y.toFixed(3), dz: +d.z.toFixed(3) });
  sfx.bolt();
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (world) update(dt);
  if (bloom.enabled) composer.render(); else renderer.render(scene, camera);
}

// ─── Démarrage ─────────────────────────────────────────────────────
(async () => {
  if (!net.available) {
    $('loading').classList.add('hidden');
    $('a-alone').classList.remove('hidden');
  }
  await build();
  loop();
  if (net.available) net.ready();
  window.__arena = { get phase() { return phase; }, get role() { return role; }, get dragon() { return dragon; }, get player() { return player; }, get elapsed() { return elapsed; }, camera, cine, bolts, input, joined, heroes, deaths, setPhase: (p, d) => setPhase(p, d), finish: (w, v) => finish(w, v) };
})();
