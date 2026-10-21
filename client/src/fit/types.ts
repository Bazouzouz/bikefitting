/**
 * Contrat du moteur de fitting — lecture seule pour les workers.
 * mm et degrés. Origine = axe de pédalier, x vers l'avant, y vers le haut.
 */

export type Practice = 'endurance' | 'performance' | 'gravel';
export type Flexibility = 'low' | 'medium' | 'high';

export interface RiderMeasurements {
  /** Taille (cm). */
  height: number;
  /** Entrejambe, sol -> pubis (cm). */
  inseam: number;
  /** Pointure EU. */
  shoeSize: number;
  /** Longueur du torse, fourchette sternale -> pubis (cm). */
  torso: number;
  /** Longueur du bras, acromion -> poignet (cm). */
  arm: number;
  /** Largeur d'épaules, acromion à acromion (cm). */
  shoulderWidth: number;
  /** Souplesse (test toucher les orteils). */
  flexibility: Flexibility;
  practice: Practice;
}

/** Réglages actuels du vélo réel (saisis ou lus depuis le vélo d'origine). */
export interface CurrentSetup {
  saddleHeight: number; // axe BB -> dessus de selle, le long du tube de selle (mm)
  saddleSetback: number; // recul de la pointe de selle derrière l'axe BB (mm)
  stemLength: number;
  stemAngle: number;
  spacers: number;
  handlebarWidth: number;
  crankLength: number;
  cleatFore: number; // décalage cale vs 1er métatarse (mm, + = vers l'avant)
}

export interface Tolerances {
  saddleHeight: number; // mm, défaut 3
  saddleSetback: number; // mm, défaut 5
  reach: number; // mm
}

export interface FitExplanation {
  label: string;
  /** Formule / source utilisée. */
  rationale: string;
}

export interface FitTarget<T = number> {
  value: T;
  /** Plage tolérée [min, max]. */
  range: [number, number];
  explanation: FitExplanation;
}

export interface SizeScore {
  label: string;
  score: number; // 0..100
  reachDelta: number;
  stackDelta: number;
  note: string;
}

export interface FitResult {
  recommendedSize: string;
  sizeScores: SizeScore[];
  saddleHeight: FitTarget;
  saddleSetback: FitTarget;
  /** Cible des mains (cocottes) par rapport à l'axe BB. */
  hands: { x: number; y: number };
  saddleToBarDrop: FitTarget;
  stemLength: FitTarget;
  stemAngle: FitTarget;
  spacers: FitTarget;
  handlebarWidth: FitTarget;
  crankLength: FitTarget;
  cleatFore: FitTarget;
  /** Angle de genou estimé au point mort bas (°). */
  kneeAngleBDC: number;
  /** Position cible de la selle (pointe) par rapport à l'axe BB, en x/y. */
  saddlePosition: { x: number; y: number };
  tolerances: Tolerances;
  warnings: string[];
}
