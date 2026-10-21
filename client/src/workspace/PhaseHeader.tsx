import { BIKE_STYLES, styleOf } from '../bike-styles';
import { useStore } from '../components/store';
import type { FitState } from '../components/useFit';
import { PHASES, PHASE_LABEL, phaseNum } from './phases';

/**
 * En-tête fin de l'atelier : titre, résumé du vélo (marque modèle · taille · style) et fil de progression.
 * Une phase est cliquable si elle a déjà été atteinte (et qu'un vélo est choisi au-delà de la phase 1) :
 * c'est une progression, pas des onglets libres.
 */
export function PhaseHeader({ state }: { state: FitState | null }) {
  const phase = useStore((s) => s.phase);
  const reached = useStore((s) => s.reached);
  const bike = useStore((s) => s.bike);
  const setPhase = useStore((s) => s.setPhase);
  const index = PHASES.indexOf(phase);

  const summary = bike
    ? [`${bike.brand} ${bike.model}`.trim(), state ? `taille ${state.selected}` : null, BIKE_STYLES[styleOf(bike)].label.toLowerCase()]
        .filter(Boolean)
        .join(' · ')
    : 'Aucun vélo choisi';

  return (
    <header className="ws-header">
      <h1 className="ws-brand">Bike Fit</h1>
      <p className="ws-summary" title={summary}>{summary}</p>
      <nav className="ws-progress" aria-label="Progression">
        <ol className="progress">
          {PHASES.map((p, i) => {
            const enabled = i <= reached && (i === 0 || bike !== null);
            const cls = i === index ? 'on' : enabled ? 'done' : '';
            return (
              <li key={p} className={cls}>
                <button
                  type="button"
                  disabled={!enabled || i === index}
                  aria-current={i === index ? 'step' : undefined}
                  aria-label={`${phaseNum(i)} · ${PHASE_LABEL[p]}${i === index ? ' (phase en cours)' : enabled ? '' : ' (pas encore disponible)'}`}
                  title={PHASE_LABEL[p]}
                  onClick={() => setPhase(p)}
                />
              </li>
            );
          })}
        </ol>
        <span className="ws-count" aria-hidden="true">
          {phaseNum(index)} / {phaseNum(PHASES.length - 1)}
          <span className="ws-count-label">{PHASE_LABEL[phase]}</span>
        </span>
      </nav>
    </header>
  );
}
