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
import { SlimeManager, TYPES } from './entities/slimes.js';
import { Relics, Portal, Orbs } from './entities/relics.js';
import { Particles } from './entities/particles.js';
import { Input } from './core/input.js';
import { ThirdPersonCamera } from './core/camera.js';
import { Sfx } from './core/audio.js';
import { lerp } from './core/noise.js';
import { Hud } from './ui/hud.js';
import { StoryUI } from './ui/story-ui.js';
import { SkillSystem, SKILLS, UPGRADES } from './game/skills.js';
import { sendResult, uid, passthroughParams } from './game/report.js';
import { getStory, storyMeta, difficulty, relicsFor, estimateMinutes, STORY_COUNT, CHAPTER_COUNT } from './game/stories/index.js';

const $ = (id) => document.getElementById(id);
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible (iframe tierce) */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
};

// ─── Quelle histoire ? /1 … /100, ou ?story=N ─────────────────────
const parts = location.pathname.split('/').filter(Boolean);
const last = parts[parts.length - 1] || '';
const pathN = /^\d+$/.test(last) ? parseInt(last, 10) : NaN;
const queryN = parseInt(new URLSearchParams(location.search).get('story'), 10);
const PATH_MODE = Number.isFinite(pathN);
const storyN = [pathN, queryN].find((v) => Number.isFinite(v) && v >= 1 && v <= STORY_COUNT) || null;
const QUERY_LINKS = location.protocol === 'file:' || import.meta.env.DEV || (!PATH_MODE && Number.isFinite(queryN));
// Les paramètres de l'URL (identifiant du joueur…) suivent d'une page à l'autre.
const keepQ = () => { const q = passthroughParams().toString(); return q ? `&${q}` : ''; };
const keepQ1 = () => { const q = passthroughParams().toString(); return q ? `?${q}` : ''; };
const linkTo = (n) => (QUERY_LINKS ? `?story=${n}${keepQ()}` : (PATH_MODE ? `../${n}/` : `./${n}/`) + keepQ1());
const hubLink = () => (QUERY_LINKS ? location.pathname + keepQ1() : (PATH_MODE ? '../' : './') + keepQ1());
const story = storyN ? getStory(storyN) : null;
const EMBEDDED = window.self !== window.top;

function notify(type, extra = {}) {
  if (!EMBEDDED) return;
  try { window.parent.postMessage({ source: 'mondes-vivants', type, story: storyN, ...extra }, '*'); } catch { /* parent inaccessible */ }
}

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
const ui = new StoryUI();
ui.onBlip = () => sfx.blip();
if (story) ui.guide = story.guide;
const player = new Player();
scene.add(player.object);
if (story && storyN !== 1) {
  // Couleurs du héros tirées de son numéro d'histoire.
  const h = (storyN * 0.6180339) % 1;
  const c = (hh, s, l) => new THREE.Color().setHSL(hh % 1, s, l);
  player.setOutfit(c(h, 0.45, 0.32), c(h + 0.45, 0.65, 0.5), c(h + 0.08, 0.25, 0.22));
}
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

// ─── État ──────────────────────────────────────────────────────────
let world = null;
let state = 'title';
let chapter = 1;
let builtFor = null; // « n:chapitre » du monde chargé
let score = 0;
let elapsed = 0;
let playTime = 0;
let slimes = null;
let fragments = []; // { level: chapitre, idx }
let flags = {};
let storyBg = 'flyover';
let run = null; // tentative en cours : { session, debut }
let diff = difficulty(storyN || 1, 0);
const SAVE_KEY = `mv-s${storyN}`;

const chapterSeed = (n, c) => ((n * 104729 + c * 7919 + 1337) >>> 0) % 1000000;

