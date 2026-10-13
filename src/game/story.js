// Histoire de Mondes Vivants.
// Ilo se réveille dans un rêve. Lueur, l'esprit du cristal de son bâton, la guide.
// Chaque relique est un éclat de mémoire du Rêveur, qui dort et oublie.

export const HERO = 'Ilo';
export const GUIDE = 'Lueur';

export const INTRO = [
  'Il existe un rêve si vaste qu\'il a fini par devenir des mondes.',
  'Des îles nées d\'un murmure. Des forêts poussées d\'une pensée. Des océans faits d\'un soupir.',
  'Celui qui les rêve dort depuis très longtemps. On l\'appelle le Rêveur. Et peu à peu, il oublie.',
  'Là où il oublie, la Brume se lève. Les souvenirs se vident et deviennent des Échos : des formes sans nom qui rôdent la nuit.',
  'Toi, tu viens d\'ouvrir les yeux devant une arche de pierre. Tu ne sais plus ton nom. Dans ta main, un bâton. Dans son cristal, une petite lumière qui parle.',
];

export const CHAPTERS = [
  {
    title: 'L\'Éveil',
    arrival: [
      'Enfin réveillée ! Je suis Lueur. Toi… tu t\'appelles Ilo, je crois. C\'est le seul mot qui me reste.',
      'Tu sens ces lueurs au loin ? Ce sont des éclats de mémoire. Ramasse-les : chacun te rendra quelque chose.',
      'Suis la flèche en haut. M pour la carte, J pour le journal.',
    ],
    fragments: [
      { title: 'Le premier pas', text: 'Un enfant court dans l\'herbe haute, si vite que le vent ne le rattrape pas. Il rit. Il s\'appelle… le nom s\'efface.' },
      { title: 'Le ruisseau', text: 'Le ruisseau était trop large. L\'enfant a sauté quand même, puis encore une fois dans les airs, comme si le ciel lui tendait une marche.' },
      { title: 'La lanterne', text: 'Une main pose une pierre lumineuse dans la sienne. « Quand il fera noir, c\'est toi qui feras la lumière. »' },
      { title: 'Les feuilles', text: 'Du haut de la colline, il regardait les feuilles planer jusqu\'au lac et rêvait de les suivre.' },
      { title: 'L\'orage', text: 'Une nuit d\'orage, l\'enfant a crié plus fort que le tonnerre. Le silence qui a suivi était immense.' },
    ],
    portal: 'Tous les éclats de cette île ! Le portail s\'éveille. Il mène plus loin dans le rêve…',
  },
  {
    title: 'Les Échos',
    arrival: [
      'Cette île est plus sombre. Les Échos y sont plus nombreux.',
      'Ce sont des souvenirs abandonnés, Ilo. Ne les crains pas : en les frappant, tu les libères.',
    ],
    fragments: [
      { title: 'La maison au bord de l\'eau', text: 'Une maison basse, des filets qui sèchent, l\'odeur du pain. Quelqu\'un l\'attendait toujours à la fenêtre.' },
      { title: 'L\'ami', text: 'Ils avaient construit un radeau trop petit pour deux. Ils ont coulé ensemble, en riant.' },
      { title: 'Ce que sont les Échos', text: 'Un souvenir qu\'on ne visite plus perd ses couleurs, puis sa forme. Il ne reste qu\'une gelée qui cherche ce qu\'elle a perdu.' },
      { title: 'Les îles de sable', text: 'Il dessinait des îles sur la plage, et la mer venait les effacer. Il recommençait chaque matin.' },
      { title: 'La promesse', text: '« Tu reviendras ? » — « Je reviendrai toujours. » Il ne se souvient plus à qui il l\'a dit.' },
      { title: 'Le départ', text: 'Le bateau s\'éloignait. Il a regardé la maison devenir un point, puis plus rien.' },
    ],
    portal: 'Le portail brille encore plus fort. On s\'enfonce dans le rêve, Ilo.',
  },
  {
    title: 'La Brume',
    arrival: [
      'Je sens la Brume partout ici. Le Rêveur est fatigué.',
      'Plus il oublie, plus les Échos deviennent forts. Méfie-toi des rois couronnés.',
    ],
    fragments: [
      { title: 'Les années', text: 'Les jours se ressemblaient tant qu\'il a cessé de les compter.' },
      { title: 'La lettre', text: 'Une lettre jamais ouverte, sur une table, sous une tasse froide.' },
      { title: 'Ce qu\'est la Brume', text: 'La Brume n\'est pas un ennemi. C\'est la fatigue d\'un esprit qui porte trop de mondes.' },
      { title: 'Le phare', text: 'Il gardait un phare. Chaque nuit, il allumait la lumière pour des bateaux qui ne venaient plus.' },
      { title: 'Le miroir', text: 'Dans le miroir, un vieil homme. Derrière lui, un instant, un enfant au foulard rouge.' },
      { title: 'Le sommeil', text: 'Un soir, il s\'est assis près du feu et a fermé les yeux. Juste un moment, s\'est-il dit.' },
      { title: 'Le premier rêve', text: 'Dans son sommeil, une île est née. Puis une autre. Il y a planté toutes les forêts de son enfance.' },
    ],
    portal: 'Un foulard rouge… comme le tien. Ilo, je crois que ces souvenirs parlent de toi.',
  },
  {
    title: 'Le Nom',
    arrival: [
      'Ilo… J\'ai peur de ce qu\'on va trouver ici. Et j\'ai très envie de savoir.',
    ],
    fragments: [
      { title: 'Le foulard', text: 'Le foulard rouge, c\'est sa mère qui l\'avait tricoté. Il ne l\'enlevait jamais.' },
      { title: 'La pierre qui parle', text: 'La pierre lumineuse de la lanterne… dans ses rêves d\'enfant, elle avait une voix. Elle s\'appelait Lueur.' },
      { title: 'Le nom', text: 'Sa mère l\'appelait Ilo. Le Rêveur s\'appelle Ilo.' },
      { title: 'Le gardien', text: 'Avant de sombrer, le Rêveur a façonné un dernier souvenir pour veiller sur les autres : lui-même, enfant.' },
      { title: 'Le dilemme', text: 'S\'il se réveille, les îles s\'éteindront comme des bougies. S\'il dort, la Brume finira par tout couvrir… sauf si quelqu\'un se souvient pour lui.' },
      { title: 'Le rire', text: 'Le rire de l\'ami, sur le radeau. Il résonne encore entre les arbres.' },
      { title: 'La fenêtre', text: 'Celle qui attendait à la fenêtre, c\'était sa mère. Elle portait le même foulard.' },
      { title: 'Le chemin', text: 'Toutes les routes du rêve mènent à la même île : celle où il s\'est endormi.' },
    ],
    portal: 'Tu es son souvenir d\'enfance, Ilo. Et moi, sa lanterne. Le dernier portail nous attend.',
  },
  {
    title: 'Le Réveil',
    arrival: [
      'C\'est l\'île du feu. Celle où il s\'est endormi.',
      'Rassemble les derniers éclats. Après… il faudra choisir.',
    ],
    fragments: [
      { title: 'Le feu', text: 'Le feu près duquel il s\'est endormi brûle encore, quelque part au-delà du rêve.' },
      { title: 'La voix', text: '« Ilo… » Une voix immense, douce, fatiguée. Celle du Rêveur. La tienne, plus tard.' },
      { title: 'Le poids', text: 'Porter des mondes, c\'est lourd. Mais chaque souvenir retrouvé les rend plus légers.' },
      { title: 'Les étoiles', text: 'Les étoiles de ces îles, il les a copiées sur le ciel de son enfance, une par une.' },
      { title: 'La mer', text: 'Il a toujours aimé la mer parce qu\'elle efface tout et que tout recommence.' },
      { title: 'Le pardon', text: 'La lettre jamais ouverte disait : « Je ne t\'en veux pas. Reviens quand tu veux. »' },
      { title: 'Le retour', text: 'Il a tenu sa promesse. Il est revenu, d\'une certaine façon : dans chaque île.' },
      { title: 'Le dernier éclat', text: 'Tous les souvenirs sont là. Le Rêveur peut ouvrir les yeux… ou continuer à rêver, sans plus jamais oublier.' },
    ],
    portal: 'Le portail ne mène plus à une île. Il mène au Rêveur. Va, Ilo.',
  },
];

