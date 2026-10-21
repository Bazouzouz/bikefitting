import type { Bike } from '@bikefit/shared';

/** Van Rysel GRVL AF (2 tailles suffisent aux tests de composants ; géométrie de server/data/bikes.json). */
export const grvlBike: Bike = {
  id: 'grvl-af',
  brand: 'Van Rysel',
  model: 'GRVL AF',
  style: 'gravel',
  wheel: { bsd: 622, tyreWidth: 40 },
  sizes: [
    { label: 'M', stack: 572, reach: 391, seatTubeAngle: 73.5, headTubeAngle: 70, chainstay: 435, stemLength: 90, stemAngle: -6, spacers: 20, handlebarWidth: 420, crankLength: 172.5 },
    { label: 'L', stack: 597, reach: 403, seatTubeAngle: 73.5, headTubeAngle: 70.5, chainstay: 435, stemLength: 100, stemAngle: -6, spacers: 20, handlebarWidth: 440, crankLength: 172.5 },
  ],
};
