/**
 * Mini moteur axonométrique (fonctions pures, sans DOM) pour les vues éclatées de l'atelier.
 *
 * Repère 3D en mm : x vers l'avant, y vers le haut, z vers la DROITE du cycliste (x × y = z).
 * Projection orthographique définie par un azimut et une élévation (degrés) :
 *  - az = 0, el = 0 : profil droit (observateur côté +z) → écran (x, y), profondeur = z ;
 *  - az = 90, el = 0 : vue de face (observateur côté +x) → écran (−z, y) ;
 *  - az > 0 tourne l'observateur vers l'avant du vélo, el > 0 le lève.
 * L'écran est en repère mathématique (y haut) : l'inversion de y se fait au rendu SVG.
 *
 * Les solides sont des listes de faces planes à normale sortante explicite. Rendu « peintre » :
 * élimination des faces arrière, tri des faces avant par profondeur du centroïde (loin → près).
 * Arêtes : chaque bord de face est « vif » (toujours tracé) ou « doux » (tracé seulement en
 * silhouette, entre une face avant et une face arrière) ; les arêtes vives entièrement cachées
 * sont rendues à part (pointillés).
 */

export type Vec3 = readonly [number, number, number];
/** Point projeté (repère mathématique, mm) ; `depth` croît vers l'observateur. */
export interface P2 {
  x: number;
  y: number;
}

export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale3 = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm3 = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const rad = (d: number) => (d * Math.PI) / 180;

/* ---------------------------------------------------------------- Caméra */

export interface View {
  /** Azimut (°) : 0 = profil droit, 90 = face avant. */
  az: number;
  /** Élévation (°) : 0 = horizon, 90 = dessus. */
  el: number;
}

/** Base orthonormée de l'écran : droite `r`, haut `u`, et `c` dirigé vers l'observateur. */
export interface Camera {
  r: Vec3;
  u: Vec3;
  c: Vec3;
}

export function camera({ az, el }: View): Camera {
  const a = rad(az);
  const e = rad(el);
  const c: Vec3 = [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
  const r: Vec3 = [Math.cos(a), 0, -Math.sin(a)];
  return { r, u: cross3(c, r), c };
}

/** Projection orthographique d'un point : écran (x, y haut) et profondeur (vers l'observateur). */
export function project(p: Vec3, cam: Camera): P2 & { depth: number } {
  return { x: dot3(p, cam.r), y: dot3(p, cam.u), depth: dot3(p, cam.c) };
}

/* ---------------------------------------------------------------- Solides */

export interface Face {
  pts: Vec3[];
  /** Normale sortante (unitaire). */
  n: Vec3;
  /** soft[i] : le bord pts[i] → pts[i+1] est doux (tracé seulement en silhouette). Absent = tout vif. */
  soft?: boolean[];
}

/** Trait décoratif posé sur une surface (graduation, repère) : visible si sa normale regarde l'observateur. */
export interface Mark {
  a: Vec3;
  b: Vec3;
  n: Vec3;
}

export interface Solid {
  faces: Face[];
  marks?: Mark[];
}

/** Parallélépipède aligné sur les axes. */
export function box(min: Vec3, max: Vec3): Face[] {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const P = (x: number, y: number, z: number): Vec3 => [x, y, z];
  return [
    { n: [1, 0, 0], pts: [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)] },
    { n: [-1, 0, 0], pts: [P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)] },
    { n: [0, 1, 0], pts: [P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0)] },
    { n: [0, -1, 0], pts: [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)] },
    { n: [0, 0, 1], pts: [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)] },
    { n: [0, 0, -1], pts: [P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0)] },
  ];
}

/** Deux vecteurs unitaires (e1, e2) orthogonaux à `axis`, avec e1 × e2 = axis. */
export function basisAround(axis: Vec3): [Vec3, Vec3] {
  const w = norm3(axis);
  const ref: Vec3 = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = norm3(cross3(ref, w));
  return [e1, cross3(w, e1)];
}

