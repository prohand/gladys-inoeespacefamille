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
import { bookingKey, daysBetween, describeBookings } from './parse.js';

// Ids kept per list: far more than a family ever has open at once, and a
// bound on what the memory file can grow to.
const MAX_IDS = 500;

// The format of the remembered bookings. A memory of another format (an
// earlier version kept activity names, not slots) is not compared: its
// differences would all be false "booked" / "cancelled" events.
const BOOKINGS_FORMAT = 2;

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
    bookingsFormat: BOOKINGS_FORMAT,
    bookings: Object.fromEntries(
      snapshot.children.map((child) => [
        child.id,
        child.planningRead
          ? Object.fromEntries(
              Object.entries(child.days).map(([day, bookings]) => [day, bookings.map(bookingKey)]),
            )
          : previous?.bookingsFormat === BOOKINGS_FORMAT
            ? (previous?.bookings?.[child.id] ?? {})
            : {},
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
    if (!child.planningRead || !before || previous.bookingsFormat !== BOOKINGS_FORMAT) {
      continue;
    }
    for (const day of daysToCompare(previous.window, snapshot.window)) {
      const was = before[day] ?? [];
      const is = child.days[day] ?? [];
      const booked = is.filter((booking) => !was.includes(bookingKey(booking)));
      const isKeys = is.map(bookingKey);
      const cancelled = was.filter((key) => !isKeys.includes(key)).map(bookingFromKey);
      // One event per activity and per day: a full day booked is ONE
      // "booked" (activity "Accueil de loisirs : Matin, Repas, Après-midi"),
      // not one per slot.
      for (const [change, bookings] of [
        [BOOKING_CHANGES.BOOKED, booked],
        [BOOKING_CHANGES.CANCELLED, cancelled],
      ]) {
        for (const group of groupByActivity(bookings)) {
          events.push(bookingEvent(child, day, describeBookings(group), change, deviceOf));
        }
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

function bookingFromKey(key) {
  const [activity, ...slot] = key.split('|');
  return { activity, slot: slot.join('|'), order: 0 };
}

function groupByActivity(bookings) {
  const groups = new Map();
  for (const booking of bookings) {
    groups.set(booking.activity, [...(groups.get(booking.activity) ?? []), booking]);
  }
  return [...groups.values()];
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
