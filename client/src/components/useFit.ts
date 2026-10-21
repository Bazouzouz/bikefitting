import { useMemo } from 'react';
import type { BikeSize } from '@bikefit/shared';
import type { CurrentSetup, FitResult } from '../fit/types';
import { runFit } from './fitAdapter';
import { currentSetupFor, NEUTRAL_CLEAT_FORE, useStore } from './store';

export interface FitState {
  fit: FitResult;
  size: BikeSize;
  current: CurrentSetup;
  recommended: string;
  selected: string;
}

/** Calcule le fit pour la taille choisie (ou recommandée) et les réglages actuels. */
export function useFit(): { state: FitState | null; error: string | null } {
  const bike = useStore((s) => s.bike);
  const rider = useStore((s) => s.rider);
  const sizeLabel = useStore((s) => s.sizeLabel);
  const overrides = useStore((s) => s.overrides);
  return useMemo(() => {
    if (!bike || bike.sizes.length === 0) return { state: null, error: null };
    try {
      const first = bike.sizes[0]!;
      const base = runFit(rider, bike, undefined, undefined);
      // Selle inconnue du catalogue : estimation d'un réglage « d'usine » (0,86 × entrejambe, recul 60 mm), à
      // mesurer sur le vrai vélo. Ce n'est PAS la cible : l'écart affiché montre la correction à faire.
      const neutral = { saddleHeight: Math.round(rider.inseam * 10 * 0.86), saddleSetback: 60, cleatFore: NEUTRAL_CLEAT_FORE };
      const selected = sizeLabel && bike.sizes.some((s) => s.label === sizeLabel) ? sizeLabel : base.recommendedSize;
      const size = bike.sizes.find((s) => s.label === selected) ?? first;
      const current = currentSetupFor(size, rider, overrides, neutral);
      const fit = runFit(rider, bike, current, selected);
      return { state: { fit, size, current, recommended: base.recommendedSize, selected: size.label }, error: null };
    } catch (e) {
      return { state: null, error: (e as Error).message };
    }
  }, [bike, rider, sizeLabel, overrides]);
}
