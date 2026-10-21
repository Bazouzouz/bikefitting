import type { Bike } from '@bikefit/shared';
import { computeFit } from '../fit';
import type { CurrentSetup, FitResult, RiderMeasurements } from '../fit/types';

/** Adaptateur unique vers le moteur de fitting (isole l'UI de sa signature). */
export function runFit(rider: RiderMeasurements, bike: Bike, current?: CurrentSetup, sizeLabel?: string): FitResult {
  return computeFit(rider, bike, current, sizeLabel);
}
