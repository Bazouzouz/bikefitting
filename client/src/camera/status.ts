/**
 * État / couleur / messages et lissage temporel — fonctions pures.
 */
import type { Calibration, Vec2 } from './geometry';
import { wrapAngle } from './geometry';

export type AdjustState = 'ok' | 'near' | 'far';

export const STATE_COLORS: Record<AdjustState, string> = {
  ok: '#16a34a', // vert
  near: '#f59e0b', // orange
  far: '#dc2626', // rouge
};

export interface ClassifyOptions {
  /**
   * Hystérésis (mm) pour quitter l'état « ok » : on n'entre en vert que si
   * |écart| ≤ tolérance, mais on n'en sort qu'au-delà de tolérance + hystérésis.
   * Évite le clignotement vert/orange à la limite.
   */
  hysteresisMm?: number;
  /** Au-delà de farFactor × tolérance l'état passe au rouge. */
  farFactor?: number;
}

export function classify(
  errorMm: number,
  toleranceMm: number,
  previous: AdjustState | null = null,
  opts: ClassifyOptions = {},
): AdjustState {
  const h = opts.hysteresisMm ?? 0.5;
  const farFactor = opts.farFactor ?? 3;
  const e = Math.abs(errorMm);
  const okLimit = previous === 'ok' ? toleranceMm + h : toleranceMm;
  if (e <= okLimit) return 'ok';
  if (e <= toleranceMm * farFactor) return 'near';
  return 'far';
}

export function stateColor(state: AdjustState): string {
  return STATE_COLORS[state];
}

/** « Monte la selle de 12 mm », « Baisse la selle de 4 mm », « Hauteur OK ». */
export function heightMessage(heightMm: number, state: AdjustState): string {
  if (state === 'ok') return 'Hauteur OK';
  const v = Math.round(Math.abs(heightMm));
  return heightMm > 0 ? `Monte la selle de ${v} mm` : `Baisse la selle de ${v} mm`;
}

/** « Avance la selle de 5 mm », « Recule la selle de 5 mm », « Recul OK ». */
export function foreMessage(foreMm: number, state: AdjustState): string {
  if (state === 'ok') return 'Recul OK';
  const v = Math.round(Math.abs(foreMm));
  return foreMm > 0 ? `Avance la selle de ${v} mm` : `Recule la selle de ${v} mm`;
}

// ---------------------------------------------------------------------------
// Lissage
// ---------------------------------------------------------------------------

/** Coefficient EMA équivalent à une constante de temps tau (ms) pour un pas dt (ms). */
export function emaAlpha(dtMs: number, tauMs: number): number {
  if (tauMs <= 0) return 1;
  return 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
}

export function ema(prev: number | null, next: number, alpha: number): number {
  return prev === null ? next : prev + alpha * (next - prev);
}

export function emaVec(prev: Vec2 | null, next: Vec2, alpha: number): Vec2 {
  return prev === null ? next : { x: ema(prev.x, next.x, alpha), y: ema(prev.y, next.y, alpha) };
}

/** EMA sur un angle (passe correctement par ±π). */
export function emaAngle(prev: number | null, next: number, alpha: number): number {
  if (prev === null) return next;
  return wrapAngle(prev + alpha * wrapAngle(next - prev));
}

/** Lisse une calibration (origine, échelle en log, angle). Le sens n'est pas lissé. */
export function smoothCalibration(prev: Calibration | null, next: Calibration, alpha: number): Calibration {
  if (prev === null || prev.forwardSign !== next.forwardSign) return next;
  return {
    originPx: emaVec(prev.originPx, next.originPx, alpha),
    pxPerMm: Math.exp(ema(Math.log(prev.pxPerMm), Math.log(next.pxPerMm), alpha)),
    angleRad: emaAngle(prev.angleRad, next.angleRad, alpha),
    forwardSign: next.forwardSign,
  };
}
