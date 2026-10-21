import type { KeyboardEvent } from 'react';
import '../styles/workspace.css';
import { useStore } from '../components/store';
import { useFit } from '../components/useFit';
import { PhaseHeader } from './PhaseHeader';
import { Rail } from './Rail';
import { Stage } from './Stage';

const VIEWS = [
  ['side', 'Côté'],
  ['top', 'Dessus'],
] as const;

/**
 * Atelier unique : en-tête fin, scène collante à gauche (montée une fois pour tout le parcours), panneau de phase
 * à droite. Sous 900 px : scène collante en haut (~42vh), panneau dessous.
 */
export function Workspace() {
  const bike = useStore((s) => s.bike);
  const phase = useStore((s) => s.phase);
  const view = useStore((s) => s.stageView);
  const setView = useStore((s) => s.setStageView);
  const showRider = useStore((s) => s.showRider);
  const setShowRider = useStore((s) => s.setShowRider);
  const { state, error } = useFit();

  // Groupe radio Côté / Dessus : flèches ←/→ (↑/↓ aussi) déplacent la sélection et le focus, un seul radio tabbable.
  const onViewKey = (e: KeyboardEvent<HTMLElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = VIEWS[(VIEWS.findIndex(([v]) => v === view) + dir + VIEWS.length) % VIEWS.length]![0];
    setView(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-view="${next}"]`)?.focus();
  };

  return (
    <div className="ws">
      <PhaseHeader state={state} />
      <main className="ws-main">
        <section className="ws-stage" aria-label="Scène">
          {bike && state && (
            <div className="ws-stage-tools">
              <span className="seg" role="radiogroup" aria-label="Vue" onKeyDown={onViewKey}>
                {VIEWS.map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={view === v}
                    tabIndex={view === v ? 0 : -1}
                    data-view={v}
                    className={view === v ? 'on' : ''}
                    onClick={() => setView(v)}
                  >
                    {label}
                  </button>
                ))}
              </span>
              <span className="seg">
                <button type="button" aria-pressed={showRider} className={showRider ? 'on' : ''} onClick={() => setShowRider(!showRider)}>
                  Cycliste
                </button>
              </span>
            </div>
          )}
          <div className="ws-stage-view">
            {bike && state ? (
              <Stage bike={bike} state={state} view={view} showRider={showRider} phase={phase} />
            ) : (
              <div className="ws-stage-empty">
                <p className="eyebrow">Scène</p>
                <p className="ws-stage-empty-title">{bike && error ? 'Calcul impossible' : 'Choisis un vélo'}</p>
                <p className="ws-stage-empty-text">
                  {bike && error ? error : 'Son plan apparaîtra ici, puis ton gabarit, ta taille et tes réglages.'}
                </p>
              </div>
            )}
          </div>
        </section>
        <Rail />
      </main>
    </div>
  );
}
