# Mondes Vivants

Jeu d'exploration 3D dans le navigateur. Chaque île naît du **bruit fractal** : relief, climat, biomes, forêts, poissons, tout vient d'une seule graine.

Trouve les reliques. Ouvre le portail. Passe au monde suivant. Survis aux slimes la nuit.

**▶ Jouer en ligne : https://loup0007a.github.io/3d-game-world/**

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
| Carte | M |
| Pause | Échap |

Sur mobile : joystick à gauche, glisser à droite pour la caméra, boutons d'action.

## Gameplay

- **Reliques** : 5 au premier monde, une de plus par monde (max 8). Une flèche en haut de l'écran pointe la plus proche. Chaque relique rend 30 PV.
- **Gardiens** : approcher une relique réveille des slimes qui la protègent.
- **Portail** : quand toutes les reliques sont prises, le portail du point de départ s'ouvre vers un nouveau monde plus dur.
- **Slimes** : la nuit partout, le jour seulement dans les marais. Vert, violet (marais), givré (neige, montagne), roi rouge (rare, costaud). Ils lâchent parfois un orbe de soin.
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

## Rendu

Three.js r169 · ciel atmosphérique (`Sky`) · ombres douces qui suivent le joueur · eau en shader (vagues, reflets de Fresnel, écume sur les côtes via une texture de profondeur) · bloom · brouillard accordé à l'heure · étoiles, lune, nuages · vue sous-marine. Qualité basse / moyenne / haute dans la pause.

## Structure

```
src/
  main.js              boucle, états, événements de jeu
  core/                noise, input, caméra 3e personne, audio synthétisé
  world/               terrain + biomes, eau, ciel, végétation
  entities/            joueur, slimes, reliques + portail, faune, particules
  ui/hud.js            barres, minimap, carte, messages
```

Aucun asset externe : modèles en géométrie procédurale, sons en WebAudio.

## Licence

MIT
