# Interface

Code : `client/src/App.tsx`, `workspace/` (atelier), `atelier/` (guides), `blueprint/` (rendu SVG),
`components/` (formulaires, tableau d'écarts), `styles/`. L'état (vélo, morphologie, réglages,
phase, caméra de la scène) est dans le store zustand (`components/store.ts`).

## Atelier unique en 4 phases
Un seul écran (`workspace/Workspace.tsx`) : en-tête fin avec résumé et progression, **scène
blueprint collante** à gauche (montée une fois pour tout le parcours), **panneau de phase** à
droite (`Rail.tsx`, 380 px). Sous 900 px : scène en haut (~42 vh, collante), panneau dessous.
On avance avec « Suivant » ; les phases déjà atteintes restent cliquables dans le fil de
l'en-tête (progression, pas des onglets libres). Changer de phase met le focus sur le titre du
panneau (`data-phase-title`) et ramène la caméra à la vue d'ensemble.
1. **Vélo** : coller une URL constructeur, « Utiliser le GRVL AF », ou saisie manuelle (style de
   vélo obligatoire). « Suivant » reste désactivé, avec sa raison affichée, tant qu'il n'y a pas
   de vélo. Les avertissements de la récupération sont affichés.
2. **Morphologie** : taille, entrejambe, pointure, torse, bras, épaules, souplesse, pratique.
3. **Taille** : taille de cadre recommandée avec score par taille, choix manuel, cibles de
   réglage expliquées. Passer d'une taille à l'autre fait **morpher** le cadre.
4. **Réglages** : vue d'ensemble (curseurs du réglage actuel, tableau des écarts actuel → cible),
   puis guides **selle** et **cockpit** via les hotspots de la scène.

La caméra du téléphone n'est plus dans la navigation (code de `client/src/camera/` conservé,
voir [camera](camera.md)).

## Scène blueprint (`workspace/Stage.tsx`)
- Une scène SVG : grille, cadre, roues, selle, potence, cocottes, cycliste schématique (option
  « Cycliste »), bascule **Côté / Dessus**. Le dessin vient de `blueprint/` et de l'archétype du
  style de vélo (`bike-styles/`, gravel seul : cintre évasé, pneus larges ; route et VTT sont
  listés « bientôt » et retombent sur le gravel).
- Réaction par phase : le cadre se trace au choix du vélo, la silhouette apparaît avec la
  morphologie, les cotes stack/reach avec la taille, le fantôme orange et les hotspots avec les
  réglages.
- **Fantôme** : le vélo réglé aujourd'hui est en gris/crème ; la cible est en **orange
  pointillé**, avec ses cotes (deltas vers les réglages d'origine). Le vert est réservé à
  l'état « réglé ».

## Caméra et hotspots
- `useStageCamera.ts` : la caméra est un `viewBox` SVG animé (850 ms, easeInOutCubic) écrit
  directement dans le DOM, sans rendu React par frame. Largeur de zoom visée : 640 mm.
- Phase Réglages, vue d'ensemble : deux **hotspots** « Selle » et « Cockpit » (pastille pulsée,
  zone tactile de 48 px, atteignables au clavier). Un clic zoome (store : `focus` = `saddle` ou
  `cockpit`), estompe le reste du cadre et affiche « ← Vue d'ensemble » (Échap aussi).
- Focus clavier : vers « Vue d'ensemble » au zoom, rendu au hotspot d'origine au dézoom. Pendant
  un dézoom, les hotspots sont inertes (hors de l'arbre d'accessibilité) jusqu'au retour.

## Guides selle et cockpit (`atelier/`)
Même gabarit : récapitulatif cochable des 3 temps, titre « 1 sur 3 · … », lecture
actuel / cible / écart, consigne gestuelle avec outils, curseur + saisie numérique (appliquée à
la validation), « Montrer le geste », « Vue éclatée », « Étape suivante », « Enregistrer comme
réglage actuel ». La simulation est locale au guide et publiée au store
(`saddlePreview`, `cockpitPreview`) pour que la scène dessine la pièce simulée et ses cotes.
Valeurs et écarts viennent du moteur et de `buildRows`, jamais recalculés.
- **Selle** (`saddle.ts`, `SaddleGuide.tsx`) : Hauteur → Recul → Inclinaison. Couplage hauteur →
  recul, course des rails ±20 mm. Voir [fitting](fitting.md).
- **Cockpit** (`cockpit.ts`, `CockpitGuide.tsx`) : Entretoises → Potence → Cintre, plus le drop
  selle → cocottes comme cote de contrôle. Voir [fitting](fitting.md).
