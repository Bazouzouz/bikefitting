/**
 * Hauteur et recul de selle.
 * mm et degrés ; origine = axe BB, x vers l'avant, y vers le haut.
 */
import type { FitTarget, Practice, RiderMeasurements } from './types';
import {
  SADDLE_NOSE_TO_SIT,
  bisect,
  clamp,
  kneeAngleBDC,
  kopsOffset,
  rad2deg,
  round,
  sitPoint,
  type Vec2,
} from './kinematics';

/** Angle de genou cible au PMB (Holmes 1994 : 25–35° de flexion => 145–155°, resserré à 140–150° ici). */
export const KNEE_BDC_MIN = 140;
export const KNEE_BDC_MAX = 150;
export const KNEE_BDC_TARGET = 145;

/**
 * LeMond (Greg LeMond & S. Gordis, « Greg LeMond's Complete Book of Bicycling », 1987) :
 * hauteur axe BB -> dessus de selle, le long du tube de selle = entrejambe × 0,883.
 * Établie pour des manivelles de 170 mm.
 */
export function saddleHeightLeMond(inseamCm: number): number {
  return inseamCm * 10 * 0.883;
}

/**
 * Hamley & Thomas (1967, « Physiological and postural factors in the calibration of the bicycle
 * ergometer ») : axe de pédale au PMB -> dessus de selle = 109 % de l'entrejambe.
 * Rapporté à l'axe BB : 1,09 × entrejambe − longueur de manivelle.
 */
export function saddleHeightHamley(inseamCm: number, crankLength: number): number {
  return inseamCm * 10 * 1.09 - crankLength;
}

/**
 * Valeur de départ retenue : moyenne de LeMond corrigé manivelle (−(manivelle − 170), pour garder la même
 * extension au PMB) et de Hamley rapporté au BB. Ajustement de pratique : −0,5 % en endurance
 * (position plus détendue, recommandations courantes des fitters).
 */
export function saddleHeightBaseline(inseamCm: number, crankLength: number, practice: Practice): number {
  const lemond = saddleHeightLeMond(inseamCm) - (crankLength - 170);
  const hamley = saddleHeightHamley(inseamCm, crankLength);
  const base = (lemond + hamley) / 2;
  return practice === 'endurance' ? base * 0.995 : base;
}

/** Hauteur qui donne un angle de genou donné au PMB (bissection sur le modèle cinématique). */
export function saddleHeightForKneeAngle(
  rider: RiderMeasurements,
  targetAngle: number,
  seatAngle: number,
  crankLength: number,
  cleatFore: number,
): number {
  const inseam = rider.inseam * 10;
  return bisect(
    (h) => kneeAngleBDC(rider, h, seatAngle, crankLength, cleatFore).angle - targetAngle,
    inseam * 0.6,
    inseam * 1.05,
  );
}

export interface SaddleHeightResult {
  target: FitTarget;
  lemond: number;
  hamley: number;
  kneeAngle: number;
  warnings: string[];
}

/**
 * Hauteur de selle retenue : baseline LeMond/Hamley, puis contrôle de l'angle de genou au PMB
 * (Holmes 140–150°). Si hors plage, la hauteur est déplacée jusqu'à la borne la plus proche.
 * Plage tolérée = ±10 mm autour de la valeur, bornée par les hauteurs donnant 140° et 150°.
 */
export function computeSaddleHeight(
  rider: RiderMeasurements,
  seatAngle: number,
  crankLength: number,
  cleatFore: number,
): SaddleHeightResult {
  const warnings: string[] = [];
  const lemond = saddleHeightLeMond(rider.inseam);
  const hamley = saddleHeightHamley(rider.inseam, crankLength);
  let value = saddleHeightBaseline(rider.inseam, crankLength, rider.practice);
  const hLo = saddleHeightForKneeAngle(rider, KNEE_BDC_MIN, seatAngle, crankLength, cleatFore);
  const hHi = saddleHeightForKneeAngle(rider, KNEE_BDC_MAX, seatAngle, crankLength, cleatFore);
  const baseAngle = kneeAngleBDC(rider, value, seatAngle, crankLength, cleatFore).angle;
  if (baseAngle < KNEE_BDC_MIN || baseAngle > KNEE_BDC_MAX) {
    warnings.push(
      `Angle de genou estimé ${baseAngle.toFixed(1)}° au PMB avec la formule LeMond/Hamley : hauteur ajustée pour rester dans ${KNEE_BDC_MIN}–${KNEE_BDC_MAX}°.`,
    );
    value = clamp(value, hLo, hHi);
  }
  // Arrondi au mm en restant dans la plage 140–150°.
  value = hHi - hLo >= 1 ? clamp(round(value), Math.ceil(hLo), Math.floor(hHi)) : round(value);
  const knee = kneeAngleBDC(rider, value, seatAngle, crankLength, cleatFore);
  if (!knee.reachable) warnings.push('Modèle cinématique : jambe en extension complète au PMB, hauteur probablement trop haute.');
  const range: [number, number] = [
    Math.min(value, round(Math.max(value - 10, hLo))),
    Math.max(value, round(Math.min(value + 10, hHi))),
  ];
  return {
    lemond,
    hamley,
    kneeAngle: knee.angle,
    warnings,
    target: {
      value,
      range,
      explanation: {
        label: 'Hauteur de selle (axe BB → dessus de selle, le long du tube)',
        rationale:
          `LeMond : entrejambe × 0,883 = ${lemond.toFixed(0)} mm ; Hamley : 1,09 × entrejambe − manivelle = ${hamley.toFixed(0)} mm. ` +
          `Valeur retenue = moyenne (LeMond corrigé manivelle ≠ 170 mm), contrôlée par l'angle de genou au PMB ` +
          `(Holmes 1994, cible ${KNEE_BDC_MIN}–${KNEE_BDC_MAX}°) : ${knee.angle.toFixed(1)}° estimés par modèle 2D.`,
      },
    },
  };
}