export interface CylinderOpts {
  /** Facettes sur la circonférence (défaut 24). */
  segments?: number;
  /** Tronçons le long de l'axe (défaut 1) : améliore le tri peintre des longs fûts. */
  rings?: number;
  /** Bases pleines (défaut true). */
  caps?: boolean;
}

/** Cylindre de `base` sur `length` mm le long de `axis`. */
export function cylinder(base: Vec3, axis: Vec3, radius: number, length: number, opts: CylinderOpts = {}): Face[] {
  const seg = opts.segments ?? 24;
  const rings = Math.max(1, opts.rings ?? 1);
  const w = norm3(axis);
  const [e1, e2] = basisAround(w);
  const radial = Array.from({ length: seg }, (_, k) => {
    const t = (2 * Math.PI * k) / seg;
    return add3(scale3(e1, Math.cos(t)), scale3(e2, Math.sin(t)));
  });
  const ring = (j: number) => {
    const o = add3(base, scale3(w, (length * j) / rings));
    return radial.map((d) => add3(o, scale3(d, radius)));
  };
  const rs = Array.from({ length: rings + 1 }, (_, j) => ring(j));
  const faces: Face[] = [];
  for (let j = 0; j < rings; j++) {
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      const n = norm3(add3(radial[k]!, radial[k1]!));
      faces.push({
        n,
        pts: [rs[j]![k]!, rs[j]![k1]!, rs[j + 1]![k1]!, rs[j + 1]![k]!],
        soft: [j > 0, true, j < rings - 1, true],
      });
    }
  }
  if (opts.caps ?? true) {
    faces.push({ n: scale3(w, -1), pts: [...rs[0]!].reverse() });
    faces.push({ n: w, pts: rs[rings]! });
  }
  return faces;
}

/** Repère d'un profil 2D : point (u, v) ↦ origin + u·U + v·V ; l'extrusion suit W = U × V. */
export interface ProfileFrame {
  origin: Vec3;
  U: Vec3;
  V: Vec3;
}

export interface ExtrudeOpts {
  /** Angle (°) au-delà duquel un coin du profil donne une arête vive (défaut 30). */
  sharpDeg?: number;
}

