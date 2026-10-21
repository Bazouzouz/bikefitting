import { describe, expect, it } from 'vitest';
import {
  calibrationFromMarkers,
  calibrationFromTwoPoints,
  guessForwardSign,
  pxToWorld,
  saddleError,
  saddleNoseFromMarker,
  seatTubePoint,
  worldToPx,
  type Calibration,
  type MarkerCorners,
  type Vec2,
} from './geometry';

const square = (cx: number, cy: number, side: number, angle = 0): MarkerCorners => {
  const h = side / 2;
  const pts: Vec2[] = [
    { x: -h, y: -h },
    { x: h, y: -h },
    { x: h, y: h },
    { x: -h, y: h },
  ];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return pts.map((p) => ({ x: cx + p.x * c - p.y * s, y: cy + p.x * s + p.y * c })) as MarkerCorners;
};

describe('mm <-> px', () => {
  const cal: Calibration = { originPx: { x: 500, y: 600 }, pxPerMm: 0.5, angleRad: 0, forwardSign: 1 };

  it('BB = origine, y monde vers le haut = y image vers le bas', () => {
    expect(worldToPx(cal, { x: 0, y: 0 })).toEqual({ x: 500, y: 600 });
    const p = worldToPx(cal, { x: 100, y: 200 });
    expect(p.x).toBeCloseTo(550);
    expect(p.y).toBeCloseTo(500);
  });

  it('vélo vers la gauche : x avant = vers la gauche de l’image', () => {
    const p = worldToPx({ ...cal, forwardSign: -1 }, { x: 100, y: 0 });
    expect(p.x).toBeCloseTo(450);
  });

  it('aller-retour avec rotation et sens inversé', () => {
    const c2: Calibration = { originPx: { x: 321, y: 123 }, pxPerMm: 1.37, angleRad: 0.2, forwardSign: -1 };
    const w = { x: -180, y: 720 };
    const back = pxToWorld(c2, worldToPx(c2, w));
    expect(back.x).toBeCloseTo(w.x, 9);
    expect(back.y).toBeCloseTo(w.y, 9);
  });

  it('caméra inclinée : l’horizontale monde suit l’angle', () => {
    const c3: Calibration = { ...cal, angleRad: Math.PI / 2 };
    const p = worldToPx(c3, { x: 100, y: 0 });
    expect(p.x).toBeCloseTo(500);
    expect(p.y).toBeCloseTo(650);
  });
});

describe('calibration par marqueurs', () => {
  it('échelle = côté px / côté mm, origine = centre du marqueur BB', () => {
    const cal = calibrationFromMarkers({
      bb: square(400, 500, 40),
      saddle: square(300, 100, 40),
      markerSizeMm: 80,
      assumeLevel: false,
      forwardSign: 1,
    });
    expect(cal.pxPerMm).toBeCloseTo(0.5);
    expect(cal.originPx).toEqual({ x: 400, y: 500 });
    expect(cal.angleRad).toBeCloseTo(0);
  });

  it('lit l’inclinaison des marqueurs, ou l’ignore si caméra de niveau', () => {
    const bb = square(0, 0, 50, 0.1);
    const saddle = square(100, -300, 50, 0.1);
    const tilted = calibrationFromMarkers({ bb, saddle, markerSizeMm: 50, assumeLevel: false, forwardSign: 1 });
    expect(tilted.angleRad).toBeCloseTo(0.1);
    const level = calibrationFromMarkers({ bb, saddle, markerSizeMm: 50, assumeLevel: true, forwardSign: 1 });
    expect(level.angleRad).toBe(0);
  });

  it('bec de selle = bord supérieur du marqueur de selle', () => {
    const cal = calibrationFromMarkers({ bb: square(400, 500, 40), markerSizeMm: 80, assumeLevel: true, forwardSign: 1 });
    // marqueur de selle 300 px au-dessus, 100 px en arrière -> 600 mm haut, 200 mm recul (centre)
    const nose = saddleNoseFromMarker(cal, square(300, 200, 40), 80);
    expect(nose.x).toBeCloseTo(-200);
    expect(nose.y).toBeCloseTo(600 + 40);
  });

  it('devine le sens du vélo (selle derrière le BB) sauf recul trop faible', () => {
    expect(guessForwardSign({ x: 500, y: 500 }, { x: 400, y: 100 })).toBe(1);
    expect(guessForwardSign({ x: 500, y: 500 }, { x: 600, y: 100 })).toBe(-1);
    expect(guessForwardSign({ x: 500, y: 500 }, { x: 495, y: 100 })).toBeNull();
  });
});

describe('calibration manuelle 2 points', () => {
  it('référence horizontale (empattement)', () => {
    const cal = calibrationFromTwoPoints({
      p1: { x: 1100, y: 600 },
      p2: { x: 100, y: 600 },
      distanceMm: 1000,
      axis: 'horizontal',
      bbPx: { x: 600, y: 650 },
      forwardSign: 1,
    });
    expect(cal.pxPerMm).toBeCloseTo(1);
    expect(cal.angleRad).toBeCloseTo(0);
  });

  it('référence verticale (diamètre de roue) inclinée', () => {
    const a = 0.05;
    // verticale monde vers le bas = (−sin a, cos a) à l'écran
    const p1 = { x: 0, y: 0 };
    const p2 = { x: -Math.sin(a) * 700, y: Math.cos(a) * 700 };
    const cal = calibrationFromTwoPoints({ p1: p2, p2: p1, distanceMm: 700, axis: 'vertical', bbPx: p1, forwardSign: 1 });
    expect(cal.pxPerMm).toBeCloseTo(1);
    expect(cal.angleRad).toBeCloseTo(a);
  });

  it('refuse une distance nulle', () => {
    expect(() =>
      calibrationFromTwoPoints({ p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 }, distanceMm: 0, axis: 'none', bbPx: { x: 0, y: 0 }, forwardSign: 1 }),
    ).toThrow();
  });
});

describe('écart de selle', () => {
  it('monter le long de la tige recule aussi le bec : décomposition tige + rails', () => {
    const angle = 73;
    const current = { x: -200, y: 700 };
    // cible = 12 mm plus haut le long de la tige, sans toucher aux rails
    const t = seatTubePoint(12, angle);
    const target = { x: current.x + t.x, y: current.y + t.y };
    const e = saddleError(current, target, angle);
    expect(e.height).toBeCloseTo(12);
    expect(e.fore).toBeCloseTo(0);
  });

  it('avance pure de 5 mm', () => {
    const e = saddleError({ x: -200, y: 700 }, { x: -195, y: 700 }, 73);
    expect(e.height).toBeCloseTo(0);
    expect(e.fore).toBeCloseTo(5);
  });

  it('baisse et recule', () => {
    const angle = 74;
    const t = seatTubePoint(-8, angle);
    const e = saddleError({ x: 0, y: 0 }, { x: t.x - 6, y: t.y }, angle);
    expect(e.height).toBeCloseTo(-8);
    expect(e.fore).toBeCloseTo(-6);
  });
});
