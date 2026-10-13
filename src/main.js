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
import { lerp } from './core/noise.js';
import { Hud } from './ui/hud.js';
import { StoryUI } from './ui/story-ui.js';
import { SkillSystem, SKILLS, SKILL_ORDER, UPGRADES } from './game/skills.js';
import { INTRO, CHAPTERS, FINALE, HINTS, SKILL_LINES, chapterFor, chapterNumeral } from './game/story.js';

const $ = (id) => document.getElementById(id);
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
};

// ─── Rendu ─────────────────────────────────────────────────────────
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.6;

const scene = new THREE.Scene();
const BASE_FOV = 62;
const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.1, 5000);
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
const story = new StoryUI();
story.onBlip = () => sfx.blip();
const player = new Player();
scene.add(player.object);
const orbs = new Orbs(scene);
const skills = new SkillSystem(scene, particles);
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
let playTime = 0;
let slimes = null;
let fragments = []; // { level, idx }
let flags = {};
let storyBg = 'flyover'; // fond des séquences : survol ou jeu figé
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
  placeAtArch();
  hud.setWorld(terrain.mapCanvas, relics, lvl);
  hud.markRelics(relics);
  $('world-label').textContent = lvl <= CHAPTERS.length ? `Chapitre ${chapterNumeral(lvl)}` : `Monde ${lvl}`;
  applyQuality();
  renderer.compile(scene, camera); // évite les saccades à la première image
  await step(1, `Graine ${seed}`);
  if (withLoading) load.classList.add('hidden');
}

function placeAtArch() {
  const w = world;
  const a = w.portal.group.rotation.y;
  const sp = w.spawn.clone().add(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(11));
  sp.y = w.terrain.heightAt(sp.x, sp.z);
  player.spawn(sp);
  player.facing = a;
  cam.yaw = a + Math.PI;
  cam.target.copy(player.pos);
}

function disposeWorld() {
  const w = world;
  scene.remove(w.terrain.mesh, w.water.mesh, w.vegetation.group, w.fish.mesh, w.birds.mesh);
  w.terrain.dispose(); w.water.dispose(); w.vegetation.dispose(); w.fish.dispose(); w.birds.dispose();
  w.relics.dispose(); w.portal.dispose();
  slimes?.clear();
  orbs.clear();
  skills.clear();
  world = null;
}

// ─── Sauvegarde ────────────────────────────────────────────────────
function save() {
  store.set('mv-save', { v: 2, baseSeed, level, score, skills: skills.serialize(), fragments, flags });
}
function readSave() {
  const s = store.get('mv-save', null);
  return s && s.v === 2 ? s : null;
}
function refreshTitle() {
  const s = readSave();
  const cont = $('continue-btn');
  cont.classList.toggle('hidden', !s);
  $('play-btn').classList.toggle('secondary', !!s);
  if (s) cont.textContent = `Continuer · ${s.level <= CHAPTERS.length ? `Chapitre ${chapterNumeral(s.level)}` : `Monde ${s.level}`}`;
  $('best').textContent = best.score ? `Record : ${best.score} pts · monde ${best.level}` : '';
}

// ─── UI ────────────────────────────────────────────────────────────
const seedInput = $('seed-input');
const urlSeed = parseInt(new URLSearchParams(location.search).get('seed'), 10);
baseSeed = Number.isFinite(urlSeed) ? urlSeed : randomSeed();
seedInput.value = baseSeed;
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
  $('journal').classList.toggle('hidden', s !== 'journal');
  hud.show(s === 'playing' || s === 'map');
  $('touch-ui').classList.toggle('on', s === 'playing');
  input.enabled = s === 'playing';
  if (s !== 'playing') input.exitLock();
  else { input.lookDX = input.lookDY = 0; input.wheel = 0; }
  if (s === 'paused') $('pause-seed').textContent = `Graine ${baseSeed} · ${$('world-label').textContent}`;
  if (s === 'title') refreshTitle();
}

function play() {
  setState('playing');
  input.requestLock();
}

$('seed-random').addEventListener('click', () => { seedInput.value = randomSeed(); sfx.click(); });

