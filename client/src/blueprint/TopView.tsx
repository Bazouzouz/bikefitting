import type { Bike, BikeSize, BikeStyle } from '@bikefit/shared';
import type { RiderMeasurements } from '../fit/types';
import { BlueprintSvg, Dim, DimLabels, dimSegment, useBlueprint, type Bounds, type Note } from './BlueprintSvg';
import { boxOf, type LabelSpec, type Obstacle } from './labels';
import {
  cockpit,
  drawingFor,
  fmtDelta,
  fmtNum,
  frameGeometry,
  pathD,
  rad,
  toFrame,
  wheelRadius,
  type Frame,
  type Pt,
  type Setup,
} from './geometry';
import { useTweenedScene } from './useTween';
import { useTraceLengths } from './trace';
import { useRef } from 'react';

/** Q-factor supposé (largeur entre faces de pédales) — non fourni par le contrat. */
export const Q_FACTOR = 150;

export interface TopViewProps {
  size: BikeSize;
  wheel: Bike['wheel'];
  current: Setup;
  target: Setup | null;
  rider?: RiderMeasurements;
  /** Style du vélo (évasement du cintre) ; gravel par défaut. */
  style?: BikeStyle;
  /** Cadre fixe (ratio constant) ; par défaut calculé sur la taille affichée. */
  bounds?: Bounds;
  /** viewBox de caméra (voir BlueprintSvg). */
  viewBox?: readonly [number, number, number, number];
  /** Cotes : 'all' (historique) = cotes du réglage cible ; 'none' = aucune. */
  dims?: 'all' | 'tune' | 'none';
  /** Tracé animé du cadre ; `traceKey` relance l'animation (nouveau vélo). */
  trace?: boolean;
  traceKey?: string;
  notes?: Note[];
}

/** Profondeur des drops (mm), pour dessiner l'évasement du cintre vu de dessus. */
const DROP_DEPTH = 130;

