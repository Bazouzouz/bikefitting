/**
 * Registre des styles de vélo. Seul le gravel est dessiné pour l'instant :
 * les autres styles sont listés (« bientôt ») et retombent sur l'archétype gravel.
 */
import type { Bike, BikeStyle } from '@bikefit/shared';
import { GRAVEL, type Archetype } from './gravel';

export type { Archetype, FrameDefaults, SliderKey, SliderRange } from './gravel';

export interface StyleInfo {
  id: BikeStyle;
  /** Libellé affiché (FR). */
  label: string;
  /** Style dessinable / sélectionnable. */
  available: boolean;
  /** Archétype propre (absent = repli gravel). */
  archetype?: Archetype;
}

export const BIKE_STYLES: Record<BikeStyle, StyleInfo> = {
  gravel: { id: 'gravel', label: 'Gravel', available: true, archetype: GRAVEL },
  road: { id: 'road', label: 'Route', available: false },
  mtb: { id: 'mtb', label: 'VTT', available: false },
};

export const STYLE_LIST: StyleInfo[] = Object.values(BIKE_STYLES);

export const DEFAULT_STYLE: BikeStyle = 'gravel';

export const isBikeStyle = (v: unknown): v is BikeStyle => typeof v === 'string' && v in BIKE_STYLES;

/** Style d'un vélo ; données sans style → gravel. */
export function styleOf(bike: Pick<Bike, 'style'> | null | undefined): BikeStyle {
  return bike?.style && isBikeStyle(bike.style) ? bike.style : DEFAULT_STYLE;
}

/** Archétype utilisé pour compléter / dessiner un style (repli gravel si indisponible). */
export function archetypeOf(style?: BikeStyle): Archetype {
  return (style && BIKE_STYLES[style]?.archetype) || GRAVEL;
}

/** Valide le choix de style d'un formulaire : message d'erreur, ou null si correct. */
export function styleChoiceError(v: unknown): string | null {
  if (v === '' || v == null) return 'Style de vélo : choisissez un style.';
  if (!isBikeStyle(v)) return 'Style de vélo : valeur inconnue.';
  if (!BIKE_STYLES[v].available) return `Style de vélo : « ${BIKE_STYLES[v].label} » n'est pas encore disponible.`;
  return null;
}
