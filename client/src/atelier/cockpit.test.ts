// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Bike } from '@bikefit/shared';
import { hoodsPosition, STEM_ANGLES, STEM_LENGTHS } from '../fit';
import type { CurrentSetup, RiderMeasurements } from '../fit/types';
import { runFit } from '../components/fitAdapter';
import { buildRows } from '../components/rows';
import { currentSetupFor, DEFAULT_RIDER } from '../components/store';
import { cockpit, frameGeometry, setupFromCurrent, setupFromFit, toFrame, wheelRadius } from '../blueprint/geometry';
import {
  cockpitReadouts,
  columnSpace,
  dropReadout,
  ghostHoods,
  hoodsShift,
  hoodsState,
  overridesFromSim,
  simFromCurrent,
  simHoods,
  simWithBar,
  simWithSpacers,
  simWithSpacersAbove,
  simWithStem,
  snapTo,
  spacerMove,
  stemAngleOptions,
  stemChange,
  stemLengthOptions,
  type CockpitSim,
} from './cockpit';
import { BAR_HALF, BAR_HALF_MIN, cockpitAssembly, cockpitGeomAt, spacerRings, spacerStack, SPACER_STACK_MM } from './cockpitParts';
import { gestureSim } from './CockpitGuide';

/** GRVL AF (5 tailles, comme server/data/bikes.json et saddle.test.ts). */
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

/** Même chemin que useFit : réglage « d'usine » estimé, puis moteur avec ce réglage actuel. */
function scenario(overrides: Partial<CurrentSetup> = {}, label?: string) {
  const base = runFit(rider, grvl);
  const size = grvl.sizes.find((s) => s.label === (label ?? base.recommendedSize))!;
  const current = currentSetupFor(size, rider, overrides, { saddleHeight: Math.round(rider.inseam * 10 * 0.86), saddleSetback: 60, cleatFore: 12.5 });
  const fit = runFit(rider, grvl, current, size.label);
  const frame = toFrame(size, 'gravel');
  return { fit, current, size, frame };
}

describe('cocottes fantômes = cible du blueprint et du moteur', () => {
  for (const label of ['XS', 'S', 'M', 'L', 'XL']) {
    it(`taille ${label} : < 1 mm de cockpit(g, setupFromFit(fit)).hands et de hoodsPosition du moteur`, () => {
      const { fit, frame, size } = scenario({}, label);
      const g = frameGeometry(frame, wheelRadius(grvl.wheel));
      const ref = cockpit(g, setupFromFit(fit)).hands;
      const ghost = ghostHoods(frame, fit);
      expect(Math.hypot(ghost.x - ref.x, ghost.y - ref.y)).toBeLessThan(1);
      // chemin indépendant : fonction du moteur (fit/cockpit.ts), réglage potence/entretoises du fit
      const eng = hoodsPosition(size, { stemLength: fit.stemLength.value, stemAngle: fit.stemAngle.value, spacers: fit.spacers.value });
      expect(Math.hypot(ghost.x - eng.x, ghost.y - eng.y)).toBeLessThan(1);
    });
  }
  it('simulation à la cible : cocottes simulées sur les cocottes fantômes, « Réglé »', () => {
    const { fit, current, frame } = scenario();
    const sim: CockpitSim = { ...simFromCurrent(current), spacers: fit.spacers.value, stemLength: fit.stemLength.value, stemAngle: fit.stemAngle.value };
    const h = hoodsState(fit, current, sim, frame);
    expect(h.dist).toBeLessThan(1e-9);
    expect(h.done).toBe(true);
  });
});

