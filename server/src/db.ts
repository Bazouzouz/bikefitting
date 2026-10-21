import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BikeLookupResponse } from '@bikefit/shared';
import type { DbBike } from './parse.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.resolve(here, '../data/bikes.json');
const CACHE_DIR = path.resolve(here, '../cache');

export async function loadBikes(): Promise<DbBike[]> {
  return JSON.parse(await fs.readFile(DB_FILE, 'utf8')) as DbBike[];
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url.trim();
  }
}

export const cacheKey = (url: string) => createHash('sha256').update(normalizeUrl(url)).digest('hex') + '.json';

export async function readCache(url: string): Promise<BikeLookupResponse | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(CACHE_DIR, cacheKey(url)), 'utf8'));
  } catch {
    return null;
  }
}

export async function writeCache(url: string, res: BikeLookupResponse): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(CACHE_DIR, cacheKey(url)), JSON.stringify(res, null, 2));
}
