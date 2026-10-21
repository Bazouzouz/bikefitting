/**
 * Pièces du cockpit pour la vue éclatée (fonctions pures, mm).
 *
 * Repère local : origine sur l'axe du pivot, au ras du capot de jeu de direction (= `base` de `cockpit()` sans
 * entretoise), x vers l'avant, y vers le haut, z vers la droite du cycliste. Le pivot suit l'axe de direction
 * incliné de `htaDeg` sur l'horizontale : direction montante a = (−cos, sin, 0) (`g.up` du blueprint).
 * La potence part du centre de son collier de pivot, à `stemAngle` au-dessus de la perpendiculaire avant
 * (même convention que `cockpit()` : angle positif = relevée).
 *
 * Dimensions courantes : pivot 1"1/8 (Ø 28,6), entretoises Ø 34, collier de potence 40 mm, cintre Ø 31,8.
 * Deux variantes de façade : 4 vis (route, gravel) ou 2 vis.
 */
import { add3, cylinder, extrudePath, norm3, scale3, type Face, type Solid, type Vec3 } from './iso';
import type { Gesture } from './saddleParts';

export type CockpitStep = 'spacers' | 'stem' | 'bar';
export type FaceplateVariant = 'four-bolt' | 'two-bolt';

export type CockpitPartId = 'steerer' | 'spacers' | 'stem' | 'steererBolts' | 'topCap' | 'capBolt' | 'bar' | 'faceplate' | 'barBolts';

export interface CockpitPart {
  id: CockpitPartId;
  /** Libellé sur une ou deux lignes courtes (colonne en Plex Mono). */
  label: string[];
  /** Nom complet (description accessible). */
  name: string;
  solid: Solid;
  /** Décalage en vue éclatée (mm). */
  explode: Vec3;
}

export interface CockpitAssembly {
  parts: CockpitPart[];
  /** Pièces à manipuler pour chaque temps (la première porte le geste et la mention « valeur gravée »). */
  keys: Record<CockpitStep, CockpitPartId[]>;
  gestures: Record<CockpitStep, { part: CockpitPartId; gesture: Gesture }>;
}

/* Cotes (mm) */
const STEERER_R = 14.3;
const SPACER_R = 17;
/** Entretoises dessinées (mm, de bas en haut) : un exemple de pile, pas de 5 mm. */
const SPACER_STACK = [10, 10, 5];
const CLAMP_R = 20;
const CLAMP_H = 40;
const BAR_R = 15.9;
/** Demi-tronçon de cintre dessiné (zone de serrage seule : la vue reste lisible à 390 px). */
const BAR_HALF = 62;

const rad = (d: number) => (d * Math.PI) / 180;

/** Pavé orienté : profil rectangle (u0..u1, v0..v1) dans le plan (U, V), extrudé de w0 à w1 le long de U × V. */
function block(origin: Vec3, U: Vec3, V: Vec3, u: [number, number], v: [number, number], w: [number, number]): Face[] {
  return extrudePath(
    [
      [u[0], v[0]],
      [u[1], v[0]],
      [u[1], v[1]],
      [u[0], v[1]],
    ],
    { origin, U, V },
    w[0],
    w[1],
  );
}

/** Vis : tête cylindrique + tige ; `head` = centre de la face d'appui de la tête, `dir` = tête → pointe. */
function screw(head: Vec3, dir: Vec3, len: number, rShank: number, rHead: number, hHead: number): Face[] {
  const w = norm3(dir);
  return [
    ...cylinder(add3(head, scale3(w, -hHead)), w, rHead, hHead, { segments: 16 }),
    ...cylinder(head, w, rShank, len, { segments: 12, rings: 2 }),
  ];
}

