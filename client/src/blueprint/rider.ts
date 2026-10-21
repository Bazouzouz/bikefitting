import type { RiderMeasurements } from '../fit/types';
import { ELBOW_FLEX_FACTOR, TORSO_TO_HIP_SHOULDER, WRIST_TO_GRIP } from '../fit/cockpit';
import {
  DEFAULT_SOLE_PEDAL_STACK,
  FOOT_ANGLE_3OCLOCK,
  FOOT_ANGLE_BDC,
  SADDLE_NOSE_TO_SIT,
  hipFromSit,
  legModel,
  solveKnee,
} from '../fit/kinematics';
import {
  add,
  cockpit,
  dist,
  frameGeometry,
  mul,
  rad,
  saddleTipY,
  sub,
  unit,
  type Frame,
  type Pt,
  type Setup,
} from './geometry';

export interface RiderPose {
  hip: Pt;
  knee: Pt;
  ankle: Pt;
  ball: Pt;
  heel: Pt;
  toe: Pt;
  kneeFar: Pt;
  ankleFar: Pt;
  ballFar: Pt;
  heelFar: Pt;
  toeFar: Pt;
  headRadius: number;
  shoulder: Pt;
  elbow: Pt;
  hand: Pt;
  head: Pt;
  /** Angles articulaires (°, angle intérieur). */
  angles: { knee: number; hip: number; elbow: number; shoulder: number; back: number };
  /** Jambe en extension maximale (selle trop haute ou entrejambe trop court). */
  legOverstretched: boolean;
}

const deg = (r: number) => (r * 180) / Math.PI;
const rot = (v: Pt, a: number): Pt => ({
  x: v.x * Math.cos(a) - v.y * Math.sin(a),
  y: v.x * Math.sin(a) + v.y * Math.cos(a),
});
const angleBetween = (a: Pt, b: Pt) => {
  const c = (a.x * b.x + a.y * b.y) / ((Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)) || 1);
  return deg(Math.acos(Math.max(-1, Math.min(1, c))));
};

