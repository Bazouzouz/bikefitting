import { create } from 'zustand';
import type { Bike, BikeSize, BikeSource } from '@bikefit/shared';
import type { CurrentSetup, RiderMeasurements } from '../fit/types';
import { saddleHeightBaseline } from '../fit/saddle';

/** Phases de l'atelier, dans l'ordre du parcours. */
export type Phase = 'bike' | 'rider' | 'size' | 'tune';
export const PHASES: readonly Phase[] = ['bike', 'rider', 'size', 'tune'];
export type StageView = 'side' | 'top';
/** Cadrage de la caméra de la scène (phase Réglages). */
export type StageFocus = 'overview' | 'saddle' | 'cockpit';

/** Selle simulée par le parcours guidé (panneau), dessinée par la scène tant que le zoom selle est ouvert. */
export interface SaddlePreview {
  /** Hauteur (mm, axe BB → dessus de selle le long du tube). */
  height: number;
  /** Recul de la pointe derrière l'axe BB (mm). */
  setback: number;
  /** Inclinaison du bec (°, + = bec relevé). */
  tilt: number;
  /** Temps en cours (cote affichée sur la scène). */
  step: 'height' | 'setback' | 'tilt';
}

/** Cockpit simulé par le parcours guidé (panneau), dessiné par la scène tant que le zoom cockpit est ouvert. */
export interface CockpitPreview {
  /** Entretoises sous la potence (mm). */
  spacers: number;
  /** Entretoises au-dessus de la potence (mm, hors contrat du moteur). */
  spacersAbove: number;
  stemLength: number;
  /** Angle de potence (°, + = relevée). */
  stemAngle: number;
  handlebarWidth: number;
  /** Temps en cours (cote affichée sur la scène). */
  step: 'spacers' | 'stem' | 'bar';
}

export const DEFAULT_RIDER: RiderMeasurements = {
  height: 180,
  inseam: 85,
  shoeSize: 43,
  torso: 58,
  arm: 62,
  shoulderWidth: 40,
  flexibility: 'medium',
  practice: 'gravel',
};

interface State {
  phase: Phase;
  /** Indice de la phase la plus avancée atteinte (les phases ≤ restent cliquables). */
  reached: number;
  stageView: StageView;
  showRider: boolean;
  /** Pièce cadrée par la caméra de la scène ('overview' = vue d'ensemble). */
  focus: StageFocus;
  bike: Bike | null;
  source: BikeSource | null;
  warnings: string[];
  rider: RiderMeasurements;
  /** null = suivre la taille recommandée. */
  sizeLabel: string | null;
  /** Réglages actuels modifiés par l'utilisateur (le reste vient du vélo d'origine). */
  overrides: Partial<CurrentSetup>;
  /** Inclinaison actuelle de la selle (°, + = bec relevé) : hors du contrat du moteur, 0 = de niveau. */
  saddleTilt: number;
  /** Simulation du parcours selle (null hors du parcours). */
  saddlePreview: SaddlePreview | null;
  /** Simulation du parcours cockpit (null hors du parcours). */
  cockpitPreview: CockpitPreview | null;
  setPhase: (p: Phase) => void;
  setStageView: (v: StageView) => void;
  setShowRider: (v: boolean) => void;
  setFocus: (f: StageFocus) => void;
  setBike: (bike: Bike, source: BikeSource, warnings: string[]) => void;
  setRider: (r: RiderMeasurements) => void;
  setSizeLabel: (l: string | null) => void;
  setOverride: (patch: Partial<CurrentSetup>) => void;
  resetOverrides: () => void;
  setSaddleTilt: (t: number) => void;
  setSaddlePreview: (p: SaddlePreview | null) => void;
  setCockpitPreview: (p: CockpitPreview | null) => void;
}

export const useStore = create<State>((set) => ({
  phase: 'bike',
  reached: 0,
  stageView: 'side',
  showRider: true,
  focus: 'overview',
  bike: null,
  source: null,
  warnings: [],
  rider: DEFAULT_RIDER,
  sizeLabel: null,
  overrides: {},
  saddleTilt: 0,
  saddlePreview: null,
  cockpitPreview: null,
  // Changer de phase ou de vélo ramène la caméra à la vue d'ensemble DANS LE MÊME rendu : saut, sans dézoom animé.
  // Changer de vue garde le focus (et donc le guide en cours) : la caméra saute au cadrage zoomé de la nouvelle vue.
  setPhase: (phase) =>
    set((s) => ({ phase, reached: Math.max(s.reached, PHASES.indexOf(phase)), focus: phase === s.phase ? s.focus : 'overview' })),
  setStageView: (stageView) => set({ stageView }),
  setShowRider: (showRider) => set({ showRider }),
  setFocus: (focus) => set({ focus }),
  setBike: (bike, source, warnings) => set({ bike, source, warnings, sizeLabel: null, overrides: {}, saddleTilt: 0, focus: 'overview' }),
  setRider: (rider) => set({ rider, overrides: {} }),
  setSizeLabel: (sizeLabel) => set({ sizeLabel, overrides: {} }),
  setOverride: (patch) => set((s) => ({ overrides: { ...s.overrides, ...patch } })),
  resetOverrides: () => set({ overrides: {}, saddleTilt: 0 }),
  setSaddleTilt: (saddleTilt) => set({ saddleTilt }),
  setSaddlePreview: (saddlePreview) => set({ saddlePreview }),
  setCockpitPreview: (cockpitPreview) => set({ cockpitPreview }),
}));

  /** Cales : valeur neutre au milieu de la plage de conseil du moteur (10–15 mm derrière l'axe). */
export const NEUTRAL_CLEAT_FORE = 12.5;

/**
 * Réglages actuels : composants d'origine de la taille (potence, angle, entretoises, cintre, manivelle) ;
 * selle et cales ne sont pas connues du catalogue : valeurs neutres (`neutral`, sinon formule LeMond/Hamley
 * du moteur et recul typique), sans erreur inventée, puis modifications de l'utilisateur.
 */
export function currentSetupFor(
  size: BikeSize,
  rider: RiderMeasurements,
  overrides: Partial<CurrentSetup>,
  neutral: Partial<Pick<CurrentSetup, 'saddleHeight' | 'saddleSetback' | 'cleatFore'>> = {},
): CurrentSetup {
  return {
    saddleHeight: neutral.saddleHeight ?? Math.round(saddleHeightBaseline(rider.inseam, size.crankLength, rider.practice)),
    saddleSetback: neutral.saddleSetback ?? 70,
    stemLength: size.stemLength,
    stemAngle: size.stemAngle ?? -6,
    spacers: size.spacers ?? 20,
    handlebarWidth: size.handlebarWidth,
    crankLength: size.crankLength,
    cleatFore: neutral.cleatFore ?? NEUTRAL_CLEAT_FORE,
    ...overrides,
  };
}
