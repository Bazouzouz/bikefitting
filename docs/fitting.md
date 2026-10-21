# Moteur de fitting

Code : `client/src/fit/` (`saddle.ts`, `cockpit.ts`, `sizing.ts`, `kinematics.ts`,
`components.ts`). Fonctions pures, mm et degrés, origine au BB. Chaque résultat porte une
explication (`rationale`) montrée dans l'interface.

## Hauteur de selle (BB, dessus de selle, le long du tube)
- **LeMond (1987)** : entrejambe × 0,883 (établi pour manivelles de 170 mm).
- **Hamley & Thomas (1967)** : 109 % de l'entrejambe de l'axe de pédale au dessus de selle,
  ramené au BB en retirant la longueur de manivelle.
- Valeur de départ : moyenne des deux (LeMond corrigé de l'écart de manivelle), −0,5 % en endurance.
- Contrôle par un modèle cinématique 2D : angle de genou au point mort bas visé 140–150°
  (**Holmes 1994**, 25–35° de flexion, plage resserrée). Hors plage, la hauteur est ramenée à la
  borne la plus proche et un avertissement est émis.

## Recul de selle (KOPS)
Recherche de l'angle de tube de selle effectif pour lequel le genou est à l'aplomb de l'axe de
pédale, manivelle horizontale. Ajustement de pratique : performance −5 mm (avancé), endurance
+5 mm. Faisabilité contrôlée par l'angle réel du cadre, la course des rails (±20 mm) et les
tiges à recul standard (0, 15, 25 mm). KOPS reste un point de départ.

## Mains, potence, taille
- Inclinaison du tronc selon la pratique et la souplesse (~37° performance, ~42° gravel,
  ~44° endurance, ±2,5° selon souplesse ; plages de fitters type Burt 2014 / Retül). Le gravel
  est passé de 40° à 42° : à 40°, un 1,80 m visait ~85 mm de drop selle→cocottes (contre ~59 mm
  au montage d'origine du GRVL AF) et la taille recommandée tombait une taille trop bas.
- Proportions : Drillis & Contini (acromion, trochanter), coefficient de flexion de coude 0,9.
  On en déduit la cible des mains (cocottes) par rapport au BB.
- **Potence** : recherche exhaustive parmi longueurs 60–120 mm, angles −17/−6/6/17° et
  entretoises 0–40 mm qui rapproche les cocottes de la cible, avec une préférence pour les
  montages courants. Position des cocottes = tube de direction + potence + cintre.
- **Plages cockpit** (`gridRange`) : pour chaque variable (longueur, angle, entretoises) on
  fait varier ce seul paramètre sur sa grille standard et on garde l'intervalle contigu qui
  laisse les cocottes à ≤ tolérance (10 mm) de la cible. Résultat : longueur ±10 mm,
  entretoises ±10 mm, angle de potence en pratique la valeur seule (un pas déplace trop).
- **Taille** (`sizing.ts`) : stack/reach cible avec un montage « idéal » (potence −6°, 15 mm
  d'entretoises, longueur 90 mm, 100 mm en performance, proportionnelle à la taille du
  cycliste, bornée 70–110 mm) ; score 0–100 : reach ×1,2, stack ×0,6, hors-plage constructeur
  −15 −3 par cm. Égalité : reach le plus court. La meilleure taille est recommandée.
- Autres cibles : largeur de cintre (épaules, +20 mm en gravel), manivelle, cales.

## Valeurs calées à la main
Ces constantes viennent d'usages de fitters ou d'estimations, pas d'une étude : angles de
tronc et de bras, hauteur du capot de direction (10 mm), demi-collier de potence (20 mm),
déport des cocottes (80 mm devant, 25 mm au-dessus du serrage du cintre), poids du score de
taille, pénalité hors plage constructeur, décalages de pratique de la selle, plages
tolérées (±10 mm), distance pointe de selle / point d'assise. Elles sont exportées en tête
de fichier : les relire dans le code avant de les modifier.

## Réglage « actuel » par défaut
Si la selle du vélo réel est inconnue, `components/useFit.ts` estime un réglage d'usine :
hauteur = 0,86 × entrejambe, recul 60 mm. Ce n'est pas la cible : l'écart affiché montre la
correction à faire, à mesurer sur le vrai vélo.

## Tolérances
Défaut ±3 mm (hauteur) et ±5 mm (recul) pour le fantôme caméra ; les plages des
`FitTarget` sont plus larges, car les formules n'ont pas cette précision. Le tableau d'écarts
(`components/rows.ts`) juge « dans la tolérance » comme les guides selle et cockpit (3 mm hauteur, 5 mm recul,
cocottes à ≤ 10 mm pour entretoises et potence, cintre ±20 mm), et garde la plage du moteur pour manivelle et cales.

## Inclinaison de selle (hors moteur)
Le moteur ne propose pas de cible d'inclinaison. Le parcours selle guidé
(`client/src/atelier/saddle.ts`) utilise :
- cible **0°** (selle de niveau, mesurée du bec à l'arrière avec un niveau à bulle) ;
- plage tolérée **−2° à 0°** (bec légèrement baissé, jamais relevé) : un bec relevé comprime
  le périnée, un bec trop baissé fait glisser vers l'avant et charge les mains ;
- curseur de −6° à +6° par pas de 0,5° ; « Réglé » quand l'inclinaison est dans la plage.

Constantes `TILT_TARGET`, `TILT_RANGE`, `TILT_MIN`, `TILT_MAX`, `TILT_STEP`. L'inclinaison
actuelle est une saisie de l'utilisateur (0° par défaut), gardée dans le store hors du
contrat `CurrentSetup`. Elle ne modifie ni la hauteur ni le recul affichés (rotation autour
du chariot).

## Modèle mécanique de la selle (parcours guidé)
- Tige le long du tube de selle **du cadre** (`seatTubeAngle`), recul de tige p (0 par
  défaut), position sur les rails r (+ = selle avancée), pointe à `SADDLE_NOSE_TO_SIT`
  (140 mm) devant le point d'assise.
- Recul = H·cos(STA) − 140 − r + p. Avec p = 0, r est exactement `offsetFromSeatTube` du
  moteur, et la course admise est ±`RAIL_ADJUST` (20 mm). Au-delà, la note reprend
  l'avertissement du moteur (« Recul KOPS non atteignable… »).
- Couplage : à rails fixes, monter la selle de ΔH la recule de ΔH·cos(STA). GRVL (73,5°) :
  +10 mm donne +2,84 mm de recul. « Enregistrer comme réglage actuel » écrit la hauteur et ce
  recul couplé (au dixième) dans les overrides.
- Fantôme de la scène : pointe sur `fit.saddlePosition`. Le moteur place le point d'assise
  à H·sin(angle effectif KOPS), alors que le plan dessine la selle à H·sin(STA du cadre) :
  en x, les deux coïncident ; en y, l'écart est de quelques mm.

## Cockpit guidé (hors moteur)
Le parcours `client/src/atelier/cockpit.ts` (Entretoises → Potence → Cintre) ne recalcule
aucune formule : les cocottes viennent de `cockpit(g, setup).hands` (`blueprint/geometry.ts`,
mêmes constantes que `fit/cockpit.ts`), actuel / cible / écart de `buildRows`.
- **« Réglé » des entretoises et de la potence** : jugé sur le **déplacement des cocottes**, pas
  sur la valeur du réglage. Avec le réglage simulé et les autres à la cible, les cocottes doivent
  rester à ≤ `fit.tolerances.reach` (**10 mm**) des cocottes cibles (écart arrondi au mm, comme
  affiché). C'est la règle de `gridRange`, qui borne déjà les plages du moteur : un seul critère.
- **Cintre** : le moteur n'a pas de tolérance de largeur. « Réglé » = dans la plage du moteur,
  soit la cible **±20 mm**.
- **Entretoises au-dessus de la potence** : hors contrat du moteur, **5 mm par défaut**
  (`DEFAULT_SPACERS_ABOVE`, montage d'usine courant), à mesurer et saisir dans le panneau. Le
  pivot de fourche garde une longueur fixe (dessous + dessus) : régler les entretoises déplace
  des entretoises du dessous vers le dessus, sans en ajouter.
- **Drop selle → cocottes** : cote de contrôle (plage du moteur ±15 mm), pas un temps. La scène
  mesure à partir de la pointe de selle dessinée (`saddleTipY`) ; le moteur place le point
  d'assise avec l'angle effectif KOPS. Le drop affiché peut donc **différer de quelques mm** de
  celui du moteur (même écart qu'au fantôme de selle, ci-dessus).
- Potence et cintre se remplacent par pas de grille (`STEM_LENGTHS`, `STEM_ANGLES`,
  `BAR_WIDTHS`, complétées par la valeur actuelle) ; retourner une potence −6° donne +6°.
