import { memo, useRef } from 'react';
import type { Bike } from '@bikefit/shared';
import {
  add,
  cockpit,
  fmtDelta,
  fmtNum,
  frameGeometry,
  mid,
  mul,
  pathD,
  rad,
  saddleTipY,
  seatPostTop,
  wheelRadius,
  type Drawing,
  type Frame,
  type FrameGeom,
  type Pt,
  type Setup,
} from './geometry';
import { Dim, dimSegment } from './BlueprintSvg';
import { boxOf, type LabelSpec, type Obstacle } from './labels';
import { useTraceLengths } from './trace';

type Wheel = Bike['wheel'];
type Variant = 'stock' | 'phantom';

const quad = (a: Pt, b: Pt, w: number): Pt[] => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const n = Math.hypot(dx, dy) || 1;
  const nx = (-dy / n) * (w / 2);
  const ny = (dx / n) * (w / 2);
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
};

/** `trace` : élément animé par le tracé du cadre (voir trace.ts). */
const Line = ({ pts, cls = 'tube', trace = false }: { pts: Pt[]; cls?: string; trace?: boolean }) => (
  <path d={pathD(pts)} className={cls} fill="none" data-trace={trace || undefined} />
);

// ─── Pièces (géométrie pure, réutilisée par les cotes et les obstacles) ───────────

/** Selle : dessus à la hauteur de référence (tipY), nez à tipX, queue 255 mm derrière. */
export function saddleShape(frame: Frame, setup: Setup) {
  const tipY = saddleTipY(frame, setup);
  const tipX = setup.tipX;
  const outline: Pt[] = [
    { x: tipX, y: tipY - 8 },
    { x: tipX - 70, y: tipY - 2 },
    { x: tipX - 140, y: tipY },
    { x: tipX - 220, y: tipY + 14 },
    { x: tipX - 255, y: tipY + 24 },
    { x: tipX - 250, y: tipY - 4 },
    { x: tipX - 150, y: tipY - 28 },
    { x: tipX, y: tipY - 24 },
  ];
  const post = seatPostTop(frame, setup);
  const railY = tipY - 28;
  const clampX = Math.min(Math.max(post.x, tipX - 220), tipX - 40);
  // Tige : le long du tube de selle jusqu'à la hauteur des rails, puis pince horizontale vers le centre des rails.
  const postEnd: Pt = { x: post.x + (tipY - railY) / Math.tan(rad(frame.sta)), y: railY };
  return { outline, tipX, tipY, post, postEnd, clamp: { x: clampX, y: railY } as Pt };
}

/** Cintre de profil (repère local ancré sur la potence). Le style ne change que la vue de dessus (évasement). */
const BAR_SIDE: Array<[number, number]> = [
  [0, 0],
  [70, 8],
  [112, 6],
  [130, -40],
  [118, -88],
  [76, -128],
  [14, -134],
];
export function cockpitShape(g: FrameGeom, setup: Setup) {
  const cp = cockpit(g, setup);
  const bar: Pt[] = BAR_SIDE.map(([x, y]) => ({ x: cp.bar.x + x, y: cp.bar.y + y }));
  return { cp, bar };
}

export function crankShape(setup: Setup, crankAngle: number) {
  const a1 = rad(crankAngle);
  const pedal1: Pt = { x: setup.crankLength * Math.cos(a1), y: setup.crankLength * Math.sin(a1) };
  const pedal2: Pt = { x: -pedal1.x, y: -pedal1.y };
  return { pedal1, pedal2 };
}

// ─── Couches ─────────────────────────────────────────────────────────────────────

export interface FrameLayerProps {
  frame: Frame;
  wheel: Wheel;
  drawing?: Drawing;
  /** Tracé animé à l'apparition (CSS stroke-dashoffset). */
  trace?: boolean;
}

