import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { Terrain, BIOME, BIOME_NAMES, SEA_LEVEL } from './world/terrain.js';
import { Water } from './world/water.js';
import { Environment } from './world/sky.js';
import { Vegetation } from './world/vegetation.js';
import { Player } from './entities/player.js';
import { FishSchool, Birds } from './entities/fauna.js';
import { SlimeManager } from './entities/slimes.js';
import { Relics, Portal, Orbs } from './entities/relics.js';
import { Particles } from './entities/particles.js';
import { Input } from './core/input.js';
import { ThirdPersonCamera } from './core/camera.js';
import { Sfx } from './core/audio.js';
import { Hud } from './ui/hud.js';

const $ = (id) => document.getElementById(id);
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};

// ─── Rendu ─────────────────────────────────────────────────────────
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.6;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 5000);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 1.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const env = new Environment(scene, renderer);
const particles = new Particles();
scene.add(particles.points);
const input = new Input(canvas);
const cam = new ThirdPersonCamera(camera);
const sfx = new Sfx();
const hud = new Hud();
const player = new Player();
scene.add(player.object);
const orbs = new Orbs(scene);
const shared = { uTime: { value: 0 } };

let quality = store.get('mv-quality', input.isTouch ? 'low' : 'medium');
function applyQuality() {
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(quality === 'low' ? 1 : quality === 'high' ? Math.min(dpr, 2) : Math.min(dpr, 1.5));
  bloom.enabled = quality !== 'low';
  env.setQuality(quality);
  const grass = world?.vegetation.group.getObjectByName('grass');
  if (grass) grass.visible = quality !== 'low';
  const flowers = world?.vegetation.group.getObjectByName('flower');
  if (flowers) flowers.visible = quality !== 'low';
  onResize();
}
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
}
window.addEventListener('resize', onResize);

// ─── État de la partie ─────────────────────────────────────────────
let world = null;
let state = 'title';
let level = 1;
let baseSeed = 0;
let score = 0;
let elapsed = 0;
let slimes = null;
const best = store.get('mv-best', { score: 0, level: 1 });

function randomSeed() { return Math.floor(Math.random() * 900000) + 100000; }
function levelSeed(seed, lvl) { return lvl === 1 ? seed : (Math.imul(seed ^ (lvl * 0x9e3779b1), 2654435761) >>> 0) % 1000000; }

async function buildWorld(seed, lvl, withLoading = true) {
  const load = $('loading');
  const fill = $('load-fill');
  const msg = $('load-msg');
  const step = async (p, m) => { if (withLoading) { fill.style.width = `${p * 100}%`; msg.textContent = m; await frame(); } };
  if (withLoading) load.classList.remove('hidden');

  if (world) disposeWorld();
  await step(0.05, 'Le bruit prend forme…');
  const terrain = new Terrain(seed);
  scene.add(terrain.mesh);
  await step(0.35, 'Les océans se remplissent…');
  const water = new Water(terrain);
  scene.add(water.mesh);
  const spawn = terrain.findSpawn();
  const relicCount = Math.min(4 + lvl, 8);
  const relics = new Relics(scene, terrain, seed, relicCount, [spawn]);
  const portal = new Portal(scene, terrain, spawn);
  await step(0.5, 'Les forêts poussent…');
  const exclude = [{ x: spawn.x, z: spawn.z, r: 18 }, ...relics.items.map((r) => ({ x: r.pos.x, z: r.pos.z, r: 6 }))];
  const vegetation = new Vegetation(terrain, seed, exclude);
  scene.add(vegetation.group);
  await step(0.75, 'La vie s\'éveille…');
  const fish = new FishSchool(terrain, seed, shared);
  scene.add(fish.mesh);
  const birds = new Birds(terrain, seed, shared);
  scene.add(birds.mesh);
  slimes = new SlimeManager(scene, terrain);
  await step(0.95, 'Presque prêt…');

  world = { seed, terrain, water, vegetation, fish, birds, relics, portal, spawn };
  // Le joueur apparaît devant le portail.
  const off = new THREE.Vector3(Math.sin(portal.group.rotation.y), 0, Math.cos(portal.group.rotation.y)).multiplyScalar(11);
  const sp = spawn.clone().add(off);
  sp.y = terrain.heightAt(sp.x, sp.z);
  player.spawn(sp);
  player.facing = portal.group.rotation.y;
  cam.yaw = player.facing + Math.PI;
  cam.target.copy(player.pos);
  hud.setWorld(terrain.mapCanvas, relics, lvl);
  hud.markRelics(relics);
  applyQuality();
  // Compile les shaders d'avance pour éviter les saccades.
  renderer.compile(scene, camera);
  await step(1, `Graine ${seed}`);
  if (withLoading) load.classList.add('hidden');
}

