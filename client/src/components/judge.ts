/**
 * Règle de jugement « dans la tolérance », partagée par le tableau d'écarts (rows.ts) et les guides selle / cockpit.
 * Fonctions pures : n'importent ni rows.ts ni les guides (graphe d'import acyclique).
 *  - hauteur, recul : |écart arrondi comme affiché| ≤ fit.tolerances ;
 *  - entretoises, potence : cocottes (autres réglages à la cible) à ≤ fit.tolerances.reach de la cible ;
 *  - cintre : dans la plage du moteur (cible ±20 mm) ; pas de tolérance de largeur dans fit.tolerances.
 */
import type { CurrentSetup, FitResult } from '../fit/types';
import { cockpit, frameGeometry, setupFromFit, type Frame, type Pt, type Setup } from '../blueprint/geometry';

/** Arrondi comme à l'affichage (fmtNum) : le badge « Réglé » ne contredit jamais le chiffre lu. */
export const shown = (v: number, dec: number): number => Number(v.toFixed(dec));

export interface Judgement {
  done: boolean;
  tolerance: string;
}

/** Cocottes d'un réglage (cockpit(g, setup).hands). Le rayon de roue n'intervient pas. */
export const hoodsOf = (frame: Frame, s: Setup): Pt => cockpit(frameGeometry(frame, 0), s).hands;

/** Déplacement des cocottes (mm) entre deux réglages qui ne diffèrent que par `patch`. */
export function hoodsShift(frame: Frame, base: Setup, patch: Partial<Pick<Setup, 'spacers' | 'stemLength' | 'stemAngle' | 'handlebarWidth'>>): Pt {
  const a = hoodsOf(frame, base);
  const b = hoodsOf(frame, { ...base, ...patch } as Setup);
  return { x: b.x - a.x, y: b.y - a.y };
}

/** Hauteur ou recul de selle : écart cible − actuel arrondi, contre fit.tolerances. */
export function judgeSaddle(fit: FitResult, key: 'saddleHeight' | 'saddleSetback', current: number, dec: number): Judgement {
  const tol = fit.tolerances[key];
  return { done: Math.abs(shown(fit[key].value - current, dec)) <= tol, tolerance: `±${tol} mm` };
}

/** Effet de ce seul réglage sur les cocottes (mm), les autres à la cible. */
export function hoodsEffect(fit: FitResult, frame: Frame, patch: Partial<Pick<Setup, 'spacers' | 'stemLength' | 'stemAngle'>>): number {
  const d = hoodsShift(frame, setupFromFit(fit), patch);
  return Math.hypot(d.x, d.y);
}

/** Entretoises / potence : cocottes à ≤ reach. `shift` = effet du réglage (hoodsEffect). */
export function judgeHoods(fit: FitResult, shift: number): Judgement {
  const tol = fit.tolerances.reach;
  return { done: shown(shift, 0) <= tol, tolerance: `cocottes à ±${tol} mm` };
}

/** Cintre : plage du moteur. */
export function judgeBar(fit: FitResult, width: number): Judgement {
  const [lo, hi] = fit.handlebarWidth.range;
  return { done: width >= lo - 1e-9 && width <= hi + 1e-9, tolerance: `±${(hi - lo) / 2} mm` };
}

/** Jugement d'une ligne du tableau, ou undefined si le moteur n'a pas de règle de guide (manivelle, cales). */
export function judgeRow(fit: FitResult, cur: CurrentSetup, frame: Frame | undefined, key: keyof CurrentSetup): Judgement | undefined {
  switch (key) {
    case 'saddleHeight':
    case 'saddleSetback':
      return judgeSaddle(fit, key, cur[key], 0);
    case 'spacers':
      return frame && judgeHoods(fit, hoodsEffect(fit, frame, { spacers: cur.spacers }));
    case 'stemLength':
    case 'stemAngle':
      return frame && judgeHoods(fit, hoodsEffect(fit, frame, { stemLength: cur.stemLength, stemAngle: cur.stemAngle }));
    case 'handlebarWidth':
      return judgeBar(fit, cur.handlebarWidth);
    default:
      return undefined;
  }
}
