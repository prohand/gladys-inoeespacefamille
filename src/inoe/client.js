// -----------------------------------------------------------------------------
// HTTP client of the iNoé Espace Famille portal (AIGA).
//
// iNoé publishes no public API: this client speaks to the same endpoints as
// the portal's own web application (https://espacefamille.aiga.fr), read-only.
// The flow, as the web application runs it:
//
//   1. version   GET  https://espacefamille.aiga.fr/prod.js           the deployed builds
//                GET  https://inoe.aiga.fr/inoe/inoe<build>/version?dossierID=<n>
//                     -> the build serving THIS structure ("v5.75.1.prod...")
//   2. dossier   POST <api>/<n>/public/infoDossierController/dossier
//                     -> { code, raisonSociale, infosGenerales } ; a 303 moves
//                        the structure to another API base (Location header)
//   3. login     POST https://ism.aiga.fr/login {username, password}
//                     -> session cookies (domain aiga.fr) + the session
//   4. data      GET  <api>/<CODE>/<controller>?token=null   (Ext "stores")
//                POST <api>/<CODE>/<controller>  token=null  (form-encoded)
//
// with <api> = https://espacefamille.aiga.fr/inoe/inoe<build>/api/EF/.
//
// Only reads are implemented: no booking, no payment, no form is ever sent.
// The password goes to ism.aiga.fr only, and is never logged.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { CookieJar } from './cookies.js';

const logger = createLogger({ name: 'inoe' });

export const PORTAL_URL = 'https://espacefamille.aiga.fr';
export const VERSION_URL = 'https://inoe.aiga.fr';
export const ISM_URL = 'https://ism.aiga.fr';

const REQUEST_TIMEOUT_MS = 30_000;

/** Why a call to the portal failed, in words the status screen can use. */
export const INOE_ERRORS = {
  NETWORK: 'network', // the portal could not be reached
  DOSSIER: 'dossier', // the structure number is unknown
  LOGIN: 'login', // the portal refused the email / password
  SESSION: 'session', // the session expired and could not be renewed
  MAINTENANCE: 'maintenance', // the portal says it is in maintenance
  HTTP: 'http', // any other unexpected answer
};

export class InoeError extends Error {
  /**
   * @param {string} code one of INOE_ERRORS
   * @param {string} message technical detail, for the logs
   * @param {{ status?: number }} [details]
   */
  constructor(code, message, { status } = {}) {
    super(message);
    this.name = 'InoeError';
    this.code = code;
    this.status = status;
  }
}

/** The builds listed by prod.js, newest last as the file lists them. */
export function parseBuilds(script) {
  return [...String(script).matchAll(/push\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]);
}

