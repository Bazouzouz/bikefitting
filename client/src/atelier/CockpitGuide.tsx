import { useEffect, useId, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import type { FitState } from '../components/useFit';
import { useStore } from '../components/store';
import { useAnnounce } from '../workspace/PhasePanel';
import { styleOf } from '../bike-styles';
import { drawingFor, fmtDelta, fmtNum, setupFromCurrent, toFrame } from '../blueprint/geometry';
import { useTween } from '../blueprint/useTween';
import { useReducedMotion } from '../motion/useReducedMotion';
import { CockpitExploded } from './CockpitExploded';
import {
  barWidthOptions,
  cockpitReadouts,
  COCKPIT_STEPS,
  COCKPIT_STEP_LABEL,
  DEFAULT_SPACERS_ABOVE,
  dropReadout,
  hoodsShift,
  hoodsState,
  overridesFromSim,
  simFromCurrent,
  simWithBar,
  simWithSpacers,
  simWithSpacersAbove,
  simWithStem,
  snapTo,
  spacerMove,
  SPACERS_ABOVE_MAX,
  SPACER_STEP,
  stemAngleOptions,
  stemChange,
  stemLengthOptions,
  type CockpitLine,
  type CockpitSim,
  type CockpitStep,
} from './cockpit';
import '../styles/cockpit.css';

/** Durée d'ouverture / fermeture de la vue éclatée (suit exploded.css). */
const XP_MS = 700;
/** Durée du geste (« Montrer le geste »), easeOutCubic via useTween : même valeur que la selle. */
export const GESTURE_MS = 1500;
/** Écart sous lequel le tween est considéré arrivé (le dernier pas de useTween peut différer d'un ulp). */
const GESTURE_EPS = 1e-6;

/** Valeurs animées par le geste d'un temps. */
type GestureValues = Record<string, number>;

/**
 * Valeurs animées → simulation : repart toujours de la simulation de départ. Potence : interpolation continue
 * pendant le geste ; l'arrivée pose exactement les valeurs de la grille (cible du moteur).
 */
export function gestureSim(step: CockpitStep, start: CockpitSim, v: GestureValues): CockpitSim {
  if (step === 'spacers') return simWithSpacers(start, v.spacers ?? start.spacers);
  if (step === 'stem') return simWithStem(start, v.stemLength ?? start.stemLength, v.stemAngle ?? start.stemAngle);
  return simWithBar(start, v.handlebarWidth ?? start.handlebarWidth);
}

/** Geste de `from` à `to` ; rend les valeurs à chaque frame et prévient une seule fois à l'arrivée. */
function Gesture({ from, to, onValue, onDone }: { from: GestureValues; to: GestureValues; onValue: (v: GestureValues) => void; onDone: () => void }): null {
  const [goal, setGoal] = useState(from);
  const toKey = JSON.stringify(to);
  useEffect(() => setGoal(JSON.parse(toKey) as GestureValues), [toKey]);
  const v = useTween(goal, GESTURE_MS);
  const done = useRef(false);
  const cb = useRef({ onValue, onDone });
  cb.current = { onValue, onDone }; // callbacks neufs à chaque rendu : hors dépendances, sinon boucle de rendu
  useEffect(() => {
    if (done.current) return;
    const tgt = JSON.parse(toKey) as GestureValues;
    const arrived = JSON.stringify(goal) === toKey && Object.keys(tgt).every((k) => Math.abs((v[k] ?? 0) - tgt[k]!) < GESTURE_EPS);
    if (arrived) {
      done.current = true;
      cb.current.onDone();
    } else cb.current.onValue(v);
  }, [v, goal, toKey]);
  return null;
}

const sgn = (v: number, dec = 0) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtNum(Math.abs(v), dec)}`;
const fmtVal = (l: CockpitLine, v: number) => (l.unit === '°' ? `${sgn(v, l.dec)}°` : `${fmtNum(v, l.dec)} ${l.unit}`);

/** Consigne d'écart d'une ligne, à partir de l'écart affiché cible − actuel. */
function gapText(l: CockpitLine): string {
  const v = fmtNum(Math.abs(l.gap), l.dec);
  if (l.key === 'spacers') return l.gap > 0 ? `Monter la potence de ${v} mm` : `Descendre la potence de ${v} mm`;
  if (l.key === 'stemLength') return l.gap > 0 ? `Potence plus longue de ${v} mm` : `Potence plus courte de ${v} mm`;
  if (l.key === 'stemAngle') return l.gap > 0 ? `Potence plus relevée de ${v}°` : `Potence plus plongeante de ${v}°`;
  return l.gap > 0 ? `Cintre plus large de ${v} mm` : `Cintre plus étroit de ${v} mm`;
}

/** Curseur sur une grille discrète (indices), avec saisie numérique alignée sur la grille. */
interface GridControl {
  kind: 'grid';
  id: string;
  label: string;
  unit: string;
  options: number[];
  value: number;
  /** Valeur affichée (angle signé). */
  show: (v: number) => string;
  apply: (v: number) => CockpitSim;
}
/** Curseur continu (pas fixe). */
interface RangeControl {
  kind: 'range';
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  show: (v: number) => string;
  apply: (v: number) => CockpitSim;
}
type Control = GridControl | RangeControl;

/**
 * Cockpit guidé en 3 temps (Entretoises → Potence → Cintre), dans le panneau quand la caméra cadre le cockpit.
 * Simulation locale (état du composant), publiée au store pour le calque cockpit de la scène ; « Enregistrer comme
 * réglage actuel » écrit entretoises, potence et cintre dans les overrides. Valeurs : moteur et DeltaTable (buildRows).
 */
export function CockpitGuide({ state }: { state: FitState }): JSX.Element {
  const bike = useStore((s) => s.bike);
  const setOverride = useStore((s) => s.setOverride);
  const setPreview = useStore((s) => s.setCockpitPreview);
  const reduce = useReducedMotion();
  const uid = useId();
  const { fit, current, size } = state;
  const style = bike ? styleOf(bike) : undefined;
  const frame = useMemo(() => toFrame(size, style), [size, style]);
  const flare = drawingFor(style, bike?.wheel).barFlare;

  // Entretoises au-dessus de la potence : hors contrat du moteur, gardées ici (mesure de l'utilisateur).
  const [above0, setAbove0] = useState(DEFAULT_SPACERS_ABOVE);
  // Simulation : repart du réglage actuel à chaque changement de celui-ci (enregistrement, curseurs, taille).
  const base = useMemo(() => simFromCurrent(current, above0), [current, above0]);
  const [sim, setSim] = useState<CockpitSim>(base);
  const baseKey = `${base.spacers}|${base.spacersAbove}|${base.stemLength}|${base.stemAngle}|${base.handlebarWidth}`;
  const lastBase = useRef(baseKey);
  useEffect(() => {
    if (lastBase.current === baseKey) return;
    lastBase.current = baseKey;
    setSim(base);
  }, [baseKey, base]);

  const [step, setStep] = useState<CockpitStep>('spacers');
  const i = COCKPIT_STEPS.indexOf(step);

  // Scène : le cockpit simulé et le temps en cours (calque CockpitDims) ; rien hors du parcours.
  useEffect(() => {
    setPreview({ ...sim, step });
  }, [sim, step, setPreview]);
  useEffect(() => () => setPreview(null), [setPreview]);

  // Focus sur le titre du temps à chaque changement de temps (pas au montage : Stage le pose sur « Vue d'ensemble »).
  const titleRef = useRef<HTMLHeadingElement>(null);
  const announce = useAnnounce();
  const prevStep = useRef(step);
  useEffect(() => {
    // Annonce à l'ouverture et à chaque changement de temps (jamais aux mouvements de curseur).
    announce(`Temps ${COCKPIT_STEPS.indexOf(step) + 1} sur ${COCKPIT_STEPS.length} · ${COCKPIT_STEP_LABEL[step]}`);
    if (prevStep.current === step) return;
    prevStep.current = step;
    titleRef.current?.focus();
  }, [step, announce]);
  // Retour en vue d'ensemble (démontage) : la région ne garde pas l'ancien temps. Un changement de phase la réécrit ensuite.
  useEffect(() => () => announce("Vue d'ensemble"), [announce]);

  // Vue éclatée : montée fermée puis ouverte à la frame suivante, démontée après la fermeture ; mouvement réduit : direct.
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

  const readouts = cockpitReadouts(fit, current, sim, frame);
  const r = readouts[step];
  const hoods = hoodsState(fit, current, sim, frame);
  const drop = dropReadout(fit, current, sim, frame);
  const move = spacerMove(sim, fit.spacers.value);
  const change = stemChange(sim.stemLength, sim.stemAngle, fit.stemLength.value, fit.stemAngle.value);
  const dirty = baseKey !== `${sim.spacers}|${sim.spacersAbove}|${sim.stemLength}|${sim.stemAngle}|${sim.handlebarWidth}`;

  // Valeurs visées par le geste du temps en cours (entretoises bornées au pivot disponible).
  const goalOf = (k: CockpitStep): GestureValues =>
    k === 'spacers'
      ? { spacers: Math.min(fit.spacers.value, move.total) }
      : k === 'stem'
        ? { stemLength: fit.stemLength.value, stemAngle: fit.stemAngle.value }
        : { handlebarWidth: fit.handlebarWidth.value };
  const valuesOf = (k: CockpitStep, s: CockpitSim): GestureValues =>
    k === 'spacers' ? { spacers: s.spacers } : k === 'stem' ? { stemLength: s.stemLength, stemAngle: s.stemAngle } : { handlebarWidth: s.handlebarWidth };
  const atGoal = JSON.stringify(valuesOf(step, sim)) === JSON.stringify(goalOf(step));

  // « Montrer le geste » : anime le temps en cours vers sa cible ; aria-disabled (pas disabled) : le focus reste sur le bouton.
  const [gesture, setGesture] = useState<{ start: CockpitSim; from: GestureValues; to: GestureValues } | null>(null);
  useEffect(() => {
    setGesture(null);
  }, [step, baseKey]);
  const gestureOff = !!gesture || r.done || atGoal;
  const showGesture = () => {
    if (gestureOff) return;
    const to = goalOf(step);
    if (reduce) {
      setSim(gestureSim(step, sim, to));
      announce(`${COCKPIT_STEP_LABEL[step]} à la cible`);
      return;
    }
    setGesture({ start: sim, from: valuesOf(step, sim), to });
  };
  const gestureStep = (v: GestureValues) => gesture && setSim(gestureSim(step, gesture.start, v));
  const gestureEnd = () => {
    if (gesture) setSim(gestureSim(step, gesture.start, gesture.to));
    setGesture(null);
    announce(`${COCKPIT_STEP_LABEL[step]} à la cible`);
  };

  // Contrôles du temps en cours.
  const controls: Control[] =
    step === 'spacers'
      ? [
          {
            kind: 'range',
            id: `${uid}-sp`,
            label: 'Entretoises sous la potence',
            unit: 'mm',
            min: 0,
            max: move.total,
            step: SPACER_STEP,
            value: sim.spacers,
            show: (v) => `${fmtNum(v)} mm`,
            apply: (v) => simWithSpacers(sim, v),
          },
        ]
      : step === 'stem'
        ? [
            {
              kind: 'grid',
              id: `${uid}-sl`,
              label: 'Longueur de potence',
              unit: 'mm',
              options: stemLengthOptions(current.stemLength),
              value: sim.stemLength,
              show: (v) => `${fmtNum(v)} mm`,
              apply: (v) => simWithStem(sim, v, sim.stemAngle),
            },
            {
              kind: 'grid',
              id: `${uid}-sa`,
              label: 'Angle de potence',
              unit: '°',
              options: stemAngleOptions(current.stemAngle),
              value: sim.stemAngle,
              show: (v) => `${sgn(v)}°`,
              apply: (v) => simWithStem(sim, sim.stemLength, v),
            },
          ]
        : [
            {
              kind: 'grid',
              id: `${uid}-bw`,
              label: 'Largeur de cintre (c-c)',
              unit: 'mm',
              options: barWidthOptions(current.handlebarWidth),
              value: sim.handlebarWidth,
              show: (v) => `${fmtNum(v)} mm`,
              apply: (v) => simWithBar(sim, v),
            },
          ];

  // Saisie numérique : brouillon par champ, appliqué à la validation (Entrée, perte du focus), aligné sur la grille.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => setDrafts({}), [step]);
  const commit = (c: Control) => {
    const d = drafts[c.id];
    if (d === undefined) return;
    setDrafts((o) => {
      const { [c.id]: _, ...rest } = o;
      return rest;
    });
    const v = Number(d.replace(',', '.'));
    if (!Number.isFinite(v) || d.trim() === '') return;
    if (c.kind === 'grid') setSim(c.apply(snapTo(c.options, v)));
    else setSim(c.apply(Math.min(c.max, Math.max(c.min, Math.round(v / c.step) * c.step))));
  };
  const onNumKey = (c: Control) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(c);
    } else if (e.key === 'Escape' && drafts[c.id] !== undefined) {
      e.stopPropagation(); // Échap annule la saisie sans fermer le zoom (écouteur de Stage sur document)
      setDrafts((o) => {
        const { [c.id]: _, ...rest } = o;
        return rest;
      });
    }
  };

  // Entretoises au-dessus : mesure de l'utilisateur (change la longueur de pivot connue).
  const [aboveDraft, setAboveDraft] = useState<string | null>(null);
  const commitAbove = () => {
    if (aboveDraft === null) return;
    const v = Number(aboveDraft.replace(',', '.'));
    setAboveDraft(null);
    if (!Number.isFinite(v) || aboveDraft.trim() === '') return;
    setSim(simWithSpacersAbove(sim, Math.min(SPACERS_ABOVE_MAX, Math.max(0, Math.round(v)))));
  };

  const save = () => {
    setOverride(overridesFromSim(sim));
    setAbove0(sim.spacersAbove);
  };

  // Couplage : 5 mm d'entretoise déplacent les cocottes le long du pivot (vers le haut ET vers l'arrière).
  const per5 = hoodsShift(frame, setupFromCurrent(current), { spacers: current.spacers + SPACER_STEP });
  const hta = size.headTubeAngle;

  return (
    <section className="cockpit-guide" aria-labelledby={`${uid}-t`}>
      <p className="eyebrow">Cockpit · réglage guidé</p>
      <ol className="cg-steps" aria-label="Récapitulatif des 3 temps">
        {COCKPIT_STEPS.map((k, j) => {
          const rd = readouts[k];
          const first = rd.lines[0]!;
          return (
            <li key={k}>
              <button
                type="button"
                className={`cg-step${rd.done ? ' is-done' : ''}`}
                aria-current={k === step ? 'step' : undefined}
                onClick={() => setStep(k)}
              >
                <span className="cg-step-n">{j + 1}</span>
                <span className="cg-step-l">{COCKPIT_STEP_LABEL[k]}</span>
                <span className="cg-step-s">
                  {rd.done ? 'Réglé ✓' : rd.lines.map((l) => fmtDelta(l.gap, l.unit === '°' ? '°' : 'mm', l.dec).replace(' °', '°')).join(' · ') || first.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <h3 id={`${uid}-t`} ref={titleRef} tabIndex={-1} className="cg-title">
        {i + 1} sur {COCKPIT_STEPS.length} · {COCKPIT_STEP_LABEL[step]}
      </h3>

      {r.lines.map((l) => (
        <div key={l.key} className="cg-line">
          {r.lines.length > 1 && <p className="cg-line-l">{l.label}</p>}
          <div className="readout cg-readout">
            <div className="cell">
              <p className="eyebrow">Actuel{dirty ? ' (simulé)' : ''}</p>
              <p className="v">{fmtVal(l, l.current)}</p>
            </div>
            <div className="cell t">
              <p className="eyebrow">Cible</p>
              <p className="v">{fmtVal(l, l.target)}</p>
            </div>
          </div>
          <p className="cg-gap">
            <span className="eyebrow">Écart</span>{' '}
            <span className={Math.abs(l.gap) < 0.5 * 10 ** -l.dec ? 'cg-gap-v ok' : 'cg-gap-v'}>{fmtDelta(l.gap, l.unit, l.dec)}</span>
            {Math.abs(l.gap) >= 0.5 * 10 ** -l.dec && <span className="cg-tol">{gapText(l)}</span>}
          </p>
        </div>
      ))}
      <p className={r.done ? 'delta ok' : 'delta'}>
        {r.done
          ? 'Réglé ✓'
          : step === 'bar'
            ? `Hors plage ${r.tolerance}`
            : `Cocottes à ${fmtNum(r.shift ?? 0)} mm`}
      </p>
      <p className="cg-tol">
        {step === 'bar'
          ? `Tolérance ${r.tolerance} autour de la cible (plage du moteur).`
          : `Effet de ce seul temps sur les cocottes, les autres réglages à la cible ; tolérance ${r.tolerance} (fit.tolerances.reach).`}
      </p>

      <div className="cg-how">
        {step === 'spacers' && (
          <ol>
            <li>Desserre les 2 vis de pivot de la potence, puis retire la vis de compression et le capot.</li>
            <li>
              {Math.abs(move.delta) < 0.5
                ? 'Les entretoises sont déjà à la cible : rien à déplacer.'
                : move.delta < 0
                  ? `Soulève la potence et passe ${fmtNum(-move.delta)} mm d'entretoises du dessous au-dessus de la potence.`
                  : `Soulève la potence et passe ${fmtNum(Math.min(move.delta, sim.spacersAbove))} mm d'entretoises du dessus sous la potence.`}{' '}
              Le pivot ne s'allonge pas : on déplace les entretoises, on n'en ajoute pas.
            </li>
            <li>
              Remets potence et capot : vis de compression juste pour supprimer le jeu (précharge, pas de couple). Aligne la
              potence sur la roue avant, puis serre les vis de pivot en alternance au couple gravé.
            </li>
          </ol>
        )}
        {step === 'stem' && (
          <ol>
            <li>Tiens le cintre, desserre les vis de façade en croix et retire la façade.</li>
            <li>
              {change !== 'none' && r.done && 'Dans la tolérance : changement facultatif. '}
              {change === 'none'
                ? 'La potence est déjà celle de la cible.'
                : change === 'flip'
                  ? `Retourne la potence (${sgn(sim.stemAngle)}° → ${sgn(-sim.stemAngle)}°) : même pièce, pas d'achat.`
                  : `Remplace la potence par une ${fmtNum(fit.stemLength.value)} mm à ${sgn(fit.stemAngle.value)}° (longueurs ${stemLengthOptions()[0]}–${stemLengthOptions().at(-1)} mm par 10, angles ±6/±17°).`}{' '}
              Vis de pivot desserrées, capot retiré, comme au temps 1.
            </li>
            <li>Remonte : précharge au capot, alignement, vis de pivot au couple gravé, puis la façade en croix, jours égaux.</li>
          </ol>
        )}
        {step === 'bar' && (
          <ol>
            <li>Desserre les vis de façade en croix, retire la façade et le cintre (garde les cocottes en place sur le cintre).</li>
            <li>
              Pose un cintre de {fmtNum(fit.handlebarWidth.value)} mm c-c, centré sur ses graduations. Cintre gravel évasé
              (≈ {fmtNum(flare)}°) : la largeur se lit aux cocottes, les drops s'écartent davantage.
            </li>
            <li>Cocottes à la même hauteur, serre la façade en croix au couple gravé, jours égaux en haut et en bas.</li>
          </ol>
        )}
        <p className="tool" aria-label="Outils">
          <span className="chip">{step === 'bar' ? 'Clé hexagonale 4 ou 5 mm' : 'Clé hexagonale 4, 5 ou 6 mm'}</span>
          <span className="chip">Clé dynamométrique</span>
          {step !== 'bar' && <span className="chip">Capot : précharge seulement</span>}
          <span className="chip">Couple : lire la valeur gravée</span>
        </p>
      </div>

      {step === 'spacers' && (
        <>
          <p className="note">
            Pivot à {fmtNum(hta, 1)}° : {SPACER_STEP} mm d'entretoise sous la potence montent les cocottes de {fmtNum(per5.y, 1)} mm et
            les {per5.x < 0 ? 'reculent' : 'avancent'} de {fmtNum(Math.abs(per5.x), 1)} mm. On corrige le reach au temps 2.
          </p>
          <p className="cg-coupled">
            Pivot disponible : {fmtNum(move.total)} mm ({fmtNum(sim.spacers)} dessous + {fmtNum(sim.spacersAbove)} dessus).
          </p>
          {!move.feasible && (
            <p className="note cg-warn">
              Il manque {fmtNum(move.missing)} mm de pivot pour {fmtNum(fit.spacers.value)} mm d'entretoises : impossible sans
              pivot plus long. Compense au temps 2 avec une potence plus relevée (ou retournée).
            </p>
          )}
        </>
      )}
      <p className="cg-coupled">
        Cocottes simulées → cible : {hoods.done ? 'dans la tolérance' : `écart ${fmtNum(hoods.dist)} mm`} (
        {hoods.dx >= 0 ? 'avancer' : 'reculer'} {fmtNum(Math.abs(hoods.dx))} mm, {hoods.dy >= 0 ? 'monter' : 'descendre'}{' '}
        {fmtNum(Math.abs(hoods.dy))} mm ; tolérance ±{fit.tolerances.reach} mm).
      </p>
      {step === 'bar' && (
        <p className={drop.done ? 'cg-coupled ok' : 'cg-coupled'}>
          Drop selle → cocottes : {fmtNum(drop.current)} mm, cible {fmtNum(drop.target)} mm (plage {fmtNum(drop.range[0])} à{' '}
          {fmtNum(drop.range[1])} mm){drop.done ? ' ✓' : ''}.
        </p>
      )}

      <details className="cg-why">
        <summary>Formule de la cible</summary>
        <p>{r.why}</p>
      </details>

      {controls.map((c) => {
        const idx = c.kind === 'grid' ? c.options.indexOf(snapTo(c.options, c.value)) : 0;
        const draft = drafts[c.id];
        return (
          <div key={c.id} className="slider cg-control">
            <span className="slider-head">
              <label htmlFor={c.id}>{c.label}</label>
              <span className="slider-val" aria-hidden="true">{c.show(c.value)}</span>
            </span>
            <div className="cg-inputs">
              {c.kind === 'grid' ? (
                <input
                  id={c.id}
                  type="range"
                  min={0}
                  max={c.options.length - 1}
                  step={1}
                  value={idx}
                  aria-valuetext={c.show(c.options[idx]!)}
                  className={dirty ? 'touched' : ''}
                  disabled={!!gesture}
                  onChange={(e) => setSim(c.apply(c.options[Number(e.target.value)]!))}
                />
              ) : (
                <input
                  id={c.id}
                  type="range"
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={c.value}
                  aria-valuetext={c.show(c.value)}
                  className={dirty ? 'touched' : ''}
                  disabled={!!gesture}
                  onChange={(e) => setSim(c.apply(Number(e.target.value)))}
                />
              )}
              <span className="cg-num">
                <input
                  type="number"
                  inputMode="decimal"
                  aria-label={`${c.label} (${c.unit})`}
                  step={c.kind === 'range' ? c.step : 1}
                  value={draft ?? String(Math.round(c.value * 10) / 10)}
                  onChange={(e) => setDrafts((o) => ({ ...o, [c.id]: e.target.value }))}
                  disabled={!!gesture}
                  onBlur={() => commit(c)}
                  onKeyDown={onNumKey(c)}
                />
                <span aria-hidden="true">{c.unit}</span>
              </span>
            </div>
          </div>
        );
      })}
      {step === 'spacers' && (
        <div className="cg-above">
          <label htmlFor={`${uid}-above`}>Entretoises au-dessus de la potence (mesure-les)</label>
          <span className="cg-num">
            <input
              id={`${uid}-above`}
              type="number"
              inputMode="numeric"
              min={0}
              max={SPACERS_ABOVE_MAX}
              step={SPACER_STEP}
              value={aboveDraft ?? String(sim.spacersAbove)}
              disabled={!!gesture}
              onChange={(e) => setAboveDraft(e.target.value)}
              onBlur={commitAbove}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitAbove();
                } else if (e.key === 'Escape' && aboveDraft !== null) {
                  e.stopPropagation();
                  setAboveDraft(null);
                }
              }}
            />
            <span aria-hidden="true">mm</span>
          </span>
        </div>
      )}
      {step === 'stem' && sim.stemAngle !== 0 && (
        <button type="button" className="btn small ghost" disabled={!!gesture} onClick={() => setSim(simWithStem(sim, sim.stemLength, -sim.stemAngle))}>
          Retourner la potence ({sgn(sim.stemAngle)}° → {sgn(-sim.stemAngle)}°)
        </button>
      )}

      <div className="cg-row">
        <button
          type="button"
          className="btn small ghost"
          aria-disabled={gestureOff ? true : undefined}
          style={gestureOff ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
          onClick={showGesture}
        >
          {gesture ? 'Geste en cours…' : 'Montrer le geste'}
        </button>
        {gesture && (
          <Gesture key={`${step}|${JSON.stringify(gesture.to)}`} from={gesture.from} to={gesture.to} onValue={gestureStep} onDone={gestureEnd} />
        )}
        <button type="button" className="btn small ghost" aria-pressed={xpOpen} aria-controls={`${uid}-xp`} onClick={toggleXp}>
          {xpOpen ? "Fermer l'éclaté" : 'Vue éclatée'}
        </button>
      </div>
      <div id={`${uid}-xp`} className="cg-xp">
        {xpShown && (
          <CockpitExploded
            step={step}
            htaDeg={hta}
            stemLength={Math.round(sim.stemLength)}
            stemAngle={Math.round(sim.stemAngle)}
            open={xpOpen}
          />
        )}
      </div>

      <div className="cg-nav">
        {i > 0 ? (
          <button type="button" className="btn small ghost" onClick={() => setStep(COCKPIT_STEPS[i - 1]!)}>
            ← Retour
          </button>
        ) : (
          <span />
        )}
        {i < COCKPIT_STEPS.length - 1 && (
          <button type="button" className="btn small primary" onClick={() => setStep(COCKPIT_STEPS[i + 1]!)}>
            Étape suivante →
          </button>
        )}
      </div>

      <div className="cg-save">
        <button type="button" className="btn small" disabled={!dirty || !!gesture} onClick={save}>
          Enregistrer comme réglage actuel
        </button>
        {dirty && (
          <button type="button" className="btn small ghost" disabled={!!gesture} onClick={() => setSim(base)}>
            Annuler la simulation
          </button>
        )}
        <p className="hint">Écrit entretoises, potence et cintre dans ton réglage actuel (tableau ci-dessous).</p>
      </div>
    </section>
  );
}
