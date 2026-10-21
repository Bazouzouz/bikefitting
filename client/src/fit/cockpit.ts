/**
 * Position des mains (cocottes) et solveur potence / entretoises.
 * mm et degrés ; origine = axe BB, x vers l'avant, y vers le haut.
 */
import type { BikeSize } from '@bikefit/shared';
import type { FitTarget, Flexibility, Practice, RiderMeasurements } from './types';
import { deg2rad, round, type Vec2 } from './kinematics';

/**
 * Géométrie de cintre / jeu de direction (valeurs moyennes du marché, à confirmer par l'utilisateur).
 * - capot de jeu de direction : 10 mm au-dessus du haut du tube de direction (le stack se mesure au haut du tube) ;
 * - demi-hauteur du collier de potence : 20 mm (collier 40 mm) ;
 * - cocottes ≈ 80 mm devant et 25 mm au-dessus de l'axe de serrage du cintre (reach de cintre compact + hauteur de cocotte).
 */
export const HEADSET_CAP = 10;
export const STEM_HALF_STACK = 20;
export const BAR_REACH_TO_HOODS = 80;
export const HOODS_RISE = 25;

export const STEM_LENGTHS = [60, 70, 80, 90, 100, 110, 120];
export const STEM_ANGLES = [-17, -6, 6, 17];
export const SPACER_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40];

/**
 * Inclinaison du tronc (hanche -> acromion) par rapport à l'horizontale, mains sur les cocottes.
 * Source : plages usuelles des fitters (Burt, « Bike Fit », 2014 ; Retül) : ~37° performance,
 * ~42° gravel, ~44° endurance ; souplesse faible +2,5°, élevée −2,5° (test doigts-orteils). L'angle d'épaule étant
 * constant, les mains tournent avec le tronc : la plage est volontairement resserrée (≈ drop 0–100 mm à 1,80 m).
 * Gravel recalé de 40° à 42° : à 40°, un 1,80 m (torse 58, bras 62) visait ~85 mm de drop selle→cocottes, alors que
 * le montage d'origine de la taille M de sa plage constructeur (GRVL AF, potence 90/−6°, 20 mm d'entretoises) donne
 * ~59 mm ; le meilleur ajustement géométrique tombait alors une taille en dessous (S). À 42° : drop ~50–65 mm.
 * La sensibilité est forte (~10 mm de drop par degré), d'où un réglage au plus petit pas qui corrige le biais.
 */
export function torsoAngle(practice: Practice, flexibility: Flexibility): number {
  const base = practice === 'performance' ? 37 : practice === 'gravel' ? 42 : 44;
  const flex = flexibility === 'low' ? 2.5 : flexibility === 'high' ? -2.5 : 0;
  return base + flex;
}

/**
 * Inclinaison absolue du bras (épaule -> mains) sous l'horizontale : 52° pour un tronc à 40°, puis
 * relevée de la moitié de l'écart d'angle de tronc (le cycliste redressé monte nettement les mains mais
 * ne raccourcit que peu son reach). Angle d'épaule tronc-bras résultant ≈ 89–95° (Burt 2014 : 85–95° aux cocottes).
 */
export const ARM_DROP_ANGLE = 52;
export const ARM_FOLLOW_TORSO = 0.5;

export function armDropAngle(practice: Practice, flexibility: Flexibility): number {
  return ARM_DROP_ANGLE - ARM_FOLLOW_TORSO * (torsoAngle(practice, flexibility) - 40);
}

/** Angle d'épaule tronc-bras résultant (°). */
export function shoulderAngle(practice: Practice, flexibility: Flexibility): number {
  return torsoAngle(practice, flexibility) + armDropAngle(practice, flexibility);
}

/**
 * Rapport (centre de hanche -> acromion) / (fourchette sternale -> pubis).
 * Drillis & Contini : acromion 0,818 H, trochanter 0,53 H => 0,288 H ; fourchette sternale -> pubis ≈ 0,348 H => 0,83.
 */
export const TORSO_TO_HIP_SHOULDER = 0.83;
/** Raccourcissement épaule -> poignet dû à la flexion des coudes (~15–20°) : 0,9. */
export const ELBOW_FLEX_FACTOR = 0.9;
/** Poignet -> centre de prise de la main (~0,03 H, Drillis & Contini). */
export const WRIST_TO_GRIP = 50;

