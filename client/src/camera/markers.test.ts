import { describe, expect, it } from 'vitest';
import { markerPageSvg, markerSvgGroup, quietZoneMm } from './markers';
import { cameraErrorMessage, environmentProblem } from './errors';

const bits = '1'.repeat(18) + '0'.repeat(18);

describe('marqueurs imprimables', () => {
  it('carré noir à la taille demandée + une cellule blanche par bit à 1', () => {
    const g = markerSvgGroup(bits, 10, 20, 80);
    expect(g.startsWith('<rect x="10" y="20" width="80" height="80" fill="#000"/>')).toBe(true);
    expect(g.match(/fill="#fff"/g)).toHaveLength(18);
    // cellule = 80 / 8 = 10 mm
    expect(g).toContain('<rect x="20" y="30" width="10.01"');
  });

  it('page A4 en mm', () => {
    const svg = markerPageSvg(
      [
        { bits, label: 'BB', hint: 'a' },
        { bits, label: 'Selle <bec>', hint: 'b' },
      ],
      80,
    );
    expect(svg).toContain('width="210mm" height="297mm" viewBox="0 0 210 297"');
    expect(svg).toContain('Selle &#60;bec&#62;');
    expect(svg).toContain('100 mm');
  });
});

describe('marge blanche = décalage par défaut du bec', () => {
  it('le carré noir est à quietZoneMm du trait de coupe', () => {
    const size = 80;
    const q = quietZoneMm(size);
    expect(q).toBe(12);
    const svg = markerPageSvg([{ bits, label: 'x', hint: 'y' }], size);
    const cut = svg.match(/<rect x="([\d.]+)" y="([\d.]+)" width="[\d.]+" height="[\d.]+" fill="none"/);
    const black = svg.match(/<rect x="([\d.]+)" y="([\d.]+)" width="80" height="80" fill="#000"/);
    expect(cut && black).toBeTruthy();
    expect(Number(black![2]) - Number(cut![2])).toBeCloseTo(q);
    expect(Number(black![1]) - Number(cut![1])).toBeCloseTo(q);
  });
});

describe('erreurs caméra', () => {
  it('messages en français', () => {
    expect(cameraErrorMessage({ name: 'NotAllowedError' })).toMatch(/refusé/);
    expect(cameraErrorMessage({ name: 'NotFoundError' })).toMatch(/Aucune caméra/);
    expect(cameraErrorMessage({ name: 'NotReadableError' })).toMatch(/déjà utilisée/);
    expect(cameraErrorMessage(new Error('boum'))).toBe("Impossible d'ouvrir la caméra : boum");
    expect(environmentProblem({ isSecureContext: false, hasMediaDevices: true })).toMatch(/HTTPS/);
    expect(environmentProblem({ isSecureContext: true, hasMediaDevices: true })).toBeNull();
  });
});
