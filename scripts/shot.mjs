// Captures d'écran des états clés de l'application.
// Usage (depuis la racine) : `npm run dev` dans un terminal, puis `node scripts/shot.mjs`.
// Variables optionnelles : SHOT_URL (défaut : https://localhost:5173) ; SHOT_ETATS (préfixes d'états séparés par des virgules,
// ex. `selle,cockpit`) pour ne capturer qu'une partie.
// Les PNG sont écrits dans scripts/shots/ au format <etat>-<largeur>-<motion>.png.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.SHOT_URL ?? 'https://localhost:5173';
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];
const ETATS = (process.env.SHOT_ETATS ?? '').split(',').filter(Boolean);
const MOTIONS = ['reduce', 'no-preference'];

// Chaque état part d'une page neuve et exécute ses étapes dans l'ordre.
// Pour ajouter un état : une entrée { name, steps } avec des fonctions async (page) => {}.
const versReglages = [saisieManuelle, validerVelo, suivant, remplirMesures, suivant, suivant];

const STATES = [
  { name: 'accueil', steps: [] },
  { name: 'velo', steps: [saisieManuelle, validerVelo] },
  { name: 'morphologie', steps: [saisieManuelle, validerVelo, suivant] },
  { name: 'taille', steps: [saisieManuelle, validerVelo, suivant, remplirMesures, suivant] },
  { name: 'reglages', steps: versReglages },
  // Zooms de la phase Réglages (vue de côté, la vue par défaut ; capture de la fenêtre seule : la scène est collante) : temps 1 à 3 de chaque parcours guidé, puis éclaté ouvert.
  { name: 'selle-zoom', steps: [...versReglages, zoomSelle], fullPage: false },
  { name: 'selle-temps1', steps: [...versReglages, zoomSelle, apresAnim], fullPage: false },
  { name: 'selle-temps2', steps: [...versReglages, zoomSelle, etapeSuivante, apresAnim], fullPage: false },
  { name: 'selle-temps3', steps: [...versReglages, zoomSelle, etapeSuivante, etapeSuivante, apresAnim], fullPage: false },
  { name: 'selle-eclate', steps: [...versReglages, zoomSelle, eclate, apresAnim], fullPage: false },
  { name: 'cockpit-zoom', steps: [...versReglages, zoomCockpit], fullPage: false },
  { name: 'cockpit-temps1', steps: [...versReglages, zoomCockpit, apresAnim], fullPage: false },
  { name: 'cockpit-temps2', steps: [...versReglages, zoomCockpit, etapeSuivante, apresAnim], fullPage: false },
  { name: 'cockpit-temps3', steps: [...versReglages, zoomCockpit, etapeSuivante, etapeSuivante, apresAnim], fullPage: false },
  { name: 'cockpit-eclate', steps: [...versReglages, zoomCockpit, eclate, apresAnim], fullPage: false },
  // Mobile seulement : page défilée, pour vérifier que la scène reste collante.
  { name: 'defile', steps: [saisieManuelle, validerVelo, suivant, remplirMesures, defiler], maxWidth: 900, fullPage: false },
];

async function saisieManuelle(page) {
  await page.getByRole('button', { name: 'Saisie manuelle' }).click();
}

async function validerVelo(page) {
  // Le sélecteur « Style de vélo » n'est choisi que s'il existe (il est optionnel aujourd'hui).
  const style = page.getByLabel('Style de vélo');
  if ((await style.count()) > 0) {
    const tag = await style.first().evaluate((el) => el.tagName);
    if (tag === 'SELECT') {
      await style.first().selectOption({ index: 1 });
    }
  }
  await page.getByRole('button', { name: 'Utiliser ce vélo' }).click();
}

async function suivant(page) {
  await page.getByRole('button', { name: 'Suivant →' }).click();
}

// Remplit les mesures du cycliste (valeurs dans les bornes de RiderPhase).
async function remplirMesures(page) {
  const mesures = { height: 178, inseam: 83, shoeSize: 43, torso: 60, arm: 62, shoulderWidth: 42 };
  for (const [k, v] of Object.entries(mesures)) {
    await page.locator(`#rider-${k}`).fill(String(v));
  }
}

