import { useState } from 'react';
import { fmtNum, toFrame } from '../../blueprint/geometry';
import { DeltaTable } from '../../components/DeltaTable';
import { buildRows } from '../../components/rows';
import { useStore } from '../../components/store';
import { useFit } from '../../components/useFit';
import { SaddleGuide } from '../../atelier/SaddleGuide';
import { CockpitGuide } from '../../atelier/CockpitGuide';
import { PhasePanel } from '../PhasePanel';
import { SETUP_SLIDERS, sliderFor } from '../setupSliders';

/**
 * Phase 4 : réglages. Vue d'ensemble : curseurs du réglage actuel et écarts vers la cible.
 * Zoom selle ou cockpit (hotspots de la scène) : parcours guidé en 3 temps (SaddleGuide, CockpitGuide) à la place
 * des curseurs (un seul contrôle par valeur).
 */
export function TunePhase() {
  const rider = useStore((s) => s.rider);
  const overrides = useStore((s) => s.overrides);
  const setOverride = useStore((s) => s.setOverride);
  const resetOverrides = useStore((s) => s.resetOverrides);
  const focus = useStore((s) => s.focus);
  const style = useStore((s) => s.bike?.style);
  const { state, error } = useFit();
  // Volet des curseurs : état gardé ici, car il est démonté pendant le zoom selle / cockpit.
  const [slidersOpen, setSlidersOpen] = useState(true);

  if (error || !state) {
    return (
      <PhasePanel phase="tune" title="Réglages">
        <p className="error">Calcul impossible : {error ?? "choisis d'abord un vélo"}</p>
      </PhasePanel>
    );
  }
  const frame = toFrame(state.size, style);
  const todo = buildRows(state.fit, state.current, frame).filter((r) => r.status === 'off').length;

  return (
    <PhasePanel phase="tune" title="Réglages">
      <p className="ws-lede">
        {todo === 0 ? 'Tous les réglages sont dans la tolérance.' : `${todo} réglage${todo > 1 ? 's' : ''} à corriger sur la taille ${state.size.label}.`}
      </p>

      {focus === 'saddle' ? (
        <SaddleGuide state={state} />
      ) : focus === 'cockpit' ? (
        <CockpitGuide state={state} />
      ) : (
        <p className="hint">Touche la selle ou le cockpit sur la scène pour un réglage guidé, geste par geste.</p>
      )}

      {focus === 'overview' && (
        <details className="ws-fold" open={slidersOpen} onToggle={(e) => setSlidersOpen(e.currentTarget.open)}>
          <summary>
            <h3>Réglage actuel</h3>
          </summary>
          <div className="ws-sliders">
          {SETUP_SLIDERS.map((def) => {
            const value = state.current[def.key];
            const s = sliderFor(def, value, rider.inseam);
            const id = `tune-${s.key}`;
            return (
              <div key={s.key} className="slider">
                <span className="slider-head">
                  <label htmlFor={id}>{s.label}</label>
                  <span className="slider-val" aria-hidden="true">
                    {fmtNum(value, s.step < 1 ? 1 : 0)} {s.unit}
                  </span>
                </span>
                <input
                  id={id}
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={value}
                  aria-valuetext={`${fmtNum(value, s.step < 1 ? 1 : 0)} ${s.unit}`}
                  className={overrides[s.key] !== undefined ? 'touched' : ''}
                  onChange={(e) => setOverride({ [s.key]: Number(e.target.value) })}
                />
              </div>
            );
          })}
          <button type="button" className="btn small ghost" onClick={resetOverrides}>
            Réinitialiser (vélo d'origine)
          </button>
          </div>
        </details>
      )}

      <details className="ws-fold" open>
        <summary>
          <h3>Écarts : réglage actuel → cible</h3>
        </summary>
        <DeltaTable fit={state.fit} current={state.current} frame={frame} />
      </details>
    </PhasePanel>
  );
}
