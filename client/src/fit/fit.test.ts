import { describe, expect, it } from 'vitest';
import type { Bike } from '@bikefit/shared';
import {
  cockpitTargets,
  computeFit,
  hoodsPosition,
  kneeAngleBDC,
  saddleHeightHamley,
  saddleHeightLeMond,
  solveStem,
  stemAbsoluteAngle,
  type FitResult,
  type FitTarget,
  type RiderMeasurements,
} from './index';
import { footLengthCm, shoeSizeFromFootCm, torsoFromSternum, MEASURE_GUIDE } from './measureGuide';

/** Fixture GRVL AF (géométrie M de l'énoncé ; autres tailles extrapolées de façon progressive). */
const grvlAF: Bike = {
  id: 'grvl-af',
  brand: 'Test',
  model: 'GRVL AF',
  wheel: { bsd: 622, tyreWidth: 40 },
  sizes: [
    { label: 'XS', riderHeightMin: 155, riderHeightMax: 165, stack: 525, reach: 365, seatTubeAngle: 74.5, headTubeAngle: 69, chainstay: 435, stemLength: 70, stemAngle: -6, spacers: 20, handlebarWidth: 400, crankLength: 165 },
    { label: 'S', riderHeightMin: 163, riderHeightMax: 173, stack: 548, reach: 378, seatTubeAngle: 74, headTubeAngle: 69.5, chainstay: 435, stemLength: 80, stemAngle: -6, spacers: 20, handlebarWidth: 420, crankLength: 170 },
    { label: 'M', riderHeightMin: 172, riderHeightMax: 182, stack: 572, reach: 391, seatTubeAngle: 73.5, headTubeAngle: 70, chainstay: 435, stemLength: 90, stemAngle: -6, spacers: 20, handlebarWidth: 420, crankLength: 172.5 },
    { label: 'L', riderHeightMin: 180, riderHeightMax: 190, stack: 597, reach: 403, seatTubeAngle: 73, headTubeAngle: 70.5, chainstay: 435, stemLength: 100, stemAngle: -6, spacers: 20, handlebarWidth: 440, crankLength: 172.5 },
    { label: 'XL', riderHeightMin: 188, riderHeightMax: 198, stack: 622, reach: 414, seatTubeAngle: 73, headTubeAngle: 71, chainstay: 440, stemLength: 110, stemAngle: -6, spacers: 20, handlebarWidth: 440, crankLength: 175 },
  ],
};

const withoutMakerRanges: Bike = {
  ...grvlAF,
  sizes: grvlAF.sizes.map(({ riderHeightMin: _a, riderHeightMax: _b, ...s }) => s),
};

/** Tailles réelles du GRVL AF (server/data/bikes.json) : plages constructeur à bornes partagées. */
const grvlReal: Bike = {
  ...grvlAF,
  id: 'grvl-af-real',
  sizes: [
    { label: 'XS', riderHeightMin: 150, riderHeightMax: 160, stack: 535, reach: 372, seatTubeAngle: 73.5, headTubeAngle: 70, chainstay: 435, stemLength: 70, stemAngle: -6, spacers: 20, handlebarWidth: 400, crankLength: 165 },
    { label: 'S', riderHeightMin: 160, riderHeightMax: 170, stack: 549, reach: 378, seatTubeAngle: 73.5, headTubeAngle: 70, chainstay: 435, stemLength: 80, stemAngle: -6, spacers: 20, handlebarWidth: 420, crankLength: 170 },
    { label: 'M', riderHeightMin: 170, riderHeightMax: 180, stack: 572, reach: 391, seatTubeAngle: 73.5, headTubeAngle: 70, chainstay: 435, stemLength: 90, stemAngle: -6, spacers: 20, handlebarWidth: 420, crankLength: 170 },
    { label: 'L', riderHeightMin: 180, riderHeightMax: 188, stack: 600, reach: 397, seatTubeAngle: 73.5, headTubeAngle: 70, chainstay: 435, stemLength: 100, stemAngle: -6, spacers: 20, handlebarWidth: 440, crankLength: 170 },
    { label: 'XL', riderHeightMin: 185, riderHeightMax: 195, stack: 629, reach: 404, seatTubeAngle: 73.5, headTubeAngle: 70, chainstay: 435, stemLength: 110, stemAngle: -6, spacers: 20, handlebarWidth: 440, crankLength: 170 },
  ],
};

