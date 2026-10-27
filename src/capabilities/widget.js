// -----------------------------------------------------------------------------
// Dashboard widget "Family space" (SDK v0.14+, Gladys 5.1+).
//
// What a family looks at in the morning: the amount left to pay (a LIVE tile
// bound to the family device), the next invoice due, and for every child the
// activities booked today and tomorrow. A Refresh button reads the portal
// now, a link opens the portal itself.
//
// The content is declarative (`value`, `status`, `text`, `button`): the core
// renders it with its own theme and translations. The computed rows change
// with each read of the portal, so the sync loop nudges the widget after
// every refresh (`refreshWidget`) and the TTL is only a safety net.
//
// Widget "Upcoming bookings": the booked days of the planning window, one
// card per day (every child in it), same Refresh button and portal link.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { parseDossierId } from '../config.js';
import { FAMILY_FEATURES, familyIds } from '../devices/family.js';
import { localize, pick } from '../i18n.js';
import { PORTAL_URL } from '../inoe/client.js';
import { compactBookings, daysBetween, describeBookings } from '../inoe/parse.js';
import {
  errorMessage,
  formatAmount,
  formatDay,
  formatLongDay,
  refreshedMessage,
} from '../messages.js';
import { BOOKINGS_WIDGET, FAMILY_WIDGET, WIDGET_ACTIONS } from './keys.js';

const logger = createLogger({ name: 'widget' });

// Status labels and values hold at most 40 characters.
const MAX_STATUS_TEXT = 40;
// Card titles and subtitles hold at most 60.
const MAX_CARD_TEXT = 60;
// A card list shown as rows holds at most 8 cards.
const MAX_CARDS = 8;

function clip(text, max = MAX_STATUS_TEXT) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function clipAll(texts, max = MAX_STATUS_TEXT) {
  return Object.fromEntries(
    Object.entries(texts).map(([language, text]) => [language, clip(text, max)]),
  );
}

/** Refresh, and the portal link when the address names a structure. */
function widgetButtons(config) {
  const dossierId = parseDossierId(config.portal_url);
  return [
    {
      type: 'button',
      label: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.REFRESH },
    },
    ...(dossierId
      ? [
          {
            type: 'button',
            label: {
              en: 'Open the portal',
              fr: 'Ouvrir le portail',
              de: 'Portal öffnen',
              es: 'Abrir el portal',
            },
            icon: 'external-link',
            link: { url: `${PORTAL_URL}/${dossierId}` },
          },
        ]
      : []),
  ];
}

/** The content before the first good read: the error, or "waiting". */
function waitingWidget(service, buttons) {
  const error = service.lastErrorMessage();
  return {
    ttl_seconds: 300,
    components: [
      {
        type: 'text',
        variant: 'body',
        text: error ?? {
          en: 'Waiting for the first read of the iNoé portal.',
          fr: 'En attente de la première lecture du portail iNoé.',
          de: 'Warte auf das erste Lesen des iNoé-Portals.',
          es: 'Esperando la primera lectura del portal iNoé.',
        },
      },
      ...buttons,
    ],
  };
}

