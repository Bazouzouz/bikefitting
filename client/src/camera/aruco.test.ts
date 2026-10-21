import { describe, expect, it } from 'vitest';
import { createDetector, markerBits } from './aruco';
import { markerCells } from './markers';
import { markerMeanSidePx, markerCenter } from './geometry';

/** Rasterise un marqueur (1 = blanc) dans un buffer RGBA blanc. rot = quarts de tour horaires. */
function paint(
  img: { width: number; height: number; data: Uint8ClampedArray },
  bits: string,
  x0: number,
  y0: number,
  cellPx: number,
  rot = 0,
) {
  const n = Math.round(Math.sqrt(bits.length));
  const N = n + 2;
  const cellAt = (r: number, c: number) => {
    if (r === 0 || c === 0 || r === N - 1 || c === N - 1) return 0;
    return bits[(r - 1) * n + (c - 1)] === '1' ? 255 : 0;
  };
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      // rotation horaire de (r, c) dans la grille
      let rr = r;
      let cc = c;
      for (let k = 0; k < rot; k++) {
        const t = rr;
        rr = cc;
        cc = N - 1 - t;
      }
      const v = cellAt(r, c);
      for (let py = 0; py < cellPx; py++) {
        for (let px = 0; px < cellPx; px++) {
          const i = ((y0 + rr * cellPx + py) * img.width + (x0 + cc * cellPx + px)) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        }
      }
    }
  }
}

function blank(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  return { width, height, data };
}

describe('js-aruco2 (aller-retour synthétique)', () => {
  it('détecte les marqueurs 0 et 1, leur taille et leur centre', async () => {
    const [b0, b1] = await markerBits([0, 1]);
    expect(markerCells(b0)).toBe(8);
    const det = await createDetector();
    const img = blank(480, 240);
    const cell = 15;
    paint(img, b0, 40, 40, cell);
    paint(img, b1, 300, 40, cell);
    const found = det.detect(img).sort((a, b) => a.id - b.id);
    expect(found.map((m) => m.id)).toEqual([0, 1]);
    const side = 8 * cell;
    expect(markerMeanSidePx(found[0].corners)).toBeGreaterThan(side - 3);
    expect(markerMeanSidePx(found[0].corners)).toBeLessThan(side + 3);
    const c = markerCenter(found[0].corners);
    expect(c.x).toBeCloseTo(40 + side / 2, -0.5);
    expect(c.y).toBeCloseTo(40 + side / 2, -0.5);
    // coin 0 = haut-gauche du marqueur imprimé
    expect(found[0].corners[0].x).toBeLessThan(c.x);
    expect(found[0].corners[0].y).toBeLessThan(c.y);
  });

  it('corners[0] suit le coin haut-gauche imprimé quand le marqueur est tourné de 90°', async () => {
    const [b0] = await markerBits([0]);
    const det = await createDetector();
    const img = blank(240, 240);
    paint(img, b0, 40, 40, 15, 1);
    const found = det.detect(img);
    expect(found).toHaveLength(1);
    const c = markerCenter(found[0].corners);
    // tourné d'un quart de tour horaire : le coin haut-gauche imprimé est en haut à droite
    expect(found[0].corners[0].x).toBeGreaterThan(c.x);
    expect(found[0].corners[0].y).toBeLessThan(c.y);
  });
});
