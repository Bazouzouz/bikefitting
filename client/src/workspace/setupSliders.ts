import type { CurrentSetup } from '../fit/types';

/** Curseur d'un réglage actuel (mm ou degrés). */
export interface SetupSlider {
  key: keyof CurrentSetup;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

/** Curseurs du réglage actuel (repris de l'ancien écran « En direct »). */
export const SETUP_SLIDERS: SetupSlider[] = [
  { key: 'saddleHeight', label: 'Hauteur de selle', unit: 'mm', min: 600, max: 850, step: 1 },
  { key: 'saddleSetback', label: 'Recul de selle', unit: 'mm', min: -20, max: 160, step: 1 },
  { key: 'stemLength', label: 'Longueur de potence', unit: 'mm', min: 60, max: 140, step: 10 },
  { key: 'stemAngle', label: 'Angle de potence', unit: '°', min: -20, max: 20, step: 1 },
  { key: 'spacers', label: 'Entretoises', unit: 'mm', min: 0, max: 60, step: 5 },
  { key: 'handlebarWidth', label: 'Largeur de cintre', unit: 'mm', min: 340, max: 480, step: 10 },
  { key: 'crankLength', label: 'Manivelle', unit: 'mm', min: 160, max: 180, step: 2.5 },
  { key: 'cleatFore', label: 'Cales (avant/arrière)', unit: 'mm', min: -20, max: 20, step: 0.5 },
];

/** Bornes de hauteur de selle dérivées de l'entrejambe (≈ 0,80–0,95 × entrejambe, arrondies à 5 mm). */
export function saddleBounds(inseamCm: number, value: number): { min: number; max: number } {
  const mm = inseamCm * 10;
  return {
    min: Math.min(Math.floor((mm * 0.8) / 5) * 5, Math.floor(value / 5) * 5),
    max: Math.max(Math.ceil((mm * 0.95) / 5) * 5, Math.ceil(value / 5) * 5),
  };
}

/** Curseur ajusté à la valeur et au cycliste (la hauteur de selle suit l'entrejambe). */
export function sliderFor(def: SetupSlider, value: number, inseamCm: number): SetupSlider {
  return def.key === 'saddleHeight' ? { ...def, ...saddleBounds(inseamCm, value) } : def;
}
