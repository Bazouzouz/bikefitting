# Refonte « Atelier blueprint » : audit et plan

> **Portée de la validation.** Si tu valides, je fais une seule chose : écrire ce plan dans `docs/plans/atelier-reglage.md`, mis à jour selon tes réponses aux questions de la section 4. Aucun code n'est écrit avant ton feu vert pour l'étape 0 ou l'étape 1.
>
> Le prototype de référence est à la racine du dépôt : `Atelier de réglage selle.html`. L'étape 0 le déplace vers `docs/prototypes/fit-atelier.html`.

## Contexte
Le site fonctionne mais il est découpé en 5 onglets (Vélo, Morphologie, Taille & plan, En direct, Caméra), avec un plan SVG présenté comme une illustration parmi d'autres. Tu veux une **refonte graphique complète inspirée du prototype**, sur ces bases :
- Le **blueprint** devient le cœur de l'écran : une scène unique et persistante, animée de façon cohérente.
- Les onglets disparaissent au profit d'un **atelier unique**.
- On garde **ta palette** : gris anthracite, crème, orange.
- On reprend **la typographie du prototype** : Barlow Condensed, IBM Plex Sans et IBM Plex Mono.
- Le mode caméra est mis de côté.
- Le site s'adapte au **style de vélo**. Le style est détecté depuis le lien, ou choisi obligatoirement en saisie manuelle. On commence par le **gravel**, avec une architecture prévue pour ajouter route et VTT ensuite.

**Décisions déjà prises (tes réponses) :**
- Rendu en blueprint 2D paramétrique par style, pas en modèles 3D.
- Atelier unique sans stepper.
- Style gravel seul au départ.
- Polices du prototype.

---

## 1. Audit

### Résumé
1. **Stack** : SPA React 19 + Vite 7 + TypeScript. État dans zustand (`client/src/components/store.ts`). Un seul fichier CSS, `client/src/styles/app.css`. GSAP, ScrollTrigger et Lenis sont utilisés pour le scroll et les apparitions. Monorepo npm (`shared`, `client`, `server` Express + Playwright). Pas de SSR, pas de git, pas de CI.
2. **Parcours** : `App.tsx` déclare `STEPS` (5 onglets), et chaque étape est une page plein écran. Le blueprint (`PlanViews`) n'apparaît qu'aux étapes 3 et 4.
3. **Blueprint existant et réutilisable** :
   - `blueprint/geometry.ts` : `frameGeometry`, `cockpit`, `seatPostTop`, `toFrame`, dans le même repère que le prototype.
   - `BikeBlueprint.tsx`, `BlueprintSvg.tsx` (grille, `Dim`, `--fs` qui garde une taille de police constante).
   - `useTween.ts` (morphing rAF), `RiderOverlay.tsx`, `TopView.tsx`.
4. **Moteur de fit** (`client/src/fit/`, 24 tests vitest) : cibles de hauteur (LeMond/Hamley + angle de genou), de recul KOPS, de potence et d'entretoises, de cintre et de manivelle, avec des tolérances (3 et 5 mm). Il n'existe **aucune cible d'inclinaison de selle**.
5. **Aucune notion de style de vélo** : ni dans le contrat `shared/bike.ts`, ni dans le scraping (`server/src/parse.ts`), ni dans la saisie manuelle (`ManualBikeForm.tsx`). Le dessin est figé : cintre route, roues 622.
6. **Géométries incomplètes** : le seul vélo en base (`server/data/bikes.json`, GRVL AF) n'a ni `seatTubeLength` ni `headTubeLength`. `toFrame` applique les mêmes valeurs par défaut (540 et 120 mm) à toutes les tailles. Le recul de tige, la course des rails et l'inclinaison n'existent nulle part.
7. **Design** : thème sombre unique (`--bg #1f1e1d`, `--ink #faf9f5`, `--accent #d97757`), police Inter. Le « fantôme » cible est vert, et ce vert sera remplacé par l'orange.
8. **Dette** : deux hooks de mouvement réduit en doublon (`blueprint/useTween.ts` et `motion/useReducedMotion.ts`). Le recul est stocké en valeur absolue, sans couplage avec la hauteur. Des cotes se chevauchent (le `README` le reconnaît). Aucun test sur `blueprint/geometry.ts` et aucun test de composant.

