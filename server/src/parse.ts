import type { Bike, BikeSize, BikeStyle } from '@bikefit/shared';

/** Vélo de la base locale : le contrat Bike + identifiants produit. */
export type DbBike = Bike & { productIds?: string[]; unverified?: string[] };

/** Extrait l'ID produit Décathlon (ex. m8766974) et l'ID modèle (/342976/) d'une URL. */
export function extractProductIds(url: string): string[] {
  const ids: string[] = [];
  const m = url.match(/\/(\d{5,7})\/c\w*?m(\d{6,8})/i);
  if (m) ids.push(m[2], m[1]);
  else {
    for (const n of url.match(/\d{6,8}/g) ?? []) ids.push(n);
  }
  return [...new Set(ids)];
}

export interface JsonLdProduct {
  name?: string;
  brand?: string;
  sku?: string;
  url?: string;
  /** Catégorie produit JSON-LD (texte ou fil « A > B »). */
  category?: string;
  properties: Record<string, string>;
}

function* walk(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) for (const n of node) yield* walk(n);
  else if (node && typeof node === 'object') {
    yield node as Record<string, unknown>;
    for (const v of Object.values(node)) yield* walk(v);
  }
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string' ? (v as { name: string }).name : undefined;

/** Extrait les blocs JSON-LD de type Product d'un HTML. */
export function parseJsonLd(html: string): JsonLdProduct | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    for (const o of walk(data)) {
      const t = o['@type'];
      if (t === 'Product' || (Array.isArray(t) && t.includes('Product'))) {
        const properties: Record<string, string> = {};
        const add = o['additionalProperty'];
        if (Array.isArray(add))
          for (const p of add as Array<Record<string, unknown>>)
            if (typeof p.name === 'string' && p.value != null) properties[p.name] = String(p.value);
        return { name: str(o.name), brand: str(o.brand), sku: str(o.sku), url: str(o.url), category: str(o.category), properties };
      }
    }
  }
  return null;
}

function* jsonLdBlocks(html: string): Generator<unknown> {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      yield JSON.parse(m[1].trim());
    } catch {
      /* bloc invalide ignoré */
    }
  }
}

/** Libellés du fil d'Ariane JSON-LD (BreadcrumbList), dans l'ordre. */
export function parseBreadcrumbs(html: string): string[] {
  const out: string[] = [];
  for (const data of jsonLdBlocks(html))
    for (const o of walk(data)) {
      if (o['@type'] !== 'BreadcrumbList' || !Array.isArray(o.itemListElement)) continue;
      for (const it of o.itemListElement as Array<Record<string, unknown>>) {
        const name = str(it.name) ?? str(it.item);
        if (name) out.push(name);
      }
    }
  return out;
}

/** Normalise pour la recherche de mots-clés : minuscules, sans accents, séparateurs → espaces. */
const norm = (t: string) =>
  ` ${t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')} `;

// Détection prudente : mots entiers (texte normalisé, limites = espaces), expressions
// explicites pour les mots ambigus (« course », « trail », « aero »…) et liste explicite de
// modèles. Tout ce qui n'y figure pas reste « non détecté » (le client demandera le style).
const MODELS_GRAVEL = 'grizl|topstone|diverge|checkpoint|revolt|aspero|grail|grvl';
const MODELS_ROAD = 'aeroad|emonda|madone|endurace|domane|ncr|rcr|specialized tarmac|tarmac sl';
const BIKE = '(?:velos?|bikes?|bicycles?)';

const STYLE_PATTERNS: Array<[BikeStyle, RegExp]> = [
  ['gravel', new RegExp(` (?:gravels?|all ?road|allroad|cyclo ?cross|cyclocross|adventure road|${MODELS_GRAVEL}) `)],
  [
    'mtb',
    new RegExp(
      ` (?:vtt|vttae|mtb|mountain ?bikes?|all mountain|enduro|downhill|hardtail|semi rigide|tout suspendu|full suspension|rockrider|cross country|(?:trail|xc) ${BIKE}|${BIKE} (?:trail|xc)) `,
    ),
  ],
  [
    'road',
    new RegExp(
      ` (?:velos? (?:de )?(?:route|course|contre la montre|triathlon)|road ?bikes?|road bikes?|racing bikes?|race bikes?|aero (?:road|${BIKE})|${BIKE} aero|${MODELS_ROAD}) `,
    ),
  ],
];

/** Styles trouvés dans un texte (mots entiers / expressions explicites). */
function classify(texts: Array<string | undefined | null>): Set<BikeStyle> {
  const t = norm(texts.filter(Boolean).join(' | '));
  return new Set(STYLE_PATTERNS.filter(([, re]) => re.test(t)).map(([s]) => s));
}

/** Un seul style, sinon undefined. Gravel est plus précis que route (« Vélos de route > Gravel »). */
function decide(found: Set<BikeStyle>): BikeStyle | undefined {
  if (found.size === 1) return [...found][0];
  if (found.size === 2 && found.has('gravel') && found.has('road')) return 'gravel';
  return undefined; // vide ou contradictoire : on ne devine pas
}

