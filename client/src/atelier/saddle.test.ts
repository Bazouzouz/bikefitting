// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Bike } from '@bikefit/shared';
import { computeSaddleSetback, RAIL_ADJUST, SADDLE_NOSE_TO_SIT, cleatAdvice, crankLength } from '../fit';
import type { CurrentSetup, RiderMeasurements } from '../fit/types';
import { runFit } from '../components/fitAdapter';
import { buildRows } from '../components/rows';
import { currentSetupFor, DEFAULT_RIDER } from '../components/store';
import { saddleShape } from '../blueprint/BikeBlueprint';
import { fmtNum, setupFromFit, toFrame } from '../blueprint/geometry';
import {
  coupledSetbackShift,
  ghostNose,
  overridesFromSim,
  fmtAngle,
  railFromSetback,
  railsState,
  saddleOutline,
  saddleReadouts,
  setbackFromRail,
  simFromCurrent,
  simWithHeight,
  simWithSetback,
  simWithTilt,
  tiltLine,
  TILT_RANGE,
  TILT_TARGET,
} from './saddle';
import { postUp, saddleAssembly, saddleMoves, saddleTiltAt } from './saddleParts';

/** GRVL AF (5 tailles, tube de selle à 73,5°, comme server/data/bikes.json). */
const grvl: Bike = {
  id: 'grvl-af',
  brand: 'Van Rysel',
  model: 'GRVL AF',
  style: 'gravel',
  wheel: { bsd: 622, tyreWidth: 40 },
  sizes: [
    { label: 'XS', stack: 525, reach: 365, seatTubeAngle: 73.5, headTubeAngle: 69, chainstay: 435, stemLength: 70, stemAngle: -6, spacers: 20, handlebarWidth: 400, crankLength: 165 },
    { label: 'S', stack: 548, reach: 378, seatTubeAngle: 73.5, headTubeAngle: 69.5, chainstay: 435, stemLength: 80, stemAngle: -6, spacers: 20, handlebarWidth: 420, crankLength: 170 },
    { label: 'M', stack: 572, reach: 391, seatTubeAngle: 73.5, headTubeAngle: 70, chainstay: 435, stemLength: 90, stemAngle: -6, spacers: 20, handlebarWidth: 420, crankLength: 172.5 },
    { label: 'L', stack: 597, reach: 403, seatTubeAngle: 73.5, headTubeAngle: 70.5, chainstay: 435, stemLength: 100, stemAngle: -6, spacers: 20, handlebarWidth: 440, crankLength: 172.5 },
    { label: 'XL', stack: 622, reach: 414, seatTubeAngle: 73.5, headTubeAngle: 71, chainstay: 440, stemLength: 110, stemAngle: -6, spacers: 20, handlebarWidth: 440, crankLength: 175 },
  ],
};
const rider: RiderMeasurements = { ...DEFAULT_RIDER, height: 178, inseam: 83, torso: 60, shoulderWidth: 42 };
const STA = 73.5;

/** Même chemin que useFit : réglage « d'usine » estimé, puis moteur avec ce réglage actuel. */
function scenario(overrides: Partial<CurrentSetup> = {}) {
  const base = runFit(rider, grvl);
  const size = grvl.sizes.find((s) => s.label === base.recommendedSize)!;
  const current = currentSetupFor(size, rider, overrides, { saddleHeight: Math.round(rider.inseam * 10 * 0.86), saddleSetback: 60, cleatFore: 12.5 });
  const fit = runFit(rider, grvl, current, size.label);
  return { fit, current, size };
}

