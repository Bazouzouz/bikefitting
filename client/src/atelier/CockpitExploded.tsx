import { useMemo, type JSX } from 'react';
import { Exploded } from './Exploded';
import { cockpitAssembly, cockpitPartPoints, type CockpitStep, type FaceplateVariant } from './cockpitParts';

export interface CockpitExplodedProps {
  step: CockpitStep;
  /** Angle de direction sur l'horizontale (°). */
  htaDeg: number;
  /** Potence dessinée (simulation du panneau). */
  stemLength: number;
  stemAngle: number;
  open: boolean;
  /** Façade à 4 vis (défaut) ou à 2 vis. */
  variant?: FaceplateVariant;
}

/**
 * Vue éclatée du cockpit en axonométrie 3/4 (style blueprint), même mécanique que SaddleExploded (iso.ts) :
 * pivot, entretoises, potence et ses vis de pivot, capot et vis de compression, cintre, façade et ses 2 ou 4 vis.
 * Pièces écartées le long du pivot (incliné à `htaDeg`) et de la potence ; pièces clés du temps en orange, flèche du
 * sens de serrage. Glisser horizontal, ← → ou boutons : rotation de ±40° ; double-clic : vue par défaut.
 */
export function CockpitExploded({ step, htaDeg, stemLength, stemAngle, open, variant = 'four-bolt' }: CockpitExplodedProps): JSX.Element {
  const asm = useMemo(() => cockpitAssembly(htaDeg, stemLength, stemAngle, variant), [htaDeg, stemLength, stemAngle, variant]);
  return (
    <Exploded
      parts={asm.parts}
      keys={asm.keys[step]}
      gesture={asm.gestures[step]}
      points={cockpitPartPoints}
      open={open}
      title="Cockpit : vue éclatée"
      subject="du cockpit (potence, entretoises, cintre)"
    />
  );
}
