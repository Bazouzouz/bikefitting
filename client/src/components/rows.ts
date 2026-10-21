import type { CurrentSetup, FitResult } from '../fit/types';
import type { Frame } from '../blueprint/geometry';
import { judgeRow } from './judge';

export interface FitRow {
  key: keyof CurrentSetup;
  label: string;
  unit: string;
  dec: number;
  current: number;
  target: number;
  range: [number, number];
  why: string;
  /** Tolérance appliquée, en clair (« ±3 mm », « cocottes à ±10 mm »…), absente si c'est la plage du moteur. */
  tolerance?: string;
  /** Écart actuel − cible. */
  delta: number;
  /** on = sur la cible ; within = écart toléré (même règle que les guides, sinon plage du moteur) ; off = à corriger. */
  status: 'on' | 'within' | 'off';
}

export const STATUS_LABEL: Record<FitRow['status'], string> = {
  on: 'sur la cible',
  within: 'écart toléré',
  off: 'à corriger',
}

/** Statut d'une ligne : fondé sur l'écart à la cible, la plage du moteur ne sert que de tolérance. */
export function rowStatus(current: number, target: number, range: [number, number], dec: number): FitRow['status'] {
  const eps = 0.5 * 10 ** -dec;
  const d = current - target;
  if (Math.abs(d) < eps) return 'on';
  const lo = Math.min(range[0], target);
  const hi = Math.max(range[1], target);
  return current >= lo - 1e-9 && current <= hi + 1e-9 ? 'within' : 'off';
}

/**
 * Lignes du tableau d'écarts. Le statut suit la règle des guides (judge.ts). `frame` (cadre de la taille, `toFrame`)
 * est nécessaire pour juger entretoises et potence sur le déplacement des cocottes ; sans lui, ces lignes gardent
 * la plage du moteur, comme manivelle et cales.
 */
export function buildRows(fit: FitResult, cur: CurrentSetup, frame?: Frame): FitRow[] {
  return rawRows(fit, cur).map((r) => {
    const j = judgeRow(fit, cur, frame, r.key);
    if (!j) return r;
    const on = Math.abs(r.delta) < 0.5 * 10 ** -r.dec;
    return { ...r, tolerance: j.tolerance, status: on ? 'on' : j.done ? 'within' : 'off' };
  });
}

function rawRows(fit: FitResult, cur: CurrentSetup): FitRow[] {
  const mk = (key: keyof CurrentSetup, label: string, unit: string, dec: number, t: FitResult['saddleHeight']): FitRow => ({
    key,
    label,
    unit,
    dec,
    current: cur[key],
    target: t.value,
    range: t.range,
    why: t.explanation.rationale,
    delta: cur[key] - t.value,
    status: rowStatus(cur[key], t.value, t.range, dec),
  });
  return [
    mk('saddleHeight', 'Hauteur de selle', 'mm', 0, fit.saddleHeight),
    mk('saddleSetback', 'Recul de selle', 'mm', 0, fit.saddleSetback),
    mk('stemLength', 'Longueur de potence', 'mm', 0, fit.stemLength),
    mk('stemAngle', 'Angle de potence', '°', 0, fit.stemAngle),
    mk('spacers', 'Entretoises', 'mm', 0, fit.spacers),
    mk('handlebarWidth', 'Largeur de cintre', 'mm', 0, fit.handlebarWidth),
    mk('crankLength', 'Manivelle', 'mm', 1, fit.crankLength),
    mk('cleatFore', 'Cales (avant/arrière)', 'mm', 1, fit.cleatFore),
  ];
}
