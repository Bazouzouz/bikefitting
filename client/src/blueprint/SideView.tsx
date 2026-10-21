import type { Bike, BikeSize, BikeStyle } from '@bikefit/shared';
import type { RiderMeasurements } from '../fit/types';
import { BlueprintSvg, DimLabels, useBlueprint, type Bounds, type Note } from './BlueprintSvg';
import { BikeBlueprint, DimLines, sideDims } from './BikeBlueprint';
import { RiderOverlay, angleLabelPoints } from './RiderOverlay';
import { drawingFor, fmtNum, frameGeometry, toFrame, wheelRadius, type Frame, type Setup } from './geometry';
import { CHAR_EM, type Obstacle } from './labels';
import { useTweenedScene } from './useTween';

/** Cotes affichées : 'all' = cadre + réglage (comportement historique). */
export type SideDimsMode = 'all' | 'frame' | 'tune' | 'none';

export interface SideViewProps {
  size: BikeSize;
  wheel: Bike['wheel'];
  /** Réglages d'origine (vélo gris). */
  current: Setup;
  /** Réglages cibles (fantôme orange) ; null = pas de fantôme. */
  target: Setup | null;
  rider?: RiderMeasurements;
  /** Sur quelle position poser le cycliste. */
  riderOn?: 'current' | 'target';
  crankAngle?: number;
  /** Style du vélo (traits de dessin) ; gravel par défaut. */
  style?: BikeStyle;
  /** Cadre fixe (ratio constant) ; par défaut calculé sur la taille affichée. */
  bounds?: Bounds;
  /** viewBox de caméra (voir BlueprintSvg). */
  viewBox?: readonly [number, number, number, number];
  dims?: SideDimsMode;
  /** Ne garder que ces cotes (ids de `sideDims` : 'saddle', 'setback', 'stem', 'spacers', 'crank', 'reach'…) ; absent = toutes. */
  dimIds?: readonly string[];
  /** Tracé animé du cadre ; `traceKey` relance l'animation (nouveau vélo). */
  trace?: boolean;
  traceKey?: string;
  riderClassName?: string;
  notes?: Note[];
}

/** Cadre par défaut de la vue de côté pour un cadre donné. */
/** `below` : marge supplémentaire sous le sol (mm), pour loger les cotes basses (Stage). */
export function sideBounds(frame: Frame, wheel: Bike['wheel'], withRider: boolean, below = 0): Bounds {
  const R = wheelRadius(wheel);
  const g = frameGeometry(frame, R);
  return {
    minX: g.rearAxle.x - R - 120,
    maxX: g.frontAxle.x + R + 330,
    minY: g.ground - 220 - below,
    maxY: withRider ? Math.max(frame.stack + 320, 1580) : frame.stack + 800,
  };
}

function SideDimsLayer({
  frame,
  wheel,
  cur,
  tgt,
  crankAngle,
  mode,
  rider,
  riderSetup,
  only,
}: {
  frame: Frame;
  wheel: Bike['wheel'];
  cur: Setup;
  tgt: Setup | null;
  crankAngle: number;
  mode: SideDimsMode;
  rider?: RiderMeasurements;
  riderSetup: Setup;
  only?: readonly string[];
}) {
  const ctx = useBlueprint();
  if (!ctx || mode === 'none') return null;
  const all = sideDims({
    frame,
    wheel,
    cur,
    tgt,
    fs: ctx.fs,
    crankAngle,
    frameDims: mode === 'all' || mode === 'frame',
    tuneDims: mode === 'all' || mode === 'tune',
  });
  // filtre : les traits, libellés et obstacles propres des cotes écartées disparaissent ensemble
  const keep = (id?: string) => !only || !id || only.includes(id);
  const set = only
    ? { lines: all.lines.filter((l) => keep(l.id)), labels: all.labels.filter((l) => keep(l.id)), obstacles: all.obstacles.filter((o) => keep(o.owner)) }
    : all;
  const obstacles: Obstacle[] = [...set.obstacles];
  if (rider) {
    // libellés d'angle du cycliste (« 142° ») : à éviter
    const hw = 2.5 * CHAR_EM * ctx.fs;
    const hh = 0.7 * ctx.fs;
    for (const p of angleLabelPoints(rider, frame, riderSetup, crankAngle))
      obstacles.push({ box: { x0: p.x - hw, x1: p.x + hw, y0: p.y - hh, y1: p.y + hh }, weight: 50 });
  }
  return (
    <>
      <DimLines set={set} />
      <DimLabels specs={set.labels} obstacles={obstacles} />
    </>
  );
}

export function SideView({
  size,
  wheel,
  current,
  target,
  rider,
  riderOn = 'current',
  crankAngle = 0,
  style,
  bounds: fixedBounds,
  viewBox,
  dims = 'all',
  dimIds,
  trace = false,
  traceKey,
  riderClassName,
  notes,
}: SideViewProps) {
  const scene = useTweenedScene(toFrame(size, style), current, target);
  const drawing = drawingFor(style, wheel);
  // cotes cadre + réglage ensemble : marge sous le sol pour « Manivelle » puis « Empattement »
  const bounds = fixedBounds ?? sideBounds(scene.frame, wheel, !!rider, dims === 'all' && scene.tgt ? 150 : 0);
  const riderSetup = riderOn === 'target' && scene.tgt ? scene.tgt : scene.cur;
  return (
    <BlueprintSvg
      bounds={bounds}
      viewBox={viewBox}
      label={`Vue de côté, taille ${size.label}`}
      notes={notes ?? [{ text: `Tube de selle ${fmtNum(scene.frame.sta, 1)}° · Direction ${fmtNum(scene.frame.hta, 1)}°` }]}
    >
      <g key={traceKey ?? 'bike'}>
        <BikeBlueprint
          frame={scene.frame}
          wheel={wheel}
          setup={scene.cur}
          variant="stock"
          crankAngle={crankAngle}
          drawing={drawing}
          trace={trace}
        />
      </g>
      {scene.tgt && (
        <BikeBlueprint frame={scene.frame} wheel={wheel} setup={scene.tgt} variant="phantom" crankAngle={crankAngle} drawing={drawing} />
      )}
      {rider && (
        <RiderOverlay rider={rider} frame={scene.frame} setup={riderSetup} crankAngle={crankAngle} className={riderClassName} />
      )}
      <SideDimsLayer
        frame={scene.frame}
        wheel={wheel}
        cur={scene.cur}
        tgt={scene.tgt}
        crankAngle={crankAngle}
        mode={dims}
        rider={rider}
        riderSetup={riderSetup}
        only={dimIds}
      />
    </BlueprintSvg>
  );
}