// Nouvelle partie : intro, puis chapitre I.
$('play-btn').addEventListener('click', async () => {
  if (readSave() && !window.confirm('Commencer une nouvelle partie ? La sauvegarde actuelle sera remplacée.')) return;
  sfx.init();
  const s = parseInt(seedInput.value, 10);
  const seed = Number.isFinite(s) ? Math.abs(s) % 10000000 : randomSeed();
  if (!world || seed !== baseSeed || level !== 1) {
    baseSeed = seed;
    level = 1;
    await buildWorld(seed, 1);
  } else placeAtArch();
  score = 0;
  fragments = [];
  flags = {};
  playTime = 0;
  skills.reset(player);
  story.buildBar(skills);
  story.clearDialogue();
  history.replaceState(null, '', `?seed=${baseSeed}`);
  env.time = 0.3;
  storyBg = 'flyover';
  state = 'story';
  $('title').classList.add('hidden');
  await story.sequence(INTRO, { kicker: 'Mondes Vivants' });
  startChapter();
  save();
});

$('continue-btn').addEventListener('click', async () => {
  sfx.init();
  const s = readSave();
  if (!s) return;
  baseSeed = s.baseSeed;
  level = s.level;
  score = s.score || 0;
  fragments = s.fragments || [];
  flags = s.flags || {};
  seedInput.value = baseSeed;
  await buildWorld(levelSeed(baseSeed, level), level);
  skills.load(s.skills, player);
  player.health = player.maxHealth;
  player.stamina = player.maxStamina;
  story.buildBar(skills);
  story.clearDialogue();
  history.replaceState(null, '', `?seed=${baseSeed}`);
  env.time = 0.3;
  startChapter();
});

function startChapter() {
  play();
  story.chapterCard(level);
  const ch = chapterFor(level);
  setTimeout(() => ch.arrival.forEach((l) => story.say(l)), 2600);
  hud.toast(`Trouve les <b>${world.relics.total} éclats de mémoire</b>`, 4200);
}

$('resume-btn').addEventListener('click', play);
$('menu-btn').addEventListener('click', () => { save(); setState('title'); });
$('journal-btn').addEventListener('click', () => openJournal());
$('respawn-btn').addEventListener('click', () => respawn());
$('quality').addEventListener('change', (e) => { quality = e.target.value; store.set('mv-quality', quality); applyQuality(); });
$('sens').addEventListener('input', (e) => { input.sensitivity = parseFloat(e.target.value); store.set('mv-sens', input.sensitivity); });
$('invert').addEventListener('change', (e) => { input.invertY = e.target.checked; store.set('mv-invert', input.invertY); });
$('timescale').addEventListener('change', (e) => { env.timeScale = parseFloat(e.target.value); });
$('mute').addEventListener('change', (e) => sfx.setMuted(e.target.checked));
$('touch-pause').addEventListener('click', () => setState('paused'));

function openJournal() {
  story.renderJournal({ fragments, skills, level, upgrades: skills.upgrades });
  setState('journal');
}

canvas.addEventListener('click', () => {
  if (state === 'playing' && !input.locked) input.requestLock();
});
input.onLockChange = (locked) => {
  // Échap libère la souris : on met en pause.
  if (!locked && state === 'playing' && !input.isTouch) setState('paused');
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && (state === 'playing' || state === 'map')) {
    if (state === 'map') play();
    else { hud.drawBigMap(player, world.relics, world.portal); setState('map'); }
  } else if (e.code === 'KeyJ' && (state === 'playing' || state === 'journal' || state === 'paused')) {
    if (state === 'journal') play();
    else openJournal();
  } else if (e.code === 'Escape') {
    if (state === 'map' || state === 'journal') play();
    else if (state === 'paused') play();
    else if (state === 'playing' && input.isTouch) setState('paused');
  }
});

function respawn() {
  placeAtArch();
  slimes.clear();
  play();
  if (!flags.firstDeath) { flags.firstDeath = true; story.say(HINTS.firstDeath); }
}

async function nextWorld() {
  state = 'transition';
  sfx.warp();
  const fade = $('fade');
  fade.style.opacity = '1';
  await wait(900);
  score += 250 * level;
  saveBest();

  // Fin de l'histoire après le chapitre V.
  if (level === CHAPTERS.length && !flags.finished) {
    fade.style.opacity = '0';
    storyBg = 'frozen';
    state = 'story';
    hud.show(false);
    story.clearDialogue();
    const choice = await story.sequence(FINALE.lines, {
      kicker: 'Le Rêveur',
      deep: true,
      choices: [{ id: 'wake', label: FINALE.wake.label }, { id: 'dream', label: FINALE.dream.label, primary: true }],
    });
    flags.finished = true;
    if (choice === 'wake') {
      await story.sequence(FINALE.wake.lines, { kicker: 'Épilogue', deep: true });
      score += 1000;
      saveBest();
      store.del('mv-save');
      setState('title');
      return;
    }
    await story.sequence(FINALE.dream.lines, { kicker: 'Épilogue', deep: true });
    fade.style.opacity = '1';
    await wait(600);
  }

  level++;
  await buildWorld(levelSeed(baseSeed, level), level);
  fade.style.opacity = '0';
  save();
  startChapter();
}

