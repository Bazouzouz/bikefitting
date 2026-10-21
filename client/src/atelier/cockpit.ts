/**
 * Cockpit guidé en 3 temps (Entretoises → Potence → Cintre) : modèle mécanique et lectures, fonctions pures.
 * mm et degrés ; origine = axe BB, x vers l'avant, y vers le haut. Angle de potence positif = potence relevée.
 *
 * Modèle mécanique (vue de côté) :
 *  - pivot de fourche de longueur fixe : entretoises SOUS la potence (`spacers`, contrat du moteur) + entretoises
 *    AU-DESSUS (`spacersAbove`, hors contrat, à mesurer). Déplacer une entretoise ne rallonge pas le pivot : la somme
 *    reste constante. Monter la potence au-delà de cette somme est impossible (pivot trop court) ;
 *  - potence : se remplace, par pas de STEM_LENGTHS et STEM_ANGLES (retourner une −6° donne une +6°, sans achat) ;
 *  - cintre : largeur c-c (se remplace), cocottes posées par les constantes du moteur.
 * Les cocottes viennent TOUJOURS de `cockpit(g, setup).hands` (blueprint/geometry.ts, mêmes constantes que
 * fit/cockpit.ts) : aucune formule recalculée ici.
 *
 * « Réglé » (fit.tolerances) : le moteur n'a qu'une tolérance de cockpit, `reach` (10 mm), qui lui sert déjà à
 * borner les plages potence / entretoises (gridRange : réglages qui gardent les cocottes à ≤ reach mm). Même règle ici :
 *  - temps 1 et 2 : les cocottes, avec CE réglage simulé et les autres à la cible, restent à ≤ reach mm des cocottes
 *    cibles (écart arrondi au mm, comme affiché) ;
 *  - temps 3 : pas de tolérance de largeur dans fit.tolerances ; on prend la plage du moteur (cible ±20 mm).
 * Le drop selle → cocottes est une cote de contrôle (plage du moteur ±15 mm), pas un temps.
 *
 * Actuel, cible et écart des réglages sont ceux du moteur et de DeltaTable (buildRows), jamais recalculés ici.
 */
import type { CurrentSetup, FitResult } from '../fit/types';
import { BAR_WIDTHS, STEM_ANGLES, STEM_LENGTHS } from '../fit';
import { buildRows, type FitRow } from '../components/rows';
import { hoodsOf, hoodsShift, hoodsEffect, judgeBar, judgeHoods, shown } from '../components/judge';

export { hoodsOf, hoodsShift };
import {
  saddleTipY,
  setupFromCurrent,
  setupFromFit,
  type Frame,
  type Pt,
  type Setup,
} from '../blueprint/geometry';
import type { CockpitStep } from './cockpitParts';

export type { CockpitStep } from './cockpitParts';

/** Ordre du parcours. */
export const COCKPIT_STEPS: readonly CockpitStep[] = ['spacers', 'stem', 'bar'];
export const COCKPIT_STEP_LABEL: Record<CockpitStep, string> = { spacers: 'Entretoises', stem: 'Potence', bar: 'Cintre' };

/**
 * Entretoises au-dessus de la potence par défaut (mm) : hors contrat du moteur. Montage d'usine courant : une
 * entretoise de 5 mm laissée au-dessus de la potence. À mesurer (saisie dans le panneau).
 */
export const DEFAULT_SPACERS_ABOVE = 5;
/** Pas d'une entretoise (mm) : grille du moteur (SPACER_STEPS, 0–40 par 5). */
export const SPACER_STEP = 5;
/** Plage de saisie des entretoises au-dessus de la potence (mm). */
export const SPACERS_ABOVE_MAX = 40;

/** État simulé du cockpit (panneau du parcours). */
export interface CockpitSim {
  /** Entretoises sous la potence (mm). */
  spacers: number;
  /** Entretoises au-dessus de la potence (mm) : pivot = spacers + spacersAbove, constant. */
  spacersAbove: number;
  stemLength: number;
  /** °, + = relevée. */
  stemAngle: number;
  handlebarWidth: number;
}

/** Simulation de départ : le réglage actuel (entretoises au-dessus saisies à part, hors contrat du moteur). */
export const simFromCurrent = (c: CurrentSetup, spacersAbove = DEFAULT_SPACERS_ABOVE): CockpitSim => ({
  spacers: c.spacers,
  spacersAbove,
  stemLength: c.stemLength,
  stemAngle: c.stemAngle,
  handlebarWidth: c.handlebarWidth,
});

/** Longueur de pivot disponible au-dessus du capot de jeu de direction (mm) : entretoises dessous + dessus. */
export const columnSpace = (sim: CockpitSim): number => sim.spacers + sim.spacersAbove;

/**
 * Change les entretoises sous la potence : on en déplace du dessous vers le dessus (ou l'inverse), le pivot ne
 * s'allonge pas. Bornée à [0, pivot].
 */
