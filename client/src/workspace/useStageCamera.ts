import { useCallback, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { Bike } from '@bikefit/shared';
import { useStore, type StageFocus } from '../components/store';
import { saddleShape, cockpitShape } from '../blueprint/BikeBlueprint';
import { angleLabelPoints, type AngleKey } from '../blueprint/RiderOverlay';
import { TOP_SETBACK_Y, topSaddle } from '../blueprint/TopView';
import type { RiderMeasurements } from '../fit/types';
import { cockpit, frameGeometry, seatPostTop, wheelRadius, type Bounds, type Frame, type Pt, type Setup } from '../blueprint/geometry';

/** viewBox SVG : [x, y, largeur, hauteur] (y vers le bas, donc y = −maxY du repère mathématique). */
export type ViewBox = readonly [number, number, number, number];

/** Durée d'un mouvement de caméra (zoom ou dézoom), easeInOutCubic. */
export const CAMERA_MS = 850;
/** Largeur de zoom visée (mm) : selle ou cockpit et leurs abords, comme le prototype. */
const ZOOM_W = 640;
/** Mêmes valeurs que BlueprintSvg : texte de 12 px à l'écran (11 px sous 480 px), plancher de 14 unités. */
const FONT_PX = 12;
const FONT_PX_NARROW = 11;
const FS_MIN = 14;

export const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/** Taille de police en unités du dessin (formule de BlueprintSvg), pour une largeur de viewBox et d'écran. */
export const fsFor = (vw: number, wPx: number) =>
  Math.max(FS_MIN, ((wPx < 480 ? FONT_PX_NARROW : FONT_PX) * vw) / Math.max(wPx, 200));

export const overviewBox = (b: Bounds): ViewBox => [b.minX, -b.maxY, b.maxX - b.minX, b.maxY - b.minY];

/** Point visé par la caméra pour une pièce (repère mathématique). Vue de dessus : axe du vélo (y = 0). */
export function focusPoint(
  target: Exclude<StageFocus, 'overview'>,
  view: 'side' | 'top',
  frame: Frame,
  wheel: Bike['wheel'],
  setups: Setup[],
): Pt {
  const g = frameGeometry(frame, wheelRadius(wheel));
  const pts = setups.map((s): Pt => {
    if (target === 'saddle') {
      const p = seatPostTop(frame, s);
      // un peu devant et sous le haut de tige : selle, collier et haut du tube de selle
      return view === 'side' ? { x: p.x + 40, y: p.y - 40 } : { x: s.tipX - 130, y: 0 };
    }
    const cp = cockpit(g, s);
    return view === 'side' ? { x: (g.headTop.x + cp.hands.x) / 2, y: (g.headTop.y + cp.bar.y) / 2 } : { x: cp.bar.x, y: 0 };
  });
  return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
}

/**
 * Boîte (repère mathématique) de la pièce zoomée, cibles / fantôme compris, SANS les libellés de cotes (leur
 * marge est ajoutée en pixels écran par `zoomBox`). Selle : contour, haut de tige, cote Recul et fil à plomb (axe BB) ;
 * cockpit : cintre, potence, haut de direction. Dessus : contour de selle de TopView et cote Recul (du BB au nez, à
 * TOP_SETBACK_Y) ; cintre ± demi-largeur. `extra` : points à cadrer en plus (libellés d'angle du cycliste).
 */
export function partBox(
  target: Exclude<StageFocus, 'overview'>,
  view: 'side' | 'top',
  frame: Frame,
  wheel: Bike['wheel'],
  setups: Setup[],
  extra: readonly Pt[] = [],
): Bounds {
  const g = frameGeometry(frame, wheelRadius(wheel));
  const pts: Pt[] = [...extra];
  for (const s of setups) {
    if (target === 'saddle') {
      if (view === 'side') {
        const sad = saddleShape(frame, s);
        // bas du fil à plomb (axe BB) de la cote Recul : 160 mm sous la selle, libellé à sa base (SaddleDims)
        pts.push(...sad.outline, seatPostTop(frame, s), { x: 0, y: sad.tipY }, { x: 0, y: sad.tipY - 160 });
      } else {
        pts.push(...topSaddle(s.tipX), { x: 0, y: TOP_SETBACK_Y }, { x: s.tipX, y: TOP_SETBACK_Y });
      }
    } else if (view === 'side') {
      const { cp, bar } = cockpitShape(g, s);
      pts.push(...bar, cp.base, cp.stemTop, cp.hands, cp.clampC, g.headTop);
    } else {
      const cp = cockpit(g, s);
      const half = s.handlebarWidth / 2;
      pts.push({ x: cp.bar.x - s.stemLength - 20, y: -half }, { x: cp.hands.x + 40, y: half });
    }
  }
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

/** Marges écran (px) des libellés de cotes autour de la boîte de la pièce : gauche, droite, dessus, dessous. */
export interface PartMargins {
  l: number;
  r: number;
  t: number;
  b: number;
}
/**
 * Mesurées sur le plan à 12 px, par pièce et par vue. Selle, côté : « cible 731 » de la hauteur dépasse la queue de
 * selle (≈ 70 px), « Recul 60 mm » / « cible 70 mm » à droite du fil à plomb (≈ 90 px) et au-dessus de la selle
 * (≈ 75 px). Cockpit, côté : « Dessous 20 mm » / « Entretoises » à gauche de la direction (≈ 140 px), « cocottes
 * cible » au-dessus des mains. Cockpit, dessus : rien à gauche de la potence ; « Cintre 440 mm (+20 mm) » à droite
 * de la cote du cintre (≈ 140 px au-delà de la boîte), « Potence » au-dessus.
 */
export const PART_MARGINS: Record<Exclude<StageFocus, 'overview'>, Record<'side' | 'top', PartMargins>> = {
  saddle: { side: { l: 100, r: 100, t: 80, b: 20 }, top: { l: 100, r: 100, t: 80, b: 20 } },
  cockpit: { side: { l: 150, r: 100, t: 80, b: 20 }, top: { l: 60, r: 150, t: 80, b: 20 } },
};
/**
 * Dézoom maximal (× largeur normale) pour loger la pièce à gauche de la minimap ; au-delà, elle passe en partie dessous.
 * Scène étroite (480-700 px) : les marges des cotes, fixes en pixels, mangent l'essentiel de la zone libre ; le plafond
 * monte linéairement de 1,6 (≥ 700 px) à 2,4 (480 px). Le texte garde sa taille d'écran, seule la pièce rapetisse.
 */
const MAX_DEZOOM = 1.6;
const MAX_DEZOOM_NARROW = 2.4;
export const maxDezoom = (wPx: number) =>
  MAX_DEZOOM + (MAX_DEZOOM_NARROW - MAX_DEZOOM) * Math.min(Math.max((700 - wPx) / (700 - 480), 0), 1);

/**
 * Cadre de zoom autour de `c`, au ratio de `bounds`, maintenu dans `bounds`.
 * Largeur ≥ celle qui garde le texte à sa taille d'écran (plancher de police de BlueprintSvg non atteint).
 *
 * Avec `reserveRight` (> 0, minimap ouverte) et la boîte `box` de la pièce : la boîte, agrandie des marges écran `m` des
 * cotes, est centrée dans la zone libre à gauche de la minimap (fraction 1 − r de la largeur, toute la hauteur). Si elle
 * n'y tient pas à l'échelle normale, dézoom juste suffisant, plafonné à `maxDezoom` ; au plafond, la boîte est calée à
 * gauche (sa droite peut passer sous la minimap, jamais sa gauche hors champ). Le cadre peut dépasser `bounds`.
 */
export function zoomBox(
  c: Pt,
  bounds: Bounds,
  wPx: number,
  reserveRight = 0,
  box?: Bounds,
  m: PartMargins = PART_MARGINS.cockpit.side,
): ViewBox {
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  const px = wPx < 480 ? FONT_PX_NARROW : FONT_PX;
  const w = Math.min(bw, Math.max(ZOOM_W, (FS_MIN * Math.max(wPx, 200)) / px + 1));
  const h = (w * bh) / bw;
  const top = Math.min(Math.max(c.y + h / 2, bounds.minY + h), bounds.maxY); // haut du cadre (repère math.)
  if (reserveRight <= 0 || !box) {
    const x = Math.min(Math.max(c.x - w / 2, bounds.minX), bounds.maxX - w);
    return [x, -top, w, h];
  }
  const f = 1 - Math.min(reserveRight, 0.6); // fraction de largeur libre
  const W = Math.max(wPx, 200);
  const H = (W * bh) / bw;
  const boxW = box.maxX - box.minX;
  const boxH = box.maxY - box.minY;
  // Largeur de viewBox w2 (u = w2 / W unités par px) telle que boxW + (mL + mR)·u ≤ f·w2 et boxH + (mT + mB)·u ≤ h2.
  const needX = boxW / Math.max(f - (m.l + m.r) / W, 0.05);
  const needY = ((boxH * bw) / bh) / Math.max(1 - (m.t + m.b) / H, 0.05);
  const w2 = Math.min(Math.max(w, needX, needY), w * maxDezoom(wPx), bw);
  const h2 = (w2 * bh) / bw;
  const u = w2 / W;
  const ex0 = box.minX - m.l * u;
  const ex1 = box.maxX + m.r * u;
  const ey0 = box.minY - m.b * u;
  const ey1 = box.maxY + m.t * u;
  // centrée dans la zone libre ; trop large (plafond), calée à gauche
  const x2 = Math.min((ex0 + ex1) / 2 - (f * w2) / 2, ex0);
  // centrée en hauteur ; trop haute, calée en haut (libellés au-dessus de la pièce)
  const top2 = Math.max((ey0 + ey1) / 2 + h2 / 2, ey1);
  return [x2, -top2, w2, h2];
}

export interface StageCameraInput {
  /** Conteneur du <svg class="blueprint"> de la scène. */
  host: RefObject<HTMLElement | null>;
  bounds: Bounds;
  view: 'side' | 'top';
  frame: Frame;
  wheel: Bike['wheel'];
  /** Réglages dessinés (actuel, et cible si affichée) : la caméra cadre leur milieu. */
  setups: Setup[];
  /** Largeur du <svg> à l'écran (px). */
  widthPx: number;
  reduce: boolean;
  /**
   * Identité de la scène (vue, phase, vélo…) : quand elle change, le cadrage saute (jamais d'animation d'une vue
   * à l'autre, ni de dézoom animé en quittant la phase). Défaut : la vue.
   */
  sceneKey?: string;
  /**
   * Fraction (0-1) de la largeur de la scène occupée à droite par la minimap ouverte : la pièce zoomée est cadrée
   * dans la zone libre à gauche. 0 / absent : cadrage normal (minimap réduite ou absente).
   */
  reserveRight?: number;
  /**
   * Cycliste dessiné en vue de côté (mêmes valeurs que SideView : position, angle de manivelle, angles affichés) :
   * avec la minimap ouverte, ses libellés d'angle sont cadrés avec la pièce. Absent : pas de cycliste.
   */
  rider?: { measures: RiderMeasurements; setup: Setup; crankAngle: number; angles?: readonly AngleKey[] };
}

/**
 * Angles du cycliste gardés quand la minimap est ouverte : ceux de la pièce cadrée (hanche et genou pour la selle,
 * coude pour le cockpit). Les autres, loin de la pièce, tomberaient sous la minimap ou forceraient un fort dézoom.
 */
export const anglesFor = (part: Exclude<StageFocus, 'overview'>): readonly AngleKey[] =>
  part === 'saddle' ? ANGLES_SADDLE : ANGLES_COCKPIT;
const ANGLES_SADDLE: readonly AngleKey[] = ['knee', 'hip'];
const ANGLES_COCKPIT: readonly AngleKey[] = ['elbow'];

/**
 * Caméra de la scène : cadre la vue d'ensemble, la selle ou le cockpit.
 *
 * Le viewBox FINAL est rendu par React (prop `viewBox` de SideView / TopView), ce qui place les cotes une seule
 * fois pour l'état d'arrivée. Juste après le commit, le hook réécrit la valeur de départ dans le DOM puis
 * interpole viewBox et `--fs` en requestAnimationFrame (850 ms, easeInOutCubic), sans setState par frame.
 * Interruptible : un nouveau cadrage repart de la dernière valeur écrite. Mouvement réduit : saut direct.
 */
export function useStageCamera({ host, bounds, view, frame, wheel, setups, widthPx, reduce, sceneKey = view, reserveRight = 0, rider }: StageCameraInput) {
  const focus = useStore((s) => s.focus);
  const setFocus = useStore((s) => s.setFocus);
  const overview = useMemo(() => overviewBox(bounds), [bounds]);
  const [s0, s1] = setups;
  const goal = useMemo<ViewBox>(() => {
    if (focus === 'overview') return overview;
    const list = s1 ? [s0!, s1] : [s0!];
    const c = focusPoint(focus, view, frame, wheel, list);
    if (reserveRight <= 0) return zoomBox(c, bounds, widthPx);
    const angles =
      rider && view === 'side' ? angleLabelPoints(rider.measures, frame, rider.setup, rider.crankAngle, rider.angles) : [];
    const box = partBox(focus, view, frame, wheel, list, angles);
    return zoomBox(c, bounds, widthPx, reserveRight, box, PART_MARGINS[focus][view]);
  }, [focus, overview, view, frame, wheel, s0, s1, bounds, widthPx, reserveRight, rider]);

  /** Dernier viewBox écrit dans le DOM, et la scène à laquelle il appartient (sceneKey). */
  const last = useRef<{ vb: ViewBox; key: string } | null>(null);
  const raf = useRef(0);

  useLayoutEffect(() => {
    const svg = host.current?.querySelector<SVGSVGElement>('svg.blueprint');
    const from = last.current?.key === sceneKey ? last.current.vb : null;
    last.current = { vb: goal, key: sceneKey };
    // React vient d'écrire `goal` : saut direct (premier rendu, autre scène, mouvement réduit, rien à faire)
    if (!svg || !from || reduce || from.every((v, i) => Math.abs(v - goal[i]!) < 0.01)) return;
    const w = svg.getBoundingClientRect().width || widthPx;
    // `--fs` d'arrivée : recalculé (formule de BlueprintSvg, viewBox élargi au ratio de `bounds`), JAMAIS relu dans le
    // DOM. Si un cadrage en interrompt un autre sans changer la taille de police de React (ex. minimap mesurée en
    // cours de zoom : seul x / y du viewBox bouge), React ne réécrit pas `--fs` et le DOM porte encore la valeur
    // intermédiaire de l'animation (celle de la vue d'ensemble, ≈ 3×) : la relire la figeait à l'arrivée.
    const ratio = (bounds.maxX - bounds.minX) / (bounds.maxY - bounds.minY);
    const fsEnd = `${fsFor(Math.max(goal[2], goal[3] * ratio), w)}px`;
    const write = (vb: ViewBox) => {
      svg.setAttribute('viewBox', vb.map((v) => v.toFixed(2)).join(' '));
      svg.style.setProperty('--fs', `${fsFor(vb[2], w)}px`);
      last.current = { vb, key: sceneKey };
    };
    write(from);
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / CAMERA_MS);
      const e = easeInOutCubic(k);
      if (k < 1) {
        write(from.map((v, i) => v + (goal[i]! - v) * e) as unknown as ViewBox);
        raf.current = requestAnimationFrame(step);
      } else {
        // arrivée : exactement les valeurs de React
        svg.setAttribute('viewBox', goal.join(' '));
        svg.style.setProperty('--fs', fsEnd);
        last.current = { vb: goal, key: sceneKey };
      }
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [goal, sceneKey, reduce, host, widthPx, bounds]);

  const zoomTo = useCallback((t: StageFocus) => setFocus(t), [setFocus]);
  /** viewBox à passer à la vue (undefined = vue d'ensemble, celle de `bounds`). */
  const viewBox = focus === 'overview' ? undefined : goal;
  return { focus, zoomTo, viewBox, overview };
}
