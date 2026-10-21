/**
 * Selle guidée en 3 temps (Hauteur → Recul → Inclinaison) : modèle mécanique et lectures, fonctions pures.
 * mm et degrés ; origine = axe BB, x vers l'avant, y vers le haut. Recul positif = pointe derrière le BB.
 *
 * Modèle mécanique (vue de côté) :
 *  - H : hauteur de selle, axe BB → dessus de selle le long du tube (même définition que le moteur) ;
 *  - tige de selle le long du tube du CADRE (angle `sta`), avec un recul de tige p (0 = tige droite) ;
 *  - position sur les rails r (+ = selle avancée), 0 = point d'assise à l'aplomb de la tige ;
 *  - pointe de selle SADDLE_NOSE_TO_SIT (140 mm) devant le point d'assise ;
 *  - inclinaison du bec (+ = bec relevé), sans effet sur le recul mesuré à l'horizontale.
 * D'où : recul = H·cos(sta) − SADDLE_NOSE_TO_SIT − r + p, et r = H·cos(sta) − SADDLE_NOSE_TO_SIT + p − recul.
 * Avec p = 0, r est exactement le « décalage au point d'assise » (`offsetFromSeatTube`) du moteur, borné à ±RAIL_ADJUST.
 *
 * Couplage : à rails fixes, monter la selle de ΔH la fait remonter le long du tube incliné, donc reculer de
 * ΔH·cos(sta) (prototype : `clamp = BB + u·H`, u = (−cos sta, sin sta)). GRVL (73,5°) : +10 mm → +2,84 mm de recul.
 *
 * Les cibles et l'écart affiché sont ceux du moteur et de DeltaTable (buildRows), jamais recalculés ici.
 */
import type { CurrentSetup, FitResult } from '../fit/types';
import { RAIL_ADJUST, SADDLE_NOSE_TO_SIT } from '../fit';
import { buildRows, type FitRow } from '../components/rows';
import { judgeSaddle } from '../components/judge';
import { fmtNum, rad, type Pt } from '../blueprint/geometry';
import type { SaddleStep } from './saddleParts';

export type { SaddleStep } from './saddleParts';

/** Ordre du parcours. */
export const SADDLE_STEPS: readonly SaddleStep[] = ['height', 'setback', 'tilt'];
export const SADDLE_STEP_LABEL: Record<SaddleStep, string> = { height: 'Hauteur', setback: 'Recul', tilt: 'Inclinaison' };

/**
 * Inclinaison cible du bec : 0° (selle de niveau), plage tolérée −2° à 0° (bec légèrement baissé, jamais relevé).
 * Hors moteur (il ne propose pas de cible d'inclinaison) : voir docs/fitting.md, « Inclinaison de selle ».
 */
export const TILT_TARGET = 0;
export const TILT_RANGE: readonly [number, number] = [-2, 0];
/** Angle d'inclinaison affiché : signe typographique, une décimale, espace avant ° (« +1,0 ° », « −2,0 ° », « 0,0 ° »). */
export function fmtAngle(v: number, signed = true): string {
  const n = Number(v.toFixed(1));
  const sign = n > 0 ? (signed ? '+' : '') : n < 0 ? '−' : '';
  return `${sign}${fmtNum(Math.abs(n), 1)} °`;
}

/** Plage et pas du curseur d'inclinaison (°). */
export const TILT_MIN = -6;
export const TILT_MAX = 6;
export const TILT_STEP = 0.5;
/** Recul de tige par défaut (mm) : tige droite. */
export const DEFAULT_POST_SETBACK = 0;

/** État simulé de la selle (panneau du parcours). */
export interface SaddleSim {
  height: number;
  setback: number;
  tilt: number;
}

/** Position sur les rails (mm, + = selle avancée) déduite du recul : r = H·cos(sta) − 140 + p − recul. */
export function railFromSetback(height: number, setback: number, staDeg: number, postSetback = DEFAULT_POST_SETBACK): number {
  return height * Math.cos(rad(staDeg)) - SADDLE_NOSE_TO_SIT + postSetback - setback;
}

