import type { BikeSize, BikeStyle } from '@bikefit/shared';
import { archetypeOf } from '../bike-styles';
import type { CurrentSetup, FitResult } from '../fit/types';
import { BAR_REACH_TO_HOODS, HEADSET_CAP, HOODS_RISE, STEM_HALF_STACK } from '../fit/cockpit';

/** Géométrie paramétrique du vélo. mm / degrés, origine = BB, x avant, y haut. */
export interface Pt {
  x: number;
  y: number;
}

export const rad = (d: number) => (d * Math.PI) / 180;
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const unit = (a: Pt): Pt => {
  const n = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / n, y: a.y / n };
};

const r1 = (n: number) => Math.round(n * 10) / 10;
/** Chemin SVG (y inversé) depuis des points en repère mathématique. */
export const pathD = (pts: Pt[], close = false) =>
  `M${pts.map((p) => `${r1(p.x)},${r1(-p.y)}`).join('L')}${close ? 'Z' : ''}`;

/** Cadre normalisé : tous les champs numériques (interpolables). */
export interface Frame extends Record<string, number> {
  stack: number;
  reach: number;
  sta: number;
  hta: number;
  cs: number;
  bbDrop: number;
  stl: number;
  htl: number;
  fork: number;
  offset: number;
}

/**
 * Normalise une taille : les cotes absentes sont prises dans l'archétype du style
 * (gravel par défaut, et repli gravel pour les styles pas encore dessinés).
 */
export function toFrame(s: BikeSize, style?: BikeStyle): Frame {
  const d = archetypeOf(style).frameDefaults(s.stack);
  return {
    stack: s.stack,
    reach: s.reach,
    sta: s.seatTubeAngle,
    hta: s.headTubeAngle,
    cs: s.chainstay,
    bbDrop: s.bbDrop ?? d.bbDrop,
    stl: s.seatTubeLength ?? d.seatTubeLength,
    htl: s.headTubeLength ?? d.headTubeLength,
    fork: s.forkLength ?? d.forkLength,
    offset: s.forkOffset ?? d.forkOffset,
  };
}

/** Composants réglables (posés sur le cadre). */
export interface Setup extends Record<string, number> {
  saddleHeight: number; // le long du tube de selle
  tipX: number; // x de la pointe de selle (négatif = derrière le BB)
  stemLength: number;
  stemAngle: number;
  spacers: number;
  handlebarWidth: number;
  crankLength: number;
  cleatFore: number;
}

export const setupFromCurrent = (c: CurrentSetup): Setup => ({
  saddleHeight: c.saddleHeight,
  tipX: -c.saddleSetback,
  stemLength: c.stemLength,
  stemAngle: c.stemAngle,
  spacers: c.spacers,
  handlebarWidth: c.handlebarWidth,
  crankLength: c.crankLength,
  cleatFore: c.cleatFore,
});

export const setupFromFit = (f: FitResult): Setup => ({
  saddleHeight: f.saddleHeight.value,
  tipX: -f.saddleSetback.value,
  stemLength: f.stemLength.value,
  stemAngle: f.stemAngle.value,
  spacers: f.spacers.value,
  handlebarWidth: f.handlebarWidth.value,
  crankLength: f.crankLength.value,
  cleatFore: f.cleatFore.value,
});

export const wheelRadius = (w: { bsd: number; tyreWidth: number }) => w.bsd / 2 + w.tyreWidth;

