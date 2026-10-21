import { chromium, type BrowserContext, type Page } from 'playwright';
import { assertAllowedUrl } from './security.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const here = path.dirname(fileURLToPath(import.meta.url));
const PROFILE = path.resolve(here, '../cache/chromium-profile');

export interface PageCapture {
  html: string;
  tables: string[][][];
  blocked: boolean;
}

const isBlocked = (html: string, title: string) =>
  /just a moment|captcha|datadome|access denied|attention required/i.test(title) ||
  /challenges\.cloudflare\.com|captcha-delivery\.com/i.test(html.slice(0, 20000)) && html.length < 30000;

/** Bloque toute navigation du document principal (y compris redirections) vers un hôte non autorisé/privé. */
export async function guardNavigation(page: Page): Promise<void> {
  await page.route('**/*', (route) => {
    const req = route.request();
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
      try {
        assertAllowedUrl(req.url());
      } catch {
        return route.abort('blockedbyclient');
      }
    }
    return route.continue();
  });
}

async function capture(page: Page, url: string): Promise<PageCapture> {
  await guardNavigation(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  let html = await page.content();
  if (isBlocked(html, await page.title())) {
    // laisse une chance au challenge de se résoudre seul
    await page.waitForTimeout(8000);
    html = await page.content();
    if (isBlocked(html, await page.title())) return { html, tables: [], blocked: true };
  }
  for (const sel of ['#onetrust-accept-btn-handler', 'button:has-text("Tout accepter")', 'button:has-text("Accept all")'])
    await page.locator(sel).first().click({ timeout: 1500 }).catch(() => {});
  for (const name of [/caract[ée]ristiques/i, /specifications|specs/i, /g[ée]om[ée]trie|geometry/i]) {
    await page.getByRole('tab', { name }).first().click({ timeout: 2000 }).catch(() => {});
    await page.getByText(name).first().click({ timeout: 1500 }).catch(() => {});
  }
  await page.waitForSelector('table', { timeout: 8000 }).catch(() => {});
  const tables = (await page.evaluate(
    `Array.from(document.querySelectorAll('table')).map(t => Array.from(t.querySelectorAll('tr')).map(r => Array.from(r.children).map(c => (c.textContent || '').trim())))`,
  )) as string[][][];
  html = await page.content();
  return { html, tables, blocked: false };
}

/** Headless d'abord, puis fenêtre visible avec contexte persistant si bloqué. */
export async function fetchWithChromium(url: string): Promise<PageCapture> {
  const opts = { userAgent: UA, locale: 'fr-FR', viewport: { width: 1366, height: 900 } };
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext(opts);
    const res = await capture(await ctx.newPage(), url);
    if (!res.blocked) return res;
  } finally {
    await browser.close();
  }
  let ctx: BrowserContext | undefined;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE, {
      ...opts,
      headless: false,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    return await capture(ctx.pages()[0] ?? (await ctx.newPage()), url);
  } finally {
    await ctx?.close();
  }
}
