// Audit d'accessibilité (axe-core via Playwright) des états clés de l'application.
// Usage (depuis la racine) : `npm run dev` dans un terminal, puis `node scripts/a11y.mjs`.
// Variable optionnelle : SHOT_URL (défaut : https://localhost:5173).
// Rapporte toutes les violations (règle, impact, sélecteur, résumé) ; code de sortie 1 s'il y en a de gravité « serious » ou « critical ».
// Le script ne corrige rien : il liste.

import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const BASE_URL = process.env.SHOT_URL ?? 'https://localhost:5173';
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];
const IMPACTS = new Set(['serious', 'critical']);

// Mêmes états (et mêmes étapes) que scripts/shot.mjs : chacun part d'une page neuve.
const versReglages = [saisieManuelle, validerVelo, suivant, remplirMesures, suivant, suivant];
const STATES = [
  { name: 'accueil', steps: [] },
  { name: 'velo-saisie', steps: [saisieManuelle] },
  { name: 'morphologie', steps: [saisieManuelle, validerVelo, suivant] },
  { name: 'taille', steps: [saisieManuelle, validerVelo, suivant, remplirMesures, suivant] },
  { name: 'reglages', steps: versReglages },
  { name: 'selle-zoom', steps: [...versReglages, zoomSelle] },
  { name: 'cockpit-zoom', steps: [...versReglages, zoomCockpit] },
  { name: 'selle-temps2-eclate', steps: [...versReglages, zoomSelle, etapeSuivante, eclate] },
  { name: 'cockpit-temps2-eclate', steps: [...versReglages, zoomCockpit, etapeSuivante, eclate] },
];

async function saisieManuelle(page) {
  await page.getByRole('button', { name: 'Saisie manuelle' }).click();
}

async function validerVelo(page) {
  const style = page.getByLabel('Style de vélo');
  if ((await style.count()) > 0) {
    const tag = await style.first().evaluate((el) => el.tagName);
    if (tag === 'SELECT') await style.first().selectOption({ index: 1 });
  }
  await page.getByRole('button', { name: 'Utiliser ce vélo' }).click();
}

async function suivant(page) {
  await page.getByRole('button', { name: 'Suivant →' }).click();
}

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
  await page.locator('.sg-xp, .cg-xp').first().waitFor();
}

async function auditer(browser, viewport, state) {
  // Mouvement réduit : états finaux immédiats, pas de mesure pendant une transition (contrastes faussés).
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'load' });
    for (const etape of state.steps) await etape(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
    return violations;
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch();
  let total = 0;
  let echecs = 0;
  try {
    for (const viewport of VIEWPORTS) {
      for (const state of STATES) {
        const label = `${state.name} ${viewport.width}px`;
        try {
          const violations = await auditer(browser, viewport, state);
          if (violations.length === 0) {
            console.log(`${label} : aucune violation`);
            continue;
          }
          console.log(`${label} : ${violations.length} règle(s) en violation`);
          for (const v of violations) {
            if (IMPACTS.has(v.impact)) total += v.nodes.length;
            console.log(`  [${v.impact}] ${v.id} : ${v.help}`);
            for (const n of v.nodes) console.log(`    ${n.target.join(' ')}\n      ${n.failureSummary?.split('\n').slice(1, 2).join('').trim() ?? ''}`);
          }
        } catch (err) {
          if (/net::ERR_|ECONNREFUSED/.test(String(err?.message))) throw err;
          echecs += 1;
          console.error(`Échec (${label}) : ${err.message}`);
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`${total} élément(s) en violation sérieuse/critique, ${echecs} état(s) en échec.`);
  if (total > 0 || echecs > 0) process.exitCode = 1;
}

main().catch((err) => {
  if (/net::ERR_|ECONNREFUSED/.test(String(err?.message))) {
    console.error(`Connexion impossible à ${BASE_URL}. Lance npm run dev à la racine du projet, puis relance ce script.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