export function frameGeometry(fr: Frame, wheelR: number) {
  const h = rad(fr.hta);
  const a = rad(fr.sta);
  const down: Pt = { x: Math.cos(h), y: -Math.sin(h) }; // le long de l'axe de direction, vers le bas
  const up: Pt = mul(down, -1);
  const fwd: Pt = { x: Math.sin(h), y: Math.cos(h) }; // perpendiculaire avant
  const rearAxle: Pt = { x: -Math.sqrt(Math.max(0, fr.cs ** 2 - fr.bbDrop ** 2)), y: fr.bbDrop };
  const headTop: Pt = { x: fr.reach, y: fr.stack };
  const headBottom = add(headTop, mul(down, fr.htl));
  // Axe de roue avant : à la même hauteur que l'axe arrière (BB drop), décalé de `offset` de l'axe de direction.
  // L'empattement en découle (cohérent avec le catalogue) ; la longueur de fourche réelle = distance couronne → axe.
  const axleY = fr.bbDrop;
  const pY = axleY - fr.offset * Math.cos(h);
  const frontAxle: Pt = {
    x: headTop.x + (headTop.y - pY) / Math.tan(h) + fr.offset * Math.sin(h),
    y: axleY,
  };
  const seatDir: Pt = { x: -Math.cos(a), y: Math.sin(a) };
  const seatTop = mul(seatDir, fr.stl);
  const ground = Math.min(rearAxle.y, frontAxle.y) - wheelR;
  const wheelbase = frontAxle.x - rearAxle.x;
  const forkEnd: Pt = { x: frontAxle.x - fr.offset * Math.sin(h), y: pY };
  return { down, up, fwd, rearAxle, headTop, headBottom, frontAxle, forkEnd, seatDir, seatTop, ground, wheelR, wheelbase };
}
export type FrameGeom = ReturnType<typeof frameGeometry>;

/** Cockpit : mêmes constantes que le moteur (fit/cockpit.ts) pour que `hands` coïncide avec la cible. */
export function cockpit(g: FrameGeom, s: Setup) {
  const a = rad(s.stemAngle);
  const base = add(g.headTop, mul(g.up, HEADSET_CAP + s.spacers));
  const clampC = add(base, mul(g.up, STEM_HALF_STACK));
  const dir: Pt = {
    x: g.fwd.x * Math.cos(a) + g.up.x * Math.sin(a),
    y: g.fwd.y * Math.cos(a) + g.up.y * Math.sin(a),
  };
  const bar = add(clampC, mul(dir, s.stemLength));
  const hands: Pt = { x: bar.x + BAR_REACH_TO_HOODS, y: bar.y + HOODS_RISE };
  return { base, clampC, dir, bar, hands, stemTop: add(clampC, mul(g.up, STEM_HALF_STACK)) };
}

export const saddleTipY = (fr: Frame, s: Setup) => s.saddleHeight * Math.sin(rad(fr.sta));
export const seatPostTop = (fr: Frame, s: Setup): Pt => ({
  x: -s.saddleHeight * Math.cos(rad(fr.sta)),
  y: saddleTipY(fr, s),
});

export function fmtNum(n: number, dec = 0) {
  return n.toFixed(dec).replace('.', ',');
}
export function fmtDelta(d: number, unit = 'mm', dec = 0) {
  const eps = 0.5 * 10 ** -dec;
  if (Math.abs(d) < eps) return '±0';
  const s = d > 0 ? '+' : '−';
  return `${s}${fmtNum(Math.abs(d), dec)}${unit ? ' ' + unit : ''}`;
}

/** Cadre de dessin en repère mathématique (y haut). */
export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Union de plusieurs cadres. */
export function unionBounds(list: Bounds[]): Bounds {
  return list.reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  }));
}

/** Élargit le côté court autour du centre pour obtenir le ratio largeur / hauteur demandé (jamais de rognage). */
export function fitAspect(b: Bounds, ratio: number): Bounds {
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  if (w / h < ratio) {
    const nw = h * ratio;
    const cx = (b.minX + b.maxX) / 2;
    return { ...b, minX: cx - nw / 2, maxX: cx + nw / 2 };
  }
  const nh = w / ratio;
  const cy = (b.minY + b.maxY) / 2;
  return { ...b, minY: cy - nh / 2, maxY: cy + nh / 2 };
}

/** Traits de dessin d'un vélo : roue du vélo si connue, sinon valeurs de l'archétype du style. */
export interface Drawing {
  barFlare: number;
  tyreWidth: number;
  wheelBsd: number;
}
export function drawingFor(style: BikeStyle | undefined, wheel?: { bsd?: number; tyreWidth?: number }): Drawing {
  const d = archetypeOf(style).drawing;
  return {
    barFlare: d.barFlare,
    tyreWidth: wheel?.tyreWidth ?? d.tyreWidth,
    wheelBsd: wheel?.bsd ?? d.wheelBsd,
  };
}
