// ─── Niveau caché 101 : « Le Trône de l'Archive » ────────────────────
// N'apparaît qu'une fois les 100 mondes sauvés. Se joue seul (pas de raid).
// Cinq vagues de créatures, chacune annoncée par une cinématique, puis le
// Primordial, premier rêve de l'Archive. Le vaincre fait passer au rang
// Divin sur le S.I.D.

import { skillPlan, STORY_COUNT } from './stories/index.js';
import { HINTS, SKILL_LINES } from './stories/templates.js';

export const SECRET_LEVEL = 101;
export const SECRET_SEED = 1010101;

// Vagues : [type, nombre, options d'apparition]
export const WAVES = [
  {
    name: 'Les Chimères',
    title: 'Première épreuve',
    text: "Trois chimères gardent les marches du Trône. Un cou de serpent, un corps de bête, et une queue terminée par un crâne qui frappe comme un dard.",
    spawn: [['chimera', 3]],
  },
  {
    name: "Les Wyvernes d'Orage",
    title: 'Deuxième épreuve',
    text: "Le ciel se charge. Les wyvernes d'orage descendent en spirale, la foudre au bord des crocs.",
    spawn: [['wyvern', 3], ['chimera', 1]],
  },
  {
    name: 'Le Béhémoth de Cristal',
    title: 'Troisième épreuve',
    text: "La montagne se lève. Le Béhémoth de Cristal porte sur son dos les éclats de tous les mondes brisés.",
    spawn: [['behemoth', 1], ['wyvern', 2]],
  },
  {
    name: 'Les Trois Dragons',
    title: 'Quatrième épreuve',
    text: "Feu, givre et néant. Les deux premiers fendent le ciel ; le troisième attend au sol, et disparaît quand on le cherche.",
    spawn: [['dragon', 1, { tint: 'fire', hpMul: 1.6, notBoss: true }], ['dragon', 1, { tint: 'frost', hpMul: 1.6, notBoss: true }], ['dragon', 1, { tint: 'void', hpMul: 1.6, notBoss: true }]],
  },
  {
    name: 'Le Primordial',
    title: 'Le Primordial',
    text: "Il était là avant le premier rêve. Le Primordial ouvre les yeux, et l'Archive entière retient son souffle.",
    spawn: [['primordial', 1]],
    boss: true,
  },
];

const INTRO = [
  "La Chronique est terminée. Les cent mondes brillent dans l'Archive.",
  "Et pourtant, une porte que personne n'avait vue s'est ouverte au-dessus d'eux.",
  "Derrière, le Trône de l'Archive : l'endroit d'où naissent les rêves.",
  "Celui qui s'y assoit ne rêve plus les mondes. Il les garde.",
  "Personne n'en est jamais revenu. Personne n'y est jamais allé à plusieurs.",
];

export function getSecretStory() {
  const plan = skillPlan(STORY_COUNT);
  // Toutes les compétences acquises d'avance : c'est l'épreuve finale.
  plan.start = [...plan.start, ...plan.unlocks];
  plan.unlocks = [];
  plan.startUpgrades = Math.max(plan.startUpgrades, 18);
  const fill = (str) => str.replaceAll('{H}', 'Voyageur').replaceAll('{G}', 'Lueur').replaceAll('{Fc}', "L'Oubli").replaceAll('{FD}', "de l'Oubli")
    .replaceAll('{F}', "l'Oubli").replaceAll('{E}', 'créatures').replaceAll('{R}', 'sceaux').replaceAll('{Wc}', "Le Trône").replaceAll('{W}', 'le Trône').replaceAll('{e}', '');
  const hints = Object.fromEntries(Object.entries(HINTS).map(([k, v]) => [k, typeof v === 'string' ? fill(v) : Object.fromEntries(Object.entries(v).map(([a, b]) => [a, fill(b)]))]));
  return {
    n: SECRET_LEVEL,
    secret: true,
    title: "Le Trône de l'Archive",
    hero: 'Voyageur',
    heroF: false,
    guide: 'Lueur',
    guideKind: 'la petite lumière du premier monde',
    relics: 'sceaux',
    foe: "l'Oubli",
    foeDe: "de l'Oubli",
    enemies: 'créatures',
    world: "le Trône de l'Archive",
    premise: INTRO.join(' '),
    twist: '',
    intro: INTRO,
    kicker: 'Niveau caché',
    lieutenant: null,
    chapters: [{
      title: "Le Trône de l'Archive",
      arrival: ['Tu es venu seul. Évidemment.', "Je ne peux pas t'aider ici. Mais je reste à côté de toi."],
      fragments: [],
      portal: 'Le Trône est libre.',
      boss: 'Le Primordial',
    }],
    finale: {
      lines: [
        "Le Primordial se pose devant toi, immense et tranquille. Il ne combat plus.",
        "« Cent mondes », dit-il. « Tu les as tous rêvés une seconde fois. »",
        "Le Trône de l'Archive t'attend. Lueur brille comme jamais.",
        'C’est à toi de choisir.',
      ],
      a: { label: "S'asseoir sur le Trône", lines: [
        "Tu t'assois. Les cent mondes tournent autour de toi comme des étoiles.",
        "Tu ne les rêves plus : tu les gardes. Et quelque part, sur le S.I.D., ton nom change de couleur.",
        'Tu es devenu Divin.',
      ] },
      b: { label: 'Rendre le Trône au Primordial', lines: [
        "Tu poses la main sur le Trône, puis tu le rends à son gardien.",
        "Le Primordial s'incline. « Alors tu es plus grand que lui. » La lumière t'enveloppe.",
        'Tu es devenu Divin.',
      ] },
    },
    hints,
    skillLines: SKILL_LINES,
    plan,
    stars: 5,
  };
}

export const secretMeta = () => ({ n: SECRET_LEVEL, title: "Le Trône de l'Archive", hero: 'Voyageur', premise: INTRO[2], stars: 5, skills: 16 });
