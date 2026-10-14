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
import { Artifacts, ARTEFACTS_PER_ISLAND, LEGENDARY } from './entities/artifacts.js';
import { Particles } from './entities/particles.js';
import { Input } from './core/input.js';
import { ThirdPersonCamera } from './core/camera.js';
import { Sfx } from './core/audio.js';
import { lerp, mulberry32 } from './core/noise.js';
import { Loot, LOOT, rollLoot } from './entities/loot.js';
import { Hud } from './ui/hud.js';
import { StoryUI } from './ui/story-ui.js';
import { SkillSystem, SKILLS, UPGRADES } from './game/skills.js';
import { sendResult, uid, passthroughParams, getEmail, setEmail, isEmail } from './game/report.js';
import { getStory, storyMeta, difficulty, relicsFor, estimateMinutes, STORY_COUNT, CHAPTER_COUNT } from './game/stories/index.js';
import { Raid, helperRaid, sidPuissance, embedded } from './game/raid.js';
import { SECRET_LEVEL, SECRET_SEED, WAVES, getSecretStory, secretMeta } from './game/secret.js';
import { Cinematic } from './game/cinematic.js';

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
const storyN = [pathN, queryN].find((v) => Number.isFinite(v) && ((v >= 1 && v <= STORY_COUNT) || v === SECRET_LEVEL)) || null;
const SECRET = storyN === SECRET_LEVEL;
const QUERY_LINKS = location.protocol === 'file:' || import.meta.env.DEV || (!PATH_MODE && Number.isFinite(queryN));
// Les paramètres de l'URL (identifiant du joueur…) suivent d'une page à l'autre.
const keepQ = () => { const q = passthroughParams().toString(); return q ? `&${q}` : ''; };
const keepQ1 = () => { const q = passthroughParams().toString(); return q ? `?${q}` : ''; };
const linkTo = (n) => (QUERY_LINKS ? `?story=${n}${keepQ()}` : (PATH_MODE ? `../${n}/` : `./${n}/`) + keepQ1());
const hubLink = () => (QUERY_LINKS ? location.pathname + keepQ1() : (PATH_MODE ? '../' : './') + keepQ1());
const story = storyN ? (SECRET ? getSecretStory() : getStory(storyN)) : null;
// Niveau 101 : modèles 3D animés des créatures, chargés dès l'ouverture
// (et seulement sur cette page : le chargeur est dans un fichier à part).
const CREDITS_URL = 'https://github.com/Loup0007A/3D-game-world/blob/main/public/models/CREDITS.md';
let models = null;
const modelsReady = SECRET
  ? import('./entities/models.js').then(({ ModelLibrary }) => new ModelLibrary().load()).then((lib) => { models = lib; if (slimes) slimes.models = lib; return lib; }).catch((e) => { console.warn('Modèles 3D indisponibles :', e); })
  : null;
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
const loot = new Loot(scene);
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
  const seed = n === SECRET_LEVEL ? SECRET_SEED : chapterSeed(n, c);

  if (world) disposeWorld();
  await step(0.05, 'Le bruit prend forme…');
  const terrain = new Terrain(seed);
  scene.add(terrain.mesh);
  await step(0.35, 'Les océans se remplissent…');
  const water = new Water(terrain);
  scene.add(water.mesh);
  const spawn = terrain.findSpawn();
  const relics = new Relics(scene, terrain, seed, n === SECRET_LEVEL ? 0 : relicsFor(c - 1), [spawn]);
  const portal = new Portal(scene, terrain, spawn);
  const artifacts = new Artifacts(scene, terrain, seed, ARTEFACTS_PER_ISLAND, [spawn, ...relics.items.map((r) => r.pos)], { noLegend: n === SECRET_LEVEL });
  await step(0.5, 'Les forêts poussent…');
  const exclude = [{ x: spawn.x, z: spawn.z, r: 18 }, ...relics.items.map((r) => ({ x: r.pos.x, z: r.pos.z, r: 6 }))];
  const vegetation = new Vegetation(terrain, seed, exclude);
  scene.add(vegetation.group);
  await step(0.75, 'La vie s\'éveille…');
  const fish = new FishSchool(terrain, seed, shared);
  scene.add(fish.mesh);
  const birds = new Birds(terrain, seed, shared);
  scene.add(birds.mesh);
  diff = difficulty(Math.min(n, STORY_COUNT), c - 1);
  if (n === SECRET_LEVEL) {
    // Niveau caché : pas d'Échos ordinaires, seulement les vagues, et tout est plus dur.
    diff = { ...diff, density: 0, types: [], kingChance: 0, eliteChance: 0, hp: diff.hp * 1.6, dmg: diff.dmg * 1.4, regen: diff.regen * 0.5, bossHp: 1 };
  }
  slimes = new SlimeManager(scene, terrain, diff);
  slimes.models = models;
  slimes.playerDmgMul = artefactDmgMul();
  slimes.godMode = !!divine.god;
  bossDamageHook();
  // Mimiques : déguisées en artefacts, quelques-unes par île à partir du niveau 63.
  if (diff.types.includes('mimic')) {
    const mr = mulberry32(seed ^ 0x313);
    slimes.placeMimics(terrain.scatterLand(2 + Math.floor(n / 30), 90, mr, [spawn, ...relics.items.map((r) => r.pos)]));
  }
  await step(0.95, 'Presque prêt…');

  world = { seed, terrain, water, vegetation, fish, birds, relics, portal, spawn, artifacts };
  builtFor = `${n}:${c}`;
  placeAtArch();
  hud.setWorld(terrain.mapCanvas, relics, c);
  hud.markRelics(relics);
  $('world-label').textContent = `Niveau ${n}`;
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
  w.relics.dispose(); w.portal.dispose(); w.artifacts.dispose();
  slimes?.clear();
  orbs.clear();
  loot.clear();
  skills.clear();
  world = null;
  builtFor = null;
}

