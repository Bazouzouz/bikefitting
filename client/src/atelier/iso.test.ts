// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { box, camera, cylinder, dot3, extrudePath, fitBounds, gestureArc, isFront, paint, project, projectedBounds, shadeLevel, translateFaces, type Vec3 } from './iso';
import { columnLayout, partPoints, saddleAssembly } from './saddleParts';
import { cockpitAssembly, cockpitPartPoints } from './cockpitParts';
import { DEFAULT_VIEW, frameAt, frameLayout } from './Exploded';

const close = (a: { x: number; y: number }, x: number, y: number) => {
  expect(a.x).toBeCloseTo(x, 6);
  expect(a.y).toBeCloseTo(y, 6);
};

describe('projection orthographique (x avant, y haut, z droite)', () => {
  it('az 0, el 0 : profil droit, écran = (x, y), profondeur = z', () => {
    const cam = camera({ az: 0, el: 0 });
    const p = project([100, 50, 30], cam);
    close(p, 100, 50);
    expect(p.depth).toBeCloseTo(30, 6);
  });
  it('az 90, el 0 : vue de face, écran = (−z, y), profondeur = x', () => {
    const p = project([100, 50, 30], camera({ az: 90, el: 0 }));
    close(p, -30, 50);
    expect(p.depth).toBeCloseTo(100, 6);
  });
  it('el 90 : vue de dessus, la droite du cycliste en bas de l’écran', () => {
    const p = project([0, 0, 40], camera({ az: 0, el: 90 }));
    close(p, 0, -40);
  });
  it('3/4 avant-droit (35°, 25°) : axes connus', () => {
    const v = { az: 35, el: 25 };
    const cam = camera(v);
    const s = Math.sin((35 * Math.PI) / 180);
    const c = Math.cos((35 * Math.PI) / 180);
    const se = Math.sin((25 * Math.PI) / 180);
    const ce = Math.cos((25 * Math.PI) / 180);
    // Axe vertical : reste vertical, raccourci par cos(el).
    close(project([0, 100, 0], cam), 0, 100 * ce);
    // Axe avant : vers la droite et vers le bas.
    close(project([100, 0, 0], cam), 100 * c, -100 * s * se);
    // Axe droit : vers la gauche et vers le bas.
    close(project([0, 0, 100], cam), -100 * s, -100 * c * se);
    // Base orthonormée directe.
    expect(dot3(cam.r, cam.u)).toBeCloseTo(0, 9);
    expect(dot3(cam.r, cam.c)).toBeCloseTo(0, 9);
  });
});

describe('faces visibles et ordre peintre', () => {
  const cube = box([-10, -10, -10], [10, 10, 10]);
  const visible = (az: number) =>
    cube
      .filter((f) => isFront(f.n, camera({ az, el: 25 })))
      .map((f) => f.n.join(','))
      .sort();

  it('az 35 : avant, dessus, droite', () => {
    expect(visible(35)).toEqual(['0,0,1', '0,1,0', '1,0,0'].sort());
  });
  it('az −5 : arrière, dessus, droite', () => {
    expect(visible(-5)).toEqual(['-1,0,0', '0,0,1', '0,1,0'].sort());
  });
  it('az 75 : avant, dessus, droite (droite encore visible)', () => {
    expect(visible(75)).toEqual(['0,0,1', '0,1,0', '1,0,0'].sort());
  });

  const order = (az: number) =>
    [...new Set(paint([
      { id: 'arriere', solid: { faces: translateFaces(cube, [-60, 0, 0]) } },
      { id: 'avant', solid: { faces: translateFaces(cube, [60, 0, 0]) } },
      { id: 'gauche', solid: { faces: translateFaces(cube, [0, 0, -60]) } },
    ], { az, el: 25 }).items.filter((i) => i.kind === 'face').map((i) => i.part))];

  it('az 35 : la boîte avant est peinte après la boîte arrière, la gauche en premier', () => {
    const o = order(35);
    expect(o.indexOf('avant')).toBeGreaterThan(o.indexOf('arriere'));
    expect(o[0]).toBe('gauche');
  });
  it('az −5 : la boîte arrière passe devant la boîte avant', () => {
    const o = order(-5);
    expect(o.indexOf('arriere')).toBeGreaterThan(o.indexOf('avant'));
  });
  it('az 75 : la boîte avant est peinte en dernier', () => {
    const o = order(75);
    expect(o[o.length - 1]).toBe('avant');
  });

  it('le tri suit la profondeur croissante et les faces arrière sont éliminées', () => {
    const r = paint([{ id: 'c', solid: { faces: cube } }], { az: 35, el: 25 });
    const faces = r.items.filter((i) => i.kind === 'face');
    expect(faces).toHaveLength(3);
    for (let i = 1; i < faces.length; i++) {
      expect((faces[i] as { depth: number }).depth).toBeGreaterThanOrEqual((faces[i - 1] as { depth: number }).depth);
    }
    // 12 arêtes : 9 visibles, 3 cachées (pointillés).
    const vis = faces.reduce((n, f) => n + (f.kind === 'face' ? f.edges.length : 0), 0);
    const hidden = r.items.find((i) => i.kind === 'hidden');
    expect(vis).toBe(9);
    expect(hidden && hidden.kind === 'hidden' ? hidden.edges.length : 0).toBe(3);
  });

  it('le décalage cible change le tri mais pas les points projetés', () => {
    const a = paint([{ id: 'c', solid: { faces: cube } }], { az: 35, el: 25 });
    const b = paint([{ id: 'c', solid: { faces: cube }, offset: [0, 50, 0] }], { az: 35, el: 25 });
    const fa = a.items[0]!;
    const fb = b.items[0]!;
    expect(fa.kind === 'face' && fb.kind === 'face' && fa.pts[0]!.x === fb.pts[0]!.x).toBe(true);
    expect(b.offsets.c!.y).toBeCloseTo(50 * Math.cos((25 * Math.PI) / 180), 6);
  });
});