function disposeWorld() {
  const w = world;
  scene.remove(w.terrain.mesh, w.water.mesh, w.vegetation.group, w.fish.mesh, w.birds.mesh);
  w.terrain.dispose(); w.water.dispose(); w.vegetation.dispose(); w.fish.dispose(); w.birds.dispose();
  w.relics.dispose(); w.portal.dispose();
  slimes?.clear();
  orbs.clear();
  world = null;
}

// ─── UI ────────────────────────────────────────────────────────────
const seedInput = $('seed-input');
const urlSeed = parseInt(new URLSearchParams(location.search).get('seed'), 10);
baseSeed = Number.isFinite(urlSeed) ? urlSeed : randomSeed();
seedInput.value = baseSeed;
$('best').textContent = best.score ? `Record : ${best.score} pts · monde ${best.level}` : '';
$('quality').value = quality;
$('sens').value = store.get('mv-sens', 1);
input.sensitivity = parseFloat($('sens').value);
$('invert').checked = store.get('mv-invert', false);
input.invertY = $('invert').checked;

function setState(s) {
  state = s;
  $('title').classList.toggle('hidden', s !== 'title');
  $('pause').classList.toggle('hidden', s !== 'paused');
  $('dead').classList.toggle('hidden', s !== 'dead');
  $('bigmap').classList.toggle('hidden', s !== 'map');
  hud.show(s === 'playing' || s === 'map');
  $('touch-ui').classList.toggle('on', s === 'playing');
  input.enabled = s === 'playing';
  if (s !== 'playing') input.exitLock();
  else { input.lookDX = input.lookDY = 0; input.wheel = 0; }
  if (s === 'paused') $('pause-seed').textContent = `Graine ${world?.seed} · monde ${level}`;
}

$('seed-random').addEventListener('click', () => { seedInput.value = randomSeed(); sfx.click(); });
$('play-btn').addEventListener('click', async () => {
  sfx.init();
  const s = parseInt(seedInput.value, 10);
  const seed = Number.isFinite(s) ? Math.abs(s) % 10000000 : randomSeed();
  if (!world || seed !== baseSeed || level !== 1) {
    baseSeed = seed;
    level = 1;
    await buildWorld(seed, 1);
  }
  score = 0;
  history.replaceState(null, '', `?seed=${baseSeed}`);
  env.time = 0.3;
  setState('playing');
  input.requestLock();
  hud.toast(`Trouve les <b>${world.relics.total} reliques</b> pour ouvrir le portail`, 4200);
});
$('resume-btn').addEventListener('click', () => { setState('playing'); input.requestLock(); });
$('newworld-btn').addEventListener('click', async () => {
  baseSeed = randomSeed();
  level = 1;
  score = 0;
  seedInput.value = baseSeed;
  await buildWorld(baseSeed, 1);
  history.replaceState(null, '', `?seed=${baseSeed}`);
  setState('playing');
  input.requestLock();
});
$('menu-btn').addEventListener('click', () => setState('title'));
$('respawn-btn').addEventListener('click', () => respawn());
$('quality').addEventListener('change', (e) => { quality = e.target.value; store.set('mv-quality', quality); applyQuality(); });
$('sens').addEventListener('input', (e) => { input.sensitivity = parseFloat(e.target.value); store.set('mv-sens', input.sensitivity); });
$('invert').addEventListener('change', (e) => { input.invertY = e.target.checked; store.set('mv-invert', input.invertY); });
$('timescale').addEventListener('change', (e) => { env.timeScale = parseFloat(e.target.value); });
$('mute').addEventListener('change', (e) => sfx.setMuted(e.target.checked));
$('touch-pause').addEventListener('click', () => setState('paused'));

canvas.addEventListener('click', () => {
  if (state === 'playing' && !input.locked) input.requestLock();
});
input.onLockChange = (locked) => {
  // Échap libère la souris : on met en pause.
  if (!locked && state === 'playing' && !input.isTouch) setState('paused');
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && (state === 'playing' || state === 'map')) {
    if (state === 'map') { setState('playing'); input.requestLock(); }
    else { hud.drawBigMap(player, world.relics, world.portal); setState('map'); }
  } else if (e.code === 'Escape') {
    if (state === 'map') setState('playing');
    else if (state === 'paused') { setState('playing'); input.requestLock(); }
    else if (state === 'playing' && input.isTouch) setState('paused');
  }
});

