import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Bike, BikeStyle } from '@bikefit/shared';
import type { FitState } from '../components/useFit';
import { useStore, type StageFocus } from '../components/store';
import { styleOf } from '../bike-styles';
import { SideView, sideBounds, type SideDimsMode } from '../blueprint/SideView';
import { TopView, topBounds, topHalfWidth } from '../blueprint/TopView';
import {
  cockpit,
  fitAspect,
  frameGeometry,
  saddleTipY,
  seatPostTop,
  setupFromCurrent,
  setupFromFit,
  toFrame,
  unionBounds,
  wheelRadius,
  type Bounds,
  type Frame,
  type Pt,
  type Setup,
} from '../blueprint/geometry';
import { useReducedMotion } from '../motion/useReducedMotion';
import { SaddleDims } from '../atelier/SaddleDims';
import { CockpitDims } from '../atelier/CockpitDims';
import { setupWithSim } from '../atelier/cockpit';
import '../styles/cockpit.css';
import { PartMinimap } from './PartMinimap';
import { CAMERA_MS, anglesFor, fsFor, useStageCamera, type ViewBox } from './useStageCamera';
import '../styles/stage.css';

export interface StageProps {
  bike: Bike;
  state: FitState;
  view: 'side' | 'top';
  showRider: boolean;
  phase: 'bike' | 'rider' | 'size' | 'tune';
}

/** Ratio largeur / hauteur de la scène par défaut (avant mesure de la carte), identique pour les deux vues. */
export const STAGE_ASPECT = 4 / 3;
/**
 * Bornes du ratio mesuré : le plan remplit la carte (ratio de la carte, arrondi à 0,01, constant tant que la fenêtre
 * ne change pas : pas de saut d'une phase ou d'une vue à l'autre). Au-delà, le plan est centré dans la carte.
 */
const ASPECT_MIN = 1;
const ASPECT_MAX = 2.4;
export const stageAspectFor = (w: number, h: number): number =>
  w > 0 && h > 0 ? Math.round(Math.min(ASPECT_MAX, Math.max(ASPECT_MIN, w / h)) * 100) / 100 : STAGE_ASPECT;
/** Durée du tracé du cadre (doit suivre `stage.css`). */
const TRACE_MS = 900;
/** Plus grande largeur de cintre proposée par les curseurs (mm), pour un cadre fixe en vue de dessus. */
const MAX_BAR = 480;
/** Marge supplémentaire sous le sol en vue de côté (mm) : cotes Empattement / Manivelle hors des roues. */
export const STAGE_GROUND_MARGIN = 150;

/** Cadre fixe de la scène pour un vélo : union de toutes ses tailles, cycliste compris, au ratio de la scène. */
export function stageBounds(bike: Bike, style: BikeStyle, view: 'side' | 'top', shoulderMm: number, aspect = STAGE_ASPECT): Bounds {
  const frames = bike.sizes.map((s) => toFrame(s, style));
  const list =
    view === 'side'
      ? frames.map((f) => sideBounds(f, bike.wheel, true, STAGE_GROUND_MARGIN))
      : frames.map((f) => topBounds(f, bike.wheel, topHalfWidth(Math.max(MAX_BAR, shoulderMm))));
  return fitAspect(unionBounds(list), aspect);
}

/** Identifiant d'un vélo (relance du tracé quand il change). */
const bikeKeyOf = (b: Bike) => b.id || `${b.brand} ${b.model}`;

/** Cotes affichées selon le cadrage (ids de `sideDims`) : seulement celles de la pièce zoomée. */
const DIMS_SADDLE = ['saddle', 'setback'] as const;
const DIMS_COCKPIT = ['stem', 'spacers'] as const;
/** Vue d'ensemble sur petit écran : une cote par pièce, sinon les libellés s'empilent. */
const DIMS_TUNE_NARROW = ['saddle', 'stem'] as const;
/** Cadre avec cycliste : sans le reach, dont la ligne traverse le torse et les bras. */
const DIMS_FRAME_RIDER = ['stack', 'bb', 'wheelbase'] as const;
/** Parcours guidés (selle, cockpit) : la scène ne garde que le calque du parcours (SaddleDims, CockpitDims). */
const DIMS_NONE = [] as const;
/** Largeur de scène (px) sous laquelle les cotes de réglage sont réduites. */
const NARROW_PX = 480;

