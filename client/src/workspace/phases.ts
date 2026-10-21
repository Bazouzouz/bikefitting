import type { Phase } from '../components/store';
export { PHASES } from '../components/store';

/** Libellés des phases (fil de progression, surtitres). */
export const PHASE_LABEL: Record<Phase, string> = {
  bike: 'Vélo',
  rider: 'Morphologie',
  size: 'Taille',
  tune: 'Réglages',
};

/** Numéro affiché sur deux chiffres : « 01 », « 02 »… */
export const phaseNum = (i: number): string => String(i + 1).padStart(2, '0');
