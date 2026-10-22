import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent, type PointerEvent } from 'react';
import { useReducedMotion } from '../motion/useReducedMotion';
import { add3, fitBounds, gestureArc, paint, projectedBounds, type DrawBox, type Fit, type P2, type PaintItem, type Solid, type Vec3, type View } from './iso';
import type { Gesture } from './saddleParts';
import '../styles/exploded.css';

/** Pièce d'un éclaté : ce que dessine et légende le composant (SaddlePart, CockpitPart). */
export interface ExplodedPart {
  id: string;
  /** Libellé sur une ou deux lignes courtes (colonne en Plex Mono). */
  label: string[];
  /** Nom complet (description accessible). */
  name: string;
  solid: Solid;
  /** Décalage en vue éclatée (mm). */
  explode: Vec3;
}

/** État de référence du cadrage : pièces et translations de réglage éventuelles. */
export interface FrameState<P extends ExplodedPart> {
  parts: readonly P[];
  moves?: Readonly<Partial<Record<string, Vec3>>>;
}

export interface ExplodedProps<P extends ExplodedPart> {
  parts: P[];
  /** Pièces à manipuler au temps en cours (la première est la pièce clé : libellé du geste). */
  keys: readonly string[];
  /** Pièce qui porte la vis et son geste de serrage. */
  gesture: { part: string; gesture: Gesture };
  /** Points d'une pièce, fermée ou éclatée (cadrage constant). */
  points: (p: P, open: boolean) => readonly Vec3[];
  open: boolean;
  /** Titre du dessin (accessible). */
  title: string;
  /** Début de la description accessible, ex. « de la tige de selle » ou « du cockpit (potence, entretoises, cintre) ». */
  subject: string;
  /** Translation de réglage par pièce (mm, repère local), en vue assemblée comme éclatée (s'ajoute à `explode`). */
  moves?: Readonly<Partial<Record<string, Vec3>>>;
  /** Dessin seul (minimap) : ni libellés, ni lignes de rappel, ni barre de rotation ; le dessin prend toute la largeur. */
  compact?: boolean;
  /** Réglage animé de l'extérieur (rAF) : pas de transition CSS sur les pièces (bascule Éclater / Assembler animée en JS, voir OPEN_TOGGLE_MS). */
  adjusting?: boolean;
  /**
   * États de référence du cadrage et de l'ordre des libellés (le premier), d'identité stable (mémoïsés par le parent) :
   * ex. début et fin du réglage. Le cadrage ne suit alors pas `parts`/`moves` à chaque image (pas de zoom ni de saut).
   * Absent : `[{ parts }]`.
   */
  frameStates?: readonly FrameState<P>[];
}

/** Vue par défaut : 3/4 avant-droit. */
export const DEFAULT_VIEW: View = { az: 35, el: 25 };
/** Débattement de la rotation autour de la vue par défaut (°). */
const AZ_RANGE = 40;
const AZ_STEP = 10;
/** Degrés par pixel de glisser. */
const DRAG_DEG_PER_PX = 0.4;
/** Ouverture : durée et décalage entre pièces (doivent suivre exploded.css). */
const OPEN_MS = 700;
const STAGGER_MS = 40;
const ROTATE_MS = 260;
/**
 * Durée maximale (ms) d'une bascule Éclater / Assembler animée en JS (compact ou réglage animé) : ouverture + décalage
 * de 10 pièces au plus (au-delà, le décalage est resserré pour tenir dans cette durée). La minimap met sa boucle en
 * pause pendant ce temps.
 */
export const OPEN_TOGGLE_MS = OPEN_MS + STAGGER_MS * 10;
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Ouverture en cours par pièce (0 : assemblé, 1 : éclaté). */
type OpenAmount = Record<string, number>;

/*
 * Cadre du dessin (unités du viewBox ; ratio constant). À 390 px la scène fait ≈ 320 px de large : 1 unité ≈ 1 px,
 * libellés ≥ 11 px. Colonne de 16 caractères Plex Mono au plus (avance 0,6 em) : libellés courts.
 */
const VB_W = 320;
/**
 * Hauteur maximale ; la hauteur réelle suit le contenu, arrondie par pas de VB_H_STEP pour rester fixe quand les
 * cotes bougent un peu (potence réglée dans le panneau : pas de saut de mise en page).
 */