/**
 * Cible des mains (centre de prise sur les cocottes) depuis le centre de hanche.
 * Modèle segmentaire : tronc effectif = 0,83 × torse mesuré, incliné de torsoAngle ;
 * bras effectif = 0,9 × (acromion -> poignet) + 50 mm, incliné de armDropAngle() sous l'horizontale.
 */
export function handsTarget(rider: RiderMeasurements, hip: Vec2): Vec2 {
  const t = deg2rad(torsoAngle(rider.practice, rider.flexibility));
  const torso = rider.torso * 10 * TORSO_TO_HIP_SHOULDER;
  const shoulder = { x: hip.x + torso * Math.cos(t), y: hip.y + torso * Math.sin(t) };
  const armDir = -deg2rad(armDropAngle(rider.practice, rider.flexibility)); // bras orienté vers l'avant et le bas
  const arm = rider.arm * 10 * ELBOW_FLEX_FACTOR + WRIST_TO_GRIP;
  return { x: shoulder.x + arm * Math.cos(armDir), y: shoulder.y + arm * Math.sin(armDir) };
}

/** Drop selle -> cocottes (mm, + = cocottes plus basses que le dessus de selle). */
export function saddleToBarDrop(saddleTop: Vec2, hands: Vec2): number {
  return saddleTop.y - hands.y;
}

/** Distance pointe de selle -> cocottes (mm, euclidienne). */
export function saddleToHandsDistance(saddleNose: Vec2, hands: Vec2): number {
  return Math.hypot(hands.x - saddleNose.x, hands.y - saddleNose.y);
}

export interface StemSetup {
  stemLength: number;
  stemAngle: number;
  spacers: number;
}

/** Angle absolu de la potence au-dessus de l'horizontale : angle potence + (90 − angle de direction). */
export function stemAbsoluteAngle(stemAngle: number, headTubeAngle: number): number {
  return stemAngle + (90 - headTubeAngle);
}

/**
 * Position des cocottes pour une taille de cadre et un montage potence/entretoises donnés.
 * Haut du tube de direction = (reach, stack) ; l'axe de pivot remonte vers l'arrière : (−cos HTA, sin HTA).
 */
export function hoodsPosition(size: Pick<BikeSize, 'stack' | 'reach' | 'headTubeAngle'>, s: StemSetup): Vec2 {
  const hta = deg2rad(size.headTubeAngle);
  const up = HEADSET_CAP + s.spacers + STEM_HALF_STACK;
  const clampX = size.reach - up * Math.cos(hta);
  const clampY = size.stack + up * Math.sin(hta);
  const a = deg2rad(stemAbsoluteAngle(s.stemAngle, size.headTubeAngle));
  return {
    x: clampX + s.stemLength * Math.cos(a) + BAR_REACH_TO_HOODS,
    y: clampY + s.stemLength * Math.sin(a) + HOODS_RISE,
  };
}

export interface StemSolution extends StemSetup {
  hoods: Vec2;
  errorX: number;
  errorY: number;
  error: number;
}

/**
 * Solveur discret : longueurs 60–120 mm (pas 10), angles ±6/±17°, entretoises 0–40 mm (pas 5).
 * Coût = distance aux mains cible + petites pénalités de préférence (−6°, 90–100 mm, peu d'entretoises),
 * qui servent aussi de départage déterministe.
 */
export function solveStem(
  size: Pick<BikeSize, 'stack' | 'reach' | 'headTubeAngle'>,
  hands: Vec2,
): StemSolution {
  let best: StemSolution | null = null;
  let bestCost = Infinity;
  for (const stemAngle of STEM_ANGLES) {
    for (const stemLength of STEM_LENGTHS) {
      for (const spacers of SPACER_STEPS) {
        const hoods = hoodsPosition(size, { stemLength, stemAngle, spacers });
        const errorX = hoods.x - hands.x;
        const errorY = hoods.y - hands.y;
        const error = Math.hypot(errorX, errorY);
        const pref =
          (stemAngle === -6 ? 0 : Math.abs(stemAngle) === 6 ? 1 : 2) +
          Math.abs(stemLength - 95) * 0.02 +
          spacers * 0.02;
        const cost = error + pref;
        if (cost < bestCost - 1e-9) {
          bestCost = cost;
          best = { stemLength, stemAngle, spacers, hoods, errorX, errorY, error };
        }
      }
    }
  }
  return best as StemSolution;
}

