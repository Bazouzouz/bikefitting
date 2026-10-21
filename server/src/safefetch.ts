import { assertAllowedUrl, ForbiddenUrlError } from './security.js';

export const MAX_REDIRECTS = 3;
export const MAX_BODY_BYTES = 3 * 1024 * 1024;

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  hosts?: string[];
  fetchImpl?: typeof fetch;
}

/** Lit un corps de réponse en flux, tronqué à maxBytes. */
export async function readLimitedText(r: Response, maxBytes = MAX_BODY_BYTES): Promise<string> {
  if (!r.body) return '';
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - total;
    const part = value.length > room ? value.subarray(0, room) : value;
    chunks.push(part);
    total += part.length;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * fetch avec redirections manuelles (max 3), chaque cible revalidée par assertAllowedUrl,
 * timeout global et corps limité. Retourne null si la réponse finale n'est pas 2xx.
 */
export async function safeFetchText(url: string, opts: SafeFetchOptions = {}): Promise<{ text: string; url: string } | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 15000);
  let current = assertAllowedUrl(url, opts.hosts).toString();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const r = await doFetch(current, { headers: opts.headers, redirect: 'manual', signal });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location');
      await r.body?.cancel().catch(() => {});
      if (!loc) return null;
      current = assertAllowedUrl(new URL(loc, current).toString(), opts.hosts).toString();
      continue;
    }
    if (!r.ok) {
      await r.body?.cancel().catch(() => {});
      return null;
    }
    return { text: await readLimitedText(r, opts.maxBytes), url: current };
  }
  throw new ForbiddenUrlError(`Trop de redirections (max ${MAX_REDIRECTS}).`);
}
