import type { RiderMeasurements } from '../fit/types';
import { fmtNum, pathD, sub, type Frame, type Pt, type Setup } from './geometry';
import { solveRider, type RiderPose } from './rider';

/** Arc d'angle intérieur au sommet c entre c→p1 et c→p2 (repère mathématique). */
function arc(c: Pt, p1: Pt, p2: Pt, r: number): { d: string; label: Pt } {
  const v1 = sub(p1, c);
  const v2 = sub(p2, c);
  const a1 = Math.atan2(v1.y, v1.x);
  let a2 = Math.atan2(v2.y, v2.x);
  let diff = a2 - a1;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  a2 = a1 + diff;
  const s: Pt = { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) };
  const e: Pt = { x: c.x + r * Math.cos(a2), y: c.y + r * Math.sin(a2) };
  const m = (a1 + a2) / 2;
  const sweep = diff > 0 ? 0 : 1; // y inversé à l'écran
  return {
    d: `M${s.x},${-s.y}A${r},${r} 0 0 ${sweep} ${e.x},${-e.y}`,
    label: { x: c.x + (r + 55) * Math.cos(m), y: c.y + (r + 55) * Math.sin(m) },
  };
}

const poly = (...pts: Pt[]) => pathD(pts);

/** Articulation annotée d'un angle. */
export type AngleKey = 'knee' | 'hip' | 'elbow';

/** Articulations annotées (genou, hanche, coude) et leur arc d'angle. */
function jointsOf(p: RiderPose): Array<{ c: Pt; p1: Pt; p2: Pt; v: number; k: AngleKey }> {
  return [
    { c: p.knee, p1: p.hip, p2: p.ankle, v: p.angles.knee, k: 'knee' },
    { c: p.hip, p1: p.shoulder, p2: p.knee, v: p.angles.hip, k: 'hip' },
    { c: p.elbow, p1: p.shoulder, p2: p.hand, v: p.angles.elbow, k: 'elbow' },
  ];
}

/** Centres des libellés d'angle, par articulation (cadrage de la caméra). `only` : articulations affichées. */
export function angleLabels(
  rider: RiderMeasurements,
  frame: Frame,
  setup: Setup,
  crankAngle: number,
  only?: readonly AngleKey[],
): Array<{ k: AngleKey; at: Pt }> {
  return jointsOf(solveRider(rider, frame, setup, crankAngle))
    .filter((j) => !only || only.includes(j.k))
    .map((j) => ({ k: j.k, at: arc(j.c, j.p1, j.p2, 70).label }));
}

/** Centres des libellés d'angle (pour que les cotes les évitent). */
export function angleLabelPoints(rider: RiderMeasurements, frame: Frame, setup: Setup, crankAngle: number, only?: readonly AngleKey[]): Pt[] {
  return angleLabels(rider, frame, setup, crankAngle, only).map((l) => l.at);
}

/** Squelette du cycliste en vue de côté, animé via crankAngle. */
export function RiderOverlay({
  rider,
  frame,
  setup,
  crankAngle,
  showAngles = true,
  angles,
  className,
}: {
  rider: RiderMeasurements;
  frame: Frame;
  setup: Setup;
  crankAngle: number;
  showAngles?: boolean;
  /** Angles affichés (absent : tous). */
  angles?: readonly AngleKey[];
  className?: string;
}) {
  const p = solveRider(rider, frame, setup, crankAngle);
  const joints = jointsOf(p).filter((j) => !angles || angles.includes(j.k));
  return (
    <g className={className ? `rider ${className}` : 'rider'}>
      <g className="rider-far">
        <path d={poly(p.hip, p.kneeFar, p.ankleFar)} className="limb" />
        <path d={poly(p.heelFar, p.ankleFar, p.ballFar, p.toeFar)} className="foot" />
      </g>
      <path d={poly(p.hip, p.shoulder)} className="limb torso" />
      <path d={poly(p.shoulder, p.elbow, p.hand)} className="limb arm" />
      <path d={poly(p.hip, p.knee, p.ankle)} className="limb" />
      <path d={poly(p.heel, p.ankle, p.ball, p.toe)} className="foot" />
      <path d={poly(p.shoulder, p.head)} className="limb neck" />
      <circle cx={p.head.x} cy={-p.head.y} r={p.headRadius} className="head" />
      {[p.hip, p.knee, p.shoulder, p.elbow].map((j, i) => (
        <circle key={i} cx={j.x} cy={-j.y} r={20} className="joint" />
      ))}
      {showAngles &&
        joints.map((j) => {
          const a = arc(j.c, j.p1, j.p2, 70);
          return (
            <g key={j.k} className="angle">
              <path d={a.d} fill="none" className="thin" />
              <text x={a.label.x} y={-a.label.y} textAnchor="middle" dominantBaseline="middle" className="angle-text">
                {fmtNum(j.v)}°
              </text>
            </g>
          );
        })}
    </g>
  );
}