### 1.1 Ce qui change avec la refonte
| Existant | Devenir |
|---|---|
| Stepper à 5 onglets (`App.tsx`) | Supprimé. Une scène blueprint fixe et un panneau latéral à phases |
| `BikeStep`, `RiderForm`, `FitStep` (sélection de taille) | Leur logique est conservée, mais ils sont **rhabillés** en panneaux de la colonne latérale |
| `LiveStep` (curseurs du réglage actuel, cycliste animé) | Ses curseurs sont intégrés à la phase « Réglages » (valeur actuelle de chaque réglage). Le cycliste devient une option de la scène |
| `PlanViews` (côté et dessus côte à côte) | Une seule scène avec une bascule « Côté / Dessus » |
| Caméra (`camera/`) | Code conservé, mais retiré de la navigation |
| Lenis, `useReveal`, ScrollTrigger | Sans objet avec une scène fixe : retirés (Q3) |
| Fantôme vert, police Inter | Cible orange en pointillés, polices du prototype |

### 1.2 Ce qu'on garde du prototype et ce qu'on réécrit
- **Repris** :
  - La mise en page : scène à gauche, colonne d'instructions à droite (360–380 px), empilées sous 900 px.
  - Le vocabulaire visuel : eyebrow en mono majuscules, titres Barlow condensés, cartes « readout » actuel/cible, ligne d'écart, chips d'outils, notes avec filet.
  - La caméra par viewBox, les hotspots pulsés, l'estompage du cadre.
  - La selle fantôme en pointillés, les cotes live (hauteur le long du tube, fil à plomb, angle).
  - La vue éclatée et la formule de couplage ΔH·cos(STA).
- **Réécrit** :
  - Rendu par `innerHTML` remplacé par des composants React.
  - `MODELS` remplacés par `toFrame(size)` et l'archétype du style.
  - `targets()` remplacé par `fit.*` du moteur.
  - Seuils remplacés par `fit.tolerances` et `RAIL_ADJUST` (±20).
  - Bec à 142 mm remplacé par `SADDLE_NOSE_TO_SIT` (140).
  - Palette claire du prototype remplacée par tes couleurs.
- **Abandonné** : les sélecteurs vélo et entrejambe de l'en-tête (ils viennent des phases 1 et 2) et le thème clair.

---

## 2. Direction artistique et ergonomie

