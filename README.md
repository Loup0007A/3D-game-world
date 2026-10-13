# Mondes Vivants

Jeu d'aventure 3D dans le navigateur. Chaque île naît du **bruit fractal** : relief, climat, biomes, forêts, poissons, tout vient d'une seule graine.

> Un vieil homme s'est endormi, et ses rêves sont devenus des îles. Il oublie peu à peu, et la Brume ronge ses souvenirs. Tu es **Ilo**, réveillée devant une arche de pierre avec un bâton dont le cristal parle : **Lueur**. Retrouve les éclats de mémoire du Rêveur, île après île, et découvre qui tu es.

**▶ Jouer en ligne : https://loup0007a.github.io/3D-game-world/**

| | |
|---|---|
| ![Matin](docs/matin.png) | ![Slimes](docs/slimes.png) |
| ![Nage au crépuscule](docs/nage.png) | ![Carte](docs/carte.png) |

## Jouer

```bash
npm install
npm run dev        # serveur local
npm run build      # build dans dist/ (GitHub Pages)
npm run build:single  # un seul fichier HTML jouable hors ligne, dans dist-single/
```

Une graine se partage par l'URL : `?seed=424242`.

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
| Double saut | Espace en l'air |
| Planeur | Maintenir Espace en chute |
| Carte | M |
| Journal | J |
| Pause | Échap |

Sur mobile : joystick à gauche, glisser à droite pour la caméra, boutons d'action.

## Histoire

Cinq chapitres, un par île : **L'Éveil**, **Les Échos**, **La Brume**, **Le Nom**, **Le Réveil**. Chaque éclat de mémoire raconte un fragment de la vie du Rêveur (34 en tout), et Lueur commente ton voyage. À la fin, un choix : réveiller le Rêveur, ou continuer à rêver. Le second ouvre un mode sans fin.

La partie se sauvegarde toute seule (navigateur) : bouton **Continuer** sur l'écran titre. Le journal (J) garde les souvenirs trouvés et les compétences.

## Compétences

Elles reviennent avec les souvenirs du chapitre I, une par éclat :

| | Compétence | Effet |
|---|---|---|
| ➶ | Ruée | Bond rapide, invulnérable, possible en l'air |
| ⇈ | Double saut | Second saut avec salto |
| ✦ | Éclat | Projectile de cristal, visée assistée vers l'Écho le plus proche du viseur |
| 🜁 | Planeur | Ailes de lumière, plus de dégâts de chute |
| ◎ | Onde | Onde de choc qui repousse et blesse tous les Échos autour |

Ensuite, chaque éclat donne une force : vie max, endurance max, recharges, dégâts de l'Éclat, rayon de l'Onde.

## Gameplay

- **Éclats de mémoire** : 5 au premier monde, un de plus par monde (max 8). Une flèche en haut de l'écran pointe le plus proche. Chacun rend 30 PV.
- **Gardiens** : approcher une relique réveille des slimes qui la protègent.
- **Portail** : quand toutes les reliques sont prises, le portail du point de départ s'ouvre vers un nouveau monde plus dur.
- **Échos (slimes)** : la nuit partout, le jour seulement dans les marais. Vert, violet (marais), givré (neige, montagne), roi rouge (rare, costaud). Ils lâchent parfois un orbe de soin.
- **Endurance** : courir, sauter et nager la vident. Épuisé dans l'eau profonde = noyade lente.
- **Chute** : tomber de haut fait mal.
- **Cycle jour/nuit** : la lanterne du bâton s'allume la nuit. Vitesse du temps réglable dans la pause.
- **Score** : relique 100, slime 10 à 40, portail 250 × monde. Le record reste dans le navigateur.

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
  main.js              boucle, états, histoire, sauvegarde, événements
  game/story.js        textes : intro, 5 chapitres, éclats, fin
  game/skills.js       compétences, projectiles, onde de choc
  core/                noise, input, caméra 3e personne, audio synthétisé
  world/               terrain + biomes, eau, ciel, végétation
  entities/            joueur, slimes, reliques + portail, faune, particules
  ui/hud.js            barres, minimap, carte, messages
  ui/story-ui.js       dialogues de Lueur, cartes de mémoire, journal, barre de compétences
```

Aucun asset externe : modèles en géométrie procédurale, sons en WebAudio.

## Licence

MIT
