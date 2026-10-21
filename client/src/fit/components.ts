/**
 * Composants : largeur de cintre, longueur de manivelles, cales.
 * mm et degrés.
 */
import type { FitTarget, RiderMeasurements } from './types';
import { clamp, round } from './kinematics';

export const BAR_WIDTHS = [360, 380, 400, 420, 440, 460, 480];
/** Longueurs standards retenues (177,5 mm exclu : tendance actuelle aux manivelles plus courtes). */
export const CRANK_LENGTHS = [160, 162.5, 165, 167.5, 170, 172.5, 175];

const nearest = (values: number[], v: number): number =>
  values.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), values[0]);

/**
 * Largeur de cintre (centre-centre aux cocottes) ≈ largeur biacromiale (pratique courante des fitters,
 * p. ex. Burt 2014). Gravel : +20 mm (cintres évasés, contrôle hors route). Arrondi à la taille standard.
 */
export function handlebarWidth(rider: RiderMeasurements): FitTarget {
  const raw = rider.shoulderWidth * 10 + (rider.practice === 'gravel' ? 20 : 0);
  const value = nearest(BAR_WIDTHS, raw);
  return {
    value,
    range: [value - 20, value + 20],
    explanation: {
      label: 'Largeur de cintre (c-c)',
      rationale: `Largeur d’épaules acromion–acromion ${(rider.shoulderWidth * 10).toFixed(0)} mm${rider.practice === 'gravel' ? ' + 20 mm (gravel)' : ''}, arrondie au standard. ±20 mm acceptable selon confort/aéro.`,
    },
  };
}

/**
 * Longueur de manivelle : moyenne de deux heuristiques puis arrondi au standard.
 * - entrejambe × 0,205 (variante moderne de la règle ~20 % de la longueur de jambe, Martin & Spirduso 2001) ;
 * - table taille : <160 cm 165 ; <170 167,5 ; <176 170 ; <186 172,5 ; sinon 175 (tables constructeurs).
 */
export function crankLengthFromHeight(heightCm: number): number {
  if (heightCm < 160) return 165;
  if (heightCm < 170) return 167.5;
  if (heightCm < 176) return 170;
  if (heightCm < 186) return 172.5;
  return 175;
}

export function crankLength(rider: RiderMeasurements): FitTarget {
  const byInseam = rider.inseam * 10 * 0.205;
  const byHeight = crankLengthFromHeight(rider.height);
  const value = nearest(CRANK_LENGTHS, (byInseam + byHeight) / 2);
  return {
    value,
    range: [value - 2.5, value + 2.5],
    explanation: {
      label: 'Longueur de manivelles',
      rationale: `Moyenne entrejambe × 0,205 (${byInseam.toFixed(1)} mm) et table taille (${byHeight} mm), arrondie au standard. ±2,5 mm sans impact notable (Martin & Spirduso 2001).`,
    },
  };
}

export interface CleatAdvice {
  fore: FitTarget;
  /** Rotation par défaut (°, + = talon vers l'intérieur). */
  rotation: number;
  /** Décalage latéral par défaut (mm). */
  lateral: number;
  tips: string[];
}

/**
 * Cales : tête du 1er métatarse 10–15 mm derrière l'axe de pédale (pratique usuelle, Burt 2014 ;
 * Specialized BG Fit). Valeur = position de la cale − 1er métatarse (+ = cale devant) : interpolée
 * de 10 mm (pointure 38) à 15 mm (pointure 48), les grands pieds nécessitant une cale plus reculée.
 */
export function cleatAdvice(rider: RiderMeasurements): CleatAdvice {
  const value = round(10 + clamp((rider.shoeSize - 38) / 10, 0, 1) * 5);
  const tips = [
    'Rotation : suivre l’angle naturel du pied (assis, jambe pendante), départ à 0–2° talon intérieur ; garder ~4,5° de flottement.',
    'Latéral : cale centrée par défaut ; genou à l’aplomb du pied en vue de face, ajuster de 1–2 mm ou rondelles de pédale si besoin.',
    'Reculer la cale de quelques mm soulage le mollet et le tendon d’Achille (gravel/endurance).',
  ];
  return {
    rotation: 0,
    lateral: 0,
    tips,
    fore: {
      value,
      range: [10, 15],
      explanation: {
        label: 'Cale avant/arrière (axe pédale vs 1er métatarse)',
        rationale: `1er métatarse 10–15 mm derrière l’axe de pédale ; ${value} mm pour une pointure ${rider.shoeSize}. ${tips.join(' ')}`,
      },
    },
  };
}
