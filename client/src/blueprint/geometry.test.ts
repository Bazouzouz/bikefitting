// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { BikeSize } from '@bikefit/shared';
import { cockpit, fitAspect, frameGeometry, rad, toFrame, wheelRadius, type Setup } from './geometry';

/** Van Rysel GRVL AF, taille M (server/data/bikes.json). */
const GRVL_M: BikeSize = {
  label: 'M',
  stack: 572,
  reach: 391,
  seatTubeLength: 500,
  seatTubeAngle: 73.5,
  headTubeAngle: 70,
  headTubeLength: 155,
  chainstay: 435,
  wheelbase: 1052,
  bbDrop: 67,
  forkLength: 396,
  forkOffset: 45,
  stemLength: 90,
  stemAngle: -6,
  spacers: 20,
  handlebarWidth: 420,
  crankLength: 170,
};
const WHEEL = { bsd: 622, tyreWidth: 45 };

describe('géométrie du cadre (GRVL AF M)', () => {
  const fr = toFrame(GRVL_M, 'gravel');
  const R = wheelRadius(WHEEL);
  const g = frameGeometry(fr, R);

  it('toFrame conserve les champs présents (prioritaires sur l’archétype)', () => {
    expect(fr).toEqual({
      stack: 572,
      reach: 391,
      sta: 73.5,
      hta: 70,
      cs: 435,
      bbDrop: 67,
      stl: 500,
      htl: 155,
      fork: 396,
      offset: 45,
    });
  });

  it('rayon de roue = jante / 2 + pneu', () => {
    expect(R).toBe(311 + 45);
  });

  it('axes de roues', () => {
    expect(g.rearAxle.x).toBeCloseTo(-Math.sqrt(435 ** 2 - 67 ** 2), 6);
    expect(g.rearAxle.y).toBe(67);
    expect(g.frontAxle.y).toBe(67);
    expect(g.ground).toBeCloseTo(67 - 356, 6);
  });

  it('tube de direction : haut = (reach, stack), bas = haut + down·htl', () => {
    expect(g.headTop).toEqual({ x: 391, y: 572 });
    expect(g.headBottom.x).toBeCloseTo(391 + 155 * Math.cos(rad(70)), 6);
    expect(g.headBottom.y).toBeCloseTo(572 - 155 * Math.sin(rad(70)), 6);
    expect(Math.hypot(g.down.x, g.down.y)).toBeCloseTo(1, 9);
  });

  it('haut du tube de selle = seatDir · stl', () => {
    expect(g.seatTop.x).toBeCloseTo(-500 * Math.cos(rad(73.5)), 6);
    expect(g.seatTop.y).toBeCloseTo(500 * Math.sin(rad(73.5)), 6);
  });

  it('axe avant : à `offset` de l’axe de direction', () => {
    // distance point → droite (axe de direction passant par headTop, direction `down`)
    const v = { x: g.frontAxle.x - g.headTop.x, y: g.frontAxle.y - g.headTop.y };
    const cross = Math.abs(v.x * g.down.y - v.y * g.down.x);
    expect(cross).toBeCloseTo(45, 6);
  });

  it('empattement cohérent avec le catalogue (± 3 mm) et avec les axes', () => {
    expect(g.wheelbase).toBeCloseTo(g.frontAxle.x - g.rearAxle.x, 9);
    expect(Math.abs(g.wheelbase - 1052)).toBeLessThan(3);
  });

  it('cockpit : base de potence au-dessus du jeu de direction, cintre à stemLength', () => {
    const s: Setup = {
      saddleHeight: 740,
      tipX: -60,
      stemLength: 90,
      stemAngle: -6,
      spacers: 20,
      handlebarWidth: 420,
      crankLength: 170,
      cleatFore: 0,
    };
    const cp = cockpit(g, s);
    expect(Math.hypot(cp.bar.x - cp.clampC.x, cp.bar.y - cp.clampC.y)).toBeCloseTo(90, 6);
    expect(cp.base.y).toBeGreaterThan(g.headTop.y);
  });
});

describe('fitAspect', () => {
  it('élargit le côté court autour du centre, sans rogner', () => {
    const b = fitAspect({ minX: 0, maxX: 1000, minY: 0, maxY: 1000 }, 2);
    expect(b.maxX - b.minX).toBe(2000);
    expect(b.maxY - b.minY).toBe(1000);
    expect((b.minX + b.maxX) / 2).toBe(500);
    const c = fitAspect({ minX: 0, maxX: 3000, minY: 0, maxY: 1000 }, 2);
    expect(c.maxX - c.minX).toBe(3000);
    expect(c.maxY - c.minY).toBe(1500);
  });
});