async function buildWorld(n, c, withLoading = true) {
  const load = $('loading');
  const fill = $('load-fill');
  const msg = $('load-msg');
  const step = async (p, m) => { if (withLoading) { fill.style.width = `${p * 100}%`; msg.textContent = m; await frame(); } };
  if (withLoading) load.classList.remove('hidden');
  const seed = chapterSeed(n, c);

  if (world) disposeWorld();
  await step(0.05, 'Le bruit prend forme…');
  const terrain = new Terrain(seed);
  scene.add(terrain.mesh);
  await step(0.35, 'Les océans se remplissent…');
  const water = new Water(terrain);
  scene.add(water.mesh);
  const spawn = terrain.findSpawn();
  const relics = new Relics(scene, terrain, seed, relicsFor(c - 1), [spawn]);
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
  diff = difficulty(n, c - 1);
  slimes = new SlimeManager(scene, terrain, diff);
  await step(0.95, 'Presque prêt…');

  world = { seed, terrain, water, vegetation, fish, birds, relics, portal, spawn };
  builtFor = `${n}:${c}`;
  placeAtArch();
  hud.setWorld(terrain.mapCanvas, relics, c);
  hud.markRelics(relics);
  $('world-label').textContent = `Chapitre ${c}/${CHAPTER_COUNT}`;
  applyQuality();
  renderer.compile(scene, camera);
  await step(1, story ? story.chapters[c - 1].title : '');
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
  builtFor = null;
}

// ─── Sauvegarde (une par histoire) ─────────────────────────────────
function save() {
  if (!storyN) return;
  const taken = world ? world.relics.items.map((r, i) => (r.taken ? i : -1)).filter((i) => i >= 0) : [];
  store.set(SAVE_KEY, { v: 3, chapter, score, skills: skills.serialize(), fragments, flags, playTime: Math.round(playTime), taken, run });
}
function readSave() {
  const s = store.get(SAVE_KEY, null);
  return s && s.v === 3 ? s : null;
}
const doneList = () => store.get('mv-done', []);
function markDone(ending) {
  const d = doneList();
  if (!d.includes(storyN)) d.push(storyN);
  store.set('mv-done', d);
  store.set(`mv-end${storyN}`, ending);
}

// ─── Résultat envoyé au site principal ─────────────────────────────
function report(statut, raison, extra = '') {
  if (!run) return;
  const deaths = flags.deaths || 0;
  sendResult({
    niveau: storyN, statut,
    score: statut === 'reussi' ? Math.max(30, 100 - deaths * 3) : 0,
    raison,
    details: `chapitre=${chapter};morts=${deaths};temps_jeu_min=${Math.round(playTime / 60)};points=${score}${extra}`,
    session: run.session, debut: run.debut, fin: Date.now(),
  });
  run = null;
}

// Compétences et forces de départ de l'histoire.
function applyStartKit() {
  skills.reset(player);
  for (const id of story.plan.start) skills.unlock(id, player);
  for (let i = 0; i < story.plan.startUpgrades; i++) skills.upgrade(UPGRADES[i % UPGRADES.length].id, player);
  player.health = player.maxHealth;
  player.stamina = player.maxStamina;
}

