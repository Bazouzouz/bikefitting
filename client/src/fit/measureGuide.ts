/** Guide de prise de mesures (onglet Morphologie) et aides au calcul. */

export type DimKey = 'height' | 'inseam' | 'shoeSize' | 'torso' | 'arm' | 'shoulderWidth';

export interface MeasureGuideEntry {
  title: string;
  tools: string;
  steps: string[];
  tip: string;
}

export const MEASURE_GUIDE: Record<DimKey, MeasureGuideEntry> = {
  height: {
    title: 'Taille',
    tools: 'Un mur, un livre ou une équerre, un mètre',
    steps: [
      'Tiens-toi pieds nus, talons contre le mur.',
      'Regarde droit devant toi.',
      'Pose le livre à plat sur ta tête, contre le mur.',
      'Marque le mur sous le livre.',
      'Mesure du sol jusqu’à la marque.',
    ],
    tip: 'Mesure le matin : on se tasse au fil de la journée.',
  },
  inseam: {
    title: 'Entrejambe',
    tools: 'Un livre rigide, un mur, un mètre',
    steps: [
      'Tiens-toi pieds nus, pieds écartés d’environ 15 cm, dos au mur.',
      'Place le livre debout entre tes jambes, tranche vers le haut.',
      'Remonte-le fermement, comme une selle.',
      'Marque le mur au niveau du haut du livre.',
      'Mesure du sol jusqu’à la marque.',
    ],
    tip: 'Fais 3 mesures et garde la moyenne : c’est la mesure la plus importante.',
  },
  shoeSize: {
    title: 'Pointure',
    tools: 'Aucun (une feuille et un mètre si tu ne connais pas ta pointure)',
    steps: [
      'Reprends la pointure de tes chaussures de vélo.',
      'Sinon, pose le pied nu sur une feuille, talon contre le mur.',
      'Marque l’orteil le plus long, puis mesure la longueur du pied.',
      'Saisis cette longueur dans l’aide pour obtenir la pointure.',
    ],
    tip: 'Mesure le pied le plus long, en fin de journée.',
  },
  torso: {
    title: 'Torse',
    tools: 'Un livre (même position que pour l’entrejambe), un mètre',
    steps: [
      'Repère le creux sternal, en haut du sternum entre les clavicules.',
      'Place le livre comme pour l’entrejambe.',
      'Mesure du haut du livre jusqu’au creux sternal.',
      'Ou mesure le sol jusqu’au creux sternal contre le mur : l’aide soustrait l’entrejambe.',
    ],
    tip: 'Tiens-toi droit, sans gonfler la poitrine.',
  },
  arm: {
    title: 'Bras',
    tools: 'Un mètre, une aide si possible',
    steps: [
      'Tends le bras à l’horizontale sur le côté.',
      'Repère l’acromion, la bosse osseuse au bout de l’épaule.',
      'Mesure jusqu’à l’os saillant du poignet, côté pouce.',
    ],
    tip: 'Fais-toi aider : c’est difficile seul.',
  },
  shoulderWidth: {
    title: 'Épaules',
    tools: 'Deux livres, un mur, un mètre (ou une aide)',
    steps: [
      'Tiens-toi dos au mur.',
      'Plaque un livre contre l’extérieur de chaque épaule, au niveau des acromions.',
      'Mesure l’écart entre les deux livres.',
      'Ou fais mesurer par une aide d’une bosse osseuse à l’autre, dans le dos.',
    ],
    tip: 'Ne mesure pas la largeur des deltoïdes : ce serait trop large.',
  },
};

const roundHalf = (x: number): number => Math.round(x * 2) / 2;

/** Longueur du pied (cm) estimée depuis la pointure EU. */
export function footLengthCm(eu: number): number {
  if (!Number.isFinite(eu)) return NaN;
  return Math.round(((eu * 2) / 3 - 1.5) * 10) / 10;
}

/** Pointure EU (arrondie au 0,5) depuis la longueur du pied en cm. */
export function shoeSizeFromFootCm(cm: number): number {
  if (!Number.isFinite(cm)) return NaN;
  return roundHalf((cm + 1.5) * 1.5);
}

/** Torse = hauteur du creux sternal - entrejambe, arrondi au 0,5 cm. */
export function torsoFromSternum(sternumHeight: number, inseam: number): number {
  if (!Number.isFinite(sternumHeight) || !Number.isFinite(inseam)) return NaN;
  return roundHalf(sternumHeight - inseam);
}
