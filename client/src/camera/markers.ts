/**
 * Marqueurs ArUco imprimables — génération SVG pure (pas de DOM).
 */

export const ARUCO_DICTIONARY = 'ARUCO_MIP_36h12';

export const MARKER_IDS = {
  /** Posé sur l'axe de pédalier : son centre = axe BB. */
  bb: 0,
  /** Sous le bec de selle : bord supérieur du carré noir sous la pointe. */
  saddle: 1,
} as const;

/** Côté par défaut du carré noir (mm). Plus grand = plus précis (voir README). */
export const DEFAULT_MARKER_SIZE_MM = 80;

/**
 * Dessin d'un marqueur dans un repère en mm : carré noir de côté `sizeMm`
 * (bordure noire d'une cellule + n×n cellules de données, 1 = blanc).
 */
export function markerSvgGroup(bits: string, x: number, y: number, sizeMm: number): string {
  const n = Math.round(Math.sqrt(bits.length));
  if (n * n !== bits.length) throw new Error('Code de marqueur invalide');
  const cell = sizeMm / (n + 2);
  let out = `<rect x="${x}" y="${y}" width="${sizeMm}" height="${sizeMm}" fill="#000"/>`;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (bits[r * n + c] === '1') {
        const cx = +(x + (c + 1) * cell).toFixed(3);
        const cy = +(y + (r + 1) * cell).toFixed(3);
        const w = +cell.toFixed(3);
        // léger débord pour éviter les liserés d'anticrénelage entre cellules
        out += `<rect x="${cx}" y="${cy}" width="${w + 0.01}" height="${w + 0.01}" fill="#fff"/>`;
      }
    }
  }
  return out;
}

/**
 * Marge blanche (mm) entre le carré noir et le trait de coupe pointillé. C'est
 * aussi le décalage par défaut bec de selle -> haut du carré noir quand le carton
 * découpé est posé bord supérieur sous la pointe de selle.
 */
export function quietZoneMm(sizeMm: number): number {
  return Math.max(8, sizeMm * 0.15);
}

export interface PrintableMarker {
  bits: string;
  label: string;
  hint: string;
}

/**
 * Page A4 (210×297 mm) imprimable à 100 % avec les marqueurs, leurs consignes,
 * un trait de coupe et une règle de contrôle de 100 mm.
 */
export function markerPageSvg(markers: PrintableMarker[], sizeMm: number): string {
  const W = 210;
  const H = 297;
  const quiet = quietZoneMm(sizeMm);
  const block = sizeMm + 2 * quiet;
  const blockH = block + 18;
  let y = 15;
  let body = '';
  for (const m of markers) {
    const x0 = (W - block) / 2;
    body += `<rect x="${x0}" y="${y}" width="${block}" height="${block}" fill="none" stroke="#999" stroke-width="0.3" stroke-dasharray="2 2"/>`;
    body += markerSvgGroup(m.bits, x0 + quiet, y + quiet, sizeMm);
    body += `<text x="${W / 2}" y="${y + block + 6}" font-size="5" text-anchor="middle" font-family="sans-serif" font-weight="bold">${escapeXml(m.label)}</text>`;
    body += `<text x="${W / 2}" y="${y + block + 12}" font-size="3.5" text-anchor="middle" font-family="sans-serif">${escapeXml(m.hint)}</text>`;
    y += blockH + 6;
  }
  const ry = Math.min(H - 20, y + 4);
  body += `<g font-family="sans-serif" font-size="3.5"><line x1="55" y1="${ry}" x2="155" y2="${ry}" stroke="#000" stroke-width="0.4"/>`;
  for (let i = 0; i <= 10; i++) {
    const tx = 55 + i * 10;
    body += `<line x1="${tx}" y1="${ry}" x2="${tx}" y2="${ry - (i % 5 === 0 ? 4 : 2)}" stroke="#000" stroke-width="0.3"/>`;
  }
  body += `<text x="105" y="${ry + 6}" text-anchor="middle">Contrôle : ce trait doit mesurer 100 mm. Carré noir = ${sizeMm} mm. Imprimer à 100 % (sans « ajuster à la page »).</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${body}</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Nombre de cellules (bordure incluse) sur un côté du carré noir. */
export function markerCells(bits: string): number {
  return Math.round(Math.sqrt(bits.length)) + 2;
}