// ─── Écrans titre et liste ─────────────────────────────────────────
const fmtTime = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}` : `${Math.round(min)} min`);
const starStr = (k) => '★'.repeat(k) + `<i>${'★'.repeat(5 - k)}</i>`;

function renderTitle() {
  if (!story) return;
  $('t-kicker').textContent = `Histoire ${storyN} / ${STORY_COUNT}`;
  $('t-title').textContent = story.title;
  $('t-premise').textContent = story.premise;
  const est = estimateMinutes(storyN);
  $('t-meta').innerHTML = `<span class="stars">${starStr(story.stars)}</span> · ≈ ${fmtTime(est)} · ${CHAPTER_COUNT} chapitres · ${story.plan.start.length} compétence${story.plan.start.length > 1 ? 's' : ''} au départ, ${story.plan.unlocks.length} à retrouver`;
  const s = readSave();
  const cont = $('continue-btn');
  cont.classList.toggle('hidden', !s);
  $('play-btn').classList.toggle('secondary', !!s);
  $('play-btn').textContent = s ? 'Recommencer' : doneList().includes(storyN) ? 'Rejouer' : 'Commencer';
  if (s) cont.textContent = `Continuer · chapitre ${s.chapter}`;
  $('t-all').href = hubLink();
  const end = store.get(`mv-end${storyN}`, null);
  $('best').textContent = end ? `Terminée · fin choisie : « ${end} »` : '';
}

function renderHub() {
  const done = doneList();
  const grid = $('hub-grid');
  let html = '';
  for (let n = 1; n <= STORY_COUNT; n++) {
    const m = storyMeta(n);
    const started = !done.includes(n) && store.get(`mv-s${n}`, null);
    html += `<a class="hub-card${done.includes(n) ? ' done' : started ? ' started' : ''}" href="${linkTo(n)}">
      <div class="n"><span>${n}</span><span class="stars">${starStr(m.stars)}</span></div>
      <b>${esc(m.title)}</b><span>${esc(m.hero)} · ${m.skills} compétences</span></a>`;
  }
  grid.innerHTML = html;
}

function setState(s) {
  state = s;
  $('title').classList.toggle('hidden', s !== 'title');
  $('hub').classList.toggle('hidden', s !== 'hub');
  $('pause').classList.toggle('hidden', s !== 'paused');
  $('dead').classList.toggle('hidden', s !== 'dead');
  $('bigmap').classList.toggle('hidden', s !== 'map');
  $('journal').classList.toggle('hidden', s !== 'journal');
  $('complete').classList.toggle('hidden', s !== 'complete');
  hud.show(s === 'playing' || s === 'map');
  $('touch-ui').classList.toggle('on', s === 'playing');
  input.enabled = s === 'playing';
  if (s !== 'playing') input.exitLock();
  else { input.lookDX = input.lookDY = 0; input.wheel = 0; }
  if (s === 'paused') $('pause-seed').textContent = `${story.title} · chapitre ${chapter} · ${fmtTime(playTime / 60)} de jeu`;
  if (s === 'title') renderTitle();
}

function play() {
  setState('playing');
  input.requestLock();
}

// ─── Lancement d'une partie ────────────────────────────────────────
$('play-btn').addEventListener('click', async () => {
  const old = readSave();
  if (old && !window.confirm('Recommencer cette histoire depuis le début ? La partie en cours comptera comme un échec.')) return;
  if (old?.run) {
    run = old.run; chapter = old.chapter; flags = old.flags || {}; playTime = old.playTime || 0; score = old.score || 0;
    report('echoue', 'recommence');
  }
  sfx.init();
  run = { session: uid(), debut: Date.now() };
  chapter = 1;
  score = 0;
  fragments = [];
  flags = {};
  playTime = 0;
  if (builtFor !== `${storyN}:1`) await buildWorld(storyN, 1);
  else placeAtArch();
  applyStartKit();
  ui.buildBar(skills);
  ui.clearDialogue();
  env.time = 0.3;
  storyBg = 'flyover';
  state = 'story';
  $('title').classList.add('hidden');
  await ui.sequence(story.intro, { kicker: `Histoire ${storyN} · ${story.title}` });
  save();
  startChapter();
  notify('start');
});

$('continue-btn').addEventListener('click', async () => {
  sfx.init();
  const s = readSave();
  if (!s) return;
  chapter = s.chapter;
  score = s.score || 0;
  fragments = s.fragments || [];
  flags = s.flags || {};
  playTime = s.playTime || 0;
  run = s.run || { session: uid(), debut: Date.now() };
  if (builtFor !== `${storyN}:${chapter}`) await buildWorld(storyN, chapter);
  else placeAtArch();
  skills.load(s.skills, player);
  player.health = player.maxHealth;
  player.stamina = player.maxStamina;
  for (const i of s.taken || []) world.relics.markTaken?.(i);
  hud.markRelics(world.relics);
  ui.buildBar(skills);
  ui.clearDialogue();
  env.time = 0.3;
  startChapter(true);
});

function startChapter(resumed = false) {
  player.regen = diff.regen;
  player.diffDmg = diff.dmg;
  play();
  const ch = story.chapters[chapter - 1];
  ui.chapterCard(chapter, ch.title);
  if (!resumed) setTimeout(() => ch.arrival.forEach((l) => ui.say(l)), 2600);
  const left = world.relics.total - world.relics.collected;
  if (left > 0) hud.toast(`Trouve les <b>${left} reliques</b> de l'île`, 4200);
  ensureBoss();
  notify('chapter', { chapter });
}

