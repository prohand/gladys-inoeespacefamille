# iNoé Espace Famille für Gladys

Diese Integration verbindet Gladys mit Ihrem **iNoé Espace Famille** (dem Familienportal von
AIGA, das viele französische Gemeinden und Einrichtungen nutzen: Schulkantine, Hort,
Freizeitzentrum, Krippe). Sie liest, wie Sie es im Portal tun würden:

- den **offenen Betrag** und die anstehenden **Rechnungen**;
- die **Buchungen** jedes Kindes (heute, morgen, die folgenden Tage);
- die **Neuigkeiten** der Einrichtung;
- die Anzahl der **Dokumente**, auf die die Einrichtung wartet.

Die Integration **liest nur**: Sie bucht, storniert oder bezahlt nie etwas. Zahlungen und
Buchungen bleiben im Portal.

Es ist eine **Cloud**-Integration: Sie läuft über die Server von AIGA im Internet. Gladys
braucht also Internetzugang.

Gladys 5.3 oder neuer ist erforderlich.

## Konfiguration

Öffnen Sie in Gladys **Integrationen**, installieren Sie **iNoé Espace Famille** und füllen Sie
den Konfigurationsbildschirm aus:

| Feld                           | Was einzutragen ist                                                                                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portaladresse                  | Die Adresse der Anmeldeseite des Portals, unverändert kopiert: `https://espacefamille.aiga.fr/index.html?dossier=1626256#connexion…` oder `https://espacefamille.aiga.fr/11578177`. Die Nummer allein (`1626256`) geht auch. |
| E-Mail                         | Die E-Mail, mit der Sie sich im Portal anmelden.                                                                                                                                                                             |
| Passwort                       | Das Passwort des Portals. Es wird nur an den Anmeldeserver von AIGA gesendet und nie in die Protokolle geschrieben.                                                                                                          |
| Aktualisierungsintervall (min) | Wie oft das Portal gelesen wird, in Minuten (standardmäßig 60, von 15 bis 1440).                                                                                                                                             |
| Rechnungserinnerung (Tage)     | Wie viele Tage vor der Fälligkeit der Auslöser „Eine Rechnung wird bald fällig“ ausgelöst wird (standardmäßig 3).                                                                                                            |
| Vorausgelesene Planung (Tage)  | Wie viele Tage der Planung jedes Kindes gelesen werden, heute eingeschlossen (standardmäßig 7).                                                                                                                              |
| Zeitzone                       | Was „heute“ und „morgen“ bestimmt: standardmäßig `Europe/Paris`, `Indian/Reunion`, `America/Martinique`… für die Überseegebiete.                                                                                             |

Klicken Sie auf **Verbindung testen**: Die Antwort nennt die Einrichtung, den offenen Betrag und
für jedes Kind die gebuchten Tage und die nächste Buchung.

Öffnen Sie dann den Reiter **Erkennung** der Integration und legen Sie die Geräte an.

> **Wo steht die Portaladresse?** In der E-Mail zur Kontoerstellung Ihrer Einrichtung, oder in
> der Adresszeile Ihres Browsers im Portal: Es ist die Zahl nach `dossier=` (oder nach `espacefamille.aiga.fr/`).

## Geräte

### Die Familie

Ein Gerät mit dem Namen der Einrichtung (und Ihrer Familie):

| Funktion           | Wert                                                  |
| ------------------ | ----------------------------------------------------- |
| Amount due         | Noch zu zahlender Betrag, in Euro                     |
| Unpaid invoices    | Anzahl der zu zahlenden Rechnungen                    |
| Next due date      | Fälligkeitsdatum der nächsten Rechnung (`JJJJ-MM-TT`) |
| Documents expected | Anzahl der Dokumente, auf die die Einrichtung wartet  |
| Latest news        | Titel der letzten Neuigkeit der Einrichtung           |

### Jedes Kind

Ein Gerät pro Kind („Léa – iNoé“):

| Funktion          | Wert                                                         |
| ----------------- | ------------------------------------------------------------ |
| Booked today      | 1, wenn das Kind heute mindestens eine Buchung hat, sonst 0  |
| Booked tomorrow   | 1, wenn das Kind morgen mindestens eine Buchung hat, sonst 0 |
| Today             | Die heute gebuchten Aktivitäten („Cantine, Garderie soir“)   |
| Tomorrow          | Die morgen gebuchten Aktivitäten                             |
| Days booked ahead | Anzahl der gebuchten Tage im gelesenen Zeitraum              |

