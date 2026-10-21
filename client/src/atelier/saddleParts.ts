/**
 * Pièces de la tige de selle à chariot (fonctions pures, mm).
 *
 * Repère local de la vue éclatée : origine au centre du chariot (axe des rails), x vers l'avant,
 * y vers le haut, z vers la droite du cycliste. Le fût suit l'axe du tube de selle incliné de
 * `staDeg` sur l'horizontale (≈ 73°) : direction montante a = (−cos, sin, 0). Coque, rails et
 * chariot restent horizontaux. Dimensions courantes : fût Ø 27,2, rails Ø 7 à 42 mm d'entraxe.
 *
 * Deux variantes : chariot à 2 vis verticales (avant/arrière, réglage du bec par différentiel) ou
 * à 1 vis transversale.
 */
import {
  add3,
  basisAround,
  cylinder,
  extrudePath,
  loft,
  norm3,
  scale3,
  type Face,
  type Mark,
  type Solid,
  type Vec3,
} from './iso';

export type SaddleStep = 'height' | 'setback' | 'tilt';
export type ClampVariant = 'two-bolt' | 'one-bolt';

export type PartId = 'shell' | 'upper' | 'rails' | 'lower' | 'head' | 'bolts' | 'post' | 'collar' | 'collarBolt';

export interface SaddlePart {
  id: PartId;
  /** Libellé sur une ou deux lignes courtes (colonne en Plex Mono). */
  label: string[];
  /** Nom complet (description accessible). */
  name: string;
  solid: Solid;
  /** Décalage en vue éclatée (mm). */
  explode: Vec3;
}

/** Geste de la pièce clé : rotation autour d'un axe, sens de serrage = main droite autour de `advance`. */
export interface Gesture {
  center: Vec3;
  /** Sens d'avance de la vis (tête → pointe) : le serrage tourne selon la main droite autour de ce vecteur. */
  advance: Vec3;
  radius: number;
}

export interface SaddleAssembly {
  parts: SaddlePart[];
  /** Pièces à manipuler pour chaque étape (la première est la pièce clé nommée en premier). */
  keys: Record<SaddleStep, PartId[]>;
  gestures: Record<SaddleStep, { part: PartId; gesture: Gesture }>;
}

/* Cotes (mm) */
const POST_R = 13.6;
const POST_LEN = 220;
const HEAD_BOTTOM = -26;
const MIN_INSERT = 150; // repère d'insertion minimale, compté depuis le haut du fût
const COLLAR_AT = 112; // haut du collier (fermé), compté depuis le haut du fût
const COLLAR_H = 14;
const RAIL_R = 3.5;
const RAIL_Z = 21;

const rad = (d: number) => (d * Math.PI) / 180;

/** Coque vue de dessus (x, z) : bec étroit à l'avant, arrière large et arrondi. */
function shellOutline(): [number, number][] {
  const halfW = (x: number) => {
    const t = Math.min(1, Math.max(0, (60 - x) / 130));
    const s = t * t * (3 - 2 * t);
    return 16 + 54 * s;
  };
  const pts: [number, number][] = [];
  // Bec (demi-ellipse), puis flanc droit (z > 0) vers l'arrière, arrondi arrière, flanc gauche.
  for (let i = 0; i <= 8; i++) {
    const t = -Math.PI / 2 + (Math.PI * i) / 8;
    pts.push([128 + 12 * Math.cos(t), 16 * Math.sin(t)]);
  }
  for (let x = 120; x >= -100; x -= 20) pts.push([x, halfW(x)]);
  const wb = halfW(-100);
  for (let i = 1; i < 10; i++) {
    const t = Math.PI / 2 + (Math.PI * i) / 10;
    pts.push([-100 + 28 * Math.cos(t), wb * Math.sin(t)]);
  }
  for (let x = -100; x <= 120; x += 20) pts.push([x, -halfW(x)]);
  return pts;
}