// ─── Sauvegarde (une par histoire) ─────────────────────────────────
function save() {
  if (!storyN || helperRaid) return; // un allié venu aider ne touche pas à sa propre sauvegarde
  const taken = world ? world.relics.items.map((r, i) => (r.taken ? i : -1)).filter((i) => i >= 0) : [];
  const artsTaken = world ? world.artifacts.takenIndices() : [];
  store.set(SAVE_KEY, { v: 3, chapter, score, skills: skills.serialize(), fragments, flags, playTime: Math.round(playTime), taken, run, arts: artefacts, artsTaken, divine, hearts, wave: secret.wave });
}
function readSave() {
  const s = store.get(SAVE_KEY, null);
  // Les sauvegardes de l'ancienne version (10 îles par histoire) sont ignorées.
  return s && s.v === 3 && s.chapter <= CHAPTER_COUNT ? s : null;
}
// Niveau = histoire : avec N de Puissance sur le S.I.D., les histoires 1 à N
// sont validées (en vert) et la N+1 est la suivante à jouer. Dans le S.I.D.,
// c'est la Puissance qui fait foi (le S.I.D. l'envoie, et la renvoie après
// chaque histoire validée) ; hors du S.I.D., la progression de l'appareil.
const levelFromSid = new URLSearchParams(location.search).has('sid_puissance');
let sidLevel = Math.max(0, Math.min(STORY_COUNT, Math.floor(sidPuissance)));
const storedDone = () => store.get('mv-done', []);
const doneList = () => {
  if (levelFromSid) return Array.from({ length: sidLevel }, (_, i) => i + 1);
  return storedDone();
};
window.addEventListener('message', (e) => {
  if (e.source !== window.parent || e.data?.type !== 'sid-level') return;
  const lvl = Math.max(0, Math.min(STORY_COUNT, Math.floor(Number(e.data.puissance) || 0)));
  if (!levelFromSid || lvl === sidLevel) return;
  const up = lvl > sidLevel;
  sidLevel = lvl;
  // Les liens (histoire suivante, liste) emportent la nouvelle Puissance.
  try {
    const u = new URL(location.href);
    u.searchParams.set('sid_puissance', String(lvl));
    history.replaceState(history.state, '', u);
  } catch { /* adresse non modifiable */ }
  if (state === 'hub') renderHub();
  else if (state === 'title') renderTitle();
  if (up) hud.toast(`Puissance ${lvl} : histoire ${lvl} validée, l'histoire ${Math.min(lvl + 1, STORY_COUNT)} est ouverte.`, 5000);
});
if (levelFromSid && embedded) { try { window.parent.postMessage({ type: 'mv-hello' }, '*'); } catch { /* parent inaccessible */ } }
// Histoires dans l'ordre : la N s'ouvre quand toutes les précédentes sont finies.
const progress = () => { const d = doneList(); let p = 0; while (d.includes(p + 1)) p++; return p; };
const isUnlocked = (n) => n <= progress() + 1;
function markDone(ending) {
  const d = storedDone();
  if (!d.includes(storyN)) d.push(storyN);
  store.set('mv-done', d);
  store.set(`mv-end${storyN}`, ending);
}

// ─── Résultat envoyé au site principal ─────────────────────────────
// Une histoire terminée = une réussite (+1 Puissance sur le S.I.D.) : le
// niveau Donjons est le numéro de la dernière histoire finie.
// `fin` : true quand la tentative d'histoire s'arrête (fin, abandon…).
let chapterStart = Date.now();
function report(statut, raison, extra = '', fin = true) {
  if (!run) return;
  const deaths = flags.deaths || 0;
  sendResult({
    niveau: storyN, chapitre: chapter, statut,
    score: statut === 'reussi' ? Math.max(30, 100 - deaths * 3) : 0,
    raison,
    details: `chapitre=${chapter};morts=${deaths};temps_jeu_min=${Math.round(playTime / 60)};points=${score}${extra}`,
    session: `${run.session}:c${chapter}`, debut: chapterStart, fin: Date.now(),
  });
  if (fin) run = null;
}

// ─── Artefacts cachés ──────────────────────────────────────────────
// Chaque artefact trouvé renforce le héros jusqu'à la fin de l'histoire :
// +2 de vie max et +2 % d'attaque, dans la limite de 50 artefacts par
// histoire (+100 vie, attaque ×2), pour ne pas rendre le jeu trop facile.
const ARTEFACT = { hp: 2, atk: 0.02, max: 50 };
let artefacts = 0;
// Cœurs anciens (butin rare) : +5 de vie max chacun, jusqu'à la fin du niveau.
let hearts = 0;
// Effets temporaires du butin (fin, en ms).
const buffs = { power: 0, swift: 0 };
// Pouvoirs légendaires actifs jusqu'à la fin de l'île en cours.
let divine = {};
function applyDivine() {
  if (slimes) slimes.godMode = !!divine.god;
  player.divineShield = !!divine.shield;
}
const artefactBonusCount = () => Math.min(artefacts, ARTEFACT.max);
const artefactDmgMul = () => 1 + artefactBonusCount() * ARTEFACT.atk;
function applyArtefacts() {
  player.bonusHealth = artefactBonusCount() * ARTEFACT.hp + hearts * 5;
  skills.apply(player);
  if (slimes) slimes.playerDmgMul = artefactDmgMul();
}
// ─── Butin ─────────────────────────────────────────────────────────
function dropLoot(e) {
  if (Math.random() < 0.3) orbs.drop(e.pos);
  const table = e.kind === 'mimic' ? 'rare' : e.elite ? 'elite' : 'common';
  const k = rollLoot(table);
  if (k) loot.drop(e.pos, k);
  if (e.elite || e.kind === 'mimic') { const k2 = rollLoot(table); if (k2) loot.drop(e.pos, k2); }
}
function onLoot(kind, pos) {
  const L = LOOT[kind];
  particles.burst(pos, L.color, 30, { speed: 4, up: 4, gravity: -6, size: 0.3, life: 0.8 });
  sfx.heal();
  score += L.score;
  const now = performance.now();
  let text = '';
  switch (kind) {
    case 'power': buffs.power = Math.max(buffs.power, now) + 20000; text = '+50 % de dégâts pendant 20 s'; break;
    case 'swift': buffs.swift = Math.max(buffs.swift, now) + 15000; text = '+35 % de vitesse pendant 15 s'; break;
    case 'ward': player.wardCharges = Math.min(player.wardCharges + 2, 6); text = `absorbe les ${player.wardCharges} prochains coups`; break;
    case 'focus': skills.cooldowns = {}; text = 'toutes tes compétences sont prêtes'; break;
    case 'heart': hearts++; applyArtefacts(); player.health = Math.min(player.health + 5, player.maxHealth); text = `+5 de vie max (${player.maxHealth})`; save(); break;
    case 'gem': text = `+${L.score} points`; break;
    default: break;
  }
  hud.toast(`${L.icon} <b>${L.name}</b> : ${text}`, 2600);
  tickBuffs(true);
}
let buffsHtml = '';
function tickBuffs(force = false) {
  const now = performance.now();
  const power = now < buffs.power, swift = now < buffs.swift;
  if (slimes) slimes.playerDmgMul = artefactDmgMul() * (power ? 1.5 : 1);
  player.speedMul = swift ? 1.35 : 1;
  const parts = [];
  if (power) parts.push(`<span>⚔️ ${Math.ceil((buffs.power - now) / 1000)} s</span>`);
  if (swift) parts.push(`<span>🪶 ${Math.ceil((buffs.swift - now) / 1000)} s</span>`);
  if (player.wardCharges > 0) parts.push(`<span>🛡️ ×${player.wardCharges}</span>`);
  if (hearts > 0) parts.push(`<span>❤️ ×${hearts}</span>`);
  const html = parts.join('');
  if (force || html !== buffsHtml) {
    buffsHtml = html;
    const el = $('buffs');
    if (el) { el.innerHTML = html; el.classList.toggle('hidden', !html); }
  }
}

