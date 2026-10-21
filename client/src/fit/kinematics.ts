/**
 * Modèle anthropométrique et cinématique 2D (plan sagittal) du membre inférieur.
 * Unités : mm et degrés. Origine = axe de pédalier (BB), x vers l'avant, y vers le haut.
 */
import type { RiderMeasurements } from './types';

export interface Vec2 {
  x: number;
  y: number;
}

export const deg2rad = (d: number): number => (d * Math.PI) / 180;
export const rad2deg = (r: number): number => (r * 180) / Math.PI;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
/** Arrondi au pas `step` (pas < 1 traité par division pour éviter le bruit flottant, ex. 144.20000000000002). */
export const round = (v: number, step = 1): number =>
  step >= 1 ? Math.round(v / step) * step : Math.round(v / step) / Math.round(1 / step);

/** Hauteur cumulée semelle + pédale (axe -> dessous du pied), mm. Valeur moyenne route/gravel SPD-SL/SPD. */
export const DEFAULT_SOLE_PEDAL_STACK = 25;
/** Distance entre le point d'assise (où l'on mesure la hauteur de selle) et la pointe de selle (selle ~270 mm). */
export const SADDLE_NOSE_TO_SIT = 140;
/** Angle du pied par rapport à l'horizontale au PMB (talon relevé), valeur typique pédalage assis. */
export const FOOT_ANGLE_BDC = 20;
/** Angle du pied à 3 h (manivelle horizontale avant). */
export const FOOT_ANGLE_3OCLOCK = 5;
/**
 * Repère KOPS : tubérosité tibiale antérieure / face postérieure de la rotule, estimée
 *  ~35 mm devant le centre articulaire du genou (sur l'axe du tibia, projeté à l'horizontale).
 */
export const KOPS_PATELLA_OFFSET = 35;

/**
 * Enfoncement assis (tissus mous sous les ischions + mousse de selle/peau de cuissard) vs entrejambe mesuré
 * debout sous pression : ~20 mm. Calibré pour que LeMond donne ~145–150° au genou (Holmes) sur un sujet moyen.
 */
export const SEAT_COMPRESSION = 20;

/** Longueurs anthropométriques dérivées (mm). */
export interface LegModel {
  /** Hauteur du centre de hanche (grand trochanter) au-dessus du point d'assise. */
  hipAboveSaddle: number;
  femur: number;
  shank: number;
  /** Hauteur malléole au-dessus de la plante. */
  ankleHeight: number;
  /** Longueur du pied (mm). */
  footLength: number;
  /** Distance malléole -> tête du 1er métatarse, projetée sur l'axe du pied. */
  ankleToBall: number;
}

/**
 * Longueur du pied estimée depuis la pointure EU.
 * Source : point de Paris = 2/3 cm ; longueur de chaussure ≈ pointure × 6,67 mm,
 * le pied étant ~15 mm plus court que la forme (aisance).
 */
export function footLengthFromShoeSize(shoeSizeEU: number): number {
  return shoeSizeEU * (20 / 3) - 15;
}

/**
 * Segments du membre inférieur.
 * Source : proportions de Drillis & Contini (1966) / Winter, « Biomechanics and Motor Control of Human
 * Movement » : hauteur trochantérienne ≈ 0,53 H, cuisse ≈ 0,245 H, jambe ≈ 0,246 H, malléole ≈ 0,039 H.
 * La longueur de jambe L (trochanter -> sol) est prise = 0,53 H borné par l'entrejambe + 60..140 mm,
 * puis répartie selon ces mêmes ratios (fémur 0,245/0,53, tibia 0,246/0,53, cheville 0,039/0,53)
 * pour rester cohérente avec l'entrejambe mesuré. Le centre de hanche est donc
 * (L − entrejambe − SEAT_COMPRESSION) au-dessus du point d'assise (pubis ≈ appui sur la selle).
 */
export function legModel(rider: RiderMeasurements): LegModel {
  const H = rider.height * 10;
  const inseam = rider.inseam * 10;
  const trochAbovePubis = clamp(0.53 * H - inseam, 60, 140);
  const L = inseam + trochAbovePubis;
  const hipAboveSaddle = trochAbovePubis - SEAT_COMPRESSION;
  const footLength = footLengthFromShoeSize(rider.shoeSize);
  return {
    hipAboveSaddle,
    femur: (L * 0.245) / 0.53,
    shank: (L * 0.246) / 0.53,
    ankleHeight: (L * 0.039) / 0.53,
    footLength,
    // Talon -> malléole ≈ 0,2 Lp ; talon -> 1re tête métatarsienne ≈ 0,72 Lp (Winter) => ≈ 0,5 Lp.
    ankleToBall: 0.5 * footLength,
  };
}

/**
 * Position de la cheville pour un axe de pédale donné.
 * La tête du 1er métatarse est à `cleatFore` mm derrière l'axe (le long du pied), sur la semelle,
 * elle-même à `stack` mm au-dessus de l'axe. Le pied est incliné de `footAngle` (talon relevé).
 */
