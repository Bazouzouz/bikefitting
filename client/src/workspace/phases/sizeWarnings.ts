import type { Frame } from '../../blueprint/geometry';
import { fmtNum } from '../../blueprint/geometry';
import type { CurrentSetup, FitResult } from '../../fit/types';
import { buildRows } from '../../components/rows';

/** Préfixes des avertissements « <réglage> actuel(le) … hors plage » émis par le moteur (fit/index.ts) : remplacés par le jugement du tableau. */
const ENGINE_SETTING_LABELS = [
  'Hauteur de selle',
  'Recul de selle',
  'Longueur de potence',
  'Angle de potence',
  'Entretoises',
  'Largeur de cintre',
  'Manivelles',
  'Cales',
];

const isSettingWarning = (w: string): boolean => ENGINE_SETTING_LABELS.some((l) => w.startsWith(`${l} actuel(le) `));

/**
 * Avertissements de la phase Taille : réglages jugés « à corriger » par buildRows (même source que le tableau d'écarts,
 * tolérances de judge.ts) + avertissements du moteur qui ne portent pas sur un réglage du tableau.
 */
export function sizeWarnings(fit: FitResult, current: CurrentSetup, frame?: Frame): string[] {
  const off = buildRows(fit, current, frame)
    .filter((r) => r.status === 'off')
    .map((r) => `${r.label} : ${fmtNum(r.current, r.dec)} ${r.unit}, cible ${fmtNum(r.target, r.dec)} ${r.unit} — à corriger`);
  return [...fit.warnings.filter((w) => !isSettingWarning(w)), ...off];
}
