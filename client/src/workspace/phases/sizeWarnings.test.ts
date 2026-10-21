// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Bike } from '@bikefit/shared';
import { runFit } from '../../components/fitAdapter';
import { currentSetupFor, DEFAULT_RIDER } from '../../components/store';
import { buildRows } from '../../components/rows';
import { fmtNum, toFrame } from '../../blueprint/geometry';
import { sizeWarnings } from './sizeWarnings';

const sizes = [
  { label: 'M', stack: 572, reach: 391, seatTubeAngle: 73.5, headTubeAngle: 70, chainstay: 435, stemLength: 90, stemAngle: -6, spacers: 20, handlebarWidth: 420, crankLength: 172.5 },
];
const bike: Bike = { id: 'g', brand: 'X', model: 'Y', style: 'gravel', wheel: { bsd: 622, tyreWidth: 40 }, sizes };
const rider = { ...DEFAULT_RIDER, height: 178, inseam: 83, torso: 60, shoulderWidth: 42 };

describe('sizeWarnings', () => {
  const size = sizes[0]!;
  const current = currentSetupFor(size, rider, {}, { saddleHeight: 700, saddleSetback: 60, cleatFore: 12.5 });
  const fit = runFit(rider, bike, current, 'M');
  const frame = toFrame(size, 'gravel');

  it("n'affiche que les réglages « à corriger » du tableau, sans les messages de plage du moteur", () => {
    const w = sizeWarnings(fit, current, frame);
    const off = buildRows(fit, current, frame).filter((r) => r.status === 'off');
    expect(w.filter((x) => x.endsWith('à corriger'))).toHaveLength(off.length);
    expect(w.some((x) => x.includes('hors plage'))).toBe(false);
    expect(off.length).toBeGreaterThan(0);
    expect(w).toEqual(
      expect.arrayContaining(
        off.map((r) => `${r.label} : ${fmtNum(r.current, r.dec)} ${r.unit}, cible ${fmtNum(r.target, r.dec)} ${r.unit} — à corriger`),
      ),
    );
  });

  it('un réglage toléré ne produit aucun message', () => {
    const rows = buildRows(fit, current, frame);
    const w = sizeWarnings(fit, current, frame).join('\n');
    for (const r of rows.filter((x) => x.status !== 'off')) expect(w).not.toContain(`${r.label} :`);
  });
});