- **Montrer le geste** : anime la valeur du temps vers sa cible (1500 ms, `useTween`) ; le bouton
  est `aria-disabled` (il garde le focus) quand il n'y a rien à montrer.

## Vues éclatées
`atelier/Exploded.tsx` avec `SaddleExploded` et `CockpitExploded` : vue **axonométrique 3/4**
(moteur pur `iso.ts` : projection orthographique par azimut et élévation, faces à normale
sortante, rendu « peintre », arêtes cachées en pointillés). Pièce clé du temps en orange, les
autres estompées ; boutons de rotation (azimut affiché). Ouverture 700 ms, pièces décalées de
40 ms. Montée fermée puis ouverte à la frame suivante, démontée après la fermeture. Banc d'essai :
`client/bench-exploded.html` (`atelier/bench.tsx`).

## Thème et typographie
Palette **anthracite** (`--bg #1f1e1d`, scène `--paper #262624`), texte **crème** (`--ink
#faf9f5`), accent **orange** (`--accent #d97757`, texte d'interaction `--accent-text #e08a6c`).
Le vert (`--ok-*`) est réservé à « réglé ». Les jetons sont dans `styles/tokens.css` (contrastes
annotés : texte ≥ 4,5:1, traits ≥ 3:1) ; composants de base dans `ui.css` (`.btn`, `.field`,
`.chip`, `.eyebrow`, `.readout`, `.delta`, `.note`, `.slider`) ; mise en page dans
`workspace.css`, `stage.css`, `saddle.css`, `cockpit.css`, `exploded.css`.
Polices : **Barlow Condensed** (titres, majuscules), **IBM Plex Sans** (texte),
**IBM Plex Mono** (eyebrows, cotes, chiffres) : `--f-display`, `--f-body`, `--f-mono`.

## Animations
Un seul vocabulaire (`--ease: cubic-bezier(.2,.8,.2,1)`) :

| Usage | Durée | Technique |
|---|---|---|
| UI (boutons, panneaux, fondus) | 250 ms | CSS, `--ease` |
| Morphing de géométrie (taille, réglage) | 450 ms | `blueprint/useTween.ts`, easeOutCubic |
| Caméra (zoom, dézoom) | 850 ms | rAF, `viewBox`, easeInOutCubic |
| Tracé du vélo | 900 ms | CSS `stroke-dashoffset` |
| Montrer le geste | 1500 ms | `useTween` |
| Vue éclatée | 700 ms | CSS `transform`, `--ease` |

**Mouvement réduit** : un seul hook, `motion/useReducedMotion.ts` (`prefers-reduced-motion`,
suivi en direct). Il fait sauter chaque animation à son état final (caméra, tweens, tracé, éclaté
monté ouvert, geste appliqué d'un coup). Le défilement doux et GSAP/Lenis ont été retirés.

## Accessibilité
- **Une seule région `role="status"`** (`aria-live="polite"`, `.sr-only`) dans `Rail.tsx`,
  alimentée par `AnnounceContext` / `useAnnounce()` (`PhasePanel.tsx`). Elle annonce les
  événements utiles : changement de phase, de temps, « Réglé » au passage à l'état réglé (une
  fois), « Réglage enregistré », « Selle à la cible ». **Jamais** les mouvements de curseur.
  Les valeurs des curseurs sont des `<span class="slider-val" aria-hidden>` (jamais `<output>`, rôle
  implicite `status`) ; l'`input range` porte `aria-valuetext`. Les tests de composants comptent
  `[role="status"], output, [aria-live]` : un seul élément dans tout le panneau.
- Focus déplacé sur le titre à chaque changement de phase ou de temps ; Échap annule une saisie
  numérique sans fermer le zoom. Échap avec la vue éclatée ouverte quitte tout le zoom (retour à la
  vue d'ensemble, éclaté compris) : il ne referme pas l'éclaté d'abord, le bouton « Fermer l'éclaté »
  s'en charge.
- Groupe Côté / Dessus (`role="radiogroup"`) : flèches ←/→ (et ↑/↓) changent la vue et déplacent le
  focus ; tabindex itinérant, un seul radio atteignable à Tab.
- Contrôle automatisé : `node scripts/a11y.mjs` (axe-core, voir README).

## Principe
L'UI ne calcule pas : elle appelle le moteur via `useFit` et `fitAdapter`, puis affiche
`FitResult` (voir [fitting](fitting.md)).
