/**
 * Géométrie pure du mode caméra (aucune dépendance au DOM ni à la caméra).
 *
 * Repère « monde » : mm, origine = axe de pédalier (BB), x vers l'avant du vélo,
 * y vers le haut. Repère « image » : px, origine en haut à gauche, x vers la
 * droite, y vers le bas (convention canvas / vidéo).
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** Sens du vélo dans l'image : +1 = l'avant du vélo est à droite, -1 = à gauche. */
export type ForwardSign = 1 | -1;

export interface Calibration {
  /** Position de l'axe de pédalier dans l'image (px). */
  originPx: Vec2;
  /** Échelle (px par mm). */
  pxPerMm: number;
  /**
   * Inclinaison de l'horizontale du monde dans l'image (rad), mesurée dans le
   * repère image (y vers le bas : un angle positif tourne dans le sens horaire à l'écran).
   */
  angleRad: number;
  forwardSign: ForwardSign;
}

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Vecteurs unitaires image correspondant à +x' (horizontale image du monde) et +y (haut). */
function basis(angleRad: number): { ex: Vec2; ey: Vec2 } {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return { ex: { x: c, y: s }, ey: { x: s, y: -c } };
}

/** Monde (mm) -> image (px). */
export function worldToPx(cal: Calibration, p: Vec2): Vec2 {
  const { ex, ey } = basis(cal.angleRad);
  const wx = cal.forwardSign * p.x;
  const k = cal.pxPerMm;
  return {
    x: cal.originPx.x + k * (wx * ex.x + p.y * ey.x),
    y: cal.originPx.y + k * (wx * ex.y + p.y * ey.y),
  };
}

/** Image (px) -> monde (mm). */
export function pxToWorld(cal: Calibration, p: Vec2): Vec2 {
  const { ex, ey } = basis(cal.angleRad);
  const d = scale(sub(p, cal.originPx), 1 / cal.pxPerMm);
  const wx = d.x * ex.x + d.y * ex.y;
  const wy = d.x * ey.x + d.y * ey.y;
  return { x: cal.forwardSign * wx, y: wy };
}

/** Normalise un angle dans ]-π, π]. */
export function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r <= -Math.PI) r += 2 * Math.PI;
  if (r > Math.PI) r -= 2 * Math.PI;
  return r;
}

// ---------------------------------------------------------------------------
// Marqueurs
// ---------------------------------------------------------------------------

/**
 * Coins d'un marqueur tels que renvoyés par js-aruco2 : ordre horaire à l'écran,
 * corners[0] = coin haut-gauche du marqueur imprimé (quelle que soit sa rotation).
 */
export type MarkerCorners = [Vec2, Vec2, Vec2, Vec2];

export function markerCenter(c: MarkerCorners): Vec2 {
  return {
    x: (c[0].x + c[1].x + c[2].x + c[3].x) / 4,
    y: (c[0].y + c[1].y + c[2].y + c[3].y) / 4,
  };
}

/** Longueur moyenne des 4 côtés (px). */
export function markerMeanSidePx(c: MarkerCorners): number {
  return (dist(c[0], c[1]) + dist(c[1], c[2]) + dist(c[2], c[3]) + dist(c[3], c[0])) / 4;
}

/**
 * Inclinaison du marqueur (rad, repère image) : moyenne des directions du bord
 * haut (0->1) et du bord bas (3->2).
 */
export function markerAngle(c: MarkerCorners): number {
  const top = sub(c[1], c[0]);
  const bottom = sub(c[2], c[3]);
  const v = add(top, bottom);
  return Math.atan2(v.y, v.x);
}

export interface MarkerCalibrationInput {
  /** Marqueur posé sur l'axe de pédalier (son centre = axe BB). */
  bb: MarkerCorners;
  /** Marqueur sous le bec de selle (optionnel pour la calibration). */
  saddle?: MarkerCorners;
  /** Côté du carré noir imprimé (mm). */
  markerSizeMm: number;
  /** true : on suppose la caméra de niveau (angle 0) au lieu de lire l'inclinaison des marqueurs. */
  assumeLevel: boolean;
  forwardSign: ForwardSign;
}

/** Calibration à partir des marqueurs : échelle = moyenne des côtés, angle = moyenne des inclinaisons. */
export function calibrationFromMarkers(input: MarkerCalibrationInput): Calibration {
  const markers = input.saddle ? [input.bb, input.saddle] : [input.bb];
  const meanSide = markers.reduce((s, m) => s + markerMeanSidePx(m), 0) / markers.length;
  let angleRad = 0;
  if (!input.assumeLevel) {
    // moyenne circulaire
    let sx = 0;
    let sy = 0;
    for (const m of markers) {
      const a = markerAngle(m);
      sx += Math.cos(a);
      sy += Math.sin(a);
    }
    angleRad = Math.atan2(sy, sx);
  }
  return {
    originPx: markerCenter(input.bb),
    pxPerMm: meanSide / input.markerSizeMm,
    angleRad,
    forwardSign: input.forwardSign,
  };
}

