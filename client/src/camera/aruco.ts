/**
 * Seul point d'entrée vers js-aruco2 (chargé à la demande pour ne pas alourdir
 * le bundle principal ; si le chargement échoue, l'UI bascule en mode manuel).
 */
import type { ArucoMarker } from 'js-aruco2';
import type { MarkerCorners } from './geometry';
import { ARUCO_DICTIONARY } from './markers';

type ArucoModule = typeof import('js-aruco2');

/**
 * js-aruco2 accepte par défaut toute distance de Hamming < tau (12 pour 36h12),
 * ce qui donne des faux positifs (sous-carrés du marqueur lus comme un autre id).
 * Capacité de correction réelle du dictionnaire : 5 bits -> on accepte < 5.
 */
const MAX_HAMMING = 5;

let loading: Promise<ArucoModule['AR']> | null = null;

export function loadAruco(): Promise<ArucoModule['AR']> {
  if (!loading) {
    loading = import('js-aruco2').then((m) => {
      // js-aruco2 est un module CommonJS qui fait `this.AR = AR` : selon
      // l'outillage, AR est exposé en export nommé ou sur l'export par défaut.
      const mod = m as unknown as { AR?: ArucoModule['AR']; default?: { AR?: ArucoModule['AR'] } };
      const AR = mod.AR ?? mod.default?.AR;
      if (!AR) throw new Error('js-aruco2 : module AR introuvable');
      return AR;
    });
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

export interface DetectedMarker {
  id: number;
  corners: MarkerCorners;
}

export interface MarkerDetector {
  detect(image: { width: number; height: number; data: Uint8ClampedArray }): DetectedMarker[];
}

export async function createDetector(): Promise<MarkerDetector> {
  const AR = await loadAruco();
  const det = new AR.Detector({ dictionaryName: ARUCO_DICTIONARY, maxHammingDistance: MAX_HAMMING });
  return {
    detect(image) {
      const found: ArucoMarker[] = det.detectImage(image.width, image.height, image.data);
      return found
        .filter((m) => m.corners.length === 4)
        .map((m) => ({
          id: m.id,
          corners: m.corners.map((c) => ({ x: c.x, y: c.y })) as MarkerCorners,
        }));
    },
  };
}

/** Codes binaires des marqueurs du dictionnaire utilisé. */
export async function markerBits(ids: number[]): Promise<string[]> {
  const AR = await loadAruco();
  const dic = new AR.Dictionary(ARUCO_DICTIONARY);
  return ids.map((id) => {
    const b = dic.codeList[id];
    if (!b) throw new Error(`Marqueur ${id} absent du dictionnaire`);
    return b;
  });
}
