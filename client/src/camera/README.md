# Mode caméra (prototype)

Repère : mm et degrés. Origine = axe de pédalier (BB), x vers l'avant, y vers le haut.

## Deux vues, deux captures

On filme le **vélo de profil** et le **cycliste de face**. Une seule caméra ne voit
pas les deux à la fois : l'app propose deux étapes successives (onglets
« 1. Vélo de profil » puis « 2. Cycliste de face »), chacune avec un guide de cadrage
pointillé et une consigne affichée (« Place le vélo de PROFIL… », « Place-toi de FACE… »).
Pour voir les deux en même temps, il faudrait deux appareils (deux téléphones, ou PC + téléphone),
ce qui n'est pas géré.

### 1. Profil (vélo) : selle et cocottes
- Calibration v1 par **2 marqueurs ArUco** (dictionnaire `ARUCO_MIP_36h12`, id 0 et id 1)
  imprimables depuis l'onglet « Marqueurs à imprimer » (SVG A4 en mm ou PNG 300 dpi, avec trait de
  contrôle de 100 mm) :
  - id 0 : centre du carré sur l'**axe de pédalier** → origine ;
  - id 1 : carton découpé au pointillé, bord supérieur **sous le bec de selle** → position actuelle
    du bec (décalage par défaut = marge blanche imprimée `quietZoneMm`, 12 mm pour un carré de 80 mm) ;
  - échelle mm/px = moyenne des 4 côtés des 2 marqueurs ; orientation = « caméra de niveau »
    (par défaut) ou inclinaison moyenne des marqueurs ; sens du vélo auto (selle derrière le BB) ou forcé.
- **Fallback manuel** : 2 clics sur une longueur connue + distance (pré-remplie avec l'empattement
  `bike.wheelbase` s'il est connu ; diamètre de roue possible en référence « verticale »), puis clic
  sur l'axe BB et sur le bec de selle (à repointer après chaque réglage, pas de suivi ; « Figer
  l'image » aide à cliquer).
- Fantôme sur canvas : selle cible à `fit.saddlePosition`, axe de tige de selle, cocottes cible
  à `fit.hands`. Couleur : vert si dans `fit.tolerances` (±3 mm hauteur, ±5 mm recul), orange
  jusqu'à 3 × tolérance, rouge au-delà ; flèche du bec actuel vers la cible et messages
  (« Monte la selle de 12 mm », « Avance la selle de 5 mm »).
- L'écart est décomposé en **mouvement le long de la tige** (angle `bike.seatTubeAngle`) et
  **mouvement horizontal sur les rails** : monter la selle la recule aussi, c'est pris en compte.
- Anti-scintillement : EMA (τ = 250 ms) sur la calibration et le bec + hystérésis de 0,5 mm pour
  quitter le vert ; marqueur conservé 700 ms s'il disparaît.

### 2. Face (cycliste)
Pas de détection de pose : l'utilisateur clique les extrémités du cintre (échelle = largeur du cintre
monté), les épaules, puis genou + cale de chaque côté (pédale en bas). Résultats : genou à l'aplomb de
la cale (±15 mm), largeur d'épaules vs cintre recommandé (±20 mm), symétrie épaules/genoux par rapport
à l'axe du vélo (±15 mm). Ces tolérances sont provisoires (`FRONT_TOLERANCES` dans `front.ts`).

## Code
- `geometry.ts` (mm↔px, calibrations, écart selle), `status.ts` (couleur/état, messages, lissage),
  `front.ts` (vue de face), `errors.ts` (messages caméra en français), `markers.ts` (SVG imprimable) :
  **pur**, testé (`*.test.ts`).
- `aruco.ts` : seul point d'entrée vers `js-aruco2` (chargé à la demande ; l'import CommonJS
  `this.AR = AR` est vérifié en dev/esbuild, build/Rollup et vitest). Seuil de Hamming abaissé à < 5
  (le défaut < 12 de la lib produisait des faux positifs). `aruco.test.ts` fait un aller-retour
  synthétique (marqueur rasterisé → détection, id, coin 0, taille).
- `useCamera.ts` (getUserMedia, sélection de caméra, arrêt des pistes), `ghost.ts` (dessin),
  `CameraView.tsx` (UI).

## Limites du prototype
- **Précision d'échelle : la tolérance ±3 mm n'est probablement pas atteignable avec l'échelle tirée
  des seuls marqueurs.** La détection se fait sur une image ≤ 1280 px de large. À 1280 px pour ~2 m de
  champ, un carré de 80 mm fait ~50 px : 1 px d'erreur sur le côté ≈ 2 % d'échelle ≈ 15 mm sur les
  ~750 mm BB→bec. Même à 1920 px, ~1 % ≈ 7–9 mm. Le lissage réduit le bruit, pas le biais. Plus le
  marqueur est grand et la caméra proche, mieux c'est (taille max 90 mm pour tenir 2 par A4).
- Perspective / parallaxe : marqueurs supposés parallèles au capteur et dans le plan médian du vélo ;
  un marqueur collé sur le flanc du boîtier (~35 mm hors plan) à 2 m donne ~1,7 % d'erreur. Pas de
  correction de distorsion d'objectif (grand-angle de téléphone : bords de l'image à éviter).
- Le bec réel est déduit du marqueur de selle (bord supérieur sous la pointe + décalage saisi) :
  dépend du soin de pose.
- Cocottes : affichées comme cible seulement (aucun marqueur → pas de mesure ni de couleur).
- Vue de face : tout est cliqué à la main (bouton « Figer l'image » pour cliquer sur une image fixe ;
  un aidant doit cliquer, le cycliste étant sur le vélo) ; l'échelle vient du cintre et
  suppose épaules et genoux à la même distance de la caméra (faux en pratique : les épaules sont
  derrière le cintre → largeur d'épaules sous-estimée de quelques %).
- Pas de suivi en pédalage, pas de mesure d'angle de genou, pas de sauvegarde des mesures.
- Détection en JS sur le fil principal (~10 Hz) : peut ramer sur un téléphone d'entrée de gamme
  (Web Worker à envisager).

## À décider avec l'utilisateur
1. **Repérage : marqueurs ArUco vs pastilles colorées vs détection automatique.**
   - ArUco (actuel) : robustes, identifiés, orientation et échelle gratuites ; à imprimer, assez
     grands, gênants à fixer sous le bec de selle.
   - Pastilles (gommettes de couleur/rétro-réfléchissantes) : petites, faciles à coller sur le vélo
     et le corps (genou, hanche, cheville → angles articulaires), mais échelle à fournir à part et
     sensibles à l'éclairage.
   - Détection auto (pose estimation MediaPipe/MoveNet pour le corps, éventuellement détection des
     roues pour l'échelle) : zéro préparation, mais ±10–20 mm typiques, modèle de plusieurs Mo.
2. **Source d'échelle** pour viser ±3 mm : grande base (empattement, distance entre axes de roues
   via le mode manuel, ou 3e marqueur à distance connue) plutôt que la taille du marqueur.
3. Pose des marqueurs : décalage marqueur→bec fixe (gabarit imprimé à pincer sur la selle ?).
4. Vue de face : capture successive (actuel) ou deux appareils simultanés ; tolérances de face ;
   faut-il des pastilles genoux/pieds pour un suivi en pédalage ?
5. Orientation : « caméra de niveau » par défaut (utiliser le niveau du téléphone via
   `DeviceOrientationEvent` ?) ou lecture de l'inclinaison des marqueurs.
