/**
 * Contrat partagé client/serveur — description d'un vélo.
 * Conventions : mm et degrés. Origine géométrique = axe de pédalier (BB),
 * x vers l'avant, y vers le haut (le rendu SVG inverse y).
 */

export type BikeSource = 'jsonld' | 'chromium' | 'database' | 'manual';

/** Famille de vélo : pilote les valeurs par défaut du cadre et le dessin. */
export type BikeStyle = 'gravel' | 'road' | 'mtb';

export interface BikeSize {
  /** Libellé commercial : XS, S, M, L, XL… */
  label: string;
  /** Plage de taille cycliste conseillée par le constructeur (cm). */
  riderHeightMin?: number;
  riderHeightMax?: number;
  /** Géométrie cadre (mm / °). */
  stack: number;
  reach: number;
  seatTubeLength?: number;
  seatTubeAngle: number;
  headTubeAngle: number;
  headTubeLength?: number;
  topTube?: number;
  chainstay: number;
  wheelbase?: number;
  /** Chute de boîtier (positive = BB sous l'axe des roues). */
  bbDrop?: number;
  /** Longueur de fourche axe-couronne et déport (mm). */
  forkLength?: number;
  forkOffset?: number;
  /** Composants montés d'origine. */
  stemLength: number;
  /** Angle de potence (°, positif = relevé). */
  stemAngle?: number;
  /** Hauteur d'entretoises sous la potence (mm). */
  spacers?: number;
  handlebarWidth: number;
  crankLength: number;
}

export interface Bike {
  id: string;
  brand: string;
  model: string;
  /** Style de vélo (facultatif : absent = gravel, pour les données existantes). */
  style?: BikeStyle;
  sourceUrl?: string;
  sizes: BikeSize[];
  wheel: {
    /** Diamètre de jante ISO (622 = 700c). */
    bsd: number;
    /** Largeur de pneu (mm). */
    tyreWidth: number;
  };
}

export interface BikeLookupResponse {
  bike: Bike;
  source: BikeSource;
  /** Champs absents ou non vérifiés, à confirmer par l'utilisateur. */
  warnings: string[];
}