/** Recul (mm) pour une hauteur, une position sur les rails et un recul de tige : H·cos(sta) − 140 − r + p. */
export function setbackFromRail(height: number, rail: number, staDeg: number, postSetback = DEFAULT_POST_SETBACK): number {
  return height * Math.cos(rad(staDeg)) - SADDLE_NOSE_TO_SIT - rail + postSetback;
}

/** Variation de recul (mm) quand la selle monte de `dH` le long du tube, rails inchangés : ΔH·cos(sta). */
export const coupledSetbackShift = (dH: number, staDeg: number): number => dH * Math.cos(rad(staDeg));

/** La position sur les rails tient-elle dans la course admise par le moteur (±RAIL_ADJUST) ? */
export const railInRange = (rail: number): boolean => Math.abs(rail) <= RAIL_ADJUST + 1e-9;

/** Simulation de départ : le réglage actuel (inclinaison saisie à part, hors contrat du moteur). */
export const simFromCurrent = (c: CurrentSetup, tilt: number): SaddleSim => ({ height: c.saddleHeight, setback: c.saddleSetback, tilt });

/** Arrondi au dixième (valeurs enregistrées : pas de bruit flottant dans les overrides). */
const r01 = (v: number) => Math.round(v * 10) / 10;

/**
 * Change la hauteur simulée. Les rails ne bougent pas : le recul suit, couplé (+ΔH·cos(sta)).
 * Pas d'arrondi ici (un curseur enchaîne les pas : l'erreur s'accumulerait) ; arrondi à l'enregistrement.
 */
export function simWithHeight(sim: SaddleSim, height: number, staDeg: number): SaddleSim {
  return { ...sim, height, setback: sim.setback + coupledSetbackShift(height - sim.height, staDeg) };
}
/** Change le recul simulé : la selle glisse sur ses rails, la hauteur ne bouge pas. */
export const simWithSetback = (sim: SaddleSim, setback: number): SaddleSim => ({ ...sim, setback });
/** Change l'inclinaison simulée (rotation autour du chariot, sans effet sur hauteur ni recul). */
export const simWithTilt = (sim: SaddleSim, tilt: number): SaddleSim => ({ ...sim, tilt });

/** Patch à écrire dans les overrides du store (« Enregistrer comme réglage actuel ») : hauteur et recul couplé. */
export const overridesFromSim = (sim: SaddleSim): Pick<CurrentSetup, 'saddleHeight' | 'saddleSetback'> => ({
  saddleHeight: sim.height,
  saddleSetback: r01(sim.setback),
});

/** Lecture d'un temps : actuel, cible, écart (cible − actuel, comme DeltaTable) et état « Réglé ». */
export interface StepReadout {
  step: SaddleStep;
  label: string;
  unit: string;
  dec: number;
  current: number;
  target: number;
  /** Écart affiché = cible − actuel (correction à faire), comme la colonne « Écart » de DeltaTable. */
  gap: number;
  /** Tolérance du « Réglé » (mm : fit.tolerances ; inclinaison : plage −2..0°). */
  tolerance: string;
  /** Réglé : |écart affiché| ≤ tolérance (hauteur, recul) ou inclinaison dans la plage. */
  done: boolean;
  /** Formule du moteur (ou de docs/fitting.md pour l'inclinaison). */
  why: string;
  /** Ligne DeltaTable correspondante (hauteur et recul). */
  row?: FitRow;
}

/**
 * Lectures des 3 temps pour une simulation. Hauteur et recul passent par `buildRows` (source de DeltaTable)
 * avec le réglage actuel remplacé par la simulation : valeurs identiques au tableau par construction.
 */