describe('lectures identiques à DeltaTable et au moteur', () => {
  it('simulation non modifiée : actuel, cible et écart = lignes de buildRows (4 réglages)', () => {
    const { fit, current, frame } = scenario();
    const rd = cockpitReadouts(fit, current, simFromCurrent(current), frame);
    const rows = buildRows(fit, current);
    const lines = [...rd.spacers.lines, ...rd.stem.lines, ...rd.bar.lines];
    expect(lines.map((l) => l.key)).toEqual(['spacers', 'stemLength', 'stemAngle', 'handlebarWidth']);
    for (const l of lines) {
      const row = rows.find((r) => r.key === l.key)!;
      expect(l.current).toBe(row.current);
      expect(l.target).toBe(row.target);
      expect(l.gap).toBe(row.target - row.current); // colonne « Écart » de DeltaTable
      expect(l.unit).toBe(row.unit);
    }
    expect(rd.spacers.lines[0]!.target).toBe(fit.spacers.value);
    expect(rd.stem.lines[0]!.target).toBe(fit.stemLength.value);
    expect(rd.stem.lines[1]!.target).toBe(fit.stemAngle.value);
    expect(rd.bar.lines[0]!.target).toBe(fit.handlebarWidth.value);
    expect(rd.spacers.why).toBe(fit.spacers.explanation.rationale);
  });
  it('après « Enregistrer » : DeltaTable relit exactement la simulation, cibles inchangées', () => {
    const { fit, current, frame } = scenario();
    const sim = simWithBar(simWithStem(simWithSpacers(simFromCurrent(current), 10), 100, 6), 440);
    const after = scenario(overridesFromSim(sim));
    const rd = cockpitReadouts(fit, current, sim, frame);
    const rows = buildRows(after.fit, after.current);
    for (const l of [...rd.spacers.lines, ...rd.stem.lines, ...rd.bar.lines]) expect(rows.find((r) => r.key === l.key)!.current).toBe(l.current);
    expect(after.fit.stemLength.value).toBe(fit.stemLength.value);
    expect(after.fit.spacers.value).toBe(fit.spacers.value);
  });
});

describe('« Réglé » selon fit.tolerances.reach (cocottes) et la plage du cintre', () => {
  it('entretoises : 10 mm d’écart passent, 15 mm non (1 mm d’entretoise = 1 mm de cocottes)', () => {
    const { fit, current, frame } = scenario();
    expect(fit.tolerances.reach).toBe(10);
    const T = fit.spacers.value;
    const at = (sp: number) => cockpitReadouts(fit, current, { ...simFromCurrent(current, 40), spacers: sp }, frame).spacers;
    expect(at(T).done).toBe(true);
    expect(at(T + 10).shift).toBeCloseTo(10, 9);
    expect(at(T + 10).done).toBe(true);
    expect(at(T + 15).done).toBe(false);
  });
  it('potence : ±10 mm de longueur passe, ±11 mm non ; retourner une −6° (90 mm) déplace les cocottes de > 10 mm', () => {
    const { fit, current, frame } = scenario();
    const L = fit.stemLength.value;
    const A = fit.stemAngle.value;
    const at = (len: number, ang: number) => cockpitReadouts(fit, current, simWithStem(simFromCurrent(current), len, ang), frame).stem;
    expect(at(L, A).done).toBe(true);
    expect(at(L + 10, A).shift).toBeCloseTo(10, 9);
    expect(at(L + 10, A).done).toBe(true);
    expect(at(L + 11, A).done).toBe(false);
    expect(at(L, -A === A ? 17 : -A).done).toBe(false);
  });
  it('cintre : plage du moteur (cible ±20 mm)', () => {
    const { fit, current, frame } = scenario();
    const W = fit.handlebarWidth.value;
    const at = (w: number) => cockpitReadouts(fit, current, simWithBar(simFromCurrent(current), w), frame).bar.done;
    expect(fit.handlebarWidth.range).toEqual([W - 20, W + 20]);
    expect(at(W + 20)).toBe(true);
    expect(at(W - 20)).toBe(true);
    expect(at(W + 30)).toBe(false);
  });
});

