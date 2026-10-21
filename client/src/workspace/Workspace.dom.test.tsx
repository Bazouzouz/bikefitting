// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useStore } from '../components/store';
import { grvlBike } from '../test/fixtures';
import { Workspace } from './Workspace';

const initial = useStore.getState();

beforeEach(() => {
  useStore.setState(initial, true);
});
afterEach(cleanup);

describe('Workspace : phase Vélo', () => {
  it('« Suivant » est désactivé sans vélo, avec la raison associée', () => {
    render(<Workspace />);
    const next = screen.getByRole('button', { name: 'Suivant →' });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    expect(next.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText("Choisis d'abord un vélo.")).toBeTruthy();
    expect(screen.getByText('Choisis un vélo')).toBeTruthy(); // scène vide
  });

  it('« Suivant » devient actif quand un vélo est choisi', () => {
    render(<Workspace />);
    act(() => useStore.getState().setBike(grvlBike, 'database', []));
    const next = screen.getByRole('button', { name: 'Suivant →' });
    expect((next as HTMLButtonElement).disabled).toBe(false);
  });

  it('une seule région role=status dans tout l’atelier', () => {
    const { container } = render(<Workspace />);
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it.each([
    ['Réglages (vue d’ensemble)', 'overview'],
    ['zoom selle', 'saddle'],
    ['zoom cockpit', 'cockpit'],
  ] as const)('une seule région live (status, output, aria-live) : %s', (_n, focus) => {
    useStore.getState().setBike(grvlBike, 'database', []);
    useStore.getState().setPhase('tune');
    useStore.getState().setFocus(focus);
    const { container } = render(<Workspace />);
    expect(container.querySelectorAll('[role="status"], output, [aria-live]')).toHaveLength(1);
  });

  it('groupe Côté / Dessus : flèches et tabindex itinérant', () => {
    useStore.getState().setBike(grvlBike, 'database', []);
    render(<Workspace />);
    const side = screen.getByRole('radio', { name: 'Côté' });
    const top = screen.getByRole('radio', { name: 'Dessus' });
    expect([side.tabIndex, top.tabIndex]).toEqual([0, -1]);
    side.focus();
    fireEvent.keyDown(side, { key: 'ArrowRight' });
    expect(useStore.getState().stageView).toBe('top');
    expect([side.tabIndex, top.tabIndex]).toEqual([-1, 0]);
    expect(document.activeElement).toBe(top);
    fireEvent.keyDown(top, { key: 'ArrowLeft' });
    expect(useStore.getState().stageView).toBe('side');
    expect(document.activeElement).toBe(side);
  });
});
