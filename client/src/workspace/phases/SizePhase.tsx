import { fmtDelta, toFrame } from '../../blueprint/geometry';
import { DeltaTable } from '../../components/DeltaTable';
import { useStore } from '../../components/store';
import { useFit } from '../../components/useFit';
import { PhasePanel } from '../PhasePanel';
import { sizeWarnings } from './sizeWarnings';

/** Phase 3 : choix de la taille de cadre (scores du moteur) et écarts réglage d'origine → cible. */
export function SizePhase() {
  const setSizeLabel = useStore((s) => s.setSizeLabel);
  const style = useStore((s) => s.bike?.style);
  const { state, error } = useFit();

  if (error || !state) {
    return (
      <PhasePanel phase="size" title="Ta taille" canNext={false}>
        <p className="error">Calcul impossible : {error ?? "choisis d'abord un vélo"}</p>
      </PhasePanel>
    );
  }
  const { fit, size, current, recommended, selected } = state;
  const frame = toFrame(size, style);
  const warnings = sizeWarnings(fit, current, frame);
  const note = fit.sizeScores.find((s) => s.label === selected)?.note;

  return (
    <PhasePanel phase="size" title={`Taille ${size.label}`}>
      <div className="size-picker" role="radiogroup" aria-label="Taille de cadre">
        {fit.sizeScores.map((s) => (
          <button
            key={s.label}
            type="button"
            role="radio"
            aria-checked={s.label === selected}
            className={`size-chip${s.label === selected ? ' selected' : ''}`}
            onClick={() => setSizeLabel(s.label)}
            title={s.note}
          >
            <span className="size-label">
              {s.label}
              {s.label === recommended && <em>recommandée</em>}
            </span>
            <span className="score-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(100, s.score))}%` }} />
            </span>
            <span className="score-num">{Math.round(s.score)}/100</span>
            <span className="score-meta">
              reach {fmtDelta(s.reachDelta, 'mm')} · stack {fmtDelta(s.stackDelta, 'mm')}
            </span>
          </button>
        ))}
      </div>
      {note && <p className="note">{note}</p>}

      <h3>Réglage d'origine → cible</h3>
      <DeltaTable fit={fit} current={current} frame={frame} />
      <p className="hint">Survole une ligne pour voir la formule utilisée. Les réglages se modifient à la phase suivante.</p>

      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </PhasePanel>
  );
}