export function simWithSpacers(sim: CockpitSim, spacers: number): CockpitSim {
  const total = columnSpace(sim);
  const below = Math.min(total, Math.max(0, spacers));
  return { ...sim, spacers: below, spacersAbove: total - below };
}
/** Corrige la mesure des entretoises au-dessus (change la longueur de pivot connue, pas la position de la potence). */
export const simWithSpacersAbove = (sim: CockpitSim, above: number): CockpitSim => ({ ...sim, spacersAbove: Math.max(0, above) });
/** Remplace (ou retourne) la potence. */
export const simWithStem = (sim: CockpitSim, stemLength: number, stemAngle: number): CockpitSim => ({ ...sim, stemLength, stemAngle });
/** Remplace le cintre (largeur c-c). */
export const simWithBar = (sim: CockpitSim, handlebarWidth: number): CockpitSim => ({ ...sim, handlebarWidth });

/** Patch à écrire dans les overrides du store (« Enregistrer comme réglage actuel »). */
export const overridesFromSim = (sim: CockpitSim): Pick<CurrentSetup, 'spacers' | 'stemLength' | 'stemAngle' | 'handlebarWidth'> => ({
  spacers: sim.spacers,
  stemLength: sim.stemLength,
  stemAngle: sim.stemAngle,
  handlebarWidth: sim.handlebarWidth,
});

/* ---------------------------------------------------------------- Grilles (potence, cintre) */

/** Grille triée, sans doublon, complétée par la valeur actuelle si elle est hors grille (pas de saut silencieux). */
export function gridWith(grid: readonly number[], extra?: number): number[] {
  const all = extra === undefined || !Number.isFinite(extra) ? [...grid] : [...grid, extra];
  return [...new Set(all)].sort((a, b) => a - b);
}
/** Valeur de la grille la plus proche (à égalité : la plus petite). */
export function snapTo(grid: readonly number[], v: number): number {
  let best = grid[0]!;
  for (const g of grid) if (Math.abs(g - v) < Math.abs(best - v) - 1e-9) best = g;
  return best;
}
/** Longueurs de potence proposées (STEM_LENGTHS + l'actuelle). */
export const stemLengthOptions = (current?: number) => gridWith(STEM_LENGTHS, current);
/** Angles de potence proposés (STEM_ANGLES + l'actuel). */
export const stemAngleOptions = (current?: number) => gridWith(STEM_ANGLES, current);
/** Largeurs de cintre proposées (BAR_WIDTHS du moteur + l'actuelle). */
export const barWidthOptions = (current?: number) => gridWith(BAR_WIDTHS, current);

/* ---------------------------------------------------------------- Cocottes (blueprint, constantes du moteur) */

/** Réglage complet du blueprint : réglage actuel, cockpit remplacé par la simulation. */
export const setupWithSim = (base: Setup, sim: CockpitSim): Setup => ({
  ...base,
  spacers: sim.spacers,
  stemLength: sim.stemLength,
  stemAngle: sim.stemAngle,
  handlebarWidth: sim.handlebarWidth,
});

/** Cocottes fantômes (cible) : exactement cockpit(g, setupFromFit(fit)).hands. */
export const ghostHoods = (frame: Frame, fit: FitResult): Pt => hoodsOf(frame, setupFromFit(fit));

/** Cocottes de la simulation (réglage actuel, cockpit simulé). */
export const simHoods = (frame: Frame, current: CurrentSetup, sim: CockpitSim): Pt =>
  hoodsOf(frame, setupWithSim(setupFromCurrent(current), sim));

/* ---------------------------------------------------------------- Lectures */

/** Une ligne actuel / cible / écart (cible − actuel, comme la colonne « Écart » de DeltaTable). */
export interface CockpitLine {
  key: 'spacers' | 'stemLength' | 'stemAngle' | 'handlebarWidth';
  label: string;
  unit: string;
  dec: number;
  current: number;
  target: number;
  gap: number;
  row: FitRow;
}

/** Lecture d'un temps. */
export interface CockpitReadout {
  step: CockpitStep;
  label: string;
  /** 1 ligne (entretoises, cintre) ou 2 (potence : longueur, angle). */
  lines: CockpitLine[];
  /** Écart des cocottes dû à ce seul temps (mm, autres réglages à la cible) ; cintre : non défini. */
  shift?: number;
  tolerance: string;
  done: boolean;
  /** Formule du moteur. */
  why: string;
}

/**
 * Lectures des 3 temps pour une simulation. Les lignes passent par `buildRows` (source de DeltaTable) avec le
 * réglage actuel remplacé par la simulation : valeurs identiques au tableau par construction.
 */
