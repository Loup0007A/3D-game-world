// Modèles de texte pour les chapitres. Champs :
// {H} héros · {G} guide · {F} fléau (« la Brume ») · {Fc} idem en majuscule · {FD} « de la Brume »
// {E} ennemis (« Échos ») · {R} reliques au pluriel · {W} monde (« l'archipel… ») · {Wc} idem en majuscule
// {e} = « e » si l'héroïne est une fille.

export const CHAPTER_TITLES = [
  ["L'Éveil", 'Le Seuil', 'Le Premier Matin', "L'Arrivée", 'Les Premiers Pas'],
  ['Les {E}', 'La Piste des Lueurs', 'Premières Ombres', 'Le Village vide', 'Les Traces'],
  ['Le Chemin de {G}', 'La Forêt des Murmures', 'Le Pont brisé', 'Les Hautes Collines', "L'Écho lointain"],
  ['Les Ruines', 'La Tour penchée', 'Le Lac immobile', 'Les Pierres levées', 'Les Anciens'],
  ["Le Cœur de l'Île", 'La Grande Traversée', 'Les Sentinelles', 'La Longue Nuit', 'Le Temple englouti'],
  ['Le Doute', 'Les Voix', 'Le Refuge', 'La Mémoire du Sol', 'Les Cendres'],
  ['La Vérité', 'Le Masque tombe', 'Ce que savait {G}', 'Le Revers', 'La Révélation'],
  ['La Dernière Garde', "L'Orage", 'Le Siège', 'La Marche', 'Le Serment'],
  ['Les Profondeurs', 'Le Ciel ouvert', 'La Dernière Île', "L'Avant-Dernier Pas", 'Le Seuil final'],
  ['Le Choix', 'La Fin du Voyage', "L'Aube", 'Ce qui reste', 'Le Dernier Matin'],
];

// Ce que dit le guide en arrivant sur chaque île (deux répliques tirées au hasard).
export const ARRIVALS = [
  ['Tu es réveillé{e} ! Je suis {G}. Il faut retrouver les {R} avant que {F} ne prenne tout.', 'Suis la flèche en haut. M pour la carte, J pour le journal.', 'Chaque relique te rendra un peu de force. Tu verras.', "N'aie pas peur des {E}. Le bâton suffit, pour l'instant."],
  ['Ici aussi, {F} est passé. Regarde ces arbres gris.', 'Les {E} sont plus nombreux. Reste sur tes gardes la nuit.', 'Je sens des {R} au loin. Plusieurs.', 'Cette île sent le vent salé. Ça me rappelle quelque chose.'],
  ["On s'enfonce dans {W}. Personne n'était jamais venu aussi loin.", "Les {E} se regroupent autour des reliques. Ils savent ce qu'elles valent.", 'Tu marches plus vite qu’avant. Ça se voit.', "Écoute… On dirait que l'île respire."],
  ['Des ruines. Quelqu’un vivait ici, avant {F}.', 'Chaque pierre a une histoire. Les {R} aussi.', "Fais attention : le gardien de cette île est plus fort.", 'Le ciel est bas. La nuit tombera vite.'],
  ["On arrive au cœur de {W}. Plus de retour possible, maintenant.", '{Fc} est plus épais ici. Je le sens jusque dans mes os.', "Tu n'es plus la même personne qu'au début. Moi non plus.", "Il y a quelque chose de familier dans cette île. Je ne sais pas quoi."],
  ["Je me pose des questions, {H}. Sur {F}. Sur nous.", 'Les {E} ne nous attaquent pas par haine. Je crois qu’ils ont peur.', "Rassemble les {R}. On comprendra peut-être.", 'Cette île est silencieuse. Trop silencieuse.'],
  ['Je crois que je sais la vérité. Mais je préfère que tu la trouves toi-même.', "Les {R} d'ici sont lourds. Ils portent quelque chose de grave.", "Quoi qu'on découvre, je reste avec toi.", "Regarde l'horizon. Il change de couleur."],
  ["Maintenant qu'on sait, il faut aller jusqu'au bout.", '{Fc} nous a vus venir. Les {E} sont prêts.', 'Ne cours pas trop loin sans moi.', 'Les dernières îles sont les plus dures. Mais tu es prêt{e}.'],
  ["On approche. Je sens {F} partout autour.", "Il ne reste presque plus rien à découvrir. Seulement à faire.", 'Garde tes forces pour le gardien.', 'Je n’ai jamais eu aussi peur. Et pourtant, je viens.'],
  ["C'est la dernière île, {H}.", 'Après cette île, il faudra choisir. Je ne choisirai pas pour toi.', 'Rassemble les dernières {R}. Puis va au portail.', "Quoi qu'il arrive… merci pour ce voyage."],
];

