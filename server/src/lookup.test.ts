import { describe, expect, it } from 'vitest';
import { CACHE_VERSION, fromHtml, resolveStyle, validCached } from './lookup.js';
import { loadBikes } from './db.js';
import { cacheKey } from './db.js';
import { assertAllowedUrl } from './security.js';

const ld = {
  '@type': 'Product',
  name: 'GRVL AF',
  brand: { name: 'Van Rysel' },
  additionalProperty: [
    { name: 'Reach M', value: '391 mm' },
    { name: 'Stack M', value: '572' },
    { name: 'S - Reach', value: '378' },
    { name: 'S - Stack', value: '549' },
  ],
};
const html = `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;

describe('lookup', () => {
  it('JSON-LD additionalProperty -> tailles', () => {
    const w = fromHtml(html, [])!;
    expect(w.name).toBe('GRVL AF');
    expect(w.sizes).toHaveLength(2);
    expect(w.sizes.find((s) => s.label === 'M')).toMatchObject({ reach: 391, stack: 572 });
  });
  it('__NEXT_DATA__ -> tailles', () => {
    const nd = { props: { sizes: [{ size: 'L', reach: 400, stack: 590 }] } };
    const w = fromHtml(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nd)}</script>`, [])!;
    expect(w.sizes[0]).toMatchObject({ label: 'L', reach: 400, stack: 590 });
  });
  it('sans données -> null', () => expect(fromHtml('<html></html>', [])).toBeNull());
  it('clé de cache : hash sans troncature', () => {
    const base = 'https://www.decathlon.fr/' + 'a'.repeat(200);
    expect(cacheKey(base + '1')).not.toBe(cacheKey(base + '2'));
    expect(cacheKey(base)).toMatch(/^[0-9a-f]{64}\.json$/);
  });
  it('SSRF', () => {
    expect(() => assertAllowedUrl('https://www.decathlon.fr/p/x')).not.toThrow();
    for (const u of ['http://127.0.0.1/', 'http://localhost:3001/', 'http://169.254.169.254/', 'file:///etc/passwd', 'https://evil.com/', 'https://decathlon.fr.evil.com/'])
      expect(() => assertAllowedUrl(u)).toThrow();
  });
});

describe('version du cache', () => {
  const res = { bike: { id: 'x', brand: '', model: '', style: 'gravel', sizes: [], wheel: { bsd: 622, tyreWidth: 28 } }, warnings: [], source: 'jsonld' } as never;
  it('version courante : acceptée, version retirée', () => {
    const r = validCached({ ...(res as object), cacheVersion: CACHE_VERSION } as never)!;
    expect(r).toBeTruthy();
    expect('cacheVersion' in r).toBe(false);
  });
  it('version absente, ancienne ou future : ignorée (même avec un style)', () => {
    expect(validCached(res)).toBeNull();
    expect(validCached({ ...(res as object), cacheVersion: CACHE_VERSION - 1 } as never)).toBeNull();
    expect(validCached({ ...(res as object), cacheVersion: CACHE_VERSION + 1 } as never)).toBeNull();
    expect(validCached(null)).toBeNull();
  });
});

describe('style', () => {
  it("base locale avec style explicite : pas d'avertissement", () =>
    expect(resolveStyle('gravel', [])).toEqual({ style: 'gravel', warnings: [] }));
  it("gravel deviné : pas d'avertissement", () => expect(resolveStyle(undefined, ['Vélo gravel'])).toEqual({ style: 'gravel', warnings: [] }));
  it('route devinée : gravel + avertissement', () => {
    const r = resolveStyle(undefined, ['Vélo de route']);
    expect(r.style).toBe('gravel');
    expect(r.warnings[0]).toMatch(/Style deviné : route.*dessin gravel utilisé/);
  });
  it('non reconnu : gravel + à confirmer', () => {
    const r = resolveStyle(undefined, ['Riverside 500']);
    expect(r.style).toBe('gravel');
    expect(r.warnings[0]).toMatch(/Style non reconnu : à confirmer/);
  });
  it('style explicite non dessiné : dessin gravel utilisé', () =>
    expect(resolveStyle('mtb', []).warnings[0]).toMatch(/dessin gravel utilisé/));
  it("fromHtml : indices de style (nom, catégorie, fil d'Ariane)", () => {
    const page = `<script type="application/ld+json">${JSON.stringify({ ...ld, category: 'Vélos gravel' })}</script>`;
    expect(fromHtml(page, [])!.hints).toEqual(['GRVL AF', 'Vélos gravel']);
  });
  it('base locale : GRVL gravel, tube de direction différent à chaque taille', async () => {
    const grvl = (await loadBikes()).find((b) => b.id === '8766974')!;
    expect(grvl.style).toBe('gravel');
    const htl = grvl.sizes.map((s) => s.headTubeLength);
    const stl = grvl.sizes.map((s) => s.seatTubeLength);
    expect(htl.every((v) => typeof v === 'number')).toBe(true);
    expect(new Set(htl).size).toBe(grvl.sizes.length);
    expect(new Set(stl).size).toBe(grvl.sizes.length);
    expect(grvl.unverified?.some((u) => /headTubeLength/.test(u))).toBe(true);
  });
});