$('resume-btn').addEventListener('click', play);
$('abandon-btn').addEventListener('click', () => {
  if (!window.confirm('Abandonner cette histoire ? Elle comptera comme un échec et la progression sera effacée.')) return;
  report('echoue', 'abandon');
  store.del(SAVE_KEY);
  notify('abandon');
  setState('title');
});
$('menu-btn').addEventListener('click', () => { save(); setState('title'); });
$('journal-btn').addEventListener('click', () => openJournal());
$('respawn-btn').addEventListener('click', () => respawn());
$('quality').addEventListener('change', (e) => { quality = e.target.value; store.set('mv-quality', quality); applyQuality(); });
$('sens').addEventListener('input', (e) => { input.sensitivity = parseFloat(e.target.value); store.set('mv-sens', input.sensitivity); });
$('invert').addEventListener('change', (e) => { input.invertY = e.target.checked; store.set('mv-invert', input.invertY); });
$('timescale').addEventListener('change', (e) => { env.timeScale = parseFloat(e.target.value); });
$('mute').addEventListener('change', (e) => sfx.setMuted(e.target.checked));
$('touch-pause').addEventListener('click', () => setState('paused'));
$('c-replay').addEventListener('click', () => { store.del(SAVE_KEY); setState('title'); });
const toggleFs = () => {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {});
  } catch { /* plein écran refusé (iframe sans allow="fullscreen") */ }
};
$('fs-btn').addEventListener('click', toggleFs);
$('fs-btn2').addEventListener('click', toggleFs);
$('quality').value = quality;
$('sens').value = store.get('mv-sens', 1);
input.sensitivity = parseFloat($('sens').value);
$('invert').checked = store.get('mv-invert', false);
input.invertY = $('invert').checked;

function openJournal() {
  ui.renderJournal({ story, fragments, skills, chapter, upgrades: skills.upgrades });
  setState('journal');
}

canvas.addEventListener('click', () => {
  window.focus();
  if (state === 'playing' && !input.locked) input.requestLock();
});
input.onLockChange = (locked) => {
  if (!locked && state === 'playing' && !input.isTouch) setState('paused');
};
window.addEventListener('keydown', (e) => {
  if (!story) return;
  if (e.code === 'KeyM' && (state === 'playing' || state === 'map')) {
    if (state === 'map') play();
    else { hud.drawBigMap(player, world.relics, world.portal); setState('map'); }
  } else if (e.code === 'KeyJ' && (state === 'playing' || state === 'journal' || state === 'paused')) {
    if (state === 'journal') play();
    else openJournal();
  } else if (e.code === 'Escape') {
    if (state === 'map' || state === 'journal' || state === 'paused') play();
    else if (state === 'playing' && input.isTouch) setState('paused');
  }
});
// Sauvegarde si on quitte la page (fermeture de l'onglet ou de l'iframe).
window.addEventListener('pagehide', () => { if (story && (state === 'playing' || state === 'paused')) save(); });

function respawn() {
  placeAtArch();
  slimes.clear();
  play();
  ensureBoss();
  if (!flags.firstDeath) { flags.firstDeath = true; ui.say(story.hints.firstDeath); }
}

// ─── Gardien du portail ────────────────────────────────────────────
function ensureBoss() {
  const w = world;
  if (!w || w.portal.active || w.relics.collected < w.relics.total || slimes.boss) return;
  const a = w.portal.group.rotation.y;
  const p = w.spawn.clone().add(new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)).multiplyScalar(10));
  p.y = w.terrain.heightAt(p.x, p.z);
  const b = slimes.spawn('boss', p);
  b.guard = w.spawn.clone();
  b.name = story.chapters[chapter - 1].boss;
  if (chapter === CHAPTER_COUNT) { b.T.scale *= 1.25; b.object.scale.setScalar(b.T.scale); }
}

