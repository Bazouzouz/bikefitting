/**
 * Dessin du fantôme sur le canvas (couche fine, la logique est dans geometry/status/front).
 */
import type { Calibration, MarkerCorners, Vec2 } from './geometry';
import { seatTubePoint, worldToPx } from './geometry';

const NEUTRAL = '#3b82f6';

/** Silhouette de selle en mm, relative au bec (x avant, y haut). */
const SADDLE_SHAPE: Vec2[] = [
  { x: 0, y: 0 },
  { x: -25, y: 7 },
  { x: -130, y: 9 },
  { x: -235, y: 16 },
  { x: -268, y: 8 },
  { x: -262, y: -12 },
  { x: -150, y: -10 },
  { x: -30, y: -8 },
];

function lineWidth(cal: Calibration, mm: number, minPx = 2): number {
  return Math.max(minPx, mm * cal.pxPerMm);
}

export function drawLabel(ctx: CanvasRenderingContext2D, text: string, at: Vec2, color: string, sizePx: number) {
  ctx.font = `bold ${sizePx}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width;
  const pad = sizePx * 0.3;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(at.x - pad, at.y - sizePx - pad / 2, w + 2 * pad, sizePx + pad * 1.5);
  ctx.fillStyle = color;
  ctx.fillText(text, at.x, at.y);
}

export function drawArrow(ctx: CanvasRenderingContext2D, from: Vec2, to: Vec2, color: string, width: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  const ux = dx / len;
  const uy = dy / len;
  const head = Math.min(len * 0.5, width * 5);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x - ux * head, to.y - uy * head);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - ux * head - uy * head * 0.5, to.y - uy * head + ux * head * 0.5);
  ctx.lineTo(to.x - ux * head + uy * head * 0.5, to.y - uy * head - ux * head * 0.5);
  ctx.closePath();
  ctx.fill();
}

export interface ProfileGhost {
  cal: Calibration;
  saddleTarget: Vec2;
  saddleCurrent: Vec2 | null;
  saddleColor: string;
  hands: Vec2;
  seatTubeAngleDeg: number;
  targetSaddleHeight: number;
  messages: { text: string; color: string }[];
}

export function drawProfileGhost(ctx: CanvasRenderingContext2D, g: ProfileGhost) {
  const { cal } = g;
  const W = ctx.canvas.width;
  const font = Math.max(16, Math.round(W / 45));

  // axe du tube de selle (pointillé) jusqu'à la hauteur cible
  const bb = worldToPx(cal, { x: 0, y: 0 });
  const st = worldToPx(cal, seatTubePoint(g.targetSaddleHeight, g.seatTubeAngleDeg));
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bb.x, bb.y);
  ctx.lineTo(st.x, st.y);
  ctx.stroke();
  ctx.restore();

  // croix BB
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bb.x - 12, bb.y);
  ctx.lineTo(bb.x + 12, bb.y);
  ctx.moveTo(bb.x, bb.y - 12);
  ctx.lineTo(bb.x, bb.y + 12);
  ctx.stroke();

  // selle cible
  const poly = SADDLE_SHAPE.map((p) => worldToPx(cal, { x: g.saddleTarget.x + p.x, y: g.saddleTarget.y + p.y }));
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = g.saddleColor;
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = g.saddleColor;
  ctx.lineWidth = lineWidth(cal, 3);
  ctx.stroke();

  const tgt = worldToPx(cal, g.saddleTarget);
  ctx.fillStyle = g.saddleColor;
  ctx.beginPath();
  ctx.arc(tgt.x, tgt.y, lineWidth(cal, 4, 4), 0, Math.PI * 2);
  ctx.fill();

  if (g.saddleCurrent) {
    const cur = worldToPx(cal, g.saddleCurrent);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cur.x, cur.y, 6, 0, Math.PI * 2);
    ctx.stroke();
    drawArrow(ctx, cur, tgt, g.saddleColor, Math.max(3, font / 6));
  }

  // cocottes cible (non mesurées : couleur neutre)
  const h = worldToPx(cal, g.hands);
  const hoodBack = worldToPx(cal, { x: g.hands.x - 40, y: g.hands.y - 10 });
  const hoodFront = worldToPx(cal, { x: g.hands.x + 40, y: g.hands.y + 15 });
  ctx.strokeStyle = NEUTRAL;
  ctx.lineWidth = lineWidth(cal, 22, 4);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hoodBack.x, hoodBack.y);
  ctx.lineTo(hoodFront.x, hoodFront.y);
  ctx.stroke();
  ctx.lineCap = 'butt';
  drawLabel(ctx, 'Cocottes cible', { x: h.x + 12, y: h.y - 16 }, '#fff', Math.round(font * 0.7));

  // messages
  let y = font * 1.6;
  for (const m of g.messages) {
    drawLabel(ctx, m.text, { x: font * 0.8, y }, m.color, font);
    y += font * 1.6;
  }
}

export function drawMarkerOutline(ctx: CanvasRenderingContext2D, c: MarkerCorners, color: string, label: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  c.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(label, c[0].x, c[0].y - 6);
}

export function drawPoint(ctx: CanvasRenderingContext2D, p: Vec2, color: string, label?: string) {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (label) drawLabel(ctx, label, { x: p.x + 10, y: p.y - 10 }, '#fff', 14);
}

/** Guide de cadrage : profil (horizon + zone vélo) ou face (axe + silhouette). */
export function drawFramingGuide(ctx: CanvasRenderingContext2D, view: 'profile' | 'front') {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  ctx.setLineDash([12, 10]);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  if (view === 'profile') {
    // zone où doit tenir le vélo entier + ligne d'horizon au niveau des axes de roue
    ctx.strokeRect(W * 0.05, H * 0.12, W * 0.9, H * 0.8);
    ctx.beginPath();
    ctx.moveTo(W * 0.05, H * 0.72);
    ctx.lineTo(W * 0.95, H * 0.72);
    ctx.stroke();
  } else {
    // axe vertical du vélo + silhouette (tête, épaules, cintre, pieds)
    ctx.beginPath();
    ctx.moveTo(W / 2, H * 0.05);
    ctx.lineTo(W / 2, H * 0.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(W / 2, H * 0.14, H * 0.05, H * 0.065, 0, 0, Math.PI * 2);
    ctx.moveTo(W / 2 - H * 0.13, H * 0.26);
    ctx.lineTo(W / 2 + H * 0.13, H * 0.26);
    ctx.moveTo(W / 2 - H * 0.12, H * 0.42);
    ctx.lineTo(W / 2 + H * 0.12, H * 0.42);
    ctx.moveTo(W / 2 - H * 0.07, H * 0.9);
    ctx.lineTo(W / 2 + H * 0.07, H * 0.9);
    ctx.stroke();
  }
  ctx.restore();
}