### Palette (ta palette, appliquée au style blueprint)
| Rôle | Token | Valeur |
|---|---|---|
| Fond de page | `--bg` | `#1f1e1d` (anthracite) |
| Fond de scène blueprint | `--paper` | `#262624` |
| Grille fine / forte | `--bp-grid-minor`, `--bp-grid-major` | crème à 6 % / 12 % d'opacité |
| Cadre, roues, pièces | `--bp-frame` | crème atténué `#cfcabd` |
| Pièce active (zoom) | `--bp-active` | crème plein `#faf9f5` |
| Cotes et textes du plan | `--bp-dim` | `#f3f0e8` (IBM Plex Mono) |
| **Cible, fantôme, écart** | `--accent` | `#d97757` en pointillés (la cible était verte, elle passe à l'orange, comme dans le prototype) |
| Interaction (focus, hotspot) | `--accent-text` | `#e08a6c` |
| État « réglé » | `--ok-ink` | vert sobre, réservé à cet état sémantique |

Tous les contrastes visés sont d'au moins 4,5:1 pour le texte et 3:1 pour les traits. Ils sont annotés dans le CSS, comme aujourd'hui.

### Mise en page : l'atelier unique
```
┌──────────────────────────────────────────────────────────────┐
│ BIKE FIT        GRVL AF · M · gravel        ●●●○  03 / 04    │  en-tête fin, résumé, progression
├───────────────────────────────────────────┬──────────────────┤
│                                           │ eyebrow 03·TAILLE│
│   SCÈNE BLUEPRINT (collante)              │ TITRE BARLOW     │
│   grille, vélo, cotes, hotspots,          │ contenu de phase │
│   bascule Côté/Dessus · Cycliste          │ readouts, champs │
│                                           │ [Suivant →]      │
└───────────────────────────────────────────┴──────────────────┘
mobile < 900 px : scène en haut (collante, ~42vh), panneau dessous
```
- **4 phases** au lieu de 5 onglets : 1 Vélo → 2 Morphologie → 3 Taille → 4 Réglages (vue d'ensemble, puis Selle, puis Cockpit).
  - On avance avec « Suivant ».
  - Les phases déjà faites restent cliquables dans le fil de l'en-tête. C'est une progression, pas des onglets libres.
- **La scène réagit à chaque phase**, avec un seul vocabulaire d'animation :
  1. Vélo chargé : le dessin du cadre se trace (animation de `stroke-dashoffset`) et le style change le dessin (cintre gravel évasé, pneu épais).
  2. Morphologie : la silhouette du cycliste apparaît en fondu et suit les mesures.
  3. Taille : passer d'une taille à l'autre **morphe** le cadre (`useTween`), et les cotes stack et reach s'affichent.
  4. Réglages : hotspots Selle et Cockpit, puis zoom de caméra, estompage du reste et fantôme orange.
- **Selle sans onglets** : une séquence guidée en 3 temps (« 1 sur 3 · Hauteur »). Chaque temps a un bouton « Étape suivante » et un récapitulatif cochable. On peut revenir en arrière dans la séquence.
- **Réglage actuel** : dans chaque temps, la valeur actuelle s'ajuste par curseur ou par saisie numérique, ce qui reprend les curseurs de `LiveStep`.

### Système d'animation (cohérence)
| Usage | Durée | Easing | Technique |
|---|---|---|---|
| UI (boutons, panneaux, fondus) | 250 ms | `--ease` `cubic-bezier(.2,.8,.2,1)` | CSS |
| Morphing de géométrie (taille, réglage) | 450 ms | easeOutCubic | `useTween` existant |
| Caméra (zoom ou dézoom) | 850 ms | easeInOutCubic | rAF, viewBox écrit directement dans le DOM |
| Tracé du vélo | 900 ms | easeOutCubic | CSS `stroke-dashoffset` |
| « Montrer le geste » | 1500 ms | easeOutCubic | `useTween` |
| Vue éclatée | 700 ms | `--ease` | CSS `transform` |

`prefers-reduced-motion` fait sauter directement à l'état final, partout, via **un seul hook** (`motion/useReducedMotion`).

---

## 3. Plan par étapes

**Conventions transmises à chaque worker :**
- mm et degrés, origine au BB, x vers l'avant, y vers le haut, y inversé uniquement au rendu.
- Textes et commentaires en français.
- On ne réécrit aucune formule de fit : on passe par `useFit()` et `fitAdapter`.
- Les contrats `shared/bike.ts` et `fit/types.ts` ne sont modifiés que là où le plan le dit.
- Pas de commit.
- Le `verifier` passe après chaque étape (`npm test`, `npm run typecheck`, relecture du diff, captures).

**Ordre et parallélisme :** 0, puis 1 en parallèle avec 2, puis 3 en parallèle avec 4, puis 5 en parallèle avec 7b, puis 6, puis 7a, puis 8, puis 9.

### Étape 0 : préparation (haiku-cyan)
- **Objectif** : déplacer le prototype vers `docs/prototypes/fit-atelier.html` et créer `scripts/shot.mjs`.
- **Script de capture** :
  - Il utilise le Playwright déjà installé à la racine, avec Chromium et `ignoreHTTPSErrors`.
  - Viewports 390×844 et 1280×800, avec `reducedMotion` activé puis désactivé.
  - Il passe par la saisie manuelle, donc sans serveur.
- **Pourquoi haiku** : travail mécanique, sans recherche.
- **Acceptation** : 2 PNG du site actuel sont produits.

### Étape 1 : tokens, typographie et composants de base (sonnet-blue), en parallèle avec l'étape 2
- **Fichiers** :
  - `client/index.html` : polices Barlow Condensed, IBM Plex Sans et IBM Plex Mono.
  - `client/src/styles/tokens.css` (nouveau) : palette de la section 2, `--f-display`, `--f-body`, `--f-mono`, `--ease`, durées.
  - `client/src/styles/ui.css` (nouveau) : `.btn`, `.field`, `.chip`, `.eyebrow`, `.readout`, `.delta`, `.note`, `.slider`, `.progress`.
  - `app.css` : purgé de ce qui est déplacé.
- **Pourquoi sonnet** : CSS courant, bien cadré par le prototype.
- **Acceptation** :
  - Les écrans actuels s'affichent dans le nouveau style, sans régression fonctionnelle.
  - Contrastes vérifiés et annotés.
  - Pas de débordement horizontal à 390 px.

### Étape 2 : style de vélo, archétype gravel et détection (opus-red, effort medium), en parallèle avec l'étape 1
- **Recherche préalable** (agent `researcher`, lecture seule) :
  - Relever la géométrie de 5 à 6 gravels courants, taille par taille, sur GeometryGeeks et les sites des constructeurs. Pistes : Canyon Grizl, Specialized Diverge, Cannondale Topstone, Giant Revolt, Trek Checkpoint, Van Rysel GRVL.
  - En déduire un archétype gravel : médianes de `seatTubeLength`, `headTubeLength`, `bbDrop`, `forkOffset`, `chainstay`, pneu, en fonction du stack. Les sources sont citées dans le fichier.
- **Fichiers** :
  - `shared/bike.ts` : `export type BikeStyle = 'gravel' | 'road' | 'mtb'` et `Bike.style?: BikeStyle` (facultatif, pour ne pas casser les données existantes).
  - `client/src/bike-styles/` (nouveau) :
    - `index.ts` : registre et `styleOf(bike)`.
    - `gravel.ts` : valeurs par défaut de cadre fonction du stack, traits de dessin (cintre évasé, flare, pneu 40–45 mm, roue 622), plages des curseurs.
    - `styles.test.ts`.
  - `blueprint/geometry.ts` : `toFrame(size, style)` prend les valeurs par défaut de l'archétype au lieu des constantes globales.
  - `server/src/parse.ts` :
    - `detectStyle(texte)` cherche des mots-clés dans le nom, la catégorie JSON-LD, le fil d'Ariane et l'URL (gravel, route/road, VTT/MTB…).
    - Les styles non pris en charge renvoient « gravel » avec un avertissement.
    - Tests dans `parse.test.ts`.
  - `server/src/lookup.ts` : renseigne `style` et ajoute un avertissement si le style est deviné.
  - `server/data/bikes.json` : `style: "gravel"`, plus `seatTubeLength` et `headTubeLength` du GRVL marqués `unverified`.
  - `ManualBikeForm.tsx` : sélecteur **« Style de vélo » obligatoire**, placé en premier. Choisir un style préremplit les valeurs par défaut de l'archétype. Les styles non encore disponibles sont visibles mais désactivés (« bientôt »).
- **Pourquoi opus** : modification de contrat partagé, données de référence, impact client et serveur.
- **Acceptation** :
  - `detectStyle` reconnaît au moins 10 libellés réels (FR et EN).
  - Le GRVL a un `htl` différent pour chaque taille.
  - La saisie manuelle refuse l'envoi sans style.
  - Les 24 tests du moteur passent inchangés.

### Étape 3 : coque de l'atelier unique (opus-orange, effort medium), en parallèle avec l'étape 4
- **Fichiers** :
  - Nouveaux : `client/src/workspace/Workspace.tsx`, `Rail.tsx`, `PhaseHeader.tsx`, `phases/BikePhase.tsx`, `RiderPhase.tsx`, `SizePhase.tsx`, `TunePhase.tsx`.
  - `store.ts` : `step` est remplacé par `phase: 'bike' | 'rider' | 'size' | 'tune'` et `stageView: 'side' | 'top'`.
  - `App.tsx` : simplifié.
  - Retirés de l'interface : `useSmoothScroll`, `useReveal` et les attributs `data-reveal` (selon Q3).
- **Choix** :
  - On réutilise la logique de `BikeStep`, `RiderForm` et du sélecteur de taille de `FitStep`, déplacée dans les panneaux.
  - La scène reste montée d'une phase à l'autre : c'est elle qui donne la continuité.
  - Le panneau porte `aria-live="polite"`. Le titre de phase reçoit le focus quand la phase change.
- **Acceptation** :
  - On fait tout le parcours sans recharger la scène.
  - « Suivant » n'est actif que lorsque la phase est valide.
  - Les phases déjà faites restent accessibles.
  - Mobile : scène collante et panneau dessous.

### Étape 4 : moteur de rendu blueprint par style (opus-red, effort medium), en parallèle avec l'étape 3
- **Fichiers** :
  - `blueprint/BikeBlueprint.tsx` : découpé en `FrameLayer` (mémoïsé), `SaddleLayer` et `CockpitLayer`. Les traits de dessin dépendent du style (cintre évasé gravel, épaisseur de pneu).
  - `BlueprintSvg.tsx` : prop `viewBox` facultative qui garde le ratio des `bounds`. Grille aux nouveaux tokens.
  - `Stage.tsx` (nouveau) : scène unique, avec les bascules Côté/Dessus et Cycliste.
  - `client/src/blueprint/geometry.test.ts` (nouveau) : tests sur des valeurs connues.
  - `useTween.ts` : réexporte le hook de mouvement réduit unique.
- **Choix** :
  - SVG avec tween rAF. Pas de bibliothèque d'animation.
  - Tracé du vélo en CSS à l'arrivée d'un nouveau vélo.
  - Cible en pointillés orange.
  - Cotes en IBM Plex Mono, placées pour ne pas se chevaucher : décalages calculés par zone et non fixes.
- **Acceptation** :
  - Les points du cadre testés : axes de roues, haut et bas du tube de direction, haut du tube de selle.
  - Le changement de taille morphe en 450 ms.
  - Les cotes ne se chevauchent pas sur les 5 tailles du GRVL (contrôle des boîtes englobantes dans le script de capture).
  - Le ratio du `<svg>` est constant.

### Étape 5 : caméra, hotspots et estompage (opus-orange, effort medium), en parallèle avec l'étape 7b
- **Fichiers** : `workspace/useStageCamera.ts`, `Stage.tsx`, `styles/stage.css`.
- **Choix** :
  - viewBox interpolé en rAF et écrit directement dans le DOM, sans `setState` par frame.
  - Animation interruptible.
  - Hotspots `<g role="button" tabIndex=0>` avec une zone tactile d'au moins 44 px.
  - Échap ramène à la vue d'ensemble et rend le focus au hotspot.
- **Acceptation** :
  - Hauteur DOM du `<svg>` constante pendant le zoom.
  - Textes de taille constante à l'écran.
  - Navigation complète au clavier.
  - Avec mouvement réduit, saut sans frame intermédiaire.

### Étape 6 : selle guidée en 3 temps (opus-red, effort medium)
- **Fichiers** :
  - Nouveaux : `client/src/atelier/saddle.ts` (pur) et `saddle.test.ts`, `atelier/SaddleGuide.tsx`, `atelier/SaddleDims.tsx`.
- **Choix** :
  - Modèle mécanique : H, position sur les rails, inclinaison, recul de tige (0 par défaut). La position sur les rails est déduite du recul actuel.
  - Cibles : `fit.saddleHeight` et `fit.saddleSetback` (avec la formule affichée). Cible d'inclinaison selon Q4.
  - « Réglé » est jugé avec `fit.tolerances`.
  - Couplage : ΔH·cos(STA).
  - Note de sortie de rails, en reprenant l'avertissement du moteur.
  - Simulation locale avec « Enregistrer comme réglage actuel » (Q5).
- **Acceptation** :
  - Les valeurs actuelle, cible et écart sont identiques à `DeltaTable` et au moteur. Un test pur le vérifie.
  - Un écart de hauteur ΔH = +10 mm déplace le recul de +2,84 mm (GRVL, STA 73,5°).
  - Le fantôme coïncide avec `fit.saddlePosition`.

### Étape 7 : « Montrer le geste » et vue éclatée
- **7a, geste** (sonnet-green, après l'étape 6, fichier `SaddleGuide.tsx`) :
  - Tween de 1,5 s vers la cible, sans double déclenchement.
  - Le focus reste sur le bouton.
- **7b, vue éclatée en axonométrie 3/4** (sonnet-yellow, en parallèle avec l'étape 5) : mini-moteur `iso.ts`, composant générique `Exploded.tsx` pour la selle et le cockpit, écartement le long de l'axe de la tige, pièce clé en orange, rotation ±40° au glisser, au clavier et par boutons, mouvement réduit sans animation. Faite.

### Étape 8 : cockpit (opus-orange, effort medium)
- **Fichiers** : `atelier/cockpit.ts` (pur) et ses tests, `CockpitGuide.tsx`, `CockpitDims.tsx`.
- **Contenu** : entretoises au-dessus ou en dessous, potence (à remplacer, par pas de `STEM_LENGTHS` et `STEM_ANGLES`), cintre évasé, cote du drop selle → cocottes.
- **Acceptation** : les cocottes fantômes sont à moins de 1 mm de `cockpit(g, setupFromFit(fit)).hands`, et les chiffres sont identiques au moteur.

### Étape 9 : finitions (sonnet-blue ; opus-purple en effort high seulement si un bug de performance ou de focus résiste)
- **Mobile** : 390 et 768 px.
- **Clavier et lecteur d'écran.**
- **Mouvement réduit** : de bout en bout.
- **Performance** : plus de 50 fps en manipulant un curseur avec CPU ×4. Seule la couche active est re-rendue.
- **Docs** : mise à jour de `docs/ui.md`, `docs/architecture.md` (style, phases) et `docs/fitting.md` (inclinaison). Note de nettoyage de `camera/`, laissé en place.
- **Accessibilité** : contrôle axe-core si Q6 est accepté.

### Vérification
- **Après chaque étape** :
  - `npm test` et `npm run typecheck`.
  - `node scripts/shot.mjs` (avec `npm run dev`) : captures à 390 et 1280 px, mouvement réduit activé et désactivé, pour chaque état (phase 1 à 4, zoom selle et ses 3 temps, éclaté, cockpit).
  - Je regarde chaque capture avant de passer à l'étape suivante.
- **Contrôles DOM dans le script** :
  - Hauteur du `<svg>` stable pendant le zoom.
  - Valeurs du panneau égales au moteur.
  - Pas de chevauchement des cotes.
- **Fin** : passage du `verifier`, puis compte rendu au format Fait / Bugs trouvés et résolus / Reste à faire.

---

## 4. Questions restantes

1. **Archétypes au-delà du gravel.** Je prévois le type `BikeStyle` avec route et VTT, mais seul le gravel est implémenté. Un lien route ou VTT donne un dessin gravel accompagné d'un avertissement.
   - *Recommandation : oui.* Route et VTT feront chacun un lot dédié, avec fourche suspendue, cintre plat et 29".
2. **Style non détecté depuis un lien.**
   - *Recommandation : demander le style à l'utilisateur dans le panneau* (choix rapide), plutôt que de supposer gravel en silence.
3. **Lenis, révélations au scroll, GSAP.** Avec une scène fixe, ils ne servent plus.
   - *Recommandation : retirer Lenis et `useReveal`, puis désinstaller `gsap` et `lenis` s'ils ne sont plus importés.*
4. **Cible d'inclinaison de la selle.** Le moteur n'en propose aucune.
   - *Recommandation : 0° (selle de niveau), plage de −2° à 0°, documentée dans `docs/fitting.md`.*
5. **Simulation et réglage actuel.**
   - *Recommandation : simulation locale, avec un bouton « Enregistrer comme réglage actuel »* qui écrit la hauteur et le recul **couplé** dans `overrides`.
6. **Outillage de test.**
   - *Recommandation : ajouter `jsdom` + `@testing-library/react` et `@axe-core/playwright` en devDependencies du client.*
7. **Couples de serrage.**
   - *Recommandation : valeurs génériques avec la mention « lire la valeur gravée ».*

## Après validation
1. Écrire ce plan dans `docs/plans/atelier-reglage.md`, mis à jour selon tes réponses. C'est la seule action.
2. Attendre ton feu vert pour lancer l'étape 0.
