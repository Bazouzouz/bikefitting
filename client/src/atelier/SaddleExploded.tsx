import { useMemo, type JSX } from 'react';
import { Exploded } from './Exploded';
import { partPoints, saddleAssembly, type ClampVariant, type SaddleStep } from './saddleParts';

export { DEFAULT_VIEW } from './Exploded';

export interface SaddleExplodedProps {
  step: SaddleStep;
  /** Angle du tube de selle sur l'horizontale (°). */
  staDeg: number;
  open: boolean;
  /** Chariot à 2 vis (défaut) ou à 1 vis. */
  variant?: ClampVariant;
}

/**
 * Vue éclatée de la tige de selle en axonométrie 3/4 (style blueprint).
 * Pièces écartées le long de l'axe de la tige (inclinée à `staDeg`) ; pièce clé de l'étape en orange,
 * flèche du sens de serrage. Glisser horizontal, ← → ou boutons : rotation de ±40° ; double-clic : vue par défaut.
 */
export function SaddleExploded({ step, staDeg, open, variant = 'two-bolt' }: SaddleExplodedProps): JSX.Element {
  const asm = useMemo(() => saddleAssembly(staDeg, variant), [staDeg, variant]);
  return (
    <Exploded
      parts={asm.parts}
      keys={asm.keys[step]}
      gesture={asm.gestures[step]}
      points={partPoints}
      open={open}
      title="Tige de selle : vue éclatée"
      subject="de la tige de selle"
    />
  );
}