Eine Abwesenheit oder ein Wartelistenplatz zählt nicht als Buchung.

Jedes Gerät zeigt das Abzeichen **Cloud**; es wechselt zu **nicht erreichbar**, wenn das Portal
nicht antwortet.

## Szenen-Auslöser

Wählen Sie in einer Szene den Auslöser **Integrationen → iNoé Espace Famille**:

| Schlüssel          | Wann                                                                   | Variablen                                                         |
| ------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `new_invoice`      | Eine neue zu zahlende Rechnung erscheint                               | `number`, `label`, `structure`, `amount`, `due_date`              |
| `invoice_due_soon` | Eine Rechnung wird bald fällig (einmal pro Rechnung)                   | dieselben + `days_left`                                           |
| `booking_changed`  | Eine Aktivität wird in der Planung eines Kindes gebucht oder storniert | `child_name`, `date`, `activity`, `change` (`booked`/`cancelled`) |
| `new_message`      | Die Einrichtung veröffentlicht eine neue Nachricht                     | `title`, `date`                                                   |

`booking_changed` lässt sich nach Kind und Art der Änderung filtern. In den folgenden Aktionen
verwenden Sie zum Beispiel `{{triggerEvent.data.amount}}`.

Beim allerersten Lesen eines Kontos wird nichts gemeldet (sonst wäre jede vorhandene Rechnung
„neu“) — außer einer Rechnung, die bereits bald fällig ist.

## Szenen-Aktionen

| Schlüssel       | Was sie tut                                                                 | Ergebnisse                      |
| --------------- | --------------------------------------------------------------------------- | ------------------------------- |
| `refresh`       | Liest das Portal sofort, ohne auf das Intervall zu warten                   | `amount_due`, `unpaid_invoices` |
| `check_booking` | Sagt, ob ein Kind heute oder morgen gebucht ist, und für welche Aktivitäten | `booked`, `activities`          |

Beispiel: jeden Abend um 20 Uhr `check_booking` für Léa, morgen; wenn `booked` wahr ist,
„Morgen: {{…activities}}“ über Telegram senden.

## Dashboard-Widget

Das Widget **Familienbereich** (`family_space`) zeigt den offenen Betrag (live), die nächste
Rechnung (orange, wenn die Fälligkeit naht, rot, wenn sie überschritten ist), den Tag jedes
Kindes heute und morgen sowie die erwarteten Dokumente. Die Schaltfläche **Aktualisieren** liest
das Portal erneut; **Portal öffnen** öffnet Ihr Espace Famille.

## Fehlerbehebung

| Meldung                                                 | Was tun                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| „Diese Portaladresse ist iNoé unbekannt“                | Kopieren Sie die Adresse erneut aus der E-Mail Ihrer Einrichtung.                                    |
| „Das Portal hat die E-Mail oder das Passwort abgelehnt“ | Melden Sie sich im Portal selbst an; hat sich das Passwort geändert, aktualisieren Sie es in Gladys. |
| „Das iNoé-Portal wird gewartet“                         | Nichts zu tun: Neuer Versuch bei der nächsten Aktualisierung.                                        |
| Ein Kind zeigt „Planung nicht lesbar“                   | Die Einrichtung hat vielleicht eine Aktivität geschlossen. Die übrigen Angaben bleiben aktuell.      |

Das Portal hat keine öffentliche API: Die Integration nutzt dieselben Abläufe wie die Website.
Ändert AIGA seine Website, kann ein Update der Integration nötig sein.

## Datenschutz

- Das Passwort wird nur an `ism.aiga.fr` (den Anmeldeserver von AIGA) gesendet.
- Es wird nichts anderswohin gesendet als an die Server von AIGA und an Ihr Gladys.
- Nur ein kleines Gedächtnis (Rechnungs- und Nachrichtennummern, bereits gesehene Buchungen) wird
  im Volume `/data` der Integration gespeichert, damit nichts doppelt gemeldet wird.
