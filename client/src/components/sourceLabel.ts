import type { BikeSource } from '@bikefit/shared';

export const SOURCE_LABEL: Record<BikeSource, string> = {
  jsonld: 'Données structurées de la page (JSON-LD)',
  chromium: 'Page rendue (Chromium)',
  database: 'Base de géométries interne',
  manual: 'Saisie manuelle',
};