function onArtefact(a) {
  const p = a.pos.clone().add(new THREE.Vector3(0, 0.9, 0));
  if (a.legend) {
    const L = LEGENDARY[a.legend];
    divine = { ...divine, [a.legend]: true };
    applyDivine();
    particles.burst(p, L.color, 160, { speed: 10, up: 12, gravity: -6, size: 0.5, life: 2 });
    sfx.unlock();
    score += 500;
    player.health = player.maxHealth;
    hud.toast(a.legend === 'god'
      ? `✨ Artefact légendaire : <b>${L.name}</b> ! Chaque coup terrasse l'ennemi, jusqu'à la fin de l'île.`
      : `🛡️ Artefact légendaire : <b>${L.name}</b> ! 2 attaques ennemies sur 3 te ratent, jusqu'à la fin de l'île.`, 6000);
    save();
    return;
  }
  particles.burst(p, a.color, 50, { speed: 5, up: 6, gravity: -8, size: 0.32, life: 1.1 });
  sfx.heal();
  score += 25;
  const before = artefactBonusCount();
  artefacts++;
  applyArtefacts();
  const w = world;
  const left = w ? w.artifacts.total - w.artifacts.collected : 0;
  const island = left > 0 ? ` · encore ${left} caché${left > 1 ? 's' : ''} sur l'île` : ' · tous trouvés sur cette île !';
  if (artefactBonusCount() > before) {
    player.health = Math.min(player.health + ARTEFACT.hp * 5, player.maxHealth);
    hud.toast(`Artefact caché ! <b>+${ARTEFACT.hp} vie max</b>, <b>+${Math.round(ARTEFACT.atk * 100)} % attaque</b> (attaque ×${artefactDmgMul().toFixed(2).replace('.', ',')})${island}`, 3600);
  } else {
    player.health = Math.min(player.health + 20, player.maxHealth);
    hud.toast(`Artefact caché : puissance maximale déjà atteinte, +20 vie${island}`, 3200);
  }
  save();
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
  $('t-kicker').textContent = SECRET ? 'Niveau caché · 101' : `Histoire ${storyN} / ${STORY_COUNT}`;
  $('t-title').textContent = story.title;
  $('t-premise').textContent = story.premise;
  const est = estimateMinutes(storyN);
  $('t-meta').innerHTML = SECRET
    ? `<span class="stars">${starStr(5)}</span> · 5 épreuves · seul, sans raid · toutes les compétences · récompense : rang Divin sur le S.I.D.<br><small class="t-credits">Modèles 3D : LasquetiSpice, endlessvoidmc, 3DHaupt, bucketo, FourthGreen (Sketchfab, CC BY / CC BY-NC) · <a href="${CREDITS_URL}" target="_blank" rel="noopener">crédits</a></small>`
    : `<span class="stars">${starStr(story.stars)}</span> · ≈ ${fmtTime(est)} · une île, un gardien · ${story.plan.start.length} compétence${story.plan.start.length > 1 ? 's' : ''} au départ, ${story.plan.unlocks.length} à retrouver`;
  const s = readSave();
  const cont = $('continue-btn');
  const open = isUnlocked(storyN);
  $('t-locked').classList.toggle('hidden', open);
  if (!open) {
    const p = progress() + 1;
    $('t-locked-msg').textContent = SECRET ? 'Cette porte ne s’ouvre qu’une fois les cent mondes sauvés.' : `Termine d'abord l'histoire ${p} : « ${storyMeta(p).title} ».`;
    $('t-locked-link').href = linkTo(p);
    $('t-locked-link').textContent = `Aller à l'histoire ${p} →`;
  }
  $('play-btn').classList.toggle('hidden', !open);
  cont.classList.toggle('hidden', !s || !open);
  $('play-btn').classList.toggle('secondary', !!s);
  $('play-btn').textContent = s ? 'Recommencer' : doneList().includes(storyN) ? 'Rejouer' : 'Commencer';
  if (s) cont.textContent = 'Continuer';
  $('t-all').href = hubLink();
  const end = store.get(`mv-end${storyN}`, null);
  $('best').textContent = end ? `Terminée · fin choisie : « ${end} »` : '';
  $('t-email').textContent = getEmail() || '—';
}