/** Cylindre entre deux points. */
function rod(a: Vec3, b: Vec3, r: number, segments = 12, rings = 1): Face[] {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  return cylinder(a, d, r, Math.hypot(d[0], d[1], d[2]), { segments, rings });
}

/** Vis : tête cylindrique + tige ; `head` = centre de la face d'appui de la tête, `dir` = tête → pointe. */
function screw(head: Vec3, dir: Vec3, len: number, rShank: number, rHead: number, hHead: number): Face[] {
  const w = norm3(dir);
  return [
    ...cylinder(add3(head, scale3(w, -hHead)), w, rHead, hHead, { segments: 16 }),
    ...cylinder(head, w, rShank, len, { segments: 12, rings: 2 }),
  ];
}

/** Assemblage complet pour un angle de tube de selle et une variante de chariot. */
export function saddleAssembly(staDeg: number, variant: ClampVariant = 'two-bolt'): SaddleAssembly {
  const s = rad(staDeg);
  const up: Vec3 = [-Math.cos(s), Math.sin(s), 0]; // axe de la tige, vers le haut
  const down: Vec3 = [Math.cos(s), -Math.sin(s), 0];
  const postTop: Vec3 = [0, HEAD_BOTTOM, 0];
  const along = (k: number): Vec3 => add3(postTop, scale3(down, k));
  const xp = (k: number): Vec3 => scale3(up, k);

  /* Coque de selle : flanc droit puis dessus bombé (anneaux en retrait), lu par l'ombrage seul. */
  const outline = shellOutline();
  const ring = (y: number, d: number): Vec3[] =>
    outline.map(([x, z]) => [14 + (x - 14) * (1 - d / 134), y, Math.sign(z) * Math.max(Math.abs(z) * 0.5, Math.abs(z) - d)]);
  const shell: Solid = { faces: loft([ring(32, 0), ring(39, 0), ring(43, 3.5), ring(45.5, 9), ring(46.5, 16)], [0, 1, 0]) };

  /* Rails : partie droite graduée + remontées vers la coque */
  const railFaces: Face[] = [];
  const railMarks: Mark[] = [];
  for (const side of [1, -1]) {
    const z = side * RAIL_Z;
    railFaces.push(...rod([-45, 0, z], [45, 0, z], RAIL_R, 12, 4));
    railFaces.push(...rod([45, 0, z], [92, 33, z], RAIL_R, 12, 2));
    railFaces.push(...rod([-82, 33, z], [-45, 0, z], RAIL_R, 12, 2));
    // Graduations tous les 5 mm (longues tous les 10 mm) sur la face extérieure.
    for (let x = -35; x <= 35; x += 5) {
      const h = x % 10 === 0 ? 2.6 : 1.4;
      const zz = z + side * (RAIL_R + 0.1);
      railMarks.push({ a: [x, -h, zz], b: [x, h, zz], n: [0, 0, side] });
    }
  }

  /* Demi-coquilles (profil x-y extrudé en z) */
  const upper: Solid = {
    faces: extrudePath(
      [
        [-24, RAIL_R],
        [24, RAIL_R],
        [20, 11],
        [-20, 11],
      ],
      { origin: [0, 0, 0], U: [1, 0, 0], V: [0, 1, 0] },
      -27,
      27,
    ),
  };
  const cradle = (x: number) => -12 + (x * x) / 120;
  const lowerProfile: [number, number][] = [];
  for (let x = -24; x <= 24; x += 4) lowerProfile.push([x, cradle(x)]);
  lowerProfile.push([24, -RAIL_R], [-24, -RAIL_R]);
  const lower: Solid = { faces: extrudePath(lowerProfile, { origin: [0, 0, 0], U: [1, 0, 0], V: [0, 1, 0] }, -24, 24) };

  /* Tête de tige : berceau concave sous la demi-coquille basse */
  const headProfile: [number, number][] = [
    [-22, HEAD_BOTTOM],
    [22, HEAD_BOTTOM],
    [28, -20],
  ];
  for (let x = 28; x >= -28; x -= 4) headProfile.push([x, cradle(x) - 0.5]);
  headProfile.push([-28, -20]);
  const head: Solid = { faces: extrudePath(headProfile, { origin: [0, 0, 0], U: [1, 0, 0], V: [0, 1, 0] }, -17, 17) };

  /* Vis du chariot */
  let bolts: Solid;
  let clampGesture: Gesture;
  if (variant === 'two-bolt') {
    bolts = { faces: [...screw([20, HEAD_BOTTOM, 0], [0, 1, 0], 37, 3.2, 7, 7), ...screw([-20, HEAD_BOTTOM, 0], [0, 1, 0], 37, 3.2, 7, 7)] };
    clampGesture = { center: [20, HEAD_BOTTOM - 11, 0], advance: [0, 1, 0], radius: 17 };
  } else {
    bolts = { faces: screw([0, -7.5, 30], [0, 0, -1], 58, 3.5, 7, 6.5) };
    clampGesture = { center: [0, -7.5, 40], advance: [0, 0, -1], radius: 15 };
  }

  /* Fût + repère d'insertion minimale (anneau gravé + hachures) */
  const postMarks: Mark[] = [];
  {
    const [e1, e2] = basisAround(down);
    const c = along(MIN_INSERT);
    const seg = 28;
    for (let k = 0; k < seg; k++) {
      const t0 = (2 * Math.PI * k) / seg;
      const t1 = (2 * Math.PI * (k + 1)) / seg;
      const r0 = add3(scale3(e1, Math.cos(t0)), scale3(e2, Math.sin(t0)));
      const r1 = add3(scale3(e1, Math.cos(t1)), scale3(e2, Math.sin(t1)));
      const rr = POST_R + 0.1;
      postMarks.push({ a: add3(c, scale3(r0, rr)), b: add3(c, scale3(r1, rr)), n: norm3(add3(r0, r1)) });
      // Hachures sous le repère (zone à garder dans le cadre), une facette sur deux.
      if (k % 2 === 0) {
        const m = norm3(add3(r0, r1));
        const p = add3(c, scale3(m, rr));
        postMarks.push({ a: p, b: add3(p, scale3(down, 9)), n: m });
      }
    }
  }
  const post: Solid = { faces: cylinder(postTop, down, POST_R, POST_LEN, { segments: 28, rings: 12 }), marks: postMarks };

  /* Collier de cadre (anneau fendu à l'arrière, oreilles) et sa vis transversale */
  const U: Vec3 = [Math.sin(s), Math.cos(s), 0]; // perpendiculaire au fût, vers l'avant
  const V: Vec3 = [0, 0, 1];
  const collarProfile: [number, number][] = [];
  {
    const R = 18.5;
    const r = POST_R + 0.3;
    const ear = 8;
    const slot = 2;
    const aOut = Math.atan2(ear, -Math.sqrt(R * R - ear * ear)); // ≈ 154°
    const aIn = Math.atan2(slot, -Math.sqrt(r * r - slot * slot)); // ≈ 172°
    collarProfile.push([-30, -slot], [-30, -ear]);
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const t = -aOut + (2 * aOut * i) / n; // de −154° à +154° en passant par l'avant
      collarProfile.push([R * Math.cos(t), R * Math.sin(t)]);
    }
    collarProfile.push([-30, ear], [-30, slot]);
    for (let i = 0; i <= n; i++) {
      const t = aIn - (2 * aIn * i) / n; // de +172° à −172° par l'avant
      collarProfile.push([r * Math.cos(t), r * Math.sin(t)]);
    }
  }
  const collar: Solid = { faces: extrudePath(collarProfile, { origin: postTop, U, V }, COLLAR_AT, COLLAR_AT + COLLAR_H) };
  const collarBoltHead = add3(along(COLLAR_AT + COLLAR_H / 2), add3(scale3(U, -24), [0, 0, 9]));
  const collarBolt: Solid = { faces: screw(collarBoltHead, [0, 0, -1], 20, 3.2, 6.4, 6.5) };
  const collarGesture: Gesture = { center: add3(collarBoltHead, [0, 0, 11]), advance: [0, 0, -1], radius: 16 };

  const parts: SaddlePart[] = [
    { id: 'shell', label: ['Coque de selle'], name: 'Coque de selle', solid: shell, explode: xp(180) },
    { id: 'upper', label: ['Coquille haute'], name: 'Demi-coquille haute', solid: upper, explode: xp(122) },
    { id: 'rails', label: ['Rails gradués'], name: 'Rails gradués', solid: { faces: railFaces, marks: railMarks }, explode: xp(74) },
    { id: 'lower', label: ['Coquille basse'], name: 'Demi-coquille basse', solid: lower, explode: xp(38) },
    { id: 'head', label: ['Tête de tige'], name: 'Tête de tige', solid: head, explode: [0, 0, 0] },
    {
      id: 'bolts',
      label: [variant === 'two-bolt' ? 'Vis chariot ×2' : 'Vis du chariot'],
      name: variant === 'two-bolt' ? 'Vis du chariot (2 vis)' : 'Vis du chariot',
      solid: bolts,
      // 2 vis : sorties vers le bas et décalées vers l'avant, hors du fût (sinon cachées par lui en 3/4).
      explode: variant === 'two-bolt' ? [56, -26, 0] : [0, 0, 34],
    },
    { id: 'post', label: ['Fût · repère', 'insertion mini'], name: "Fût avec repère d'insertion minimale", solid: post, explode: [0, 0, 0] },
    { id: 'collar', label: ['Collier de cadre'], name: 'Collier de tige (sur le cadre)', solid: collar, explode: xp(-52) },
    { id: 'collarBolt', label: ['Vis du collier'], name: 'Vis du collier', solid: collarBolt, explode: add3(xp(-52), [0, 0, 22]) },
  ];

  return {
    parts,
    keys: { height: ['collar', 'collarBolt'], setback: ['bolts'], tilt: ['bolts'] },
    gestures: {
      height: { part: 'collarBolt', gesture: collarGesture },
      setback: { part: 'bolts', gesture: clampGesture },
      tilt: { part: 'bolts', gesture: clampGesture },
    },
  };
}