// ─── Fin de chapitre et fin d'histoire ─────────────────────────────
async function nextWorld() {
  state = 'transition';
  sfx.warp();
  const fade = $('fade');
  fade.style.opacity = '1';
  await wait(900);
  score += 250 * chapter;

  if (chapter >= CHAPTER_COUNT) {
    fade.style.opacity = '0';
    storyBg = 'frozen';
    state = 'story';
    hud.show(false);
    ui.clearDialogue();
    const f = story.finale;
    const choice = await ui.sequence(f.lines, {
      kicker: story.title, deep: true,
      choices: [{ id: 'a', label: f.a.label }, { id: 'b', label: f.b.label, primary: true }],
    });
    const end = choice === 'a' ? f.a : f.b;
    await ui.sequence(end.lines, { kicker: 'Épilogue', deep: true });
    score += 1000;
    markDone(end.label);
    report('reussi', 'histoire_terminee', `;fin=${choice === 'a' ? 'A' : 'B'}`);
    store.del(SAVE_KEY);
    notify('complete', { ending: end.label, score, minutes: Math.round(playTime / 60) });
    $('c-title').textContent = story.title;
    $('c-stats').textContent = `Fin choisie : « ${end.label} » · ${score} points · ${fmtTime(playTime / 60)} de jeu`;
    const next = $('c-next');
    if (storyN < STORY_COUNT) { next.href = linkTo(storyN + 1); next.textContent = `Histoire ${storyN + 1} : ${storyMeta(storyN + 1).title} →`; next.style.display = ''; }
    else next.style.display = 'none';
    $('c-all').href = hubLink();
    setState('complete');
    return;
  }

  chapter++;
  await buildWorld(storyN, chapter);
  fade.style.opacity = '0';
  save();
  startChapter();
}