describe('couplage hauteur → recul (tube de selle incliné)', () => {
  it('ΔH = +10 mm recule la selle de +2,84 mm sur le GRVL (STA 73,5°)', () => {
    expect(coupledSetbackShift(10, STA)).toBeCloseTo(2.84, 2);
    const sim = { height: 700, setback: 60, tilt: 0 };
    const up = simWithHeight(sim, 710, STA);
    expect(up.setback - sim.setback).toBeCloseTo(2.84, 2);
    expect(overridesFromSim(up)).toEqual({ saddleHeight: 710, saddleSetback: 62.8 }); // enregistré au dixième
    // aller-retour au curseur : pas de dérive
    let s2 = sim;
    for (let h = 701; h <= 760; h++) s2 = simWithHeight(s2, h, STA);
    for (let h = 759; h >= 700; h--) s2 = simWithHeight(s2, h, STA);
    expect(s2.setback).toBeCloseTo(60, 9);
    // rails inchangés quand on monte
    expect(railFromSetback(710, 60 + coupledSetbackShift(10, STA), STA)).toBeCloseTo(railFromSetback(700, 60, STA), 9);
  });
  it('descendre avance la selle ; changer le recul ne touche pas la hauteur', () => {
    const sim = { height: 700, setback: 60, tilt: 0 };
    expect(simWithHeight(sim, 690, STA).setback).toBeCloseTo(57.16, 2);
    expect(simWithSetback(sim, 70)).toEqual({ height: 700, setback: 70, tilt: 0 });
    expect(simWithTilt(sim, -1)).toEqual({ height: 700, setback: 60, tilt: -1 });
  });
  it('rails ↔ recul : fonctions réciproques, signe du recul de tige', () => {
    const r = railFromSetback(735, 62, STA, 15);
    expect(setbackFromRail(735, r, STA, 15)).toBeCloseTo(62, 9);
    // une tige à recul de 15 mm laisse la selle 15 mm plus en avant sur les rails pour le même recul
    expect(railFromSetback(735, 62, STA, 15) - railFromSetback(735, 62, STA, 0)).toBeCloseTo(15, 9);
  });
});

describe('position sur les rails = décalage au point d’assise du moteur', () => {
  it('cible : r = offsetFromSeatTube de computeSaddleSetback (angle du cadre)', () => {
    const { fit, size, current } = scenario();
    const crank = crankLength(rider).value;
    const cleat = cleatAdvice(rider).fore.value;
    const feas = computeSaddleSetback(rider, fit.saddleHeight.value, size.seatTubeAngle, crank, cleat);
    const rails = railsState(fit, simFromCurrent(current, 0), size.seatTubeAngle);
    // le moteur arrondit la pointe au mm : 0,5 mm près
    expect(Math.abs(rails.target - feas.offsetFromSeatTube)).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(rails.targetOk).toBe(Math.abs(rails.target) <= RAIL_ADJUST);
  });
  it('railFromSetback(H, recul, sta) = offsetFromSeatTube du moteur, pour plusieurs hauteurs et angles de cadre', () => {
    const { size } = scenario();
    const crank = crankLength(rider).value;
    const cleat = cleatAdvice(rider).fore.value;
    for (const h of [680, 720, 760]) {
      for (const sta of [size.seatTubeAngle - 2, size.seatTubeAngle, size.seatTubeAngle + 2]) {
        const feas = computeSaddleSetback(rider, h, sta, crank, cleat);
        // le moteur arrondit la pointe au mm : 0,5 mm près
        expect(Math.abs(railFromSetback(h, feas.target.value, sta) - feas.offsetFromSeatTube)).toBeLessThanOrEqual(0.5 + 1e-9);
      }
    }
  });
  it('avertissement du moteur repris tel quel quand la cible sort des rails', () => {
    const { fit } = scenario();
    const fake = { ...fit, warnings: [...fit.warnings, 'Recul KOPS non atteignable avec un tube de selle à 73.5° : test.'] };
    const rails = railsState(fake, { height: 700, setback: 60, tilt: 0 }, STA);
    expect(rails.engine).toContain('Recul KOPS non atteignable avec un tube de selle à 73.5° : test.');
  });
});