function renderHub() {
  const done = doneList();
  const grid = $('hub-grid');
  let html = '';
  for (let n = 1; n <= STORY_COUNT; n++) {
    const m = storyMeta(n);
    const started = !done.includes(n) && store.get(`mv-s${n}`, null);
    if (!isUnlocked(n)) {
      html += `<div class="hub-card locked" title="Termine d'abord l'histoire ${n - 1}">
      <div class="n"><span>${n}</span><span class="stars">${starStr(m.stars)}</span></div>
      <b>🔒 ${esc(m.title)}</b><span>Termine l'histoire ${n - 1} pour l'ouvrir</span></div>`;
      continue;
    }
    html += `<a class="hub-card${done.includes(n) ? ' done' : started ? ' started' : ''}" href="${linkTo(n)}">
      <div class="n"><span>${n}</span><span class="stars">${starStr(m.stars)}</span></div>
      <b>${esc(m.title)}</b><span>${esc(m.hero)} · ${m.skills} compétences</span></a>`;
  }
  // Niveau caché : n'apparaît qu'une fois les 100 mondes sauvés.
  if (isUnlocked(SECRET_LEVEL)) {
    const m = secretMeta();
    html += `<a class="hub-card secret${done.includes(SECRET_LEVEL) ? ' done' : ''}" href="${linkTo(SECRET_LEVEL)}">
      <div class="n"><span>101</span><span class="stars">${starStr(5)}</span></div>
      <b>✦ ${esc(m.title)} ✦</b><span>Niveau caché · seul · rang Divin</span></a>`;
  }
  grid.innerHTML = html;
}

// ─── Adresse e-mail ────────────────────────────────────────────────
function askEmail() {
  return new Promise((resolve) => {
    const gate = $('email-gate');
    const inputEl = $('email-input');
    inputEl.value = getEmail();
    $('email-error').textContent = '';
    gate.classList.remove('hidden');
    setTimeout(() => inputEl.focus(), 50);
    const form = $('email-form');
    const onSubmit = (e) => {
      e.preventDefault();
      if (!isEmail(inputEl.value)) { $('email-error').textContent = 'Adresse invalide. Exemple : prenom.nom@exemple.fr'; return; }
      setEmail(inputEl.value);
      form.removeEventListener('submit', onSubmit);
      gate.classList.add('hidden');
      $('t-email').textContent = getEmail();
      resolve(getEmail());
    };
    form.addEventListener('submit', onSubmit);
  });
}
const ensureEmail = async () => (isEmail(getEmail()) ? getEmail() : askEmail());

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
  if (s === 'paused') $('pause-seed').textContent = `Niveau ${storyN} · ${story.title} · ${fmtTime(playTime / 60)} de jeu`;
  if (s === 'title') renderTitle();
}

function play() {
  setState('playing');
  input.requestLock();
}

// ─── Lancement d'une partie ────────────────────────────────────────
$('play-btn').addEventListener('click', async () => {
  if (!isUnlocked(storyN)) return renderTitle();
  await ensureEmail();
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
  artefacts = 0;
  hearts = 0;
  secret.wave = 0;
  divine = {};
  buffs.power = buffs.swift = 0;
  player.wardCharges = 0;
  applyStartKit();
  applyArtefacts();
  applyDivine();
  ui.buildBar(skills);
  ui.clearDialogue();
  env.time = 0.3;
  storyBg = 'flyover';
  state = 'story';
  $('title').classList.add('hidden');
  await ui.sequence(story.intro, { kicker: `${story.kicker} · ${story.title}` });
  save();
  startChapter();
  notify('start');
});

$('continue-btn').addEventListener('click', async () => {
  if (!isUnlocked(storyN)) return renderTitle();
  await ensureEmail();
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
  artefacts = s.arts || 0;
  hearts = s.hearts || 0;
  secret.wave = SECRET ? Math.min(s.wave || 0, WAVES.length - 1) : 0;
  divine = s.divine || {};
  skills.load(s.skills, player);
  applyArtefacts();
  applyDivine();
  for (const i of s.artsTaken || []) world.artifacts.markTaken(i);
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
  chapterStart = Date.now();
  player.regen = diff.regen;
  player.diffDmg = diff.dmg;
  play();
  const ch = story.chapters[chapter - 1];
  ui.chapterCard(storyN, ch.title);
  if (!resumed) setTimeout(() => ch.arrival.forEach((l) => ui.say(l)), 2600);
  const left = world.relics.total - world.relics.collected;
  if (left > 0) hud.toast(`Trouve les <b>${left} reliques</b> de l'île`, 4200);
  ensureBoss();
  notify('chapter', { chapter });
  if (SECRET) secretBegin(resumed);
}

$('resume-btn').addEventListener('click', play);
$('email-change').addEventListener('click', () => askEmail());
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

// ─── Niveau Donjons (Puissance sur le S.I.D.) ──────────────────────
// 10+ : le gardien récupère tous ses PV quand on meurt ou qu'on s'éloigne trop.
// 50+ : chaque mort a une chance sur 2 de coûter un membre (simulation fermée).
const DONJON = { healLevel: 10, leash: 70, injuryLevel: 50, injuryChance: 0.5 };
const donjonLevel = sidPuissance;
let injured = false;
function rollInjury() {
  if (!embedded || donjonLevel < DONJON.injuryLevel || Math.random() >= DONJON.injuryChance) return false;
  injured = true;
  clearInterval(respawnTimer);
  try { window.parent.postMessage({ type: 'mv-injury', story: storyN, chapter }, '*'); } catch { /* parent inaccessible */ }
  setTimeout(() => {
    setState('dead');
    $('dead').classList.add('hidden');
    $('injury').classList.remove('hidden');
  }, 900);
  return true;
}
window.addEventListener('message', (e) => {
  if (e.source !== window.parent || e.data?.type !== 'sid-injury') return;
  const until = new Date(e.data.until);
  if (!Number.isNaN(until.getTime())) $('injury-until').textContent = `Retour possible à ${until.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`;
});

// Délai avant de pouvoir se relever après une mort.
const RESPAWN_DELAY = 60; // secondes
let respawnAt = 0;
let respawnTimer = null;
function startRespawnCooldown() {
  respawnAt = Date.now() + RESPAWN_DELAY * 1000;
  const btn = $('respawn-btn');
  const tick = () => {
    const left = Math.ceil((respawnAt - Date.now()) / 1000);
    if (left > 0) {
      btn.disabled = true;
      btn.textContent = `Se relever (${left} s)`;
    } else {
      btn.disabled = false;
      btn.textContent = 'Se relever';
      clearInterval(respawnTimer);
      respawnTimer = null;
    }
  };
  clearInterval(respawnTimer);
  tick();
  respawnTimer = setInterval(tick, 250);
}
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
  if (Date.now() < respawnAt || injured) return;
  // En raid, le boss garde ses blessures ; seul, il ne les garde que sous le niveau 10.
  const keepBoss = raid.active || donjonLevel < DONJON.healLevel;
  const kept = keepBoss && slimes.boss ? { hp: slimes.boss.hp, maxHp: slimes.boss.maxHp } : null;
  if (!keepBoss && slimes.boss && slimes.boss.hp < slimes.boss.maxHp) setTimeout(() => hud.toast('Le gardien a récupéré toutes ses forces.', 3500), 600);
  placeAtArch();
  slimes.clear();
  play();
  const b = ensureBoss();
  if (b && kept) { b.maxHp = kept.maxHp; b.hp = kept.hp; }
  if (SECRET) secretRestartWave();
  if (!flags.firstDeath) { flags.firstDeath = true; ui.say(story.hints.firstDeath); }
}