/** Cadre, roues et sol (vélo d'origine). Mémoïsé : ne se redessine que si le cadre, la roue ou le style changent. */
export const FrameLayer = memo(
  function FrameLayer({ frame, wheel, drawing, trace = false }: FrameLayerProps) {
    const R = wheelRadius(wheel);
    const g = frameGeometry(frame, R);
    const tw = drawing?.tyreWidth ?? wheel.tyreWidth;
    const rim = wheel.bsd / 2;
    const ref = useRef<SVGGElement>(null);
    useTraceLengths(ref, trace);
    return (
      <g ref={ref} className={trace ? 'bp-frame bp-trace' : 'bp-frame'}>
        <line x1={g.rearAxle.x - R - 80} x2={g.frontAxle.x + R + 80} y1={-g.ground} y2={-g.ground} className="thin ground" />
        {[g.rearAxle, g.frontAxle].map((c, i) => (
          <g key={i} className="wheel">
            {/* bande de roulement : épaisseur = largeur du pneu (style) */}
            <circle cx={c.x} cy={-c.y} r={R - tw / 2} className="tyre" fill="none" strokeWidth={tw} />
            <circle cx={c.x} cy={-c.y} r={R} className="tube" fill="none" data-trace={trace || undefined} />
            <circle cx={c.x} cy={-c.y} r={rim} className="thin" fill="none" data-trace={trace || undefined} />
            <circle cx={c.x} cy={-c.y} r={rim - 22} className="thin" fill="none" data-trace={trace || undefined} />
            <circle cx={c.x} cy={-c.y} r={14} className="tube" fill="none" data-trace={trace || undefined} />
          </g>
        ))}
        <Line trace={trace} pts={[{ x: 0, y: 0 }, g.rearAxle]} />
        <Line trace={trace} pts={[g.rearAxle, add(g.seatTop, mul(g.seatDir, -40))]} />
        <Line trace={trace} pts={[{ x: 0, y: 0 }, g.seatTop]} />
        <Line trace={trace} pts={[{ x: 0, y: 0 }, g.headBottom]} />
        <Line trace={trace} pts={[add(g.seatTop, mul(g.seatDir, -35)), add(g.headTop, mul(g.down, 25))]} />
        <Line trace={trace} pts={[g.headTop, g.headBottom]} cls="tube tube-thick" />
        <Line trace={trace} pts={[g.headBottom, g.forkEnd, g.frontAxle]} cls="tube tube-fork" />
      </g>
    );
  },
  (a, b) =>
    a.trace === b.trace &&
    a.wheel.bsd === b.wheel.bsd &&
    a.wheel.tyreWidth === b.wheel.tyreWidth &&
    a.drawing?.tyreWidth === b.drawing?.tyreWidth &&
    a.drawing?.barFlare === b.drawing?.barFlare &&
    Object.keys(a.frame).every((k) => a.frame[k] === b.frame[k]),
);

const fillOf = (v: Variant) => (v === 'phantom' ? 'part part-fill' : 'part');

/** Selle et tige de selle. */
export function SaddleLayer({ frame, setup, variant }: { frame: Frame; setup: Setup; variant: Variant }) {
  const s = saddleShape(frame, setup);
  const ph = variant === 'phantom';
  const g = frameGeometry(frame, 0);
  return (
    <g className="bp-saddle">
      {(!ph || setup.saddleHeight > frame.stl) && (
        <Line pts={[ph ? g.seatTop : add(g.seatTop, mul(g.seatDir, -20)), s.postEnd, s.clamp]} cls="part-line" />
      )}
      <path d={pathD(s.outline, true)} className={fillOf(variant)} />
    </g>
  );
}

/** Jeu de direction, entretoises, potence et cintre. */
export function CockpitLayer({ frame, wheel, setup, variant }: { frame: Frame; wheel: Wheel; setup: Setup; variant: Variant }) {
  const g = frameGeometry(frame, wheelRadius(wheel));
  const { cp, bar } = cockpitShape(g, setup);
  const fill = fillOf(variant);
  return (
    <g className="bp-cockpit">
      <path d={pathD(quad(g.headTop, cp.base, 34), true)} className={fill} />
      <path d={pathD(quad(cp.base, cp.stemTop, 44), true)} className={fill} />
      <path d={pathD(quad(cp.clampC, cp.bar, 30), true)} className={fill} />
      <circle cx={cp.bar.x} cy={-cp.bar.y} r={20} className={fill} />
      <Line pts={bar} cls="bar" />
      <g className="hand">
        <line x1={cp.hands.x - 18} x2={cp.hands.x + 18} y1={-cp.hands.y} y2={-cp.hands.y} />
        <line x1={cp.hands.x} x2={cp.hands.x} y1={-cp.hands.y - 18} y2={-cp.hands.y + 18} />
      </g>
    </g>
  );
}

/** Pédalier, manivelles et pédales. */
export function CrankLayer({ setup, variant, crankAngle = 0 }: { setup: Setup; variant: Variant; crankAngle?: number }) {
  const { pedal1, pedal2 } = crankShape(setup, crankAngle);
  return (
    <g className="bp-crank">
      <circle cx={0} cy={0} r={95} className="thin dashed" fill="none" />
      <circle cx={0} cy={0} r={16} className={fillOf(variant)} />
      <Line pts={[{ x: 0, y: 0 }, pedal1]} cls="part-line" />
      <Line pts={[{ x: 0, y: 0 }, pedal2]} cls="part-line crank-far" />
      <line x1={pedal1.x - 50} x2={pedal1.x + 50} y1={-pedal1.y} y2={-pedal1.y} className="part-line" />
      <line x1={pedal2.x - 50} x2={pedal2.x + 50} y1={-pedal2.y} y2={-pedal2.y} className="part-line crank-far" />
    </g>
  );
}

