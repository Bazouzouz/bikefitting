# Architecture

## Monorepo (npm workspaces)
- `shared/` : types partagés, notamment `bike.ts` (contrat client/serveur).
- `server/` : API Express (`server/src`), base locale `server/data/bikes.json`, cache disque
  `server/cache`. Voir [scraping](scraping.md).
- `client/` : React 19 + Vite + zustand.
  - `src/fit/` : moteur de fitting pur (sans React), testé par vitest. Voir [fitting](fitting.md).
  - `src/blueprint/` : rendu SVG (vue de côté, vue de dessus).
  - `src/components/` : formulaires, tableau d'écarts, adaptateur du moteur (`useFit`,
    `fitAdapter`) et store zustand (`store.ts`). Voir [ui](ui.md).
  - `src/workspace/` : atelier unique en 4 phases (vélo, morphologie, taille, réglages) :
    `Workspace` (mise en page), `Stage` (scène blueprint, hotspots), `useStageCamera` (caméra
    `viewBox`), `Rail` (panneau de phase, région `role=status` unique), `phases/`.
  - `src/atelier/` : guides selle et cockpit en 3 temps. Modèles purs testés (`saddle.ts`,
    `cockpit.ts`), composants (`SaddleGuide`, `CockpitGuide`, `*Dims` : cotes de la scène), vues
    éclatées 3/4 (`Exploded`, `SaddleExploded`, `CockpitExploded`, moteur `iso.ts`,
    `saddleParts.ts` / `cockpitParts.ts`), banc d'essai `bench.tsx`.
  - `src/bike-styles/` : archétypes géométriques par style de vélo (gravel seul, route et VTT
    « bientôt »).
  - `src/styles/` : `tokens.css` (jetons), `ui.css` (composants), mise en page par zone.
  - `src/motion/` : préférence « mouvement réduit » seule (`useReducedMotion.ts`). Défilement
    doux et animations GSAP retirés. Voir [ui](ui.md).
  - `src/camera/` : mode caméra, **hors navigation** (code conservé). Voir [camera](camera.md).
  - `src/test/` : fixtures des tests de composants.

## Store (zustand, `components/store.ts`)
- Parcours : `phase` (`bike` | `rider` | `size` | `tune`), `reached` (phase la plus avancée),
  `stageView` (`side` | `top`), `showRider`.
- Caméra : `focus` (`overview` | `saddle` | `cockpit`). Changer de phase, de vue ou de vélo le
  ramène à `overview` dans le même rendu (saut, sans dézoom animé).
- Données : `bike`, `rider`, `sizeLabel` (null = recommandée), `overrides` (réglages actuels
  modifiés), `saddleTilt` (inclinaison de selle, hors contrat du moteur).
- Simulations des guides : `saddlePreview` et `cockpitPreview` (null hors parcours), écrites par
  le guide, lues par la scène pour dessiner la pièce simulée et ses cotes.

## Tests
- Vitest en environnement **node** par défaut (moteur, modèles de `atelier/`, serveur).
- Tests de composants : fichiers `*.dom.test.tsx` avec l'en-tête `// @vitest-environment jsdom`
  (jsdom et Testing Library en devDependencies du client).
- Accessibilité et captures : `scripts/a11y.mjs` (axe-core), `scripts/shot.mjs` (Playwright).

## Flux de données
1. L'utilisateur colle une URL (ou saisit un vélo à la main) : le client appelle
   `POST /api/bike/lookup` ; `GET /api/bikes` liste la base locale ; `GET /api/health` sert de sonde.
2. Le serveur renvoie un `BikeLookupResponse` : `bike`, `source` (`jsonld`, `chromium`,
   `database`, `manual`) et `warnings` (champs absents ou non vérifiés).
3. Le store garde vélo, morphologie et réglages actuels. Un adaptateur (`fitAdapter.ts`)
   convertit ces données en entrées du moteur.
4. Le moteur renvoie un `FitResult` ; l'UI l'affiche (tableaux d'écarts, scène blueprint, guides).
5. Le client ne dépend du serveur que pour récupérer un vélo : le calcul est local.

## Sécurité réseau
- L'API écoute sur `127.0.0.1` par défaut (`HOST`, `PORT` surchargent). En dev, Vite la joint
  par proxy `/api`, y compris avec `npm run dev:lan` : l'API n'est pas exposée au réseau.
- CORS limité aux origines `localhost`, `127.0.0.1` et `::1` (`security.ts`).
- Le lookup n'accepte que des URL http(s) de marchands en liste blanche ([scraping](scraping.md)).

## Contrats
- `shared/bike.ts` : `Bike` (marque, modèle, `sizes[]`, roues), `BikeSize` (stack, reach,
  angles, empattement, composants d'origine…), `BikeLookupResponse`. Les champs facultatifs
  peuvent manquer : le moteur doit tolérer leur absence.
- `client/src/fit/types.ts` : entrées (`RiderMeasurements`, `CurrentSetup`, `Practice`,
  `Flexibility`) et sortie `FitResult`. Chaque cible est un `FitTarget` : valeur, plage tolérée
  et explication (formule + source) affichable à l'utilisateur.
- Ces deux fichiers sont des contrats : les modifier impose de mettre à jour client et serveur.

## Conventions
- Unités : millimètres et degrés partout (sauf saisies du cycliste en cm, converties par le moteur).
- Repère : origine = axe de pédalier (BB), x vers l'avant, y vers le haut. Le rendu SVG
  inverse y à l'affichage uniquement.
- Angle de potence : positif = relevé. Recul de selle : positif = pointe derrière le BB.
- Le code pur (fit, modèles de `atelier/`, `iso.ts`, géométrie caméra) est séparé de l'UI pour rester testable.