export const PORTALS = [
  'Le portail s’éveille ! Mais un gardien le protège. Prépare-toi.',
  "Toutes les {R} de l'île sont à nous. Le gardien du portail arrive…",
  "Ça y est. Le gardien de l'arche se réveille. Courage, {H}.",
  'Je sens le gardien. Il est en colère. Reste mobile !',
];

export const BOSS_NAMES = [
  'Gardien des Ronces', 'Gardien de Cendre', 'Gardien du Gel', 'Gardien des Profondeurs', 'Gardien du Vent',
  'Gardienne des Ombres', 'Gardien de Rouille', 'Gardienne des Larmes', 'Gardien des Pierres', 'Gardienne des Marées',
  'Gardien Hurlant', 'Gardienne Aveugle', 'Gardien du Silence', 'Gardienne des Épines', 'Gardien Couronné',
];

// Fragments par phase. Phase 0 : chapitres 1-2 · 1 : 3-4 · 2 : 5-6 · 3 : 7-8 · 4 : 9-10.
export const FRAGMENTS = [
  [
    ['Le premier éclat', "Il brille dans ta main comme s'il te reconnaissait. Une chaleur remonte le long de ton bras."],
    ['Un matin ordinaire', "Autrefois, ici, les matins sentaient le pain et la mer. Les gens se saluaient d'une île à l'autre."],
    ['La première ombre', "Personne n'a remarqué {F} au début. Juste un peu de froid, le soir, qu'on mettait sur le compte de l'hiver."],
    ['Le nom effacé', "Tu essaies de te rappeler d'où tu viens. Il ne reste qu'une image : une arche de pierre, et une voix qui disait ton nom."],
    ['Les rires', "On entend encore des rires d'enfants dans {W}, très loin, comme un souvenir collé aux pierres."],
    ['La carte', "Quelqu'un a gravé une carte sur ce caillou. Toutes les îles y sont reliées par des lignes fines."],
    ['La première nuit', "La première nuit où {F} est arrivé, les étoiles ont clignoté, comme pour prévenir. Personne n'a compris."],
    ['Ce que dit {G}', "« Je t'attendais depuis longtemps », a dit {G}. Tu ne sais pas encore si c'est une bonne nouvelle."],
    ['Les {E}', "Les {E} n'ont pas toujours été des monstres. Avant, c'étaient des choses aimées, puis oubliées."],
    ['Une chanson', "Un air revient dans ta tête, sans paroles. Tu le fredonnes, et le vent semble le connaître."],
    ['Le marché', "Il y avait un marché ici, chaque semaine. On y échangeait des fruits, des histoires et des promesses."],
    ['Le chemin', "Chaque relique trouvée rend un peu de couleur au paysage. Tu le vois, maintenant que tu regardes."],
  ],
  [
    ['Les anciens', "Les anciens racontaient que {W} était né d'un geste de tendresse. Personne ne se souvient du geste."],
    ['La tour', "Une tour se dressait ici. Du sommet, on voyait toutes les îles, et on pouvait leur parler."],
    ['Le premier gardien', "Le premier gardien de ces îles n'avait pas d'arme. Il avait seulement une lanterne, et beaucoup de patience."],
    ['Ce que mange {F}', "{Fc} ne mange pas la terre ni l'eau. Il mange ce qui donne envie de se lever le matin."],
    ['Le pacte', "Il y a longtemps, les habitants avaient fait un pacte : ne jamais laisser une île seule. Ils l'ont oublié."],
    ['Les voix sous la pierre', "Sous les ruines, des voix murmurent encore des noms. Tu reconnais presque le tien."],
    ['Le lac', "On disait que le lac gardait les reflets de tous ceux qui s'y étaient penchés. Le tien y est, maintenant."],
    ['La fête', "Chaque année, une fête réunissait toutes les îles. La dernière fois, {F} est arrivé pendant la musique."],
    ['Les pierres levées', "Les pierres levées formaient une horloge. Elle s'est arrêtée le jour où {F} est venu."],
    ['Le voyageur', "Un voyageur est passé avant toi. Il a laissé des marques sur les arbres, comme pour dire : continue."],
    ['La lettre', "Une lettre, à moitié effacée : « Si quelqu'un trouve ceci, rassemble les {R}. Moi, je n'ai pas pu. »"],
    ['Les {E} qui pleurent', "Tu as vu un des {E} s'arrêter près d'une ruine, comme s'il se souvenait d'y avoir habité."],
    ['Le premier doute', "Pourquoi toi ? Tu n'as rien de spécial. Seulement l'envie d'aller jusqu'au bout."],
  ],
  [
    ['Le cœur des choses', "Plus tu avances, plus {F} ressemble à une tristesse, et moins à un ennemi."],
    ['La fatigue', "Ceux qui vivaient ici n'ont pas été vaincus. Ils étaient simplement fatigués, et {F} est entré par la fatigue."],
    ['La voix de {G}', "{G} parle moins. Parfois, sa voix tremble quand on approche d'une relique."],
    ['Le refuge', "Une maison intacte, au milieu de tout. La table est mise pour deux. Personne n'est venu."],
    ['La mémoire du sol', "La terre se souvient de chaque pas. Les tiens s'ajoutent maintenant à ceux des anciens."],
    ['Les cendres', "Sous les cendres, une graine. Elle attend, elle aussi, que tout ceci se termine."],
    ['Le visage dans l’eau', "En te penchant sur une flaque, tu as vu un autre visage que le tien. Il souriait."],
    ['Le chant des {E}', "La nuit, les {E} émettent un son très doux. Ce n'est pas un cri. C'est presque une berceuse."],
    ['La question', "Et si {F} n'était pas venu de dehors ? Et s'il était né ici, d'une erreur ou d'un chagrin ?"],
    ['Le prix', "Chaque relique rendue au monde demande quelque chose en échange. Tu ne sais pas encore quoi."],
    ['Les sentinelles', "Des statues regardent toutes vers le même point. Le portail. Comme si elles attendaient quelqu'un."],
    ['Ce qui tient', "Malgré {F}, les fleurs poussent encore entre les pierres. Rien ne s'arrête tout à fait."],
    ['Le rêve', "Cette nuit, tu as rêvé de {W} tel qu'il était avant. Tu n'avais jamais vu ces images, et pourtant tu t'en souvenais."],
    ['Le poids', "Les {R} pèsent plus lourd à mesure que tu en trouves. Elles portent les souvenirs de tout un monde."],
    ['La main tendue', "Un des {E} t'a frôlé{e} sans attaquer. Juste un instant. Puis il est reparti dans la nuit."],
  ],
  [
    ['Après la vérité', "Maintenant que tu sais, chaque pierre semble raconter la même histoire, autrement."],
    ['La colère', "Tu as eu envie de tout abandonner. {G} n'a rien dit. Juste une présence, tout près. Ça a suffi."],
    ['Le serment', "Tu as fait un serment, seul{e}, devant le portail : aller jusqu'au bout, quoi qu'il en coûte."],
    ['Les alliés', "Tu n'es pas seul{e}. Dans chaque île, quelqu'un a laissé un signe pour t'aider."],
    ['La dernière garde', "Les gardiens deviennent plus forts. {Fc} sait que tu approches, et rassemble ce qui lui reste."],
    ['Le prix payé', "Ceux qui avaient tenté avant toi n'ont pas échoué. Ils ont chacun ouvert une porte, pour que tu passes."],
    ['La nuit blanche', "Tu n'as pas dormi. Tu as regardé les étoiles en comptant les reliques qu'il reste."],
    ['Ce que veut {F}', "{Fc} ne veut pas détruire. Il veut que tout s'arrête, parce qu'il croit que l'arrêt est un repos."],
    ['Le visage connu', "Dans les ruines, un portrait. Le visage te ressemble. Ou c'est toi qui lui ressembles."],
    ['Le pardon', "Tu comprends maintenant que la fin de cette histoire ne sera pas une victoire. Ce sera un pardon."],
    ['L’orage', "L'orage gronde sur {W}. Il ne vient pas du ciel. Il vient de {F}, qui a peur, lui aussi."],
    ['Le chemin parcouru', "Tu repenses à la première arche, au premier matin. Tu étais quelqu'un d'autre."],
    ['La force', "Tes mains ne tremblent plus. Ce n'est pas du courage. C'est de la confiance."],
    ['Le siège', "Les {E} encerclent les dernières îles. Tu entends leurs pas, la nuit, de plus en plus près."],
    ['La promesse de {G}', "{G} t'a confié un secret : à la fin, il faudra peut-être se dire adieu. Sa voix ne tremblait pas."],
    ['Les noms', "Tu te souviens maintenant des noms de ceux qui vivaient ici. Tu les répètes à voix basse, pour qu'ils restent."],
    ['Le dernier refuge', "Une dernière maison debout. Tu y as dormi, et tu as rêvé que le monde guérissait."],
  ],
  [
    ['Les profondeurs', "Plus bas, plus loin. {Fc} n'est plus une ombre : c'est un paysage entier."],
    ['Le ciel ouvert', "Au-dessus de la dernière île, le ciel est déchiré. On voit à travers, et il y a de la lumière."],
    ['Le dernier matin', "Peut-être le dernier matin. Tu l'as regardé se lever jusqu'au bout."],
    ['Tout ce qui reste', "Il reste peu de choses à sauver. Mais chacune compte plus que toutes les autres."],
    ['Ce que tu emportes', "Quoi qu'il arrive, tu emporteras le souvenir de {W}. C'est déjà une victoire."],
    ['La voix de {F}', "Pour la première fois, tu as entendu {F} parler. Sa voix était fatiguée, et presque douce."],
    ['Le dernier gardien', "Le dernier gardien t'attend. Il est fait de tout ce que {F} a pris."],
    ['Les {E} se taisent', "Les {E} ne crient plus. Ils te regardent passer, comme s'ils attendaient la fin, eux aussi."],
    ['L’avant-dernier pas', "Encore un pas, puis un autre. Le portail est là, et derrière, le cœur {FD}."],
    ['Ce que dit le vent', "Le vent répète ton nom, île après île. Tout {W} sait que tu arrives."],
    ['Le dernier refuge', "Toutes les reliques brillent en même temps. Le monde retient son souffle."],
    ['Les mots de {G}', "{G}, tout contre toi, murmure : « Quoi que tu choisisses, ce sera le bon choix. »"],
    ['La lumière', "Une lumière monte des {R} rassemblées. Elle a la couleur du premier matin."],
    ['Le silence', "Un grand silence, juste avant la fin. Pas un silence vide. Un silence qui écoute."],
    ['Tout ce chemin', "Tout ce chemin pour arriver ici. Tu ne regrettes rien. Pas même les chutes."],
    ['Les anciens te regardent', "Tu sens, derrière toi, tous ceux qui ont essayé avant. Ils te regardent passer."],
    ['Le seuil', "Le seuil est là. Au-delà, plus d'île, plus de route. Seulement un choix."],
    ['Le cœur', "Au fond de {F}, il y a un cœur. Il bat lentement, comme celui de quelqu'un qui dort."],
    ['Avant la fin', "Tu as pensé à tous ceux que tu as croisés. Tu leur dis au revoir, un par un."],
  ],
];

