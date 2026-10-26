// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it for you
// (`gladys.getConfig()`) and notifies you of every change through
// `gladys.onConfigUpdated()`.
//
// This module only provides defaults and normalizes the received object, so the
// rest of the code never has to deal with `undefined` or with numbers typed as
// strings.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // The address of the family portal, as the structure sent it by email
  // (https://espacefamille.aiga.fr/<number>), or that number alone.
  portal_url: '',
  username: '',
  password: '',
  // Minutes between two reads of the portal. The portal is a web application
  // shared by every family of the structure: once an hour is plenty for
  // invoices and bookings that change a few times a week.
  refresh_minutes: 60,
  // An invoice whose due date is this close fires `invoice_due_soon` once.
  reminder_days: 3,
  // How many days of the planning are read ahead (bookings counted, next one).
  planning_days: 7,
  // "Today" and "tomorrow" are those of the family, not of the container
  // (which runs in UTC).
  timezone: 'Europe/Paris',
};

const LIMITS = {
  refresh_minutes: [15, 1440],
  reminder_days: [0, 30],
  planning_days: [1, 31],
};

/** A number within [min, max], or the default when the value is not a number. */
function bounded(value, key) {
  const number = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(number)) {
    return DEFAULT_CONFIG[key];
  }
  const [min, max] = LIMITS[key];
  return Math.min(max, Math.max(min, Math.round(number)));
}

/** Whether `timezone` is a time zone the runtime knows. */
export function isValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The structure's number (the `dossier`) out of what the user pasted: the full
 * portal address, an address with `?dossier=`, or the number alone.
 * @param {string} value
 * @returns {string | null} the digits, or null when none can be found
 */
export function parseDossierId(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return null;
  }
  const query = /[?&]dossier=(\d+)/i.exec(text);
  if (query) {
    return query[1];
  }
  if (/^\d+$/.test(text)) {
    return text;
  }
  // https://espacefamille.aiga.fr/11578177 (possibly followed by /#login...)
  const path = /^https?:\/\/[^/]+\/(\d+)(?:[/?#]|$)/i.exec(text);
  return path ? path[1] : null;
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const timezone = String(raw.timezone ?? '').trim() || DEFAULT_CONFIG.timezone;
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    portal_url: String(raw.portal_url ?? '').trim(),
    username: String(raw.username ?? '').trim(),
    password: String(raw.password ?? ''),
    refresh_minutes: bounded(raw.refresh_minutes, 'refresh_minutes'),
    reminder_days: bounded(raw.reminder_days, 'reminder_days'),
    planning_days: bounded(raw.planning_days, 'planning_days'),
    timezone: isValidTimezone(timezone) ? timezone : DEFAULT_CONFIG.timezone,
  };
}

/**
 * What is still missing before the portal can be read, as config keys.
 * @param {ReturnType<typeof normalizeConfig>} config
 * @returns {string[]} empty when the account can be used
 */
export function missingSettings(config) {
  const missing = [];
  if (!parseDossierId(config.portal_url)) {
    missing.push('portal_url');
  }
  if (!config.username) {
    missing.push('username');
  }
  if (!config.password) {
    missing.push('password');
  }
  return missing;
}
