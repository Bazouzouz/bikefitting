import { describe, expect, it } from 'vitest';
import {
  classify,
  ema,
  emaAlpha,
  emaAngle,
  foreMessage,
  heightMessage,
  smoothCalibration,
  stateColor,
} from './status';

describe('classification', () => {
  it('vert dans la tolérance, orange proche, rouge loin', () => {
    expect(classify(2.9, 3)).toBe('ok');
    expect(classify(-3, 3)).toBe('ok');
    expect(classify(4, 3)).toBe('near');
    expect(classify(9, 3)).toBe('near');
    expect(classify(12, 3)).toBe('far');
    expect(stateColor('ok')).toBe('#16a34a');
  });

  it('hystérésis : on entre en vert à ≤ tol, on n’en sort qu’au-delà de tol + 0,5', () => {
    expect(classify(3.3, 3, 'near')).toBe('near');
    expect(classify(3.3, 3, 'ok')).toBe('ok');
    expect(classify(3.6, 3, 'ok')).toBe('near');
  });
});

describe('messages', () => {
  it('hauteur', () => {
    expect(heightMessage(12.4, 'far')).toBe('Monte la selle de 12 mm');
    expect(heightMessage(-4.6, 'near')).toBe('Baisse la selle de 5 mm');
    expect(heightMessage(1, 'ok')).toBe('Hauteur OK');
  });
  it('recul', () => {
    expect(foreMessage(5, 'near')).toBe('Avance la selle de 5 mm');
    expect(foreMessage(-7, 'near')).toBe('Recule la selle de 7 mm');
    expect(foreMessage(-2, 'ok')).toBe('Recul OK');
  });
});

describe('lissage', () => {
  it('EMA', () => {
    expect(ema(null, 10, 0.2)).toBe(10);
    expect(ema(0, 10, 0.2)).toBeCloseTo(2);
    expect(emaAlpha(0, 200)).toBe(0);
    expect(emaAlpha(200, 200)).toBeCloseTo(1 - Math.exp(-1));
  });
  it('EMA d’angle à travers ±π', () => {
    const r = emaAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(Math.abs(r) - Math.PI)).toBeLessThan(1e-9);
  });
  it('calibration : échelle lissée, sens non lissé', () => {
    const a = { originPx: { x: 0, y: 0 }, pxPerMm: 1, angleRad: 0, forwardSign: 1 as const };
    const b = { originPx: { x: 10, y: 0 }, pxPerMm: 4, angleRad: 0, forwardSign: 1 as const };
    const s = smoothCalibration(a, b, 0.5);
    expect(s.originPx.x).toBeCloseTo(5);
    expect(s.pxPerMm).toBeCloseTo(2);
    expect(smoothCalibration(a, { ...b, forwardSign: -1 }, 0.5)).toEqual({ ...b, forwardSign: -1 });
  });
});