function nextInvoiceRow(snapshot, config) {
  const invoice = snapshot.nextInvoice;
  const label = {
    en: 'Next invoice',
    fr: 'Prochaine facture',
    de: 'Nächste Rechnung',
    es: 'Próxima factura',
  };
  if (!invoice) {
    return {
      label,
      icon: 'file-text',
      value: {
        en: 'Nothing to pay',
        fr: 'Rien à payer',
        de: 'Nichts zu zahlen',
        es: 'Nada que pagar',
      },
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  const daysLeft = daysBetween(snapshot.today, invoice.dueDate);
  let color = WIDGET_COLORS.NEUTRAL;
  if (daysLeft < 0) {
    color = WIDGET_COLORS.DANGER;
  } else if (daysLeft <= config.reminder_days) {
    color = WIDGET_COLORS.WARNING;
  }
  return {
    label,
    icon: 'file-text',
    value: clipAll(
      localize(
        (language) =>
          `${formatAmount(invoice.balance ?? invoice.amount, language)} · ${formatDay(invoice.dueDate, language)}`,
      ),
    ),
    color,
  };
}

const DAY_WORDS = {
  today: { en: 'today', fr: "aujourd'hui", de: 'heute', es: 'hoy' },
  tomorrow: { en: 'tomorrow', fr: 'demain', de: 'morgen', es: 'mañana' },
};

/**
 * One row per child and per day: a full day lists every slot (morning,
 * lunch, afternoon), which one row for both days could not hold in 40
 * characters.
 */
function childRows(child) {
  const none = { en: 'Nothing', fr: 'Rien', de: 'Nichts', es: 'Nada' };
  return ['today', 'tomorrow'].map((day) => {
    const bookings = child[day];
    const label = clipAll(
      localize((language) => `${child.name} · ${pick(language, DAY_WORDS[day])}`),
    );
    if (!child.planningRead) {
      return {
        label,
        icon: 'user',
        value: { en: 'Unreadable', fr: 'Illisible', de: 'Nicht lesbar', es: 'Ilegible' },
        color: WIDGET_COLORS.WARNING,
      };
    }
    let color = WIDGET_COLORS.NEUTRAL;
    if (bookings.length > 0) {
      color = day === 'today' ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.INFO;
    }
    return {
      label,
      icon: day === 'today' ? 'user' : 'calendar',
      value: bookings.length > 0 ? clip(compactBookings(bookings)) : none,
      color,
    };
  });
}

/** The widget content for the current state of the service. */
export function buildFamilyWidget(service) {
  const { snapshot, config } = service;
  const buttons = widgetButtons(config);
  if (!snapshot) {
    return waitingWidget(service, buttons);
  }

  const rows = [
    nextInvoiceRow(snapshot, config),
    ...snapshot.children.slice(0, 4).flatMap(childRows),
  ];
  if (snapshot.documentsExpected > 0) {
    rows.push({
      label: {
        en: 'Documents expected',
        fr: 'Documents attendus',
        de: 'Erwartete Dokumente',
        es: 'Documentos esperados',
      },
      icon: 'paperclip',
      value: snapshot.documentsExpected,
      color: WIDGET_COLORS.WARNING,
    });
  }

  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: clip(snapshot.dossier.name),
    },
    {
      type: 'value',
      label: { en: 'Amount due', fr: 'Montant dû', de: 'Offener Betrag', es: 'Importe pendiente' },
      icon: 'credit-card',
      device_feature: familyIds(service.gladys, snapshot).feature(FAMILY_FEATURES.AMOUNT_DUE),
    },
    { type: 'status', items: rows.slice(0, 10) },
  ];
  const error = service.lastErrorMessage();
  if (error) {
    // The last read failed: the rows are those of the read before.
    components.push({ type: 'text', variant: 'body', text: error });
  }
  return { ttl_seconds: 1800, components: [...components, ...buttons] };
}

