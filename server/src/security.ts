import net from 'node:net';

export class ForbiddenUrlError extends Error {}

const DEFAULT_HOSTS = [
  'decathlon.fr', 'decathlon.com', 'decathlon.co.uk', 'decathlon.de', 'decathlon.es', 'decathlon.it', 'decathlon.be',
  'vanrysel.com', 'canyon.com', 'trekbikes.com', 'specialized.com', 'giant-bicycles.com', 'cube.eu',
  'bmc-switzerland.com', 'scott-sports.com', 'cannondale.com', 'rosebikes.fr', 'rosebikes.com', 'btwin.com',
  'alltricks.fr', 'probikeshop.fr', 'bike-discount.de', 'wiggle.com', 'chainreactioncycles.com',
];

export function allowedHosts(env = process.env.ALLOWED_HOSTS): string[] {
  return [...DEFAULT_HOSTS, ...(env ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)];
}

function isPrivateIp(h: string): boolean {
  if (net.isIPv4(h)) {
    const [a, b] = h.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  return net.isIPv6(h); // pas d'IPv6 littérale pour un commerçant
}

/** Lève ForbiddenUrlError si l'URL n'est pas http(s) vers un domaine commerçant autorisé. */
export function assertAllowedUrl(raw: string, hosts = allowedHosts()): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ForbiddenUrlError('URL invalide.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ForbiddenUrlError('Seules les URL http(s) sont acceptées.');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || isPrivateIp(host))
    throw new ForbiddenUrlError('Hôte privé ou local refusé.');
  if (!hosts.some((d) => host === d || host.endsWith('.' + d)))
    throw new ForbiddenUrlError(`Domaine non autorisé : ${host} (variable ALLOWED_HOSTS pour en ajouter).`);
  return u;
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // curl / même origine
  try {
    const h = new URL(origin).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
  } catch {
    return false;
  }
}
