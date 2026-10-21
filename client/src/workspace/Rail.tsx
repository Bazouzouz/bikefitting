import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, type Phase } from '../components/store';
import { useReducedMotion } from '../motion/useReducedMotion';
import { AnnounceContext } from './PhasePanel';
import { PHASES, PHASE_LABEL } from './phases';
import { BikePhase } from './phases/BikePhase';
import { RiderPhase } from './phases/RiderPhase';
import { SizePhase } from './phases/SizePhase';
import { TunePhase } from './phases/TunePhase';

/** Colonne de droite : panneau de la phase en cours (une seule région role=status, pour les changements de phase et les événements utiles). */
export function Rail() {
  const phase = useStore((s) => s.phase);
  const ref = useRef<HTMLElement>(null);
  const prevPhase = useRef<Phase>(phase);
  const reduce = useReducedMotion();
  // Région d'annonce : le suffixe alterne pour que deux annonces identiques de suite soient relues.
  const [said, setSaid] = useState('');
  const flip = useRef(false);
  const announce = useCallback((msg: string) => {
    flip.current = !flip.current;
    setSaid(msg ? msg + (flip.current ? '' : ' ') : '');
  }, []);

  // Changement de phase : focus sur le titre, puis on ramène le haut du panneau dans la vue.
  // (comparaison avec la phase précédente : sûr en StrictMode, pas de focus au premier affichage)
  useEffect(() => {
    if (prevPhase.current === phase) return;
    prevPhase.current = phase;
    announce(`Phase ${PHASES.indexOf(phase) + 1} sur ${PHASES.length} · ${PHASE_LABEL[phase]}`);
    const rail = ref.current;
    if (!rail) return;
    rail.querySelector<HTMLElement>('[data-phase-title]')?.focus({ preventScroll: true });
    const mobile = window.matchMedia?.('(max-width: 899px)').matches;
    // Mobile : la scène collante couvre le haut de l'écran, on place le panneau juste dessous.
    const stage = mobile ? document.querySelector<HTMLElement>('.ws-stage') : null;
    const top = mobile ? rail.getBoundingClientRect().top + window.scrollY - (stage?.offsetHeight ?? 0) - 8 : 0;
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
  }, [phase, reduce, announce]);

  return (
    <aside ref={ref} className="ws-rail" aria-label="Panneau de la phase">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {said}
      </div>
      <AnnounceContext.Provider value={announce}>
        {phase === 'bike' && <BikePhase />}
        {phase === 'rider' && <RiderPhase />}
        {phase === 'size' && <SizePhase />}
        {phase === 'tune' && <TunePhase />}
      </AnnounceContext.Provider>
    </aside>
  );
}