// ─── Gardien du portail ────────────────────────────────────────────
// Dragon : à partir de 90 de Puissance sur le S.I.D. (ou raid contre un dragon).
// Dragon : Puissance 90+ sur le S.I.D., ou gardien d'Âge draconique (Ignivore, l'Oublieur).
const isDragon = () => !!story.lieutenant?.dragon || (raid.active || helperRaid ? raid.dragon || !!helperRaid?.dragon : sidPuissance >= 90);
function ensureBoss() {
  if (SECRET) return; // niveau 101 : les vagues s'en chargent
  const w = world;
  if (!w || w.portal.active || w.relics.collected < w.relics.total || slimes.boss) return;
  const a = w.portal.group.rotation.y;
  const p = w.spawn.clone().add(new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)).multiplyScalar(10));
  p.y = w.terrain.heightAt(p.x, p.z);
  const dragon = isDragon();
  const b = slimes.spawn(dragon ? 'dragon' : 'boss', p);
  b.guard = w.spawn.clone();
  const lt = story.lieutenant;
  b.name = lt ? lt.name : dragon ? `Dragon · ${story.chapters[chapter - 1].boss}` : story.chapters[chapter - 1].boss;
  if (chapter === CHAPTER_COUNT) { b.T.scale *= 1.25; b.object.scale.setScalar(b.T.scale); }
  if (lt) {
    // Écho de l'Oublieur (fin d'Âge) : plus grand, plus résistant, teinte d'ombre.
    b.T = { ...b.T, scale: b.T.scale * 1.15 };
    b.object.scale.setScalar(b.T.scale);
    b.hp = b.maxHp = Math.round(b.maxHp * 1.5);
    b.mat.color.lerp(new THREE.Color(0x3a1060), 0.45);
    b.mat.emissive.set(0x5a1890);
  }
  if (raid.active) scaleRaidBoss(b);
  return b;
}

// ─── Niveau caché 101 : vagues et cinématiques ─────────────────────
const cine = new Cinematic();
const secret = { wave: 0, mobs: [], active: false, next: 0, center: null };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

function arenaCenter() {
  const w = world;
  const a = w.portal.group.rotation.y;
  const c = w.spawn.clone().add(V3(-Math.sin(a), 0, -Math.cos(a)).multiplyScalar(30));
  c.y = Math.max(w.terrain.heightAt(c.x, c.z), SEA_LEVEL);
  return c;
}

function spawnWave(i) {
  const wave = WAVES[i];
  const c = secret.center;
  const mobs = [];
  let k = 0;
  const total = wave.spawn.reduce((a, [, n]) => a + n, 0);
  for (const [type, n, opts] of wave.spawn) {
    for (let j = 0; j < n; j++, k++) {
      const ang = (k / total) * Math.PI * 2 + i;
      const r = wave.boss ? 18 : 16 + (k % 2) * 8;
      const p = V3(c.x + Math.cos(ang) * r, 0, c.z + Math.sin(ang) * r);
      p.y = Math.max(world.terrain.heightAt(p.x, p.z), SEA_LEVEL);
      const m = slimes.spawn(type, p, opts || {});
      m.guard = c.clone();
      if (!m.T.boss) m.name = wave.name;
      else m.name = 'Le Primordial';
      mobs.push(m);
    }
  }
  secret.mobs = mobs;
  secret.active = true;
}

// Plans de caméra autour d'une cible.
// Point de caméra jamais sous le relief.
function aboveGround(p, margin = 2.5) {
  p.y = Math.max(p.y, Math.max(world.terrain.heightAt(p.x, p.z), SEA_LEVEL) + margin);
  return p;
}

function orbitShots(target, { title, text, r = 26, h = 12, dur = 5, look = 3 } = {}) {
  const a0 = Math.random() * Math.PI * 2;
  const p = (a, rr, hh) => aboveGround(V3(target.x + Math.cos(a) * rr, target.y + hh, target.z + Math.sin(a) * rr), 4);
  return { from: p(a0, r * 1.5, h * 1.8), to: p(a0 + 0.9, r, h), look: target.clone().add(V3(0, look, 0)), dur, title, text };
}

async function playCinematic(shots) {
  setState('cinematic');
  player.invuln = 99;
  await cine.play(shots);
  player.invuln = 1;
  if (player.alive) play();
}

// Le Trône : une estrade de pierre, des colonnes et des runes d'or.
function buildThrone(c) {
  if (secret.throne) return;
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x4a4550, roughness: 0.85, flatShading: true });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xb08000, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.8 });
  for (let k = 0; k < 3; k++) {
    const step = new THREE.Mesh(new THREE.CylinderGeometry(7 - k * 1.8, 7.4 - k * 1.8, 0.7, 12), stone);
    step.position.y = 0.35 + k * 0.7;
    step.receiveShadow = step.castShadow = true;
    g.add(step);
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 2), stone);
  seat.position.y = 2.6;
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4.5, 0.6), stone);
  back.position.set(0, 4.6, -0.9);
  const crown = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 24), gold);
  crown.position.set(0, 7.2, -0.9);
  g.add(seat, back, crown);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 9, 8), stone);
    col.position.set(Math.cos(a) * 12, 4.5, Math.sin(a) * 12);
    col.castShadow = true;
    const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), gold);
    rune.position.set(Math.cos(a) * 12, 9.6, Math.sin(a) * 12);
    g.add(col, rune);
  }
  g.position.copy(c);
  scene.add(g);
  secret.throne = g;
}

