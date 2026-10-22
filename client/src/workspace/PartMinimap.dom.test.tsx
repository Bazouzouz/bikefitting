// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type JSX } from 'react';
import { useStore } from '../components/store';
import { useFit } from '../components/useFit';
import { styleOf } from '../bike-styles';
import { toFrame } from '../blueprint/geometry';
import { grvlBike } from '../test/fixtures';
import { PartMinimap, loopT } from './PartMinimap';

const initial = useStore.getState();

beforeEach(() => {
  useStore.setState(initial, true);
  useStore.getState().setBike(grvlBike, 'database', []);
});
afterEach(cleanup);

/** Hôte : calcule l'état d'ajustement comme l'atelier et garde l'état réduit comme Stage. */
function Host({ part = 'saddle' }: { part?: 'saddle' | 'cockpit' }): JSX.Element | null {
  const { state } = useFit();
  const [collapsed, setCollapsed] = useState(false);
  if (!state) return null;
  const frame = toFrame(state.size, styleOf(grvlBike));
  return <PartMinimap part={part} state={state} frame={frame} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} />;
}

describe('PartMinimap', () => {
  it('affiche le temps et sa valeur, et bascule éclater / réduire', () => {
    // Départ très bas : l'écart à la cible est net.
    act(() => useStore.getState().setOverride({ saddleHeight: 600 }));
    act(() => useStore.getState().setSaddlePreview({ height: 600, setback: 0, tilt: 0, step: 'height' }));
    const { container } = render(<Host />);
    expect(screen.getByRole('region', { name: 'Vue 3D du composant' })).toBeTruthy();
    expect(screen.getByText('Hauteur')).toBeTruthy();
    expect(screen.getByText(/^Monter \d+ mm$/)).toBeTruthy();

    const xp = screen.getByRole('button', { name: 'Éclater' });
    expect(xp.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(xp);
    expect(screen.getByRole('button', { name: 'Assembler' }).getAttribute('aria-pressed')).toBe('true');

    expect(container.querySelector('.stage-minimap-view')).toBeTruthy();
    const toggle = screen.getByRole('button', { name: 'Réduire la vue 3D' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(container.querySelector('.stage-minimap-view')).toBeNull();
    expect(screen.getByText('Hauteur')).toBeTruthy();
  });

  it('cockpit, temps cintre : affiche l’écart de largeur et rend la vue', () => {
    act(() => useStore.getState().setOverride({ handlebarWidth: 360 }));
    const cur = useStore.getState().overrides;
    act(() =>
      useStore.getState().setCockpitPreview({ spacers: cur.spacers ?? 20, spacersAbove: 0, stemLength: cur.stemLength ?? 90, stemAngle: cur.stemAngle ?? -6, handlebarWidth: 360, step: 'bar' }),
    );
    const { container } = render(<Host part="cockpit" />);
    expect(screen.getByText('Cintre', { selector: '.smm-name' })).toBeTruthy();
    expect(screen.getByText(/^Cintre [+−]\d+ mm$/)).toBeTruthy();
    expect(container.querySelector('.stage-minimap-view svg')).toBeTruthy();
  });

  it('petit écart selle : annonce le gain ; grand écart : aucune mention', () => {
    act(() => useStore.getState().setOverride({ saddleHeight: 600 }));
    act(() => useStore.getState().setSaddlePreview({ height: 600, setback: 0, tilt: 0, step: 'height' }));
    const big = render(<Host />);
    expect(screen.queryByText(/mouvement ×/)).toBeNull();
    const gap = Number(/(\d+) mm/.exec(screen.getByText(/^Monter \d+ mm$/).textContent!)![1]);
    big.unmount();
    // Écart d'environ 10 mm : gain 25 / 10 = 2,5.
    act(() => useStore.getState().setOverride({ saddleHeight: 600 + gap - 10 }));
    act(() => useStore.getState().setSaddlePreview({ height: 600 + gap - 10, setback: 0, tilt: 0, step: 'height' }));
    render(<Host />);
    expect(screen.getByText(/^Monter \d+ mm$/)).toBeTruthy();
    expect(screen.getByText(/^mouvement ×2,[3-6]$/)).toBeTruthy();
  });

  it('Agrandir bascule aria-pressed et la classe is-large ; Échap revient sans propager', () => {
    act(() => useStore.getState().setOverride({ saddleHeight: 600 }));
    act(() => useStore.getState().setSaddlePreview({ height: 600, setback: 0, tilt: 0, step: 'height' }));
    const { container } = render(<Host />);
    const mini = container.querySelector('.stage-minimap')!;
    const btn = screen.getByRole('button', { name: 'Agrandir la vue 3D' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(mini.classList.contains('is-large')).toBe(false);
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(mini.classList.contains('is-large')).toBe(true);
    let leaked = false;
    const spy = () => (leaked = true);
    document.addEventListener('keydown', spy);
    fireEvent.keyDown(document, { key: 'Escape' });
    document.removeEventListener('keydown', spy);
    expect(leaked).toBe(false);
    expect(mini.classList.contains('is-large')).toBe(false);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('la boucle va de 0 à 1 puis reste sur la cible', () => {
    expect(loopT(0)).toBe(0);
    expect(loopT(1200)).toBe(1);
    expect(loopT(1900)).toBe(1);
    expect(loopT(2000)).toBe(0);
  });
});
