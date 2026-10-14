// ─── La Chronique des Mondes Vivants ─────────────────────────────────
// Le fil rouge des 100 niveaux. Chaque niveau garde sa propre histoire
// (seeds.js) ; la Chronique les relie : cent mondes rêvés, rangés dans
// l'Archive, que la Fêlure dévore un à un. Toi, le Voyageur, tu t'éveilles
// dans chacun sous un visage différent pour le sauver.
//
// 10 Âges de 10 niveaux. Le 10e niveau de chaque Âge est gardé par un
// Écho de l'Oublieur (un lieutenant) au lieu du gardien habituel.

export const AGES = [
  {
    name: "L'Éveil",
    open: [
      "Il existe un lieu hors du temps qu'on appelle l'Archive. Cent mondes y dorment, chacun né d'un rêve.",
      "Une fissure s'est ouverte au plus profond de l'Archive : la Fêlure. Par elle, quelque chose entre, et les mondes s'éteignent.",
      "Toi, le Voyageur, tu peux t'éveiller dans chacun d'eux. Il faudra les sauver un par un.",
    ],
    echoes: [
      "Tu commences à reconnaître la sensation : un monde qui t'appelle, quelque part dans l'Archive.",
      "Derrière chaque Fléau, tu sens la même présence. Elle ne se montre pas encore.",
      "Les mondes que tu as sauvés brillent derrière toi comme des lanternes.",
    ],
    lieutenant: 'Morne, le Premier Oubli',
    lieutenantLine: "Ce gardien n'appartient pas à ce monde. Il vient de la Fêlure.",
    close: [
      "Morne s'effondre en murmurant un nom : « l'Oublieur ». C'est lui qui envoie les Fléaux.",
      "Le premier Âge est sauvé. La Fêlure, elle, s'élargit.",
    ],
  },
  {
    name: 'Les Voix éteintes',
    open: ["Deuxième Âge. Dans ces mondes-là, on a cessé de parler, de chanter, d'appeler.", "L'Oublieur ne détruit pas : il fait taire."],
    echoes: [
      "Un monde de plus a perdu sa voix cette nuit. Tu arrives avant le dernier mot.",
      "Tu entends parfois, entre deux mondes, un chuchotement qui prononce ton vrai nom.",
      "Les habitants sauvés laissent des messages pour toi dans l'Archive. Tu les lis en silence.",
    ],
    lieutenant: 'La Sourdine',
    lieutenantLine: 'Plus un son. La Sourdine avale même le bruit de tes pas.',
    close: ["La Sourdine se brise comme une cloche fêlée. Les voix des mondes reviennent en chœur.", "Dans le vacarme, une seule voix manque : la tienne, celle d'avant."],
  },
  {
    name: 'Les Racines',
    open: ["Troisième Âge. Ces mondes poussent les uns dans les autres, reliés par des racines immenses.", "Si une racine pourrit, tout ce qu'elle porte tombe avec elle."],
    echoes: [
      "Les racines frémissent quand tu passes. Elles se souviennent des mondes que tu as déjà sauvés.",
      "Une sève noire suinte de la Fêlure. Elle remonte lentement vers les mondes les plus jeunes.",
      "Tu as compris que les Fléaux ne sont que des branches. Il faudra trouver la souche.",
    ],
    lieutenant: 'Sève-Noire',
    lieutenantLine: "La sève noire s'est faite chair. Elle t'attendait.",
    close: ["Sève-Noire se dessèche et les racines respirent à nouveau.", "Elles te montrent un chemin vers le bas, vers le cœur de l'Archive."],
  },
  {
    name: 'Les Eaux dormantes',
    open: ["Quatrième Âge. Ici, les mondes sont des îles posées sur une mer immobile.", "Sous la surface dorment des cités entières, et quelque chose qui les tient sous l'eau."],
    echoes: [
      "La mer monte d'un cheveu à chaque monde perdu. Tu la vois venir, patiente.",
      "Un reflet te suit d'île en île. Quand tu te retournes, il a déjà disparu.",
      "Les cités englouties sonnent leurs cloches sous l'eau pour te guider.",
    ],
    lieutenant: 'Le Noyeur',
    lieutenantLine: "Le Noyeur remonte des profondeurs, ruisselant d'oubli.",
    close: ["Le Noyeur coule pour de bon. Les cités remontent à la lumière, une à une.", "Sur le sable, quelqu'un a écrit ton nom. Pas celui du héros : le tien."],
  },
  {
    name: 'Le Ciel en morceaux',
    open: ["Cinquième Âge. La moitié de l'Archive est sauvée, et le ciel s'est fendu au-dessus de l'autre moitié.", "Les éclats de ciel tombent sur les mondes comme une pluie de verre."],
    echoes: [
      "Tu as passé la moitié du chemin. L'Oublieur l'a remarqué.",
      "Les oiseaux de ces mondes volent en rond, perdus, sans étoiles pour s'orienter.",
      "Chaque monde sauvé recoud un morceau du ciel. Il en reste beaucoup.",
    ],
    lieutenant: "L'Oiseau de Cendre",
    lieutenantLine: "Un battement d'ailes immense : l'Oiseau de Cendre plonge sur l'île.",
    close: ["L'Oiseau de Cendre retombe en poussière, et le ciel se referme au-dessus de toi.", "Dans la cendre, une plume intacte. Elle pointe vers la Fêlure."],
  },
  {
    name: 'Les Rouages du Temps',
    open: ["Sixième Âge. L'Archive est une horloge, et ses mondes en sont les rouages.", "L'Oublieur a glissé un grain de sable dans le mécanisme : les jours se répètent, se sautent, s'effacent."],
    echoes: [
      "Tu as l'impression d'avoir déjà vécu ce monde. Peut-être est-ce vrai.",
      "Les horloges des mondes sauvés se remettent à tourner ensemble, au même rythme que ton cœur.",
      "Quelque part, un rouage tourne à l'envers. Il faudra le trouver.",
    ],
    lieutenant: 'Le Rouage Fou',
    lieutenantLine: 'Le Rouage Fou grince et tourne à contretemps. Le temps lui-même hésite.',
    close: ["Le Rouage Fou s'arrête net. Le temps de l'Archive repart dans le bon sens.", "Il te reste quarante mondes. Et tu commences à te souvenir de qui tu étais."],
  },
  {
    name: 'Les Miroirs',
    open: ["Septième Âge. Ces mondes sont des reflets : chacun montre ce qui aurait pu être.", "Et dans chaque reflet, un Voyageur qui a échoué."],
    echoes: [
      "Un de tes reflets t'a regardé{e} longtemps, ce matin. Il avait l'air fatigué.",
      "Tu comprends que l'Oublieur n'est pas né de rien. Il vient de l'Archive elle-même.",
      "Les miroirs se fendent quand tu sauves un monde. Derrière eux, la vraie lumière.",
    ],
    lieutenant: 'Le Double',
    lieutenantLine: "Le gardien a ton visage, tes gestes, ta voix. C'est toi, si tu avais renoncé.",
    close: ["Le Double sourit avant de disparaître : « Tu iras plus loin que moi. »", "Tu connais maintenant la vérité : l'Oublieur est la fatigue de l'Archive, qui veut que tout s'arrête."],
  },
  {
    name: 'La Longue Nuit',
    open: ["Huitième Âge. Le soleil ne se lève plus sur ces mondes.", "Les habitants dorment debout, et rêvent qu'ils ont déjà été sauvés."],
    echoes: [
      "La nuit dure depuis si longtemps qu'on a oublié la couleur du matin. Tu la rapportes, monde après monde.",
      "Tes alliés des mondes sauvés allument des feux pour toi au bord de l'Archive.",
      "L'Oublieur te parle, maintenant, la nuit. Il ne menace pas. Il propose le repos.",
    ],
    lieutenant: 'Nuit-sans-Lune',
    lieutenantLine: 'Toutes les lumières de l’île s’éteignent. Nuit-sans-Lune est là.',
    close: ["Nuit-sans-Lune se déchire et l'aube coule par la blessure.", "Il ne reste que deux Âges. Le dernier est fait de feu."],
  },
  {
    name: 'Le Feu des Anciens',
    open: ["Neuvième Âge. Les premiers mondes de l'Archive, les plus anciens, brûlent encore d'un feu très vieux.", "Les dragons qui les gardaient se sont tournés vers l'Oublieur."],
    echoes: [
      "Le feu des Anciens ne détruit pas : il éprouve. Il veut savoir si tu es digne d'entrer.",
      "Les braises murmurent les noms de tous les Voyageurs venus avant toi.",
      "Plus tu approches du cœur, plus les gardiens ont la forme de dragons.",
    ],
    lieutenant: 'Ignivore, le Dernier Dragon',
    lieutenantLine: 'Le ciel rougit. Ignivore, le Dernier Dragon, déploie ses ailes au-dessus du portail.',
    dragon: true,
    close: ["Ignivore s'incline avant de s'éteindre : « Passe, Voyageur. Le cœur t'attend. »", "Devant toi s'ouvre le dernier Âge : le Cœur de l'Archive."],
  },
  {
    name: "Le Cœur de l'Archive",
    open: ["Dixième Âge. Tu es au bord de la Fêlure.", "Chaque monde qui reste est un battement du cœur de l'Archive. L'Oublieur les compte, un à un, à rebours."],
    echoes: [
      "La Fêlure respire au rythme de tes pas. Elle sait que tu viens.",
      "Les quatre-vingt-dix mondes sauvés chantent derrière toi. Tu n'as jamais été seul{e}.",
      "L'Oublieur a ralenti. Lui aussi est fatigué. Peut-être veut-il qu'on l'arrête.",
    ],
    lieutenant: "L'Oublieur",
    lieutenantLine: "Au-delà du portail, une immense silhouette sans visage. L'Oublieur.",
    dragon: true,
    close: [
      "L'Oublieur se défait doucement, comme un rêve au matin. « Merci », dit-il, et la Fêlure se referme.",
      "Les cent mondes de l'Archive s'allument tous ensemble. Ils brilleront longtemps, parce que quelqu'un s'est souvenu d'eux.",
      'La Chronique des Mondes Vivants est terminée. Ton nom y est écrit cent fois.',
    ],
  },
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export const ageOf = (n) => Math.min(AGES.length - 1, Math.floor((n - 1) / 10));
export const isAgeFinale = (n) => n % 10 === 0;

export function sagaKicker(n) {
  const a = ageOf(n);
  return `Âge ${ROMAN[a]} · ${AGES[a].name} — Monde ${n}/100`;
}

// Lignes de la Chronique avant l'histoire du niveau.
export function sagaIntro(n, fem) {
  const a = ageOf(n);
  const age = AGES[a];
  const e = (s) => s.replaceAll('{e}', fem ? 'e' : '');
  if ((n - 1) % 10 === 0) return age.open.map(e);
  const saved = n - 1;
  const line = age.echoes[(n - 1) % age.echoes.length];
  return [e(line), `Mondes sauvés : ${saved}. Il en reste ${100 - saved}.`];
}

// Lignes de la Chronique après l'épilogue du niveau.
export function sagaOutro(n) {
  const a = ageOf(n);
  if (isAgeFinale(n)) return AGES[a].close;
  return [`Le monde ${n} est sauvé. Dans l'Archive, une lanterne de plus s'allume.`];
}
