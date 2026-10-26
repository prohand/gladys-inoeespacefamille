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
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { parseDossierId } from '../config.js';
import { FAMILY_FEATURES, familyIds } from '../devices/family.js';
import { localize, pick } from '../i18n.js';
import { PORTAL_URL } from '../inoe/client.js';
import { daysBetween } from '../inoe/parse.js';
import { errorMessage, formatAmount, formatDay, refreshedMessage } from '../messages.js';
import { FAMILY_WIDGET, WIDGET_ACTIONS } from './keys.js';

const logger = createLogger({ name: 'widget' });

// Status labels and values hold at most 40 characters.
const MAX_STATUS_TEXT = 40;

function clip(text) {
  return text.length > MAX_STATUS_TEXT ? `${text.slice(0, MAX_STATUS_TEXT - 1)}…` : text;
}

function clipAll(texts) {
  return Object.fromEntries(
    Object.entries(texts).map(([language, text]) => [language, clip(text)]),
  );
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

function childRow(child) {
  const none = { en: 'nothing', fr: 'rien', de: 'nichts', es: 'nada' };
  const value = localize((language) => {
    const today = child.today.length > 0 ? child.today.join(', ') : pick(language, none);
    const tomorrow = child.tomorrow.length > 0 ? child.tomorrow.join(', ') : pick(language, none);
    const words = pick(language, {
      en: ['Today', 'tomorrow'],
      fr: ['Auj.', 'demain'],
      de: ['Heute', 'morgen'],
      es: ['Hoy', 'mañana'],
    });
    return `${words[0]}: ${today} · ${words[1]}: ${tomorrow}`;
  });
  return {
    label: clip(child.name),
    icon: 'user',
    value: child.planningRead
      ? clipAll(value)
      : { en: 'Unreadable', fr: 'Illisible', de: 'Nicht lesbar', es: 'Ilegible' },
    color: child.today.length > 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
  };
}

/** The widget content for the current state of the service. */
export function buildFamilyWidget(service) {
  const { snapshot, config } = service;
  const dossierId = parseDossierId(config.portal_url);
  const buttons = [
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

  if (!snapshot) {
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

  const rows = [nextInvoiceRow(snapshot, config), ...snapshot.children.slice(0, 8).map(childRow)];
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

/**
 * The widget handlers, keyed by manifest key.
 * @param {import('../service.js').Service} service
 */
export function createWidgets(service) {
  return {
    [FAMILY_WIDGET]: {
      async get() {
        logger.debug(`onWidgetGet <- ${FAMILY_WIDGET}`);
        return buildFamilyWidget(service);
      },

      async action(actionKey) {
        logger.info(`onWidgetAction <- ${FAMILY_WIDGET}.${actionKey}`);
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
    },
  };
}

/** Ask the core to re-pull the widget now (fire-and-forget, rate-limited). */
export function refreshWidget(gladys) {
  gladys.requestWidgetRefresh(FAMILY_WIDGET);
}
