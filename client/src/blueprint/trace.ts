import { useLayoutEffect, type RefObject } from 'react';

/**
 * Tracé du cadre : les traits sont en `vector-effect: non-scaling-stroke`, donc leurs pointillés
 * se mesurent en pixels écran (pathLength ne s'applique pas). On écrit sur chaque élément
 * `[data-trace]` sa longueur à l'écran dans `--len`, avant le premier affichage ; le CSS anime
 * ensuite `stroke-dashoffset` de `--len` à 0 (stage.css).
 */
export function useTraceLengths(ref: RefObject<SVGGElement | null>, trace: boolean) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!trace || !root) return;
    for (const el of root.querySelectorAll<SVGGeometryElement>('[data-trace]')) {
      const m = el.getScreenCTM?.();
      const k = m ? Math.hypot(m.a, m.b) : 1;
      const len = (el.getTotalLength?.() ?? 0) * k;
      el.style.setProperty('--len', `${Math.ceil(len) + 2}px`);
    }
  }, [ref, trace]);
}
