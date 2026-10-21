declare module 'js-aruco2' {
  export interface ArucoPoint {
    x: number;
    y: number;
  }
  export interface ArucoMarker {
    id: number;
    corners: ArucoPoint[];
    hammingDistance: number;
  }
  export class Dictionary {
    constructor(name: string);
    /** Codes binaires ('0'/'1', ligne par ligne, 1 = blanc). */
    codeList: string[];
    markSize: number;
    nBits: number;
    generateSVG(id: number): string;
  }
  export class Detector {
    constructor(config?: { dictionaryName?: string; maxHammingDistance?: number });
    detectImage(width: number, height: number, data: Uint8ClampedArray | number[]): ArucoMarker[];
  }
  export const AR: {
    Dictionary: typeof Dictionary;
    Detector: typeof Detector;
  };
}