// Répliques du guide quand une compétence revient.
export const SKILL_LINES = {
  dash: "Tu as retrouvé ta vitesse ! Appuie sur E pour une Ruée. Même en l'air.",
  doubleJump: 'Saute une seconde fois en plein vol : Espace, deux fois !',
  bolt: 'Clic droit ou R : un éclat de lumière part vers l’ennemi que tu vises.',
  glide: 'Maintiens Espace en tombant pour déployer des ailes et planer.',
  nova: 'Appuie sur C : une onde repousse tous les ennemis autour.',
  shield: 'Touche 1 : une bulle de lumière te protège quatre secondes.',
  slam: 'En l’air, frappe pour plonger sur le sol et tout renverser !',
  heal: 'Touche 2 : un souffle doux te soigne.',
  companion: 'Regarde ! Un petit esprit nous suit. Il tirera sur les ennemis proches.',
  lightning: 'Touche 3 : un éclair qui saute d’ennemi en ennemi.',
  tripleJump: 'Un troisième saut en l’air ! Espace, trois fois.',
  chrono: 'Touche 4 : tout ralentit autour de toi, sauf toi.',
  waterWalk: "Cours (Shift) sur l'eau : elle te porte maintenant !",
  roots: 'Touche 5 : des racines clouent les ennemis au sol.',
  magnet: 'Les orbes de soin viennent à toi tout seuls, maintenant.',
  secondWind: 'Tu cours plus longtemps, et ton souffle revient vite.',
};