/**
 * Devine le style à partir de textes d'une même source. Renvoie undefined si rien ne
 * correspond ou si les indices se contredisent.
 */
export function detectStyle(...texts: Array<string | undefined | null>): BikeStyle | undefined {
  return decide(classify(texts));
}

/**
 * Comme detectStyle, avec priorité aux sources fiables (catégorie JSON-LD, fil d'Ariane,
 * segments d'URL) sur le nom du produit. Le nom ne tranche que si les sources fiables
 * sont muettes (ou pour préciser route → gravel).
 */
export function detectStyleFromSources(reliable: Array<string | undefined | null>, name: Array<string | undefined | null>): BikeStyle | undefined {
  const r = classify(reliable);
  if (r.size === 0) return decide(classify(name));
  const rs = decide(r);
  if (rs === 'road' && classify(name).has('gravel')) return 'gravel';
  return rs;
}

/** Extrait le JSON de __NEXT_DATA__ s'il existe. */
export function parseNextData(html: string): unknown | null {
  const m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

const num = (s: string | undefined): number | undefined => {
  if (!s) return undefined;
  const n = parseFloat(s.replace(',', '.').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

const METRIC_MAP: Array<[RegExp, keyof BikeSize]> = [
  [/reach/i, 'reach'],
  [/stack/i, 'stack'],
  [/angle.*(selle|tube de selle|seat)|seat.*angle/i, 'seatTubeAngle'],
  [/angle.*(direction|head)|head.*angle/i, 'headTubeAngle'],
  [/base|chainstay/i, 'chainstay'],
  [/empattement|wheelbase/i, 'wheelbase'],
  [/horizontal|top ?tube/i, 'topTube'],
  [/longueur.*tube de selle|seat ?tube/i, 'seatTubeLength'],
  [/tube de direction|head ?tube/i, 'headTubeLength'],
  [/(chute|drop)/i, 'bbDrop'],
];

export function metricKey(label: string): keyof BikeSize | undefined {
  return METRIC_MAP.find(([r]) => r.test(label))?.[1];
}

const SIZE_TOKEN = /^(XXS|XS|S|M|L|XL|XXL|XXXL|\d{2,3})$/i;

/** Convertit les additionalProperty JSON-LD ("Reach M", "S - Stack"…) en tailles partielles. */
export function sizesFromProperties(properties: Record<string, string>): Partial<BikeSize>[] {
  const by = new Map<string, Record<string, number | string>>();
  for (const [name, value] of Object.entries(properties)) {
    const size = name.split(/[\s\-_:/()]+/).find((t) => SIZE_TOKEN.test(t));
    const key = metricKey(name);
    const v = num(value);
    if (!size || !key || v === undefined) continue;
    const label = size.toUpperCase();
    const e = by.get(label) ?? { label };
    e[key] = v;
    by.set(label, e);
  }
  return [...by.values()].filter((s) => s.reach !== undefined || s.stack !== undefined) as Partial<BikeSize>[];
}

/** Cherche dans __NEXT_DATA__ des objets taille ({size|label|name, reach, stack…}). */
export function sizesFromNextData(data: unknown): Partial<BikeSize>[] {
  const out: Partial<BikeSize>[] = [];
  for (const o of walk(data)) {
    const label = [o.size, o.label, o.name, o.sizeName].find((v) => typeof v === 'string') as string | undefined;
    if (!label) continue;
    const e: Record<string, number | string> = { label };
    for (const [k, v] of Object.entries(o)) {
      const key = metricKey(k);
      const n = typeof v === 'number' ? v : typeof v === 'string' ? num(v) : undefined;
      if (key && n !== undefined) e[key] = n;
    }
    if (e.reach !== undefined || e.stack !== undefined) out.push(e as Partial<BikeSize>);
  }
  return out;
}

/**
 * Transforme un tableau de géométrie (lignes : [libellé, valeur par taille…],
 * première ligne = en-têtes de tailles) en tailles partielles.
 */
export function parseGeometryTable(rows: string[][]): Partial<BikeSize>[] {
  if (rows.length < 2) return [];
  const header = rows[0].slice(1).map((s) => s.trim());
  const sizes: Partial<BikeSize>[] = header.map((label) => ({ label }));
  for (const row of rows.slice(1)) {
    const key = metricKey(row[0]);
    if (!key) continue;
    row.slice(1).forEach((cell, i) => {
      const v = num(cell);
      if (v !== undefined && sizes[i]) (sizes[i] as Record<string, number | string>)[key] = v;
    });
  }
  return sizes.filter((s) => s.reach !== undefined || s.stack !== undefined);
}

/** Cherche une base locale correspondant aux identifiants d'une URL. */
export function matchDatabase(bikes: DbBike[], url: string): DbBike | undefined {
  const ids = extractProductIds(url);
  return bikes.find((b) => ids.some((id) => b.id === id || b.productIds?.includes(id)));
}

export function completeSizes(sizes: Partial<BikeSize>[]): boolean {
  return (
    sizes.length > 0 &&
    sizes.every((s) => s.reach && s.stack && s.seatTubeAngle && s.headTubeAngle && s.chainstay)
  );
}