const rect = (x0: number, x1: number, y0: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Contour de la selle vue de dessus, nez en `tipX` (repère mathématique). Partagé avec la caméra de la scène. */
export const topSaddle = (tipX: number): Pt[] => [
  { x: tipX, y: -16 },
  { x: tipX - 90, y: -52 },
  { x: tipX - 255, y: -68 },
  { x: tipX - 255, y: 68 },
  { x: tipX - 90, y: 52 },
  { x: tipX, y: 16 },
];
/** Ordonnée de base de la cote Recul (au-dessus des chaussures), avant le décalage de 0,9 fs. */
export const TOP_SETBACK_Y = Q_FACTOR / 2 + 25 + 50;

/** Géométrie vue de dessus d'un jeu de réglages (axe latéral = y du repère, inversé au rendu). */
function topShapes(frame: Frame, wheel: Bike['wheel'], setup: Setup, shoeLen: number, barFlare: number) {
  const R = wheelRadius(wheel);
  const g = frameGeometry(frame, R);
  const cp = cockpit(g, setup);
  const w = setup.handlebarWidth;
  const tipX = setup.tipX;
  const saddle = topSaddle(tipX);
  // Cintre : tops à ±w/2, cocottes vers l'avant, puis drops évasés de `barFlare` (largeur prise aux cocottes).
  const flareOut = DROP_DEPTH * Math.tan(rad(barFlare));
  const barSide = (s: number): Pt[] => [
    { x: cp.bar.x, y: 0 },
    { x: cp.bar.x, y: s * (w / 2) },
    { x: cp.bar.x + 70, y: s * (w / 2) },
    { x: cp.bar.x + 110, y: s * (w / 2 + flareOut) },
  ];
  // Chaussures : le point de référence (1er métatarse) est décalé par la cale
  const shoes = [
    { px: setup.crankLength, side: 1 },
    { px: -setup.crankLength, side: -1 },
  ].map(({ px, side }) => {
    const meta = px - setup.cleatFore;
    return { px, side, x0: meta - shoeLen * 0.72, x1: meta + shoeLen * 0.28, y: side * (Q_FACTOR / 2 + 25) };
  });
  return { R, g, cp, w, tipX, saddle, barSide, flareOut, shoes };
}

/** Dessin du vélo vu de dessus pour un jeu de réglages. */
function TopBike({
  frame,
  wheel,
  setup,
  variant,
  shoeLen,
  barFlare,
  trace = false,
}: {
  frame: Frame;
  wheel: Bike['wheel'];
  setup: Setup;
  variant: 'stock' | 'phantom';
  shoeLen: number;
  barFlare: number;
  trace?: boolean;
}) {
  const { R, g, cp, saddle, barSide, shoes } = topShapes(frame, wheel, setup, shoeLen, barFlare);
  const ph = variant === 'phantom';
  const tw = wheel.tyreWidth;
  const fillCls = ph ? 'part part-fill' : 'part';
  const ref = useRef<SVGGElement>(null);
  useTraceLengths(ref, trace && !ph);

  return (
    <g className={`bp bp-${variant}`}>
      {!ph && (
        <g ref={ref} className={trace ? 'bp-frame bp-trace' : 'bp-frame'}>
          {[g.rearAxle, g.frontAxle].map((c, i) => (
            <path key={i} d={pathD(rect(c.x - R, c.x + R, -tw / 2, tw / 2), true)} className="tube" fill="none" data-trace={trace || undefined} />
          ))}
          <path d={pathD([{ x: g.rearAxle.x, y: 0 }, { x: g.frontAxle.x, y: 0 }])} className="thin dashed" fill="none" />
          {[-1, 1].map((s) => (
            <g key={s}>
              <path d={pathD([{ x: 0, y: s * 28 }, { x: g.rearAxle.x, y: s * 62 }])} className="tube" fill="none" data-trace={trace || undefined} />
              <path
                d={pathD([{ x: g.headBottom.x, y: s * 55 }, { x: g.frontAxle.x, y: s * 52 }])}
                className="tube"
                fill="none"
                data-trace={trace || undefined}
              />
            </g>
          ))}
          <path d={pathD(rect(g.headTop.x - 25, g.headTop.x + 25, -22, 22), true)} className="tube" fill="none" data-trace={trace || undefined} />
          <path d={pathD([{ x: 0, y: 0 }, { x: g.headTop.x, y: 0 }])} className="tube" fill="none" data-trace={trace || undefined} />
        </g>
      )}

      {/* selle */}
      <path d={pathD(saddle, true)} className={fillCls} />

      {/* potence + cintre (évasé selon le style) */}
      <path d={pathD(rect(cp.clampC.x, cp.bar.x, -20, 20), true)} className={fillCls} />
      {[-1, 1].map((s) => (
        <path key={s} d={pathD(barSide(s))} className="bar" fill="none" />
      ))}
      {[-1, 1].map((s) => (
        <circle key={s} cx={cp.hands.x} cy={s * (setup.handlebarWidth / 2)} r={16} className="hand-dot" />
      ))}

      {/* pédalier, pédales, chaussures et cales */}
      {shoes.map((sh) => (
        <g key={sh.side}>
          <path d={pathD([{ x: 0, y: sh.side * (Q_FACTOR / 2) }, { x: sh.px, y: sh.side * (Q_FACTOR / 2) }])} className="part-line" fill="none" />
          <path d={pathD(rect(sh.x0, sh.x1, sh.y - 50, sh.y + 50), true)} className={ph ? 'shoe shoe-fill' : 'shoe'} />
          <path d={pathD(rect(sh.px - 25, sh.px + 25, sh.y - 20, sh.y + 20), true)} className="cleat" />
          <path
            d={pathD(rect(sh.px - 50, sh.px + 50, sh.side * (Q_FACTOR / 2) - 14, sh.side * (Q_FACTOR / 2) + 14), true)}
            className={fillCls}
          />
        </g>
      ))}
    </g>
  );
}

/** Cotes de la vue de dessus (réglage cible, orange) ; décalages calculés avec la taille de police. */
function TopDimsLayer({
  frame,
  wheel,
  cur,
  tgt,
  shoeLen,
  barFlare,
}: {
  frame: Frame;
  wheel: Bike['wheel'];
  cur: Setup;
  tgt: Setup;
  shoeLen: number;
  barFlare: number;
}) {
  const ctx = useBlueprint();
  if (!ctx) return null;
  const fs = ctx.fs;
  const T = topShapes(frame, wheel, tgt, shoeLen, barFlare);
  const C = topShapes(frame, wheel, cur, shoeLen, barFlare);
  const lines: Array<{ id: string; a: Pt; b: Pt; off: Pt }> = [];
  const labels: LabelSpec[] = [];
  const obstacles: Obstacle[] = [];
  for (const c of [T.g.rearAxle, T.g.frontAxle])
    obstacles.push({ box: { x0: c.x - T.R, x1: c.x + T.R, y0: -wheel.tyreWidth / 2 - 10, y1: wheel.tyreWidth / 2 + 10 }, weight: 2 });
  for (const S of [C, T]) {
    obstacles.push({ box: boxOf(S.saddle, 10), weight: 4 });
    for (const s of [-1, 1]) obstacles.push({ box: boxOf(S.barSide(s), 12), weight: 4 });
    obstacles.push({ box: boxOf([S.cp.clampC, S.cp.bar], 24), weight: 4 });
    for (const sh of S.shoes) obstacles.push({ box: { x0: sh.x0, x1: sh.x1, y0: sh.y - 50, y1: sh.y + 50 }, weight: 2 });
  }
  const push = (id: string, a: Pt, b: Pt, off: Pt): Pt => {
    lines.push({ id, a, b, off });
    const [a2, b2] = dimSegment(a, b, off);
    obstacles.push({ box: boxOf([a2, b2], fs * 0.15), owner: id, weight: 2 });
    return { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
  };
  const d = (v: number, dec = 0) => `(${fmtDelta(v, 'mm', dec)})`;
  const w = tgt.handlebarWidth;
  const xBar = Math.max(T.cp.bar.x, C.cp.bar.x) + 110;
  const flare = Math.max(T.flareOut, C.flareOut);
  // Cintre : cote de largeur devant les drops ; libellé à droite, hors de la barre.
  const mBar = push('bar', { x: xBar, y: w / 2 }, { x: xBar, y: -w / 2 }, { x: fs * 0.8 + 20, y: 0 });
  labels.push({ id: 'bar', tone: 'ghost', at: mBar, prefer: ['e', 'ne', 'se'], lines: [`Cintre ${fmtNum(w)} mm`, d(w - cur.handlebarWidth)] });
  // Potence : au-delà du cintre évasé (côté haut de l'écran).
  const yStem = Math.max(w, cur.handlebarWidth) / 2 + flare + fs * 0.9;
  const mStem = push('stem', { x: T.cp.clampC.x, y: 40 }, { x: T.cp.bar.x, y: 40 }, { x: 0, y: yStem - 40 });
  labels.push({
    id: 'stem',
    tone: 'ghost',
    at: mStem,
    prefer: ['n', 'nw', 'ne'],
    lines: [`Potence ${fmtNum(tgt.stemLength)} mm`, d(tgt.stemLength - cur.stemLength)],
  });
  // Recul : du BB au nez de selle, au-dessus des chaussures et de la selle.
  const ySad = TOP_SETBACK_Y + fs * 0.9;
  const mRec = push('setback', { x: 0, y: 75 }, { x: tgt.tipX, y: 75 }, { x: 0, y: ySad - 75 });
  labels.push({ id: 'setback', tone: 'ghost', at: mRec, prefer: ['n', 'nw', 'ne'], lines: [`Recul ${fmtNum(-tgt.tipX)} mm`, d(cur.tipX - tgt.tipX)] });
  // Manivelle : sous les chaussures (côté bas de l'écran).
  const yCrank = -(Q_FACTOR / 2 + 25 + 50) - fs * 0.9;
  const mCr = push('crank', { x: tgt.crankLength, y: 0 }, { x: -tgt.crankLength, y: 0 }, { x: 0, y: yCrank });
  labels.push({
    id: 'crank',
    tone: 'ghost',
    at: mCr,
    prefer: ['s', 'se', 'sw'],
    lines: [`Manivelle ${fmtNum(tgt.crankLength, 1)} mm`, d(tgt.crankLength - cur.crankLength, 1)],
  });
  return (
    <>
      <g className="dim-lines bp-phantom">
        {/* data-id : la scène filtre les cotes par pièce cadrée (stage.css), comme data-label sur les libellés. */}
        {lines.map((l) => (
          <g key={l.id} data-id={l.id}>
            <Dim a={l.a} b={l.b} off={l.off} tone="green" />
          </g>
        ))}
      </g>
      <DimLabels specs={labels} obstacles={obstacles} />
    </>
  );
}

/** Cadre par défaut de la vue de dessus. */
export function topBounds(frame: Frame, wheel: Bike['wheel'], halfWidth: number): Bounds {
  const R = wheelRadius(wheel);
  const g = frameGeometry(frame, R);
  return { minX: g.rearAxle.x - R - 120, maxX: g.frontAxle.x + R + 330, minY: -halfWidth, maxY: halfWidth };
}

/** Demi-largeur par défaut de la vue de dessus (cintre, épaules). */
export const topHalfWidth = (widest: number) => Math.max(widest / 2 + 340, 520);

export function TopView({
  size,
  wheel,
  current,
  target,
  rider,
  style,
  bounds: fixedBounds,
  viewBox,
  dims = 'all',
  trace = false,
  traceKey,
  notes: notesProp,
}: TopViewProps) {
  const scene = useTweenedScene(toFrame(size, style), current, target);
  const drawing = drawingFor(style, wheel);
  const R = wheelRadius(wheel);
  const g = frameGeometry(scene.frame, R);
  const shoeLen = rider ? rider.shoeSize * 6.4 + 20 : 290;
  const shoulderMm = rider ? rider.shoulderWidth * 10 : 0;
  const widest = Math.max(scene.cur.handlebarWidth, scene.tgt?.handlebarWidth ?? 0, shoulderMm);
  const bounds = fixedBounds ?? topBounds(scene.frame, wheel, topHalfWidth(widest));
  const barSetup = scene.tgt ?? scene.cur;
  const cpT = cockpit(g, barSetup);
  const shX = cpT.hands.x - 170;
  const cleat = (v: number) => `${v >= 0 ? '+' : '−'}${fmtNum(Math.abs(v), 1)}`;
  const notes: Note[] = [{ text: `Q-factor supposé ≈ ${Q_FACTOR} mm` }];
  if (rider) notes.push({ text: `Épaules ${fmtNum(shoulderMm)} mm` });
  if (scene.tgt) {
    notes.push({
      text: `Cales ${cleat(scene.tgt.cleatFore)} mm (${fmtDelta(scene.tgt.cleatFore - scene.cur.cleatFore, 'mm', 1)})`,
      tone: 'green',
    });
  } else notes.push({ text: `Cales ${cleat(scene.cur.cleatFore)} mm` });
  return (
    <BlueprintSvg bounds={bounds} viewBox={viewBox} label={`Vue de dessus, taille ${size.label}`} notes={notesProp ?? notes}>
      <g key={traceKey ?? 'bike'}>
        <TopBike
          frame={scene.frame}
          wheel={wheel}
          setup={scene.cur}
          variant="stock"
          shoeLen={shoeLen}
          barFlare={drawing.barFlare}
          trace={trace}
        />
      </g>
      {rider && (
        <g className="top-rider">
          <line x1={shX} x2={shX} y1={-shoulderMm / 2} y2={shoulderMm / 2} className="shoulders" />
          {[-1, 1].map((s) => (
            <line
              key={s}
              x1={shX}
              y1={s * (shoulderMm / 2)}
              x2={cpT.hands.x}
              y2={s * (barSetup.handlebarWidth / 2)}
              className="thin dashed arm-line"
            />
          ))}
        </g>
      )}
      {scene.tgt && (
        <TopBike frame={scene.frame} wheel={wheel} setup={scene.tgt} variant="phantom" shoeLen={shoeLen} barFlare={drawing.barFlare} />
      )}
      {scene.tgt && dims !== 'none' && (
        <TopDimsLayer frame={scene.frame} wheel={wheel} cur={scene.cur} tgt={scene.tgt} shoeLen={shoeLen} barFlare={drawing.barFlare} />
      )}
    </BlueprintSvg>
  );
}