const BOOKED_DAY_BADGES = {
  today: {
    text: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
    color: WIDGET_COLORS.SUCCESS,
  },
  tomorrow: {
    text: { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' },
    color: WIDGET_COLORS.INFO,
  },
};

/**
 * One card per booked day of the planning window, in date order: the
 * subtitle names each child's slots, the detail panel each child's
 * activities in full.
 */
function bookedDayCards(snapshot) {
  const children = snapshot.children.filter((child) => child.planningRead);
  const days = [...new Set(children.flatMap((child) => Object.keys(child.days)))].sort();
  const cards = [];
  for (const day of days) {
    const booked = children
      .map((child) => ({ name: child.name, bookings: child.days[day] ?? [] }))
      .filter(({ bookings }) => bookings.length > 0);
    if (booked.length === 0) {
      continue;
    }
    // One child in the family: its name would only repeat on every card.
    const alone = snapshot.children.length === 1;
    const subtitle = booked
      .map(({ name, bookings }) =>
        alone ? compactBookings(bookings) : `${name} : ${compactBookings(bookings)}`,
      )
      .join(' · ');
    const description = booked
      .map(({ name, bookings }) => `${name} — ${describeBookings(bookings)}`)
      .join('\n');
    let badge;
    if (day === snapshot.today) {
      badge = BOOKED_DAY_BADGES.today;
    } else if (day === snapshot.tomorrow) {
      badge = BOOKED_DAY_BADGES.tomorrow;
    }
    cards.push({
      title: clipAll(
        localize((language) => formatLongDay(day, language)),
        MAX_CARD_TEXT,
      ),
      subtitle: clip(subtitle, MAX_CARD_TEXT),
      ...(badge ? { badge } : {}),
      description,
    });
  }
  return cards.slice(0, MAX_CARDS);
}

/** The "Upcoming bookings" content for the current state of the service. */
export function buildBookingsWidget(service) {
  const { snapshot, config } = service;
  const buttons = widgetButtons(config);
  if (!snapshot) {
    return waitingWidget(service, buttons);
  }

  const cards = bookedDayCards(snapshot);
  const days = config.planning_days;
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: {
        en: days === 1 ? 'Today' : `The next ${days} days`,
        fr: days === 1 ? "Aujourd'hui" : `Les ${days} prochains jours`,
        de: days === 1 ? 'Heute' : `Die nächsten ${days} Tage`,
        es: days === 1 ? 'Hoy' : `Los próximos ${days} días`,
      },
    },
  ];
  if (cards.length > 0) {
    components.push({ type: 'card-list', display: 'list', items: cards });
  }

  // One body text only: the notes are joined into it.
  const notes = [];
  if (cards.length === 0) {
    notes.push({
      en: 'No booking.',
      fr: 'Aucune réservation.',
      de: 'Keine Buchung.',
      es: 'Ninguna reserva.',
    });
  }
  const unreadable = snapshot.children.filter((child) => !child.planningRead);
  if (unreadable.length > 0) {
    const names = unreadable.map((child) => child.name).join(', ');
    notes.push({
      en: `Planning unreadable: ${names}.`,
      fr: `Planning illisible : ${names}.`,
      de: `Planung nicht lesbar: ${names}.`,
      es: `Planificación ilegible: ${names}.`,
    });
  }
  const error = service.lastErrorMessage();
  if (error) {
    // The last read failed: the cards are those of the read before.
    notes.push(error);
  }
  if (notes.length > 0) {
    components.push({
      type: 'text',
      variant: 'body',
      text: localize((language) => notes.map((note) => pick(language, note)).join(' ')),
    });
  }
  return { ttl_seconds: 1800, components: [...components, ...buttons] };
}

/** One widget: its content, and the Refresh button behind it. */
function widgetHandlers(service, key, build) {
  return {
    async get() {
      logger.debug(`onWidgetGet <- ${key}`);
      return build(service);
    },

    async action(actionKey) {
      logger.info(`onWidgetAction <- ${key}.${actionKey}`);
      if (actionKey !== WIDGET_ACTIONS.REFRESH) {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      try {
        const snapshot = await service.refresh();
        return snapshot ? refreshedMessage(snapshot) : service.lastErrorMessage();
      } catch (err) {
        return errorMessage(err);
      }
    },
  };
}

/**
 * The widget handlers, keyed by manifest key.
 * @param {import('../service.js').Service} service
 */
export function createWidgets(service) {
  return {
    [FAMILY_WIDGET]: widgetHandlers(service, FAMILY_WIDGET, buildFamilyWidget),
    [BOOKINGS_WIDGET]: widgetHandlers(service, BOOKINGS_WIDGET, buildBookingsWidget),
  };
}

/** Ask the core to re-pull the widgets now (fire-and-forget, rate-limited). */
export function refreshWidget(gladys) {
  gladys.requestWidgetRefresh(FAMILY_WIDGET);
  gladys.requestWidgetRefresh(BOOKINGS_WIDGET);
}