export interface SetbackResult {
  target: FitTarget;
  /** Pointe de selle (x,y) par rapport au BB. */
  nose: Vec2;
  /** Point d'assise (x,y). */
  sit: Vec2;
  /** Angle de tube de selle effectif obtenu (°). */
  effectiveSeatAngle: number;
  /** Décalage du point d'assise par rapport à la ligne du tube de selle réel (mm, + = selle avancée). */
  offsetFromSeatTube: number;
  warnings: string[];
}

/** Décalage longitudinal admissible sur les rails autour du centre (mm). */
export const RAIL_ADJUST = 20;
/** Reculs de tige de selle standards (mm). */
export const SEATPOST_SETBACKS = [0, 15, 25];

/**
 * Recul de selle par KOPS : on cherche l'angle de tube de selle effectif pour lequel le repère antérieur
 * du genou est à l'aplomb de l'axe de pédale, manivelle à 3 h. Ajustement pratique :
 * performance −5 mm (plus avancé), endurance +5 mm.
 * Recul = distance horizontale pointe de selle -> derrière l'axe BB = −x(pointe).
 * L'angle de tube réel du cadre sert à vérifier la faisabilité (rails ±20 mm, tiges 0/15/25 mm de recul).
 */
export function computeSaddleSetback(
  rider: RiderMeasurements,
  saddleHeight: number,
  frameSeatAngle: number,
  crankLength: number,
  cleatFore: number,
): SetbackResult {
  const warnings: string[] = [];
  let effective = bisect(
    (a) => kopsOffset(rider, saddleHeight, a, crankLength, cleatFore),
    65,
    82,
  );
  const practiceShift = rider.practice === 'performance' ? 5 : rider.practice === 'endurance' ? -5 : 0;
  let sit = sitPoint(saddleHeight, effective);
  sit = { x: sit.x + practiceShift, y: sit.y };
  effective = rad2deg(Math.atan2(sit.y, -sit.x));
  const nose = { x: round(sit.x + SADDLE_NOSE_TO_SIT), y: round(sit.y) };
  const value = -nose.x;
  const tubeSit = sitPoint(saddleHeight, frameSeatAngle);
  const offset = sit.x - tubeSit.x;
  const minOffset = -RAIL_ADJUST - Math.max(...SEATPOST_SETBACKS);
  const maxOffset = RAIL_ADJUST;
  if (offset > maxOffset) {
    warnings.push(
      `Recul KOPS non atteignable avec un tube de selle à ${frameSeatAngle}° : selle à avancer de ${offset.toFixed(0)} mm (max ~${RAIL_ADJUST} mm sur rails avec tige droite).`,
    );
  } else if (offset < minOffset) {
    warnings.push(
      `Recul KOPS non atteignable avec un tube de selle à ${frameSeatAngle}° : selle à reculer de ${(-offset).toFixed(0)} mm (au-delà d'une tige à 25 mm de recul).`,
    );
  }
  const postAdvice =
    offset >= -RAIL_ADJUST
      ? 'tige droite (0 mm)'
      : offset >= -RAIL_ADJUST - 15
        ? 'tige à 15 mm de recul'
        : 'tige à 25 mm de recul';
  return {
    nose,
    sit,
    effectiveSeatAngle: effective,
    offsetFromSeatTube: offset,
    warnings,
    target: {
      value,
      range: [value - 10, value + 10],
      explanation: {
        label: 'Recul de selle (pointe derrière l’axe BB)',
        rationale:
          `KOPS : repère antérieur du genou à l’aplomb de l’axe de pédale, manivelle horizontale (modèle 2D). ` +
          `Angle de selle effectif ${effective.toFixed(1)}° vs ${frameSeatAngle}° réel (écart ${offset.toFixed(0)} mm au point d’assise) → ${postAdvice}. ` +
          `Pointe à ${SADDLE_NOSE_TO_SIT} mm devant le point d’assise. Plage ±10 mm (KOPS est un point de départ, à affiner).`,
      },
    },
  };
}