function respawn() {
  const w = world;
  const off = new THREE.Vector3(Math.sin(w.portal.group.rotation.y), 0, Math.cos(w.portal.group.rotation.y)).multiplyScalar(11);
  const sp = w.spawn.clone().add(off);
  sp.y = w.terrain.heightAt(sp.x, sp.z);
  player.spawn(sp);
  slimes.clear();
  setState('playing');
  input.requestLock();
}

async function nextWorld() {
  state = 'transition';
  sfx.warp();
  const fade = $('fade');
  fade.style.opacity = '1';
  await new Promise((r) => setTimeout(r, 900));
  score += 250 * level;
  level++;
  await buildWorld(levelSeed(baseSeed, level), level);
  fade.style.opacity = '0';
  setState('playing');
  input.requestLock();
  hud.toast(`<b>Monde ${level}</b> · ${world.relics.total} reliques à trouver`, 4000);
  saveBest();
}

function saveBest() {
  if (score > best.score || level > best.level) {
    best.score = Math.max(best.score, score);
    best.level = Math.max(best.level, level);
    store.set('mv-best', best);
  }
}

// ─── Événements de jeu ─────────────────────────────────────────────
function handlePlayerEvents() {
  for (const e of player.events) {
    switch (e.type) {
      case 'hurt':
        hud.flashHurt(); sfx.hurt(); cam.shake = Math.min(cam.shake + 0.6, 1);
        particles.burst(player.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xff4060, 10, { speed: 3, size: 0.25 });
        break;
      case 'death':
        sfx.death(); saveBest();
        setTimeout(() => { if (!player.alive) setState('dead'); }, 900);
        break;
      case 'swing': sfx.swing(); break;
      case 'jump': sfx.jump(); break;
      case 'land':
        if (e.impact > 9) { sfx.land(); particles.burst(player.pos, 0xb8a080, 14, { speed: 3, up: 1, gravity: -3, size: 0.4, life: 0.7 }); }
        break;
      case 'splash':
        sfx.splash();
        particles.burst(new THREE.Vector3(player.pos.x, SEA_LEVEL + 0.2, player.pos.z), 0xcff4ff, 30, { speed: 3, up: 5, gravity: -14, size: 0.3, life: 0.9 });
        break;
    }
  }
  player.events.length = 0;

  for (const e of slimes.events) {
    switch (e.type) {
      case 'slimeKilled':
        sfx.squish();
        particles.burst(e.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), e.color, 40, { speed: 6, up: 6, gravity: -14, size: 0.35, life: 1 });
        score += e.score;
        if (Math.random() < 0.4) orbs.drop(e.pos);
        break;
      case 'slimeHurt':
        sfx.hit();
        particles.burst(e.slime.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), e.slime.T.color, 12, { speed: 4, size: 0.25 });
        break;
      case 'slimeMelt':
        particles.burst(e.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), e.color, 12, { speed: 1.5, up: 1, gravity: -2, size: 0.3 });
        break;
    }
  }
  slimes.events.length = 0;
}

function onRelic(r) {
  const p = r.pos.clone().add(new THREE.Vector3(0, 2, 0));
  particles.burst(p, r.color, 120, { speed: 9, up: 9, gravity: -8, size: 0.45, life: 1.8 });
  particles.burst(p, 0xffffff, 40, { speed: 4, up: 12, gravity: -4, size: 0.3, life: 2 });
  sfx.relic();
  score += 100;
  hud.markRelics(world.relics);
  player.health = Math.min(player.health + 30, player.maxHealth);
  const left = world.relics.total - world.relics.collected;
  if (left > 0) hud.toast(`Relique trouvée · encore <b>${left}</b>`);
  else {
    world.portal.activate();
    sfx.portalOpen();
    hud.toast('Toutes les reliques ! <b>Le portail est ouvert</b>', 5000);
  }
}

function onRelicApproach(r) {
  // Les reliques sont gardées.
  const n = 1 + Math.min(level, 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = r.pos.x + Math.cos(a) * 6, z = r.pos.z + Math.sin(a) * 6;
    const h = world.terrain.heightAt(x, z);
    if (h < SEA_LEVEL + 0.3) continue;
    const b = world.terrain.biomeAt(x, z);
    const type = i === 0 && level >= 2 ? 'king' : b === BIOME.SWAMP ? 'bog' : b === BIOME.SNOW || b === BIOME.MOUNTAIN ? 'frost' : 'green';
    const s = slimes.spawn(type, new THREE.Vector3(x, h, z));
    s.guard = r.pos.clone();
  }
}

// ─── Boucle ────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0;
const tmpV = new THREE.Vector3();