describe('lectures identiques à DeltaTable et au moteur', () => {
  it('simulation non modifiée : actuel, cible et écart = lignes de buildRows', () => {
    const { fit, current } = scenario();
    const rd = saddleReadouts(fit, current, simFromCurrent(current, 0));
    const rows = buildRows(fit, current);
    const h = rows.find((r) => r.key === 'saddleHeight')!;
    const s = rows.find((r) => r.key === 'saddleSetback')!;
    expect(rd.height.current).toBe(h.current);
    expect(rd.height.target).toBe(h.target);
    expect(rd.height.gap).toBe(h.target - h.current); // colonne « Écart » de DeltaTable
    expect(rd.setback.current).toBe(s.current);
    expect(rd.setback.target).toBe(s.target);
    expect(rd.setback.gap).toBe(s.target - s.current);
    // cibles = moteur
    expect(rd.height.target).toBe(fit.saddleHeight.value);
    expect(rd.setback.target).toBe(fit.saddleSetback.value);
    expect(rd.height.why).toBe(fit.saddleHeight.explanation.rationale);
  });
  it('après « Enregistrer » : DeltaTable relit exactement la simulation', () => {
    const { fit, current } = scenario();
    const sim = simWithHeight(simFromCurrent(current, 0), fit.saddleHeight.value, STA);
    const after = scenario(overridesFromSim(sim));
    const rd = saddleReadouts(fit, current, sim);
    const rows = buildRows(after.fit, after.current);
    // valeurs affichées (fmtNum au décimal de la ligne) identiques ; enregistrées au dixième près
    const shownRow = (k: string) => {
      const r = rows.find((x) => x.key === k)!;
      return fmtNum(r.current, r.dec);
    };
    expect(shownRow('saddleHeight')).toBe(fmtNum(rd.height.current, rd.height.dec));
    expect(shownRow('saddleSetback')).toBe(fmtNum(rd.setback.current, rd.setback.dec));
    expect(Math.abs(after.current.saddleSetback - rd.setback.current)).toBeLessThanOrEqual(0.05);
    // le réglage actuel ne change pas les cibles du moteur
    expect(after.fit.saddleHeight.value).toBe(fit.saddleHeight.value);
    expect(after.fit.saddleSetback.value).toBe(fit.saddleSetback.value);
  });
  it('« Réglé » selon fit.tolerances (3 et 5 mm), écart jugé tel qu’affiché', () => {
    const { fit, current } = scenario();
    const T = fit.saddleHeight.value;
    const at = (h: number) => saddleReadouts(fit, current, { height: h, setback: fit.saddleSetback.value, tilt: 0 });
    expect(fit.tolerances.saddleHeight).toBe(3);
    expect(fit.tolerances.saddleSetback).toBe(5);
    expect(at(T - 3).height.done).toBe(true);
    expect(at(T - 3.4).height.done).toBe(true); // affiché « +3 mm »
    expect(at(T - 4).height.done).toBe(false);
    expect(at(T).setback.done).toBe(true);
    const sb = (s: number) => saddleReadouts(fit, current, { height: T, setback: s, tilt: 0 }).setback.done;
    expect(sb(fit.saddleSetback.value + 5)).toBe(true);
    expect(sb(fit.saddleSetback.value + 6)).toBe(false);
  });
  it('inclinaison : cible 0°, réglée de −2° à 0°', () => {
    const { fit, current } = scenario();
    const t = (v: number) => saddleReadouts(fit, current, { height: 700, setback: 60, tilt: v }).tilt;
    expect(TILT_TARGET).toBe(0);
    expect(TILT_RANGE).toEqual([-2, 0]);
    expect(t(0).done).toBe(true);
    expect(t(-2).done).toBe(true);
    expect(t(0.5).done).toBe(false);
    expect(t(-2.5).done).toBe(false);
    expect(t(3).gap).toBe(-3);
  });
});

describe('fmtAngle', () => {
  it('signe typographique, une décimale, espace avant °', () => {
    expect(fmtAngle(1)).toBe('+1,0 °');
    expect(fmtAngle(-2)).toBe('−2,0 °');
    expect(fmtAngle(0)).toBe('0,0 °');
    expect(fmtAngle(-0.04)).toBe('0,0 °');
    expect(fmtAngle(2, false)).toBe('2,0 °');
  });
  it('tolérance de l’inclinaison au même format', () => {
    const { fit, current } = scenario();
    expect(saddleReadouts(fit, current, { height: 700, setback: 60, tilt: 0 }).tilt.tolerance).toBe('−2,0 ° à 0,0 °');
  });
});