function saveBest() {
  if (score > best.score || level > best.level) {
    best.score = Math.max(best.score, score);
    best.level = Math.max(best.level, level);
    store.set('mv-best', best);
  }
}

// ─── Événements de jeu ─────────────────────────────────────────────
const UP = new THREE.Vector3(0, 1, 0);
function handleEvents() {
  for (const e of player.events) {
    switch (e.type) {
      case 'hurt':
        hud.flashHurt(); sfx.hurt(); cam.shake = Math.min(cam.shake + 0.6, 1);
        particles.burst(player.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xff4060, 10, { speed: 3, size: 0.25 });
        if (player.health < 30 && player.alive && !flags.lowHealth) { flags.lowHealth = true; story.say(HINTS.lowHealth); }
        break;
      case 'death':
        sfx.death(); saveBest();
        setTimeout(() => { if (!player.alive) setState('dead'); }, 900);
        break;
      case 'swing': sfx.swing(); break;
      case 'jump': sfx.jump(); break;
      case 'doubleJump':
        sfx.doubleJump();
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          particles.burst(player.pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5)), 0xbff7ff, 1, { speed: 2.5, up: -0.5, gravity: 0, size: 0.3, life: 0.5, spread: 0 });
        }
        break;
      case 'dash':
        sfx.dash();
        cam.shake = Math.min(cam.shake + 0.25, 1);
        break;
      case 'dashTrail':
        particles.burst(player.pos.clone().add(new THREE.Vector3(0, 0.6 + Math.random() * 0.8, 0)), 0x7ff0ff, 2, { speed: 0.6, up: 0.3, gravity: 0, size: 0.35, life: 0.45, spread: 0.5 });
        break;
      case 'step':
        sfx.step(e.run);
        if (e.run) {
          const b = world.terrain.biomeAt(player.pos.x, player.pos.z);
          const col = b === BIOME.DESERT || b === BIOME.BEACH ? 0xe0c890 : b === BIOME.SNOW ? 0xffffff : 0xa89070;
          particles.burst(player.pos.clone().add(new THREE.Vector3(0, 0.08, 0)), col, 3, { speed: 1, up: 0.6, gravity: -2, size: 0.22, life: 0.4, spread: 0.3 });
        }
        break;
      case 'land':
        if (e.impact > 9) { sfx.land(); particles.burst(player.pos, 0xb8a080, 14, { speed: 3, up: 1, gravity: -3, size: 0.4, life: 0.7 }); }
        break;
      case 'splash':
        sfx.splash();
        particles.burst(new THREE.Vector3(player.pos.x, SEA_LEVEL + 0.2, player.pos.z), 0xcff4ff, 30, { speed: 3, up: 5, gravity: -14, size: 0.3, life: 0.9 });
        if (!flags.firstSwim) { flags.firstSwim = true; story.say(HINTS.firstSwim); }
        break;
    }
  }
  player.events.length = 0;

  for (const e of skills.events) {
    if (e.type === 'bolt') sfx.bolt();
    else if (e.type === 'boltHit') sfx.boltHit();
    else if (e.type === 'nova') { sfx.nova(); cam.shake = Math.min(cam.shake + 0.7, 1); }
  }
  skills.events.length = 0;

  for (const e of slimes.events) {
    switch (e.type) {
      case 'slimeKilled':
        sfx.squish();
        particles.burst(e.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), e.color, 40, { speed: 6, up: 6, gravity: -14, size: 0.35, life: 1 });
        particles.burst(e.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xffffff, 8, { speed: 1, up: 5, gravity: 1, size: 0.25, life: 1.4 });
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

// Éclat de mémoire ramassé : fragment d'histoire + compétence ou amélioration.
function onRelic(r) {
  const p = r.pos.clone().add(new THREE.Vector3(0, 2, 0));
  particles.burst(p, r.color, 120, { speed: 9, up: 9, gravity: -8, size: 0.45, life: 1.8 });
  particles.burst(p, 0xffffff, 40, { speed: 4, up: 12, gravity: -4, size: 0.3, life: 2 });
  sfx.relic();
  score += 100;
  hud.markRelics(world.relics);
  player.health = Math.min(player.health + 30, player.maxHealth);

  const ch = chapterFor(level);
  const idx = world.relics.collected - 1;
  const frag = level <= CHAPTERS.length ? ch.fragments[Math.min(idx, ch.fragments.length - 1)] : ch.fragments[Math.floor(Math.random() * ch.fragments.length)];
  if (!fragments.some((f) => f.level === level && f.idx === idx)) fragments.push({ level, idx });

  let reward = '';
  const missing = SKILL_ORDER.find((id) => !skills.has(id));
  if (missing) {
    skills.unlock(missing, player);
    story.buildBar(skills);
    story.flashSlot(missing);
    const def = SKILLS[missing];
    reward = `Compétence retrouvée : ${def.icon} ${def.name} <kbd>${def.key}</kbd>`;
    setTimeout(() => sfx.unlock(), 500);
    setTimeout(() => story.say(SKILL_LINES[missing]), 1800);
  } else {
    const n = Object.values(skills.upgrades).reduce((a, b) => a + b, 0);
    const up = UPGRADES[n % UPGRADES.length];
    skills.upgrade(up.id, player);
    reward = `Force du souvenir : ${up.label}`;
    if (!flags.firstUpgrade) { flags.firstUpgrade = true; setTimeout(() => story.say(HINTS.firstUpgrade), 1800); }
  }
  story.memory(frag, reward, hex(r.color));

  const left = world.relics.total - world.relics.collected;
  if (left > 0) hud.toast(`Encore <b>${left}</b> éclat${left > 1 ? 's' : ''}`);
  else {
    world.portal.activate();
    sfx.portalOpen();
    hud.toast('<b>Le portail est ouvert</b>', 5000);
    setTimeout(() => story.say(ch.portal), 3500);
  }
  save();
}

function onRelicApproach(r) {
  if (!flags.firstGuard) { flags.firstGuard = true; story.say(HINTS.firstGuard); }
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

function checkHints() {
  if (!flags.firstNight && env.isNight()) { flags.firstNight = true; story.say(HINTS.firstNight); }
  if (!flags.firstRun && playTime > 22) {
    flags.firstRun = true;
    if (!flags.ranOnce) story.say(HINTS.firstRun);
  }
  if (player.running) flags.ranOnce = true;
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
  const flyover = state === 'title' || (state === 'story' && storyBg === 'flyover');

  if (flyover) {
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
      playTime += dt;
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
      skills.update(dt, { input, player, cam, camera, terrain: w.terrain, slimes, enabled: playing });
      slimes.update(dt, player, { night, level, elapsed });
      w.relics.update(dt, elapsed, player, onRelic, onRelicApproach);
      orbs.update(dt, elapsed, player, (p) => {
        player.health = Math.min(player.health + 25, player.maxHealth);
        sfx.heal();
        particles.burst(p, 0xff6fa8, 20, { speed: 2, up: 3, gravity: -2, size: 0.3 });
      });
      if (w.portal.update(dt, elapsed, player) && state === 'playing') nextWorld();
      handleEvents();
      if (playing) checkHints();
      env.update(dt, player.pos, elapsed);
    } else {
      w.portal.update(0, elapsed, player);
    }
    const focus = tmpV.copy(player.pos);
    focus.y = player.visY + (player.swimming ? 0.6 : 1.5);
    cam.update(dt, focus, w.terrain, w.water.surfaceAt(camera.position.x, camera.position.z, elapsed), w.vegetation);

    // Champ de vision : s'élargit avec la vitesse (course, ruée, planeur).
    const fovTarget = BASE_FOV + player.runBlend * Math.min(player.speed2D / 11, 1) * 6 + (player.dashT > 0 ? 12 : 0) + (player.gliding ? 7 : 0);
    camera.fov = lerp(camera.fov, fovTarget, 1 - Math.exp(-dt * (player.dashT > 0 ? 14 : 5)));
    camera.updateProjectionMatrix();
  }

  w.vegetation.update(elapsed);
  w.water.update(elapsed, env);
  w.fish.update(dt, player.pos, player.swimming);
  w.birds.update(dt, elapsed);
  particles.update(dt);
  story.update(dt);

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

  if (state === 'playing') {
    const b = player.swimming ? BIOME.OCEAN : w.terrain.biomeAt(player.pos.x, player.pos.z);
    hud.biome(BIOME_NAMES[b]);
    hud.update({ player, env, relics: w.relics, portal: w.portal, score, camYaw: cam.yaw, underwater, locked: input.locked, isTouch: input.isTouch });
    story.updateBar(skills);
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
window.__game = {
  get world() { return world; }, get slimes() { return slimes; }, get score() { return score; }, get level() { return level; },
  get state() { return state; }, get fragments() { return fragments; }, get flags() { return flags; },
  player, env, cam, input, skills, story, setState, nextWorld, simulate, renderer, scene, camera, onRelic,
};