const VB_H = 420;
const DRAW = { x0: 6, x1: 192, y0: 12, y1: VB_H - 12 };
/** Zone de dessin sans colonne de libellés (compact) : toute la largeur. */
const DRAW_COMPACT = { ...DRAW, x1: VB_W - 6 };
const VB_H_STEP = 40;
/** Écart de référence entre libellés pour dimensionner la hauteur. */
const GAP_REF = 10;
const COL_X = 206;
const FS = 11.5;
const LINE_H = 14;
/** Écart entre libellés (min, max). */
const GAP = [6, 3 * LINE_H] as const;

/** Marge (mm) autour du dessin, pour la flèche de geste. */
const MARGIN = 16;

/** Cadre fixe d'un éclaté : hauteur du viewBox, zone de dessin, échelle plafond (vue par défaut). */
export interface FrameLayout {
  vbH: number;
  y1: number;
  box: DrawBox;
  kMax: number;
}

/**
 * Cadre fixe pendant la rotation : la hauteur du viewBox couvre le dessin sur tout le débattement (union des
 * bornes) et la colonne de libellés (`labelLines` lignes, `nParts` blocs) ; ratio constant, pas de saut de mise en page.
 * `pts` : points de toutes les pièces, fermées ET éclatées (pas de changement d'échelle à l'ouverture).
 */
export function frameLayout(pts: readonly Vec3[], labelLines: number, nParts: number, compact = false): FrameLayout {
  const draw = compact ? DRAW_COMPACT : DRAW;
  let b = projectedBounds(pts, DEFAULT_VIEW);
  for (let a = DEFAULT_VIEW.az - AZ_RANGE; a <= DEFAULT_VIEW.az + AZ_RANGE; a += 5) {
    const q = projectedBounds(pts, { az: a, el: DEFAULT_VIEW.el });
    b = {
      minX: Math.min(b.minX, q.minX),
      maxX: Math.max(b.maxX, q.maxX),
      minY: Math.min(b.minY, q.minY),
      maxY: Math.max(b.maxY, q.maxY),
    };
  }
  const h = b.maxY - b.minY + 2 * MARGIN;
  const k = fitBounds(b, draw, MARGIN).k;
  // Hauteur : dessin ou colonne de libellés (absente en compact), la plus grande des deux.
  const colH = compact ? 0 : labelLines * LINE_H + (nParts - 1) * GAP_REF;
  const vbH = Math.min(VB_H, Math.ceil((Math.max(h * k, colH) + DRAW.y0 + (VB_H - DRAW.y1)) / VB_H_STEP) * VB_H_STEP);
  const y1 = vbH - (VB_H - DRAW.y1);
  const box = { x0: draw.x0, x1: draw.x1, y0: draw.y0, y1 };
  // Plafond : échelle de la vue par défaut (le dessin ne grossit pas quand on tourne vers un profil plus étroit).
  return { vbH, y1, box, kMax: fitBounds(projectedBounds(pts, DEFAULT_VIEW), box, MARGIN).k };
}

/**
 * Cadrage à l'azimut `az` : dessin recentré et, si besoin, réduit pour tenir dans la zone (jamais plus grand que
 * la vue par défaut). Continu en azimut : la rotation animée suffit à adoucir le recadrage.
 */
export function frameAt(layout: FrameLayout, pts: readonly Vec3[], az: number): Fit {
  return fitBounds(projectedBounds(pts, { az, el: DEFAULT_VIEW.el }), layout.box, MARGIN, layout.kMax);
}

/** Ratio l/h borné du viewBox compact : hauteur de fenêtre stable (ni bandeau trop plat, ni colonne trop haute). */
const COMPACT_RATIO = [0.8, 1.4] as const;
/** Part de la zone occupée par le dessin en compact (le reste : marge égale de chaque côté). */
const COMPACT_FILL = 0.85;
/** Marge (mm) autour du dessin en compact : juste la flèche de geste. */
const COMPACT_MARGIN = 6;

/**
 * Cadre compact : le viewBox épouse le ratio du dessin assemblé (vue par défaut, `closedPts` = début et fin du
 * réglage), borné par COMPACT_RATIO, et le dessin y occupe COMPACT_FILL. Ne dépend ni de l'azimut ni de `open`.
 */
