/**
 * Choix de taille : comparaison stack/reach cible (dérivés de la cible des mains) vs stack/reach de chaque taille.
 * mm et degrés.
 */
import type { Bike, BikeSize } from '@bikefit/shared';
import type { Practice, RiderMeasurements, SizeScore } from './types';
import { hoodsPosition, type StemSetup } from './cockpit';
import { clamp, round, type Vec2 } from './kinematics';

/**
 * Montage « idéal » visé pour dimensionner le cadre : potence −6°, 15 mm d'entretoises, longueur
 * 90 mm (100 mm en performance) pour 1,80 m, proportionnelle à la taille (montages d'origine constructeurs),
 * arrondie à 10 mm et bornée 70–110 mm.
 */
export function idealCockpit(practice: Practice, heightCm = 180): StemSetup {
  const base = practice === 'performance' ? 100 : 90;
  return { stemLength: clamp((base * heightCm) / 180, 70, 110), stemAngle: -6, spacers: 15 };
}

/**
 * Stack/reach cadre qui placeraient les cocottes exactement sur la cible avec le montage idéal.
 * hoodsPosition est affine en (reach, stack) : cible = mains − contribution potence/cintre.
 */
export function frameTarget(
  hands: Vec2,
  headTubeAngle: number,
  practice: Practice,
  heightCm = 180,
): { stack: number; reach: number } {
  const zero = hoodsPosition({ stack: 0, reach: 0, headTubeAngle }, idealCockpit(practice, heightCm));
  return { reach: hands.x - zero.x, stack: hands.y - zero.y };
}

/** Poids du score : 1 mm de reach compte ~2× 1 mm de stack (le stack se rattrape aux entretoises/angle de potence). */
export const REACH_WEIGHT = 1.2;
export const STACK_WEIGHT = 0.6;
/** Pénalité par cm hors plage de taille cycliste du constructeur. */
export const MAKER_RANGE_PENALTY = 3;
export const MAKER_RANGE_FLAT = 15;

export function scoreSize(size: BikeSize, rider: RiderMeasurements, hands: Vec2): SizeScore {
  const t = frameTarget(hands, size.headTubeAngle, rider.practice, rider.height);
  const reachDelta = round(size.reach - t.reach);
  const stackDelta = round(size.stack - t.stack);
  let score = 100 - REACH_WEIGHT * Math.abs(reachDelta) - STACK_WEIGHT * Math.abs(stackDelta);
  const notes: string[] = [];
  notes.push(
    Math.abs(reachDelta) <= 10
      ? 'reach adapté'
      : reachDelta > 0
        ? `reach trop long de ${reachDelta} mm`
        : `reach trop court de ${-reachDelta} mm`,
  );
  notes.push(
    Math.abs(stackDelta) <= 15
      ? 'stack adapté'
      : stackDelta > 0
        ? `stack trop haut de ${stackDelta} mm`
        : `stack trop bas de ${-stackDelta} mm`,
  );
  const min = size.riderHeightMin;
  const max = size.riderHeightMax;
  if (min !== undefined && rider.height < min) {
    score -= MAKER_RANGE_FLAT + MAKER_RANGE_PENALTY * (min - rider.height);
    notes.push(`sous la plage constructeur (${min}–${max ?? '?'} cm)`);
  } else if (max !== undefined && rider.height > max) {
    score -= MAKER_RANGE_FLAT + MAKER_RANGE_PENALTY * (rider.height - max);
    notes.push(`au-dessus de la plage constructeur (${min ?? '?'}–${max} cm)`);
  }
  return { label: size.label, score: round(clamp(score, 0, 100)), reachDelta, stackDelta, note: notes.join(', ') };
}

export function scoreSizes(bike: Bike, rider: RiderMeasurements, hands: Vec2): SizeScore[] {
  return bike.sizes.map((s) => scoreSize(s, rider, hands));
}

/**
 * Taille au meilleur score ; à égalité, celle au reach le plus court (reachDelta minimal : plus facile à
 * rallonger par la potence), indépendamment de l'ordre des tailles dans les données.
 */
export function recommendSize(scores: SizeScore[]): string {
  let best: SizeScore | undefined;
  for (const s of scores) {
    if (!best || s.score > best.score || (s.score === best.score && s.reachDelta < best.reachDelta)) best = s;
  }
  return best?.label ?? '';
}