async function zoomSelle(page) {
  await page.getByRole('button', { name: 'Zoomer sur la selle' }).click();
  await page.getByRole('button', { name: "← Vue d'ensemble" }).waitFor();
}

async function zoomCockpit(page) {
  await page.getByRole('button', { name: 'Zoomer sur le cockpit' }).click();
  await page.getByRole('button', { name: "← Vue d'ensemble" }).waitFor();
}

async function etapeSuivante(page) {
  await page.getByRole('button', { name: 'Étape suivante →' }).click();
}

async function eclate(page) {
  await page.getByRole('button', { name: 'Vue éclatée' }).click();
  // Le panneau défile avec la page. Mobile (< 900 px) : la scène collante est au-dessus et masque le haut de l'éclaté,
  // donc on place son haut juste sous la scène. Bureau (2 colonnes) : la scène est à côté, pas au-dessus,
  // donc on centre simplement l'éclaté dans la fenêtre. Puis on attend la fin de l'animation de défilement (800 ms, rien en reducedMotion).
  await page.locator('.sg-xp, .cg-xp').first().evaluate((el) => {
    const scene = document.querySelector('.ws-stage');
    const r = el.getBoundingClientRect();
    const s = scene?.getBoundingClientRect();
    const dessus = s && s.left < r.right && s.right > r.left; // la scène recouvre l'éclaté en largeur : empilés
    if (!dessus) {
      window.scrollBy(0, r.top + r.height / 2 - window.innerHeight / 2);
      return;
    }
    window.scrollBy(0, r.top - s.bottom - 16);
  });
  const reduit = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (!reduit) {
    await page.waitForTimeout(800);
  }
}

// Laisse finir la caméra (850 ms) et la vue éclatée (700 ms) avant la capture.
async function apresAnim(page) {
  await page.waitForTimeout(1200);
}

async function defiler(page) {
  await page.evaluate(() => window.scrollTo(0, Math.min(600, document.documentElement.scrollHeight)));
  await page.waitForTimeout(300);
}

async function capturer(browser, viewport, reducedMotion, state) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport,
    reducedMotion,
  });
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'load' });
    for (const etape of state.steps) {
      await etape(page);
    }
    await page.evaluate(() => document.fonts.ready);

    const pleinePage = state.fullPage ?? true;
    if (pleinePage) {
      // Artefact de capture pleine page : les éléments sticky recouvriraient le contenu. On les passe en static
      // (feuille temporaire, uniquement pour les états fullPage) ; les captures fenêtre gardent le rendu réel.
      await page.addStyleTag({
        content: '.app-header, .ws-header, .ws-stage, .rider-side { position: static !important; }',
      });
      await page.waitForTimeout(100);
    }

    const nom = `${state.name}-${viewport.width}-${reducedMotion}.png`;
    await page.screenshot({ path: path.join(OUT_DIR, nom), fullPage: pleinePage });

    // Contrôle simple : la page déborde-t-elle horizontalement ?
    const debordement = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    console.log(`${nom} : débordement horizontal : ${debordement ? 'oui' : 'non'}`);
    return true;
  } finally {
    await context.close();
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  let echecs = 0;
  try {
    for (const viewport of VIEWPORTS) {
      for (const reducedMotion of MOTIONS) {
        for (const state of STATES) {
          if (state.maxWidth && viewport.width > state.maxWidth) continue;
          if (ETATS.length > 0 && !ETATS.some((e) => state.name.startsWith(e))) continue;
          try {
            await capturer(browser, viewport, reducedMotion, state);
          } catch (err) {
            if (/net::ERR_|ECONNREFUSED/.test(String(err?.message))) {
              throw err; // Serveur injoignable : géré plus bas.
            }
            echecs += 1;
            console.error(`Échec (${state.name}, ${viewport.width}, ${reducedMotion}) : ${err.message}`);
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  if (echecs > 0) {
    console.error(`${echecs} capture(s) en échec.`);
    process.exitCode = 1;
  } else {
    console.log(`Captures terminées dans ${OUT_DIR}`);
  }
}

main().catch((err) => {
  if (/net::ERR_|ECONNREFUSED/.test(String(err?.message))) {
    console.error(`Connexion impossible à ${BASE_URL}. Lance npm run dev à la racine du projet, puis relance ce script.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