type Part = Exclude<StageFocus, 'overview'>;
const HOTSPOTS: Array<{ part: Part; label: string; aria: string }> = [
  { part: 'saddle', label: 'Selle', aria: 'Zoomer sur la selle' },
  { part: 'cockpit', label: 'Cockpit', aria: 'Zoomer sur le cockpit' },
];

/** Ancre d'un hotspot (repère mathématique) : haut de tige de selle, ou cintre. Vue de dessus : axe du vélo. */
function hotspotAnchor(part: Part, view: 'side' | 'top', frame: Frame, wheel: Bike['wheel'], s: Setup): Pt {
  if (part === 'saddle') return view === 'side' ? seatPostTop(frame, s) : { x: s.tipX - 130, y: 0 };
  const cp = cockpit(frameGeometry(frame, wheelRadius(wheel)), s);
  return view === 'side' ? cp.bar : { x: cp.bar.x, y: 0 };
}

/** Repère mathématique → pixels du <svg> (vue d'ensemble `vb`, largeur `w` px). */
const toPx = (p: Pt, vb: ViewBox, w: number): Pt => ({ x: ((p.x - vb[0]) * w) / vb[2], y: ((-p.y - vb[1]) * w) / vb[2] });

/**
 * Scène blueprint unique : vue de côté OU de dessus, vélo d'origine + fantôme orange de la cible,
 * cycliste en option. Le contenu suit la phase :
 *  - 'bike'  : vélo seul, tracé du cadre animé à l'arrivée d'un nouveau vélo ;
 *  - 'rider' : + cycliste (fondu) ;
 *  - 'size'  : cotes du cadre (stack, reach, empattement, hauteur BB), morphing au changement de taille ;
 *  - 'tune'  : fantôme orange et cotes de réglage ; hotspots Selle et Cockpit, zoom de caméra et estompage du cadre.
 */