export function cockpitReadouts(fit: FitResult, current: CurrentSetup, sim: CockpitSim, frame: Frame): Record<CockpitStep, CockpitReadout> {
  const rows = buildRows(fit, { ...current, ...overridesFromSim(sim) });
  const line = (key: CockpitLine['key']): CockpitLine => {
    const row = rows.find((r) => r.key === key)!;
    return { key, label: row.label, unit: row.unit, dec: row.dec, current: row.current, target: row.target, gap: row.target - row.current, row };
  };
  const sSpacers = hoodsEffect(fit, frame, { spacers: sim.spacers });
  const sStem = hoodsEffect(fit, frame, { stemLength: sim.stemLength, stemAngle: sim.stemAngle });
  const jSpacers = judgeHoods(fit, sSpacers);
  const jStem = judgeHoods(fit, sStem);
  const jBar = judgeBar(fit, sim.handlebarWidth);
  const bar = line('handlebarWidth');
  return {
    spacers: {
      step: 'spacers',
      label: COCKPIT_STEP_LABEL.spacers,
      lines: [line('spacers')],
      shift: sSpacers,
      tolerance: jSpacers.tolerance,
      done: jSpacers.done,
      why: fit.spacers.explanation.rationale,
    },
    stem: {
      step: 'stem',
      label: COCKPIT_STEP_LABEL.stem,
      lines: [line('stemLength'), line('stemAngle')],
      shift: sStem,
      tolerance: jStem.tolerance,
      done: jStem.done,
      why: `${fit.stemLength.explanation.rationale} ${fit.stemAngle.explanation.rationale}`,
    },
    bar: {
      step: 'bar',
      label: COCKPIT_STEP_LABEL.bar,
      lines: [bar],
      tolerance: jBar.tolerance,
      done: jBar.done,
      why: fit.handlebarWidth.explanation.rationale,
    },
  };
}

/** Cocottes simulées vs cibles : écart total (mm) et état, avec la tolérance du moteur (fit.tolerances.reach). */
export interface HoodsState {
  sim: Pt;
  target: Pt;
  /** Cible − simulation (mm) : + x = avancer les cocottes, + y = les monter. */
  dx: number;
  dy: number;
  dist: number;
  done: boolean;
}
export function hoodsState(fit: FitResult, current: CurrentSetup, sim: CockpitSim, frame: Frame): HoodsState {
  const s = simHoods(frame, current, sim);
  const t = ghostHoods(frame, fit);
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const dist = Math.hypot(dx, dy);
  return { sim: s, target: t, dx, dy, dist, done: shown(dist, 0) <= fit.tolerances.reach };
}

/**
 * Drop selle → cocottes (mm, + = cocottes sous le dessus de selle). Actuel : dessus de selle du réglage actuel
 * (saddleTipY, angle du cadre) − cocottes simulées. Cible : celle du moteur (fit.saddleToBarDrop), mesurée par le
 * moteur depuis le point d'assise (angle effectif) vers SA cible des mains (fit.hands) : même au fantôme, les deux
 * chiffres peuvent différer de quelques mm (écart résiduel du solveur potence, angle effectif vs cadre).
 */
export interface DropReadout {
  current: number;
  target: number;
  gap: number;
  range: [number, number];
  done: boolean;
  /** Dessus de selle (y) et cocottes simulées : extrémités de la cote. */
  saddleY: number;
  hoods: Pt;
}
export function dropReadout(fit: FitResult, current: CurrentSetup, sim: CockpitSim, frame: Frame): DropReadout {
  const base = setupFromCurrent(current);
  const saddleY = saddleTipY(frame, base);
  const hoods = simHoods(frame, current, sim);
  const cur = saddleY - hoods.y;
  const t = fit.saddleToBarDrop.value;
  const [lo, hi] = fit.saddleToBarDrop.range;
  const c0 = shown(cur, 0);
  return { current: cur, target: t, gap: t - cur, range: [lo, hi], done: c0 >= lo && c0 <= hi, saddleY, hoods };
}

/* ---------------------------------------------------------------- Consignes */

/** Entretoises : sens et quantité à déplacer, faisabilité sur le pivot. */
export interface SpacerMove {
  /** Entretoises à passer du dessus vers le dessous (+) ou du dessous vers le dessus (−), en mm. */
  delta: number;
  /** Pivot disponible (dessous + dessus). */
  total: number;
  /** La cible tient-elle sur le pivot ? */
  feasible: boolean;
  /** Pivot manquant (mm) si la cible dépasse. */
  missing: number;
}
export function spacerMove(sim: CockpitSim, target: number): SpacerMove {
  const total = columnSpace(sim);
  return { delta: target - sim.spacers, total, feasible: target <= total + 1e-9, missing: Math.max(0, target - total) };
}

/** Potence : rien à faire, la retourner (±angle, même longueur) ou la remplacer. */
export type StemChange = 'none' | 'flip' | 'replace';
export function stemChange(curLen: number, curAng: number, tLen: number, tAng: number): StemChange {
  if (curLen === tLen && curAng === tAng) return 'none';
  if (curLen === tLen && curAng !== 0 && tAng === -curAng) return 'flip';
  return 'replace';
}