export function saddleReadouts(fit: FitResult, current: CurrentSetup, sim: SaddleSim): Record<SaddleStep, StepReadout> {
  const rows = buildRows(fit, { ...current, saddleHeight: sim.height, saddleSetback: sim.setback });
  const mk = (step: 'height' | 'setback', key: 'saddleHeight' | 'saddleSetback'): StepReadout => {
    const row = rows.find((r) => r.key === key)!;
    const gap = row.target - row.current;
    const j = judgeSaddle(fit, key, row.current, row.dec);
    return {
      step,
      label: SADDLE_STEP_LABEL[step],
      unit: row.unit,
      dec: row.dec,
      current: row.current,
      target: row.target,
      gap,
      tolerance: j.tolerance,
      done: j.done,
      why: row.why,
      row,
    };
  };
  const tiltGap = TILT_TARGET - sim.tilt;
  return {
    height: mk('height', 'saddleHeight'),
    setback: mk('setback', 'saddleSetback'),
    tilt: {
      step: 'tilt',
      label: SADDLE_STEP_LABEL.tilt,
      unit: '°',
      dec: 1,
      current: sim.tilt,
      target: TILT_TARGET,
      gap: tiltGap,
      tolerance: `${fmtAngle(TILT_RANGE[0])} à ${fmtAngle(TILT_RANGE[1])}`,
      done: sim.tilt >= TILT_RANGE[0] - 1e-9 && sim.tilt <= TILT_RANGE[1] + 1e-9,
      why:
        `Selle de niveau (${fmtAngle(TILT_TARGET)}), plage tolérée ${fmtAngle(TILT_RANGE[0])} à ${fmtAngle(TILT_RANGE[1])} : un bec relevé comprime le périnée, ` +
        `un bec trop baissé fait glisser vers l'avant et charge les mains (voir docs/fitting.md).`,
    },
  };
}

/** Rails : position actuelle (simulée) et position cible, avec l'état de la course. */
export interface RailsState {
  current: number;
  target: number;
  currentOk: boolean;
  targetOk: boolean;
  /** Avertissements du moteur sur la faisabilité du recul (« Recul KOPS non atteignable… »). */
  engine: string[];
}

export function railsState(fit: FitResult, sim: SaddleSim, staDeg: number, postSetback = DEFAULT_POST_SETBACK): RailsState {
  const current = railFromSetback(sim.height, sim.setback, staDeg, postSetback);
  const target = railFromSetback(fit.saddleHeight.value, fit.saddleSetback.value, staDeg, postSetback);
  return {
    current,
    target,
    currentOk: railInRange(current),
    targetOk: railInRange(target),
    engine: fit.warnings.filter((w) => w.startsWith('Recul KOPS non atteignable')),
  };
}

/** Pointe du fantôme (cible) : exactement la position de selle du moteur. */
export const ghostNose = (fit: FitResult): Pt => ({ x: fit.saddlePosition.x, y: fit.saddlePosition.y });

/**
 * Contour de selle (profil latéral) ancré sur la pointe `nose`, tourné de `tiltDeg` autour du chariot.
 * Même silhouette que `saddleShape` du blueprint (pointe → queue 255 mm derrière), y vers le haut.
 */
const SHELL: ReadonlyArray<readonly [number, number]> = [
  [0, -8],
  [-70, -2],
  [-140, 0],
  [-220, 14],
  [-255, 24],
  [-250, -4],
  [-150, -28],
  [0, -24],
];
/** Chariot : sous le point d'assise (140 mm derrière la pointe), à hauteur des rails. */
export const CLAMP_FROM_NOSE: Pt = { x: -SADDLE_NOSE_TO_SIT, y: -28 };

/** Point local (relatif à la pointe, selle de niveau) tourné de `tiltDeg` autour du chariot. */
function placeLocal(nose: Pt, tiltDeg: number, lx: number, ly: number): Pt {
  const a = rad(tiltDeg);
  const dx = lx - CLAMP_FROM_NOSE.x;
  const dy = ly - CLAMP_FROM_NOSE.y;
  return {
    x: nose.x + CLAMP_FROM_NOSE.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: nose.y + CLAMP_FROM_NOSE.y + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

export function saddleOutline(nose: Pt, tiltDeg = 0): Pt[] {
  return SHELL.map(([lx, ly]) => placeLocal(nose, tiltDeg, lx, ly));
}

/** Ligne de lecture de l'inclinaison (pointe → arrière, 255 mm, horizontale à 0°) après rotation. */
export function tiltLine(nose: Pt, tiltDeg: number): { nose: Pt; tail: Pt } {
  return { nose: placeLocal(nose, tiltDeg, 0, 0), tail: placeLocal(nose, tiltDeg, -255, 0) };
}

/** Pointe de la selle simulée dans le repère du blueprint (dessus à H·sin(sta), comme `saddleTipY`). */
export const simNose = (sim: SaddleSim, staDeg: number): Pt => ({ x: -sim.setback, y: sim.height * Math.sin(rad(staDeg)) });