describe('fantôme de la scène', () => {
  it('pointe = fit.saddlePosition (x = −recul cible)', () => {
    const { fit } = scenario();
    const n = ghostNose(fit);
    expect(n).toEqual(fit.saddlePosition);
    expect(n.x).toBe(-fit.saddleSetback.value);
    const o = saddleOutline(n, 0);
    // contour : la pointe du blueprint (saddleShape) est 8 mm sous le dessus de selle
    expect(o[0]!.x).toBeCloseTo(n.x, 9);
    expect(o[0]!.y).toBeCloseTo(n.y - 8, 9);
  });
  it('même silhouette que saddleShape du blueprint (de niveau)', () => {
    const { fit, size } = scenario();
    const frame = toFrame(size);
    const sh = saddleShape(frame, setupFromFit(fit));
    const o = saddleOutline({ x: sh.tipX, y: sh.tipY }, 0);
    o.forEach((p, i) => {
      expect(p.x).toBeCloseTo(sh.outline[i]!.x, 9);
      expect(p.y).toBeCloseTo(sh.outline[i]!.y, 9);
    });
  });
  it('écart vertical fantôme moteur / fantôme blueprint (angle effectif vs cadre) : quelques mm', () => {
    const { fit, size } = scenario();
    const sh = saddleShape(toFrame(size), setupFromFit(fit));
    expect(sh.tipX).toBe(fit.saddlePosition.x);
    expect(Math.abs(sh.tipY - fit.saddlePosition.y)).toBeLessThan(10);
  });
  it('inclinaison : rotation autour du chariot, ligne de lecture à l’angle demandé', () => {
    const n = { x: -60, y: 700 };
    const l = tiltLine(n, 3);
    const ang = (Math.atan2(l.nose.y - l.tail.y, l.nose.x - l.tail.x) * 180) / Math.PI;
    expect(ang).toBeCloseTo(3, 9);
    expect(tiltLine(n, 0).nose).toEqual(n);
    // le chariot ne bouge pas
    const c0 = { x: n.x - SADDLE_NOSE_TO_SIT, y: n.y - 28 };
    const o = saddleOutline(n, 5);
    const o0 = saddleOutline(n, 0);
    const d = (p: { x: number; y: number }) => Math.hypot(p.x - c0.x, p.y - c0.y);
    o.forEach((p, i) => expect(d(p)).toBeCloseTo(d(o0[i]!), 9));
  });
});

