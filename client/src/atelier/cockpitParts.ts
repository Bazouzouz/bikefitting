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
 *
 * Hauteur d'entretoises réglable (`spacersMm`) : l'origine reste au ras du capot de jeu de direction, donc potence,
 * vis, capot, cintre et façade montent avec la pile (leurs coordonnées locales changent) et le pivot s'allonge d'autant.
 * Entretoises au-dessus de la potence (`spacersAboveMm`, sous le capot) : capot et vis remontent d'autant, le pivot
 * dépasse jusqu'à 3 mm sous le haut de cette pile. Pivot = dessous + collier + dessus : transférer une entretoise du
 * dessous au-dessus (sémantique du guide, `simWithSpacers`) ne change pas sa longueur.
 *
 * Hauteurs continues (réglage animé) : chaque pile = bagues réalistes de 10 / 5 mm (`spacerStack` de la partie au pas
 * de 5) + une « bague en transit » de la hauteur restante, CONTRE LE COLLIER de potence (en haut de la pile du dessous,
 * en bas de celle du dessus). Pendant un transfert, cette bague se comprime d'un côté de la potence et grandit de
 * l'autre : la potence glisse continûment, et aux valeurs du pas de 5 (début et fin du réglage) il ne reste que des
 * bagues réelles.
 */
import { add3, cylinder, extrudePath, norm3, scale3, type Face, type Solid, type Vec3 } from './iso';
import type { Gesture } from './saddleParts';

export type CockpitStep = 'spacers' | 'stem' | 'bar';
export type FaceplateVariant = 'four-bolt' | 'two-bolt';

export type CockpitPartId = 'steerer' | 'spacers' | 'spacersAbove' | 'stem' | 'steererBolts' | 'topCap' | 'capBolt' | 'bar' | 'faceplate' | 'barBolts';

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
/** Entretoises dessinées par défaut (mm, de bas en haut) : un exemple de pile, pas de 5 mm. */
const SPACER_STACK = [10, 10, 5];
/** Hauteur de la pile par défaut (mm). */
export const SPACER_STACK_MM = SPACER_STACK.reduce((a, b) => a + b, 0);
const CLAMP_R = 20;
const CLAMP_H = 40;
const BAR_R = 15.9;
/** Demi-tronçon de cintre dessiné (zone de serrage seule : la vue reste lisible à 390 px). */
export const BAR_HALF = 62;
/** Demi-tronçon minimal (un rétrécissement animé laisse le cintre dépasser du collier de 42 mm). */
export const BAR_HALF_MIN = 30;

const rad = (d: number) => (d * Math.PI) / 180;

/** Pile d'entretoises pour une hauteur (mm, de bas en haut) : arrondi au pas de 5, bagues de 10 puis une de 5 ; 0 → vide. */
export function spacerStack(mm: number): number[] {
  const h = Math.max(0, Math.round(mm / 5) * 5);
  const stack: number[] = Array.from({ length: Math.floor(h / 10) }, () => 10);
  if (h % 10) stack.push(5);
  return stack;
}

/**
 * Pile pour une hauteur continue (mm, de bas en haut) : bagues de `spacerStack` sur la partie au pas de 5, puis une
 * bague partielle (en transit) du reste ; `transitFirst` la place en bas (pile au-dessus de la potence). 0 → vide.
 */
export function spacerRings(mm: number, transitFirst = false): number[] {
  const h = Math.max(0, mm);
  const full = Math.floor(h / 5 + 1e-9) * 5;
  const rest = h - full;
  const stack = spacerStack(full);
  if (rest <= 1e-6) return stack;
  return transitFirst ? [rest, ...stack] : [...stack, rest];
}

/** Dessine une pile à partir de `k0` le long de `up` (petit jour aux joints, réduit sur une bague fine). */
function ringFaces(stack: readonly number[], k0: number, up: Vec3): Face[] {
  const faces: Face[] = [];
  let k = k0;
  for (const hgt of stack) {
    const gap = Math.min(0.4, hgt / 4);
    faces.push(...cylinder(scale3(up, k + gap), up, SPACER_R, hgt - 2 * gap, { segments: 24 }));
    k += hgt;
  }
  return faces;
}

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

/**
 * Assemblage pour un angle de direction, une potence (longueur, angle) et une variante de façade. `spacersMm` :
 * hauteur de la pile sous la potence (`spacerRings`, continue) ; absent = pile d'exemple (SPACER_STACK).
 * `spacersAboveMm` : pile au-dessus de la potence (pièce « spacersAbove », présente seulement si la valeur est donnée,
 * même nulle : la colonne de libellés ne change pas pendant un réglage). `barDeltaMm` : écart de largeur de cintre,
 * le tronçon dessiné s'allonge de la moitié de chaque côté (borné à BAR_HALF_MIN).
 */
