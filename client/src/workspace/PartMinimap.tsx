import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react';
import type { FitState } from '../components/useFit';
import { useStore } from '../components/store';
import { fmtNum, type Frame } from '../blueprint/geometry';
import { useReducedMotion } from '../motion/useReducedMotion';
import { SaddleExploded } from '../atelier/SaddleExploded';
import { CockpitExploded } from '../atelier/CockpitExploded';
import { OPEN_TOGGLE_MS } from '../atelier/Exploded';
import { saddleReadouts, simFromCurrent as saddleBase, SADDLE_STEP_LABEL } from '../atelier/saddle';
import { cockpitReadouts, simFromCurrent as cockpitBase, spacerMove, COCKPIT_STEP_LABEL, type CockpitSim } from '../atelier/cockpit';

/** Durées de la boucle (ms) : course de 0 à 1, puis pause sur la cible. */
export const MOVE_MS = 1200;
export const HOLD_MS = 800;

const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/** Valeur de t (0 à 1) à l'instant `ms` de la boucle : course, pause sur la cible, retour instantané à 0. */
export function loopT(ms: number): number {
  const m = ms % (MOVE_MS + HOLD_MS);
  return m < MOVE_MS ? easeInOutCubic(m / MOVE_MS) : 1;
}

/** Écart minimal rendu à l'écran : en dessous, le mouvement est amplifié (gain borné à 3) pour rester lisible. */
export const MIN_VISUAL_MM = 25;
export const MIN_VISUAL_DEG = 6;
export const MAX_GAIN = 3;

/** Gain visuel d'un écart : MIN / |delta| borné entre 1 et MAX_GAIN (1 sans écart). */
export function visualGain(delta: number, min: number): number {
  const a = Math.abs(delta);
  if (a < 1e-6) return 1;
  return Math.min(MAX_GAIN, Math.max(1, min / a));
}