// ─── Événements de jeu ─────────────────────────────────────────────
function handleEvents() {
  for (const e of player.events) {
    switch (e.type) {
      case 'hurt':
        hud.flashHurt(); sfx.hurt(); cam.shake = Math.min(cam.shake + 0.6, 1);
        particles.burst(player.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xff4060, 10, { speed: 3, size: 0.25 });
        if (player.health < 30 && player.alive && !flags.lowHealth) { flags.lowHealth = true; ui.say(story.hints.lowHealth); }
        break;
      case 'shieldHit':
        sfx.boltHit();
        particles.burst(player.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0x9ff3ff, 14, { speed: 4, size: 0.25 });
        break;
      case 'death':
        flags.deaths = (flags.deaths || 0) + 1;
        sfx.death();
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
      case 'dash': sfx.dash(); cam.shake = Math.min(cam.shake + 0.25, 1); break;
      case 'dashTrail':
        particles.burst(player.pos.clone().add(new THREE.Vector3(0, 0.6 + Math.random() * 0.8, 0)), 0x7ff0ff, 2, { speed: 0.6, up: 0.3, gravity: 0, size: 0.35, life: 0.45, spread: 0.5 });
        break;
      case 'slamStart': sfx.dash(); break;
      case 'slamLand':
        skills.slamImpact(e.pos, slimes);
        sfx.nova();
        cam.shake = 1;
        break;
      case 'step':
        sfx.step(e.run);
        if (e.run) {
          const b = world.terrain.biomeAt(player.pos.x, player.pos.z);
          const col = player.onWater ? 0xcff4ff : b === BIOME.DESERT || b === BIOME.BEACH ? 0xe0c890 : b === BIOME.SNOW ? 0xffffff : 0xa89070;
          particles.burst(player.pos.clone().add(new THREE.Vector3(0, 0.08, 0)), col, 3, { speed: 1, up: 0.6, gravity: -2, size: 0.22, life: 0.4, spread: 0.3 });
        }
        break;
      case 'land':
        if (e.impact > 9) { sfx.land(); particles.burst(player.pos, 0xb8a080, 14, { speed: 3, up: 1, gravity: -3, size: 0.4, life: 0.7 }); }
        break;
      case 'splash':
        sfx.splash();
        particles.burst(new THREE.Vector3(player.pos.x, SEA_LEVEL + 0.2, player.pos.z), 0xcff4ff, 30, { speed: 3, up: 5, gravity: -14, size: 0.3, life: 0.9 });
        if (!flags.firstSwim) { flags.firstSwim = true; ui.say(story.hints.firstSwim); }
        break;
    }
  }
  player.events.length = 0;

  for (const e of skills.events) {
    if (e.type === 'bolt') sfx.bolt();
    else if (e.type === 'boltHit') sfx.boltHit();
    else if (e.type === 'nova') { sfx.nova(); cam.shake = Math.min(cam.shake + 0.7, 1); }
    else if (e.type === 'shield' || e.type === 'heal') sfx.heal();
    else if (e.type === 'lightning') { sfx.bolt(); cam.shake = Math.min(cam.shake + 0.3, 1); }
    else if (e.type === 'chrono') { sfx.unlock(); }
    else if (e.type === 'roots') { sfx.land(); particles.burst(e.pos, 0x7fbf4a, 30, { speed: 6, up: 2, gravity: -6, size: 0.3, life: 0.7 }); }
    else if (e.type === 'fail') sfx.click();
  }
  skills.events.length = 0;

  for (const e of slimes.events) {
    switch (e.type) {
      case 'slimeKilled':
        sfx.squish();
        particles.burst(e.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), e.color, e.boss ? 160 : 40, { speed: e.boss ? 12 : 6, up: 6, gravity: -14, size: e.boss ? 0.6 : 0.35, life: 1.2 });
        particles.burst(e.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xffffff, 8, { speed: 1, up: 5, gravity: 1, size: 0.25, life: 1.4 });
        score += e.score;
        if (e.boss) onBossDown();
        else if (Math.random() < 0.38) orbs.drop(e.pos);
        break;
      case 'slimeHurt':
        sfx.hit();
        particles.burst(e.slime.pos.clone().add(new THREE.Vector3(0, 0.6 * e.slime.T.scale, 0)), e.slime.T.color, 12, { speed: 4, size: 0.25 });
        break;
      case 'slimeMelt':
        particles.burst(e.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), e.color, 12, { speed: 1.5, up: 1, gravity: -2, size: 0.3 });
        break;
      case 'slam':
        sfx.nova();
        particles.burst(e.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), 0xb8a080, e.big ? 60 : 30, { speed: e.radius * 2, up: 2, gravity: -6, size: 0.45, life: 0.7 });
        if (player.pos.distanceTo(e.pos) < 25) cam.shake = Math.min(cam.shake + (e.big ? 0.8 : 0.4), 1);
        break;
      case 'spit': sfx.squish(); break;
      case 'splat': particles.burst(e.pos, 0xff8a3c, 10, { speed: 2.5, up: 2, gravity: -8, size: 0.3, life: 0.5 }); break;
      case 'blink': particles.burst(e.from.clone().add(new THREE.Vector3(0, 0.5, 0)), 0x6a4aa8, 18, { speed: 2, up: 1.5, gravity: 0, size: 0.35, life: 0.6 }); break;
      case 'summon': particles.burst(e.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xff4a6a, 40, { speed: 6, up: 4, gravity: -4, size: 0.4, life: 0.9 }); break;
    }
  }
  slimes.events.length = 0;
}

function onBossDown() {
  const w = world;
  w.portal.activate();
  sfx.portalOpen();
  hud.toast('<b>Le gardien est vaincu.</b> Le portail est ouvert.', 5000);
  ui.say(chapter === CHAPTER_COUNT ? `C'est fini, ${story.hero}. Va au portail.` : 'Le portail est libre. Allons-y quand tu veux.');
  orbs.drop(player.pos.clone().add(new THREE.Vector3(1.5, 0, 0)));
  orbs.drop(player.pos.clone().add(new THREE.Vector3(-1.5, 0, 0)));
  save();
}