export interface BikeBlueprintProps {
  frame: Frame;
  wheel: Wheel;
  setup: Setup;
  /** 'stock' = vélo d'origine (complet) ; 'phantom' = pièces corrigées (orange, pointillés). */
  variant: Variant;
  /** Angle de manivelle (°, 0 = avant horizontal). */
  crankAngle?: number;
  drawing?: Drawing;
  trace?: boolean;
}

/** Fond de plan latéral paramétrique (repère mathématique, y inversé au rendu). Les cotes sont dans `sideDims`. */
export function BikeBlueprint({ frame, wheel, setup, variant, crankAngle = 0, drawing, trace }: BikeBlueprintProps) {
  return (
    <g className={`bp bp-${variant}`}>
      {variant === 'stock' && <FrameLayer frame={frame} wheel={wheel} drawing={drawing} trace={trace} />}
      <SaddleLayer frame={frame} setup={setup} variant={variant} />
      <CockpitLayer frame={frame} wheel={wheel} setup={setup} variant={variant} />
      <CrankLayer setup={setup} variant={variant} crankAngle={crankAngle} />
    </g>
  );
}

// ─── Cotes de la vue de côté (traits + libellés à placer) ──────────────────────────

export interface DimSet {
  /** Traits de cote (sans libellé). */
  lines: Array<{ id: string; a: Pt; b: Pt; off: Pt; tone: 'ink' | 'green' }>;
  labels: LabelSpec[];
  obstacles: Obstacle[];
}

/** Libellé de réglage : « Nom valeur mm » puis « (écart) ». */
const withDelta = (name: string, v: string, d: number, dec = 0): string[] => [`${name} ${v} mm`, `(${fmtDelta(d, 'mm', dec)})`];

/**
 * Cotes de la vue de côté. Décalages calculés à partir du dessin (hauts de selle et de cockpit, roue avant)
 * et de la taille de police `fs` (unités du dessin), jamais fixes.
 */