describe('entretoises : pivot de longueur constante', () => {
  it('déplacer dessous ↔ dessus conserve la somme, bornée au pivot', () => {
    const s0 = { spacers: 20, spacersAbove: 5, stemLength: 90, stemAngle: -6, handlebarWidth: 420 };
    expect(columnSpace(s0)).toBe(25);
    expect(simWithSpacers(s0, 10)).toMatchObject({ spacers: 10, spacersAbove: 15 });
    expect(simWithSpacers(s0, 40)).toMatchObject({ spacers: 25, spacersAbove: 0 }); // pas plus que le pivot
    expect(simWithSpacers(s0, -5)).toMatchObject({ spacers: 0, spacersAbove: 25 });
    expect(columnSpace(simWithSpacers(s0, 15))).toBe(25);
    expect(simWithSpacersAbove(s0, 15)).toMatchObject({ spacers: 20, spacersAbove: 15 });
  });
  it('cible au-delà du pivot : non faisable, pivot manquant', () => {
    const s0 = { spacers: 20, spacersAbove: 5, stemLength: 90, stemAngle: -6, handlebarWidth: 420 };
    expect(spacerMove(s0, 35)).toEqual({ delta: 15, total: 25, feasible: false, missing: 10 });
    expect(spacerMove(s0, 10)).toEqual({ delta: -10, total: 25, feasible: true, missing: 0 });
  });
  it('5 mm d’entretoise montent ET reculent les cocottes le long du pivot (HTA)', () => {
    const { current, frame, size } = scenario();
    const d = hoodsShift(frame, setupFromCurrent(current), { spacers: current.spacers + 5 });
    const h = (size.headTubeAngle * Math.PI) / 180;
    expect(d.x).toBeCloseTo(-5 * Math.cos(h), 9);
    expect(d.y).toBeCloseTo(5 * Math.sin(h), 9);
  });
});

describe('potence et cintre : grilles du moteur', () => {
  it('STEM_LENGTHS / STEM_ANGLES, valeur actuelle hors grille ajoutée (pas de saut silencieux)', () => {
    expect(stemLengthOptions()).toEqual(STEM_LENGTHS);
    expect(stemAngleOptions(-6)).toEqual(STEM_ANGLES);
    expect(stemLengthOptions(85)).toEqual([60, 70, 80, 85, 90, 100, 110, 120]);
    expect(stemAngleOptions(-8)).toEqual([-17, -8, -6, 6, 17]);
    expect(snapTo(STEM_LENGTHS, 94)).toBe(90);
    expect(snapTo(STEM_LENGTHS, 140)).toBe(120);
    expect(snapTo(STEM_ANGLES, 0)).toBe(-6); // à égalité : la plus petite
  });
  it('retourner, remplacer, rien', () => {
    expect(stemChange(90, -6, 90, 6)).toBe('flip');
    expect(stemChange(90, -6, 100, -6)).toBe('replace');
    expect(stemChange(90, -6, 90, -6)).toBe('none');
    expect(stemChange(90, -6, 90, 17)).toBe('replace');
  });
  it('geste : repart de la simulation de départ, la potence arrive sur la grille', () => {
    const s0 = { spacers: 20, spacersAbove: 5, stemLength: 90, stemAngle: -6, handlebarWidth: 420 };
    expect(gestureSim('spacers', s0, { spacers: 12.5 })).toMatchObject({ spacers: 12.5, spacersAbove: 12.5 });
    expect(gestureSim('stem', s0, { stemLength: 100, stemAngle: 6 })).toMatchObject({ stemLength: 100, stemAngle: 6, spacers: 20 });
    expect(gestureSim('bar', s0, { handlebarWidth: 440 })).toMatchObject({ handlebarWidth: 440, stemLength: 90 });
  });
});

describe('drop selle → cocottes', () => {
  it('cible = moteur ; actuel = dessus de selle − cocottes simulées ; au fantôme, écart de quelques mm', () => {
    const { fit, current, frame } = scenario();
    const atTarget = { ...simFromCurrent(current), spacers: fit.spacers.value, stemLength: fit.stemLength.value, stemAngle: fit.stemAngle.value };
    const d = dropReadout(fit, { ...current, saddleHeight: fit.saddleHeight.value }, atTarget, frame);
    expect(d.target).toBe(fit.saddleToBarDrop.value);
    expect(d.range).toEqual(fit.saddleToBarDrop.range);
    expect(d.current).toBeCloseTo(d.saddleY - simHoods(frame, current, atTarget).y, 9);
    // moteur : point d'assise (angle effectif) → fit.hands ; blueprint : dessus de selle (angle du cadre) → cocottes de la solution
    expect(Math.abs(d.gap)).toBeLessThan(20);
  });
});

