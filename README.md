# Mondes Vivants

Jeu d'aventure 3D dans le navigateur. **100 histoires**, chacune sur 10 îles nées du **bruit fractal**, de plus en plus dures, avec de plus en plus de compétences.

**▶ Liste des histoires : https://loup0007a.github.io/3D-game-world/**
**▶ Une histoire : https://loup0007a.github.io/3D-game-world/1/ … /100/**

| | |
|---|---|
| ![Matin](docs/matin.png) | ![Slimes](docs/slimes.png) |
| ![Nage au crépuscule](docs/nage.png) | ![Carte](docs/carte.png) |

## Intégrer dans un autre site (iframe)

```html
<iframe src="https://loup0007a.github.io/3D-game-world/12/"
        allow="fullscreen; autoplay; gamepad"
        style="width:100%; aspect-ratio:16/9; border:0"></iframe>
```

- Cliquer dans le jeu capture la souris (Échap la libère et met en pause).
- `allow="fullscreen"` active le bouton Plein écran.
- Pas d'attribut `sandbox` (sinon il faut `allow-scripts allow-same-origin allow-pointer-lock`).
- Chaque histoire se sauvegarde à part, dans le navigateur. Certains navigateurs bloquent le stockage dans les iframes d'un autre site : le jeu marche quand même, sans sauvegarde.
- Le jeu envoie des messages à la page parente :

```js
window.addEventListener('message', (e) => {
  if (e.data?.source !== 'mondes-vivants') return;
  // e.data.type : 'start' | 'chapter' | 'complete'
  // e.data.story, e.data.chapter, e.data.ending, e.data.score, e.data.minutes
});
```

## Résultat envoyé au site principal

Comme dans le dépôt **Potions**, le jeu envoie le résultat à `https://sid-quest.vercel.app/api` (GET signé, `no-cors`, avec repli sur une image) et un `postMessage` `{ type: 'sid-quest-resultat', … }` au parent. Réglages en haut de `src/game/report.js`.

| Quand | `statut` | `raison` | `score` |
|---|---|---|---|
| Fin de l'histoire (choix fait) | `reussi` | `histoire_terminee` | 100 − 3 par mort (min. 30) |
| Bouton « Abandonner l'histoire » | `echoue` | `abandon` | 0 |
| « Recommencer » sur une partie en cours | `echoue` | `recommence` | 0 |