// Après la fin : rêve libre, fragments au hasard.
export const FREE_CHAPTER = {
  title: 'Le Rêve sans fin',
  arrival: ['Une île toute neuve. Le Rêveur l\'a imaginée pour toi.'],
  fragments: [
    { title: 'Rêve libre', text: 'Une baleine traverse le ciel, très lentement, et personne ne trouve ça étrange.' },
    { title: 'Rêve libre', text: 'Un phare allumé au milieu d\'une forêt, pour guider les oiseaux perdus.' },
    { title: 'Rêve libre', text: 'Le goût du pain chaud, dans une maison au bord de l\'eau.' },
    { title: 'Rêve libre', text: 'Deux enfants sur un radeau trop petit, qui ne coulent plus.' },
    { title: 'Rêve libre', text: 'Une fenêtre ouverte. Quelqu\'un fait signe. Tu fais signe aussi.' },
    { title: 'Rêve libre', text: 'La neige qui tombe vers le haut, juste pour voir.' },
    { title: 'Rêve libre', text: 'Un ruisseau qu\'on peut enfin traverser d\'un seul saut.' },
    { title: 'Rêve libre', text: 'Les étoiles se rapprochent pour écouter une histoire.' },
  ],
  portal: 'Encore une île ? Le rêve n\'a pas de fin.',
};

