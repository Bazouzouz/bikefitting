import { useEffect, useRef, useState } from 'react';
import type { Frame, Setup } from './geometry';
import { useReducedMotion } from '../motion/useReducedMotion';

/** Interpole des valeurs numériques vers la cible (easeOutCubic) ; valeur finale directe si mouvement réduit. */
export function useTween<T extends Record<string, number>>(target: T, ms = 450): T {
  const [value, setValue] = useState<T>(target);
  const cur = useRef<T>(target);
  const reduce = useReducedMotion();
  const key = JSON.stringify(target);
  useEffect(() => {
    const tgt = JSON.parse(key) as T;
    if (reduce || ms <= 0) {
      cur.current = tgt;
      setValue(tgt);
      return;
    }
    const from = { ...cur.current } as Record<string, number>;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      const next: Record<string, number> = {};
      for (const name of Object.keys(tgt)) {
        const a = from[name] ?? tgt[name]!;
        next[name] = a + (tgt[name]! - a) * e;
      }
      cur.current = next as T;
      setValue(next as T);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key, ms, reduce]);
  return value;
}

/** Anime ensemble cadre + réglages actuels + réglages cibles. */
export function useTweenedScene(frame: Frame, cur: Setup, tgt: Setup | null) {
  const flat: Record<string, number> = {};
  for (const [k, v] of Object.entries(frame)) flat['f_' + k] = v;
  for (const [k, v] of Object.entries(cur)) flat['c_' + k] = v;
  for (const [k, v] of Object.entries(tgt ?? cur)) flat['t_' + k] = v;
  const t = useTween(flat);
  const pick = <O extends Record<string, number>>(p: string, like: O): O => {
    const o: Record<string, number> = {};
    for (const k of Object.keys(like)) o[k] = t[p + k] ?? like[k]!;
    return o as O;
  };
  return {
    frame: pick('f_', frame),
    cur: pick('c_', cur),
    tgt: tgt ? pick('t_', tgt) : null,
  };
}