/** Tous les sommets d'une pièce (avec décalage éventuel). */
export function partPoints(p: SaddlePart, open: boolean): Vec3[] {
  const off = open ? p.explode : ([0, 0, 0] as Vec3);
  return p.solid.faces.flatMap((f) => f.pts.map((q) => add3(q, off)));
}

/* ---------------------------------------------------------------- Colonne de libellés */

export interface ColumnLabel {
  id: string;
  lines: number;
  /** Ordonnée écran (y bas) souhaitée pour le centre du libellé. */
  want: number;
}

/**
 * Répartit des libellés dans une colonne (y écran vers le bas) sans chevauchement, dans l'ordre
 * donné : chaque libellé vise `want`, puis on repousse vers le bas, puis vers le haut si on déborde.
 * Renvoie le haut de chaque bloc.
 */
export function columnLayout(labels: ColumnLabel[], lineH: number, gap: number, top: number, bottom: number): number[] {
  const h = labels.map((l) => l.lines * lineH);
  const y = labels.map((l, i) => l.want - h[i]! / 2);
  for (let i = 0; i < y.length; i++) {
    const min = i === 0 ? top : y[i - 1]! + h[i - 1]! + gap;
    y[i] = Math.max(y[i]!, min);
  }
  for (let i = y.length - 1; i >= 0; i--) {
    const max = i === y.length - 1 ? bottom - h[i]! : y[i + 1]! - gap - h[i]!;
    y[i] = Math.min(y[i]!, max);
  }
  return y;
}
