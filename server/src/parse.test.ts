import { describe, expect, it } from 'vitest';
import { detectStyle, detectStyleFromSources, extractProductIds, matchDatabase, parseBreadcrumbs, parseGeometryTable, parseJsonLd } from './parse.js';

const URL = 'https://www.decathlon.fr/p/velo-gravel-sram-apex-1x12v-grvl-af-beige/342976/c296m8766974';

describe('parse', () => {
  it('extrait les IDs', () => expect(extractProductIds(URL)).toEqual(['8766974', '342976']));
  it('parse JSON-LD', () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"Product","name":"GRVL AF","brand":{"name":"Van Rysel"}}]}</script>`;
    expect(parseJsonLd(html)).toMatchObject({ name: 'GRVL AF', brand: 'Van Rysel' });
  });
  it('parse tableau', () => {
    const s = parseGeometryTable([['', 'S', 'M'], ['Reach (mm)', '378', '391'], ['Stack', '549', '572']]);
    expect(s[1]).toMatchObject({ label: 'M', reach: 391, stack: 572 });
  });
  it('match base', () => {
    expect(matchDatabase([{ id: '8766974', brand: '', model: '', sizes: [], wheel: { bsd: 622, tyreWidth: 45 } }], URL)?.id).toBe('8766974');
  });
});

describe('detectStyle', () => {
  // Libellés réels (noms produits, URLs, fils d'Ariane) FR et EN.
  const cases: Array<[string, ReturnType<typeof detectStyle>]> = [
    ['Vélo gravel SRAM Apex 1x12V GRVL AF beige', 'gravel'],
    [URL, 'gravel'],
    ['Vélos > Vélos de route > Gravel', 'gravel'],
    ['https://www.canyon.com/fr-fr/velos-de-route/gravel/grizl/', 'gravel'],
    ['Specialized Diverge Comp Carbon', 'gravel'],
    ['Trek Checkpoint SL 6 AXS Gen 3', 'gravel'],
    ['Cannondale SuperX Cyclocross Bike', 'gravel'],
    ['All-Road Bikes', 'gravel'],
    ['Vélo de route Van Rysel NCR CF Tiagra', 'road'],
    ['Road Bikes > Endurance', 'road'],
    ['https://www.canyon.com/en-gb/road-bikes/aero-bikes/aeroad/', 'road'],
    ['Vélo de course carbone Shimano 105', 'road'],
    ['VTT semi-rigide 29" Rockrider XC 500', 'mtb'],
    ['Mountain Bikes > Trail > Stumpjumper', 'mtb'],
    ['VTT tout suspendu All Mountain', 'mtb'],
    ['https://www.decathlon.fr/browse/c0-sports/c1-velo-vtt/_/N-1k1mphv', 'mtb'],
    ['VTC Riverside 500', undefined],
    ['Vélo de ville Elops 520', undefined],
  ];
  it.each(cases)('%s → %s', (label, style) => expect(detectStyle(label)).toBe(style));
  // Faux positifs : mots ambigus seuls, hors contexte vélo → non détecté (ou bon style via modèle).
  const falsePositives: Array<[string, ReturnType<typeof detectStyle>]> = [
    ['Course de côte du Mont Ventoux', undefined],
    ['Itinéraire trail running en forêt', undefined],
    ['Casque aero pour le contre-la-montre', undefined],
    ['Sortie bikepacking en Écosse', undefined],
    ['Route nationale 7 : travaux', undefined],
    ['Vélo de ville Elops, course urbaine', undefined],
    ['Revolution 3 city bike', undefined],
    ['Cross-body bag', undefined],
    ['Trek Domane SL 6 trail tested', 'road'],
    ['Canyon Aeroad CF SLX 8', 'road'],
    ['https://www.example.fr/velo-route/domane-sl-5', 'road'],
    ['https://www.example.fr/velos-de-route/trail-tested/', 'road'],
    ['Gravel / VTT polyvalent', undefined],
    ['Vélo trail 29" Stumpjumper', 'mtb'],
    ['Vélo de course', 'road'],
  ];
  it.each(falsePositives)('faux positif : %s → %s', (label, style) => expect(detectStyle(label)).toBe(style));
  it('priorité aux sources fiables sur le nom', () => {
    expect(detectStyleFromSources(['Vélos de route'], ['Trail Master 3000 mountain bike'])).toBe('road');
    expect(detectStyleFromSources(['https://x.fr/velo-route/abc'], ['Super trail'])).toBe('road');
    expect(detectStyleFromSources(['Vélos'], ['Trek Domane SL 6'])).toBe('road');
    expect(detectStyleFromSources([], ['Course de côte'])).toBeUndefined();
  });
  it('route + nom gravel : gravel ; sources fiables contradictoires : non détecté', () => {
    expect(detectStyleFromSources(['Vélos de route'], ['Trek Checkpoint SL 6'])).toBe('gravel');
    expect(detectStyleFromSources(['VTT', 'Vélos de route'], [])).toBeUndefined();
  });
  it('plusieurs textes : gravel prioritaire', () => expect(detectStyle('Vélos de route', 'Gravel')).toBe('gravel'));
  it("fil d'Ariane JSON-LD", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Vélos' },
        { '@type': 'ListItem', position: 2, item: { name: 'VTT' } },
      ],
    })}</script>`;
    expect(parseBreadcrumbs(html)).toEqual(['Vélos', 'VTT']);
    expect(detectStyle(...parseBreadcrumbs(html))).toBe('mtb');
  });
});
