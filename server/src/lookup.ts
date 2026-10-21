import type { Bike, BikeLookupResponse, BikeSize, BikeStyle } from '@bikefit/shared';
import { fetchWithChromium } from './chromium.js';
import { assertAllowedUrl } from './security.js';
import { safeFetchText } from './safefetch.js';
import { loadBikes, readCache, writeCache } from './db.js';
import { completeSizes, detectStyleFromSources, matchDatabase, parseBreadcrumbs, parseGeometryTable, parseJsonLd, parseNextData, sizesFromNextData, sizesFromProperties, type DbBike } from './parse.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/**
 * Version du schéma des réponses en cache. À incrémenter dès que le contenu d'une réponse
 * change (nouveau champ, détection de style…) : toute entrée sans version ou d'une autre
 * version est ignorée et recalculée.
 */
export const CACHE_VERSION = 2;

type CachedEntry = BikeLookupResponse & { cacheVersion?: number };

/** Réponse en cache valide (version courante), sinon null. */
export function validCached(entry: CachedEntry | null | undefined): BikeLookupResponse | null {
  if (!entry || entry.cacheVersion !== CACHE_VERSION) return null;
  const { cacheVersion: _v, ...res } = entry;
  return res as BikeLookupResponse;
}

export class NotFoundError extends Error {}

/** `hints` : textes courts (nom, catégorie, fil d'Ariane) servant à deviner le style. */
type Web = { name?: string; brand?: string; sizes: Partial<BikeSize>[]; hints?: string[]; reliable?: string[] };

const STYLE_FR: Record<BikeStyle, string> = { gravel: 'gravel', road: 'route', mtb: 'VTT' };
/** Styles dont le dessin existe (les autres retombent sur le gravel). */
const DRAWN_STYLES: ReadonlySet<BikeStyle> = new Set(['gravel']);

/**
 * Choisit le style du vélo : style explicite de la base locale, sinon deviné
 * (nom, catégorie, fil d'Ariane, URL). Style non reconnu ou pas encore dessiné → gravel + avertissement.
 */
export function resolveStyle(explicit: BikeStyle | undefined, texts: Array<string | undefined>, reliable: Array<string | undefined> = []): { style: BikeStyle; warnings: string[] } {
  if (explicit && DRAWN_STYLES.has(explicit)) return { style: explicit, warnings: [] };
  if (explicit)
    return { style: 'gravel', warnings: [`Style ${STYLE_FR[explicit]} pas encore disponible : dessin gravel utilisé`] };
  const found = detectStyleFromSources(reliable, texts);
  if (!found) return { style: 'gravel', warnings: ['Style non reconnu : à confirmer (gravel par défaut)'] };
  if (DRAWN_STYLES.has(found)) return { style: found, warnings: [] };
  return {
    style: 'gravel',
    warnings: [`Style deviné : ${STYLE_FR[found]} — pas encore disponible, dessin gravel utilisé (à confirmer)`],
  };
}

export function fromHtml(html: string, tables: string[][][]): Web | null {
  const ld = parseJsonLd(html);
  const candidates = [
    ...tables.map(parseGeometryTable),
    ld ? sizesFromProperties(ld.properties) : [],
    sizesFromNextData(parseNextData(html)),
  ];
  const sizes = candidates.sort((a, b) => b.length - a.length)[0] ?? [];
  if (!ld && !sizes.length) return null;
  const reliable = [ld?.category, ...parseBreadcrumbs(html)].filter((t): t is string => !!t);
  const hints = [ld?.name, ...reliable].filter((t): t is string => !!t);
  return { name: ld?.name, brand: ld?.brand, sizes, hints, reliable };
}

/** Fusionne les données web avec la base locale si possible ; sinon exige une géométrie complète. */
function build(web: Web, url: string, db: DbBike | undefined): { bike: Bike; warnings: string[] } | null {
  const st = resolveStyle(db?.style, [web.name, db?.model], [...(web.reliable ?? []), url]);
  if (db) {
    const warnings = [...st.warnings, ...(db.unverified ?? [])];
    const sizes = db.sizes.map((s) => {
      const w = web.sizes.find((x) => x.label?.toUpperCase() === s.label.toUpperCase());
      return w ? ({ ...s, ...w } as BikeSize) : s;
    });
    const { unverified: _u, productIds: _p, ...bike } = db;
    return { bike: { ...bike, style: st.style, sizes, sourceUrl: url }, warnings };
  }
  if (!completeSizes(web.sizes)) return null;
  const sizes = web.sizes.map((s) => ({ stemLength: 90, handlebarWidth: 420, crankLength: 170, ...s }) as BikeSize);
  return {
    bike: { id: url, brand: web.brand ?? '', model: web.name ?? '', style: st.style, sourceUrl: url, sizes, wheel: { bsd: 622, tyreWidth: 28 } },
    warnings: [
      ...st.warnings,
      'stemLength, handlebarWidth, crankLength non fournis par la page : valeurs par défaut à confirmer',
      'Dimensions de roue/pneu non lues : 700c / 28 mm par défaut',
    ],
  };
}

export async function lookup(url: string): Promise<BikeLookupResponse> {
  assertAllowedUrl(url);
  const cached = await readCache(url);
  const hit = validCached(cached);
  if (hit) return hit;
  const db = matchDatabase(await loadBikes(), url);
  const finish = async (r: BikeLookupResponse) => (await writeCache(url, { ...r, cacheVersion: CACHE_VERSION } as CachedEntry), r);

  // 1. fetch serveur + JSON-LD / __NEXT_DATA__
  try {
    const r = await safeFetchText(url, {
      headers: { 'user-agent': UA, 'accept-language': 'fr-FR,fr;q=0.9', accept: 'text/html' },
      timeoutMs: 15000,
    });
    if (r) {
      const web = fromHtml(r.text, []);
      const built = web && web.sizes.length ? build(web, url, db) : null;
      if (built) return finish({ ...built, source: 'jsonld' });
    }
  } catch {
    /* on passe à Chromium */
  }

  // 2. Chromium
  try {
    const cap = await fetchWithChromium(url);
    if (!cap.blocked) {
      const web = fromHtml(cap.html, cap.tables);
      const built = web && web.sizes.length ? build(web, url, db) : null;
      if (built) return finish({ ...built, source: 'chromium' });
    }
  } catch (e) {
    console.warn('Chromium indisponible :', (e as Error).message);
  }

  // 3. base locale
  if (db) {
    const built = build({ sizes: [] }, url, db)!;
    built.warnings.unshift('Page constructeur inaccessible (anti-bot) : données issues de la base locale');
    return { ...built, source: 'database' }; // repli dégradé : jamais mis en cache
  }
  throw new NotFoundError(
    "Impossible de récupérer ce vélo automatiquement et il n'est pas dans la base locale. Utilisez la saisie manuelle.",
  );
}
