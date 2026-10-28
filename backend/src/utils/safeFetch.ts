import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch as undiciFetch } from 'undici';

/**
 * SSRF protection for outbound requests to URLs a user chose (custom AI
 * endpoints). Three layers:
 *  1. only globally routable unicast addresses are accepted (private, loopback,
 *     link-local, CGNAT, multicast, reserved, documentation, NAT64/6to4/Teredo
 *     and IPv4-mapped IPv6 forms of those are all rejected);
 *  2. the check runs inside the connection's DNS lookup, so the address that is
 *     vetted is the address that is connected to (no DNS-rebinding window);
 *  3. redirects are refused, so a public host cannot bounce us inward.
 */

/** True when `ip` is a public unicast address. Anything unparsable is rejected. */
export function isPublicAddress(ip: string): boolean {
  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.parse(ip.replace(/^\[|\]$/g, '').replace(/%.*$/, ''));
  } catch {
    return false;
  }
  if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) addr = (addr as ipaddr.IPv6).toIPv4Address();
  return addr.range() === 'unicast';
}

export class BlockedAddressError extends Error {
  readonly code = 'ERR_BLOCKED_ADDRESS';
  constructor(host: string) {
    super(`Connections to non-public address ${host} are not allowed`);
    this.name = 'BlockedAddressError';
  }
}

export type Resolver = (hostname: string) => Promise<LookupAddress[]>;

const systemResolver: Resolver = (hostname) =>
  new Promise((resolve, reject) => dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => (err ? reject(err) : resolve(addresses))));

type LookupCallback = (err: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void;

/**
 * A `dns.lookup`-compatible function that only ever yields public addresses.
 * Exported (with an injectable resolver) so it can be unit tested.
 */
export function checkedLookup(resolve: Resolver = systemResolver, isAllowed: (ip: string) => boolean = isPublicAddress) {
  return (hostname: string, options: { all?: boolean; family?: number | string } | LookupCallback, maybeCallback?: LookupCallback) => {
    const callback = (typeof options === 'function' ? options : maybeCallback)!;
    const opts = typeof options === 'function' ? {} : (options ?? {});
    resolve(hostname).then(
      (addresses) => {
        const family = opts.family === 'IPv4' ? 4 : opts.family === 'IPv6' ? 6 : Number(opts.family) || 0;
        const candidates = family ? addresses.filter((a) => a.family === family) : addresses;
        if (!candidates.length) return callback(Object.assign(new Error(`No address found for ${hostname}`), { code: 'ENOTFOUND' }));
        // Reject when ANY answer is internal: a mixed answer is a rebinding attempt.
        if (addresses.some((a) => !isAllowed(a.address))) return callback(new BlockedAddressError(hostname));
        if (opts.all) callback(null, candidates);
        else callback(null, candidates[0].address, candidates[0].family);
      },
      (err: NodeJS.ErrnoException) => callback(err),
    );
  };
}

/** Throws unless the URL is http(s) and, when its host is an IP literal, that IP is allowed. */
export function assertFetchableUrl(url: string, isAllowed: (ip: string) => boolean = isPublicAddress) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new BlockedAddressError(parsed.protocol);
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  // IP literals never go through DNS lookup, so check them here.
  if (isIP(host) && !isAllowed(host)) throw new BlockedAddressError(host);
  return parsed;
}

/**
 * Builds a fetch() for user-chosen URLs: allowed addresses only, checked inside
 * the connection's own DNS lookup, and redirects refused. `isAllowed` is
 * injectable for tests (e.g. to exercise the redirect rule against localhost).
 */
export function createGuardedFetch(isAllowed: (ip: string) => boolean = isPublicAddress, resolve: Resolver = systemResolver) {
  const agent = new Agent({ connect: { lookup: checkedLookup(resolve, isAllowed) as never, timeout: 15_000 } });
  return async (url: string, init: RequestInit = {}): Promise<Response> => {
    assertFetchableUrl(url, isAllowed);
    return (await undiciFetch(url, { ...(init as object), redirect: 'error', dispatcher: agent } as never)) as unknown as Response;
  };
}

let defaultGuardedFetch: ReturnType<typeof createGuardedFetch> | undefined;

/** fetch() for user-chosen URLs: public addresses only, pinned at connect time, no redirects. */
export function guardedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  defaultGuardedFetch ??= createGuardedFetch();
  return defaultGuardedFetch(url, init);
}

// ---------------------------------------------------------------- provider endpoints

/**
 * Base URLs that came from a user (Settings "custom" endpoint and presets).
 * Server-configured endpoints from .env (including a local Ollama) are trusted
 * and keep using the plain fetch.
 */
const untrustedBaseUrls = new Set<string>();
const normalizeBase = (u: string) => u.replace(/\/+$/, '');

export function markUntrustedEndpoint(baseUrl: string) {
  if (!baseUrl) return;
  // Never evicted: forgetting an entry would silently make that endpoint trusted.
  untrustedBaseUrls.add(normalizeBase(baseUrl));
}

export function isUntrustedEndpoint(url: string) {
  for (const base of untrustedBaseUrls) if (url === base || url.startsWith(`${base}/`)) return true;
  return false;
}

/** Used by the AI provider adapters: guarded for user-chosen endpoints, plain fetch otherwise. */
export function providerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return isUntrustedEndpoint(url) ? guardedFetch(url, init) : fetch(url, init);
}
