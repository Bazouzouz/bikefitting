// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { coupledSetbackShift, type SaddleSim } from './saddle';
import { gestureSim } from './SaddleGuide';

const start: SaddleSim = { height: 700, setback: 60, tilt: 2 };
const STA = 73.5;

describe('gestureSim', () => {
  it('hauteur : le recul suit, couplé ΔH·cos(STA), depuis la simulation de départ', () => {
    const s = gestureSim('height', start, 712, STA);
    expect(s.height).toBe(712);
    expect(s.setback).toBeCloseTo(60 + coupledSetbackShift(12, STA), 9);
    expect(s.tilt).toBe(2);
  });
  it('sans cumul : deux frames successives = un saut direct', () => {
    const a = gestureSim('height', start, 705, STA);
    expect(gestureSim('height', start, 712, STA)).not.toEqual(a);
    expect(gestureSim('height', start, 700, STA)).toEqual(start);
  });
  it('recul et inclinaison : seul le temps en cours bouge', () => {
    expect(gestureSim('setback', start, 80, STA)).toEqual({ height: 700, setback: 80, tilt: 2 });
    expect(gestureSim('tilt', start, 0, STA)).toEqual({ height: 700, setback: 60, tilt: 0 });
  });
});