// Relique ramassée : fragment d'histoire + compétence, force ou soin.
function onRelic(r) {
  const p = r.pos.clone().add(new THREE.Vector3(0, 2, 0));
  particles.burst(p, r.color, 120, { speed: 9, up: 9, gravity: -8, size: 0.45, life: 1.8 });
  particles.burst(p, 0xffffff, 40, { speed: 4, up: 12, gravity: -4, size: 0.3, life: 2 });
  sfx.relic();
  score += 100;
  hud.markRelics(world.relics);
  player.health = Math.min(player.health + 30, player.maxHealth);

  const ch = story.chapters[chapter - 1];
  const idx = world.relics.collected - 1;
  const frag = ch.fragments[Math.min(idx, ch.fragments.length - 1)];
  if (!fragments.some((f) => f.level === chapter && f.idx === idx)) fragments.push({ level: chapter, idx });

  let reward = '';
  const unlock = story.plan.unlocks[chapter - 1];
  const pending = story.plan.unlocks.slice(0, chapter).find((id) => !skills.has(id));
  if (idx === 0 && unlock && !skills.has(unlock)) giveSkill(unlock);
  else if (pending) giveSkill(pending);
  else if (idx % 2 === 1) {
    const n = Object.values(skills.upgrades).reduce((a, b) => a + b, 0);
    const up = UPGRADES[n % UPGRADES.length];
    skills.upgrade(up.id, player);
    reward = `Force retrouvée : ${up.label}`;
    if (!flags.firstUpgrade) { flags.firstUpgrade = true; setTimeout(() => ui.say(story.hints.firstUpgrade), 1800); }
  } else reward = '+30 vie';

  function giveSkill(id) {
    skills.unlock(id, player);
    ui.buildBar(skills);
    ui.flashSlot(id);
    const def = SKILLS[id];
    reward = `Compétence retrouvée : ${def.icon} ${def.name} <kbd>${def.key}</kbd>`;
    setTimeout(() => sfx.unlock(), 500);
    setTimeout(() => ui.say(story.skillLines[id]), 1800);
  }
  ui.memory(frag, reward, hex(r.color));

  const left = world.relics.total - world.relics.collected;
  if (left > 0) hud.toast(`Encore <b>${left}</b> relique${left > 1 ? 's' : ''}`);
  else {
    hud.toast(`Toutes les reliques ! <b>${ch.boss}</b> garde le portail.`, 5000);
    setTimeout(() => {
      ui.say(ch.portal);
      if (!flags.bossHint) { flags.bossHint = true; ui.say(story.hints.boss); }
    }, 3500);
    ensureBoss();
  }
  save();
}

function onRelicApproach(r) {
  if (!flags.firstGuard) { flags.firstGuard = true; ui.say(story.hints.firstGuard); }
  const n = diff.guards;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = r.pos.x + Math.cos(a) * 6, z = r.pos.z + Math.sin(a) * 6;
    const h = world.terrain.heightAt(x, z);
    if (h < SEA_LEVEL + 0.3) continue;
    const s = slimes.spawn(slimes.guardType(x, z, i, env.nightFactor), new THREE.Vector3(x, h, z));
    s.guard = r.pos.clone();
  }
}

let hintTimer = 0;
function checkHints(dt) {
  if (!flags.firstNight && env.isNight()) { flags.firstNight = true; ui.say(story.hints.firstNight); }
  if (!flags.firstRun && playTime > 22) { flags.firstRun = true; if (!flags.ranOnce) ui.say(story.hints.firstRun); }
  if (player.running) flags.ranOnce = true;
  hintTimer -= dt;
  if (hintTimer <= 0) {
    hintTimer = 1;
    for (const s of slimes.list) {
      const t = s.type;
      if (story.hints.newEnemy[t] && !flags[`seen_${t}`] && s.pos.distanceTo(player.pos) < 30) {
        flags[`seen_${t}`] = true;
        ui.say(story.hints.newEnemy[t]);
      }
    }
  }
}

