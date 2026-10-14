import { SEEDS } from './seeds.js';
import { CHAPTER_TITLES, ARRIVALS, PORTALS, BOSS_NAMES, FRAGMENTS, SKILL_LINES, HINTS } from './templates.js';
import { SKILL_ORDER } from '../skills.js';
import { ENEMY_UNLOCK } from '../../entities/slimes.js';
import { mulberry32 } from '../../core/noise.js';
import { INTRO as ILO_INTRO, CHAPTERS as ILO_CHAPTERS } from '../story.js';

export const STORY_COUNT = SEEDS.length;
// Une histoire = un niveau = UNE île : reliques, gardien, portail, épilogue.
// (Le S.I.D. compte +1 Puissance par niveau terminé.)
export const CHAPTER_COUNT = 1;
// Reliques par chapitre (c = 0..9) : 5,5,6,6,7,7,8,8,9,9 → 70 par histoire.
export const relicsFor = (c) => 5 + Math.floor(c / 2);

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Plan des compétences : de plus en plus nombreuses au fil des histoires.
export function skillPlan(n) {
  // Une compétence de plus tous les 6 niveaux (1 → 16), dont une à
  // retrouver sur l'île ; les autres sont acquises d'avance.
  const total = Math.min(SKILL_ORDER.length, 1 + Math.floor((n - 1) / 6));
  const inStory = Math.min(total, CHAPTER_COUNT);
  const startCount = total - inStory;
  const start = SKILL_ORDER.slice(0, startCount);
  const unlocks = SKILL_ORDER.slice(startCount, total); // une par chapitre, dès la 1re relique
  const startUpgrades = Math.floor((n - 1) / 6);
  return { total, inStory, start, unlocks, startUpgrades };
}

// Difficulté : monte avec l'histoire (n) et avec le chapitre (c = 0..9).
export function difficulty(n, c) {
  const d = (n - 1) / (STORY_COUNT - 1);
  const local = CHAPTER_COUNT > 1 ? c / (CHAPTER_COUNT - 1) : 0;
  return {
    hp: 1 + 2.2 * d + 0.4 * local * (1 + d),
    dmg: 1 + 1.4 * d + 0.25 * local,
    speed: 1 + 0.32 * d + 0.06 * local,
    density: 1 + 1.2 * d + 0.35 * local,
    kingChance: 0.03 + 0.07 * d + 0.03 * local,
    aggro: 26 + 10 * d,
    bossHp: 1 + 0.35 * c,
    types: Object.keys(ENEMY_UNLOCK).filter((t) => n >= ENEMY_UNLOCK[t] || (n >= ENEMY_UNLOCK[t] - 3 && c >= 6)),
    regen: 2.5 * (1 - 0.6 * d),
    guards: 1 + Math.min(c >> 1, 3) + Math.floor(d * 3),
  };
}

export function stars(n) { return 1 + Math.min(4, Math.floor(((n - 1) / (STORY_COUNT - 1)) * 5)); }

// Résumé léger (pour la liste des histoires).
export function storyMeta(n) {
  const s = SEEDS[n - 1];
  if (!s) return null;
  return { n, title: s[0], hero: s[1], premise: s[10], stars: stars(n), skills: skillPlan(n).total };
}