export function compactLayout(closedPts: readonly Vec3[]): FrameLayout {
  const b = projectedBounds(closedPts, DEFAULT_VIEW);
  const r = (b.maxX - b.minX + 2 * COMPACT_MARGIN) / (b.maxY - b.minY + 2 * COMPACT_MARGIN);
  const ratio = Math.min(COMPACT_RATIO[1], Math.max(COMPACT_RATIO[0], r));
  const vbH = Math.round(VB_W / ratio / 10) * 10;
  const px = (VB_W * (1 - COMPACT_FILL)) / 2;
  const py = (vbH * (1 - COMPACT_FILL)) / 2;
  const box = { x0: px, x1: VB_W - px, y0: py, y1: vbH - py };
  return { vbH, y1: box.y1, box, kMax: Infinity };
}

/** Cadrage compact à l'azimut `az` sur les points de l'état affiché (assemblé ou éclaté) : serré, sans plafond. */
export function compactFrameAt(layout: FrameLayout, pts: readonly Vec3[], az: number): Fit {
  return fitBounds(projectedBounds(pts, { az, el: DEFAULT_VIEW.el }), layout.box, COMPACT_MARGIN);
}

const COMPACT_NO_FIT: Fit = { k: 1, ox: 0, oy: 0 };
const clampAz = (az: number) => Math.min(DEFAULT_VIEW.az + AZ_RANGE, Math.max(DEFAULT_VIEW.az - AZ_RANGE, az));
const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
/** Somme de deux décalages facultatifs. */
const plus = (a?: Vec3, b?: Vec3): Vec3 | undefined => (a && b ? add3(a, b) : (a ?? b));

/** Lignes ajoutées sous le libellé de la pièce clé (geste). */
const GESTURE_LINES = ['↳ serrer, lire', 'la valeur gravée'];

/** Les segments [a, b] et [c, d] se coupent, ou une extrémité frôle l'autre segment (< `tol`, unités du viewBox). */
function crosses(a: P2, b: P2, c: P2, d: P2, tol = 3): boolean {
  const o = (p: P2, q: P2, r: P2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return true;
  const dist = (p: P2, q: P2, r: P2) => {
    const l2 = (r.x - q.x) ** 2 + (r.y - q.y) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((p.x - q.x) * (r.x - q.x) + (p.y - q.y) * (r.y - q.y)) / l2));
    return Math.hypot(p.x - q.x - t * (r.x - q.x), p.y - q.y - t * (r.y - q.y));
  };
  // Les extrémités côté colonne (b, d) sont toujours séparées par l'écart des libellés : seules les ancres comptent.
  return dist(a, c, d) < tol || dist(c, a, b) < tol;
}

/** Ordonnée de la ligne de rappel sous le haut d'un libellé (milieu de ses lignes de nom, 2 au plus). */
const leadY = (labelLines: number) => LINE_H * Math.min(labelLines, 2) * 0.5;

/**
 * Colonne à pas régulier (y écran vers le bas), libellés dans l'ordre donné : écart constant entre blocs, choisi
 * pour suivre l'étendue des ancres (borné par GAP et par la hauteur dispo), puis colonne recalée au plus près
 * des ancres (moindres carrés sur `pivot`) et maintenue dans [top, bottom]. Renvoie le haut de chaque bloc.
 */
function evenColumn(items: { h: number; pivot: number; want: number }[], top: number, bottom: number): number[] {
  const n = items.length;
  if (n === 0) return [];
  const sumH = items.reduce((a, it) => a + it.h, 0);
  const free = bottom - top - sumH;
  let gap: number = GAP[0];
  if (n > 1) {
    // Écart qui aligne le premier et le dernier pivot sur leurs ancres.
    const first = items[0]!;
    const last = items[n - 1]!;
    const fit = (last.want - last.pivot - (first.want - first.pivot) - (sumH - last.h)) / (n - 1);
    gap = Math.max(GAP[0], Math.min(GAP[1], free / (n - 1), fit));
  }
  const rel: number[] = [];
  let acc = 0;
  for (const it of items) {
    rel.push(acc);
    acc += it.h + gap;
  }
  const total = acc - gap;
  const y0 = items.reduce((a, it, i) => a + it.want - it.pivot - rel[i]!, 0) / n;
  const start = Math.max(top, Math.min(bottom - total, y0));
  return rel.map((r) => start + r);
}

/**
 * Vue éclatée en axonométrie 3/4 (style blueprint), commune à la selle et au cockpit (SaddleExploded, CockpitExploded).
 * Pièces écartées le long de leur axe ; pièces clés du temps en orange, flèche du sens de serrage.
 * Glisser horizontal, ← → ou boutons : rotation de ±40° ; double-clic : vue par défaut.
 */
