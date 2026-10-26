// -----------------------------------------------------------------------------
// One read of the portal, reduced to what Gladys shows.
//
// A refresh reads the dashboard, the invoices to pay, the news and the planning
// of every child, and builds a "snapshot": the plain object the devices, the
// widget, the scene triggers and the scene actions all read from. Nothing else
// talks to the portal.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  addDays,
  bookingsByDay,
  localDay,
  normalizeChildren,
  normalizeInvoices,
  normalizeNews,
  parseAmount,
} from './parse.js';

const logger = createLogger({ name: 'snapshot' });

/**
 * @typedef {object} ChildSnapshot
 * @property {string} id
 * @property {string} firstName
 * @property {string} name
 * @property {Record<string, string[]>} days day -> activities booked, over the window read
 * @property {string[]} today
 * @property {string[]} tomorrow
 * @property {number} bookedDays days with at least one booking in the window
 * @property {{ date: string, activities: string[] } | null} next first booked day from today
 * @property {boolean} planningRead false when its planning could not be read
 */

/**
 * Read everything the integration shows.
 * @param {import('./client.js').InoeClient} client
 * @param {{ planning_days: number, timezone: string }} config
 * @param {Date} [now]
 */
export async function readSnapshot(client, config, now = new Date()) {
  const dossier = client.dossier ?? (await client.loadDossier());
  const dashboard = (await client.dashboard()) ?? {};
  const [rawInvoices, rawNews] = await Promise.all([
    client.invoices().catch((err) => {
      logger.warn(`Invoices could not be read: ${err.message}`);
      return null;
    }),
    client.news().catch((err) => {
      logger.warn(`News could not be read: ${err.message}`);
      return null;
    }),
  ]);

  const today = localDay(now, config.timezone);
  const tomorrow = addDays(today, 1);
  const lastDay = addDays(today, config.planning_days - 1);

  const children = [];
  for (const child of normalizeChildren(dashboard)) {
    let days = new Map();
    let planningRead = true;
    try {
      days = bookingsByDay(await client.planning(child.id, today, lastDay));
    } catch (err) {
      // One child's planning failing (an activity the structure closed, a
      // timeout) must not hide the invoices and the other children.
      planningRead = false;
      logger.warn(`Planning of child ${child.id} could not be read: ${err.message}`);
    }
    const window = [...days.entries()]
      .filter(([day]) => day >= today && day <= lastDay)
      .sort(([a], [b]) => a.localeCompare(b));
    const next = window.find(([, activities]) => activities.length > 0);
    children.push({
      id: child.id,
      firstName: child.firstName,
      name: child.firstName || child.lastName || `#${child.id}`,
      days: Object.fromEntries(window),
      today: days.get(today) ?? [],
      tomorrow: days.get(tomorrow) ?? [],
      bookedDays: window.filter(([, activities]) => activities.length > 0).length,
      next: next ? { date: next[0], activities: next[1] } : null,
      planningRead,
    });
  }

  const invoices = rawInvoices === null ? null : normalizeInvoices(rawInvoices);
  const news = rawNews === null ? null : normalizeNews(rawNews);
  const dashboardAmount = parseAmount(dashboard.familleFacturesMontant);
  const summedAmount =
    invoices === null
      ? null
      : Math.round(invoices.reduce((sum, invoice) => sum + (invoice.balance ?? 0), 0) * 100) / 100;

  return {
    fetchedAt: now.toISOString(),
    today,
    tomorrow,
    window: { from: today, to: lastDay },
    dossier,
    family: {
      id: String(dashboard.familleVO?.id ?? client.session?.apiUser?.id ?? dossier.id),
      name: String(dashboard.familleVO?.nom ?? '').trim(),
    },
    // The dashboard's own total wins: it is what the portal shows the family.
    amountDue: dashboardAmount ?? summedAmount ?? 0,
    unpaidCount: invoices?.length ?? 0,
    documentsExpected: Number(dashboard.familleDocumentsAttendus) || 0,
    paymentBlocked: dashboard.blocageImpaye === true,
    invoices,
    nextInvoice: invoices?.find((invoice) => invoice.dueDate) ?? null,
    news,
    latestNews: news?.[0] ?? null,
    children,
  };
}