// Histoire complète, générée de façon déterministe à partir de sa graine.
export function getStory(n) {
  const s = SEEDS[n - 1];
  if (!s) return null;
  const [title, hero, g, guide, guideKind, relics, foe, foeDe, enemies, world, premise, twist, aL, aE, bL, bE] = s;
  const rand = mulberry32(n * 7919 + 17);
  const fill = (str) => str
    .replaceAll('{H}', hero).replaceAll('{G}', guide)
    .replaceAll('{Fc}', cap(foe)).replaceAll('{FD}', foeDe).replaceAll('{F}', foe)
    .replaceAll('{E}', enemies).replaceAll('{R}', relics)
    .replaceAll('{Wc}', cap(world)).replaceAll('{W}', world)
    .replaceAll('{e}', g === 'f' ? 'e' : '');

  const pools = FRAGMENTS.map((p) => shuffle(p, rand));
  const bosses = shuffle(BOSS_NAMES, rand);
  const chapters = [];
  for (let c = 0; c < CHAPTER_COUNT; c++) {
    const phase = Math.min(Math.floor(c / 2), 4);
    const count = relicsFor(c);
    const frags = [];
    for (let i = 0; i < count; i++) {
      if (c === 6 && i === 0) { frags.push({ title: 'La vérité', text: twist }); continue; }
      if (c === CHAPTER_COUNT - 1 && i === count - 1) { frags.push({ title: 'Le dernier éclat', text: `Toutes les ${relics} sont réunies. ${cap(foe)} attend au-delà du portail. Il va falloir choisir.` }); continue; }
      const t = pools[phase].shift() || FRAGMENTS[phase][Math.floor(rand() * FRAGMENTS[phase].length)];
      frags.push({ title: fill(t[0]), text: fill(t[1]) });
    }
    const arr = shuffle(ARRIVALS[c], rand).slice(0, 2).map(fill);
    if (c === 0) arr.splice(0, 2, fill(ARRIVALS[0][0]), fill(ARRIVALS[0][1]));
    chapters.push({
      title: fill(CHAPTER_TITLES[c][Math.floor(rand() * CHAPTER_TITLES[c].length)]),
      arrival: arr,
      fragments: frags,
      portal: fill(PORTALS[Math.floor(rand() * PORTALS.length)]),
      boss: c === CHAPTER_COUNT - 1 ? `Cœur ${foeDe}` : bosses[c % bosses.length],
    });
  }

  const intro = [
    ...premise.split(/(?<=[.!?])\s+/),
    `Tu t'appelles ${hero}. Tu ouvres les yeux devant une arche de pierre, sans aucun souvenir de la route.`,
    `Près de toi, ${guideKind}. « Je m'appelle ${guide}. Il faut retrouver les ${relics}, avant que ${foe} ne prenne tout. »`,
  ];

  const story = {
    n, title, hero, heroF: g === 'f', guide, guideKind, relics, foe, foeDe, enemies, world, premise, twist,
    intro, chapters,
    finale: {
      lines: [
        `Le dernier gardien tombe. Le portail s'ouvre sur le cœur ${foeDe}.`,
        twist,
        `Toutes les ${relics} brillent autour de toi. ${guide} se tait, pour une fois.`,
        'C’est à toi de choisir.',
      ],
      a: { label: aL, lines: [...aE.split(/(?<=[.!?])\s+/), 'Fin.'] },
      b: { label: bL, lines: [...bE.split(/(?<=[.!?])\s+/), 'Fin.'] },
    },
    hints: Object.fromEntries(Object.entries(HINTS).map(([k, v]) => [k, typeof v === 'string' ? fill(v) : Object.fromEntries(Object.entries(v).map(([a, b]) => [a, fill(b)]))])),
    skillLines: SKILL_LINES,
    plan: skillPlan(n),
    stars: stars(n),
  };

  // Histoire 1 : les textes écrits à la main du premier jeu.
  if (n === 1) {
    story.intro = ILO_INTRO;
    for (let c = 0; c < Math.min(ILO_CHAPTERS.length, story.chapters.length); c++) {
      const src = ILO_CHAPTERS[c];
      const ch = story.chapters[c];
      if (c < 4) { ch.title = src.title; ch.arrival = src.arrival; }
      ch.fragments = ch.fragments.map((f, i) => src.fragments[i] || f);
    }
  }
  return story;
}

// Estimation de durée (minutes) : marche entre reliques, combats, gardien.
export function estimateMinutes(n) {
  let m = 0;
  for (let c = 0; c < CHAPTER_COUNT; c++) m += relicsFor(c) * 1.8 + 3 + 2 * (1 + (n - 1) / 99);
  return Math.round(m);
}
