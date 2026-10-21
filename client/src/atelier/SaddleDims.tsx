import type { JSX } from 'react';
import type { FitResult } from '../fit/types';
import { Dim } from '../blueprint/BlueprintSvg';
import { saddleShape } from '../blueprint/BikeBlueprint';
import { add, fmtNum, frameGeometry, mul, pathD, rad, type Frame, type Pt, type Setup } from '../blueprint/geometry';
import { ghostNose, saddleOutline, simNose, tiltLine, TILT_TARGET, type SaddleSim, type SaddleStep } from './saddle';

export interface SaddleDimsProps {
  frame: Frame;
  fit: FitResult;
  /** Réglage dessiné par la scène (actuel du store) : tige, potence… */
  current: Setup;
  /** Selle simulée par le panneau. */
  sim: SaddleSim;
  step: SaddleStep;
  /** Taille de police en unités du dessin (cadrage d'arrivée de la caméra). */
  fs: number;
}

const sgn = (v: number, dec: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v), dec)}`;

/**
 * Calque selle de la scène (vue de côté, zoom selle) : selle simulée (inclinée), fantôme orange de la cible
 * ancré sur `fit.saddlePosition`, et la cote du temps en cours (hauteur le long du tube, fil à plomb + recul,
 * inclinaison du bec). Repère mathématique, y inversé au rendu ; rendu dans le <svg> du plan (portail).
 */
export function SaddleDims({ frame, fit, current, sim, step, fs }: SaddleDimsProps): JSX.Element {
  const a = rad(frame.sta);
  const u: Pt = { x: -Math.cos(a), y: Math.sin(a) }; // le long du tube, vers le haut
  const n: Pt = { x: Math.sin(a), y: Math.cos(a) }; // normale vers l'avant
  const g = frameGeometry(frame, 0);
  const nose = simNose(sim, frame.sta);
  const ghost = ghostNose(fit);
  // Tige : même tracé que SaddleLayer, pour la selle simulée.
  const sh = saddleShape(frame, { ...current, saddleHeight: sim.height, tipX: -sim.setback });
  const post = [add(g.seatTop, mul(g.seatDir, -20)), sh.postEnd, sh.clamp];
  const t = tiltLine(nose, sim.tilt);
  const lvl = tiltLine(nose, 0);

  let dims: JSX.Element | null = null;
  if (step === 'height') {
    // Cote le long du tube, en arrière du tube (côté queue de selle), sur les 260 derniers mm.
    const off = mul(n, -(90 + fs));
    const p0 = mul(u, sim.height - 260);
    const p1 = mul(u, sim.height);
    const lab = add(add(mul(u, sim.height - 130), off), mul(n, -fs * 0.6));
    const ang = frame.sta; // même règle que Dim : texte lisible, jamais à l'envers
    const ht = mul(u, fit.saddleHeight.value);
    const ht0 = add(ht, mul(off, 0.6));
    const ht1 = add(ht, mul(off, 1.4));
    dims = (
      <g className="sd-dim">
        <g className="bp-stock">
          <Dim a={p0} b={p1} off={off} />
        </g>
        <text className="dim-text" textAnchor="middle" transform={`translate(${lab.x.toFixed(1)} ${(-lab.y).toFixed(1)}) rotate(${ang.toFixed(2)})`}>
          {`Hauteur ${fmtNum(sim.height)} mm`}
        </text>
        {/* repère de la hauteur cible sur la même cote */}
        <g className="bp-phantom">
          <line className="sd-tick" x1={ht0.x} y1={-ht0.y} x2={ht1.x} y2={-ht1.y} />
        </g>
        <text className="dim-text green ghost" x={ht1.x - fs * 0.3} y={-ht1.y + fs * 0.35} textAnchor="end">
          {`cible ${fmtNum(fit.saddleHeight.value)}`}
        </text>
      </g>
    );
  } else if (step === 'setback') {
    // Fil à plomb par l'axe BB ; recul actuel puis recul cible (orange) au-dessus de la selle, libellés à droite
    // du fil (les cotes, courtes, ne logent pas leur texte).
    const yc = Math.max(nose.y, ghost.y) + 40 + fs;
    const yt = yc + fs * 1.8;
    const bottom = Math.min(nose.y, ghost.y) - 160;
    dims = (
      <g className="sd-dim">
        <line className="sd-plumb" x1={0} x2={0} y1={-(yt + fs)} y2={-bottom} />
        <text className="dim-text" x={fs * 0.5} y={-bottom} textAnchor="start">
          fil à plomb (axe BB)
        </text>
        <g className="bp-stock">
          <Dim a={nose} b={{ x: 0, y: nose.y }} off={{ x: 0, y: yc - nose.y }} />
        </g>
        <text className="dim-text" x={fs * 0.6} y={-yc + fs * 0.35} textAnchor="start">
          {`Recul ${fmtNum(sim.setback)} mm`}
        </text>
        <g className="bp-phantom">
          <Dim a={ghost} b={{ x: 0, y: ghost.y }} off={{ x: 0, y: yt - ghost.y }} tone="green" />
        </g>
        <text className="dim-text green ghost" x={fs * 0.6} y={-yt + fs * 0.35} textAnchor="start">
          {`cible ${fmtNum(-ghost.x)} mm`}
        </text>
      </g>
    );
  } else {
    // Inclinaison : horizontale de référence par la queue, ligne du dessus de selle, angle lu.
    dims = (
      <g className="sd-dim">
        <line className="sd-level" x1={lvl.tail.x - 20} x2={lvl.nose.x + 50} y1={-t.tail.y} y2={-t.tail.y} />
        <line className="sd-tilt" x1={t.tail.x} y1={-t.tail.y} x2={t.nose.x} y2={-t.nose.y} />
        <text className="dim-text" x={t.nose.x + 56} y={-((t.nose.y + t.tail.y) / 2) + fs * 0.35} textAnchor="start">
          {`Bec ${sgn(sim.tilt, 1)}°`}
        </text>
        <text className="dim-text green ghost" x={t.nose.x + 56} y={-((t.nose.y + t.tail.y) / 2) + fs * 1.6} textAnchor="start">
          {`cible ${fmtNum(TILT_TARGET, 1)}°`}
        </text>
      </g>
    );
  }

  return (
    <g className="sd" data-step={step}>
      <g className="bp-stock">
        <path d={pathD(post)} className="part-line" fill="none" />
        <path d={pathD(saddleOutline(nose, sim.tilt), true)} className="part" />
      </g>
      <g className="bp-phantom sd-ghost">
        <path d={pathD(saddleOutline(ghost, TILT_TARGET), true)} className="part part-fill" />
      </g>
      {dims}
    </g>
  );
}