export function Stage({ bike, state, view, showRider, phase }: StageProps): JSX.Element {
  const rider = useStore((s) => s.rider);
  const setFocus = useStore((s) => s.setFocus);
  const preview = useStore((s) => s.saddlePreview);
  const cpPreview = useStore((s) => s.cockpitPreview);
  const reduce = useReducedMotion();
  const style = styleOf(bike);
  const current = useMemo(() => setupFromCurrent(state.current), [state.current]);
  const target = useMemo(() => setupFromFit(state.fit), [state.fit]);
  const shoulderMm = rider.shoulderWidth * 10;
  const frame = useMemo(() => toFrame(state.size, style), [state.size, style]);

  // Ratio de la carte (conteneur .stage, jamais le <svg> : pas de boucle) : le plan la remplit.
  const outer = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(STAGE_ASPECT);
  // Largeur du <svg> à l'écran (px) : taille des hotspots, largeur de zoom, cotes réduites.
  const box = useRef<HTMLDivElement>(null);
  const [widthPx, setWidthPx] = useState(600);
  useEffect(() => {
    const el = box.current;
    const host = outer.current;
    if (!el || !host || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setWidthPx(el.getBoundingClientRect().width || 600);
      const r = host.getBoundingClientRect();
      setAspect(stageAspectFor(r.width, r.height));
    });
    ro.observe(el);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);
  const bounds = useMemo(() => stageBounds(bike, style, view, shoulderMm, aspect), [bike, style, view, shoulderMm, aspect]);

  // Tracé : une seule fois par nouveau vélo, en phase « vélo », jamais en mouvement réduit.
  const bikeKey = bikeKeyOf(bike);
  const traced = useRef<string | null>(null);
  const [tracing, setTracing] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (phase !== 'bike' || traced.current === bikeKey) return;
    traced.current = bikeKey;
    if (reduce) return;
    setTracing(bikeKey);
    const t = window.setTimeout(() => setTracing(null), TRACE_MS + 100);
    return () => {
      window.clearTimeout(t);
      setTracing(null); // phase quittée en cours de tracé : pas de nouveau tracé au retour
    };
  }, [phase, bikeKey, reduce]);
  const trace = tracing === bikeKey && phase === 'bike';

  const withRider = showRider && phase !== 'bike';
  const ghost = phase === 'tune' ? target : null;
  const sideDims: SideDimsMode = phase === 'size' ? 'frame' : phase === 'tune' ? 'tune' : 'none';

  // Caméra : uniquement en phase Réglages ; un changement de phase ou de vélo ramène à la vue d'ensemble
  // (dans le même rendu, par le store) et le cadrage saute (sceneKey) : jamais de dézoom animé d'une scène à l'autre.
  // Un changement de vue garde le focus (et le guide en cours) : la caméra saute au cadrage zoomé de la nouvelle vue.
  const lastPart = useRef<Part | null>(null);
  const setups = useMemo(() => (ghost ? [current, ghost] : [current]), [current, ghost]);
  const sceneKey = `${view}|${phase}|${bikeKey}|${aspect}`;
  // Bande droite occupée par la minimap ouverte (fraction de la largeur de la scène), mesurée sur l'élément réel.
  const [reserveRight, setReserveRight] = useState(0);
  // Petite scène : aucune réserve (la zone libre, ~230 px, ne tiendrait pas la pièce et ses cotes : le zoom
  // retomberait presque sur la vue d'ensemble). La minimap y est réduite par défaut et l'utilisateur peut la réduire.
  const reserve = widthPx < NARROW_PX ? 0 : reserveRight;
  // Minimap ouverte (réserve active) : seuls les angles du cycliste proches de la pièce restent affichés, et la
  // caméra les cadre avec elle (les autres tomberaient sous la minimap). Mêmes valeurs que SideView (manivelle à 0).
  const storeFocus = useStore((s) => s.focus);
  const riderAngles =
    view === 'side' && withRider && phase === 'tune' && storeFocus !== 'overview' && reserve > 0 ? anglesFor(storeFocus) : undefined;
  const riderSetup = ghost ?? current;
  const camRider = useMemo(
    () => (view === 'side' && withRider ? { measures: rider, setup: riderSetup, crankAngle: 0, angles: riderAngles } : undefined),
    [view, withRider, rider, riderSetup, riderAngles],
  );
  const { focus, zoomTo, viewBox, overview } = useStageCamera({
    host: box,
    bounds,
    view,
    frame,
    wheel: bike.wheel,
    setups,
    widthPx,
    reduce,
    sceneKey,
    reserveRight: reserve,
    rider: camRider,
  });
  // Après un dézoom, les hotspots n'apparaissent qu'une fois la caméra revenue : d'ici là, ni cliquables ni focalisables
  // (sauf celui qui reprend le focus). Mouvement réduit : immédiat.
  const [hudLate, setHudLate] = useState(false);
  useEffect(() => {
    if (!hudLate) return;
    const t = window.setTimeout(() => setHudLate(false), CAMERA_MS + 250);
    return () => window.clearTimeout(t);
  }, [hudLate]);
  useEffect(() => {
    setFocus('overview'); // filet : le store remet déjà le cadrage à zéro
    lastPart.current = null;
    setHudLate(false); // pas d'apparition retardée des hotspots au retour dans la phase
  }, [phase, bikeKey, setFocus]);
  const zoomed = phase === 'tune' && focus !== 'overview';
  // Minimap 3D de la pièce zoomée : réduite par défaut sur petit écran tant que l'utilisateur n'a pas choisi.
  const [mapChoice, setMapChoice] = useState<boolean | null>(null);
  const mapCollapsed = mapChoice ?? widthPx < NARROW_PX;
  const minimapPart: 'saddle' | 'cockpit' | null =
    zoomed && focus === 'saddle' && preview ? 'saddle' : zoomed && focus === 'cockpit' && cpPreview ? 'cockpit' : null;
  // Mesure de la minimap ouverte : bande réservée = de son bord gauche au bord droit de la scène (marge comprise).
  const mapOpen = minimapPart !== null && !mapCollapsed;
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('.stage-minimap');
    if (!mapOpen || !el || !box.current) {
      setReserveRight(0);
      return;
    }
    const measure = () => {
      // Agrandie, la minimap couvre toute la scène : rien à réserver (pas de dézoom caché dessous).
      if (el.classList.contains('is-large')) {
        setReserveRight(0);
        return;
      }
      const b = box.current!.getBoundingClientRect();
      const m = el.getBoundingClientRect();
      if (b.width <= 0) return;
      const r = Math.round(((b.right - m.left + 8) / b.width) * 100) / 100; // 8 px de respiration
      setReserveRight(Math.min(Math.max(r, 0), 0.6));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [mapOpen, minimapPart, widthPx]);
  // Parcours selle guidé (vue de côté) : calque selle dans le <svg> du plan (portail), qui suit donc la caméra.
  const guide = zoomed && focus === 'saddle' && view === 'side' && preview ? preview : null;
  // Parcours cockpit guidé (vue de côté) : calque cockpit (simulation, cote du temps, cocottes fantômes), même portail.
  const guideCockpit = zoomed && focus === 'cockpit' && view === 'side' && cpPreview ? cpPreview : null;
  // Vue de dessus zoomée : pas de calque, mais le vélo dessiné suit la simulation du parcours (cintre, potence ;
  // pointe de selle), avec les cotes de la pièce cadrée (stage.css). La caméra, elle, garde le réglage actuel.
  const topCurrent = useMemo(() => {
    if (view !== 'top' || !zoomed) return current;
    if (focus === 'cockpit' && cpPreview) return setupWithSim(current, cpPreview);
    if (focus === 'saddle' && preview) return { ...current, saddleHeight: preview.height, tipX: -preview.setback };
    return current;
  }, [view, zoomed, focus, cpPreview, preview, current]);
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);
  useLayoutEffect(() => {
    const el = box.current?.querySelector<SVGSVGElement>('svg.blueprint') ?? null;
    if (el !== svgEl) setSvgEl(el);
  });

  const dimIds = guide || guideCockpit
    ? DIMS_NONE
    : zoomed && focus === 'saddle'
      ? DIMS_SADDLE
      : zoomed && focus === 'cockpit'
        ? DIMS_COCKPIT
        : phase === 'tune' && widthPx < NARROW_PX
          ? DIMS_TUNE_NARROW
          : phase === 'size' && withRider
            ? DIMS_FRAME_RIDER
            : undefined;

  // Focus clavier : vers « Vue d'ensemble » au zoom, rendu au hotspot d'origine au dézoom.
  const hotRefs = useRef<Partial<Record<Part, SVGGElement | null>>>({});
  const backRef = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef<'back' | 'hot' | null>(null);
  useLayoutEffect(() => {
    const m = moveFocus.current;
    moveFocus.current = null;
    if (m === 'back' && zoomed) backRef.current?.focus();
    else if (m === 'hot' && !zoomed && lastPart.current) hotRefs.current[lastPart.current]?.focus();
  }, [zoomed]);
  const open = (part: Part) => {
    lastPart.current = part;
    moveFocus.current = 'back';
    zoomTo(part);
  };
  const close = () => {
    moveFocus.current = 'hot';
    if (!reduce) setHudLate(true);
    zoomTo('overview');
  };
  // Échap : dézoom, où que soit le focus.
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      moveFocus.current = 'hot';
      if (!reduce) setHudLate(true);
      zoomTo('overview');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoomed, zoomTo, reduce]);
  const onHotKey = (part: Part) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); // Espace : pas de défilement de la page
      open(part);
    }
  };

  return (
    <div
      ref={outer}
      className={`stage stage-${view}`}
      data-phase={phase}
      data-focus={zoomed ? focus : 'overview'}
      data-guide={guide ? 'saddle' : guideCockpit ? 'cockpit' : undefined}
      style={{ ['--stage-ratio' as string]: String(aspect) }}
    >
      <div className="stage-box" ref={box}>
        {view === 'side' ? (
          <SideView
            size={state.size}
            wheel={bike.wheel}
            style={style}
            current={current}
            target={ghost}
            rider={withRider ? rider : undefined}
            riderOn={ghost ? 'target' : 'current'}
            bounds={bounds}
            viewBox={zoomed ? viewBox : undefined}
            dims={sideDims}
            dimIds={dimIds}
            trace={trace}
            traceKey={bikeKey}
            riderClassName="stage-fade-in"
            riderAngles={riderAngles}
          />
        ) : (
          <TopView
            size={state.size}
            wheel={bike.wheel}
            style={style}
            current={topCurrent}
            target={ghost}
            rider={withRider ? rider : undefined}
            bounds={bounds}
            viewBox={zoomed ? viewBox : undefined}
            dims={phase === 'tune' ? 'all' : 'none'}
            trace={trace}
            traceKey={bikeKey}
          />
        )}
        {/* Hotspots : calque en pixels au-dessus du plan (vue d'ensemble seulement, donc cadre fixe).
            Après un zoom, ils n'apparaissent qu'une fois la caméra revenue (stage-hud-late). */}
        {guide &&
          svgEl &&
          createPortal(
            <SaddleDims
              frame={frame}
              fit={state.fit}
              current={current}
              sim={guide}
              step={guide.step}
              fs={fsFor((viewBox ?? overview)[2], widthPx)}
            />,
            svgEl,
          )}
        {guideCockpit &&
          svgEl &&
          createPortal(
            <CockpitDims
              frame={frame}
              wheel={bike.wheel}
              fit={state.fit}
              current={current}
              sim={guideCockpit}
              step={guideCockpit.step}
              fs={fsFor((viewBox ?? overview)[2], widthPx)}
              drop={{ saddleY: saddleTipY(frame, current), target: state.fit.saddleToBarDrop.value }}
            />,
            svgEl,
          )}
        {phase === 'tune' && !zoomed && (
          <svg className={hudLate ? 'stage-hud stage-hud-late' : 'stage-hud'}>
            {HOTSPOTS.map(({ part, label, aria }) => {
              const p = toPx(hotspotAnchor(part, view, frame, bike.wheel, current), overview, widthPx);
              const left = part === 'saddle';
              // invisible pendant le dézoom : hors du clic, du clavier et de l'arbre d'accessibilité
              const asleep = hudLate && part !== lastPart.current;
              return (
                <g
                  key={part}
                  ref={(el) => {
                    hotRefs.current[part] = el;
                  }}
                  className={asleep ? 'stage-hot is-asleep' : 'stage-hot'}
                  role="button"
                  tabIndex={asleep ? -1 : 0}
                  aria-hidden={asleep || undefined}
                  aria-label={aria}
                  transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
                  onClick={() => open(part)}
                  onKeyDown={onHotKey(part)}
                >
                  {/* zone tactile : 48 px de diamètre */}
                  <circle className="hit" r={24} />
                  {/* zone de clic d'un seul tenant : pastille + libellé (sans trou entre les lettres) */}
                  <rect
                    className="hit-area"
                    x={left ? -(label.length * 10 + 26) : -24}
                    y={-24}
                    width={label.length * 10 + 50}
                    height={66}
                  />
                  <circle className="ring" r={14} />
                  <circle className="dot" r={6} />
                  {/* Libellés sous le hotspot (au-dessus et à côté : cotes Selle, Recul, Potence, Entretoises). */}
                  <text x={left ? -16 : 16} y={32} textAnchor={left ? 'end' : 'start'}>
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
        {minimapPart && (
          <PartMinimap
            part={minimapPart}
            state={state}
            frame={frame}
            collapsed={mapCollapsed}
            onToggleCollapsed={() => setMapChoice(!mapCollapsed)}
          />
        )}
        {zoomed && (
          <button ref={backRef} type="button" className="btn small stage-back" onClick={close}>
            ← Vue d'ensemble
          </button>
        )}
      </div>
    </div>
  );
}
