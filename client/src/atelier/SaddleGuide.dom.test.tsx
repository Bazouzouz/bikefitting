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
  useStore.getState().setFocus('saddle');
});
afterEach(cleanup);

/**
 * La région d'annonce est le seul élément live du panneau : ni <output> (rôle implicite status), ni autre
 * [aria-live] (les valeurs des curseurs sont des <span>).
 */
const LIVE = '[role="status"], output, [aria-live]';
const region = (root: HTMLElement) => {
  const all = root.querySelectorAll(LIVE);
  expect(all).toHaveLength(1);
  return all[0]!;
};

describe('SaddleGuide : région d’annonce', () => {
  it('ne dit rien quand on bouge le curseur', () => {
    const { container } = render(<Rail />);
    const status = region(container);
    expect(status.textContent?.trim()).toBe('Temps 1 sur 3 · Hauteur');
    const range = screen.getByRole('slider', { name: 'Hauteur de selle' });
    fireEvent.change(range, { target: { value: String(Number((range as HTMLInputElement).value) + 7) } });
    fireEvent.change(range, { target: { value: String(Number((range as HTMLInputElement).value) + 3) } });
    expect(status.textContent?.trim()).toBe('Temps 1 sur 3 · Hauteur');
  });

  it('annonce le changement de temps, une fois', () => {
    const { container } = render(<Rail />);
    const status = region(container);
    fireEvent.click(screen.getByRole('button', { name: 'Étape suivante →' }));
    expect(status.textContent?.trim()).toBe('Temps 2 sur 3 · Recul');
  });

  it('annonce la vue d’ensemble au retour', () => {
    const { container } = render(<Rail />);
    const status = region(container);
    act(() => useStore.getState().setFocus('overview'));
    expect(status.textContent?.trim()).toBe("Vue d'ensemble");
  });

  it('publie la selle simulée au store et la retire en quittant le parcours', () => {
    const { unmount } = render(<Rail />);
    expect(useStore.getState().saddlePreview?.step).toBe('height');
    act(() => useStore.getState().setFocus('overview'));
    unmount();
    expect(useStore.getState().saddlePreview).toBeNull();
  });
});
