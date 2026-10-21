import type { JSX } from 'react';
import type { Bike } from '@bikefit/shared';
import type { FitResult } from '../fit/types';
import { Dim } from '../blueprint/BlueprintSvg';
import { CockpitLayer } from '../blueprint/BikeBlueprint';
import { add, cockpit, fmtNum, frameGeometry, mid, mul, pathD, setupFromFit, type Frame, type Pt, type Setup } from '../blueprint/geometry';
import { ghostHoods, setupWithSim, type CockpitSim, type CockpitStep } from './cockpit';

export interface CockpitDimsProps {
  frame: Frame;
  wheel: Bike['wheel'];
  fit: FitResult;
  /** Réglage dessiné par la scène (actuel du store) : selle, manivelle… */
  current: Setup;
  /** Cockpit simulé par le panneau. */
  sim: CockpitSim;
  step: CockpitStep;
  /** Taille de police en unités du dessin (cadrage d'arrivée de la caméra). */
  fs: number;
  /** Dessus de selle (y) du réglage actuel et drop du moteur : cote du temps 3. */
  drop: { saddleY: number; target: number };
}

const sgn = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v))}`;

/** Bande de largeur `w` le long du segment a → b (repère mathématique) : pile d'entretoises. */
function band(a: Pt, b: Pt, w: number): Pt[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * (w / 2);
  const ny = (dx / l) * (w / 2);
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
}

/**
 * Calque cockpit de la scène (vue de côté, zoom cockpit) : cockpit simulé (entretoises dessous ET dessus, potence,
 * cintre, cocottes), cocottes fantômes orange de la cible (cockpit(g, setupFromFit(fit)).hands) et la cote du temps
 * en cours : pile d'entretoises le long du pivot, potence (longueur · angle), drop selle → cocottes.
 * Repère mathématique, y inversé au rendu ; rendu dans le <svg> du plan (portail). Le cockpit cible reste celui du
 * plan (fantôme orange) ; le cockpit d'origine du plan est masqué (cockpit.css) pour ne pas doubler.
 */
export function CockpitDims({ frame, wheel, fit, current, sim, step, fs, drop }: CockpitDimsProps): JSX.Element {
  const g = frameGeometry(frame, 0);
  const s = setupWithSim(current, sim);
  const cp = cockpit(g, s);
  const tgt = setupFromFit(fit);
  const ct = cockpit(g, tgt);
  const hoodsT = ghostHoods(frame, fit);
  const capTop = cockpit(g, { ...s, spacers: 0 }).base; // haut du capot de jeu de direction
  const above = add(cp.stemTop, mul(g.up, sim.spacersAbove));
  const back = mul(g.fwd, -1);

  let dims: JSX.Element | null = null;
  if (step === 'spacers') {
    // Pile le long du pivot, côté arrière ; repère orange de la cible sur le même axe.
    const off = mul(back, 46 + fs);
    const lab = add(mid(capTop, cp.base), mul(back, 52 + fs * 1.6));
    const tb = cockpit(g, { ...s, spacers: fit.spacers.value }).base;
    const t0 = add(tb, mul(back, 30));
    const t1 = add(tb, mul(back, 46 + fs * 1.6));
    dims = (
      <g className="cd-dim">
        {sim.spacers > 0 && (
          <g className="bp-stock">
            <Dim a={capTop} b={cp.base} off={off} />
          </g>
        )}
        <text className="dim-text" x={lab.x} y={-lab.y + fs * 0.35} textAnchor="end">
          {`Dessous ${fmtNum(sim.spacers)} mm`}
        </text>
        <text className="dim-text" x={above.x - 30 - fs * 0.4} y={-above.y + fs * 0.35} textAnchor="end">
          {`Dessus ${fmtNum(sim.spacersAbove)} mm`}
        </text>
        <g className="bp-phantom">
          <line className="cd-tick" x1={t0.x} y1={-t0.y} x2={t1.x} y2={-t1.y} />
        </g>
        <text className="dim-text green ghost" x={t1.x - fs * 0.3} y={-t1.y + fs * 1.3} textAnchor="end">
          {`cible ${fmtNum(fit.spacers.value)} mm`}
        </text>
      </g>
    );
  } else if (step === 'stem') {
    // Potence : cote le long de la potence (au-dessus), libellé actuel au-dessus, cible orange sous la potence cible.
    const n: Pt = { x: -cp.dir.y, y: cp.dir.x };
    const off = mul(n, 40 + fs * 0.6);
    const m = add(mid(cp.clampC, cp.bar), add(off, mul(n, fs * 0.9)));
    const nt: Pt = { x: -ct.dir.y, y: ct.dir.x };
    const mt = add(mid(ct.clampC, ct.bar), mul(nt, -(40 + fs * 1.4)));
    dims = (
      <g className="cd-dim">
        <g className="bp-stock">
          <Dim a={cp.clampC} b={cp.bar} off={off} />
        </g>
        <text className="dim-text" x={m.x + fs * 0.5} y={-m.y - fs * 0.5} textAnchor="end">
          {`Potence ${fmtNum(sim.stemLength)} mm · ${sgn(sim.stemAngle)}°`}
        </text>
        <text className="dim-text green ghost" x={mt.x} y={-mt.y + fs * 0.35} textAnchor="middle">
          {`cible ${fmtNum(tgt.stemLength)} mm · ${sgn(tgt.stemAngle)}°`}
        </text>
      </g>
    );
  } else {
    // Drop selle → cocottes : horizontale du dessus de selle, cote verticale derrière la potence (libellés à gauche :
    // devant les cocottes, ils sortiraient du cadrage sur petit écran).
    const x = Math.min(cp.clampC.x, ct.clampC.x) - 40;
    const cur = drop.saddleY - cp.hands.y;
    dims = (
      <g className="cd-dim">
        <line className="cd-level" x1={x - 400} x2={Math.max(cp.hands.x, hoodsT.x) + 40} y1={-drop.saddleY} y2={-drop.saddleY} />
        <text className="dim-text" x={x - fs * 0.6} y={-drop.saddleY - fs * 0.5} textAnchor="end">
          niveau du dessus de selle
        </text>
        <g className="bp-stock">
          <Dim a={{ x, y: drop.saddleY }} b={{ x, y: cp.hands.y }} off={{ x: 0, y: 0 }} />
        </g>
        <text className="dim-text" x={x - fs * 0.6} y={-(drop.saddleY + cp.hands.y) / 2 + fs * 0.35} textAnchor="end">
          {`Drop ${fmtNum(cur)} mm`}
        </text>
        <text className="dim-text green ghost" x={x - fs * 0.6} y={-(drop.saddleY + cp.hands.y) / 2 + fs * 1.6} textAnchor="end">
          {`cible ${fmtNum(drop.target)} mm`}
        </text>
        <text className="dim-text" x={cp.bar.x} y={-(cp.bar.y - 160) + fs} textAnchor="middle">
          {`Cintre ${fmtNum(sim.handlebarWidth)} mm (vue de dessus)`}
        </text>
      </g>
    );
  }

  return (
    <g className="cd" data-step={step}>
      <g className="bp-stock">
        {sim.spacersAbove > 0 && <path d={pathD(band(cp.stemTop, above, 34), true)} className="part" />}
        <CockpitLayer frame={frame} wheel={wheel} setup={s} variant="stock" />
      </g>
      {/* Cocottes fantômes : la cible du blueprint, cockpit(g, setupFromFit(fit)).hands. */}
      <g className="bp-phantom cd-ghost-hoods">
        <circle cx={hoodsT.x} cy={-hoodsT.y} r={22} className="cd-hoods" />
        <circle cx={hoodsT.x} cy={-hoodsT.y} r={5} className="cd-hoods-dot" />
      </g>
      <text className="dim-text green ghost" x={hoodsT.x - fs * 0.3} y={-hoodsT.y - 28 - fs * 0.4} textAnchor="start">
        cocottes cible
      </text>
      {dims}
    </g>
  );
}
