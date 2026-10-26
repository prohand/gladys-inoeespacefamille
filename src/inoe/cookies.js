// -----------------------------------------------------------------------------
// A minimal cookie jar.
//
// The iNoé session lives in cookies: the identity service (ism.aiga.fr) sets
// them at login, and the Espace Famille API (espacefamille.aiga.fr) reads them
// on every call, the way a browser sends them with `withCredentials`. Node's
// fetch keeps no cookies, so this jar does: name=value per domain, the domain
// rules of RFC 6265 reduced to what these two hosts need.
//
// The values are session secrets: they are never logged (see `describe`).
// -----------------------------------------------------------------------------

/**
 * Parse one Set-Cookie header.
 * @param {string} header e.g. `SESSION=abc; Domain=.aiga.fr; Path=/; Secure; HttpOnly`
 * @param {string} host the host that sent it
 * @returns {{ name: string, value: string, domain: string, hostOnly: boolean, expired: boolean } | null}
 */
export function parseSetCookie(header, host) {
  const [pair, ...attributes] = String(header).split(';');
  const index = pair.indexOf('=');
  if (index <= 0) {
    return null;
  }
  const cookie = {
    name: pair.slice(0, index).trim(),
    value: pair.slice(index + 1).trim(),
    domain: host.toLowerCase(),
    hostOnly: true,
    expired: false,
  };
  for (const attribute of attributes) {
    const [rawKey, ...rest] = attribute.split('=');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join('=').trim();
    if (key === 'domain' && value) {
      const domain = value.replace(/^\./, '').toLowerCase();
      // A host may only set a cookie for itself or one of its parent domains.
      if (host === domain || host.endsWith(`.${domain}`)) {
        cookie.domain = domain;
        cookie.hostOnly = false;
      }
    } else if (key === 'max-age' && Number(value) <= 0) {
      cookie.expired = true;
    } else if (key === 'expires' && Date.parse(value) <= Date.now()) {
      cookie.expired = true;
    }
  }
  return cookie;
}

export class CookieJar {
  constructor() {
    /** @type {Map<string, ReturnType<typeof parseSetCookie>>} */
    this.cookies = new Map();
  }

  /** Store the cookies of a response. */
  store(url, headers) {
    const { hostname } = new URL(url);
    const setCookies =
      typeof headers.getSetCookie === 'function'
        ? headers.getSetCookie()
        : [headers.get?.('set-cookie')].filter(Boolean);
    for (const header of setCookies) {
      const cookie = parseSetCookie(header, hostname.toLowerCase());
      if (!cookie) {
        continue;
      }
      const key = `${cookie.domain}|${cookie.name}`;
      if (cookie.expired) {
        this.cookies.delete(key);
      } else {
        this.cookies.set(key, cookie);
      }
    }
  }

  /** The Cookie header to send to `url`, or undefined when there is none. */
  header(url) {
    const host = new URL(url).hostname.toLowerCase();
    const pairs = [];
    for (const cookie of this.cookies.values()) {
      const matches = cookie.hostOnly
        ? host === cookie.domain
        : host === cookie.domain || host.endsWith(`.${cookie.domain}`);
      if (matches) {
        pairs.push(`${cookie.name}=${cookie.value}`);
      }
    }
    return pairs.length > 0 ? pairs.join('; ') : undefined;
  }

  clear() {
    this.cookies.clear();
  }

  get size() {
    return this.cookies.size;
  }

  /** The cookie names held, for the logs: never the values. */
  describe() {
    return [...this.cookies.values()].map((cookie) => `${cookie.name}@${cookie.domain}`).join(', ');
  }
}
