// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useStore } from '../components/store';
import { grvlBike } from '../test/fixtures';
import { Rail } from '../workspace/Rail';

const initial = useStore.getState();

beforeEach(() => {
  useStore.setState(initial, true);
  useStore.getState().setBike(grvlBike, 'database', []);
  useStore.getState().setPhase('tune');
  useStore.getState().setFocus('cockpit');
});
afterEach(cleanup);

const region = (root: HTMLElement) => {
  const all = root.querySelectorAll('[role="status"], output, [aria-live]');
  expect(all).toHaveLength(1);
  return all[0]!;
};

describe('CockpitGuide : région d’annonce', () => {
  it('annonce le temps à l’ouverture puis à chaque changement de temps', () => {
    const { container } = render(<Rail />);
    const status = region(container);
    expect(status.textContent?.trim()).toBe('Temps 1 sur 3 · Entretoises');
    fireEvent.click(screen.getByRole('button', { name: 'Étape suivante →' }));
    expect(status.textContent?.trim()).toBe('Temps 2 sur 3 · Potence');
  });

  it('ne dit rien de plus quand on bouge le curseur', () => {
    const { container } = render(<Rail />);
    const status = region(container);
    const before = status.textContent;
    const range = screen.getByRole('slider', { name: 'Entretoises sous la potence' });
    fireEvent.change(range, { target: { value: String(Number((range as HTMLInputElement).value) + 5) } });
    expect(status.textContent).toBe(before);
  });

  it('annonce la vue d’ensemble au retour', () => {
    const { container } = render(<Rail />);
    const status = region(container);
    act(() => useStore.getState().setFocus('overview'));
    expect(status.textContent?.trim()).toBe("Vue d'ensemble");
  });
});