export function Exploded<P extends ExplodedPart>({
  parts,
  keys,
  gesture,
  points,
  open,
  title,
  subject,
  moves,
  compact = false,
  adjusting = false,
  frameStates,
}: ExplodedProps<P>): JSX.Element {
  const reduce = useReducedMotion();
  const uid = useId();
  const isKey = (id: string) => keys.includes(id);

  /* ---------- Azimut (rotation) ---------- */
  const [az, setAz] = useState(DEFAULT_VIEW.az);
  const azRef = useRef(az);
  azRef.current = az;
  const [rotating, setRotating] = useState(false);
  /* Deux boucles distinctes : animation de rotation (clavier, boutons) et regroupement des pointermove. */
  const tweenRaf = useRef(0);
  const dragRaf = useRef(0);
  /** Azimut visé (pas de 10° exacts même si on appuie vite). */
  const targetAz = useRef(az);
  const drag = useRef<{ x: number; az: number; id: number } | null>(null);
  const pending = useRef<number | null>(null);

  useEffect(
    () => () => {
      cancelAnimationFrame(tweenRaf.current);
      cancelAnimationFrame(dragRaf.current);
    },
    [],
  );

  const rotateTo = useCallback(
    (target: number) => {
      const to = clampAz(target);
      targetAz.current = to;
      cancelAnimationFrame(tweenRaf.current);
      tweenRaf.current = 0;
      if (reduce) {
        setAz(to);
        return;
      }
      const from = azRef.current;
      const t0 = performance.now();
      setRotating(true);
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / ROTATE_MS);
        const e = 1 - (1 - k) ** 3;
        setAz(from + (to - from) * e);
        if (k < 1) tweenRaf.current = requestAnimationFrame(tick);
        else {
          tweenRaf.current = 0;
          setRotating(false);
        }
      };
      tweenRaf.current = requestAnimationFrame(tick);
    },
    [reduce],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    cancelAnimationFrame(tweenRaf.current);
    tweenRaf.current = 0;
    drag.current = { x: e.clientX, az: azRef.current, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setRotating(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // Glisser vers la droite : l'objet tourne vers la droite (l'observateur passe vers l'arrière).
    pending.current = clampAz(d.az - (e.clientX - d.x) * DRAG_DEG_PER_PX);
    targetAz.current = pending.current;
    if (dragRaf.current) return;
    dragRaf.current = requestAnimationFrame(() => {
      dragRaf.current = 0;
      if (pending.current !== null) setAz(pending.current);
      pending.current = null;
    });
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    drag.current = null;
    setRotating(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') rotateTo(targetAz.current + AZ_STEP);
    else if (e.key === 'ArrowRight') rotateTo(targetAz.current - AZ_STEP);
    else if (e.key === 'Home') rotateTo(DEFAULT_VIEW.az);
    else return;
    e.preventDefault();
  };

  /* ---------- Tri peintre : suit l'état ouvert/fermé à la FIN de l'animation (pas de saut d'ordre en cours) ---------- */
  const [sortOpen, setSortOpen] = useState(open);
  // Lignes de rappel : fondu après le mouvement des pièces, mais pas au premier affichage.
  const lastOpen = useRef(open);
  const toggled = useRef(false);
  if (lastOpen.current !== open) {
    lastOpen.current = open;
    toggled.current = true;
  }
  /*
   * Bascule animée en JS (rAF) en compact ou pendant un réglage animé : la transition CSS n'y convient pas (cadrage
   * recalculé à chaque image en compact, translations relancées à chaque image du réglage). Chaque pièce s'ouvre
   * avec le même easing et le même décalage que la transition CSS ; en compact, le cadrage suit (voir plus bas).
   */
  const jsToggle = (compact || adjusting) && !reduce;
  const stagger = jsToggle && parts.length > 1 ? Math.min(STAGGER_MS, (OPEN_TOGGLE_MS - OPEN_MS) / (parts.length - 1)) : STAGGER_MS;
  const settleMs = OPEN_MS + stagger * (parts.length - 1);
  const [amount, setAmount] = useState<OpenAmount | null>(null);
  const amountRef = useRef(amount);
  amountRef.current = amount;
  const partsRef = useRef(parts);
  partsRef.current = parts;
  const prevOpen = useRef(open);
  // Avant affichage : pas d'image de l'état final au clic.
  useLayoutEffect(() => {
    if (prevOpen.current === open) return;
    prevOpen.current = open;
    if (!jsToggle) {
      setAmount(null);
      return;
    }
    const target = open ? 1 : 0;
    // Départ : état en cours (bascule interrompue) ou état opposé.
    const start: OpenAmount = amountRef.current ?? Object.fromEntries(partsRef.current.map((p) => [p.id, 1 - target]));
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const el = now - t0;
      if (el >= settleMs) {
        setAmount(null);
        return;
      }
      const next: OpenAmount = {};
      partsRef.current.forEach((p, i) => {
        const a = start[p.id] ?? 1 - target;
        next[p.id] = a + (target - a) * easeOutCubic(clamp01((el - i * stagger) / OPEN_MS));
      });
      setAmount(next);
      raf = requestAnimationFrame(tick);
    };
    setAmount(start);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Seule la bascule relance l'animation (pièces lues par ref, durée figée au clic).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    // Mouvement réduit : bascule instantanée, le tri suit tout de suite.
    if (reduce) {
      setSortOpen(open);
      return;
    }
    const t = window.setTimeout(() => setSortOpen(open), settleMs);
    return () => window.clearTimeout(t);
  }, [open, reduce, settleMs]);

  /*
   * ---------- Cadrage : viewBox fixe (union sur le débattement, ouvert et fermé, et sur les états de référence),
   * dessin recadré à l'azimut ----------
   */
  const ownStates = useMemo(() => [{ parts }], [parts]);
  const states: readonly FrameState<P>[] = frameStates ?? ownStates;
  const refParts = states[0]?.parts ?? parts;
  // Points par pièce et par état (translations de réglage incluses) : assemblé (c) et éclaté (o), même ordre de points.
  const piecePts = useMemo(
    () =>
      states.flatMap((s) =>
        s.parts.map((p) => {
          const m = s.moves?.[p.id];
          const at = (o: boolean) => (m ? points(p, o).map((q) => add3(q, m)) : points(p, o));
          return { id: p.id, c: at(false), o: at(true) };
        }),
      ),
    [states],
  );
  const closedPts = useMemo(() => piecePts.flatMap((q) => q.c), [piecePts]);
  const openPts = useMemo(() => piecePts.flatMap((q) => q.o), [piecePts]);
  // Cadrage normal : fermé ET éclaté (pas de changement d'échelle à l'ouverture). Compact : état affiché seul.
  const allPts = useMemo(() => (compact ? closedPts : [...closedPts, ...openPts]), [closedPts, openPts, compact]);
  const layout = useMemo(
    // Colonne de libellés avec les lignes du geste.
    () =>
      compact
        ? compactLayout(closedPts)
        : frameLayout(allPts, refParts.reduce((a, p) => a + p.label.length, GESTURE_LINES.length), refParts.length),
    [allPts, closedPts, refParts, compact],
  );
  /*
   * Compact : cadrage serré sur l'état affiché (viewBox commun : compactLayout ne dépend pas de `open`). Pendant la
   * bascule, il suit la position courante des pièces (même easing et même décalage) : passage continu du cadrage
   * assemblé au cadrage éclaté, sans saut d'échelle ni pièce qui sorte du cadre en cours de route.
   */
  const frame = useMemo(() => {
    if (!compact) return { ...layout, ...frameAt(layout, allPts, az) };
    let pts: readonly Vec3[];
    if (amount) {
      const cur: Vec3[] = [];
      for (const q of piecePts) {
        const m = amount[q.id] ?? (open ? 1 : 0);
        q.c.forEach((a, i) => {
          const b = q.o[i] ?? a;
          cur.push([a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m, a[2] + (b[2] - a[2]) * m]);
        });
      }
      pts = cur;
    } else pts = open ? openPts : closedPts;
    return { ...layout, ...compactFrameAt(layout, pts, az) };
  }, [layout, allPts, az, compact, amount, piecePts, open, openPts, closedPts]);
  // Inutilisé en compact (pas de libellés).
  const frame0: Fit = COMPACT_NO_FIT;
  const homeFrame = useMemo(() => (compact ? frame0 : frameAt(layout, allPts, DEFAULT_VIEW.az)), [layout, allPts, compact]);
  const toX = (f: Fit, p: P2) => f.ox + p.x * f.k;
  const toY = (f: Fit, p: P2) => f.oy - p.y * f.k;
  const X = (p: P2) => toX(frame, p);
  const Y = (p: P2) => toY(frame, p);

  /* ---------- Scène : recalculée seulement quand l'azimut change (rAF pendant la rotation) ---------- */
  const view: View = useMemo(() => ({ az, el: DEFAULT_VIEW.el }), [az]);
  // Tri peintre et translations : écart d'éclaté (si ouvert) + réglage, projetés par le même mécanisme.
  const scene = useMemo(
    () => paint(parts.map((p) => ({ id: p.id, solid: p.solid, offset: plus(sortOpen ? p.explode : undefined, moves?.[p.id]) })), view),
    [parts, view, sortOpen, moves],
  );
  const offsetsAt = useCallback(
    (o: boolean) => paint(parts.map((p) => ({ id: p.id, solid: { faces: [] }, offset: plus(o ? p.explode : undefined, moves?.[p.id]) })), view).offsets,
    [parts, view, moves],
  );
  const offsets = useMemo(() => {
    if (!amount) return offsetsAt(open);
    // Bascule JS : projection linéaire, l'écart projeté s'interpole entre assemblé et éclaté (réglage inclus des deux côtés).
    const c = offsetsAt(false);
    const o = offsetsAt(true);
    const out: Record<string, P2> = {};
    for (const id of Object.keys(o)) {
      const a = c[id] ?? { x: 0, y: 0 };
      const b = o[id]!;
      const m = amount[id] ?? (open ? 1 : 0);
      out[id] = { x: a.x + (b.x - a.x) * m, y: a.y + (b.y - a.y) * m };
    }
    return out;
  }, [offsetsAt, open, amount]);
  const shift = (id: string) => {
    const o = offsets[id];
    return o ? { dx: o.x * frame.k, dy: -o.y * frame.k } : { dx: 0, dy: 0 };
  };
  const partIndex = useMemo(() => Object.fromEntries(parts.map((p, i) => [p.id, i])), [parts]);

  /* ---------- Libellés : ancre = point visible le plus à droite de chaque pièce (décalage projeté), position cible ---------- */
  const anchorsOf = (items: PaintItem[], offs: Record<string, P2>, f: Fit) => {
    const anchors: Record<string, { x: number; y: number }> = {};
    for (const it of items) {
      if (it.kind !== 'face') continue;
      const o = offs[it.part];
      const dx = o ? o.x : 0;
      const dy = o ? o.y : 0;
      for (const p of it.pts) {
        const sx = toX(f, { x: p.x + dx, y: p.y + dy });
        const cur = anchors[it.part];
        if (!cur || sx > cur.x) anchors[it.part] = { x: sx, y: toY(f, { x: p.x + dx, y: p.y + dy }) };
      }
    }
    return anchors;
  };
  // Ordre de la colonne, figé (pas de permutation pendant la rotation) : hauteur des ancres en vue par défaut
  // éclatée (cadrage de la vue par défaut), puis déplacements qui réduisent les croisements de lignes de rappel.
  // Calculé sur le premier état de référence : ne suit pas un réglage animé. Inutile en compact.
  const key0 = keys[0];
  const labelOrder = useMemo(() => {
    if (compact) return refParts.map((p) => p.id);
    const r = paint(refParts.map((p) => ({ id: p.id, solid: p.solid, offset: p.explode })), DEFAULT_VIEW);
    const a = anchorsOf(r.items, r.offsets, homeFrame);
    const order = [...refParts].sort((p, q) => (a[p.id]?.y ?? 0) - (a[q.id]?.y ?? 0));
    const nLines = (p: P) => p.label.length + (p.id === key0 ? GESTURE_LINES.length : 0);
    const leads = () => {
      const tops = evenColumn(
        order.map((p) => ({ h: nLines(p) * LINE_H, pivot: leadY(p.label.length), want: a[p.id]?.y ?? 0 })),
        DRAW.y0,
        layout.y1,
      );
      return order.map((p, i) => [a[p.id] ?? { x: DRAW.x1, y: 0 }, { x: COL_X - 6, y: tops[i]! + leadY(p.label.length) }] as const);
    };
    const crossings = () => {
      const l = leads();
      let c = 0;
      for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) if (crosses(l[i]![0], l[i]![1], l[j]![0], l[j]![1])) c++;
      return c;
    };
    // Descente locale : un libellé est déplacé (vers n'importe quel rang) si les croisements diminuent, ou à coût
    // égal vers un ordre jamais visité (sortie des paliers) ; nombre de passes borné, meilleur ordre retenu.
    let cur = crossings();
    let best = { c: cur, order: [...order] };
    const seen = new Set([order.map((p) => p.id).join()]);
    for (let sweep = 0; sweep < 12 && best.c > 0; sweep++) {
      let moved = false;
      for (let i = 0; i < order.length && !moved; i++) {
        for (let j = 0; j < order.length && !moved; j++) {
          if (j === i) continue;
          const [m] = order.splice(i, 1);
          order.splice(j, 0, m!);
          const sig = order.map((p) => p.id).join();
          const c = crossings();
          if (c <= cur && !seen.has(sig)) {
            seen.add(sig);
            cur = c;
            moved = true;
            if (c < best.c) best = { c, order: [...order] };
          } else {
            order.splice(j, 1);
            order.splice(i, 0, m!);
          }
        }
      }
      if (!moved) break;
    }
    order.splice(0, order.length, ...best.order);
    return order.map((p) => p.id);
  }, [refParts, homeFrame, layout.y1, key0, compact]);
  const labels = useMemo(() => {
    if (compact) return [];
    const anchors = anchorsOf(scene.items, offsets, frame);
    const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
    const list = labelOrder.flatMap((id) => {
      const p = byId[id];
      if (!p) return [];
      const lines = isKey(p.id) && p.id === keys[0] ? [...p.label, ...GESTURE_LINES] : p.label;
      return [{ part: p, lines, anchor: anchors[p.id] ?? { x: DRAW.x1, y: frame.vbH / 2 } }];
    });
    const tops = evenColumn(
      list.map((l) => ({ h: l.lines.length * LINE_H, pivot: leadY(l.part.label.length), want: l.anchor.y })),
      DRAW.y0,
      frame.y1,
    );
    return list.map((l, i) => ({ ...l, top: tops[i]! }));
  }, [scene, offsets, frame, parts, keys, labelOrder, compact]);

  /* ---------- Flèche de geste (repère de la pièce qui porte la vis) ---------- */
  const arrow = useMemo(() => {
    const g = gesture.gesture;
    const pts = gestureArc(g.center, g.advance, g.radius, view, 30, 300).map((p) => ({ x: X(p), y: Y(p) }));
    const a = pts[pts.length - 2]!;
    const b = pts[pts.length - 1]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / l;
    const uy = (b.y - a.y) / l;
    const s = 8;
    const tip = { x: b.x + ux * s * 0.6, y: b.y + uy * s * 0.6 };
    const head = `M${f1(tip.x)} ${f1(tip.y)}L${f1(b.x - ux * s + -uy * s * 0.55)} ${f1(b.y - uy * s + ux * s * 0.55)}L${f1(b.x - ux * s + uy * s * 0.55)} ${f1(b.y - uy * s - ux * s * 0.55)}Z`;
    return { arc: 'M' + pts.map((p) => `${f1(p.x)} ${f1(p.y)}`).join('L'), head };
  }, [gesture, view, frame]);

  /* ---------- Description accessible : pièce clé en premier ---------- */
  const keyNames = parts.filter((p) => isKey(p.id)).map((p) => p.name);
  const otherNames = parts.filter((p) => !isKey(p.id)).map((p) => p.name);
  const desc =
    `Vue ${open ? 'éclatée' : 'assemblée'} ${subject}, en 3/4 avant-droit. ` +
    `Pièce à manipuler : ${keyNames.join(', ')} (flèche : sens de serrage ; lire la valeur gravée). ` +
    `Autres pièces : ${otherNames.join(', ')}.`;

  const partStyle = (id: string) => {
    const { dx, dy } = shift(id);
    return {
      transform: `translate(${f1(dx)}px, ${f1(dy)}px)`,
      ['--i' as string]: partIndex[id] ?? 0,
    };
  };
  const tone = (id: string) => (isKey(id) ? 'is-key' : 'is-dim');
  const seg = (e: [P2, P2][]) => e.map(([a, b]) => `M${f1(X(a))} ${f1(Y(a))}L${f1(X(b))} ${f1(Y(b))}`).join('');

  return (
    <figure
      className={
        // Réglage animé : translations directes (une transition relancée à chaque image figerait les pièces).
        `xp${rotating ? ' is-rotating' : ''}${open ? ' is-open' : ''}${compact ? ' is-compact' : ''}${adjusting ? ' is-adjusting' : ''}${amount ? ' is-toggling' : ''}`
      }
    >
      <div
        className="xp-stage"
        tabIndex={0}
        role="group"
        aria-label="Vue éclatée orientable : flèches gauche et droite pour tourner, double-clic pour revenir à la vue 3/4"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => rotateTo(DEFAULT_VIEW.az)}
        onKeyDown={onKeyDown}
      >
        <svg className="xp-svg" viewBox={`0 0 ${VB_W} ${frame.vbH}`} role="img" aria-labelledby={`${uid}-t ${uid}-d`}>
          <title id={`${uid}-t`}>{title}</title>
          <desc id={`${uid}-d`}>{desc}</desc>

          <g className="xp-parts">
            {scene.items.map((it) => {
              const cls = tone(it.part);
              const style = partStyle(it.part);
              if (it.kind === 'face') {
                const d = 'M' + it.pts.map((p) => `${f1(X(p))} ${f1(Y(p))}`).join('L') + 'Z';
                return (
                  <g key={it.key} className={`xp-part ${cls}`} style={style}>
                    <path className={`xp-f l${it.level}`} d={d} />
                    {it.edges.length > it.outline.length && (
                      <path className="xp-e" d={seg(it.outline.length ? it.edges.filter((e) => !it.outline.includes(e)) : it.edges)} />
                    )}
                    {it.outline.length > 0 && <path className="xp-o" d={seg(it.outline)} />}
                  </g>
                );
              }
              if (it.kind === 'mark') {
                return (
                  <path
                    key={it.key}
                    className={`xp-part xp-m ${cls}`}
                    style={style}
                    d={`M${f1(X(it.a))} ${f1(Y(it.a))}L${f1(X(it.b))} ${f1(Y(it.b))}`}
                  />
                );
              }
              return <path key={it.key} className={`xp-part xp-h ${cls}`} style={style} d={seg(it.edges)} />;
            })}
            <g className="xp-part xp-gesture" style={partStyle(gesture.part)} aria-hidden="true">
              <path className="xp-arc" d={arrow.arc} />
              <path className="xp-arrow" d={arrow.head} />
            </g>
          </g>

          {!compact && (
            <g key={open ? 'o' : 'c'} className="xp-leaders" style={{ ['--delay' as string]: `${toggled.current ? settleMs : 0}ms` }}>
              {labels.map((l) => {
                const midY = l.top + leadY(l.part.label.length);
                const key = isKey(l.part.id);
                const d = `M${f1(l.anchor.x + 2)} ${f1(l.anchor.y)}L${f1(COL_X - 6)} ${f1(midY)}L${f1(COL_X - 2)} ${f1(midY)}`;
                return (
                  <g key={l.part.id}>
                    <path className="xp-lead-case" d={d} />
                    <path className={`xp-lead${key ? ' is-key' : ''}`} d={d} />
                  </g>
                );
              })}
              {labels.map((l) => (
                <circle key={l.part.id} className={`xp-dot${isKey(l.part.id) ? ' is-key' : ''}`} cx={l.anchor.x + 2} cy={l.anchor.y} r={1.6} />
              ))}
            </g>
          )}

          {!compact && (
            <g className="xp-labels" aria-hidden="true">
              {labels.map((l) => {
                const key = isKey(l.part.id);
                return (
                  <text key={l.part.id} className={`xp-lbl${key ? ' is-key' : ''}`} x={COL_X} y={l.top + FS} fontSize={FS}>
                    {l.lines.map((s, i) => (
                      <tspan key={i} x={COL_X} dy={i === 0 ? 0 : LINE_H} className={i >= l.part.label.length ? 'xp-note' : undefined}>
                        {s}
                      </tspan>
                    ))}
                  </text>
                );
              })}
            </g>
          )}
        </svg>
      </div>

      {!compact && (
        <figcaption className="xp-bar">
          <button type="button" className="xp-btn" onClick={() => rotateTo(targetAz.current + AZ_STEP)} disabled={az >= DEFAULT_VIEW.az + AZ_RANGE - 0.01} aria-label="Tourner la vue vers la gauche de 10°">
            ↶
          </button>
          <button type="button" className="xp-btn xp-reset" onClick={() => rotateTo(DEFAULT_VIEW.az)} aria-label="Revenir à la vue 3/4 avant-droit">
            3/4
          </button>
          <button type="button" className="xp-btn" onClick={() => rotateTo(targetAz.current - AZ_STEP)} disabled={az <= DEFAULT_VIEW.az - AZ_RANGE + 0.01} aria-label="Tourner la vue vers la droite de 10°">
            ↷
          </button>
          <span className="xp-az">
            az {Math.round(az)}°
          </span>
        </figcaption>
      )}
    </figure>
  );
}