const rider180: RiderMeasurements = {
  height: 180,
  inseam: 85,
  shoeSize: 43,
  torso: 60,
  arm: 61,
  shoulderWidth: 41,
  flexibility: 'medium',
  practice: 'gravel',
};

const rider160: RiderMeasurements = {
  height: 160,
  inseam: 74,
  shoeSize: 38,
  torso: 53,
  arm: 54,
  shoulderWidth: 36,
  flexibility: 'medium',
  practice: 'gravel',
};

/** Cycliste par défaut de l'UI (components/store.ts). */
const defaultRider: RiderMeasurements = { ...rider180, torso: 58, arm: 62, shoulderWidth: 40 };

/** Cycliste homothétique de `base` (mesures proportionnelles à la taille). */
function scaled(base: RiderMeasurements, h: number): RiderMeasurements {
  const k = h / base.height;
  return {
    ...base,
    height: h,
    inseam: base.inseam * k,
    shoeSize: base.shoeSize * (0.5 + k / 2),
    torso: base.torso * k,
    arm: base.arm * k,
    shoulderWidth: base.shoulderWidth * k,
  };
}

function targets(r: FitResult): Array<[string, FitTarget]> {
  return (Object.entries(r) as Array<[string, unknown]>).filter(
    (e): e is [string, FitTarget] => typeof e[1] === 'object' && e[1] !== null && 'range' in (e[1] as object),
  );
}

function allNumbersFinite(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(allNumbersFinite);
  if (v && typeof v === 'object') return Object.values(v).every(allNumbersFinite);
  return true;
}

describe('formules de hauteur de selle', () => {
  it('LeMond : 85 cm × 0,883 ≈ 750 mm', () => {
    expect(saddleHeightLeMond(85)).toBeCloseTo(750.55, 1);
  });
  it('Hamley : 1,09 × entrejambe − manivelle', () => {
    expect(saddleHeightHamley(85, 172.5)).toBeCloseTo(926.5 - 172.5, 1);
  });
});

describe('modèle cinématique', () => {
  it('angle de genou croissant avec la hauteur de selle', () => {
    const a = kneeAngleBDC(rider180, 730, 73.5, 172.5, 12).angle;
    const b = kneeAngleBDC(rider180, 760, 73.5, 172.5, 12).angle;
    expect(b).toBeGreaterThan(a);
  });
  it('selle trop haute : pas de NaN, angle borné à 180°', () => {
    const k = kneeAngleBDC(rider180, 1100, 73.5, 172.5, 12);
    expect(k.reachable).toBe(false);
    expect(k.angle).toBeCloseTo(180, 0);
  });
});

describe('potence', () => {
  it('−17° sur un tube de direction à 73° = horizontale', () => {
    expect(stemAbsoluteAngle(-17, 73)).toBe(0);
  });
  it('le solveur retrouve un montage connu', () => {
    const size = { stack: 572, reach: 391, headTubeAngle: 70 };
    const setup = { stemLength: 100, stemAngle: -6, spacers: 15 };
    const sol = solveStem(size, hoodsPosition(size, setup));
    expect(sol).toMatchObject(setup);
    expect(sol.error).toBeLessThan(1e-6);
  });
});

