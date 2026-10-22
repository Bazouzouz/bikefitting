import { useMemo, type JSX } from 'react';
import { Exploded } from './Exploded';
import { partPoints, saddleAssembly, saddleMoves, saddleTiltAt, type ClampVariant, type SaddleStep } from './saddleParts';

export { DEFAULT_VIEW } from './Exploded';

/** Réglage animé : écart à parcourir (mm, ou ° pour tilt) au temps `t` ∈ [0, 1]. */
export interface SaddleAdjust {
  /** height : + = monter ; setback : + = reculer la selle ; tilt : + = bec relevé. */
  delta: number;
  t: number;
  /** Inclinaison actuelle de la selle (°, + = bec relevé), appliquée à tous les temps ; au temps tilt, la selle va de `from` à `from + delta`. */
  from?: number;
}

export interface SaddleExplodedProps {
  step: SaddleStep;
  /** Angle du tube de selle sur l'horizontale (°). */
  staDeg: number;
  open: boolean;
  /** Chariot à 2 vis (défaut) ou à 1 vis. */
  variant?: ClampVariant;
  /** Réglage de l'étape animé de l'extérieur (rAF) : hauteur et recul par translation, inclinaison par rotation. */
  adjust?: SaddleAdjust;
  /** Dessin seul (minimap) : sans libellés ni barre de rotation. */
  compact?: boolean;
}

/**
 * Vue éclatée de la tige de selle en axonométrie 3/4 (style blueprint).
 * Pièces écartées le long de l'axe de la tige (inclinée à `staDeg`) ; pièce clé de l'étape en orange,
 * flèche du sens de serrage. Glisser horizontal, ← → ou boutons : rotation de ±40° ; double-clic : vue par défaut.
 * Avec `adjust`, le réglage est joué au temps `t` ; cadrage figé sur le début et la fin du réglage.
 */
export function SaddleExploded({ step, staDeg, open, variant = 'two-bolt', adjust, compact }: SaddleExplodedProps): JSX.Element {
  const delta = adjust?.delta;
  const t = adjust?.t ?? 0;
  const from = adjust?.from ?? 0;
  const tilt = saddleTiltAt(step, from, delta ?? 0, t);
  const ref = useMemo(() => saddleAssembly(staDeg, variant), [staDeg, variant]);
  const asm = useMemo(() => (tilt ? saddleAssembly(staDeg, variant, tilt) : ref), [ref, staDeg, variant, tilt]);
  const moves = useMemo(() => (delta === undefined ? undefined : saddleMoves(step, staDeg, delta, t, from)), [step, staDeg, delta, t, from]);
  // Cadrage : début et fin du réglage (ne change pas à chaque image).
  const frameStates = useMemo(() => {
    const start = { parts: from ? saddleAssembly(staDeg, variant, from).parts : ref.parts };
    if (!delta) return [start];
    const end = saddleAssembly(staDeg, variant, saddleTiltAt(step, from, delta, 1)).parts;
    return [start, { parts: end, moves: saddleMoves(step, staDeg, delta, 1, from) }];
  }, [ref, step, staDeg, variant, delta, from]);
  return (
    <Exploded
      parts={asm.parts}
      keys={asm.keys[step]}
      gesture={asm.gestures[step]}
      points={partPoints}
      open={open}
      title="Tige de selle : vue éclatée"
      subject="de la tige de selle"
      moves={moves}
      compact={compact}
      adjusting={adjust !== undefined}
      frameStates={frameStates}
    />
  );
}
