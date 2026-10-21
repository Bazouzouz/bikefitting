import { useCallback, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { Bike } from '@bikefit/shared';
import { useStore, type StageFocus } from '../components/store';
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
 * Cadre de zoom autour de `c`, au ratio de `bounds`, maintenu dans `bounds`.
 * Largeur ≥ celle qui garde le texte à sa taille d'écran (plancher de police de BlueprintSvg non atteint).
 */
export function zoomBox(c: Pt, bounds: Bounds, wPx: number): ViewBox {
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  const px = wPx < 480 ? FONT_PX_NARROW : FONT_PX;
  const w = Math.min(bw, Math.max(ZOOM_W, (FS_MIN * Math.max(wPx, 200)) / px + 1));
  const h = (w * bh) / bw;
  const x = Math.min(Math.max(c.x - w / 2, bounds.minX), bounds.maxX - w);
  const top = Math.min(Math.max(c.y + h / 2, bounds.minY + h), bounds.maxY); // haut du cadre (repère math.)
  return [x, -top, w, h];
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
}

/**
 * Caméra de la scène : cadre la vue d'ensemble, la selle ou le cockpit.
 *
 * Le viewBox FINAL est rendu par React (prop `viewBox` de SideView / TopView), ce qui place les cotes une seule
 * fois pour l'état d'arrivée. Juste après le commit, le hook réécrit la valeur de départ dans le DOM puis
 * interpole viewBox et `--fs` en requestAnimationFrame (850 ms, easeInOutCubic), sans setState par frame.
 * Interruptible : un nouveau cadrage repart de la dernière valeur écrite. Mouvement réduit : saut direct.
 */
export function useStageCamera({ host, bounds, view, frame, wheel, setups, widthPx, reduce, sceneKey = view }: StageCameraInput) {
  const focus = useStore((s) => s.focus);
  const setFocus = useStore((s) => s.setFocus);
  const overview = useMemo(() => overviewBox(bounds), [bounds]);
  const [s0, s1] = setups;
  const goal = useMemo<ViewBox>(() => {
    if (focus === 'overview') return overview;
    const list = s1 ? [s0!, s1] : [s0!];
    return zoomBox(focusPoint(focus, view, frame, wheel, list), bounds, widthPx);
  }, [focus, overview, view, frame, wheel, s0, s1, bounds, widthPx]);

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
    const fsEnd = svg.style.getPropertyValue('--fs'); // valeur posée par BlueprintSvg pour l'arrivée
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
        if (fsEnd) svg.style.setProperty('--fs', fsEnd);
        last.current = { vb: goal, key: sceneKey };
      }
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [goal, sceneKey, reduce, host, widthPx]);

  const zoomTo = useCallback((t: StageFocus) => setFocus(t), [setFocus]);
  /** viewBox à passer à la vue (undefined = vue d'ensemble, celle de `bounds`). */
  const viewBox = focus === 'overview' ? undefined : goal;
  return { focus, zoomTo, viewBox, overview };
}