describe('computeFit — 1,80 m / 85 cm sur GRVL AF', () => {
  const r = computeFit(rider180, grvlAF);

  it('taille recommandée M (avec et sans plages constructeur)', () => {
    expect(r.recommendedSize).toBe('M');
    expect(computeFit(rider180, withoutMakerRanges).recommendedSize).toBe('M');
  });

  it('hauteur de selle proche de LeMond, genou dans 140–150°', () => {
    expect(Math.abs(r.saddleHeight.value - 750)).toBeLessThan(15);
    expect(r.kneeAngleBDC).toBeGreaterThanOrEqual(140);
    expect(r.kneeAngleBDC).toBeLessThanOrEqual(150);
  });

  it('plages cohérentes et valeurs finies', () => {
    const ts = targets(r);
    expect(ts.length).toBe(9);
    for (const [, t] of ts) {
      expect(t.range[0]).toBeLessThanOrEqual(t.value);
      expect(t.value).toBeLessThanOrEqual(t.range[1]);
      expect(t.explanation.rationale.length).toBeGreaterThan(10);
    }
    expect(allNumbersFinite(r)).toBe(true);
  });

  it('valeurs plausibles', () => {
    expect(r.saddleSetback.value).toBeGreaterThan(30);
    expect(r.saddleSetback.value).toBeLessThan(110);
    expect(r.crankLength.value).toBe(172.5);
    expect(r.cleatFore.value).toBeGreaterThanOrEqual(10);
    expect(r.cleatFore.value).toBeLessThanOrEqual(15);
    expect(r.saddleToBarDrop.value).toBeGreaterThan(-20);
    expect(r.saddleToBarDrop.value).toBeLessThan(120);
    expect(r.stemLength.value).toBeGreaterThanOrEqual(60);
    expect(r.stemLength.value).toBeLessThanOrEqual(120);
    expect(r.saddlePosition.x).toBe(-r.saddleSetback.value);
    expect(r.warnings).toEqual([]);
  });

  it('taille demandée introuvable -> repli + warning', () => {
    const f = computeFit(rider180, grvlAF, undefined, 'XXL');
    expect(f.warnings.some((w) => w.includes('XXL'))).toBe(true);
  });

  it('réglages actuels hors plage -> warnings', () => {
    const f = computeFit(rider180, grvlAF, {
      saddleHeight: 700,
      saddleSetback: r.saddleSetback.value,
      stemLength: r.stemLength.value,
      stemAngle: r.stemAngle.value,
      spacers: r.spacers.value,
      handlebarWidth: r.handlebarWidth.value,
      crankLength: 172.5,
      cleatFore: 12,
    });
    expect(f.warnings.some((w) => w.startsWith('Hauteur de selle actuel'))).toBe(true);
    expect(f.warnings.length).toBe(1);
  });
});

describe('computeFit — 1,60 m', () => {
  it('taille XS (avec et sans plages constructeur)', () => {
    expect(computeFit(rider160, grvlAF).recommendedSize).toBe('XS');
    expect(computeFit(rider160, withoutMakerRanges).recommendedSize).toBe('XS');
  });
});

describe('computeFit — 1,70 m', () => {
  it('taille S, cohérente avec la plage constructeur (163–173 cm)', () => {
    const r = computeFit(scaled(rider180, 170), grvlAF);
    expect(r.recommendedSize).toBe('S');
    const s = r.sizeScores.find((x) => x.label === 'S')!;
    const xs = r.sizeScores.find((x) => x.label === 'XS')!;
    expect(s.score).toBeGreaterThan(xs.score);
  });
  it('données réelles GRVL AF : S', () => {
    expect(computeFit(scaled(defaultRider, 170), grvlReal).recommendedSize).toBe('S');
  });
});

describe('computeFit — 1,80 m, cycliste par défaut sur GRVL AF réel', () => {
  it('taille M, bien notée, stack cible pas biaisé vers le bas', () => {
    const r = computeFit(defaultRider, grvlReal);
    expect(r.recommendedSize).toBe('M');
    const m = r.sizeScores.find((x) => x.label === 'M')!;
    expect(m.score).toBeGreaterThanOrEqual(75);
    expect(Math.abs(m.stackDelta)).toBeLessThanOrEqual(15);
    // Drop selle → cocottes gravel plausible (montage d'origine M ≈ 59 mm).
    expect(r.saddleToBarDrop.value).toBeGreaterThan(30);
    expect(r.saddleToBarDrop.value).toBeLessThan(80);
  });
});