Champs : `email` (demandé au joueur à l'arrivée sur une histoire, gardé dans le navigateur, modifiable sur l'écran titre ; peut aussi être passé dans l'URL : `/12/?email=…`), `epreuve=mondes-vivants`, `epreuve_num=4`, `niveau` = numéro de l'histoire, `reussi`, `session`, `debut`, `fin`, `duree_s`, `details` (chapitre, morts, temps de jeu, points, fin choisie), `source`, `origine`, `parent`, `integre`, `ts`, `sig` = fnv(`sid-quest-v2|` + paramètres triés).
Les paramètres de l'URL de l'iframe (ex. `/12/?user=abc`) sont recopiés dans la requête et gardés dans les liens « Histoire suivante » et « Toutes les histoires ». Une même tentative n'est envoyée qu'une fois.

Quitter la page ne compte pas comme un échec : une histoire dure 3 h, la partie est sauvegardée et reprend avec **Continuer**.

## Les 100 histoires

Chaque histoire a son héros, son guide, son fléau, ses ennemis, son monde, une révélation au chapitre 7 et deux fins au choix. Les débuts, révélations et fins sont écrits à la main (`src/game/stories/seeds.js`). Les textes des chapitres sont assemblés à partir de modèles (`templates.js`), donc des phrases reviennent d'une histoire à l'autre. L'histoire 1 reprend les textes écrits pour le premier jeu.

Structure d'une histoire :
- intro, puis **10 chapitres** (une île chacun) ;
- **5 à 9 reliques** par île (70 en tout), chacune avec un fragment d'histoire ;
- quand toutes les reliques sont prises, un **gardien** (boss) apparaît au portail : il bondit (cercle rouge), invoque des renforts, puis crache des salves à mi-vie ;
- au chapitre 10, le gardien final, puis le choix de fin et l'écran « Histoire suivante ».

Durée estimée : **2 h 55 à 3 h 15** selon l'histoire (calcul à partir du nombre de reliques et des combats, pas mesuré en jouant).

### Difficulté

| | Histoire 1 | Histoire 50 | Histoire 100 |
|---|---|---|---|
| Vie des ennemis | ×1 | ×2,1 | ×3,2 → ×4 |
| Dégâts des ennemis | ×1 | ×1,7 | ×2,4 → ×2,65 |
| Nombre d'ennemis | ×1 | ×1,6 | ×2,2 → ×2,55 |
| Régénération | 2,5/s | 1,75/s | 1/s |

Nouveaux ennemis : feu follet (dès l'histoire 6), cracheur (16), golem (30), ombre (48). Ils arrivent quelques histoires plus tôt dans les derniers chapitres.

### Compétences par histoire

| | Compétences en tout | Au départ | À retrouver |
|---|---|---|---|
| Histoire 1 | 5 | 0 | 5 |
| Histoire 50 | 10 | 4 | 6 |
| Histoire 100 | 16 | 8 | 8 |

Une compétence revient avec la première relique de chaque chapitre. Ensuite, une relique sur deux donne une force (vie, endurance, recharges, dégâts). Les histoires avancées donnent aussi des forces dès le départ.

## Jouer

```bash
npm install
npm run dev        # serveur local
npm run build      # dist/ + dist/1 … dist/100 (GitHub Pages)
npm run build:single  # un seul fichier HTML jouable hors ligne, dans dist-single/
```

En local (`npm run dev`) ou avec le fichier unique, une histoire s'ouvre avec `?story=12`.

## Contrôles

| Action | Clavier / souris |
|---|---|
| Se déplacer (relatif à la caméra) | ZQSD (AZERTY) ou WASD |
| Caméra | Souris (clic pour capturer) · clic droit glissé en repli |
| Zoom | Molette |
| Sauter / remonter en nageant | Espace |
| Courir / nager vite | Shift |
| Frapper | Clic gauche ou F |
| Ruée | E |
| Éclat (projectile) | Clic droit ou R |
| Onde de choc | C |
| Bouclier · Souffle · Foudre · Ralenti · Racines | 1 · 2 · 3 · 4 · 5 |
| Double / triple saut | Espace en l'air |
| Planeur | Maintenir Espace en chute |
| Frappe céleste | Frapper en l'air |
| Pas sur l'eau | Courir sur l'eau |
| Carte | M |
| Journal | J |
| Pause | Échap |

Sur mobile : joystick à gauche, glisser à droite pour la caméra, boutons d'action.

## Les 16 compétences

| | Compétence | Touche | Effet |
|---|---|---|---|
| ➶ | Ruée | E | Bond rapide, invulnérable, possible en l'air |
| ⇈ | Double saut | Espace ×2 | Second saut avec salto |
| ✦ | Éclat | Clic droit / R | Projectile, visée assistée vers l'ennemi le plus proche du viseur |
| 🜁 | Planeur | Espace maintenu | Ailes de lumière, plus de dégâts de chute |
| ◎ | Onde | C | Repousse et blesse tous les ennemis autour |
| ⛉ | Bouclier | 1 | Absorbe tous les coups pendant 4 s |
| ⤓ | Frappe céleste | Frapper en l'air | Plongeon et onde au sol |
| ✚ | Souffle | 2 | Rend 40 % de la vie en 2 s |
| ◈ | Compagnon | auto | Un esprit tire sur les ennemis proches |
| ϟ | Foudre | 3 | Éclair qui saute sur 5 ennemis |
| ⇮ | Triple saut | Espace ×3 | Troisième saut en l'air |
| ⧗ | Ralenti | 4 | Ennemis ralentis 5 s |
| ≈ | Pas sur l'eau | Courir | La surface de l'eau porte en courant |
| ❦ | Racines | 5 | Immobilise les ennemis autour 3 s |
| ⊛ | Aimant | auto | Les orbes de soin viennent à toi |
| ∞ | Second souffle | auto | Courir fatigue moins, l'endurance revient plus vite |

## Comment le monde est généré

1. **Relief** : Simplex 2D seedé, fBm + distorsion de domaine pour des côtes organiques, masque radial pour former une île, bruit « ridged » pour les crêtes de montagne.
2. **Climat** : deux autres cartes de bruit (température, humidité). La température baisse avec l'altitude et vers le nord.
3. **Biomes** : poids doux (plage, plaines, forêt, désert, toundra, marais) mélangés par sommet, puis roche sur les pentes et neige sur les sommets. Les zones se fondent au lieu de se couper net.
4. **Végétation** : grille jitterée, densité modulée par un bruit de « bosquets ». Chênes, sapins, sapins enneigés, palmiers, cactus, saules, buissons, rochers, herbe et fleurs, tous en `InstancedMesh` avec du vent dans le vertex shader.
5. **Vie** : bancs de poissons (boids) qui évitent les côtes et fuient le joueur, volées d'oiseaux.

## Déplacement

La course est pilotée pour rester fluide : passage progressif marche → course, le vecteur vitesse **tourne** au lieu de sauter d'une direction à l'autre, freinage court, demi-tour avec dérapage, ralentissement en montée. Saut avec tampon et « coyote time ».

L'animation est procédurale : la foulée suit la distance parcourue (les pieds ne glissent pas), genoux et coudes pliés, rebond différent en marche et en course, torsion bassin/épaules, inclinaison dans les virages et à l'accélération, réception amortie, foulard qui flotte. La caméra élargit le champ de vision en course, en ruée et en planeur.

## Rendu

Three.js r169 · ciel atmosphérique (`Sky`) · ombres douces qui suivent le joueur · eau en shader (vagues, reflets de Fresnel, écume sur les côtes via une texture de profondeur) · bloom · brouillard accordé à l'heure · étoiles, lune, nuages · vue sous-marine. Qualité basse / moyenne / haute dans la pause.

## Structure

```
src/
  main.js              boucle, états, routes, sauvegarde, gardiens, événements
  game/stories/        100 graines, modèles de texte, générateur, difficulté
  game/story.js        textes écrits à la main de l'histoire 1
  game/skills.js       16 compétences
  core/                noise, input, caméra 3e personne, audio synthétisé
  world/               terrain + biomes, eau, ciel, végétation
  entities/            joueur, ennemis + gardiens, reliques + portail, faune, particules
  ui/hud.js            barres, minimap, carte, messages
  ui/story-ui.js       dialogues de Lueur, cartes de mémoire, journal, barre de compétences
```

`scripts/routes.mjs` crée une page par histoire après le build.

Aucun asset externe : modèles en géométrie procédurale, sons en WebAudio.

## Licence

MIT