describe('primitives', () => {
  it('cylindre : facettes latérales sans arêtes vives, silhouettes seules tracées', () => {
    const cyl = cylinder([0, 0, 0], [0, 1, 0], 10, 50, { segments: 24, rings: 3 });
    expect(cyl).toHaveLength(24 * 3 + 2);
    const r = paint([{ id: 'c', solid: { faces: cyl } }], { az: 35, el: 25 });
    const segs = r.items.reduce((n, i) => n + (i.kind === 'face' ? i.edges.length : 0), 0);
    // Base haute (24) + bas avant (≈ 12) + 2 silhouettes × 3 tronçons : bien moins que toutes les arêtes.
    expect(segs).toBeGreaterThan(24);
    expect(segs).toBeLessThan(50);
  });
  it('extrusion : normales sortantes quel que soit le sens du profil', () => {
    const sq: [number, number][] = [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
    ]; // sens horaire
    const f = extrudePath(sq, { origin: [0, 0, 0], U: [1, 0, 0], V: [0, 1, 0] }, 0, 5);
    const center: Vec3 = [5, 5, 2.5];
    for (const face of f) {
      const p = face.pts[0]!;
      expect(dot3(face.n, [p[0] - center[0], p[1] - center[1], p[2] - center[2]])).toBeGreaterThan(0);
    }
  });
  it('ombrage : 3 niveaux, le dessus plus clair que le flanc droit en 3/4 avant', () => {
    const cam = camera({ az: 35, el: 25 });
    expect(shadeLevel([0, 1, 0], cam)).toBeLessThan(shadeLevel([0, 0, 1], cam));
    expect([0, 1, 2]).toContain(shadeLevel([1, 0, 0], cam));
  });
});

describe('flèche de serrage (main droite autour du sens d’avance)', () => {
  it('vis tête en bas vue de dessus : sens trigonométrique à l’écran ; vue de dessous : horaire', () => {
    const arcTop = gestureArc([0, 0, 0], [0, 1, 0], 10, { az: 0, el: 90 }, 0, 90, 2);
    const arcBottom = gestureArc([0, 0, 0], [0, 1, 0], 10, { az: 0, el: -90 }, 0, 90, 2);
    const turn = (p: { x: number; y: number }[]) => (p[1]!.x - p[0]!.x) * (p[2]!.y - p[1]!.y) - (p[1]!.y - p[0]!.y) * (p[2]!.x - p[1]!.x);
    expect(turn(arcTop)).toBeGreaterThan(0); // trigonométrique vu depuis la pointe
    expect(turn(arcBottom)).toBeLessThan(0); // horaire vu depuis la tête : on serre
  });
});