export function sideDims({
  frame,
  wheel,
  cur,
  tgt,
  fs,
  crankAngle = 0,
  frameDims,
  tuneDims,
}: {
  frame: Frame;
  wheel: Wheel;
  cur: Setup;
  tgt: Setup | null;
  fs: number;
  crankAngle?: number;
  frameDims: boolean;
  tuneDims: boolean;
}): DimSet {
  const R = wheelRadius(wheel);
  const g = frameGeometry(frame, R);
  const setups = tgt ? [cur, tgt] : [cur];
  const shapes = setups.map((s) => ({ s, sad: saddleShape(frame, s), ck: cockpitShape(g, s), cr: crankShape(s, crankAngle) }));
  const out: DimSet = { lines: [], labels: [], obstacles: [] };

  // Obstacles : roues, selles, cockpits, pédalier.
  for (const c of [g.rearAxle, g.frontAxle]) out.obstacles.push({ circle: { c, r: R } });
  for (const { sad, ck, cr, s } of shapes) {
    out.obstacles.push({ box: boxOf(sad.outline, 10), weight: 4 });
    out.obstacles.push({ box: boxOf([...ck.bar, ck.cp.base, ck.cp.stemTop, ck.cp.hands, g.headTop], 20), weight: 4 });
    out.obstacles.push({ box: boxOf([cr.pedal1, cr.pedal2], 50), weight: 2 });
    out.obstacles.push({ circle: { c: { x: 0, y: 0 }, r: Math.max(95, s.crankLength) } });
  }
  const pushDim = (id: string, a: Pt, b: Pt, off: Pt, tone: 'ink' | 'green') => {
    out.lines.push({ id, a, b, off, tone });
    out.obstacles.push({ box: boxOf(dimSegment(a, b, off), fs * 0.15), owner: id, weight: 2 });
    const [a2, b2] = dimSegment(a, b, off);
    return mid(a2, b2);
  };

  const topY = Math.max(...shapes.map(({ sad, ck }) => Math.max(sad.tipY, ck.cp.stemTop.y, ck.cp.bar.y + 20)));
  const frontX = Math.max(g.frontAxle.x + R, ...shapes.map(({ ck }) => Math.max(ck.cp.hands.x, ...ck.bar.map((p) => p.x))));

  if (tuneDims && tgt) {
    const t = shapes[shapes.length - 1]!;
    const ck = t.ck.cp;
    // Selle : libellé à côté de la queue de selle.
    out.labels.push({
      id: 'saddle',
      tone: 'ghost',
      at: { x: t.sad.tipX - 255, y: t.sad.tipY + 8 },
      prefer: ['w', 'nw', 'sw'],
      lines: withDelta('Selle', fmtNum(tgt.saddleHeight), tgt.saddleHeight - cur.saddleHeight),
    });
    // Recul : du BB au nez de selle, juste au-dessus de la selle.
    const yRec = Math.max(...shapes.map(({ sad }) => sad.tipY)) + fs * 0.9;
    const mRec = pushDim('setback', { x: 0, y: yRec - fs * 0.9 }, { x: tgt.tipX, y: yRec - fs * 0.9 }, { x: 0, y: fs * 0.9 }, 'green');
    out.labels.push({
      id: 'setback',
      tone: 'ghost',
      at: mRec,
      prefer: ['n', 'nw', 'ne'],
      lines: withDelta('Recul', fmtNum(-tgt.tipX), cur.tipX - tgt.tipX),
    });
    // Potence : le long de la potence, décalée vers le haut (normale gauche du sens avant).
    const n: Pt = { x: -ck.dir.y, y: ck.dir.x };
    const offP = mul(n, 40 + fs * 0.6);
    const mStem = pushDim('stem', ck.clampC, ck.bar, offP, 'green');
    out.labels.push({
      id: 'stem',
      tone: 'ghost',
      at: mStem,
      prefer: ['n', 'nw', 'ne'],
      lines: withDelta('Potence', fmtNum(tgt.stemLength), tgt.stemLength - cur.stemLength),
    });
    // Entretoises : à gauche de la colonne de direction.
    out.labels.push({
      id: 'spacers',
      tone: 'ghost',
      at: mid(g.headTop, ck.base),
      prefer: ['w', 'nw', 'sw'],
      lines: withDelta('Entretoises', fmtNum(tgt.spacers), tgt.spacers - cur.spacers),
    });
    // Manivelle : sous le pédalier.
    out.labels.push({
      id: 'crank',
      tone: 'ghost',
      at: { x: 0, y: -tgt.crankLength },
      prefer: ['s', 'se', 'sw'],
      // une seule ligne : peu haute, elle tient sous le sol, entre les roues
      lines: [withDelta('Manivelle', fmtNum(tgt.crankLength, 1), tgt.crankLength - cur.crankLength, 1).join(' ')],
    });
  }

  if (frameDims) {
    // Reach : du BB au haut du tube de direction, au-dessus du point le plus haut (selle / cockpit).
    const lift = topY - frame.stack + fs * (tuneDims && tgt ? 1.2 : 0.9);
    const mReach = pushDim('reach', { x: 0, y: frame.stack }, g.headTop, { x: 0, y: lift }, 'ink');
    out.labels.push({ id: 'reach', at: mReach, prefer: ['n', 'ne', 'nw'], lines: [`Reach ${fmtNum(frame.reach)} mm`] });
    // Stack et hauteur BB : colonne en chaîne à droite de la roue avant / des mains.
    const colX = frontX + fs * 0.9;
    const mStack = pushDim('stack', { x: 0, y: 0 }, { x: 0, y: frame.stack }, { x: colX, y: 0 }, 'ink');
    out.labels.push({ id: 'stack', at: mStack, prefer: ['e', 'w', 'ne', 'se'], lines: ['Stack', `${fmtNum(frame.stack)} mm`] });
    const mBB = pushDim('bb', { x: 0, y: g.ground }, { x: 0, y: 0 }, { x: colX, y: 0 }, 'ink');
    out.labels.push({ id: 'bb', at: mBB, prefer: ['e', 'w', 'se', 'ne'], lines: ['Hauteur BB', `${fmtNum(-g.ground)} mm`] });
    // Empattement : sous le sol ; avec les cotes de réglage, sous la ligne « Manivelle » (une ligne de texte de plus).
    const below = fs * (tuneDims && tgt ? 2.6 : 0.8);
    const mWb = pushDim('wheelbase', g.rearAxle, g.frontAxle, { x: 0, y: g.ground - g.rearAxle.y - below }, 'ink');
    out.labels.push({ id: 'wheelbase', at: mWb, prefer: ['s', 'n'], lines: [`Empattement ${fmtNum(g.wheelbase)} mm`] });
  }
  return out;
}

/** Traits des cotes (les libellés sont placés par `<DimLabels>`). */
export function DimLines({ set }: { set: DimSet }) {
  return (
    <g className="dim-lines">
      {set.lines.map((l) => (
        <g key={l.id} className={l.tone === 'green' ? 'bp-phantom' : 'bp-stock'}>
          <Dim a={l.a} b={l.b} off={l.off} tone={l.tone} />
        </g>
      ))}
    </g>
  );
}