export const HINTS = {
  firstNight: 'La nuit tombe. Les {E} sortent… Ta lanterne s’allume : reste dans sa lumière.',
  firstGuard: 'Une relique est tout près. Des {E} la gardent : frappe-les (clic gauche ou F).',
  firstSwim: "L'eau te fatigue. Surveille ton endurance, sinon tu couleras.",
  lowHealth: '{H}, tu es blessé{e} ! Les {E} vaincus laissent parfois un orbe rose qui soigne.',
  firstDeath: 'Tu te relèves toujours, devant l’arche. Les reliques trouvées restent à toi.',
  firstRun: 'Maintiens Shift pour courir. Ça use l’endurance.',
  firstUpgrade: 'Cette relique te rend plus fort{e}. Regarde le journal (J).',
  boss: 'Le gardien ! Esquive ses bonds (cercle rouge au sol) et frappe quand il retombe.',
  newEnemy: {
    wisp: 'Des feux follets ! Ils volent et foncent sur toi. Un seul coup suffit.',
    spitter: "Ceux-là crachent de loin. Approche-toi vite, ou réponds avec l'Éclat.",
    golem: 'Un golem de pierre. Lent mais terrible : recule quand le cercle rouge apparaît.',
    shade: 'Une ombre… Elle disparaît et réapparaît près de toi. Ne reste pas immobile.',
  },
};