export const FINALE = {
  lines: [
    'Tu traverses le portail. Il n\'y a plus d\'île. Seulement un feu, et un vieil homme endormi devant.',
    'Il ouvre à moitié les yeux. Il porte un foulard rouge, délavé.',
    '« Ilo. Tu as tout retrouvé. Je me souviens de tout, maintenant. De la maison. De l\'ami. De ma mère. »',
    '« Si je me réveille, je retrouverai le monde réel. Mais les îles s\'éteindront. »',
    '« Si je continue à rêver, elles vivront. Et cette fois, je n\'oublierai plus. »',
    '« C\'est toi qui as fait le chemin. C\'est à toi de choisir. »',
  ],
  wake: {
    label: 'Le réveiller',
    lines: [
      'Le vieil homme sourit et ferme les yeux pour la dernière fois du rêve.',
      'Les îles s\'éteignent une à une, doucement, comme des bougies qu\'on souffle après une belle soirée.',
      'Quelque part, dans une maison au bord de l\'eau, un homme se réveille près d\'un feu éteint.',
      'Il prend une lettre sur la table. Il l\'ouvre enfin.',
      'Fin.',
    ],
  },
  dream: {
    label: 'Continuer à rêver',
    lines: [
      '« Alors je rêverai. Et toi, tu veilleras. »',
      'La Brume recule. Les îles reprennent leurs couleurs. De nouvelles naissent déjà à l\'horizon.',
      'Lueur brille plus fort que jamais. « On repart, Ilo ? »',
      'Le rêve continue…',
    ],
  },
};

// Répliques ponctuelles de Lueur (une seule fois par partie).
export const HINTS = {
  firstNight: 'La nuit tombe. Les Échos sortent de la Brume… Ma lumière t\'aidera à voir.',
  firstGuard: 'Tu sens ce frisson ? Un éclat est tout près. Des Échos le gardent : frappe-les avec le bâton (clic gauche ou F).',
  firstSwim: 'L\'eau te fatigue. Surveille ton endurance, sinon tu couleras.',
  lowHealth: 'Ilo, tu es blessée ! Les Échos libérés laissent parfois un orbe rose qui soigne.',
  firstDeath: 'Ce n\'est qu\'un rêve… Tu te relèves toujours, devant l\'arche.',
  firstRun: 'Maintiens Shift pour courir. Ça use l\'endurance.',
  firstUpgrade: 'Tu connais déjà tous les gestes. Les éclats te rendent maintenant plus forte.',
};

// Ce que dit Lueur quand une compétence revient.
export const SKILL_LINES = {
  dash: 'Ce souvenir t\'a rendu ta vitesse ! Appuie sur E pour une Ruée. Même en l\'air.',
  doubleJump: 'Le ruisseau… Tu peux sauter une seconde fois en plein vol. Espace, deux fois !',
  bolt: 'C\'est moi, la pierre de la lanterne ! Clic droit ou R : je lance un éclat là où tu regardes.',
  glide: 'Les feuilles qui planent… Maintiens Espace en tombant pour déployer des ailes.',
  nova: 'Le cri dans l\'orage ! Appuie sur C pour une onde qui repousse tous les Échos autour.',
};

export function chapterFor(level) {
  return level <= CHAPTERS.length ? CHAPTERS[level - 1] : FREE_CHAPTER;
}

export function chapterNumeral(level) {
  const R = ['I', 'II', 'III', 'IV', 'V'];
  return level <= R.length ? R[level - 1] : '∞';
}