describe('cadrage de la vue éclatée', () => {
  it('fitBounds : centré, plafonné', () => {
    const b = { minX: -10, maxX: 30, minY: 0, maxY: 20 };
    const zone = { x0: 0, x1: 100, y0: 0, y1: 100 };
    const f = fitBounds(b, zone, 5);
    expect(f.k).toBeCloseTo(2, 9); // 100 / (40 + 10)
    expect(f.ox + 10 * f.k).toBeCloseTo(50, 9); // centre x (10) au milieu
    expect(f.oy - 10 * f.k).toBeCloseTo(50, 9);
    expect(fitBounds(b, zone, 5, 1.5).k).toBe(1.5);
  });

  const cockpit = cockpitAssembly(71.5, 90, -6);
  const cPts = cockpit.parts.flatMap((p) => [...cockpitPartPoints(p, false), ...cockpitPartPoints(p, true)]);
  const cLines = cockpit.parts.reduce((a, p) => a + p.label.length, 2);
  const range = Array.from({ length: 17 }, (_, i) => DEFAULT_VIEW.az - 40 + 5 * i);

  it('cockpit : dessin dans la zone à chaque azimut, échelle ≤ vue par défaut', () => {
    const lay = frameLayout(cPts, cLines, cockpit.parts.length);
    for (const az of range) {
      const f = frameAt(lay, cPts, az);
      const b = projectedBounds(cPts, { az, el: DEFAULT_VIEW.el });
      expect(f.k).toBeLessThanOrEqual(lay.kMax + 1e-9);
      expect(f.ox + b.minX * f.k).toBeGreaterThanOrEqual(lay.box.x0 - 1e-6);
      expect(f.ox + b.maxX * f.k).toBeLessThanOrEqual(lay.box.x1 + 1e-6);
      expect(f.oy - b.maxY * f.k).toBeGreaterThanOrEqual(lay.box.y0 - 1e-6);
      expect(f.oy - b.minY * f.k).toBeLessThanOrEqual(lay.box.y1 + 1e-6);
    }
  });

  it('cockpit : vue par défaut ≥ +30 % de surface par rapport au cadrage union d’avant', () => {
    // Ancienne méthode (union sur ±40°, zone 186 × 396) appliquée à l'éclaté actuel : le recadrage fait mieux.
    let old = projectedBounds(cPts, DEFAULT_VIEW);
    for (const az of range) {
      const q = projectedBounds(cPts, { az, el: DEFAULT_VIEW.el });
      old = { minX: Math.min(old.minX, q.minX), maxX: Math.max(old.maxX, q.maxX), minY: Math.min(old.minY, q.minY), maxY: Math.max(old.maxY, q.maxY) };
    }
    const kOld = 0.681; // avant : union sur ±40° et éclaté d'origine (façade d·40, vis d·72), 186 / (241 + 32)
    const lay = frameLayout(cPts, cLines, cockpit.parts.length);
    const k = frameAt(lay, cPts, DEFAULT_VIEW.az).k;
    expect((k / kOld) ** 2).toBeGreaterThanOrEqual(1.3);
    expect(k).toBeGreaterThan(fitBounds(old, { x0: 6, x1: 192, y0: 12, y1: 408 }, 16).k);
  });

  it('hauteur du viewBox : inchangée pour la selle et le cockpit (320)', () => {
    const s = saddleAssembly(73.5);
    const sPts = s.parts.flatMap((p) => [...partPoints(p, false), ...partPoints(p, true)]);
    expect(frameLayout(sPts, s.parts.reduce((a, p) => a + p.label.length, 2), s.parts.length).vbH).toBe(320);
    expect(frameLayout(cPts, cLines, cockpit.parts.length).vbH).toBe(320);
  });
});

describe('tige de selle', () => {
  it('2 vis et 1 vis : 9 pièces, pièce clé selon l’étape', () => {
    for (const v of ['two-bolt', 'one-bolt'] as const) {
      const a = saddleAssembly(73, v);
      expect(a.parts.map((p) => p.id)).toEqual(['shell', 'upper', 'rails', 'lower', 'head', 'bolts', 'post', 'collar', 'collarBolt']);
      expect(a.keys.height[0]).toBe('collar');
      expect(a.keys.setback[0]).toBe('bolts');
      expect(a.keys.tilt[0]).toBe('bolts');
    }
  });
  it('éclatement le long de l’axe de la tige incliné à staDeg', () => {
    const a = saddleAssembly(73);
    const shell = a.parts.find((p) => p.id === 'shell')!;
    const ang = (Math.atan2(shell.explode[1], -shell.explode[0]) * 180) / Math.PI;
    expect(ang).toBeCloseTo(73, 6);
  });
  it('colonne de libellés : aucun chevauchement, bornes respectées', () => {
    const y = columnLayout(
      [
        { id: 'a', lines: 2, want: 10 },
        { id: 'b', lines: 1, want: 12 },
        { id: 'c', lines: 2, want: 300 },
      ],
      13,
      6,
      0,
      120,
    );
    expect(y[0]).toBeGreaterThanOrEqual(0);
    expect(y[1]!).toBeGreaterThanOrEqual(y[0]! + 26 + 6);
    expect(y[2]! + 26).toBeLessThanOrEqual(120);
  });
});