describe('vue éclatée : réglage animé de la tige de selle', () => {
  const pts = (a: ReturnType<typeof saddleAssembly>, id: string) => a.parts.find((p) => p.id === id)!.solid.faces.flatMap((f) => f.pts);
  it('tilt 0 = géométrie sans inclinaison', () => {
    expect(saddleAssembly(STA, 'two-bolt', 0)).toEqual(saddleAssembly(STA));
    expect(saddleAssembly(STA, 'one-bolt', 0)).toEqual(saddleAssembly(STA, 'one-bolt'));
  });
  it('inclinaison : rails et coque tournés autour du centre du chariot, bec relevé, autres pièces fixes', () => {
    const a0 = saddleAssembly(STA);
    const a5 = saddleAssembly(STA, 'two-bolt', 5);
    const r0 = pts(a0, 'rails');
    const r5 = pts(a5, 'rails');
    expect(r5.length).toBe(r0.length);
    r5.forEach((q, i) => {
      const p = r0[i]!;
      expect(Math.hypot(q[0], q[1], q[2])).toBeCloseTo(Math.hypot(p[0], p[1], p[2]), 9);
      expect(q[2]).toBeCloseTo(p[2], 9);
    });
    // bec (x max de la coque) relevé, angle de la rotation = 5°
    const nose = (a: ReturnType<typeof saddleAssembly>) => pts(a, 'shell').reduce((m, q) => (q[0] > m[0] ? q : m));
    expect(nose(a5)[1]).toBeGreaterThan(nose(a0)[1]);
    const marks0 = a0.parts.find((p) => p.id === 'rails')!.solid.marks!;
    const marks5 = a5.parts.find((p) => p.id === 'rails')!.solid.marks!;
    const ang = (v: readonly number[]) => Math.atan2(v[1]!, v[0]!);
    const m0 = marks0.find((m) => m.a[0] > 20)!;
    const m5 = marks5[marks0.indexOf(m0)]!;
    expect(((ang(m5.a) - ang(m0.a)) * 180) / Math.PI).toBeCloseTo(5, 9);
    for (const id of ['upper', 'lower', 'head', 'bolts', 'post', 'collar', 'collarBolt']) expect(pts(a5, id)).toEqual(pts(a0, id));
  });
  it('translations par étape : hauteur le long de la tige (sauf collier), recul sur rails et coque, rien pour tilt', () => {
    const up = postUp(STA);
    const h = saddleMoves('height', STA, 10, 0.5);
    expect(Object.keys(h).sort()).toEqual(['bolts', 'head', 'lower', 'post', 'rails', 'shell', 'upper']);
    expect(h.collar).toBeUndefined();
    expect(h.collarBolt).toBeUndefined();
    h.post!.forEach((v, i) => expect(v).toBeCloseTo(up[i]! * 5, 9));
    expect(h.post![1]).toBeGreaterThan(0); // + = monter
    expect(saddleMoves('setback', STA, 4, 1)).toEqual({ rails: [-4, 0, 0], shell: [-4, 0, 0] });
    expect(saddleMoves('setback', STA, 4, 0).rails![0]).toBeCloseTo(0, 9);
    expect(saddleMoves('tilt', STA, 2, 1)).toEqual({});
  });
  it('inclinaison actuelle : appliquée à tous les temps, tilt de from à from + delta', () => {
    expect(saddleTiltAt('height', -1.5, 4, 0.7)).toBe(-1.5);
    expect(saddleTiltAt('setback', -1.5, 4, 1)).toBe(-1.5);
    expect(saddleTiltAt('tilt', -1.5, 4, 0)).toBe(-1.5);
    expect(saddleTiltAt('tilt', -1.5, 4, 1)).toBeCloseTo(2.5, 9);
    // angle réel des rails (deux sommets des graduations d'un même rail) = inclinaison demandée
    const railAngle = (deg: number) => {
      const m = saddleAssembly(STA, 'two-bolt', deg).parts.find((p) => p.id === 'rails')!.solid.marks!;
      const m0 = saddleAssembly(STA).parts.find((p) => p.id === 'rails')!.solid.marks!;
      // graduations de même hauteur (x = ±35) du rail droit : leur ligne est parallèle aux rails
      const a = m[m0.findIndex((q) => q.a[0] === 35 && q.n[2] > 0)]!;
      const b = m[m0.findIndex((q) => q.a[0] === -35 && q.n[2] > 0)]!;
      return (Math.atan2(a.a[1] - b.a[1], a.a[0] - b.a[0]) * 180) / Math.PI;
    };
    expect(railAngle(saddleTiltAt('tilt', -1.5, 4, 0))).toBeCloseTo(-1.5, 6);
    expect(railAngle(saddleTiltAt('tilt', -1.5, 4, 1))).toBeCloseTo(2.5, 6);
    expect(railAngle(saddleTiltAt('height', -1.5, 4, 1))).toBeCloseTo(-1.5, 6);
  });
  it('recul : glissement le long des rails tournés de l’inclinaison actuelle', () => {
    for (const tilt of [-2, 0, 3]) {
      const m = saddleMoves('setback', STA, 6, 1, tilt);
      const v = m.rails!;
      expect(m.shell).toEqual(v);
      expect(Math.hypot(v[0], v[1])).toBeCloseTo(6, 9);
      // sens inverse de la direction des rails (cos, sin)
      expect((Math.atan2(-v[1], -v[0]) * 180) / Math.PI).toBeCloseTo(tilt, 9);
    }
    expect(saddleMoves('setback', STA, 4, 1, 0)).toEqual({ rails: [-4, 0, 0], shell: [-4, 0, 0] });
  });
});