/** Chaîne à deux segments : renvoie le coude/genou. side=+1 → à gauche du sens a→b (repère y haut). */
function twoLink(a: Pt, b: Pt, l1: number, l2: number, side: 1 | -1): { joint: Pt; over: boolean } {
  const d = dist(a, b);
  const dir = unit(sub(b, a));
  if (d >= l1 + l2 - 0.5) return { joint: add(a, mul(dir, l1 * Math.min(1, d / (l1 + l2)))), over: true };
  const dd = Math.max(d, Math.abs(l1 - l2) + 1);
  const cosA = (l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
  return { joint: add(a, mul(rot(dir, side * alpha), l1)), over: false };
}

/** Pose du cycliste (vue de côté) pour un angle de manivelle donné. */
export function solveRider(rider: RiderMeasurements, frame: Frame, setup: Setup, crankAngleDeg: number): RiderPose {
  const leg = legModel(rider);
  const H = rider.height * 10;
  // Point d'assise = dessus de selle, à SADDLE_NOSE_TO_SIT derrière la pointe ; hanche au-dessus (même modèle que le moteur).
  const sit: Pt = { x: setup.tipX - SADDLE_NOSE_TO_SIT, y: saddleTipY(frame, setup) };
  const hip = hipFromSit(sit, leg);
  const a = rad(crankAngleDeg);

  /** Pied posé sur la pédale : cheville, talon, métatarse, orteils (mêmes formules que anklePosition). */
  const footAt = (ang: number) => {
    const pedal: Pt = { x: setup.crankLength * Math.cos(ang), y: setup.crankLength * Math.sin(ang) };
    // Talon relevé au PMB (20°), quasi à plat à 3 h et au PMH (5°).
    const lowness = Math.max(0, -Math.sin(ang));
    const fa = rad(FOOT_ANGLE_3OCLOCK + (FOOT_ANGLE_BDC - FOOT_ANGLE_3OCLOCK) * lowness);
    const f: Pt = { x: Math.cos(fa), y: -Math.sin(fa) };
    const n: Pt = { x: Math.sin(fa), y: Math.cos(fa) };
    const sole = add(pedal, mul(n, DEFAULT_SOLE_PEDAL_STACK));
    const ball = add(sole, mul(f, -setup.cleatFore));
    const ankle = add(add(ball, mul(f, -leg.ankleToBall)), mul(n, leg.ankleHeight));
    const heel = add(add(ball, mul(f, -leg.footLength * 0.72)), mul(n, 6));
    const toe = add(add(ball, mul(f, leg.footLength * 0.28)), mul(n, 6));
    return { pedal, ball, ankle, heel, toe };
  };
  const near = footAt(a);
  const far = footAt(a + Math.PI);
  const k = solveKnee(hip, near.ankle, leg.femur, leg.shank);
  const kFar = solveKnee(hip, far.ankle, leg.femur, leg.shank);

  // Haut du corps : modèle du moteur (fit/cockpit.ts) — tronc effectif = 0,83 × torse, bras effectif = 0,9 × bras + 50 mm.
  const g = frameGeometry(frame, 350);
  const hand = cockpit(g, setup).hands;
  const torso = rider.torso * 10 * TORSO_TO_HIP_SHOULDER;
  const armStraight = rider.arm * 10;
  const reach = armStraight * ELBOW_FLEX_FACTOR + WRIST_TO_GRIP;
  // intersection cercle(hip, torso) ∩ cercle(hand, reach), solution haute
  const d = dist(hip, hand);
  let shoulder: Pt;
  if (d > torso + reach || d < Math.abs(torso - reach) || d < 1e-6) {
    // Hors d'atteinte : épaule sur la droite hanche-mains, tronc à longueur réelle.
    shoulder = add(hip, mul(unit(sub(hand, hip)), torso));
  } else {
    const aa = (torso * torso - reach * reach + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, torso * torso - aa * aa));
    const u = unit(sub(hand, hip));
    const base = add(hip, mul(u, aa));
    const p1 = add(base, mul({ x: -u.y, y: u.x }, h));
    const p2 = add(base, mul({ x: u.y, y: -u.x }, h));
    shoulder = p1.y >= p2.y ? p1 : p2;
  }
  // Bras : coude fléchi vers le bas ; segments tels que la somme (bras + poignet→prise) vaille la longueur réelle.
  const upperArm = armStraight * 0.55;
  const foreArm = armStraight * 0.45 + WRIST_TO_GRIP;
  const e = twoLink(shoulder, hand, upperArm, foreArm, -1);
  // Tête : cou incliné ~45° au-dessus de l'horizontale (regard vers l'avant), centre à ~0,085 H de l'acromion.
  const neck = rad(45);
  const head = add(shoulder, mul({ x: Math.cos(neck), y: Math.sin(neck) }, H * 0.085));

  const kneeAngle = angleBetween(sub(hip, k.knee), sub(near.ankle, k.knee));
  const hipAngle = angleBetween(sub(shoulder, hip), sub(k.knee, hip));
  const elbowAngle = angleBetween(sub(shoulder, e.joint), sub(hand, e.joint));
  const shoulderAngle = angleBetween(sub(hip, shoulder), sub(e.joint, shoulder));
  const back = deg(Math.atan2(shoulder.y - hip.y, shoulder.x - hip.x));

  return {
    hip,
    knee: k.knee,
    ankle: near.ankle,
    ball: near.ball,
    heel: near.heel,
    toe: near.toe,
    kneeFar: kFar.knee,
    ankleFar: far.ankle,
    ballFar: far.ball,
    heelFar: far.heel,
    toeFar: far.toe,
    shoulder,
    elbow: e.joint,
    hand,
    head,
    headRadius: H * 0.055,
    angles: { knee: kneeAngle, hip: hipAngle, elbow: elbowAngle, shoulder: shoulderAngle, back },
    legOverstretched: !k.reachable,
  };
}

/** Extrema de l'angle de genou sur un tour de pédale. */
export function kneeRange(rider: RiderMeasurements, frame: Frame, setup: Setup) {
  let min = 999;
  let max = 0;
  for (let i = 0; i < 36; i++) {
    const k = solveRider(rider, frame, setup, i * 10).angles.knee;
    min = Math.min(min, k);
    max = Math.max(max, k);
  }
  return { min, max };
}
