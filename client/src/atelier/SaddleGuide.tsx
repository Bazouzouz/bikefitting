import { useEffect, useId, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import type { FitState } from '../components/useFit';
import { useStore } from '../components/store';
import { fmtDelta, fmtNum } from '../blueprint/geometry';
import { useTween } from '../blueprint/useTween';
import { RAIL_ADJUST } from '../fit';
import { useReducedMotion } from '../motion/useReducedMotion';
import { useAnnounce } from '../workspace/PhasePanel';
import { saddleBounds } from '../workspace/setupSliders';
import { SaddleExploded } from './SaddleExploded';
import {
  coupledSetbackShift,
  fmtAngle,
  overridesFromSim,
  railsState,
  saddleReadouts,
  simFromCurrent,
  simWithHeight,
  simWithSetback,
  simWithTilt,
  SADDLE_STEPS,
  SADDLE_STEP_LABEL,
  TILT_MAX,
  TILT_MIN,
  TILT_STEP,
  type SaddleSim,
  type SaddleStep,
  type StepReadout,
} from './saddle';
import '../styles/saddle.css';

/** Durée d'ouverture / fermeture de la vue éclatée (suit exploded.css). */
const XP_MS = 700;

/** Contrôle d'un temps : bornes et pas du curseur, application à la simulation. */
interface Control {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  dec: number;
  value: number;
  apply: (v: number) => SaddleSim;
}

/** Durée du geste (« Montrer le geste »), easeOutCubic via useTween. */
export const GESTURE_MS = 1500;
/** Écart sous lequel le tween est considéré arrivé (le dernier pas de useTween peut différer d'un ulp). */
const GESTURE_EPS = 1e-6;

/** Valeur animée du temps → simulation : repart toujours de la simulation de départ (pas d'erreur cumulée du couplage). */
export function gestureSim(step: SaddleStep, start: SaddleSim, v: number, staDeg: number): SaddleSim {
  if (step === 'height') return simWithHeight(start, v, staDeg);
  if (step === 'setback') return simWithSetback(start, v);
  return simWithTilt(start, v);
}

/** Geste de l'animation, de `from` à `to` ; rend la valeur à chaque frame et prévient une seule fois à l'arrivée. */
function Gesture({ from, to, onValue, onDone }: { from: number; to: number; onValue: (v: number) => void; onDone: () => void }): null {
  const [goal, setGoal] = useState(from);
  useEffect(() => setGoal(to), [to]);
  const { v } = useTween({ v: goal }, GESTURE_MS);
  const done = useRef(false);
  const cb = useRef({ onValue, onDone });
  cb.current = { onValue, onDone }; // callbacks neufs à chaque rendu : hors dépendances, sinon boucle de rendu
  useEffect(() => {
    if (done.current) return;
    if (goal === to && Math.abs(v - to) < GESTURE_EPS) {
      done.current = true;
      cb.current.onDone();
    } else cb.current.onValue(v);
  }, [v, goal, to]);
  return null;
}

const sgn = (v: number, dec: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtNum(Math.abs(v), dec)}`;

/** Écart nul à l'affichage : rien à régler. */
const isNil = (r: StepReadout) => Number(r.gap.toFixed(r.dec)) === 0;

/** Consigne d'écart (« Monter de 12 mm »), à partir de l'écart affiché cible − actuel. */
function gapText(r: StepReadout): string {
  const v = r.step === 'tilt' ? fmtAngle(Math.abs(r.gap), false) : fmtNum(Math.abs(r.gap), r.dec);
  if (r.step === 'height') return r.gap > 0 ? `Monter de ${v} mm` : `Descendre de ${v} mm`;
  // recul : + = plus de recul = reculer la selle
  if (r.step === 'setback') return r.gap > 0 ? `Reculer la selle de ${v} mm` : `Avancer la selle de ${v} mm`;
  return r.gap > 0 ? `Relever le bec de ${v}` : `Baisser le bec de ${v}`;
}

/**
 * Selle guidée en 3 temps (Hauteur → Recul → Inclinaison), dans le panneau quand la caméra cadre la selle.
 * Simulation locale (état du composant), publiée au store pour le calque selle de la scène ; « Enregistrer comme
 * réglage actuel » écrit la hauteur et le recul COUPLÉ dans les overrides. Valeurs : moteur et DeltaTable (buildRows).
 */
export function SaddleGuide({ state }: { state: FitState }): JSX.Element {
  const rider = useStore((s) => s.rider);
  const tilt0 = useStore((s) => s.saddleTilt);
  const setOverride = useStore((s) => s.setOverride);
  const setSaddleTilt = useStore((s) => s.setSaddleTilt);
  const setPreview = useStore((s) => s.setSaddlePreview);
  const reduce = useReducedMotion();
  const announce = useAnnounce();
  const uid = useId();
  const { fit, current, size } = state;
  const sta = size.seatTubeAngle;

  // Simulation : repart du réglage actuel à chaque changement de celui-ci (enregistrement, curseurs, taille).
  const base = useMemo(() => simFromCurrent(current, tilt0), [current, tilt0]);
  const [sim, setSim] = useState<SaddleSim>(base);
  const baseKey = `${base.height}|${base.setback}|${base.tilt}`;
  const lastBase = useRef(baseKey);
  useEffect(() => {
    if (lastBase.current === baseKey) return;
    lastBase.current = baseKey;
    setSim(base);
  }, [baseKey, base]);

  const [step, setStep] = useState<SaddleStep>('height');
  const i = SADDLE_STEPS.indexOf(step);

  // Scène : la selle simulée et le temps en cours (calque SaddleDims) ; rien hors du parcours.
  useEffect(() => {
    setPreview({ ...sim, step });
  }, [sim, step, setPreview]);
  useEffect(() => () => setPreview(null), [setPreview]);

  // Focus sur le titre du temps à chaque changement de temps (pas au montage : Stage le pose sur « Vue d'ensemble »).
  const titleRef = useRef<HTMLHeadingElement>(null);
  const prevStep = useRef(step);
  useEffect(() => {
    // Annonce à l'ouverture et à chaque changement de temps (jamais aux mouvements de curseur).
    announce(`Temps ${SADDLE_STEPS.indexOf(step) + 1} sur ${SADDLE_STEPS.length} · ${SADDLE_STEP_LABEL[step]}`);
    if (prevStep.current === step) return;
    prevStep.current = step;
    titleRef.current?.focus();
  }, [step, announce]);
  // Retour en vue d'ensemble (démontage) : la région ne garde pas l'ancien temps. Un changement de phase la réécrit ensuite.
  useEffect(() => () => announce("Vue d'ensemble"), [announce]);

  // Vue éclatée : montée fermée puis ouverte à la frame suivante (animation d'ouverture), démontée après la fermeture.
  // Mouvement réduit : montée ouverte, démontée tout de suite (rien ne bouge).
  const [xpShown, setXpShown] = useState(false);
  const [xpOpen, setXpOpen] = useState(false);
  const xpTimer = useRef({ raf: 0, t: 0 });
  useEffect(
    () => () => {
      cancelAnimationFrame(xpTimer.current.raf);
      window.clearTimeout(xpTimer.current.t);
    },
    [],
  );
  const toggleXp = () => {
    cancelAnimationFrame(xpTimer.current.raf);
    window.clearTimeout(xpTimer.current.t);
    if (xpOpen) {
      setXpOpen(false);
      if (reduce) setXpShown(false);
      else xpTimer.current.t = window.setTimeout(() => setXpShown(false), XP_MS);
      return;
    }
    setXpShown(true);
    if (reduce || xpShown) setXpOpen(true);
    else xpTimer.current.raf = requestAnimationFrame(() => requestAnimationFrame(() => setXpOpen(true)));
  };

  // Inclinaison : « Par défaut » tant que l'utilisateur n'a rien saisi (0° est la valeur de départ, pas un réglage fait).
  const [tiltTouched, setTiltTouched] = useState(false);
  const tiltDefault = !tiltTouched && sim.tilt === 0 && tilt0 === 0;
  const readouts = saddleReadouts(fit, current, sim);
  const r = readouts[step];
  const rDone = (k: SaddleStep) => readouts[k].done && !(k === 'tilt' && tiltDefault);
  /** Résumé court d'un temps (récapitulatif). */
  const stepLabel = (k: SaddleStep, rd: StepReadout) =>
    k === 'tilt' && tiltDefault ? `Par défaut (${fmtAngle(0, false)})` : isNil(rd) && k !== 'tilt' ? 'À la cible' : rDone(k) ? 'Réglé ✓' : fmtDelta(rd.gap, rd.unit, rd.dec);
  const stepDone = rDone(step);

  // « Montrer le geste » : anime la valeur du temps en cours vers sa cible (simulation de départ figée pendant le geste).
  // aria-disabled (pas disabled) : le bouton garde le focus pendant et après l'animation.
  const [gesture, setGesture] = useState<{ start: SaddleSim; from: number; to: number } | null>(null);
  useEffect(() => {
    setGesture(null);
  }, [step, baseKey]);

  // « Réglé » annoncé une fois, au passage à l'état réglé (pas à chaque cran de curseur, ni à l'arrivée sur un temps,
  // ni pendant le geste : il annonce « Selle à la cible » à son arrivée).
  const prevDone = useRef({ step, done: stepDone });
  useEffect(() => {
    const p = prevDone.current;
    prevDone.current = { step, done: stepDone };
    if (p.step !== step || p.done || !stepDone || gesture) return;
    announce('Réglé');
  }, [step, stepDone, gesture, announce]);
  const showGesture = () => {
    if (gesture || r.done) return;
    if (reduce) {
      setSim(gestureSim(step, sim, r.target, sta));
      announce('Selle à la cible');
      return;
    }
    setGesture({ start: sim, from: control.value, to: r.target });
  };
  const gestureStep = (v: number) => gesture && setSim(gestureSim(step, gesture.start, v, sta));
  const gestureEnd = () => {
    if (gesture) setSim(gestureSim(step, gesture.start, gesture.to, sta));
    setGesture(null);
    announce('Selle à la cible');
  };
  const rails = railsState(fit, sim, sta);
  const dirty = sim.height !== base.height || Math.abs(sim.setback - base.setback) >= 0.05 || sim.tilt !== base.tilt;

  const hb = saddleBounds(rider.inseam, sim.height);
  const control: Control =
    step === 'height'
      ? {
          label: 'Hauteur de selle',
          unit: 'mm',
          min: Math.min(hb.min, Math.floor(fit.saddleHeight.value - 40)),
          max: Math.max(hb.max, Math.ceil(fit.saddleHeight.value + 40)),
          step: 1,
          dec: 0,
          value: sim.height,
          apply: (v) => simWithHeight(sim, v, sta),
        }
      : step === 'setback'
        ? {
            label: 'Recul de selle',
            unit: 'mm',
            min: Math.min(-20, Math.floor(sim.setback)),
            max: Math.max(160, Math.ceil(sim.setback)),
            step: 1,
            dec: 0,
            value: sim.setback,
            apply: (v) => simWithSetback(sim, v),
          }
        : {
            label: 'Inclinaison du bec',
            unit: '°',
            min: TILT_MIN,
            max: TILT_MAX,
            step: TILT_STEP,
            dec: 1,
            value: sim.tilt,
            apply: (v) => simWithTilt(sim, v),
          };

  // Saisie numérique : brouillon, appliqué à la validation (Entrée, perte du focus) — sinon chaque frappe
  // intermédiaire (« 7 », « 73 »…) déclencherait le couplage hauteur → recul.
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [step]);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft.replace(',', '.'));
    setDraft(null);
    if (!Number.isFinite(v) || draft.trim() === '') return;
    const clamped = Math.min(control.max, Math.max(control.min, v));
    if (step === 'tilt') setTiltTouched(true);
    setSim(control.apply(clamped));
  };
  const onNumKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape' && draft !== null) {
      e.stopPropagation(); // Échap annule la saisie sans fermer le zoom (écouteur de Stage sur document)
      setDraft(null);
    }
  };

  const save = () => {
    setOverride(overridesFromSim(sim));
    setSaddleTilt(sim.tilt);
    setTiltTouched(true);
    announce('Réglage enregistré');
  };

  const dH = sim.height - base.height;
  const coupled = coupledSetbackShift(Math.abs(r.gap), sta);

  return (
    <section className="saddle-guide" aria-labelledby={`${uid}-t`}>
      <p className="eyebrow">Selle · réglage guidé</p>
      <ol className="sg-steps" aria-label="Récapitulatif des 3 temps">
        {SADDLE_STEPS.map((k, j) => {
          const rd = readouts[k];
          return (
            <li key={k}>
              <button
                type="button"
                className={`sg-step${rd.done ? ' is-done' : ''}`}
                aria-current={k === step ? 'step' : undefined}
                onClick={() => setStep(k)}
              >
                <span className="sg-step-n">{j + 1}</span>
                <span className="sg-step-l">{SADDLE_STEP_LABEL[k]}</span>
                <span className="sg-step-s">{stepLabel(k, rd)}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <h3 id={`${uid}-t`} ref={titleRef} tabIndex={-1} className="sg-title">
        {i + 1} sur {SADDLE_STEPS.length} · {SADDLE_STEP_LABEL[step]}
      </h3>

      <div className="readout sg-readout">
        <div className="cell">
          <p className="eyebrow">Actuel{dirty ? ' (simulé)' : ''}</p>
          <p className="v">
            {r.step === 'tilt' ? fmtAngle(r.current) : `${fmtNum(r.current, r.dec)} ${r.unit}`}
          </p>
        </div>
        <div className="cell t">
          <p className="eyebrow">Cible</p>
          <p className="v">
            {r.step === 'tilt' ? fmtAngle(r.target, false) : `${fmtNum(r.target, r.dec)} ${r.unit}`}
          </p>
        </div>
      </div>
      <p className="sg-gap">
        <span className="eyebrow">Écart</span>{' '}
        <span className={r.done ? 'sg-gap-v ok' : 'sg-gap-v'}>{fmtDelta(r.gap, r.unit, r.dec)}</span>{' '}
        <span className="sg-tol">tolérance {r.tolerance}</span>
      </p>
      <p className={stepDone || isNil(r) ? 'delta ok' : 'delta'}>
        {r.step === 'tilt' && tiltDefault ? `Par défaut (${fmtAngle(0, false)})` : isNil(r) ? 'Déjà à la cible' : r.done ? 'Réglé ✓' : gapText(r)}
      </p>

      <div className="sg-how">
        {step !== 'tilt' && isNil(r) && <p className="note">Déjà à la cible : rien à desserrer ni à déplacer.</p>}
        {step === 'height' && !isNil(r) && (
          <ol>
            <li>Desserre le collier de tige de selle.</li>
            <li>
              {r.gap >= 0 ? 'Monte' : 'Descends'} la tige de {fmtNum(Math.abs(r.gap))} mm le long du tube. Repère la position
              avec un ruban adhésif.
            </li>
            <li>Resserre au couple gravé sur le collier.</li>
          </ol>
        )}
        {step === 'setback' && !isNil(r) && (
          <ol>
            <li>Desserre la ou les vis du chariot sous la selle, sans les retirer.</li>
            <li>
              Fais glisser la selle sur ses rails de {fmtNum(Math.abs(r.gap))} mm {r.gap > 0 ? "vers l'arrière" : "vers l'avant"}.
              Garde l'inclinaison telle quelle.
            </li>
            <li>Reste dans la zone graduée des rails, puis resserre au couple gravé.</li>
          </ol>
        )}
        {step === 'tilt' && (
          <ol>
            <li>Avec les mêmes vis du chariot, bascule la selle.</li>
            <li>Pose un niveau du bec à l'arrière de la selle : bulle centrée ({fmtAngle(0, false)}), ou bec à peine plus bas (jusqu'à {fmtAngle(-2)}).</li>
            <li>Resserre au couple gravé, puis vérifie que le recul n'a pas bougé.</li>
          </ol>
        )}
        <p className="tool" aria-label="Outils">
          {step === 'height' ? (
            <>
              <span className="chip">Clé hexagonale 4 ou 5 mm</span>
              <span className="chip">Clé dynamométrique</span>
            </>
          ) : (
            <>
              <span className="chip">Clé hexagonale 5 ou 6 mm</span>
              {step === 'tilt' && <span className="chip">Niveau à bulle</span>}
              <span className="chip">Clé dynamométrique</span>
            </>
          )}
          <span className="chip">Couple : lire la valeur gravée</span>
        </p>
      </div>

      {step === 'height' && Math.abs(r.gap) >= 1 && (
        <p className="note">
          Tube de selle à {fmtNum(sta, 1)} ° : {r.gap > 0 ? 'monter' : 'descendre'} de {fmtNum(Math.abs(r.gap))} mm{' '}
          {r.gap > 0 ? 'recule' : 'avance'} aussi la pointe de {fmtNum(coupled, 1)} mm (ΔH × cos {fmtNum(sta, 1)} °). On le
          corrige au temps 2.
        </p>
      )}
      {step === 'height' && dH !== 0 && (
        <p className="sg-coupled">
          Recul couplé : {fmtNum(base.setback)} → {fmtNum(sim.setback, 1)} mm ({fmtDelta(sim.setback - base.setback, 'mm', 1)})
        </p>
      )}
      {step === 'setback' && (
        <>
          <p className="sg-coupled">
            Position sur les rails : {sgn(rails.current, 0)} mm, cible {sgn(rails.target, 0)} mm (course ±{RAIL_ADJUST} mm avec une
            tige droite).
          </p>
          {!rails.targetOk && (
            <div className="note sg-warn">
              {rails.engine.length > 0 ? (
                rails.engine.map((w) => <p key={w}>{w}</p>)
              ) : (
                <p>
                  La cible sort de la course des rails (±{RAIL_ADJUST} mm) : il faudrait une tige avec{' '}
                  {rails.target < 0 ? 'plus' : 'moins'} de recul.
                </p>
              )}
            </div>
          )}
          {rails.targetOk && !rails.currentOk && (
            <p className="note">
              La position actuelle déduite sort de la course des rails (±{RAIL_ADJUST} mm) : vérifie le recul mesuré, ou la
              tige est déjà à recul.
            </p>
          )}
        </>
      )}

      <details className="sg-why">
        <summary>Formule de la cible</summary>
        <p>{r.why}</p>
      </details>

      <div className="slider sg-control">
        <span className="slider-head">
          <label htmlFor={`${uid}-range`}>{control.label}</label>
          <span className="slider-val" aria-hidden="true">
            {step === 'tilt' ? fmtAngle(control.value) : `${fmtNum(control.value, control.dec)} ${control.unit}`}
          </span>
        </span>
        <div className="sg-inputs">
          <input
            id={`${uid}-range`}
            type="range"
            min={control.min}
            max={control.max}
            step={control.step}
            value={step === 'setback' ? Math.round(control.value) : control.value}
            aria-valuetext={step === 'tilt' ? fmtAngle(control.value) : `${fmtNum(control.value, control.dec)} ${control.unit}`}
            className={dirty ? 'touched' : ''}
            disabled={!!gesture}
            onChange={(e) => {
              if (step === 'tilt') setTiltTouched(true);
              setSim(control.apply(Number(e.target.value)));
            }}
          />
          <span className="sg-num">
            <input
              type="number"
              inputMode="decimal"
              aria-label={`${control.label} (${control.unit})`}
              min={control.min}
              max={control.max}
              step={control.step}
              value={draft ?? fmtNum(control.value, control.dec).replace(',', '.')}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!!gesture}
              onBlur={commit}
              onKeyDown={onNumKey}
            />
            <span aria-hidden="true">{control.unit}</span>
          </span>
        </div>
      </div>

      <div className="sg-row">
        <button
          type="button"
          className="btn small ghost"
          aria-disabled={gesture || r.done ? true : undefined}
          onClick={showGesture}
        >
          {gesture ? 'Geste en cours…' : 'Montrer le geste'}
        </button>
        {gesture && <Gesture key={`${step}|${gesture.from}|${gesture.to}`} from={gesture.from} to={gesture.to} onValue={gestureStep} onDone={gestureEnd} />}
        <button type="button" className="btn small ghost" aria-pressed={xpOpen} aria-controls={`${uid}-xp`} onClick={toggleXp}>
          {xpOpen ? "Fermer l'éclaté" : 'Vue éclatée'}
        </button>
      </div>
      <div id={`${uid}-xp`} className="sg-xp">
        {xpShown && <SaddleExploded step={step} staDeg={sta} open={xpOpen} />}
      </div>

      <div className="sg-nav">
        {i > 0 ? (
          <button type="button" className="btn small ghost" onClick={() => setStep(SADDLE_STEPS[i - 1]!)}>
            ← Retour
          </button>
        ) : (
          <span />
        )}
        {i < SADDLE_STEPS.length - 1 && (
          <button type="button" className="btn small primary" onClick={() => setStep(SADDLE_STEPS[i + 1]!)}>
            Étape suivante →
          </button>
        )}
      </div>

      <div className="sg-save">
        <button type="button" className="btn small" disabled={!dirty} onClick={save}>
          Enregistrer comme réglage actuel
        </button>
        {dirty && (
          <button type="button" className="btn small ghost" onClick={() => setSim(base)}>
            Annuler la simulation
          </button>
        )}
        <p className="hint">Écrit la hauteur et le recul couplé dans ton réglage actuel (tableau ci-dessous).</p>
      </div>
    </section>
  );
}