/** Assemblage pour un angle de direction, une potence (longueur, angle) et une variante de façade. */
export function cockpitAssembly(htaDeg: number, stemLength = 90, stemAngle = -6, variant: FaceplateVariant = 'four-bolt'): CockpitAssembly {
  const h = rad(htaDeg);
  const up: Vec3 = [-Math.cos(h), Math.sin(h), 0]; // axe du pivot, vers le haut
  const fwd: Vec3 = [Math.sin(h), Math.cos(h), 0]; // perpendiculaire avant
  const t = rad(stemAngle);
  const d: Vec3 = norm3(add3(scale3(fwd, Math.cos(t)), scale3(up, Math.sin(t)))); // axe de la potence
  const n: Vec3 = norm3(add3(scale3(fwd, -Math.sin(t)), scale3(up, Math.cos(t)))); // normale « haut » de la potence
  const Z: Vec3 = [0, 0, 1];
  const along = (k: number): Vec3 => scale3(up, k);

  const stackH = SPACER_STACK.reduce((a, b) => a + b, 0);
  const C = along(stackH + CLAMP_H / 2); // centre du collier de pivot (clampC)
  const B = add3(C, scale3(d, stemLength)); // axe de serrage du cintre (bar)

  /* Pivot : de 30 mm dans le tube de direction jusqu'à 3 mm sous le haut de la potence. */
  const steerer: Solid = { faces: cylinder(along(-30), up, STEERER_R, 30 + stackH + CLAMP_H - 3, { segments: 24, rings: 4 }) };

  /* Entretoises : bagues empilées (petit jour pour lire les joints). */
  const spacerFaces: Face[] = [];
  {
    let k = 0;
    for (const hgt of SPACER_STACK) {
      spacerFaces.push(...cylinder(along(k + 0.4), up, SPACER_R, hgt - 0.8, { segments: 24 }));
      k += hgt;
    }
  }

  /* Potence : collier de pivot, oreilles arrière (fente), corps, demi-collier de cintre. */
  const stemFaces: Face[] = [
    ...cylinder(along(stackH), up, CLAMP_R, CLAMP_H, { segments: 24, rings: 2 }),
    ...block(C, fwd, up, [-31, -16], [-CLAMP_H / 2 + 2, CLAMP_H / 2 - 2], [-8, 8]),
    ...block(C, d, n, [CLAMP_R - 4, stemLength - 17], [-11, 11], [-13, 13]),
    ...cylinder(add3(B, [0, 0, -21]), Z, 19, 42, { segments: 24 }),
  ];

  /* Vis de pivot : 2 vis transversales dans les oreilles, tête côté droit (+z). */
  const sbHeads: Vec3[] = [-10, 10].map((k) => add3(add3(C, scale3(fwd, -24)), add3(scale3(up, k), [0, 0, 9])));
  const steererBolts: Solid = { faces: sbHeads.flatMap((p) => screw(p, [0, 0, -1], 18, 3.2, 6, 6)) };

  /* Capot et vis de compression (précharge du jeu de direction, pas de couple de serrage). */
  const capBase = stackH + CLAMP_H + 0.6;
  const topCap: Solid = { faces: cylinder(along(capBase), up, 17, 5, { segments: 24 }) };
  const capHead = along(capBase + 5 + 6);
  const capBolt: Solid = { faces: screw(capHead, scale3(up, -1), 30, 3.2, 6, 6) };

  /* Cintre : tube transversal au collier. */
  const bar: Solid = { faces: cylinder(add3(B, [0, 0, -BAR_HALF]), Z, BAR_R, 2 * BAR_HALF, { segments: 24, rings: 6 }) };

  /* Façade (demi-collier avant) et ses vis, tête vers l'avant. */
  const faceplate: Solid = { faces: block(B, d, n, [BAR_R + 2, BAR_R + 9], [-21, 21], [-20, 20]) };
  const bbOffsets: Array<[number, number]> =
    variant === 'four-bolt'
      ? [
          [14, 13],
          [14, -13],
          [-14, 13],
          [-14, -13],
        ]
      : [
          [15, 0],
          [-15, 0],
        ];
  const bbHeads: Vec3[] = bbOffsets.map(([nv, zv]) => add3(add3(B, scale3(d, BAR_R + 13)), add3(scale3(n, nv), [0, 0, zv])));
  const minusD = scale3(d, -1);
  const barBolts: Solid = { faces: bbHeads.flatMap((p) => screw(p, minusD, 16, 3, 6, 6)) };

  /*
   * Éclaté : la potence monte le long du pivot ; capot et vis au-dessus ; façade et vis vers l'avant, écarts
   * serrés (≈ 10 mm de jour entre pièces) : l'étendue avant fixe la largeur du dessin, donc son échelle.
   */
  const stemX = along(58);
  const parts: CockpitPart[] = [
    { id: 'capBolt', label: ['Vis de', 'compression'], name: 'Vis de compression (capot)', solid: capBolt, explode: along(142) },
    { id: 'topCap', label: ['Capot'], name: 'Capot de jeu de direction', solid: topCap, explode: along(112) },
    { id: 'stem', label: ['Potence'], name: 'Potence', solid: { faces: stemFaces }, explode: stemX },
    {
      id: 'steererBolts',
      label: ['Vis de pivot ×2'],
      name: 'Vis de serrage de la potence sur le pivot (2 vis)',
      solid: steererBolts,
      explode: add3(stemX, [0, 0, 22]),
    },
    {
      id: 'barBolts',
      label: [variant === 'four-bolt' ? 'Vis de cintre ×4' : 'Vis de cintre ×2'],
      name: variant === 'four-bolt' ? 'Vis de façade de cintre (4 vis)' : 'Vis de façade de cintre (2 vis)',
      solid: barBolts,
      explode: add3(stemX, scale3(d, 52)),
    },
    { id: 'faceplate', label: ['Façade'], name: 'Façade de potence', solid: faceplate, explode: add3(stemX, scale3(d, 30)) },
    { id: 'bar', label: ['Cintre'], name: 'Cintre', solid: bar, explode: add3(stemX, scale3(d, 14)) },
    { id: 'spacers', label: ['Entretoises', 'pas de 5 mm'], name: 'Entretoises', solid: { faces: spacerFaces }, explode: along(22) },
    { id: 'steerer', label: ['Pivot de fourche'], name: 'Pivot de fourche', solid: steerer, explode: [0, 0, 0] },
  ];

  const sbGesture: Gesture = { center: add3(sbHeads[1]!, [0, 0, 10]), advance: [0, 0, -1], radius: 14 };
  const bbGesture: Gesture = { center: add3(bbHeads[0]!, scale3(d, 10)), advance: minusD, radius: 14 };

  return {
    parts,
    keys: {
      spacers: ['steererBolts', 'spacers', 'topCap', 'capBolt'],
      stem: ['steererBolts', 'stem', 'barBolts'],
      bar: ['barBolts', 'faceplate', 'bar'],
    },
    gestures: {
      spacers: { part: 'steererBolts', gesture: sbGesture },
      stem: { part: 'steererBolts', gesture: sbGesture },
      bar: { part: 'barBolts', gesture: bbGesture },
    },
  };
}

/** Tous les sommets d'une pièce (avec décalage éventuel). */
export function cockpitPartPoints(p: CockpitPart, open: boolean): Vec3[] {
  const off = open ? p.explode : ([0, 0, 0] as Vec3);
  return p.solid.faces.flatMap((f) => f.pts.map((q) => add3(q, off)));
}
