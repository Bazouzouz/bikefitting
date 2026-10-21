/**
 * Archétype « gravel » : valeurs par défaut du cadre en fonction du stack,
 * traits de dessin et plages des curseurs de l'atelier.
 * Conventions : mm et degrés, origine = axe de pédalier (BB), x vers l'avant, y vers le haut.
 *
 * ─── Sources réellement consultées (octobre 2026) ────────────────────────────────
 * Tableaux lus sur bikeinsights.com (qui reprend les fiches constructeur / revendeur
 * indiquées sur chaque page ; GeometryGeeks, specialized.com et canyon.com n'ont pas
 * répondu : 403 / 404).
 *  - Canyon Grizl 2027 (2XS→2XL ; colonne L incohérente, écartée) :
 *    https://bikeinsights.com/bikes/6a074ccbe7b8fb001ae0b126-canyon-grizl
 *  - Cannondale Topstone Carbon 2025 (47→61) :
 *    https://bikeinsights.com/bikes/688a70a55926ca001a3d48f7-cannondale-topstone?version=2025&build=carbon
 *  - Trek Checkpoint SL 6 2023 (49→61, avec potence / cintre d'origine) :
 *    https://bikeinsights.com/bikes/5afb51844cb7640014ce4612-trek-bikes-checkpoint?version=2023&build=sl-6
 *  - Giant Revolt Advanced SL 1 2026 (XS→XL ; bases 433 lues sur la page taille M) :
 *    https://bikeinsights.com/bikes/6a4b90ee4d0cf5001af3931d-giant-revolt-advanced-sl-1?version=2026&build=base
 *    https://bikeinsights.com/bike-geometries/6a4b90ee4d0cf5001af3932e-2026-giant-revolt-advanced-sl-1-revolt-advanced-sl-1-m
 *  - Specialized Diverge Comp Carbon 2024, taille 56 seulement (Future Shock : stack atypique) :
 *    https://bikeinsights.com/bike-geometries/6649cc15a9dbdd001ad8c16b-2024-specialized-bicycles-diverge-comp-carbon-comp-carbon-56
 *  - Van Rysel GRVL AF 2025/2026 (XS→XL, source decathlon.pl / .nl) :
 *    https://bikeinsights.com/bikes/678eadb4502b38001af110b7-van-rysel-grvl-af
 *    https://bikeinsights.com/bike-geometries/67f7d645cc1cea0020bf6154-2025-van-rysel-grvl-af-base-m
 *
 * ─── Synthèse (médianes des 6 modèles) ───────────────────────────────────────────
 *  - stack − tube de direction ≈ constant par marque : Grizl 436, Revolt 436,
 *    Checkpoint 446, Topstone 454, GRVL 417, Diverge 477 → médiane ≈ 440.
 *  - Tube de selle (C-T) au stack 580 : 480…548, médiane ≈ 495 ; pente médiane ≈ 1,2 mm/mm.
 *  - Chute de boîtier : 67, 75, 76, 76, 80, 80 → 76.
 *  - Déport de fourche : 45, 45, 50, 54,5, 55, 55,8 → 52.
 *  - Longueur de fourche axe-couronne : 396 (GRVL), 389 (Diverge) → 395 (2 valeurs seulement).
 *  - Bases : 420, 425, 433, 435, 435, 440 → 435.
 *  - Angles (taille médiane) : direction ≈ 71,5°, selle ≈ 73,5°.
 *  - Reach au stack 590 ≈ 400, pente ≈ 0,33 mm/mm.
 *  - Pneus d'origine : 40 à 45 mm → 42 ; jante 622.
 *  - Potence : 70 (petites tailles) → 100-110 (grandes) [Checkpoint, Revolt, Diverge] ;
 *    angle −7° (Checkpoint seul). Cintre 380 → 440 mm.
 *  - Estimés (aucune source lue) : entretoises 20 mm, évasement du cintre (flare) 12°.
 */
import type { BikeSize } from '@bikefit/shared';

/** Cotes de cadre / composants complétées par l'archétype. */
export type FrameDefaults = Required<
  Pick<
    BikeSize,
    | 'reach'
    | 'seatTubeAngle'
    | 'headTubeAngle'
    | 'seatTubeLength'
    | 'headTubeLength'
    | 'bbDrop'
    | 'forkLength'
    | 'forkOffset'
    | 'chainstay'
    | 'stemLength'
    | 'stemAngle'
    | 'spacers'
    | 'handlebarWidth'
    | 'crankLength'
  >
>;

export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

export type SliderKey =
  | 'saddleHeight'
  | 'saddleSetback'
  | 'stemLength'
  | 'stemAngle'
  | 'spacers'
  | 'handlebarWidth'
  | 'crankLength'
  | 'tyreWidth';

export interface Archetype {
  /** Valeurs par défaut du cadre pour un stack donné (mm). */
  frameDefaults(stack: number): FrameDefaults;
  /** Traits de dessin propres au style. */
  drawing: {
    /** Évasement des cocottes / drops (°, 0 = cintre route droit). */
    barFlare: number;
    /** Largeur de pneu par défaut (mm). */
    tyreWidth: number;
    /** Diamètre de jante ISO (mm). */
    wheelBsd: number;
  };
  /** Plages des curseurs de l'atelier. */
  sliders: Record<SliderKey, SliderRange>;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const roundTo = (v: number, step: number) => Math.round(v / step) * step;

export const GRAVEL: Archetype = {
  frameDefaults(stack: number): FrameDefaults {
    return {
      reach: Math.round(400 + 0.33 * (stack - 590)),
      seatTubeAngle: 73.5,
      headTubeAngle: 71.5,
      seatTubeLength: Math.round(clamp(495 + 1.2 * (stack - 580), 400, 640)),
      headTubeLength: Math.round(clamp(stack - 440, 85, 240)),
      bbDrop: 76,
      forkLength: 395,
      forkOffset: 52,
      chainstay: 435,
      stemLength: clamp(roundTo(90 + (stack - 590) / 3, 10), 60, 120),
      stemAngle: -7,
      spacers: 20, // estimé
      handlebarWidth: clamp(roundTo(420 + 0.6 * (stack - 590), 20), 380, 460),
      crankLength: stack < 550 ? 170 : stack < 610 ? 172.5 : 175, // estimé (fourchette usuelle)
    };
  },
  drawing: {
    barFlare: 12, // estimé : cintres gravel courants 12–16°
    tyreWidth: 42,
    wheelBsd: 622,
  },
  sliders: {
    saddleHeight: { min: 550, max: 900, step: 1 },
    saddleSetback: { min: 0, max: 120, step: 1 },
    stemLength: { min: 50, max: 130, step: 10 },
    stemAngle: { min: -17, max: 17, step: 1 },
    spacers: { min: 0, max: 40, step: 5 },
    handlebarWidth: { min: 380, max: 480, step: 20 },
    crankLength: { min: 160, max: 177.5, step: 2.5 },
    tyreWidth: { min: 35, max: 50, step: 1 },
  },
};