export function anklePosition(
  pedal: Vec2,
  leg: LegModel,
  footAngleDeg: number,
  cleatFore: number,
  stack = DEFAULT_SOLE_PEDAL_STACK,
): Vec2 {
  const a = deg2rad(footAngleDeg);
  const f = { x: Math.cos(a), y: -Math.sin(a) }; // direction talon -> orteils
  const n = { x: Math.sin(a), y: Math.cos(a) }; // normale vers le haut du pied
  const ballX = pedal.x + stack * n.x - cleatFore * f.x;
  const ballY = pedal.y + stack * n.y - cleatFore * f.y;
  return {
    x: ballX - leg.ankleToBall * f.x + leg.ankleHeight * n.x,
    y: ballY - leg.ankleToBall * f.y + leg.ankleHeight * n.y,
  };
}

export interface KneeSolution {
  knee: Vec2;
  /** Angle intérieur hanche-genou-cheville (180° = jambe tendue). */
  angle: number;
  /** false si la distance hanche-cheville dépasse fémur + tibia (jambe trop courte) : angle borné à 180°. */
  reachable: boolean;
}

/**
 * Position du genou = intersection des cercles (hanche, fémur) et (cheville, tibia),
 * solution choisie devant la ligne hanche-cheville (genou fléchi vers l'avant).
 * Angle via la loi des cosinus.
 */
export function solveKnee(hip: Vec2, ankle: Vec2, femur: number, shank: number): KneeSolution {
  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const d = Math.hypot(dx, dy);
  const reachable = d <= femur + shank && d >= Math.abs(femur - shank);
  const dc = clamp(d, Math.abs(femur - shank) + 1e-6, femur + shank - 1e-9);
  const a = (femur * femur - shank * shank + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, femur * femur - a * a));
  const ux = dx / d;
  const uy = dy / d;
  // Perpendiculaire orientée vers l'avant (la cheville est sous la hanche : u ≈ (0,-1) -> (1,0)).
  const px = -uy;
  const py = ux;
  const knee = { x: hip.x + a * ux + h * px, y: hip.y + a * uy + h * py };
  const cos = (femur * femur + shank * shank - dc * dc) / (2 * femur * shank);
  return { knee, angle: rad2deg(Math.acos(clamp(cos, -1, 1))), reachable };
}

/**
 * Point d'assise (où l'on mesure la hauteur de selle) pour une hauteur `h` (distance BB -> dessus de selle)
 * et un angle de tube de selle effectif `seatAngle` (°/horizontale).
 */
export function sitPoint(h: number, seatAngleDeg: number): Vec2 {
  const a = deg2rad(seatAngleDeg);
  return { x: -h * Math.cos(a), y: h * Math.sin(a) };
}

/** Centre de hanche à partir du point d'assise. */
export function hipFromSit(sit: Vec2, leg: LegModel): Vec2 {
  return { x: sit.x, y: sit.y + leg.hipAboveSaddle };
}

/**
 * Angle de genou au point mort bas (manivelle à 6 h, dans le prolongement vertical).
 * Référence de contrôle : Holmes, Pruitt & Whalen (1994), 25–35° de flexion => cible 140–150° ici.
 */
export function kneeAngleBDC(
  rider: RiderMeasurements,
  saddleHeight: number,
  seatAngleDeg: number,
  crankLength: number,
  cleatFore: number,
  stack = DEFAULT_SOLE_PEDAL_STACK,
): KneeSolution {
  const leg = legModel(rider);
  const hip = hipFromSit(sitPoint(saddleHeight, seatAngleDeg), leg);
  const ankle = anklePosition({ x: 0, y: -crankLength }, leg, FOOT_ANGLE_BDC, cleatFore, stack);
  return solveKnee(hip, ankle, leg.femur, leg.shank);
}

/**
 * KOPS (Knee Over Pedal Spindle, méthode classique de positionnement longitudinal, popularisée par
 * Keith Bontrager / LeMond) : manivelle horizontale avant, le repère antérieur du genou tombe
 * à l'aplomb de l'axe de pédale. Renvoie l'écart horizontal repère - axe (mm, + = genou devant).
 */
export function kopsOffset(
  rider: RiderMeasurements,
  saddleHeight: number,
  seatAngleDeg: number,
  crankLength: number,
  cleatFore: number,
  stack = DEFAULT_SOLE_PEDAL_STACK,
): number {
  const leg = legModel(rider);
  const hip = hipFromSit(sitPoint(saddleHeight, seatAngleDeg), leg);
  const pedal = { x: crankLength, y: 0 };
  const ankle = anklePosition(pedal, leg, FOOT_ANGLE_3OCLOCK, cleatFore, stack);
  const { knee } = solveKnee(hip, ankle, leg.femur, leg.shank);
  // Repère antérieur projeté perpendiculairement au tibia, vers l'avant.
  const tx = ankle.x - knee.x;
  const ty = ankle.y - knee.y;
  const t = Math.hypot(tx, ty);
  const forward = { x: -ty / t, y: tx / t };
  const fx = forward.x >= 0 ? forward.x : -forward.x;
  return knee.x + KOPS_PATELLA_OFFSET * fx - pedal.x;
}

/** Bissection générique sur une fonction monotone. */
export function bisect(f: (x: number) => number, lo: number, hi: number, iterations = 60): number {
  let a = lo;
  let b = hi;
  const fa = f(a);
  for (let i = 0; i < iterations; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (Math.sign(fm) === Math.sign(fa)) a = m;
    else b = m;
  }
  return (a + b) / 2;
}
