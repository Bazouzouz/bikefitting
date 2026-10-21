import { describe, expect, it } from 'vitest';
import type { BikeSize } from '@bikefit/shared';
import { BIKE_STYLES, STYLE_LIST, archetypeOf, styleChoiceError, styleOf } from './index';
import { GRAVEL } from './gravel';
import { frameGeometry, rad, toFrame, wheelRadius } from '../blueprint/geometry';

const base = (stack: number): BikeSize => ({
  label: 'M',
  stack,
  reach: 395,
  seatTubeAngle: 73.5,
  headTubeAngle: 71.5,
  chainstay: 435,
  stemLength: 90,
  handlebarWidth: 420,
  crankLength: 172.5,
});

describe('registre des styles', () => {
  it('seul le gravel est disponible', () => {
    expect(STYLE_LIST.filter((s) => s.available).map((s) => s.id)).toEqual(['gravel']);
    expect(BIKE_STYLES.road.label).toBe('Route');
    expect(BIKE_STYLES.mtb.label).toBe('VTT');
  });
  it('styleOf retombe sur gravel', () => {
    expect(styleOf({})).toBe('gravel');
    expect(styleOf(undefined)).toBe('gravel');
    expect(styleOf({ style: 'road' })).toBe('road');
  });
  it('archétype : repli gravel pour les styles non dessinés', () => {
    expect(archetypeOf('road')).toBe(GRAVEL);
    expect(archetypeOf(undefined)).toBe(GRAVEL);
  });
  it('choix de style obligatoire dans le formulaire', () => {
    expect(styleChoiceError('')).toMatch(/choisissez/);
    expect(styleChoiceError(undefined)).not.toBeNull();
    expect(styleChoiceError('road')).toMatch(/pas encore disponible/);
    expect(styleChoiceError('gravel')).toBeNull();
  });
});

describe('archétype gravel', () => {
  it('tube de direction et tube de selle croissent avec le stack', () => {
    const a = GRAVEL.frameDefaults(540);
    const b = GRAVEL.frameDefaults(620);
    expect(b.headTubeLength).toBeGreaterThan(a.headTubeLength);
    expect(b.seatTubeLength).toBeGreaterThan(a.seatTubeLength);
    expect(b.stemLength).toBeGreaterThanOrEqual(a.stemLength);
  });
  it('valeurs proches des modèles relevés (taille M ≈ stack 590)', () => {
    const d = GRAVEL.frameDefaults(590);
    expect(d.headTubeLength).toBe(150);
    expect(d.seatTubeLength).toBeGreaterThan(480);
    expect(d.seatTubeLength).toBeLessThan(530);
    expect(d.bbDrop).toBe(76);
    expect(GRAVEL.drawing.wheelBsd).toBe(622);
    expect(GRAVEL.drawing.tyreWidth).toBeGreaterThanOrEqual(38);
    expect(GRAVEL.drawing.tyreWidth).toBeLessThanOrEqual(45);
  });
  it('toFrame : champ présent prioritaire, sinon défaut de l’archétype', () => {
    expect(toFrame({ ...base(600), headTubeLength: 123 }).htl).toBe(123);
    expect(toFrame(base(600)).htl).toBe(GRAVEL.frameDefaults(600).headTubeLength);
    expect(toFrame(base(600), 'mtb')).toEqual(toFrame(base(600), 'gravel'));
  });
  it('dessin cohérent : couronne → axe ≈ longueur de fourche, de 520 à 660 de stack', () => {
    for (let stack = 520; stack <= 660; stack += 20) {
      const fr = toFrame(base(stack));
      const g = frameGeometry(fr, wheelRadius({ bsd: 622, tyreWidth: 42 }));
      const crownToAxle = (g.headBottom.y - fr.bbDrop) / Math.sin(rad(fr.hta));
      expect(crownToAxle).toBeGreaterThan(370);
      expect(crownToAxle).toBeLessThan(410);
    }
  });
});