describe('vue éclatée : pièces du cockpit', () => {
  it('capot, vis de compression, entretoises, potence, vis de pivot, façade à 4 ou 2 vis, cintre, pivot', () => {
    const a4 = cockpitAssembly(70, 90, -6, 'four-bolt');
    expect(a4.parts.map((p) => p.id).sort()).toEqual(['bar', 'barBolts', 'capBolt', 'faceplate', 'spacers', 'steerer', 'steererBolts', 'stem', 'topCap']);
    // faces d'une vis : tête (16 facettes + 2 bases) + tige (12 × 2 tronçons + 2 bases)
    expect(a4.parts.find((p) => p.id === 'barBolts')!.solid.faces.length).toBe(4 * (16 + 2 + 24 + 2));
    expect(cockpitAssembly(70, 90, -6, 'two-bolt').parts.find((p) => p.id === 'barBolts')!.solid.faces.length).toBe(2 * (16 + 2 + 24 + 2));
    for (const k of ['spacers', 'stem', 'bar'] as const) expect(a4.keys[k]).toContain(a4.gestures[k].part);
  });
});

describe('vue éclatée : hauteur d’entretoises et réglage animé', () => {
  const HTA = 70;
  const up = [-Math.cos((HTA * Math.PI) / 180), Math.sin((HTA * Math.PI) / 180), 0] as const;
  const along = (q: readonly number[]) => q[0]! * up[0] + q[1]! * up[1];
  const span = (a: ReturnType<typeof cockpitAssembly>, id: string) => {
    const k = a.parts.find((p) => p.id === id)!.solid.faces.flatMap((f) => f.pts.map(along));
    return { min: Math.min(...k), max: Math.max(...k), n: k.length };
  };
  /** Bas du collier de pivot de la potence : sommets à moins de 20 mm (rayon du collier) de l'axe du pivot. */
  const clampBottom = (a: ReturnType<typeof cockpitAssembly>) => {
    const pts = a.parts.find((p) => p.id === 'stem')!.solid.faces.flatMap((f) => f.pts);
    const onAxis = pts.filter((q) => Math.hypot(q[0] - along(q) * up[0], q[1] - along(q) * up[1], q[2]) <= 20 + 1e-6);
    return Math.min(...onAxis.map(along));
  };
  it('pile : bagues de 10 puis 5 mm, arrondie au pas de 5', () => {
    expect(spacerStack(0)).toEqual([]);
    expect(spacerStack(5)).toEqual([5]);
    expect(spacerStack(22)).toEqual([10, 10]);
    expect(spacerStack(23)).toEqual([10, 10, 5]);
    expect(spacerStack(40)).toEqual([10, 10, 10, 10]);
    expect(spacerStack(-5)).toEqual([]);
  });
  it('hauteur de pile = valeur demandée, potence posée juste au-dessus, pivot rallongé', () => {
    for (const h of [5, 15, 30, 40]) {
      const a = cockpitAssembly(HTA, 90, -6, 'four-bolt', h);
      const sp = span(a, 'spacers');
      expect(sp.min).toBeCloseTo(0.4, 6); // petit jour aux joints
      expect(sp.max).toBeCloseTo(h - 0.4, 6);
      expect(clampBottom(a)).toBeCloseTo(h, 6);
      expect(span(a, 'steerer').max).toBeCloseTo(h + 40 - 3, 6);
      expect(span(a, 'topCap').min).toBeCloseTo(h + 40 + 0.6, 6);
    }
    const a0 = cockpitAssembly(HTA, 90, -6, 'four-bolt', 0);
    expect(a0.parts.find((p) => p.id === 'spacers')!.solid.faces).toEqual([]);
    expect(clampBottom(a0)).toBeCloseTo(0, 6);
  });
  it('sans hauteur : pile d’exemple (25 mm)', () => {
    expect(SPACER_STACK_MM).toBe(25);
    expect(cockpitAssembly(HTA, 90, -6, 'four-bolt', 25)).toEqual(cockpitAssembly(HTA, 90, -6, 'four-bolt'));
  });
  it('géométrie au temps t : départ + écart · t', () => {
    const start = { spacers: 20, stemLength: 90, stemAngle: -6 };
    expect(cockpitGeomAt(start, undefined, 0.5)).toEqual(start);
    expect(cockpitGeomAt(start, { spacers: -10, stemLength: 10, stemAngle: 12 }, 0.5)).toEqual({ spacers: 15, stemLength: 95, stemAngle: 0 });
    expect(cockpitGeomAt({ stemLength: 90, stemAngle: -6 }, { spacers: 10 }, 1).spacers).toBe(35);
    expect(cockpitGeomAt({ stemLength: 90, stemAngle: -6 }, { stemLength: 10 }, 1).spacers).toBeUndefined();
  });
  it('pile continue : bagues de 10 / 5 mm + bague en transit contre la potence', () => {
    expect(spacerRings(20)).toEqual([10, 10]);
    expect(spacerRings(12.5)).toEqual([10, 2.5]);
    expect(spacerRings(7, true).map((x) => +x.toFixed(9))).toEqual([2, 5]);
    expect(spacerRings(-3)).toEqual([]);
  });
  it('transfert animé : potence continue et monotone en t, dessous + dessus conservé, pivot constant', () => {
    const start = { spacers: 20, spacersAbove: 5, stemLength: 90, stemAngle: -6 };
    for (const dS of [-15, 5]) {
      let prev: number | undefined;
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const g = cockpitGeomAt(start, { spacers: dS }, t);
        expect(g.spacers! + g.spacersAbove!).toBeCloseTo(25, 9);
        expect(g.spacersAbove).toBeCloseTo(5 - dS * t, 9);
        const a = cockpitAssembly(HTA, 90, -6, 'four-bolt', g.spacers, g.spacersAbove);
        const cb = clampBottom(a);
        expect(cb).toBeCloseTo(20 + dS * t, 6); // continu : pas de palier de 5 mm
        if (prev !== undefined) expect(Math.sign(cb - prev) * Math.sign(dS)).toBeGreaterThanOrEqual(0);
        if (prev !== undefined) expect(Math.abs(cb - prev)).toBeLessThan(Math.abs(dS) / 40 + 1e-6);
        prev = cb;
        expect(span(a, 'steerer').max).toBeCloseTo(25 + 40 - 3, 6);
        expect(span(a, 'topCap').min).toBeCloseTo(25 + 40 + 0.6, 6);
      }
    }
  });
  it('transfert au-delà du pivot : butée, rien n’est ajouté (comme simWithSpacers)', () => {
    const g = cockpitGeomAt({ spacers: 20, spacersAbove: 5, stemLength: 90, stemAngle: -6 }, { spacers: 15 }, 1);
    expect(g).toMatchObject({ spacers: 25, spacersAbove: 0 });
  });
  it('entretoises au-dessus : pièce présente si donnée, posée sur le collier, sous le capot', () => {
    const a = cockpitAssembly(HTA, 90, -6, 'four-bolt', 15, 10);
    expect(a.keys.spacers).toContain('spacersAbove');
    const sa = span(a, 'spacersAbove');
    expect(sa.min).toBeCloseTo(15 + 40 + 0.4, 6);
    expect(sa.max).toBeCloseTo(15 + 40 + 10 - 0.4, 6);
    expect(a.parts.find((p) => p.id === 'spacersAbove')!.label).toEqual(['Entretoises', 'au-dessus']);
    expect(cockpitAssembly(HTA, 90, -6, 'four-bolt', 15, 0).parts.find((p) => p.id === 'spacersAbove')!.solid.faces).toEqual([]);
    expect(cockpitAssembly(HTA, 90, -6, 'four-bolt', 15).parts.some((p) => p.id === 'spacersAbove')).toBe(false);
  });
  it('cintre : tronçon = 2 · BAR_HALF + écart à t = 1, borné au minimum', () => {
    const barLen = (a: ReturnType<typeof cockpitAssembly>) => {
      const z = a.parts.find((p) => p.id === 'bar')!.solid.faces.flatMap((f) => f.pts.map((q) => q[2]));
      return Math.max(...z) - Math.min(...z);
    };
    const start = { stemLength: 90, stemAngle: -6, handlebarWidth: 420 };
    for (const dW of [20, -20]) {
      const g = cockpitGeomAt(start, { handlebarWidth: dW }, 1);
      expect(g.handlebarWidth).toBe(420 + dW);
      expect(barLen(cockpitAssembly(HTA, 90, -6, 'four-bolt', undefined, undefined, g.handlebarWidth! - 420))).toBeCloseTo(2 * BAR_HALF + dW, 6);
    }
    expect(barLen(cockpitAssembly(HTA, 90, -6, 'four-bolt', undefined, undefined, -500))).toBeCloseTo(2 * BAR_HALF_MIN, 6);
    expect(cockpitGeomAt(start, { stemLength: 10 }, 1).handlebarWidth).toBe(420);
  });
});