async function secretBegin(resumed) {
  secret.center = arenaCenter();
  const c = secret.center;
  buildThrone(c);
  env.time = 0.78; // crépuscule doré
  if (!resumed && secret.wave === 0) {
    await playCinematic([
      { from: V3(c.x + 160, c.y + 90, c.z + 160), to: V3(c.x + 70, c.y + 40, c.z + 50), look: c.clone(), lookTo: c.clone().add(V3(0, 6, 0)), dur: 6, title: "Le Trône de l'Archive", text: 'Au-dessus des cent mondes, une île que personne n’avait jamais vue.' },
      { from: V3(c.x - 50, c.y + 8, c.z + 40), to: V3(c.x - 20, c.y + 4, c.z + 10), look: c.clone().add(V3(0, 4, 0)), dur: 5, text: 'Ici, pas de reliques. Seulement cinq épreuves, et le Trône au bout.' },
      { from: player.pos.clone().add(V3(6, 3, 6)), to: player.pos.clone().add(V3(2, 2.2, 3)), look: player.pos.clone().add(V3(0, 1.6, 0)), dur: 4, text: 'Personne ne viendra t’aider. C’est l’épreuve d’un seul.' },
    ]);
  }
  await startWave(secret.wave, true);
}

async function startWave(i, withCinematic) {
  secret.wave = i;
  if (modelsReady && !models) {
    hud.toast("Les créatures de l'Archive s'éveillent…", 3000);
    await Promise.race([modelsReady, wait(20000)]);
  }
  slimes.clear();
  spawnWave(i);
  save();
  const wave = WAVES[i];
  const first = secret.mobs[0];
  if (withCinematic) {
    const shots = [orbitShots(secret.center, { title: wave.title, text: wave.text, r: 34, h: 18, dur: 5, look: 4 })];
    if (first) {
      // Gros plan : la caméra se place du côté de l'arène (dégagé), face à la créature.
      const sc = first.T.scale;
      const c = secret.center;
      const dir = V3(c.x - first.pos.x, 0, c.z - first.pos.z).normalize();
      const side = V3(-dir.z, 0, dir.x);
      const at = (d, sd, h) => aboveGround(first.pos.clone().addScaledVector(dir, d * sc).addScaledVector(side, sd * sc).add(V3(0, h * sc, 0)));
      const look = first.pos.clone().add(V3(0, 1.3 * sc, 0));
      shots.push({ from: at(6.5, 3.5, 2.4), to: at(4, -1.5, 1.3), look, dur: 3.5, text: wave.name, shake: wave.boss ? 0.15 : 0 });
    }
    await playCinematic(shots);
  }
  hud.toast(`<b>${wave.title}</b> · ${wave.name}`, 3500);
}

function secretRestartWave() {
  if (!secret.center) return;
  spawnWave(secret.wave);
  hud.toast(`L'épreuve recommence : <b>${WAVES[secret.wave].name}</b>`, 3500);
}

// Appelé à chaque image : vague terminée ? (la dernière se termine avec onBossDown)
function secretTick() {
  if (!secret.active || WAVES[secret.wave].boss || state !== 'playing') return;
  if (secret.mobs.some((m) => m.dying < 0)) return;
  secret.active = false;
  secret.wave++;
  const c = player.pos.clone();
  orbs.drop(c.clone().add(V3(1.5, 0, 0)));
  orbs.drop(c.clone().add(V3(-1.5, 0, 0)));
  for (const k of ['power', 'ward', rollLoot('elite')]) if (k) loot.drop(c, k);
  hud.toast('Épreuve réussie. Reprends ton souffle…', 4000);
  save();
  const next = secret.wave;
  setTimeout(() => { if (player.alive && secret.wave === next && !secret.active) startWave(next, true); }, 5000);
}

async function secretVictory() {
  secret.active = false;
  const p = player.pos.clone();
  await playCinematic([
    { from: p.clone().add(V3(30, 25, 30)), to: p.clone().add(V3(12, 6, 10)), look: p.clone().add(V3(0, 2, 0)), dur: 6, title: 'Le Primordial est vaincu', text: "Le premier rêve de l'Archive s'agenouille devant toi." },
    { from: world.portal.pos.clone().add(V3(10, 5, 10)), to: world.portal.pos.clone().add(V3(4, 3, 6)), look: world.portal.pos.clone().add(V3(0, 3, 0)), dur: 4, text: 'Le Trône est libre. Va au portail.' },
  ]);
}