/** Aire signée d'un polygone 2D (> 0 si sens trigonométrique). */
export function signedArea(pts: readonly (readonly [number, number])[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** Profil 2D fermé (simple, éventuellement concave) extrudé de w0 à w1 le long de W = U × V. */
export function extrudePath(
  profile: readonly (readonly [number, number])[],
  frame: ProfileFrame,
  w0: number,
  w1: number,
  opts: ExtrudeOpts = {},
): Face[] {
  const prof = signedArea(profile) < 0 ? [...profile].reverse() : [...profile];
  const W = norm3(cross3(frame.U, frame.V));
  const at = (p: readonly [number, number], w: number): Vec3 =>
    add3(add3(frame.origin, add3(scale3(frame.U, p[0]), scale3(frame.V, p[1]))), scale3(W, w));
  const n = prof.length;
  const cosSharp = Math.cos(rad(opts.sharpDeg ?? 30));
  const dir = (i: number): [number, number] => {
    const a = prof[i % n]!;
    const b = prof[(i + 1) % n]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  // Coin i : angle entre l'arête entrante (i−1 → i) et sortante (i → i+1).
  const smooth = (i: number) => {
    const d0 = dir((i - 1 + n) % n);
    const d1 = dir(i);
    return d0[0] * d1[0] + d0[1] * d1[1] > cosSharp;
  };
  const lo = prof.map((p) => at(p, w0));
  const hi = prof.map((p) => at(p, w1));
  const faces: Face[] = [];
  for (let i = 0; i < n; i++) {
    const i1 = (i + 1) % n;
    const [du, dv] = dir(i);
    // Normale sortante d'un profil trigonométrique : (dv, −du).
    const nn = norm3(add3(scale3(frame.U, dv), scale3(frame.V, -du)));
    faces.push({ n: nn, pts: [lo[i]!, lo[i1]!, hi[i1]!, hi[i]!], soft: [false, smooth(i1), false, smooth(i)] });
  }
  faces.push({ n: scale3(W, -1), pts: [...lo].reverse() });
  faces.push({ n: W, pts: hi });
  return faces;
}

/**
 * Galbe : anneaux fermés de même nombre de sommets (du bas vers le haut) reliés par des bandes, fermés par
 * une base (anneau 0) et un dessus (dernier anneau). Tous les bords sont doux (seul l'ombrage dessine le
 * galbe ; le contour vient des silhouettes, sans pointillés parasites) sauf aux coins vifs du premier anneau.
 * Les anneaux doivent être convexes et entourer `axis` (centre de gravité intérieur).
 */
export function loft(rings: readonly Vec3[][], axis: Vec3, opts: ExtrudeOpts = {}): Face[] {
  const n = rings[0]!.length;
  const center = scale3(
    rings.flat().reduce((s, p) => add3(s, p), [0, 0, 0] as Vec3),
    1 / (rings.length * n),
  );
  const up = norm3(axis);
  const cosSharp = Math.cos(rad(opts.sharpDeg ?? 30));
  const base = rings[0]!;
  const dir = (i: number) => norm3(sub3(base[(i + 1) % n]!, base[i % n]!));
  const smooth = (i: number) => dot3(dir((i - 1 + n) % n), dir(i)) > cosSharp;
  const faces: Face[] = [];
  for (let j = 0; j + 1 < rings.length; j++) {
    const a = rings[j]!;
    const b = rings[j + 1]!;
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n;
      const pts = [a[i]!, a[i1]!, b[i1]!, b[i]!];
      let nn = norm3(cross3(sub3(a[i1]!, a[i]!), sub3(b[i]!, a[i]!)));
      const mid = scale3(add3(add3(pts[0]!, pts[1]!), add3(pts[2]!, pts[3]!)), 0.25);
      if (dot3(nn, sub3(mid, center)) < 0) nn = scale3(nn, -1);
      faces.push({ n: nn, pts, soft: [true, smooth(i1), true, smooth(i)] });
    }
  }
  const top = rings[rings.length - 1]!;
  // Base : sens choisi pour une normale −axis ; dessus : +axis (bord doux).
  const baseN = dot3(cross3(sub3(base[1]!, base[0]!), sub3(base[2]!, base[1]!)), up) > 0 ? [...base].reverse() : [...base];
  const topPts = dot3(cross3(sub3(top[1]!, top[0]!), sub3(top[2]!, top[1]!)), up) > 0 ? [...top] : [...top].reverse();
  faces.push({ n: scale3(up, -1), pts: baseN, soft: baseN.map(() => true) });
  faces.push({ n: up, pts: topPts, soft: topPts.map(() => true) });
  return faces;
}

export const translateFaces = (faces: Face[], v: Vec3): Face[] =>
  faces.map((f) => ({ ...f, pts: f.pts.map((p) => add3(p, v)) }));

/* ---------------------------------------------------------------- Ombrage */

/** Lumière fixe par rapport à l'observateur : en haut à gauche, légèrement de face. */
export function lightDir(cam: Camera): Vec3 {
  return norm3(add3(add3(scale3(cam.r, -0.45), scale3(cam.u, 0.75)), scale3(cam.c, 0.5)));
}

/** Ombrage à 3 niveaux : 0 = clair, 1 = moyen, 2 = sombre. */
export function shadeLevel(n: Vec3, cam: Camera): 0 | 1 | 2 {
  const d = dot3(n, lightDir(cam));
  return d > 0.6 ? 0 : d > 0.2 ? 1 : 2;
}

export const isFront = (n: Vec3, cam: Camera) => dot3(n, cam.c) > 1e-6;

/* ---------------------------------------------------------------- Peintre */

export interface PaintInput {
  id: string;
  solid: Solid;
  /** Décalage 3D utilisé pour le tri (position cible) ; les points projetés restent SANS décalage. */
  offset?: Vec3;
}

export type PaintItem =
  | {
      kind: 'face';
      part: string;
      key: string;
      pts: P2[];
      level: 0 | 1 | 2;
      depth: number;
      /** Toutes les arêtes tracées avec cette face (vives et silhouettes). */
      edges: [P2, P2][];
      /** Sous-ensemble de `edges` : silhouettes de la pièce (contour plus épais au rendu). */
      outline: [P2, P2][];
    }
  | { kind: 'mark'; part: string; key: string; a: P2; b: P2; depth: number }
  | { kind: 'hidden'; part: string; key: string; edges: [P2, P2][] };

export interface PaintResult {
  /** Éléments dans l'ordre de dessin (loin → près). */
  items: PaintItem[];
  /** Décalage projeté de chaque pièce (mm, repère mathématique). */
  offsets: Record<string, P2>;
}

const vkey = (p: Vec3) => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;

/**
 * Tri peintre de plusieurs solides : faces avant seules, triées loin → près ; arêtes vives et
 * silhouettes rattachées à la dernière face avant dessinée qui les porte ; arêtes vives cachées
 * regroupées par pièce, insérées juste après la face la plus proche de la pièce.
 */
export function paint(inputs: PaintInput[], view: View): PaintResult {
  const cam = camera(view);
  const offsets: Record<string, P2> = {};
  type Tmp = { item: Extract<PaintItem, { kind: 'face' }>; face: Face };
  const faceItems: Tmp[] = [];
  const marks: Extract<PaintItem, { kind: 'mark' }>[] = [];
  const hiddenByPart: Record<string, [P2, P2][]> = {};
  const P = (p: Vec3): P2 => {
    const q = project(p, cam);
    return { x: q.x, y: q.y };
  };

  // Arêtes : clé → faces adjacentes (avant/arrière) et vivacité.
  type Edge = { a: Vec3; b: Vec3; hard: boolean; front: Tmp[]; back: number; part: string };
  const edgeMaps: Map<string, Edge>[] = [];

  for (const inp of inputs) {
    const off = inp.offset ?? [0, 0, 0];
    const po = project(off, cam);
    offsets[inp.id] = { x: po.x, y: po.y };
    const edges = new Map<string, Edge>();
    edgeMaps.push(edges);
    inp.solid.faces.forEach((f, fi) => {
      const front = isFront(f.n, cam);
      let tmp: Tmp | null = null;
      if (front) {
        let cx = 0;
        let cy = 0;
        let cz = 0;
        for (const p of f.pts) {
          cx += p[0];
          cy += p[1];
          cz += p[2];
        }
        const k = 1 / f.pts.length;
        const depth = dot3([cx * k + off[0], cy * k + off[1], cz * k + off[2]], cam.c);
        tmp = {
          face: f,
          item: { kind: 'face', part: inp.id, key: `${inp.id}:${fi}`, pts: f.pts.map(P), level: shadeLevel(f.n, cam), depth, edges: [], outline: [] },
        };
        faceItems.push(tmp);
      }
      for (let i = 0; i < f.pts.length; i++) {
        const a = f.pts[i]!;
        const b = f.pts[(i + 1) % f.pts.length]!;
        const ka = vkey(a);
        const kb = vkey(b);
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        let e = edges.get(key);
        if (!e) {
          e = { a, b, hard: false, front: [], back: 0, part: inp.id };
          edges.set(key, e);
        }
        if (!f.soft?.[i]) e.hard = true;
        if (tmp) e.front.push(tmp);
        else e.back += 1;
      }
    });
    for (const m of inp.solid.marks ?? []) {
      if (!isFront(m.n, cam)) continue;
      const mid = scale3(add3(m.a, m.b), 0.5);
      marks.push({
        kind: 'mark',
        part: inp.id,
        key: `${inp.id}:m${marks.length}`,
        a: P(m.a),
        b: P(m.b),
        // Léger biais vers l'observateur : le trait passe devant la face qui le porte.
        depth: dot3(add3(mid, off), cam.c) + 0.5,
      });
    }
  }

  const order: (Tmp | Extract<PaintItem, { kind: 'mark' }>)[] = [...faceItems, ...marks];
  order.sort((p, q) => depthOf(p) - depthOf(q));
  const rank = new Map<Tmp, number>();
  order.forEach((o, i) => {
    if ('face' in o) rank.set(o, i);
  });

  for (const edges of edgeMaps) {
    for (const e of edges.values()) {
      const seg: [P2, P2] = [P(e.a), P(e.b)];
      if (e.front.length > 0) {
        const silhouette = e.back > 0 || e.front.length === 1;
        if (!e.hard && !silhouette) continue;
        let last = e.front[0]!;
        for (const t of e.front) if (rank.get(t)! > rank.get(last)!) last = t;
        last.item.edges.push(seg);
        if (silhouette) last.item.outline.push(seg);
      } else if (e.hard) {
        (hiddenByPart[e.part] ??= []).push(seg);
      }
    }
  }

  // Arêtes cachées d'une pièce : juste après sa face la plus proche (les pièces plus proches les recouvrent).
  const items: PaintItem[] = [];
  const lastIndex: Record<string, number> = {};
  order.forEach((o, i) => {
    if ('face' in o) lastIndex[o.item.part] = i;
  });
  order.forEach((o, i) => {
    const it = 'face' in o ? o.item : o;
    items.push(it);
    if ('face' in o && lastIndex[o.item.part] === i && hiddenByPart[o.item.part]) {
      items.push({ kind: 'hidden', part: o.item.part, key: `${o.item.part}:hidden`, edges: hiddenByPart[o.item.part]! });
    }
  });
  return { items, offsets };
}

function depthOf(o: { item: { depth: number } } | { depth: number }): number {
  return 'item' in o ? o.item.depth : o.depth;
}

/* ---------------------------------------------------------------- Outils de rendu */

/** Arc de geste autour d'un axe (règle de la main droite autour de `axis`), projeté. */
export function gestureArc(
  center: Vec3,
  axis: Vec3,
  radius: number,
  view: View,
  fromDeg = 20,
  toDeg = 290,
  steps = 28,
): P2[] {
  const cam = camera(view);
  const [e1, e2] = basisAround(axis);
  const out: P2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = rad(fromDeg + ((toDeg - fromDeg) * i) / steps);
    const p = add3(center, add3(scale3(e1, radius * Math.cos(t)), scale3(e2, radius * Math.sin(t))));
    const q = project(p, cam);
    out.push({ x: q.x, y: q.y });
  }
  return out;
}

/** Bornes d'un dessin projeté (mm, repère mathématique). */
export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Zone de dessin (unités du viewBox, y vers le bas). */
export interface DrawBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Cadrage : écran = (ox + x·k, oy − y·k). */
export interface Fit {
  k: number;
  ox: number;
  oy: number;
}

/**
 * Cadrage qui centre `b` (élargies de `margin` mm de chaque côté) dans `box`, à la plus grande échelle qui tient,
 * plafonnée à `kMax` (en dessous du plafond, le dessin reste centré dans la zone).
 */
export function fitBounds(b: Bounds, box: DrawBox, margin: number, kMax = Infinity): Fit {
  const w = b.maxX - b.minX + 2 * margin;
  const h = b.maxY - b.minY + 2 * margin;
  const k = Math.min(kMax, (box.x1 - box.x0) / w, (box.y1 - box.y0) / h);
  return {
    k,
    ox: (box.x0 + box.x1) / 2 - ((b.minX + b.maxX) / 2) * k,
    oy: (box.y0 + box.y1) / 2 + ((b.minY + b.maxY) / 2) * k,
  };
}

/** Bornes projetées d'un ensemble de points 3D. */
export function projectedBounds(pts: readonly Vec3[], view: View): Bounds {
  const cam = camera(view);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    const q = project(p, cam);
    minX = Math.min(minX, q.x);
    maxX = Math.max(maxX, q.x);
    minY = Math.min(minY, q.y);
    maxY = Math.max(maxY, q.y);
  }
  return { minX, maxX, minY, maxY };
}