describe('plages des réglages de cockpit', () => {
  const size = grvlAF.sizes[2];
  const setup = { stemLength: 80, stemAngle: -17, spacers: 10 };
  const hands = hoodsPosition(size, setup);
  const c = cockpitTargets(size, hands, 10);

  it('le solveur retrouve −17° et la plage d’angle exclut −6°', () => {
    expect(c.stemAngle.value).toBe(-17);
    expect(c.stemAngle.range[1]).toBeLessThan(-6);
  });

  it('chaque plage contient la valeur et garde les cocottes à ≤ 10 mm', () => {
    const sol = c.solution;
    const keys = ['stemLength', 'stemAngle', 'spacers'] as const;
    for (const k of keys) {
      const t = c[k];
      expect(t.range[0]).toBeLessThanOrEqual(t.value);
      expect(t.value).toBeLessThanOrEqual(t.range[1]);
      for (const v of t.range) {
        const h = hoodsPosition(size, { ...sol, [k]: v });
        expect(Math.hypot(h.x - sol.hoods.x, h.y - sol.hoods.y)).toBeLessThanOrEqual(10 + 1e-6);
      }
    }
    expect(c.stemLength.range).toEqual([70, 90]);
    expect(c.spacers.range).toEqual([0, 20]);
  });

  it('angle actuel −6° pour une cible −17° -> warning hors plage', () => {
    const rider = rider180;
    const fit = computeFit(rider, grvlAF);
    const f = computeFit(rider, grvlAF, {
      saddleHeight: fit.saddleHeight.value,
      saddleSetback: fit.saddleSetback.value,
      stemLength: fit.stemLength.value,
      stemAngle: fit.stemAngle.value === -6 ? -17 : -6,
      spacers: fit.spacers.value,
      handlebarWidth: fit.handlebarWidth.value,
      crankLength: fit.crankLength.value,
      cleatFore: fit.cleatFore.value,
    });
    expect(f.warnings.some((w) => w.startsWith('Angle de potence actuel'))).toBe(true);
  });
});

describe('balayage de tailles (cyclistes proportionnels, gravel)', () => {
  const order = ['XS', 'S', 'M', 'L', 'XL'];
  it('la taille recommandée ne diminue jamais quand la taille du cycliste augmente', () => {
    const cases: Array<[Bike, RiderMeasurements]> = [
      [grvlAF, rider180],
      [withoutMakerRanges, rider180],
      [grvlReal, defaultRider],
      [grvlReal, rider180],
    ];
    for (const [bike, base] of cases) {
      let prev = -1;
      for (let h = 150; h <= 200; h++) {
        const f = computeFit(scaled(base, h), bike);
        const idx = order.indexOf(f.recommendedSize);
        expect(idx).toBeGreaterThanOrEqual(prev);
        expect(allNumbersFinite(f)).toBe(true);
        prev = idx;
      }
    }
  });
});

describe('measureGuide', () => {
  it('pointure : aller-retour 42 -> longueur -> 42', () => {
    expect(footLengthCm(42)).toBe(26.5);
    expect(shoeSizeFromFootCm(footLengthCm(42))).toBe(42);
    for (let eu = 36; eu <= 50; eu += 0.5) {
      expect(shoeSizeFromFootCm(footLengthCm(eu))).toBe(eu);
    }
  });

  it('torse par soustraction, arrondi au 0,5', () => {
    expect(torsoFromSternum(145, 85)).toBe(60);
    expect(torsoFromSternum(145.3, 85)).toBe(60.5);
  });

  it('valeurs non finies -> NaN', () => {
    expect(footLengthCm(NaN)).toBeNaN();
    expect(shoeSizeFromFootCm(Infinity)).toBeNaN();
    expect(torsoFromSternum(NaN, 85)).toBeNaN();
    expect(torsoFromSternum(145, Infinity)).toBeNaN();
  });

  it('guide : chaque cote a des étapes et une astuce', () => {
    for (const g of Object.values(MEASURE_GUIDE)) {
      expect(g.steps.length).toBeGreaterThan(0);
      expect(g.tip).not.toBe('');
    }
  });
});