function loop() {
  requestAnimationFrame(loop);
  const raw = clock.getDelta();
  fpsAcc += raw; fpsN++;
  if (fpsAcc > 1) { window.__fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  if (!world) { renderer.render(scene, camera); return; }
  update(Math.min(raw, 0.05));
  if (bloom.enabled) composer.render(); else renderer.render(scene, camera);
}

function update(dt) {
  elapsed += dt;
  shared.uTime.value = elapsed;

  const playing = state === 'playing';
  const w = world;

  if (state === 'title') {
    // Survol lent de l'île.
    const a = elapsed * 0.04;
    const r = 120;
    tmpV.set(w.spawn.x + Math.cos(a) * r, 0, w.spawn.z + Math.sin(a) * r);
    tmpV.y = Math.max(w.terrain.heightAt(tmpV.x, tmpV.z), 0) + 45;
    camera.position.lerp(tmpV, 1 - Math.exp(-dt * 2));
    camera.lookAt(w.spawn.x, w.spawn.y + 10, w.spawn.z);
    env.update(dt * 4, w.spawn, elapsed);
  } else {
    if (playing) {
      const look = input.consumeLook();
      cam.rotate(look.dx, look.dy);
      cam.zoom(input.consumeWheel());
      if (input.consumeAttack()) player.startAttack();
    }
    const night = env.nightFactor;
    if (playing || state === 'dead') {
      const { hitNow } = player.update(dt, input, cam, { terrain: w.terrain, vegetation: w.vegetation, water: w.water, elapsed, night });
      if (hitNow) {
        const p = player.attackPoint();
        particles.burst(p, 0x8ff6ff, 10, { speed: 2.5, up: 1, gravity: 0, size: 0.25, life: 0.4 });
        slimes.hitArea(p, 1.6, player.pos);
      }
      slimes.update(dt, player, { night, level, elapsed });
      w.relics.update(dt, elapsed, player, onRelic, onRelicApproach);
      orbs.update(dt, elapsed, player, (p) => {
        player.health = Math.min(player.health + 25, player.maxHealth);
        sfx.heal();
        particles.burst(p, 0xff6fa8, 20, { speed: 2, up: 3, gravity: -2, size: 0.3 });
      });
      if (w.portal.update(dt, elapsed, player) && state === 'playing') nextWorld();
      handlePlayerEvents();
      env.update(dt, player.pos, elapsed);
    } else {
      w.portal.update(0, elapsed, player);
    }
    const focus = tmpV.copy(player.pos);
    focus.y += player.swimming ? 0.6 : 1.5;
    cam.update(dt, focus, w.terrain, w.water.surfaceAt(camera.position.x, camera.position.z, elapsed), w.vegetation);
  }

  w.vegetation.update(elapsed);
  w.water.update(elapsed, env);
  w.fish.update(dt, player.pos, player.swimming);
  w.birds.update(dt, elapsed);
  particles.update(dt);

  // Sous l'eau : brouillard bleu dense.
  const underwater = camera.position.y < w.water.surfaceAt(camera.position.x, camera.position.z, elapsed);
  if (underwater) {
    scene.fog.color.setRGB(0.04, 0.22, 0.3).multiplyScalar(Math.max(env.dayFactor, 0.25));
    scene.fog.near = 1; scene.fog.far = 45;
    scene.background = scene.fog.color;
  } else {
    scene.fog.near = 220; scene.fog.far = 1250;
    scene.background = null;
  }
  env.sky.visible = env.clouds.visible = !underwater;
  env.stars.visible = !underwater;
  sfx.setUnderwater(underwater);

  // Biome courant
  if (state === 'playing') {
    const b = player.swimming ? BIOME.OCEAN : w.terrain.biomeAt(player.pos.x, player.pos.z);
    hud.biome(BIOME_NAMES[b]);
    hud.update({ player, env, relics: w.relics, portal: w.portal, score, camYaw: cam.yaw, underwater, locked: input.locked, isTouch: input.isTouch });
  }

  input.endFrame();
}

// Simulation sans rendu (tests automatisés) : avance de `sec` secondes à 60 Hz.
function simulate(sec, keys = []) {
  keys.forEach((k) => input.keys.add(k));
  for (let i = 0; i < Math.round(sec * 60); i++) update(1 / 60);
  keys.forEach((k) => input.keys.delete(k));
}

// ─── Démarrage ─────────────────────────────────────────────────────
(async () => {
  onResize();
  await buildWorld(baseSeed, 1);
  camera.position.set(world.spawn.x + 120, 60, world.spawn.z);
  setState('title');
  loop();
})();

// Accès debug / tests.
window.__game = { get world() { return world; }, get slimes() { return slimes; }, get score() { return score; }, get level() { return level; }, player, env, cam, input, get state() { return state; }, setState, nextWorld, simulate, renderer, scene, camera };
