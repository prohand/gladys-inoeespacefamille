// -----------------------------------------------------------------------------
// Turn the portal's answers into plain values.
//
// The iNoé payloads are the value objects of its web application (FactureEFVO,
// PointageEventVO, EnfantResumeVO...). Amounts arrive as strings, dates as
// "Y-m-d" or "Y-m-dTH:i:s" in the structure's local time, and a field the
// structure does not use is often null. Everything here is tolerant: a value
// that cannot be read becomes null, never an exception that would stop the
// whole refresh.
// -----------------------------------------------------------------------------

/**
 * An amount in euros, from "12.50", "12,50", "1 234,50 €" or a number.
 * @returns {number | null}
 */
export function parseAmount(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  let text = value.replace(/[\s\u00a0\u202f€]/g, '');
  if (!text) {
    return null;
  }
  // "1.234,50": the last separator is the decimal one.
  if (text.includes(',') && text.includes('.')) {
    text =
      text.lastIndexOf(',') > text.lastIndexOf('.')
        ? text.replace(/\./g, '').replace(',', '.')
        : text.replace(/,/g, '');
  } else {
    text = text.replace(',', '.');
  }
  const number = Number(text);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

/** "2026-10-27" out of "2026-10-27", "2026-10-27T00:00:00" or "27/10/2026". */
export function parseDay(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const french = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value);
  return french ? `${french[3]}-${french[2]}-${french[1]}` : null;
}

/** The calendar day of `date` in `timezone`, as YYYY-MM-DD. */
export function localDay(date, timezone) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** `day` (YYYY-MM-DD) plus `count` days. */
export function addDays(day, count) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** One invoice still to pay. */
export function normalizeInvoice(raw) {
  const amount = parseAmount(raw?.montantFacture);
  const paid = parseAmount(raw?.montantRegle) ?? 0;
  const balance = parseAmount(raw?.solde) ?? (amount === null ? null : amount - paid);
  return {
    id: String(raw?.id ?? raw?.numero ?? ''),
    number: String(raw?.numero ?? '').trim(),
    label: String(raw?.intitule ?? '').trim(),
    structure: String(raw?.nomRupture ?? '').trim(),
    amount,
    balance,
    // "Pay before" when the structure sets it, the due date otherwise.
    dueDate: parseDay(raw?.reglerAvant) ?? parseDay(raw?.dateEcheance),
    directDebit: parseDay(raw?.datePrelevement) !== null,
  };
}

/** The invoices still to pay, the ones with nothing left to pay dropped. */
export function normalizeInvoices(list) {
  return (Array.isArray(list) ? list : [])
    .map(normalizeInvoice)
    .filter((invoice) => invoice.id && (invoice.balance === null || invoice.balance > 0))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
}

/**
 * The children of the family, from the dashboard's `familleVO.listeEnfants`.
 * The list also carries the parents (`parent: true`) and the "add someone"
 * placeholder (id <= 0): neither has a planning of its own here.
 */
export function normalizeChildren(dashboard) {
  const list = dashboard?.familleVO?.listeEnfants;
  return (Array.isArray(list) ? list : [])
    .filter((person) => Number(person?.id) > 0 && person.parent !== true)
    .map((person) => ({
      id: String(person.id),
      firstName: String(person.prenom ?? '').trim(),
      lastName: String(person.nom ?? '').trim(),
    }));
}

const PRESENT_WORDS = ['p', 'presence', 'présence', 'present', 'présent', 'true', 'o', 'oui', '1'];

/**
 * Whether a planning event is a place the child will take: a booking or a
 * planned presence, not an absence, a cancellation or a waiting list.
 *
 * The event carries the palette it was given (`nouvellePalette`, else the one
 * it had, `anciennePalette`); the palette says whether it means presence.
 * The flag's type is not documented: a boolean, a 0/1 or a letter are all
 * read, and a palette without the flag counts as presence (the planning only
 * holds events for the slots something was booked on).
 */
export function isBooked(event) {
  if (!event || event.toDelete === true || event.listeAttente === true) {
    return false;
  }
  const palette = event.nouvellePalette ?? event.anciennePalette ?? null;
  if (!palette) {
    return false;
  }
  const { presence } = palette;
  if (presence === undefined || presence === null) {
    return true;
  }
  if (typeof presence === 'boolean') {
    return presence;
  }
  if (typeof presence === 'number') {
    return presence > 0;
  }
  return PRESENT_WORDS.includes(String(presence).trim().toLowerCase());
}

/** The activity names of the planning, by activity id. */
export function activityNames(slots) {
  const names = new Map();
  for (const slot of Array.isArray(slots) ? slots : []) {
    const id = slot?.idActivite;
    const name = String(slot?.intitule ?? slot?.abreviation ?? '').trim();
    if (id !== undefined && id !== null && name && !names.has(String(id))) {
      names.set(String(id), name);
    }
  }
  return names;
}

/**
 * The bookings of one child, day by day.
 * @param {{ events: object[], slots: object[] }} planning
 * @returns {Map<string, string[]>} day (YYYY-MM-DD) -> activity names booked
 */
export function bookingsByDay({ events, slots }) {
  const names = activityNames(slots);
  const days = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    const day = parseDay(event?.date);
    if (!day || !isBooked(event)) {
      continue;
    }
    const name = names.get(String(event.idActivite)) ?? `#${event.idActivite}`;
    const list = days.get(day) ?? [];
    if (!list.includes(name)) {
      list.push(name);
    }
    days.set(
      day,
      list.sort((a, b) => a.localeCompare(b)),
    );
  }
  return days;
}

/** One message of the structure's news feed. */
export function normalizeNews(list) {
  return (Array.isArray(list) ? list : [])
    .filter((message) => message?.id !== undefined && message?.id !== null)
    .map((message) => ({
      id: String(message.id),
      title: String(message.titre ?? '').trim(),
      date: parseDay(message.date),
    }))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.id.localeCompare(a.id));
}
