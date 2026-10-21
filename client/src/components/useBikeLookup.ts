import { useState } from 'react';
import type { Bike, BikeLookupResponse } from '@bikefit/shared';
import { useStore } from './store';

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? `Erreur ${res.status}`;
  } catch {
    return `Erreur ${res.status}`;
  }
}

/**
 * Choix du vélo : analyse d'un lien, GRVL du catalogue, saisie manuelle.
 * Utilisé par la phase 1 de l'atelier (workspace/phases/BikePhase).
 */
export function useBikeLookup() {
  const setBike = useStore((s) => s.setBike);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);

  async function lookup() {
    setBusy(true);
    setError(null);
    if (import.meta.env.VITE_STATIC_SITE) {
      setError("L'analyse d'un lien demande le serveur local (version en ligne statique). Tu peux saisir le vélo à la main ou prendre le GRVL.");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch('/api/bike/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as BikeLookupResponse;
      setBike(data.bike, data.source, data.warnings ?? []);
      setManual(false);
    } catch (e) {
      setError(`Lien non reconnu : ${(e as Error).message}. Tu peux saisir le vélo à la main.`);
    } finally {
      setBusy(false);
    }
  }

  async function pickGrvl() {
    setBusy(true);
    setError(null);
    try {
      let res = await fetch('/api/bikes').catch(() => null);
      // Version statique (GitHub Pages) : pas d'API, base locale copiée dans public/ au build.
      if (!res?.ok) res = await fetch(`${import.meta.env.BASE_URL}bikes.json`);
      if (!res.ok) throw new Error(await readError(res));
      const list = ((await res.json()) as (Bike & { unverified?: unknown; productIds?: unknown })[]).map(
        ({ unverified: _u, productIds: _p, ...b }) => b as Bike,
      );
      const grvl = list.find((b) => /grvl/i.test(`${b.model} ${b.id}`)) ?? list[0];
      if (!grvl) throw new Error('catalogue vide');
      setBike(grvl, 'database', []);
      setManual(false);
    } catch (e) {
      setError(`Catalogue indisponible : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function pickManual(b: Bike) {
    setBike(b, 'manual', []);
    setManual(false);
  }

  return { url, setUrl, busy, error, manual, setManual, lookup, pickGrvl, pickManual };
}
