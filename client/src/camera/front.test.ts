import { describe, expect, it } from 'vitest';
import { frontScaleFromBar, kneeAlignment, lateralMm, shoulderVsBar, symmetry } from './front';

// cintre de 400 mm vu sur 400 px, centré en x = 500
const scale = frontScaleFromBar({ x: 300, y: 400 }, { x: 700, y: 400 }, 400);

describe('vue de face', () => {
  it('échelle et axe à partir du cintre', () => {
    expect(scale.pxPerMm).toBeCloseTo(1);
    expect(scale.centerPx).toEqual({ x: 500, y: 400 });
    expect(lateralMm(scale, { x: 550, y: 900 })).toBeCloseTo(50);
    // ordre des clics indifférent
    expect(frontScaleFromBar({ x: 700, y: 400 }, { x: 300, y: 400 }, 400).centerPx.x).toBe(500);
  });

  it('genou / cale', () => {
    const okR = kneeAlignment(scale, { x: 600, y: 700 }, { x: 605, y: 950 }, 'imageRight');
    expect(okR.state).toBe('ok');
    const out = kneeAlignment(scale, { x: 640, y: 700 }, { x: 600, y: 950 }, 'imageRight');
    expect(out.offsetMm).toBeCloseTo(40);
    expect(out.message).toBe("Genou 40 mm à l'extérieur de la cale");
    const inL = kneeAlignment(scale, { x: 420, y: 700 }, { x: 400, y: 950 }, 'imageLeft');
    expect(inL.offsetMm).toBeCloseTo(-20);
    expect(inL.message).toContain("l'intérieur");
  });

  it('épaules vs cintre', () => {
    const r = shoulderVsBar(scale, { x: 310, y: 100 }, { x: 690, y: 100 }, 420);
    expect(r.shoulderWidthMm).toBeCloseTo(380);
    expect(r.diffMm).toBeCloseTo(40);
    expect(r.state).toBe('near');
    expect(shoulderVsBar(scale, { x: 300, y: 100 }, { x: 700, y: 100 }, 410).state).toBe('ok');
  });

  it('symétrie', () => {
    expect(symmetry(scale, { x: 300, y: 100 }, { x: 700, y: 100 }, 'Épaules').state).toBe('ok');
    const s = symmetry(scale, { x: 340, y: 100 }, { x: 740, y: 100 }, 'Épaules');
    expect(s.shiftMm).toBeCloseTo(40);
    expect(s.message).toBe("Épaules décalés de 40 mm vers la droite de l'image");
  });
});
