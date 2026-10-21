/**
 * Moteur de fitting — fonctions pures.
 * Conventions : mm et degrés ; origine = axe de pédalier (BB), x vers l'avant, y vers le haut.
 * Les mesures cycliste (RiderMeasurements) sont en cm et converties en mm dans chaque formule.
 */
import type { Bike } from '@bikefit/shared';
import type { CurrentSetup, FitResult, FitTarget, RiderMeasurements, Tolerances } from './types';
import { computeSaddleHeight, computeSaddleSetback } from './saddle';
import {
  ELBOW_FLEX_FACTOR,
  TORSO_TO_HIP_SHOULDER,
  WRIST_TO_GRIP,
  cockpitTargets,
  handsTarget,
  saddleToBarDrop,
  saddleToHandsDistance,
  shoulderAngle,
  torsoAngle,
} from './cockpit';
import { cleatAdvice, crankLength, handlebarWidth } from './components';
import { recommendSize, scoreSizes } from './sizing';
import { hipFromSit, legModel, round } from './kinematics';

export type {
  CurrentSetup,
  FitExplanation,
  FitResult,
  FitTarget,
  Flexibility,
  Practice,
  RiderMeasurements,
  SizeScore,
  Tolerances,
} from './types';
export * from './kinematics';
export * from './saddle';
export * from './cockpit';
export * from './components';
export * from './sizing';

export const DEFAULT_TOLERANCES: Tolerances = { saddleHeight: 3, saddleSetback: 5, reach: 10 };
/** Angle de selle de départ pour l'itération hauteur <-> recul (valeur médiane route/gravel). */
const INITIAL_SEAT_ANGLE = 73.5;

/**
 * Calcule le fitting complet.
 * 1. manivelle et cale recommandées ; 2. hauteur de selle (LeMond/Hamley + genou au PMB) et recul KOPS,
 *    itérés car l'angle de selle effectif influe sur l'angle de genou ; 3. cible des mains (indépendante du cadre) ;
 * 4. score par taille ; 5. potence/entretoises pour la taille retenue (sizeLabel ou recommandée) ;
 * 6. avertissements (plages, faisabilité, réglages actuels hors plage).
 */
export function computeFit(
  rider: RiderMeasurements,
  bike: Bike,
  current?: CurrentSetup,
  sizeLabel?: string,
): FitResult {
  const warnings: string[] = [];
  const tolerances = { ...DEFAULT_TOLERANCES };

  const crank = crankLength(rider);
  const cleat = cleatAdvice(rider);
  const cleatFore = cleat.fore.value;

  // Itération point fixe hauteur / angle de selle effectif (converge en 2–3 passes).
  let seatAngle = INITIAL_SEAT_ANGLE;
  let height = computeSaddleHeight(rider, seatAngle, crank.value, cleatFore);
  for (let i = 0; i < 4; i++) {
    const sb = computeSaddleSetback(rider, height.target.value, seatAngle, crank.value, cleatFore);
    if (Math.abs(sb.effectiveSeatAngle - seatAngle) < 0.05) break;
    seatAngle = sb.effectiveSeatAngle;
    height = computeSaddleHeight(rider, seatAngle, crank.value, cleatFore);
  }
  warnings.push(...height.warnings);

  // Mains : indépendantes du cadre.
  const preSetback = computeSaddleSetback(rider, height.target.value, seatAngle, crank.value, cleatFore);
  const hip = hipFromSit(preSetback.sit, legModel(rider));
  const handsRaw = handsTarget(rider, hip);
  const hands = { x: round(handsRaw.x), y: round(handsRaw.y) };

  // Tailles.
  const sizeScores = scoreSizes(bike, rider, hands);
  const recommendedSize = recommendSize(sizeScores);
  let size = bike.sizes.find((s) => s.label === (sizeLabel ?? recommendedSize));
  if (!size) {
    if (sizeLabel !== undefined) warnings.push(`Taille « ${sizeLabel} » introuvable : taille recommandée ${recommendedSize} utilisée.`);
    size = bike.sizes.find((s) => s.label === recommendedSize) ?? bike.sizes[0];
  }
  if (!size) throw new Error('computeFit : le vélo ne contient aucune taille.');
  if (sizeLabel !== undefined && size.label !== recommendedSize && size.label === sizeLabel) {
    const sc = sizeScores.find((s) => s.label === size!.label);
    warnings.push(`Taille ${size.label} choisie alors que ${recommendedSize} est recommandée${sc ? ` (${sc.note})` : ''}.`);
  }

  // Recul : faisabilité vis-à-vis de l'angle de tube réel de la taille retenue.
  const setback = computeSaddleSetback(rider, height.target.value, seatAngle, crank.value, cleatFore);
  const feas = computeSaddleSetback(rider, height.target.value, size.seatTubeAngle, crank.value, cleatFore);
  warnings.push(...feas.warnings);
  const saddleSetback: FitTarget = {
    ...setback.target,
    explanation: feas.target.explanation,
  };

  const cockpit = cockpitTargets(size, hands, tolerances.reach);
  warnings.push(...cockpit.warnings);

  const drop = round(saddleToBarDrop(setback.sit, hands));
  const saddleToBarDropTarget: FitTarget = {
    value: drop,
    range: [drop - 15, drop + 15],
    explanation: {
      label: 'Drop selle → cocottes',
      rationale:
        `Tronc ${rider.torso} cm × ${TORSO_TO_HIP_SHOULDER} incliné à ${torsoAngle(rider.practice, rider.flexibility)}° ` +
        `(pratique ${rider.practice}, souplesse ${rider.flexibility}), angle d’épaule ${shoulderAngle(rider.practice, rider.flexibility)}°, ` +
        `bras ${rider.arm} cm × ${ELBOW_FLEX_FACTOR} + ${WRIST_TO_GRIP} mm (Burt 2014, plages Retül). ` +
        `Distance pointe de selle → cocottes ${round(saddleToHandsDistance(setback.nose, hands))} mm. ±15 mm.`,
    },
  };

  const bar = handlebarWidth(rider);

  if (current) {
    const checks: Array<[string, number, FitTarget]> = [
      ['Hauteur de selle', current.saddleHeight, height.target],
      ['Recul de selle', current.saddleSetback, saddleSetback],
      ['Longueur de potence', current.stemLength, cockpit.stemLength],
      ['Angle de potence', current.stemAngle, cockpit.stemAngle],
      ['Entretoises', current.spacers, cockpit.spacers],
      ['Largeur de cintre', current.handlebarWidth, bar],
      ['Manivelles', current.crankLength, crank],
      ['Cales', current.cleatFore, cleat.fore],
    ];
    for (const [label, v, t] of checks) {
      if (v < t.range[0] || v > t.range[1]) {
        warnings.push(`${label} actuel(le) ${v} hors plage [${t.range[0]} ; ${t.range[1]}] (cible ${t.value}).`);
      }
    }
  }

  return {
    recommendedSize,
    sizeScores,
    saddleHeight: height.target,
    saddleSetback,
    hands,
    saddleToBarDrop: saddleToBarDropTarget,
    stemLength: cockpit.stemLength,
    stemAngle: cockpit.stemAngle,
    spacers: cockpit.spacers,
    handlebarWidth: bar,
    crankLength: crank,
    cleatFore: cleat.fore,
    kneeAngleBDC: round(height.kneeAngle, 0.1),
    saddlePosition: setback.nose,
    tolerances,
    warnings,
  };
}
