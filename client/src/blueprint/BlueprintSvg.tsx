import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { pathD, type Bounds, type Pt } from './geometry';
import { CHAR_EM, labelSize, layoutLabels, type Box, type LabelSpec, type Obstacle } from './labels';

export type { Bounds } from './geometry';

/** Taille du texte à l'écran (px) : constante quel que soit le zoom. */
const FONT_PX = 12;
const FONT_PX_NARROW = 11;

export interface Note {
  text: string;
  tone?: 'ink' | 'green';
}

/** Contexte du plan : taille de police en unités du dessin, zone visible, boîtes des notes. */
export interface BlueprintContext {
  fs: number;
  bounds: Bounds;
  /** Zone visible (viewBox), en repère mathématique, limitée au cadre. */
  visible: Bounds;
  noteBoxes: Box[];
}
const Ctx = createContext<BlueprintContext | null>(null);
export const useBlueprint = () => useContext(Ctx);

/**
 * Conteneur SVG « plan technique » : grille, taille de police constante à l'écran.
 *
 * `viewBox` (facultatif) : [x, y, largeur, hauteur] en coordonnées SVG (y vers le bas, donc
 * y = −maxY du repère mathématique). Le ratio du <svg> vient TOUJOURS de `bounds` : si le viewBox
 * fourni a un autre ratio, son côté court est élargi autour de son centre (aucun saut de hauteur).
 * `notes` : lignes de texte empilées dans le coin haut-gauche (infos sans cote).
 */
