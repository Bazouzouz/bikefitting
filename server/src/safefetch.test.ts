import { describe, expect, it, vi } from 'vitest';
import { readLimitedText, safeFetchText } from './safefetch.js';
import { ForbiddenUrlError } from './security.js';

const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });
const ok = (body = 'ok') => new Response(body, { status: 200 });
const mk = (map: Record<string, () => Response>) =>
  vi.fn(async (u: string | URL | Request) => (map[String(u)] ?? (() => new Response('', { status: 404 })))()) as unknown as typeof fetch;

describe('safeFetchText', () => {
  it('suit une redirection vers un hôte autorisé', async () => {
    const f = mk({ 'https://decathlon.fr/a': () => redirect('/b'), 'https://decathlon.fr/b': () => ok('hello') });
    const r = await safeFetchText('https://decathlon.fr/a', { fetchImpl: f });
    expect(r?.text).toBe('hello');
    expect(vi.mocked(f).mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });
  it.each(['http://169.254.169.254/latest', 'http://127.0.0.1:3001/', 'https://evil.com/', 'file:///etc/passwd'])(
    'refuse une redirection vers %s',
    async (to) => {
      const f = mk({ 'https://decathlon.fr/a': () => redirect(to) });
      await expect(safeFetchText('https://decathlon.fr/a', { fetchImpl: f })).rejects.toThrow(ForbiddenUrlError);
      expect(f).toHaveBeenCalledTimes(1);
    },
  );
  it('limite à 3 redirections', async () => {
    const f = mk({
      'https://canyon.com/1': () => redirect('/2'),
      'https://canyon.com/2': () => redirect('/3'),
      'https://canyon.com/3': () => redirect('/4'),
      'https://canyon.com/4': () => redirect('/5'),
      'https://canyon.com/5': () => ok(),
    });
    await expect(safeFetchText('https://canyon.com/1', { fetchImpl: f })).rejects.toThrow(/redirections/);
    const g = mk({
      'https://canyon.com/1': () => redirect('/2'),
      'https://canyon.com/2': () => redirect('/3'),
      'https://canyon.com/3': () => redirect('/4'),
      'https://canyon.com/4': () => ok('fin'),
    });
    expect((await safeFetchText('https://canyon.com/1', { fetchImpl: g }))?.text).toBe('fin');
  });
  it('retourne null si non 2xx ou Location absente', async () => {
    expect(await safeFetchText('https://canyon.com/x', { fetchImpl: mk({}) })).toBeNull();
    const f = mk({ 'https://canyon.com/x': () => new Response(null, { status: 302 }) });
    expect(await safeFetchText('https://canyon.com/x', { fetchImpl: f })).toBeNull();
  });
  it("refuse l'URL initiale interdite sans appeler fetch", async () => {
    const f = mk({});
    await expect(safeFetchText('http://localhost/', { fetchImpl: f })).rejects.toThrow(ForbiddenUrlError);
    expect(f).not.toHaveBeenCalled();
  });
  it('tronque le corps', async () => {
    expect(await readLimitedText(ok('abcdefghij'), 4)).toBe('abcd');
    const r = await safeFetchText('https://canyon.com/x', { maxBytes: 5, fetchImpl: mk({ 'https://canyon.com/x': () => ok('0123456789') }) });
    expect(r?.text).toBe('01234');
  });
});
