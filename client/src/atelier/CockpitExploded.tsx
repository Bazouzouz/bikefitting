import { useMemo, type JSX } from 'react';
import { Exploded } from './Exploded';
import {
  cockpitAssembly,
  cockpitGeomAt,
  cockpitPartPoints,
  type CockpitAdjust,
  type CockpitGeom,
  type CockpitStep,
  type FaceplateVariant,
} from './cockpitParts';

export type { CockpitAdjust } from './cockpitParts';

export interface CockpitExplodedProps {
  step: CockpitStep;
  /** Angle de direction sur l'horizontale (°). */
  htaDeg: number;
  /** Potence dessinée (simulation du panneau ; valeurs de départ d'un réglage animé). */
  stemLength: number;
  stemAngle: number;
  /** Hauteur d'entretoises sous la potence (mm, départ) ; absente : pile d'exemple. */
  spacers?: number;
  /** Entretoises au-dessus de la potence (mm, départ) ; absentes : ni pièce ni transfert (le pivot suit la pile). */
  spacersAbove?: number;
  /** Largeur de cintre (mm, départ) : seul l'écart `adjust.handlebarWidth` est dessiné. */
  handlebarWidth?: number;
  open: boolean;
  /** Façade à 4 vis (défaut) ou à 2 vis. */
  variant?: FaceplateVariant;
  /**
   * Réglage animé de l'extérieur (rAF) : écarts au temps `t`. Entretoises, longueur et angle de potence hors temps
   * « bar » ; largeur de cintre au temps « bar » seulement.
   */
  adjust?: CockpitAdjust;
  /** Dessin seul (minimap) : sans libellés ni barre de rotation. */
  compact?: boolean;
}

/**
 * Vue éclatée du cockpit en axonométrie 3/4 (style blueprint), même mécanique que SaddleExploded (iso.ts) :
 * pivot, entretoises (dessous, et dessus si `spacersAbove`), potence et ses vis de pivot, capot et vis de compression,
 * cintre, façade et ses 2 ou 4 vis. Pièces écartées le long du pivot (incliné à `htaDeg`) et de la potence ; pièces
 * clés du temps en orange, flèche du sens de serrage. Glisser horizontal, ← → ou boutons : rotation de ±40° ;
 * double-clic : vue par défaut.
 * Avec `adjust`, l'assemblage est recalculé au temps `t` (`cockpitGeomAt` : transfert d'entretoises continu, bague en
 * transit contre la potence ; au temps « bar », le tronçon de cintre s'allonge de l'écart de largeur) ; cadrage figé
 * sur le début et la fin du réglage.
 */
export function CockpitExploded({
  step,
  htaDeg,
  stemLength,
  stemAngle,
  spacers,
  spacersAbove,
  handlebarWidth,
  open,
  variant = 'four-bolt',
  adjust,
  compact,
}: CockpitExplodedProps): JSX.Element {
  // Écarts retenus pour le temps : cintre au temps « bar », le reste ailleurs.
  const dS = step === 'bar' ? undefined : adjust?.spacers;
  const dL = step === 'bar' ? undefined : adjust?.stemLength;
  const dA = step === 'bar' ? undefined : adjust?.stemAngle;
  const dW = step === 'bar' ? adjust?.handlebarWidth : undefined;
  const t = adjust?.t ?? 0;
  const g = cockpitGeomAt(
    { spacers, spacersAbove, stemLength, stemAngle, handlebarWidth },
    adjust ? { spacers: dS, stemLength: dL, stemAngle: dA, handlebarWidth: dW } : undefined,
    t,
  );
  const barDelta = dW ? (g.handlebarWidth ?? 0) - (handlebarWidth ?? 0) : 0;
  const asm = useMemo(
    () => cockpitAssembly(htaDeg, g.stemLength, g.stemAngle, variant, g.spacers, g.spacersAbove, barDelta),
    [htaDeg, g.stemLength, g.stemAngle, variant, g.spacers, g.spacersAbove, barDelta],
  );
  // Cadrage d'un réglage animé : début et fin (ne change pas à chaque image). Sinon : celui de l'assemblage dessiné.
  const frameStates = useMemo(() => {
    if (!dS && !dL && !dA && !dW) return undefined;
    const start: CockpitGeom = { spacers, spacersAbove, stemLength, stemAngle, handlebarWidth };
    const d = { spacers: dS, stemLength: dL, stemAngle: dA, handlebarWidth: dW };
    const at = (k: number) => {
      const q = cockpitGeomAt(start, d, k);
      const bd = dW ? (q.handlebarWidth ?? 0) - (handlebarWidth ?? 0) : 0;
      return { parts: cockpitAssembly(htaDeg, q.stemLength, q.stemAngle, variant, q.spacers, q.spacersAbove, bd).parts };
    };
    return [at(0), at(1)];
  }, [htaDeg, variant, spacers, spacersAbove, stemLength, stemAngle, handlebarWidth, dS, dL, dA, dW]);
  return (
    <Exploded
      parts={asm.parts}
      keys={asm.keys[step]}
      gesture={asm.gestures[step]}
      points={cockpitPartPoints}
      open={open}
      title="Cockpit : vue éclatée"
      subject="du cockpit (potence, entretoises, cintre)"
      compact={compact}
      adjusting={adjust !== undefined}
      frameStates={frameStates}
    />
  );
}