/**
 * Position du bec de selle déduite du marqueur de selle : le bord supérieur du
 * carré noir est aligné sous la pointe de selle, plus un décalage éventuel (mm).
 */
export function saddleNoseFromMarker(
  cal: Calibration,
  saddle: MarkerCorners,
  markerSizeMm: number,
  extraOffsetMm = 0,
): Vec2 {
  const c = pxToWorld(cal, markerCenter(saddle));
  return { x: c.x, y: c.y + markerSizeMm / 2 + extraOffsetMm };
}

/**
 * Devine le sens du vélo : la selle est derrière l'axe de pédalier. Renvoie null
 * si l'écart horizontal est trop faible pour conclure (recul quasi nul).
 */
export function guessForwardSign(bbPx: Vec2, saddlePx: Vec2, minDxPx = 20): ForwardSign | null {
  const dx = bbPx.x - saddlePx.x;
  if (Math.abs(dx) < minDxPx) return null;
  return dx > 0 ? 1 : -1;
}

// ---------------------------------------------------------------------------
// Calibration manuelle
// ---------------------------------------------------------------------------

export type ReferenceAxis = 'horizontal' | 'vertical' | 'none';

export interface ManualCalibrationInput {
  /** Deux points cliqués sur une longueur connue (px). */
  p1: Vec2;
  p2: Vec2;
  /** Distance réelle entre les deux points (mm). */
  distanceMm: number;
  /**
   * Orientation : 'horizontal' = la référence est horizontale dans le monde
   * (ex. axes de roues -> empattement), 'vertical' = verticale (ex. diamètre de
   * roue haut/bas), 'none' = on suppose la caméra de niveau (angle 0).
   */
  axis: ReferenceAxis;
  /** Axe de pédalier cliqué (px). */
  bbPx: Vec2;
  forwardSign: ForwardSign;
}

export function calibrationFromTwoPoints(input: ManualCalibrationInput): Calibration {
  const dPx = dist(input.p1, input.p2);
  if (!(input.distanceMm > 0) || dPx === 0) {
    throw new Error('Distance de référence invalide');
  }
  let angleRad = 0;
  const v = sub(input.p2, input.p1);
  if (input.axis === 'horizontal') {
    // ramène la direction dans ]-π/2, π/2] (le sens du clic ne compte pas)
    const a = Math.atan2(v.y, v.x);
    angleRad = wrapAngle(Math.abs(a) > Math.PI / 2 ? a + Math.PI : a);
  } else if (input.axis === 'vertical') {
    // la verticale du monde (vers le bas à l'écran) doit pointer selon (−sin a, cos a)
    const down = v.y >= 0 ? v : scale(v, -1);
    angleRad = Math.atan2(-down.x, down.y);
  }
  return {
    originPx: input.bbPx,
    pxPerMm: dPx / input.distanceMm,
    angleRad,
    forwardSign: input.forwardSign,
  };
}

// ---------------------------------------------------------------------------
// Écart selle
// ---------------------------------------------------------------------------

export interface SaddleError {
  /** Déplacement à faire le long de la tige de selle (mm, + = monter). */
  height: number;
  /** Déplacement horizontal sur les rails (mm, + = avancer). */
  fore: number;
  /** Écart brut cible - actuel dans le repère monde (mm). */
  delta: Vec2;
}

/**
 * Décompose l'écart (cible - actuel) en un mouvement le long de la tige de selle
 * (incliné de seatTubeAngle par rapport à l'horizontale, vers l'arrière en
 * montant) et un mouvement horizontal sur les rails.
 *
 * delta = h·u + s·(1, 0) avec u = (−cos θ, sin θ)  =>  h = dy / sin θ, s = dx + h·cos θ
 */
export function saddleError(current: Vec2, target: Vec2, seatTubeAngleDeg: number): SaddleError {
  const delta = sub(target, current);
  const th = (seatTubeAngleDeg * Math.PI) / 180;
  const sinT = Math.sin(th);
  const height = Math.abs(sinT) < 1e-6 ? 0 : delta.y / sinT;
  const fore = delta.x + height * Math.cos(th);
  return { height, fore, delta };
}

/** Point sur la tige de selle à une hauteur donnée (le long du tube) depuis le BB. */
export function seatTubePoint(lengthMm: number, seatTubeAngleDeg: number): Vec2 {
  const th = (seatTubeAngleDeg * Math.PI) / 180;
  return { x: -lengthMm * Math.cos(th), y: lengthMm * Math.sin(th) };
}
