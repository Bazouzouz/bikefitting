import { describe, expect, it } from 'vitest';
import { allowedHosts, assertAllowedUrl, ForbiddenUrlError } from './security.js';

const bad = (u: string, hosts?: string[]) => expect(() => assertAllowedUrl(u, hosts)).toThrow(ForbiddenUrlError);

describe('assertAllowedUrl', () => {
  it('accepte un hôte de la liste blanche et ses sous-domaines', () => {
    expect(assertAllowedUrl('https://www.decathlon.fr/p/x').hostname).toBe('www.decathlon.fr');
    expect(assertAllowedUrl('http://canyon.com/').hostname).toBe('canyon.com');
  });
  it.each([
    'http://127.0.0.1/', 'http://10.0.0.1/', 'http://172.16.0.1/', 'http://172.31.255.255/', 'http://192.168.1.1/',
    'http://0.0.0.0/', 'http://169.254.169.254/latest/meta-data/', 'http://224.0.0.1/',
    'http://[::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[2001:db8::1]/',
    'http://localhost/', 'http://foo.localhost/', 'http://printer.local/', 'http://2130706433/', 'http://0x7f.1/',
  ])('refuse hôte privé %s même en liste blanche', (u) => {
    const h = new URL(u).hostname.replace(/^\[|\]$/g, '');
    bad(u, [h, 'localhost', '127.0.0.1', 'foo.localhost', 'printer.local']);
  });
  it.each(['ftp://decathlon.fr/', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x', 'pas une url'])(
    'refuse %s',
    (u) => bad(u),
  );
  it('refuse un domaine hors liste et les faux sous-domaines', () => {
    bad('https://evil.com/');
    bad('https://decathlon.fr.evil.com/');
    bad('https://notdecathlon.fr/');
  });
  it('ALLOWED_HOSTS étend la liste', () => {
    expect(allowedHosts('Shop.Example.com, ,foo.org')).toEqual(expect.arrayContaining(['shop.example.com', 'foo.org']));
    expect(allowedHosts(undefined)).toContain('decathlon.fr');
    expect(assertAllowedUrl('https://a.shop.example.com/', allowedHosts('shop.example.com')).hostname).toBe('a.shop.example.com');
    bad('https://shop.example.com/');
  });
});