export function cockpitAssembly(
  htaDeg: number,
  stemLength = 90,
  stemAngle = -6,
  variant: FaceplateVariant = 'four-bolt',
  spacersMm?: number,
  spacersAboveMm?: number,
  barDeltaMm = 0,
): CockpitAssembly {
  const h = rad(htaDeg);
  const up: Vec3 = [-Math.cos(h), Math.sin(h), 0]; // axe du pivot, vers le haut
  const fwd: Vec3 = [Math.sin(h), Math.cos(h), 0]; // perpendiculaire avant
  const t = rad(stemAngle);
  const d: Vec3 = norm3(add3(scale3(fwd, Math.cos(t)), scale3(up, Math.sin(t)))); // axe de la potence
  const n: Vec3 = norm3(add3(scale3(fwd, -Math.sin(t)), scale3(up, Math.cos(t)))); // normale « haut » de la potence
  const Z: Vec3 = [0, 0, 1];
  const along = (k: number): Vec3 => scale3(up, k);

  const stack = spacersMm === undefined ? SPACER_STACK : spacerRings(spacersMm);
  const stackH = stack.reduce((a, b) => a + b, 0);
  const hasAbove = spacersAboveMm !== undefined;
  const above = spacerRings(spacersAboveMm ?? 0, true);
  const aboveH = above.reduce((a, b) => a + b, 0);
  const stemTop = stackH + CLAMP_H; // haut du collier de pivot
  const C = along(stackH + CLAMP_H / 2); // centre du collier de pivot (clampC)
  const B = add3(C, scale3(d, stemLength)); // axe de serrage du cintre (bar)

  /* Pivot : de 30 mm dans le tube de direction jusqu'à 3 mm sous le haut de la potence (ou des entretoises du dessus). */
  const steerer: Solid = { faces: cylinder(along(-30), up, STEERER_R, 30 + stemTop + aboveH - 3, { segments: 24, rings: 4 }) };

  /* Entretoises : bagues empilées sous la potence et au-dessus (petit jour pour lire les joints). */
  const spacerFaces = ringFaces(stack, 0, up);
  const aboveFaces = ringFaces(above, stemTop, up);

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
  const capBase = stemTop + aboveH + 0.6;
  const topCap: Solid = { faces: cylinder(along(capBase), up, 17, 5, { segments: 24 }) };
  const capHead = along(capBase + 5 + 6);
  const capBolt: Solid = { faces: screw(capHead, scale3(up, -1), 30, 3.2, 6, 6) };

  /* Cintre : tube transversal au collier ; un écart de largeur allonge (raccourcit) chaque côté de sa moitié. */
  const barHalf = Math.max(BAR_HALF_MIN, BAR_HALF + barDeltaMm / 2);
  const bar: Solid = { faces: cylinder(add3(B, [0, 0, -barHalf]), Z, BAR_R, 2 * barHalf, { segments: 24, rings: 6 }) };

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
    ...(hasAbove
      ? [
          {
            id: 'spacersAbove' as const,
            label: ['Entretoises', 'au-dessus'],
            name: 'Entretoises au-dessus de la potence',
            solid: { faces: aboveFaces },
            explode: along(84),
          },
        ]
      : []),
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
      spacers: hasAbove ? ['steererBolts', 'spacers', 'spacersAbove', 'topCap', 'capBolt'] : ['steererBolts', 'spacers', 'topCap', 'capBolt'],
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

/**
 * Géométrie dessinée du cockpit : entretoises dessous (absente = pile d'exemple) et dessus (absente = aucune pièce),
 * potence, largeur de cintre (mm, départ ; seul l'écart est dessiné).
 */
export interface CockpitGeom {
  spacers?: number;
  spacersAbove?: number;
  stemLength: number;
  stemAngle: number;
  handlebarWidth?: number;
}

/** Réglage animé : écarts (mm, °) à parcourir, au temps `t` ∈ [0, 1]. */
export interface CockpitAdjust {
  spacers?: number;
  stemLength?: number;
  stemAngle?: number;
  handlebarWidth?: number;
  t: number;
}

/**
 * Géométrie au temps `t` : départ + écart · t. Un écart d'entretoises sans hauteur de départ part de la pile
 * d'exemple (SPACER_STACK_MM). Avec des entretoises au-dessus, c'est un TRANSFERT (comme `simWithSpacers` du guide) :
 * dessous + dessus constant, dessous borné à [0, dessous + dessus] (au-delà, pivot trop court : la potence s'arrête
 * en butée, rien n'est ajouté) ; sans, la pile du dessous change seule (bornée ≥ 0) et le pivot suit.
 * Largeur de cintre : départ (absente = 0) + écart · t, seulement si un écart est donné.
 */
export function cockpitGeomAt(start: CockpitGeom, adjust: Omit<CockpitAdjust, 't'> | undefined, t: number): CockpitGeom {
  if (!adjust) return start;
  const dS = adjust.spacers ?? 0;
  const dW = adjust.handlebarWidth ?? 0;
  let spacers = start.spacers;
  let spacersAbove = start.spacersAbove;
  if (dS) {
    const below0 = start.spacers ?? SPACER_STACK_MM;
    if (start.spacersAbove === undefined) spacers = Math.max(0, below0 + dS * t);
    else {
      const total = below0 + start.spacersAbove;
      spacers = Math.min(total, Math.max(0, below0 + dS * t));
      spacersAbove = total - spacers;
    }
  }
  return {
    spacers,
    spacersAbove,
    stemLength: start.stemLength + (adjust.stemLength ?? 0) * t,
    stemAngle: start.stemAngle + (adjust.stemAngle ?? 0) * t,
    handlebarWidth: dW ? (start.handlebarWidth ?? 0) + dW * t : start.handlebarWidth,
  };
}

/** Tous les sommets d'une pièce (avec décalage éventuel). */
export function cockpitPartPoints(p: CockpitPart, open: boolean): Vec3[] {
  const off = open ? p.explode : ([0, 0, 0] as Vec3);
  return p.solid.faces.flatMap((f) => f.pts.map((q) => add3(q, off)));
}