const sgn = (v: number, dec = 0) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtNum(Math.abs(v), dec)}`;

export interface PartMinimapProps {
  part: 'saddle' | 'cockpit';
  state: FitState;
  /** Cadre de la taille (cockpit : lectures des temps). */
  frame: Frame;
  /** Réduite : pastille compacte (nom + valeur). */
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/** Réglage animé du temps en cours : libellé de l'en-tête, deltas passés à la vue 3D, état « déjà réglé » ou « validé ». */
interface Plan {
  step: string;
  name: string;
  value: string;
  /** Rien à régler : pas d'animation. */
  nil: boolean;
  /** La simulation du parcours a atteint la cible : t fixe à 1. */
  validated: boolean;
  /** Gain visuel appliqué aux deltas (1 = mouvement réel) ; le plus fort des gains en jeu. */
  gain: number;
  saddle?: { delta: number };
  cockpit?: { spacers?: number; stemLength?: number; stemAngle?: number; handlebarWidth?: number };
  base?: CockpitSim;
}

const NIL = 'Déjà dans la tolérance';

/**
 * Minimap 3D du composant zoomé (selle ou cockpit) : vue assemblée du temps en cours, qui rejoue en boucle le
 * réglage de la valeur actuelle à la cible. Le départ est le réglage actuel et l'écart se lit avec les mêmes
 * lectures que les parcours guidés (`saddleReadouts`, `cockpitReadouts`) ; le temps en cours vient du store.
 */
export function PartMinimap({ part, state, frame, collapsed, onToggleCollapsed }: PartMinimapProps): JSX.Element | null {
  const saddlePreview = useStore((s) => s.saddlePreview);
  const cockpitPreview = useStore((s) => s.cockpitPreview);
  const tilt0 = useStore((s) => s.saddleTilt);
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  // Agrandi : la minimap occupe toute la scène (sauf le bouton retour).
  const [large, setLarge] = useState(false);
  const noteId = useId();
  // Pause de la boucle pendant la bascule Éclater / Assembler : t figé jusqu'à `until` (ms, horloge rAF).
  const pause = useRef({ until: 0, t: 0 });
  const tRef = useRef(1);
  const { fit, current, size } = state;

  const plan = useMemo((): Plan | null => {
    if (part === 'saddle') {
      if (!saddlePreview) return null;
      const step = saddlePreview.step;
      const r = saddleReadouts(fit, current, saddleBase(current, tilt0))[step];
      const validated = saddleReadouts(fit, current, saddlePreview)[step].done;
      const nil = Number(r.gap.toFixed(r.dec)) === 0 || r.done;
      // Pas de gain sur une pose statique (rien à rejouer, ou temps validé) : la 3D montre la vraie position.
      const gain = nil || validated ? 1 : visualGain(r.gap, step === 'tilt' ? MIN_VISUAL_DEG : MIN_VISUAL_MM);
      // Le verbe porte le sens : valeur absolue (« Reculer 10 mm ») ; l'inclinaison garde son signe (« Bec +2° »).
      const v = step === 'tilt' ? `${sgn(r.gap, 1)}°` : `${fmtNum(Math.abs(r.gap), r.dec)} mm`;
      const verb = step === 'height' ? (r.gap > 0 ? 'Monter' : 'Descendre') : step === 'setback' ? (r.gap > 0 ? 'Reculer' : 'Avancer') : 'Bec';
      return { step, name: SADDLE_STEP_LABEL[step], value: nil ? NIL : `${verb} ${v}`, nil, validated, gain, saddle: { delta: r.gap * gain } };
    }
    if (!cockpitPreview) return null;
    const step = cockpitPreview.step;
    const base = cockpitBase(current, cockpitPreview.spacersAbove);
    const rd = cockpitReadouts(fit, current, base, frame)[step];
    const validated = cockpitReadouts(fit, current, cockpitPreview, frame)[step].done;
    const name = COCKPIT_STEP_LABEL[step];
    if (step === 'spacers') {
      const gap = Math.min(fit.spacers.value, spacerMove(base, fit.spacers.value).total) - base.spacers;
      const nil = Math.abs(gap) < 0.5 || rd.done;
      return { step, name, value: nil ? NIL : `${gap > 0 ? 'Monter' : 'Descendre'} ${fmtNum(Math.abs(gap), 0)} mm`, nil, validated, gain: 1, cockpit: { spacers: gap }, base };
    }
    if (step === 'stem') {
      const dl = fit.stemLength.value - base.stemLength;
      const da = fit.stemAngle.value - base.stemAngle;
      const nil = (Math.abs(dl) < 0.5 && Math.abs(da) < 0.5) || rd.done;
      const txt = [Math.abs(dl) >= 0.5 && `${sgn(dl)} mm`, Math.abs(da) >= 0.5 && `${sgn(da)}°`].filter(Boolean).join(' · ');
      // Gain par composante (longueur en mm, angle en °) ; l'en-tête annonce le plus fort.
      const gl = Math.abs(dl) >= 0.5 && !validated ? visualGain(dl, MIN_VISUAL_MM) : 1;
      const ga = Math.abs(da) >= 0.5 && !validated ? visualGain(da, MIN_VISUAL_DEG) : 1;
      const gain = nil ? 1 : Math.max(gl, ga);
      return { step, name, value: nil ? NIL : `Potence ${txt}`, nil, validated, gain, cockpit: { stemLength: dl * gl, stemAngle: da * ga }, base };
    }
    const gap = rd.lines[0]!.gap;
    const nil = Math.abs(gap) < 0.5 || rd.done;
    return { step, name, value: nil ? NIL : `Cintre ${sgn(gap)} mm`, nil, validated, gain: 1, cockpit: { handlebarWidth: gap }, base };
  }, [part, saddlePreview, cockpitPreview, tilt0, current, fit, frame]);

  // t : boucle rAF (course, pause, retour à 0) ; fixe à 1 si validé, en mouvement réduit ou réduite ; 0 sans écart à rejouer.
  const animates = !!plan && !plan.nil && !plan.validated && !reduce && !collapsed && !!(plan.saddle || plan.cockpit);
  const [t, setT] = useState(1);
  const key = plan ? `${part}|${plan.step}|${plan.value}` : '';
  // Avant affichage : pas d'image de l'état final avant le départ de la boucle.
  useLayoutEffect(() => {
    if (!animates) {
      setT(plan?.nil ? 0 : 1);
      return;
    }
    let raf = 0;
    let t0 = -1;
    let last = 0;
    const tick = (now: number) => {
      const p = pause.current;
      if (now < p.until) {
        // Figé sur la valeur courante pendant la bascule : l'horloge de la boucle est gelée (reprise sans saut).
        setT(p.t);
        if (t0 >= 0) t0 += now - last;
        last = now;
        raf = requestAnimationFrame(tick);
        return;
      }
      last = now;
      if (t0 < 0) t0 = now;
      const v = loopT(now - t0);
      tRef.current = v;
      setT(v);
      raf = requestAnimationFrame(tick);
    };
    pause.current.until = 0;
    tRef.current = 0;
    setT(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animates, key, plan?.nil]);

  // Échap en mode agrandi : revient à la taille normale sans dézoomer la scène. Stage écoute Échap sur document
  // (phase bulle) ; ce listener en phase capture passe avant et coupe la propagation, ce qui est sûr tant que
  // Stage reste en bulle. Il n'existe que pendant l'agrandi : hors de ce mode, Échap dézoome comme avant.
  const largeActive = large && !collapsed;
  useEffect(() => {
    if (!largeActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      setLarge(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [largeActive]);

  if (!plan) return null;

  const gainTxt = plan.gain > 1.05 ? `×${fmtNum(plan.gain, 1)}` : '';
  const toggleOpen = () => {
    if (animates) pause.current = { until: performance.now() + OPEN_TOGGLE_MS, t: tRef.current };
    setOpen((o) => !o);
  };

  if (collapsed) {
    return (
      <div className="stage-minimap is-collapsed" role="region" aria-label="Vue 3D du composant">
        <button type="button" className="btn small ghost stage-minimap-pill" aria-expanded={false} onClick={onToggleCollapsed}>
          <span className="smm-name">{plan.name}</span>
          <span className="smm-val">{plan.value}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`stage-minimap${large ? ' is-large' : ''}`} role="region" aria-label="Vue 3D du composant" aria-describedby={gainTxt ? noteId : undefined}>
      <div className="stage-minimap-head">
        <p className="smm-title">
          <span className="smm-name">{plan.name}</span>
          <span className="smm-val">{plan.value}</span>
          {gainTxt && <span className="smm-note" aria-hidden="true">mouvement {gainTxt}</span>}
        </p>
        {gainTxt && (
          <span id={noteId} className="sr-only">
            Mouvement amplifié {gainTxt} pour la lisibilité ; la valeur indiquée est la valeur réelle.
          </span>
        )}
        <div className="smm-actions">
          <button type="button" className="btn small ghost" aria-pressed={open} onClick={toggleOpen}>
            {open ? 'Assembler' : 'Éclater'}
          </button>
          <button type="button" className="btn small ghost" aria-pressed={large} aria-label="Agrandir la vue 3D" onClick={() => setLarge((l) => !l)}>
            ⤢
          </button>
          <button type="button" className="btn small ghost" aria-expanded={true} aria-label="Réduire la vue 3D" onClick={onToggleCollapsed}>
            −
          </button>
        </div>
      </div>
      <div className="stage-minimap-view">
        {part === 'saddle' ? (
          <SaddleExploded
            step={plan.step as 'height' | 'setback' | 'tilt'}
            staDeg={size.seatTubeAngle}
            open={open}
            adjust={plan.saddle ? { delta: plan.saddle.delta, t, from: tilt0 } : undefined}
            compact
          />
        ) : (
          <CockpitExploded
            step={plan.step as 'spacers' | 'stem' | 'bar'}
            htaDeg={size.headTubeAngle}
            stemLength={Math.round(plan.base!.stemLength)}
            stemAngle={Math.round(plan.base!.stemAngle)}
            spacers={plan.base!.spacers}
            spacersAbove={plan.base!.spacersAbove}
            handlebarWidth={plan.base!.handlebarWidth}
            open={open}
            adjust={plan.cockpit ? { ...plan.cockpit, t } : undefined}
            compact
          />
        )}
      </div>
    </div>
  );
}
