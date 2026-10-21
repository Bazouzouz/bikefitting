// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Bike } from '@bikefit/shared';
import type { CurrentSetup, RiderMeasurements } from '../fit/types';
import { runFit } from './fitAdapter';
import { buildRows } from './rows';
import { currentSetupFor, DEFAULT_RIDER } from './store';
import { toFrame } from '../blueprint/geometry';
import { saddleReadouts, simFromCurrent as saddleSim } from '../atelier/saddle';
import { cockpitReadouts, simFromCurrent as cockpitSim } from '../atelier/cockpit';

const sizes = [
  { label: 'M', stack: 572, reach: 391, seatTubeAngle: 73.5, headTubeAngle: 70, chainstay: 435, stemLength: 90, stemAngle: -6, spacers: 20, handlebarWidth: 420, crankLength: 172.5 },
];
const grvl: Bike = { id: 'grvl-af', brand: 'Van Rysel', model: 'GRVL AF', style: 'gravel', wheel: { bsd: 622, tyreWidth: 40 }, sizes };
const rider: RiderMeasurements = { ...DEFAULT_RIDER, height: 178, inseam: 83, torso: 60, shoulderWidth: 42 };

function scenario(patch: (t: ReturnType<typeof runFit>) => Partial<CurrentSetup> = () => ({})) {
  const size = sizes[0]!;
  const target = runFit(rider, grvl, undefined, 'M');
  const current = currentSetupFor(size, rider, patch(target), { saddleHeight: 700, saddleSetback: 60, cleatFore: 12.5 });
  const fit = runFit(rider, grvl, current, 'M');
  return { fit, current, frame: toFrame(size, 'gravel') };
}
const statusOf = (rows: ReturnType<typeof buildRows>, key: keyof CurrentSetup) => rows.find((r) => r.key === key)!.status;

describe('statut du tableau = « Réglé » des guides', () => {
  it('hauteur : écart 4 mm → à corriger ; 3 mm → toléré ; 0 → sur la cible', () => {
    for (const [gap, status] of [[4, 'off'], [3, 'within'], [-4, 'off'], [0, 'on']] as const) {
      const { fit, current, frame } = scenario((t) => ({ saddleHeight: Math.round(t.saddleHeight.value) - gap }));
      const row = buildRows(fit, current, frame).find((r) => r.key === 'saddleHeight')!;
      expect(row.status).toBe(status);
      const rd = saddleReadouts(fit, current, saddleSim(current, 0)).height;
      expect(rd.done).toBe(status !== 'off');
    }
  });

  it('exemple absolu : hauteur 727 vs cible 731 → à régler ; 728 → toléré', () => {
    for (const [cur, status] of [[727, 'off'], [728, 'within'], [731, 'on']] as const) {
      const base = scenario(() => ({ saddleHeight: cur }));
      const fit = { ...base.fit, saddleHeight: { ...base.fit.saddleHeight, value: 731 } };
      expect(statusOf(buildRows(fit, base.current, base.frame), 'saddleHeight')).toBe(status);
      expect(saddleReadouts(fit, base.current, saddleSim(base.current, 0)).height.done).toBe(status !== 'off');
    }
  });

  it('recul : +4 mm toléré (5 mm), +6 à corriger', () => {
    for (const [gap, status] of [[4, 'within'], [-4, 'within'], [6, 'off']] as const) {
      const { fit, current } = scenario((t) => ({ saddleSetback: Math.round(t.saddleSetback.value) + gap }));
      const row = buildRows(fit, current).find((r) => r.key === 'saddleSetback')!;
      expect(row.status).toBe(status);
      expect(saddleReadouts(fit, current, saddleSim(current, 0)).setback.done).toBe(status !== 'off');
    }
  });

  it('cockpit : entretoises, potence, cintre = temps du guide (cocottes ≤ reach, cintre ±20)', () => {
    const cases: Array<(t: ReturnType<typeof runFit>) => Partial<CurrentSetup>> = [
      () => ({}),
      (t) => ({ spacers: t.spacers.value + 5 }),
      (t) => ({ spacers: t.spacers.value + 40 }),
      (t) => ({ stemLength: t.stemLength.value + 10 }),
      (t) => ({ stemLength: t.stemLength.value + 30 }),
      (t) => ({ stemAngle: -t.stemAngle.value || 17 }),
      (t) => ({ handlebarWidth: t.handlebarWidth.value + 20 }),
      (t) => ({ handlebarWidth: t.handlebarWidth.value + 30 }),
    ];
    for (const c of cases) {
      const { fit, current, frame } = scenario(c);
      const rows = buildRows(fit, current, frame);
      const rd = cockpitReadouts(fit, current, cockpitSim(current), frame);
      const ok = (k: keyof CurrentSetup, done: boolean) => expect(statusOf(rows, k) !== 'off').toBe(done || statusOf(rows, k) === 'on');
      ok('spacers', rd.spacers.done);
      ok('stemLength', rd.stem.done);
      ok('stemAngle', rd.stem.done);
      ok('handlebarWidth', rd.bar.done);
    }
    const { fit, current, frame } = scenario((t) => ({ handlebarWidth: t.handlebarWidth.value + 30 }));
    expect(statusOf(buildRows(fit, current, frame), 'handlebarWidth')).toBe('off');
  });

  it('sans cadre : cockpit garde la plage du moteur, pas de récursion', () => {
    const { fit, current } = scenario();
    expect(buildRows(fit, current)).toHaveLength(8);
  });
});
