// -----------------------------------------------------------------------------
// What changed between two reads: the scene events.
//
// The portal says what IS (invoices to pay, bookings); a scene trigger says
// what HAPPENED (a new invoice, a booking cancelled). The integration keeps a
// small "memory" of what it already reported — invoice ids, message ids, the
// bookings of the days it read — and fires an event for what is new.
//
// The memory is saved under /data (src/store.js): a restart, an update or a
// configuration saved does not report the same invoice twice. The very first
// read only records: an account added to Gladys does not fire a "new invoice"
// for every invoice it already had.
// -----------------------------------------------------------------------------

import { BOOKING_CHANGES, SCENE_TRIGGERS } from '../capabilities/keys.js';
import { daysBetween } from './parse.js';

// Ids kept per list: far more than a family ever has open at once, and a
// bound on what the memory file can grow to.
const MAX_IDS = 500;

/** The memory to keep after a snapshot, given the one before. */
export function memoryFrom(snapshot, previous, reminded = []) {
  const keep = (ids) => [...new Set(ids)].slice(-MAX_IDS);
  return {
    dossierId: snapshot.dossier.id,
    familyId: snapshot.family.id,
    // A list that could not be read keeps what was known, so its next good
    // read does not report everything as new.
    invoices: keep(
      snapshot.invoices === null
        ? (previous?.invoices ?? [])
        : [...(previous?.invoices ?? []), ...snapshot.invoices.map((invoice) => invoice.id)],
    ),
    reminded: keep([...(previous?.reminded ?? []), ...reminded]),
    news: keep(
      snapshot.news === null
        ? (previous?.news ?? [])
        : [...(previous?.news ?? []), ...snapshot.news.map((message) => message.id)],
    ),
    window: snapshot.window,
    bookings: Object.fromEntries(
      snapshot.children.map((child) => [
        child.id,
        child.planningRead ? child.days : (previous?.bookings?.[child.id] ?? {}),
      ]),
    ),
  };
}

/**
 * The scene events between the remembered state and a new snapshot.
 * @param {object | null} previous the memory (null on the very first read)
 * @param {object} snapshot see readSnapshot
 * @param {{ reminder_days: number }} config
 * @param {(child: object) => string} deviceOf the child's device external id
 * @returns {{ events: { key: string, data: object }[], memory: object }}
 */
export function detectChanges(previous, snapshot, config, deviceOf) {
  const sameAccount =
    previous &&
    previous.dossierId === snapshot.dossier.id &&
    previous.familyId === snapshot.family.id;
  const events = [];
  const reminded = [];

  // Reminders are recorded even on the first read, so an invoice already due
  // tomorrow when the account is added is reminded once, now.
  for (const invoice of snapshot.invoices ?? []) {
    if (!invoice.dueDate || (sameAccount && previous.reminded?.includes(invoice.id))) {
      continue;
    }
    const daysLeft = daysBetween(snapshot.today, invoice.dueDate);
    if (daysLeft >= 0 && daysLeft <= config.reminder_days) {
      reminded.push(invoice.id);
      events.push({
        key: SCENE_TRIGGERS.INVOICE_DUE_SOON,
        data: invoiceData(invoice, { days_left: daysLeft }),
      });
    }
  }

  if (!sameAccount) {
    return { events, memory: memoryFrom(snapshot, null, reminded) };
  }

  if (snapshot.invoices !== null) {
    for (const invoice of snapshot.invoices) {
      if (!previous.invoices?.includes(invoice.id)) {
        events.push({ key: SCENE_TRIGGERS.NEW_INVOICE, data: invoiceData(invoice) });
      }
    }
  }

  if (snapshot.news !== null) {
    for (const message of snapshot.news) {
      if (!previous.news?.includes(message.id)) {
        events.push({
          key: SCENE_TRIGGERS.NEW_MESSAGE,
          data: { title: message.title, date: message.date },
        });
      }
    }
  }

  for (const child of snapshot.children) {
    const before = previous.bookings?.[child.id];
    if (!child.planningRead || !before) {
      continue;
    }
    for (const day of daysToCompare(previous.window, snapshot.window)) {
      const was = before[day] ?? [];
      const is = child.days[day] ?? [];
      for (const activity of is.filter((name) => !was.includes(name))) {
        events.push(bookingEvent(child, day, activity, BOOKING_CHANGES.BOOKED, deviceOf));
      }
      for (const activity of was.filter((name) => !is.includes(name))) {
        events.push(bookingEvent(child, day, activity, BOOKING_CHANGES.CANCELLED, deviceOf));
      }
    }
  }

  return { events, memory: memoryFrom(snapshot, previous, reminded) };
}

/** The days both reads covered: a day only in the new window is not "booked". */
function daysToCompare(before, now) {
  if (!before?.from || !before?.to) {
    return [];
  }
  const from = before.from > now.from ? before.from : now.from;
  const to = before.to < now.to ? before.to : now.to;
  const days = [];
  for (let offset = 0; offset <= daysBetween(from, to); offset += 1) {
    const date = new Date(`${from}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    days.push(date.toISOString().slice(0, 10));
  }
  return days;
}

function invoiceData(invoice, extra = {}) {
  return {
    number: invoice.number,
    label: invoice.label,
    structure: invoice.structure,
    amount: invoice.balance ?? invoice.amount ?? 0,
    due_date: invoice.dueDate,
    ...extra,
  };
}

function bookingEvent(child, day, activity, change, deviceOf) {
  return {
    key: SCENE_TRIGGERS.BOOKING_CHANGED,
    data: { device: deviceOf(child), change, child_name: child.name, date: day, activity },
  };
}