export interface CockpitTargets {
  stemLength: FitTarget;
  stemAngle: FitTarget;
  spacers: FitTarget;
  solution: StemSolution;
  warnings: string[];
}

/**
 * Plage d'une variable du cockpit : on fait varier ce seul paramètre sur sa grille standard, les deux autres
 * restant ceux de la solution, et on garde l'intervalle contigu des valeurs dont les cocottes restent à
 * ≤ tolérance (mm) des cocottes recommandées. La plage contient toujours la valeur. Conséquences :
 * longueur ±10 mm et entretoises ±10 mm (≈ 10 mm de déplacement chacune) ; l'angle de potence se réduit en
 * pratique à la valeur seule (un pas de 11–12° déplace les cocottes de ~12–20 mm avec 60–100 mm de potence).
 */
export function gridRange(
  size: Pick<BikeSize, 'stack' | 'reach' | 'headTubeAngle'>,
  solution: StemSetup & { hoods: Vec2 },
  key: keyof StemSetup,
  grid: number[],
  tolerance: number,
): [number, number] {
  const ok = (v: number): boolean => {
    const h = hoodsPosition(size, { ...solution, [key]: v });
    return Math.hypot(h.x - solution.hoods.x, h.y - solution.hoods.y) <= tolerance + 1e-6;
  };
  const sorted = [...grid].sort((a, b) => a - b);
  const i = sorted.indexOf(solution[key]);
  if (i < 0) return [solution[key], solution[key]];
  let lo = i;
  let hi = i;
  while (lo > 0 && ok(sorted[lo - 1])) lo--;
  while (hi < sorted.length - 1 && ok(sorted[hi + 1])) hi++;
  return [sorted[lo], sorted[hi]];
}

export function cockpitTargets(
  size: BikeSize,
  hands: Vec2,
  reachTolerance: number,
): CockpitTargets {
  const solution = solveStem(size, hands);
  const warnings: string[] = [];
  if (solution.error > reachTolerance) {
    warnings.push(
      `Taille ${size.label} : meilleure combinaison potence/entretoises à ${solution.error.toFixed(0)} mm de la cible des mains ` +
        `(Δx ${solution.errorX.toFixed(0)}, Δy ${solution.errorY.toFixed(0)}).`,
    );
  }
  const base = `Cible mains (${round(hands.x)}, ${round(hands.y)}) − stack/reach ${size.stack}/${size.reach} (HTA ${size.headTubeAngle}°) ; capot ${HEADSET_CAP} mm, collier ${STEM_HALF_STACK * 2} mm, cocottes +${BAR_REACH_TO_HOODS}/+${HOODS_RISE} mm.`;
  return {
    solution,
    warnings,
    stemLength: {
      value: solution.stemLength,
      range: gridRange(size, solution, 'stemLength', STEM_LENGTHS, reachTolerance),
      explanation: {
        label: 'Longueur de potence',
        rationale: `Solveur sur longueurs standards 60–120 mm. ${base} Écart résiduel ${solution.error.toFixed(0)} mm. Plage = longueurs standards gardant les cocottes à ≤ ${reachTolerance} mm (autres réglages fixés).`,
      },
    },
    stemAngle: {
      value: solution.stemAngle,
      range: gridRange(size, solution, 'stemAngle', STEM_ANGLES, reachTolerance),
      explanation: {
        label: 'Angle de potence',
        rationale: `Angles ±6/±17° (absolu = angle + 90 − HTA = ${stemAbsoluteAngle(solution.stemAngle, size.headTubeAngle).toFixed(0)}°). Plage = angles standards gardant les cocottes à ≤ ${reachTolerance} mm (un pas de 11–12° déplace les cocottes de plus de ${reachTolerance} mm : en général la valeur seule).`,
      },
    },
    spacers: {
      value: solution.spacers,
      range: gridRange(size, solution, 'spacers', SPACER_STEPS, reachTolerance),
      explanation: {
        label: 'Entretoises sous potence',
        rationale: `0–40 mm par pas de 5 mm. ${base} Plage = entretoises gardant les cocottes à ≤ ${reachTolerance} mm.`,
      },
    },
  };
}
