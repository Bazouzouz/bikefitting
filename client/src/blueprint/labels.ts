/**
 * Placement des libellés de cotes sans chevauchement (fonctions pures, repère mathématique, y haut).
 *
 * Les textes sont en IBM Plex Mono : avance de 0,6 em par caractère, donc la boîte englobante
 * d'un libellé se calcule sans DOM. Chaque libellé a un point annoté (`at`) et des directions
 * préférées ; on essaie des positions candidates de plus en plus éloignées et on garde la première
 * qui ne touche ni un libellé déjà placé ni un obstacle (pièces du dessin), en restant dans le cadre.
 * Faute de place libre, on garde la position la moins pénalisée.
 */
import type { Bounds, Pt } from './geometry';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Dir = 'c' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface LabelSpec {
  id: string;
  lines: string[];
  tone?: 'ink' | 'ghost';
  /** Point annoté (milieu de la cote, pièce…). */
  at: Pt;
  /** Directions préférées, dans l'ordre (les autres sont essayées ensuite). */
  prefer: Dir[];
}

/** Obstacle : boîte ou disque. `owner` = id du libellé qu'il n'empêche pas (sa propre ligne de cote). */
export type Obstacle = ({ box: Box } | { circle: { c: Pt; r: number } }) & { owner?: string; weight?: number };

export interface PlacedLabel {
  spec: LabelSpec;
  /** Boîte occupée par le texte (repère mathématique). */
  box: Box;
  /** Abscisse du centre et ordonnée (écran) de la 1re ligne de base, prêtes pour <text>. */
  x: number;
  baseline: number;
  /** Trait de rappel vers `at` quand le libellé en est éloigné. */
  leader: [Pt, Pt] | null;
}

/** Métriques IBM Plex Mono (em). */
export const CHAR_EM = 0.6;
export const LINE_EM = 1.2;
const ASC_EM = 1.03;
const DESC_EM = 0.28;

/** Largeur et hauteur d'un libellé pour une taille de police `fs` (unités du dessin). */
export function labelSize(lines: string[], fs: number): { w: number; h: number } {
  const chars = Math.max(1, ...lines.map((l) => [...l].length));
  return {
    w: chars * CHAR_EM * fs,
    h: ((lines.length - 1) * LINE_EM + ASC_EM + DESC_EM) * fs,
  };
}

const DIRS: Record<Dir, Pt> = {
  c: { x: 0, y: 0 },
  n: { x: 0, y: 1 },
  s: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  w: { x: -1, y: 0 },
  ne: { x: 1, y: 1 },
  nw: { x: -1, y: 1 },
  se: { x: 1, y: -1 },
  sw: { x: -1, y: -1 },
};
const ALL: Dir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

export const boxArea = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
export function overlap(a: Box, b: Box): number {
  return boxArea({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
}
const inflate = (b: Box, m: number): Box => ({ x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m });

/** Boîte englobante de points (épaisseur minimale `pad`). */
export function boxOf(pts: Pt[], pad = 0): Box {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
}

export function hitsCircle(b: Box, c: Pt, r: number): boolean {
  const qx = Math.min(Math.max(c.x, b.x0), b.x1);
  const qy = Math.min(Math.max(c.y, b.y0), b.y1);
  return Math.hypot(qx - c.x, qy - c.y) < r;
}

function obstacleCost(b: Box, o: Obstacle): number {
  const w = o.weight ?? 1;
  if ('box' in o) return overlap(b, o.box) * w;
  return hitsCircle(b, o.circle.c, o.circle.r) ? boxArea(b) * 0.25 * w : 0;
}

/** Ramène une boîte dans le cadre (marge `m`). */
function clampBox(b: Box, bounds: Bounds, m: number): Box {
  let dx = 0;
  let dy = 0;
  if (b.x0 < bounds.minX + m) dx = bounds.minX + m - b.x0;
  else if (b.x1 > bounds.maxX - m) dx = bounds.maxX - m - b.x1;
  if (b.y0 < bounds.minY + m) dy = bounds.minY + m - b.y0;
  else if (b.y1 > bounds.maxY - m) dy = bounds.maxY - m - b.y1;
  return { x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy };
}

function nearestOnBox(b: Box, p: Pt): Pt {
  return { x: Math.min(Math.max(p.x, b.x0), b.x1), y: Math.min(Math.max(p.y, b.y0), b.y1) };
}

export interface LayoutOptions {
  fs: number;
  bounds: Bounds;
  obstacles?: Obstacle[];
  /** Écart minimal entre deux libellés (em). */
  gapEm?: number;
}

/** Place les libellés dans l'ordre donné (le premier est prioritaire). */
export function layoutLabels(specs: LabelSpec[], { fs, bounds, obstacles = [], gapEm = 0.45 }: LayoutOptions): PlacedLabel[] {
  const gap = gapEm * fs;
  const placed: PlacedLabel[] = [];
  for (const spec of specs) {
    const { w, h } = labelSize(spec.lines, fs);
    const order: Dir[] = [...spec.prefer, ...ALL.filter((d) => !spec.prefer.includes(d))];
    let best: { box: Box; cost: number } | null = null;
    outer: for (let k = 0; k < 10; k++) {
      const dist = gap + k * 0.8 * fs;
      for (const [rank, dir] of order.entries()) {
        if (dir === 'c' && k > 0) continue;
        const v = DIRS[dir];
        const cx = spec.at.x + v.x * (w / 2 + dist);
        const cy = spec.at.y + v.y * (h / 2 + dist);
        const box = clampBox({ x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 }, bounds, gap * 0.5);
        const padded = inflate(box, gap / 2);
        let cost = 0;
        for (const p of placed) cost += overlap(padded, inflate(p.box, gap / 2)) * 100;
        for (const o of obstacles) if (o.owner !== spec.id) cost += obstacleCost(box, o);
        if (cost === 0) {
          best = { box, cost };
          break outer;
        }
        // léger coût d'éloignement : à pénalité égale, on reste près du point annoté
        cost += (k * order.length + rank) * 1e-3;
        if (!best || cost < best.cost) best = { box, cost };
      }
    }
    const box = best!.box;
    const near = nearestOnBox(box, spec.at);
    const far = Math.hypot(near.x - spec.at.x, near.y - spec.at.y) > 1.6 * fs;
    placed.push({
      spec,
      box,
      x: (box.x0 + box.x1) / 2,
      baseline: -box.y1 + ASC_EM * fs,
      leader: far ? [spec.at, near] : null,
    });
  }
  return placed;
}

/** Paires de libellés qui se chevauchent (contrôle). */
export function overlaps(placed: PlacedLabel[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++)
      if (overlap(placed[i]!.box, placed[j]!.box) > 0) out.push([placed[i]!.spec.id, placed[j]!.spec.id]);
  return out;
}
