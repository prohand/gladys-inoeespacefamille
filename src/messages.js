// -----------------------------------------------------------------------------
// The user-facing messages: connection status, "Test the connection", toasts.
//
// Every message is a `{ en, fr, de, es }` object built with `localize`, so the
// Gladys interface shows it in the reader's language (src/i18n.js).
// -----------------------------------------------------------------------------

import { localize, pick } from './i18n.js';
import { INOE_ERRORS } from './inoe/client.js';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/** An amount in euros, in the reader's language: "12,50 €", "€12.50". */
export function formatAmount(amount, language) {
  return new Intl.NumberFormat(LOCALES[language] ?? 'en-GB', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount ?? 0);
}

/** A day (YYYY-MM-DD) in the reader's language: "Tue 27/10", "mar. 27/10". */
export function formatDay(day, language) {
  if (!day) {
    return '-';
  }
  return new Intl.DateTimeFormat(LOCALES[language] ?? 'en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));
}

const FIELD_NAMES = {
  portal_url: {
    en: 'Portal address',
    fr: 'Adresse du portail',
    de: 'Portaladresse',
    es: 'Dirección del portal',
  },
  username: { en: 'Email', fr: 'E-mail', de: 'E-Mail', es: 'Correo electrónico' },
  password: { en: 'Password', fr: 'Mot de passe', de: 'Passwort', es: 'Contraseña' },
};

/** The status shown while the configuration is incomplete. */
export function notConfiguredMessage(missing) {
  return localize((language) => {
    const fields = missing.map((key) => pick(language, FIELD_NAMES[key])).join(', ');
    return pick(language, {
      en: `To fill in: ${fields}.`,
      fr: `À renseigner : ${fields}.`,
      de: `Noch auszufüllen: ${fields}.`,
      es: `Por completar: ${fields}.`,
    });
  });
}

const ERROR_MESSAGES = {
  [INOE_ERRORS.NETWORK]: {
    en: 'The iNoé portal cannot be reached. Check the Internet connection of Gladys.',
    fr: 'Le portail iNoé est injoignable. Vérifiez la connexion Internet de Gladys.',
    de: 'Das iNoé-Portal ist nicht erreichbar. Prüfe die Internetverbindung von Gladys.',
    es: 'No se puede acceder al portal iNoé. Compruebe la conexión a Internet de Gladys.',
  },
  [INOE_ERRORS.DOSSIER]: {
    en: 'This portal address is unknown to iNoé. Copy it again from the email of your structure.',
    fr: "Cette adresse de portail est inconnue d'iNoé. Recopiez-la depuis l'e-mail de votre structure.",
    de: 'Diese Portaladresse ist iNoé unbekannt. Kopiere sie erneut aus der E-Mail deiner Einrichtung.',
    es: 'iNoé no reconoce esta dirección de portal. Cópiela de nuevo del correo de su centro.',
  },
  [INOE_ERRORS.LOGIN]: {
    en: 'The portal refused the email or the password. Check them by signing in on the portal itself.',
    fr: "Le portail a refusé l'e-mail ou le mot de passe. Vérifiez-les en vous connectant au portail lui-même.",
    de: 'Das Portal hat die E-Mail oder das Passwort abgelehnt. Prüfe sie mit einer Anmeldung im Portal selbst.',
    es: 'El portal rechazó el correo o la contraseña. Compruébelos iniciando sesión en el propio portal.',
  },
  [INOE_ERRORS.SESSION]: {
    en: 'The portal session expired and could not be renewed. It will be retried at the next refresh.',
    fr: "La session du portail a expiré et n'a pas pu être renouvelée. Nouvel essai au prochain rafraîchissement.",
    de: 'Die Portalsitzung ist abgelaufen und konnte nicht erneuert werden. Neuer Versuch bei der nächsten Aktualisierung.',
    es: 'La sesión del portal caducó y no se pudo renovar. Se reintentará en la próxima actualización.',
  },
  [INOE_ERRORS.MAINTENANCE]: {
    en: 'The iNoé portal is in maintenance. It will be retried at the next refresh.',
    fr: 'Le portail iNoé est en maintenance. Nouvel essai au prochain rafraîchissement.',
    de: 'Das iNoé-Portal wird gewartet. Neuer Versuch bei der nächsten Aktualisierung.',
    es: 'El portal iNoé está en mantenimiento. Se reintentará en la próxima actualización.',
  },
};

const UNKNOWN_ERROR = {
  en: 'The portal gave an unexpected answer. Look at the integration logs.',
  fr: "Le portail a donné une réponse inattendue. Consultez les journaux de l'intégration.",
  de: 'Das Portal hat unerwartet geantwortet. Sieh in den Protokollen der Integration nach.',
  es: 'El portal dio una respuesta inesperada. Consulte los registros de la integración.',
};

/** What went wrong, for the status line and the action answers. */
export function errorMessage(err) {
  const texts = ERROR_MESSAGES[err?.code] ?? UNKNOWN_ERROR;
  return localize((language) => pick(language, texts));
}

/** The answer of "Test the connection": what was read, in a few lines. */
export function testReport(snapshot) {
  return localize((language) => {
    const t = (texts) => pick(language, texts);
    const lines = [
      t({
        en: `Connected to ${snapshot.dossier.name}.`,
        fr: `Connecté à ${snapshot.dossier.name}.`,
        de: `Verbunden mit ${snapshot.dossier.name}.`,
        es: `Conectado a ${snapshot.dossier.name}.`,
      }),
      t({
        en: `Amount due: ${formatAmount(snapshot.amountDue, language)} (${snapshot.unpaidCount} invoice(s) to pay).`,
        fr: `Montant dû : ${formatAmount(snapshot.amountDue, language)} (${snapshot.unpaidCount} facture(s) à payer).`,
        de: `Offener Betrag: ${formatAmount(snapshot.amountDue, language)} (${snapshot.unpaidCount} Rechnung(en) zu zahlen).`,
        es: `Importe pendiente: ${formatAmount(snapshot.amountDue, language)} (${snapshot.unpaidCount} factura(s) por pagar).`,
      }),
    ];
    if (snapshot.children.length === 0) {
      lines.push(
        t({
          en: 'No child found on this account.',
          fr: 'Aucun enfant trouvé sur ce compte.',
          de: 'Kein Kind in diesem Konto gefunden.',
          es: 'No se encontró ningún niño en esta cuenta.',
        }),
      );
    }
    for (const child of snapshot.children) {
      if (!child.planningRead) {
        lines.push(
          t({
            en: `${child.name}: planning unreadable.`,
            fr: `${child.name} : planning illisible.`,
            de: `${child.name}: Planung nicht lesbar.`,
            es: `${child.name}: planificación ilegible.`,
          }),
        );
        continue;
      }
      const next = child.next
        ? `${formatDay(child.next.date, language)} (${child.next.activities.join(', ')})`
        : t({ en: 'none', fr: 'aucune', de: 'keine', es: 'ninguna' });
      lines.push(
        t({
          en: `${child.name}: ${child.bookedDays} day(s) booked, next booking ${next}.`,
          fr: `${child.name} : ${child.bookedDays} jour(s) réservé(s), prochaine réservation ${next}.`,
          de: `${child.name}: ${child.bookedDays} Tag(e) gebucht, nächste Buchung ${next}.`,
          es: `${child.name}: ${child.bookedDays} día(s) reservado(s), próxima reserva ${next}.`,
        }),
      );
    }
    return lines.join(' ');
  });
}

/** The toast of a refresh asked from the widget or the Configuration screen. */
export function refreshedMessage(snapshot) {
  return localize((language) =>
    pick(language, {
      en: `Refreshed: ${formatAmount(snapshot.amountDue, language)} due.`,
      fr: `Actualisé : ${formatAmount(snapshot.amountDue, language)} dus.`,
      de: `Aktualisiert: ${formatAmount(snapshot.amountDue, language)} offen.`,
      es: `Actualizado: ${formatAmount(snapshot.amountDue, language)} pendientes.`,
    }),
  );
}
