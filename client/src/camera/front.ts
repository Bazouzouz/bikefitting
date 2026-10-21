/**
 * Vue de FACE du cycliste — fonctions pures.
 *
 * L'utilisateur clique les points (pas de détection de pose dans le prototype) :
 * - les deux extrémités du cintre (largeur connue -> échelle mm/px dans le plan du cintre),
 * - épaules G/D (acromions),
 * - genou et cale (pied) de chaque côté, pédale en bas.
 *
 * Repère : x latéral en mm, + = droite DE L'IMAGE, origine = axe du vélo
 * (milieu du cintre). La gauche/droite du cycliste est l'inverse de l'image
 * (il fait face à la caméra).
 */
import type { Vec2 } from './geometry';
import { dist } from './geometry';
import type { AdjustState } from './status';
import { classify } from './status';

export interface FrontScale {
  /** Axe du vélo dans l'image (milieu du cintre, px). */
  centerPx: Vec2;
  pxPerMm: number;
  /** Inclinaison du cintre dans l'image (rad), pour mesurer perpendiculairement à l'axe. */
  angleRad: number;
}

/** Échelle de face à partir des extrémités du cintre et de sa largeur (mm). */
export function frontScaleFromBar(barLeftPx: Vec2, barRightPx: Vec2, barWidthMm: number): FrontScale {
  const d = dist(barLeftPx, barRightPx);
  if (!(barWidthMm > 0) || d === 0) throw new Error('Largeur de cintre invalide');
  const [a, b] = barLeftPx.x <= barRightPx.x ? [barLeftPx, barRightPx] : [barRightPx, barLeftPx];
  return {
    centerPx: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    pxPerMm: d / barWidthMm,
    angleRad: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

/** Position latérale (mm) d'un point par rapport à l'axe du vélo. */
export function lateralMm(scale: FrontScale, p: Vec2): number {
  const dx = p.x - scale.centerPx.x;
  const dy = p.y - scale.centerPx.y;
  return (dx * Math.cos(scale.angleRad) + dy * Math.sin(scale.angleRad)) / scale.pxPerMm;
}

/** Tolérances de face (prototype, à valider avec l'utilisateur). */
export const FRONT_TOLERANCES = {
  /** Genou à l'aplomb de la cale (mm). */
  kneeOverFoot: 15,
  /** Largeur d'épaules vs cintre (mm). */
  shoulderVsBar: 20,
  /** Asymétrie gauche/droite (mm). */
  symmetry: 15,
};

export interface KneeResult {
  /** Écart latéral genou - pied (mm, + = genou plus à l'extérieur). */
  offsetMm: number;
  state: AdjustState;
  message: string;
}

/**
 * Alignement genou / cale d'un côté. `side` = côté de l'image (le genou côté
 * droit de l'image a « l'extérieur » vers +x).
 */
export function kneeAlignment(
  scale: FrontScale,
  kneePx: Vec2,
  footPx: Vec2,
  side: 'imageLeft' | 'imageRight',
  previous: AdjustState | null = null,
): KneeResult {
  const out = side === 'imageRight' ? 1 : -1;
  const offsetMm = out * (lateralMm(scale, kneePx) - lateralMm(scale, footPx));
  const state = classify(offsetMm, FRONT_TOLERANCES.kneeOverFoot, previous);
  const v = Math.round(Math.abs(offsetMm));
  const message =
    state === 'ok'
      ? 'Genou aligné avec la cale'
      : offsetMm > 0
        ? `Genou ${v} mm à l'extérieur de la cale`
        : `Genou ${v} mm à l'intérieur de la cale`;
  return { offsetMm, state, message };
}

export interface ShoulderResult {
  shoulderWidthMm: number;
  /** Largeur de cintre recommandée - largeur d'épaules mesurée (mm). */
  diffMm: number;
  state: AdjustState;
  message: string;
}

/**
 * Compare la largeur d'épaules mesurée (acromions) à la largeur de cintre cible.
 * Approximation : épaules et cintre supposés dans le même plan (même distance caméra).
 */
export function shoulderVsBar(
  scale: FrontScale,
  leftShoulderPx: Vec2,
  rightShoulderPx: Vec2,
  targetBarWidthMm: number,
): ShoulderResult {
  const shoulderWidthMm = Math.abs(lateralMm(scale, rightShoulderPx) - lateralMm(scale, leftShoulderPx));
  const diffMm = targetBarWidthMm - shoulderWidthMm;
  const state = classify(diffMm, FRONT_TOLERANCES.shoulderVsBar);
  const v = Math.round(Math.abs(diffMm));
  const message =
    state === 'ok'
      ? `Épaules ${Math.round(shoulderWidthMm)} mm : cintre adapté`
      : diffMm > 0
        ? `Cintre cible ${v} mm plus large que les épaules (${Math.round(shoulderWidthMm)} mm)`
        : `Cintre cible ${v} mm plus étroit que les épaules (${Math.round(shoulderWidthMm)} mm)`;
  return { shoulderWidthMm, diffMm, state, message };
}

export interface SymmetryResult {
  /** |droite| - |gauche| (mm) : 0 = symétrique par rapport à l'axe du vélo. */
  asymmetryMm: number;
  /** Décalage du milieu de la paire par rapport à l'axe (mm, + = vers la droite de l'image). */
  shiftMm: number;
  state: AdjustState;
  message: string;
}

/** Symétrie d'une paire de points (épaules, genoux…) par rapport à l'axe du vélo. */
export function symmetry(scale: FrontScale, leftPx: Vec2, rightPx: Vec2, label: string): SymmetryResult {
  const l = lateralMm(scale, leftPx);
  const r = lateralMm(scale, rightPx);
  const asymmetryMm = Math.abs(r) - Math.abs(l);
  const shiftMm = (l + r) / 2;
  const state = classify(shiftMm, FRONT_TOLERANCES.symmetry);
  const v = Math.round(Math.abs(shiftMm));
  const message =
    state === 'ok'
      ? `${label} centrés sur le vélo`
      : `${label} décalés de ${v} mm vers la ${shiftMm > 0 ? 'droite' : 'gauche'} de l'image`;
  return { asymmetryMm, shiftMm, state, message };
}