// ─── Raid de boss à plusieurs ──────────────────────────────────────
const raid = new Raid(scene);
let raidBase = null; // PV max du boss pour un joueur seul
// PV du boss : +60 % par allié présent.
function scaleRaidBoss(b) {
  if (!b || !raid.isHost) return;
  if (!raidBase) raidBase = b.maxHp;
  const max = Math.round(raidBase * (1 + 0.6 * raid.helpers));
  if (max > b.maxHp) { b.hp += max - b.maxHp; b.maxHp = max; }
}
// Dégâts que l'on vient d'infliger au boss (pas encore pris en compte dans
// l'état envoyé par l'hôte).
const recentHits = [];
let raidWon = false;
function bossDamageHook() {
  slimes.onBossDamage = (dmg) => {
    if (!raid.active) return;
    recentHits.push({ t: performance.now(), dmg });
    raid.send('hit', { dmg: +dmg.toFixed(2) });
  };
}
raid.on('joined', (d) => {
  if (raid.isHost) {
    hud.toast('⚔️ <b>Raid ouvert.</b> Les membres du S.I.D. sont prévenus : relève-toi, les renforts arrivent.', 6000);
    $('raid-note').textContent = 'Appel envoyé ! Relève-toi : les alliés qui rejoignent le raid apparaîtront près du gardien.';
    $('raid-note').classList.remove('hidden');
    $('raid-btn').classList.add('hidden');
    if (raid.dragon && slimes.boss && !slimes.boss.T.dragon) { /* le dragon dépend de la Puissance de l'hôte */ }
  } else {
    $('raid-join-title').textContent = `Raid de ${d.hostName || 'un membre'}`;
    $('raid-join-text').textContent = `${raid.dragon ? 'Un dragon' : 'Un gardien'} garde le niveau ${storyN} « ${story.title} ». Abattez-le ensemble !`;
  }
  bossDamageHook();
});
raid.on('error', (msg) => {
  hud.toast(`Raid impossible : ${esc(msg)}`, 5000);
  $('raid-note').textContent = msg;
  $('raid-note').classList.remove('hidden');
  $('raid-btn').disabled = false;
});
raid.on('peers', (n, peer) => {
  if (peer) hud.toast(`🛡️ <b>${esc(peer.name || 'Un allié')}</b> rejoint le combat !`, 3500);
  scaleRaidBoss(slimes?.boss);
});
raid.on('hit', (dmg) => slimes?.remoteBossDamage(dmg));
raid.on('boss', (b) => {
  let boss = slimes?.boss;
  if (!boss && helperRaid && !raidWon && world && state !== 'title' && state !== 'raid') boss = ensureBoss();
  if (!boss || raidWon) return;
  boss.maxHp = b.maxHp;
  // L'hôte fait foi, moins nos coups qu'il n'a pas encore reçus.
  const now = performance.now();
  while (recentHits.length && now - recentHits[0].t > 500) recentHits.shift();
  boss.hp = b.hp - recentHits.reduce((a, h) => a + h.dmg, 0);
  boss.net = { pos: new THREE.Vector3(b.x, b.y, b.z), ry: b.ry, at: performance.now() };
  if (boss.hp <= 0 && boss.dying < 0) slimes.kill(boss, true);
});
raid.on('won', () => {
  const boss = slimes?.boss;
  if (boss && boss.dying < 0) slimes.kill(boss, true);
});
$('raid-btn').addEventListener('click', () => {
  $('raid-btn').disabled = true;
  $('raid-note').textContent = 'Appel en cours…';
  $('raid-note').classList.remove('hidden');
  raid.request({ story: storyN, chapter, boss: slimes.boss?.name || 'Gardien' });
});
// Le bouton n'apparaît que si l'on est mort face au boss, dans le S.I.D.
function updateRaidButton() {
  const canAsk = embedded && !SECRET && !helperRaid && !raid.active && slimes?.boss && slimes.boss.dying < 0 && slimes.boss.pos.distanceTo(player.pos) < 90;
  $('raid-btn').classList.toggle('hidden', !canAsk);
  $('raid-btn').disabled = false;
  if (!raid.active) $('raid-note').classList.add('hidden');
}

// Allié venu aider : île du boss, compétences de l'histoire jusqu'à ce chapitre.
async function startHelperRaid() {
  chapter = Math.min(helperRaid.chapter, CHAPTER_COUNT);
  if (builtFor !== `${storyN}:${chapter}`) await buildWorld(storyN, chapter);
  artefacts = 0; divine = {};
  applyStartKit();
  for (const id of story.plan.unlocks.slice(0, chapter)) if (id && !skills.has(id)) skills.unlock(id, player);
  applyArtefacts(); applyDivine();
  world.relics.items.forEach((_, i) => world.relics.markTaken(i));
  hud.markRelics(world.relics);
  ui.buildBar(skills);
  placeAtArch();
  player.health = player.maxHealth;
  ensureBoss();
  bossDamageHook();
  play();
}
$('raid-join-btn').addEventListener('click', async () => {
  $('raid-join').classList.add('hidden');
  sfx.init();
  await startHelperRaid();
});

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
    // Une histoire déjà validée ne rapporte pas de nouveau point.
    const alreadyDone = doneList().includes(storyN);
    markDone(end.label);
    if (alreadyDone) {
      run = null;
      setTimeout(() => hud.toast('Histoire déjà validée : pas de nouveau point de Puissance.', 4500), 1500);
    } else report('reussi', 'histoire_terminee', `;fin=${choice === 'a' ? 'A' : 'B'}`);
    store.del(SAVE_KEY);
    notify('complete', { ending: end.label, score, minutes: Math.round(playTime / 60) });
    $('c-title').textContent = story.title;
    $('c-stats').textContent = `Fin choisie : « ${end.label} » · ${score} points · ${fmtTime(playTime / 60)} de jeu`;
    const next = $('c-next');
    if (storyN < STORY_COUNT) { next.href = linkTo(storyN + 1); next.textContent = `Histoire ${storyN + 1} : ${storyMeta(storyN + 1).title} →`; next.style.display = ''; }
    else if (storyN === STORY_COUNT) { next.href = linkTo(SECRET_LEVEL); next.textContent = 'Une porte que personne n’avait vue s’est ouverte… →'; next.style.display = ''; }
    else next.style.display = 'none';
    $('c-all').href = hubLink();
    setState('complete');
    return;
  }

  chapter++;
  if (divine.god || divine.shield) { divine = {}; applyDivine(); }
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
      case 'ward':
        particles.burst(player.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), 0x5aa0ff, 18, { speed: 4, up: 2, gravity: 0, size: 0.3, life: 0.5 });
        hud.toast(e.left ? `🛡️ Coup absorbé (encore ${e.left})` : '🛡️ Coup absorbé — la fiole est vide', 1800);
        break;
      case 'dodge':
        particles.burst(player.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), 0x9fe8ff, 16, { speed: 4, up: 2, gravity: 0, size: 0.28, life: 0.5 });
        break;
      case 'death':
        flags.deaths = (flags.deaths || 0) + 1;
        if (rollInjury()) { sfx.death(); save(); break; }
        startRespawnCooldown();
        sfx.death();
        setTimeout(() => { if (!player.alive) { setState('dead'); updateRaidButton(); } }, 900);
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
        else dropLoot(e);
        if (e.elite) hud.toast('⭐ <b>Écho d\'élite</b> abattu !', 2200);
        break;
      case 'mimic':
        sfx.hurt();
        particles.burst(e.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xffb347, 40, { speed: 6, up: 6, gravity: -10, size: 0.35, life: 0.8 });
        hud.toast("😱 Ce n'était pas un artefact… c'est une <b>Mimique</b> !", 3000);
        break;
      case 'fuse': sfx.hit(); break;
      case 'charge': sfx.swing(); break;
      case 'slimeHurt':
        sfx.hit();
        particles.burst(e.slime.pos.clone().add(new THREE.Vector3(0, 0.6 * e.slime.T.scale, 0)), e.slime.T.color, 12, { speed: 4, size: 0.25 });
        break;
      case 'slimeMelt':
        particles.burst(e.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), e.color, 12, { speed: 1.5, up: 1, gravity: -2, size: 0.3 });
        break;
      case 'slam':
        sfx.nova();
        particles.burst(e.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), e.boom ? 0xff7a2a : 0xb8a080, e.big ? 60 : e.boom ? 50 : 30, { speed: e.radius * 2, up: e.boom ? 5 : 2, gravity: -6, size: 0.45, life: 0.7 });
        if (player.pos.distanceTo(e.pos) < 25) cam.shake = Math.min(cam.shake + (e.big ? 0.8 : 0.4), 1);
        break;
      case 'spit': sfx.squish(); break;
      case 'splat': particles.burst(e.pos, e.color ?? 0xff8a3c, 10, { speed: 2.5, up: 2, gravity: -8, size: 0.3, life: 0.5 }); break;
      case 'blink': particles.burst(e.from.clone().add(new THREE.Vector3(0, 0.5, 0)), 0x6a4aa8, 18, { speed: 2, up: 1.5, gravity: 0, size: 0.35, life: 0.6 }); break;
      case 'summon': particles.burst(e.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xff4a6a, 40, { speed: 6, up: 4, gravity: -4, size: 0.4, life: 0.9 }); break;
    }
  }
  slimes.events.length = 0;
}