// ─── Boucle ────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0, autosave = 0;
const tmpV = new THREE.Vector3();
const bossbar = $('bossbar');

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
  const flyover = state === 'title' || state === 'hub' || (state === 'story' && storyBg === 'flyover');

  if (flyover) {
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
      autosave += dt;
      if (autosave > 30) { autosave = 0; save(); }
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
        slimes.hitArea(p, 1.6, player.pos, player.meleeDmg);
      }
      skills.update(dt, { input, player, cam, camera, terrain: w.terrain, slimes, enabled: playing, elapsed });
      slimes.update(dt, player, { night, elapsed });
      w.relics.update(dt, elapsed, player, onRelic, onRelicApproach);
      orbs.update(dt, elapsed, player, (p) => {
        player.health = Math.min(player.health + 25, player.maxHealth);
        sfx.heal();
        particles.burst(p, 0xff6fa8, 20, { speed: 2, up: 3, gravity: -2, size: 0.3 });
      }, skills.has('magnet') ? 22 : 0);
      if (w.portal.update(dt, elapsed, player) && state === 'playing') nextWorld();
      handleEvents();
      if (playing) checkHints(dt);
      env.update(dt, player.pos, elapsed);
    } else {
      w.portal.update(0, elapsed, player);
    }
    const focus = tmpV.copy(player.pos);
    focus.y = player.visY + (player.swimming ? 0.6 : 1.5);
    cam.update(dt, focus, w.terrain, w.water.surfaceAt(camera.position.x, camera.position.z, elapsed), w.vegetation);
    const fovTarget = BASE_FOV + player.runBlend * Math.min(player.speed2D / 11, 1) * 6 + (player.dashT > 0 ? 12 : 0) + (player.gliding ? 7 : 0) + (player.slamming ? 8 : 0);
    camera.fov = lerp(camera.fov, fovTarget, 1 - Math.exp(-dt * (player.dashT > 0 ? 14 : 5)));
    camera.updateProjectionMatrix();
  }

  w.vegetation.update(elapsed);
  w.water.update(elapsed, env);
  w.fish.update(dt, player.pos, player.swimming);
  w.birds.update(dt, elapsed);
  particles.update(dt);
  ui.update(dt);

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
    const boss = slimes.boss;
    const target = boss ? { pos: boss.pos, label: boss.name || 'Gardien' } : null;
    hud.update({ player, env, relics: w.relics, portal: w.portal, score, camYaw: cam.yaw, underwater, locked: input.locked, isTouch: input.isTouch, target });
    ui.updateBar(skills);
    const showBar = boss && boss.pos.distanceTo(player.pos) < 90;
    bossbar.classList.toggle('hidden', !showBar);
    if (showBar) {
      bossbar.querySelector('.bb-name').textContent = boss.name || 'Gardien';
      bossbar.querySelector('.bb-fill').style.width = `${Math.max(boss.hp / boss.maxHp, 0) * 100}%`;
    }
  }

  input.endFrame();
}

function simulate(sec, keys = []) {
  keys.forEach((k) => input.keys.add(k));
  for (let i = 0; i < Math.round(sec * 60); i++) update(1 / 60);
  keys.forEach((k) => input.keys.delete(k));
}

// ─── Démarrage ─────────────────────────────────────────────────────
(async () => {
  onResize();
  if (!story) {
    // Racine : liste des 100 histoires sur fond d'île.
    document.title = 'Mondes Vivants · 100 histoires';
    renderHub();
    setState('hub');
    await buildWorld(1, 1, false);
    camera.position.set(world.spawn.x + 120, 60, world.spawn.z);
    loop();
    return;
  }
  document.title = `${story.title} · Mondes Vivants`;
  const s = readSave();
  await buildWorld(storyN, s ? s.chapter : 1);
  camera.position.set(world.spawn.x + 120, 60, world.spawn.z);
  setState('title');
  loop();
})();

// Accès debug / tests.
window.__game = {
  get world() { return world; }, get slimes() { return slimes; }, get score() { return score; }, get chapter() { return chapter; },
  get state() { return state; }, get fragments() { return fragments; }, get flags() { return flags; }, get diff() { return diff; },
  story, storyN, player, env, cam, input, skills, ui, setState, nextWorld, simulate, renderer, scene, camera, onRelic, ensureBoss, TYPES,
};
