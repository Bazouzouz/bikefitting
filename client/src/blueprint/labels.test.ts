// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Bike } from '@bikefit/shared';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sideDims } from './BikeBlueprint';
import { fitAspect, setupFromCurrent, toFrame, unionBounds, type Setup } from './geometry';
import { hitsCircle, labelSize, layoutLabels, overlap, overlaps, type Box } from './labels';
import { sideBounds } from './SideView';

const bikes = JSON.parse(readFileSync(fileURLToPath(new URL('../../../server/data/bikes.json', import.meta.url)), 'utf8')) as
  | Bike[]
  | { bikes: Bike[] };
const list = Array.isArray(bikes) ? bikes : bikes.bikes;
const grvl = list.find((b) => b.model.startsWith('GRVL'))!;

const setupOf = (sz: Bike['sizes'][number], shift = 0): Setup => ({
  ...setupFromCurrent({
    saddleHeight: Math.round(0.86 * 830) + shift,
    saddleSetback: 60 + shift / 2,
    stemLength: sz.stemLength,
    stemAngle: sz.stemAngle ?? -6,
    spacers: sz.spacers ?? 20,
    handlebarWidth: sz.handlebarWidth,
    crankLength: sz.crankLength,
    cleatFore: 0,
  } as Parameters<typeof setupFromCurrent>[0]),
});

describe('labelSize (IBM Plex Mono : 0,6 em par caractère)', () => {
  it('largeur = caractères × 0,6 fs', () => {
    expect(labelSize(['Reach 391 mm'], 10).w).toBeCloseTo(72, 6);
    expect(labelSize(['a', 'b'], 10).h).toBeGreaterThan(labelSize(['a'], 10).h);
  });
});

describe('cotes de la vue de côté : aucun chevauchement (GRVL AF, 5 tailles)', () => {
  const frames = grvl.sizes.map((s) => toFrame(s, 'gravel'));
  const bounds = fitAspect(unionBounds(frames.map((f) => sideBounds(f, grvl.wheel, true, 150))), 4 / 3) // = stageBounds (STAGE_GROUND_MARGIN);
  const inside = (b: Box) =>
    b.x0 >= bounds.minX - 1e-6 && b.x1 <= bounds.maxX + 1e-6 && b.y0 >= bounds.minY - 1e-6 && b.y1 <= bounds.maxY + 1e-6;
  // fs (unités du dessin) : 390 px (texte 11 px) et 1280 px (scène ≈ 760 px, texte 12 px)
  const W = bounds.maxX - bounds.minX;
  for (const [label, fs] of [
    ['390 px', (11 * W) / 358],
    ['1280 px', (12 * W) / 760],
  ] as const) {
    for (const [i, sz] of grvl.sizes.entries()) {
      it(`${sz.label} à ${label}`, () => {
        const cur = setupOf(sz);
        const tgt = setupOf(sz, 14);
        for (const [frameDims, tuneDims] of [
          [true, false],
          [false, true],
          [true, true],
        ] as const) {
          const set = sideDims({ frame: frames[i]!, wheel: grvl.wheel, cur, tgt, fs, frameDims, tuneDims });
          const placed = layoutLabels(set.labels, { fs, bounds, obstacles: set.obstacles });
          expect(overlaps(placed)).toEqual([]);
          for (const p of placed) expect(inside(p.box)).toBe(true);
          // pas de libellé sur les pièces (selle, cockpit) : obstacles de poids ≥ 4
          for (const p of placed)
            for (const o of set.obstacles)
              if ('box' in o && (o.weight ?? 1) >= 4) expect(overlap(p.box, o.box), `${p.spec.id} sur une pièce`).toBe(0);
          // ni sur les roues
          for (const p of placed)
            for (const o of set.obstacles)
              if ('circle' in o && o.circle.r > 300) expect(hitsCircle(p.box, o.circle.c, o.circle.r), `${p.spec.id} sur une roue`).toBe(false);
        }
      });
    }
  }
});
