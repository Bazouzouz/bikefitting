import { createContext, useContext, type ReactNode } from 'react';
import { useStore, type Phase } from '../components/store';
import { PHASES, PHASE_LABEL, phaseNum } from './phases';

/** Annonce polie aux lecteurs d'écran (région role=status unique de Rail) : événements utiles seulement, jamais les curseurs. */
export const AnnounceContext = createContext<(msg: string) => void>(() => {});
export const useAnnounce = () => useContext(AnnounceContext);

/** Panneau d'une phase : surtitre « 0N · NOM », titre Barlow (cible du focus), contenu, navigation. */
export function PhasePanel({
  phase,
  title,
  children,
  canNext = true,
  nextHint,
}: {
  phase: Phase;
  title: ReactNode;
  children: ReactNode;
  /** « Suivant » actif seulement si la phase est valide. */
  canNext?: boolean;
  /** Raison affichée sous le bouton quand « Suivant » est désactivé. */
  nextHint?: string;
}) {
  const setPhase = useStore((s) => s.setPhase);
  const i = PHASES.indexOf(phase);
  const prev = PHASES[i - 1];
  const next = PHASES[i + 1];
  return (
    <section className="ws-phase" aria-labelledby={`ws-title-${phase}`}>
      <div className="ws-phase-head">
        <p className="eyebrow">
          {phaseNum(i)} · {PHASE_LABEL[phase]}
        </p>
        <h2 id={`ws-title-${phase}`} className="ws-phase-title" tabIndex={-1} data-phase-title>
          {title}
        </h2>
      </div>
      {children}
      {(prev || next) && (
        <div className="ws-nav">
          {prev ? (
            <button type="button" className="btn ghost" onClick={() => setPhase(prev)}>
              ← {PHASE_LABEL[prev]}
            </button>
          ) : (
            <span />
          )}
          {next && (
            <button
              type="button"
              className="btn primary"
              disabled={!canNext}
              aria-describedby={!canNext && nextHint ? `ws-next-hint-${phase}` : undefined}
              onClick={() => setPhase(next)}
            >
              Suivant →
            </button>
          )}
          {next && !canNext && nextHint && (
            <p id={`ws-next-hint-${phase}`} className="ws-next-hint">
              {nextHint}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