export function BlueprintSvg({
  bounds,
  children,
  label,
  notes = [],
  viewBox,
  className,
}: {
  bounds: Bounds;
  children: ReactNode;
  label: string;
  notes?: Note[];
  viewBox?: readonly [number, number, number, number];
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(600);
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.getBoundingClientRect().width || 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const bW = bounds.maxX - bounds.minX;
  const bH = bounds.maxY - bounds.minY;
  const ratio = bW / bH;
  // viewBox effectif, au ratio de bounds
  let [vx, vy, vw, vh] = viewBox ?? [bounds.minX, -bounds.maxY, bW, bH];
  if (viewBox) {
    if (vw / vh < ratio) {
      const nw = vh * ratio;
      vx -= (nw - vw) / 2;
      vw = nw;
    } else {
      const nh = vw / ratio;
      vy -= (nh - vh) / 2;
      vh = nh;
    }
  }
  const px = w < 480 ? FONT_PX_NARROW : FONT_PX;
  const fs = Math.max(14, (px * vw) / Math.max(w, 200));
  const visible: Bounds = {
    minX: Math.max(bounds.minX, vx),
    maxX: Math.min(bounds.maxX, vx + vw),
    minY: Math.max(bounds.minY, -(vy + vh)),
    maxY: Math.min(bounds.maxY, -vy),
  };
  const noteX = visible.minX + fs * 0.6;
  const noteY = (i: number) => -visible.maxY + fs * 1.5 * (i + 1);
  const noteKey = notes.map((n) => n.text).join('|');
  const ctx = useMemo<BlueprintContext>(
    () => ({
      fs,
      bounds,
      visible,
      noteBoxes: notes.map((n, i) => ({
        x0: noteX,
        x1: noteX + [...n.text].length * CHAR_EM * fs,
        y1: -noteY(i) + fs * 1.03,
        y0: -noteY(i) - fs * 0.28,
      })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fs, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, vx, vy, vw, vh, noteKey],
  );
  const gridBox: Pt[] = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];
  return (
    <svg
      ref={ref}
      className={className ? `blueprint ${className}` : 'blueprint'}
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      style={{ aspectRatio: `${bW} / ${bH}`, ['--fs' as string]: `${fs}px` }}
      role="img"
      aria-label={label}
    >
      <defs>
        <pattern id={`g${gid}`} width="100" height="100" patternUnits="userSpaceOnUse">
          <path d="M100,0H0V100" className="grid-minor" />
        </pattern>
        <pattern id={`G${gid}`} width="500" height="500" patternUnits="userSpaceOnUse">
          <path d="M500,0H0V500" className="grid-major" />
        </pattern>
      </defs>
      <path d={pathD(gridBox, true)} fill={`url(#g${gid})`} stroke="none" />
      <path d={pathD(gridBox, true)} fill={`url(#G${gid})`} stroke="none" />
      <Ctx.Provider value={ctx}>{children}</Ctx.Provider>
      {notes.map((n, i) => (
        <text key={i} x={noteX} y={noteY(i)} className={`dim-text note${n.tone === 'green' ? ' green ghost' : ''}`}>
          {n.text}
        </text>
      ))}
    </svg>
  );
}

/**
 * Cote : lignes d'attache + trait + tirets obliques, libellé facultatif (ancien placement, le long du trait).
 * Repère mathématique. Sans `label`, le libellé est placé par `<DimLabels>`.
 */
export function Dim({
  a,
  b,
  off,
  label,
  tone = 'ink',
}: {
  a: Pt;
  b: Pt;
  off: Pt;
  label?: string;
  tone?: 'ink' | 'green';
}) {
  const a2 = { x: a.x + off.x, y: a.y + off.y };
  const b2 = { x: b.x + off.x, y: b.y + off.y };
  const m = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
  let ang = (Math.atan2(-(b2.y - a2.y), b2.x - a2.x) * 180) / Math.PI;
  if (ang > 90 || ang < -90) ang += 180;
  const L = (p: Pt, q: Pt) => <line x1={p.x} y1={-p.y} x2={q.x} y2={-q.y} />;
  const tick = (p: Pt) => <line x1={p.x - 14} y1={-p.y + 14} x2={p.x + 14} y2={-p.y - 14} className="tick" />;
  const lines = label?.split('\n') ?? [];
  return (
    <g className={`dim dim-${tone}`}>
      <g className="ext">
        {L(a, a2)}
        {L(b, b2)}
      </g>
      <g className="thin">{L(a2, b2)}</g>
      {tick(a2)}
      {tick(b2)}
      {label && (
        <text transform={`translate(${m.x} ${-m.y}) rotate(${ang})`} textAnchor="middle" className="dim-text">
          {lines.map((t, i) => (
            <tspan key={i} x={0} dy={i === 0 ? `${-0.45 - (lines.length - 1) * 1.15}em` : '1.15em'}>
              {t}
            </tspan>
          ))}
        </text>
      )}
    </g>
  );
}

/** Segment d'une cote (a → b décalés de `off`), utile pour en faire un obstacle. */
export const dimSegment = (a: Pt, b: Pt, off: Pt): [Pt, Pt] => [
  { x: a.x + off.x, y: a.y + off.y },
  { x: b.x + off.x, y: b.y + off.y },
];

/**
 * Couche des libellés de cotes : placés ensemble (toutes couches confondues) sans chevauchement,
 * au-dessus du dessin (le halo `paint-order` masque les traits dessous).
 */
export function DimLabels({ specs, obstacles = [] }: { specs: LabelSpec[]; obstacles?: Obstacle[] }) {
  const ctx = useBlueprint();
  if (!ctx || specs.length === 0) return null;
  const all: Obstacle[] = [...obstacles, ...ctx.noteBoxes.map((box) => ({ box, weight: 50 }))];
  const placed = layoutLabels(specs, { fs: ctx.fs, bounds: ctx.visible, obstacles: all });
  return (
    <g className="dim-labels">
      {placed.map((p) => {
        const ghost = p.spec.tone === 'ghost';
        return (
          <g key={p.spec.id} className={ghost ? 'dim-label ghost' : 'dim-label'} data-label={p.spec.id}>
            {p.leader && (
              <line
                x1={p.leader[0].x}
                y1={-p.leader[0].y}
                x2={p.leader[1].x}
                y2={-p.leader[1].y}
                className="leader"
              />
            )}
            <text x={p.x} y={p.baseline} textAnchor="middle" className={ghost ? 'dim-text green ghost' : 'dim-text'}>
              {p.spec.lines.map((t, i) => (
                <tspan key={i} x={p.x} dy={i === 0 ? 0 : `${1.2}em`}>
                  {t}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export { labelSize };