/** The API base for a build, e.g. https://espacefamille.aiga.fr/inoe/inoev5.75.1/api/EF/. */
export function apiBaseFor(build, portalUrl = PORTAL_URL) {
  const clean = String(build).replace(/^["'/\s]+|["'/\s]+$/g, '');
  return `${portalUrl}/inoe/inoe${clean}/api/EF/`;
}

/**
 * The API base named by a 303 of the dossier endpoint: its Location is either
 * the new base itself, or the full dossier URL on that base.
 */
export function baseFromRedirect(location, currentUrl) {
  let base = String(location)
    .trim()
    .replace(/^['"]+|['"]+$/g, '');
  base = base.replace(/\/[^/]+\/public\/infoDossierController\/dossier(?:\?.*)?$/i, '/');
  const absolute = new URL(base, currentUrl).toString();
  return absolute.endsWith('/') ? absolute : `${absolute}/`;
}

/** Whether the JSON answer of a controller carries an error. */
function answerError(body) {
  if (body && typeof body === 'object' && (body.error || body.errors || body.success === false)) {
    return String(body.error ?? body.message ?? JSON.stringify(body.errors ?? body)).slice(0, 200);
  }
  return null;
}

export class InoeClient {
  /**
   * @param {{ dossierId: string, username: string, password: string }} account
   * @param {{ fetch?: typeof fetch, portalUrl?: string, versionUrl?: string, ismUrl?: string }} [options]
   */
  constructor({ dossierId, username, password }, options = {}) {
    this.dossierId = String(dossierId);
    this.username = username;
    // Kept in a non-enumerable property: a client logged or serialized by
    // mistake does not carry the password with it.
    Object.defineProperty(this, 'password', { value: password, enumerable: false });
    this.fetch = options.fetch ?? globalThis.fetch;
    this.portalUrl = options.portalUrl ?? PORTAL_URL;
    this.versionUrl = options.versionUrl ?? VERSION_URL;
    this.ismUrl = options.ismUrl ?? ISM_URL;
    this.jar = new CookieJar();
    this.apiBase = null;
    this.dossier = null;
    this.session = null;
  }

  // --- transport -------------------------------------------------------------

  async request(url, { method = 'GET', headers = {}, body, redirect = 'follow' } = {}) {
    const cookie = this.jar.header(url);
    let response;
    try {
      response = await this.fetch(url, {
        method,
        body,
        redirect,
        headers: {
          accept: 'application/json, text/plain, */*',
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new InoeError(INOE_ERRORS.NETWORK, `${method} ${hostOf(url)}: ${err.message}`);
    }
    this.jar.store(url, response.headers);
    if (response.status === 402 || response.status === 503) {
      throw new InoeError(INOE_ERRORS.MAINTENANCE, `${method} ${hostOf(url)}: maintenance`, {
        status: response.status,
      });
    }
    return response;
  }

  async readJson(response, what) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new InoeError(INOE_ERRORS.HTTP, `${what}: not JSON (HTTP ${response.status})`, {
        status: response.status,
      });
    }
  }

  // --- 1. version ------------------------------------------------------------

  async resolveApiBase() {
    const scriptResponse = await this.request(`${this.portalUrl}/prod.js?uc=${Date.now()}`);
    const builds = parseBuilds(await scriptResponse.text());
    if (builds.length === 0) {
      throw new InoeError(INOE_ERRORS.HTTP, 'prod.js lists no build');
    }
    // The portal's own index.html asks the first build listed which build
    // serves the structure: a structure can lag behind the newest one.
    const versionResponse = await this.request(
      `${this.versionUrl}/inoe/inoe${builds[0]}/version?dossierID=${encodeURIComponent(this.dossierId)}`,
    );
    if (!versionResponse.ok) {
      throw new InoeError(INOE_ERRORS.DOSSIER, `version: HTTP ${versionResponse.status}`, {
        status: versionResponse.status,
      });
    }
    const raw = (await versionResponse.text()).trim();
    let build = raw;
    try {
      build = JSON.parse(raw);
    } catch {
      // A bare string: used as is.
    }
    if (typeof build !== 'string' || !build) {
      throw new InoeError(INOE_ERRORS.DOSSIER, 'version: empty answer');
    }
    this.apiBase = apiBaseFor(build, this.portalUrl);
    logger.debug(`Structure ${this.dossierId} served by build ${build}`);
    return this.apiBase;
  }

  // --- 2. dossier ------------------------------------------------------------

  async loadDossier() {
    if (!this.apiBase) {
      await this.resolveApiBase();
    }
    // At most one move to another API base, as the web application does.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const url = `${this.apiBase}${encodeURIComponent(this.dossierId)}/public/infoDossierController/dossier`;
      const response = await this.request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        redirect: 'manual',
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location') || (await response.text());
        if (!location) {
          break;
        }
        this.apiBase = baseFromRedirect(location, url);
        continue;
      }
      if (response.status === 403 || response.status === 404) {
        throw new InoeError(INOE_ERRORS.DOSSIER, `dossier: HTTP ${response.status}`, {
          status: response.status,
        });
      }
      if (!response.ok) {
        throw new InoeError(INOE_ERRORS.HTTP, `dossier: HTTP ${response.status}`, {
          status: response.status,
        });
      }
      const body = await this.readJson(response, 'dossier');
      if (!body?.code) {
        throw new InoeError(INOE_ERRORS.DOSSIER, 'dossier: no code in the answer');
      }
      this.dossier = {
        id: this.dossierId,
        code: String(body.code).toUpperCase(),
        name: body.infosGenerales?.nomStructure || body.raisonSociale || `iNoé ${this.dossierId}`,
      };
      return this.dossier;
    }
    throw new InoeError(INOE_ERRORS.DOSSIER, 'dossier: redirected twice');
  }

  // --- 3. login --------------------------------------------------------------

  async login() {
    if (!this.dossier) {
      await this.loadDossier();
    }
    this.jar.clear();
    const response = await this.request(`${this.ismUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
    });
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new InoeError(INOE_ERRORS.LOGIN, `login: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    if (!response.ok) {
      throw new InoeError(INOE_ERRORS.HTTP, `login: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    // The ISM answer is not the session: like the web application, ask the
    // portal for it (`loginController/getSession`), carried by the cookies
    // the login just set. Its body is only described, never logged: it may
    // hold a token.
    const loginBody = await response.text();
    logger.debug(
      `ISM login HTTP ${response.status}, answer ${describeShape(loginBody)}, cookies: ${this.jar.describe() || 'none'}`,
    );
    const session = await this.fetchSession();
    const user = session?.apiUser;
    if (!user || user.id === -1 || user.id === undefined || user.id === null) {
      throw new InoeError(
        INOE_ERRORS.LOGIN,
        `login: the portal opened no session (ISM answer ${describeShape(loginBody)}, ` +
          `cookies: ${this.jar.describe() || 'none'}, session ${describeShape(session)})`,
      );
    }
    if (Array.isArray(user.roles) && !user.roles.includes('ROLE_FAMILLE')) {
      throw new InoeError(
        INOE_ERRORS.LOGIN,
        `login: not a family account (${user.roles.join(',')})`,
      );
    }
    this.session = session;
    logger.debug('Logged in');
    return session;
  }

  /** The portal session (`loginController/getSession`), outside `withSession`. */
  async fetchSession() {
    const response = await this.request(this.controllerUrl('loginController/getSession'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({ token: 'null' }).toString(),
    });
    if (response.status === 401 || response.status === 403) {
      throw new InoeError(
        INOE_ERRORS.LOGIN,
        `getSession: HTTP ${response.status} (cookies: ${this.jar.describe() || 'none'})`,
        { status: response.status },
      );
    }
    if (!response.ok) {
      throw new InoeError(INOE_ERRORS.HTTP, `getSession: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    const body = await this.readJson(response, 'getSession');
    // Answered either as the session itself or wrapped in `data`.
    return body?.apiUser ? body : body?.data?.apiUser ? body.data : (body?.data?.[0] ?? body);
  }

  async ensureSession() {
    if (!this.session) {
      await this.login();
    }
  }

  // --- 4. data ---------------------------------------------------------------

  controllerUrl(path) {
    return `${this.apiBase}${encodeURIComponent(this.dossier.code)}/${path.replace(/^\/+/, '')}`;
  }

  /**
   * Run a call, logging in again once when the session has expired.
   * @template T
   * @param {() => Promise<T>} call
   * @returns {Promise<T>}
   */
  async withSession(call) {
    await this.ensureSession();
    try {
      return await call();
    } catch (err) {
      if (err instanceof InoeError && err.code === INOE_ERRORS.SESSION) {
        logger.info('Session expired, logging in again');
        this.session = null;
        await this.login();
        return call();
      }
      throw err;
    }
  }

  checkSession(response, what) {
    if (response.status === 401 || response.status === 403) {
      throw new InoeError(INOE_ERRORS.SESSION, `${what}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    if (!response.ok) {
      throw new InoeError(INOE_ERRORS.HTTP, `${what}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
  }

  /** A read "store" endpoint: GET, answer `{ success, data: [...] }`. */
  async store(path, params = {}) {
    return this.withSession(async () => {
      const query = new URLSearchParams({ token: 'null', page: '1', start: '0', limit: '500' });
      for (const [key, value] of Object.entries(params)) {
        query.set(key, String(value));
      }
      const response = await this.request(`${this.controllerUrl(path)}?${query}`);
      this.checkSession(response, path);
      const body = await this.readJson(response, path);
      const error = answerError(body);
      if (error) {
        throw new InoeError(INOE_ERRORS.HTTP, `${path}: ${error}`);
      }
      return Array.isArray(body) ? body : (body?.data ?? []);
    });
  }

  /** A controller call: POST form-encoded, answer `{ success, data }`. */
  async controller(path, params = {}) {
    return this.withSession(async () => {
      const response = await this.request(this.controllerUrl(path), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: new URLSearchParams({ token: 'null', ...params }).toString(),
      });
      this.checkSession(response, path);
      const body = await this.readJson(response, path);
      const error = answerError(body);
      if (error) {
        throw new InoeError(INOE_ERRORS.HTTP, `${path}: ${error}`);
      }
      return body;
    });
  }

  /** The dashboard: amount due, documents expected, family and children. */
  async dashboard() {
    const body = await this.controller('tableaudebordController/infos/');
    return body?.data?.[0] ?? null;
  }

  /** The invoices still to pay. */
  async invoices() {
    return this.store('factureController/factures');
  }

  /** The planning of one person between two dates (YYYY-MM-DD, inclusive). */
  async planning(individualId, from, to) {
    const params = { idIndividu: individualId, dateDebut: from, dateFin: to };
    const [events, slots] = await Promise.all([
      this.store('pointageANController/events/', params),
      this.store('pointageANController/plageFonctionnements/', params),
    ]);
    return { events, slots };
  }

  /** The structure's news feed. */
  async news() {
    return this.store('filactuController/messages/');
  }

  /**
   * Forget the session AND the build: the next call finds the build, the
   * structure and logs in again — a new portal version deployed overnight
   * moves the API base, and the old one then answers 404 forever.
   */
  reset() {
    this.session = null;
    this.dossier = null;
    this.apiBase = null;
    this.jar.clear();
  }
}

/**
 * The shape of an answer for the logs — its type and top-level keys — so a
 * change of the portal can be diagnosed without logging a token or a name.
 */
export function describeShape(value) {
  let parsed = value;
  if (typeof value === 'string') {
    if (value.trim() === '') {
      return 'empty';
    }
    try {
      parsed = JSON.parse(value);
    } catch {
      return `text(${value.length})`;
    }
  }
  if (Array.isArray(parsed)) {
    return `array(${parsed.length})`;
  }
  if (parsed && typeof parsed === 'object') {
    return `{${Object.keys(parsed).slice(0, 15).join(',')}}`;
  }
  return typeof parsed;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'portal';
  }
}