function onBossDown() {
  if (SECRET) setTimeout(() => secretVictory(), 1500);
  if (raid.active || helperRaid) raidWon = true;
  if (raid.active) {
    raid.send('won');
    raid.won();
    hud.toast('⚔️ <b>Raid gagné !</b> Le gardien est tombé sous vos coups.', 6000);
  }
  if (helperRaid) {
    // L'allié a fini son travail : retour à la liste des histoires.
    sfx.portalOpen();
    setTimeout(() => { raid.leave(); location.href = hubLink(); }, 6000);
    return;
  }
  setTimeout(() => raid.leave(), 3000);
  const w = world;
  w.portal.activate();
  sfx.portalOpen();
  hud.toast('<b>Le gardien est vaincu.</b> Le portail est ouvert.', 5000);
  ui.say(chapter === CHAPTER_COUNT ? `C'est fini, ${story.hero}. Va au portail.` : 'Le portail est libre. Allons-y quand tu veux.');
  orbs.drop(player.pos.clone().add(new THREE.Vector3(1.5, 0, 0)));
  // Trésor du gardien.
  const bp = slimes.lastBossPos || player.pos;
  for (const k of ['gem', 'heart', rollLoot('elite'), rollLoot('elite')]) if (k) loot.drop(bp, k);
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

  if (cine.active) {
    cine.update(dt, camera);
    env.update(dt, cine.focus, elapsed);
    w.portal.update(0, elapsed, player);
  } else if (flyover) {
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
      w.artifacts.update(dt, elapsed, player, onArtefact);
      loot.update(dt, elapsed, player, onLoot, skills.has('magnet') ? 22 : 0);
      tickBuffs();
      if (SECRET) secretTick();
      raid.update(dt, player, slimes.boss);
      // Niveau 10+ : s'éloigner du gardien lui rend ses forces.
      const gb = slimes.boss;
      if (gb && gb.dying < 0 && !raid.active && !helperRaid && donjonLevel >= DONJON.healLevel && gb.hp < gb.maxHp && gb.pos.distanceTo(player.pos) > DONJON.leash) {
        gb.hp = gb.maxHp;
        hud.toast('Tu t\'es trop éloigné : le gardien a récupéré toutes ses forces.', 3500);
      }
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
    const waveBar = SECRET && secret.active && !boss && secret.mobs.length > 0;
    if (waveBar) {
      const alive = secret.mobs.filter((m) => m.dying < 0);
      const tot = secret.mobs.reduce((a, m) => a + m.maxHp, 0);
      const cur = alive.reduce((a, m) => a + Math.max(m.hp, 0), 0);
      bossbar.classList.remove('hidden');
      bossbar.querySelector('.bb-name').textContent = `${WAVES[secret.wave].title} · ${WAVES[secret.wave].name} (${alive.length})`;
      bossbar.querySelector('.bb-fill').style.width = `${(cur / tot) * 100}%`;
    }
    const showBar = !waveBar && boss && boss.pos.distanceTo(player.pos) < 90;
    if (!waveBar) bossbar.classList.toggle('hidden', !showBar);
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
  if (helperRaid) {
    await buildWorld(storyN, Math.min(helperRaid.chapter, CHAPTER_COUNT));
    camera.position.set(world.spawn.x + 120, 60, world.spawn.z);
    setState('raid');
    $('raid-join').classList.remove('hidden');
    loop();
    raid.ready(helperRaid.id);
    return;
  }
  const s = readSave();
  await buildWorld(storyN, s ? s.chapter : 1);
  camera.position.set(world.spawn.x + 120, 60, world.spawn.z);
  setState('title');
  loop();
  // Demande l'adresse dès l'arrivée sur une histoire.
  if (!isEmail(getEmail())) askEmail();
})();

// Accès debug / tests.
window.__game = {
  get world() { return world; }, get slimes() { return slimes; }, get score() { return score; }, get chapter() { return chapter; }, set chapter(v) { chapter = v; },
  get state() { return state; }, get artefacts() { return artefacts; }, get divine() { return divine; }, get fragments() { return fragments; }, get flags() { return flags; }, get diff() { return diff; },
  story, storyN, player, env, cam, input, skills, ui, setState, nextWorld, simulate, renderer, scene, camera, onRelic, ensureBoss, TYPES, raid, startHelperRaid, loot, buffs, secret, cine,
};
