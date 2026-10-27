# iNoé Espace Famille for Gladys

This integration connects Gladys to your **iNoé Espace Famille** (the family portal AIGA
provides to many French towns and structures: school canteen, after-school club, leisure
centre, nursery). It reads, as you would on the portal:

- the **amount to pay** and the **invoices** waiting;
- the **bookings** of each child (today, tomorrow, the following days);
- the **news** published by the structure;
- the number of **documents** the structure is waiting for.

The integration **only reads**: it never books, cancels or pays anything. Payments and bookings
stay on the portal.

It is a **cloud** integration: it goes through the AIGA servers on the Internet, so Gladys
needs Internet access.

Gladys 5.3 or newer is required.

## Configuration

In Gladys, open **Integrations**, install **iNoé Espace Famille**, then fill in the
configuration screen:

| Field                      | What to enter                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Portal address             | The address of the portal's sign-in page, copied as is: `https://espacefamille.aiga.fr/index.html?dossier=1626256#connexion…` or `https://espacefamille.aiga.fr/11578177`. The number alone (`1626256`) works too. |
| Email                      | The email you sign in to the portal with.                                                                                                                                                                          |
| Password                   | The portal password. It is only sent to the AIGA sign-in server and never written to the logs.                                                                                                                     |
| Refresh interval (min)     | How often the portal is read, in minutes (60 by default, 15 to 1440).                                                                                                                                              |
| Invoice reminder (days)    | How many days before the due date the "An invoice is due soon" trigger fires (3 by default).                                                                                                                       |
| Planning read ahead (days) | How many days of each child's planning are read, today included (7 by default).                                                                                                                                    |
| Time zone                  | What decides "today" and "tomorrow": `Europe/Paris` by default, `Indian/Reunion`, `America/Martinique`… for overseas France.                                                                                       |

Click **Test the connection**: the answer gives the name of the structure, the amount due and,
for each child, the days booked and the next booking.

Then open the **Discovery** tab of the integration and create the devices.

> **Where is the portal address?** In the account creation email your structure sent, or in the
> address bar of your browser while on the portal: it is the number after
> `dossier=` (or after `espacefamille.aiga.fr/`).

## Devices

### The family

One device named after the structure (and your family):

| Feature            | Value                                            |
| ------------------ | ------------------------------------------------ |
| Amount due         | Amount left to pay, in euros                     |
| Unpaid invoices    | Number of invoices to pay                        |
| Next due date      | Due date of the next invoice (`YYYY-MM-DD`)      |
| Documents expected | Number of documents the structure is waiting for |
| Latest news        | Title of the structure's latest news             |

### Each child

One device per child ("Léa – iNoé"):

| Feature           | Value                                                                         |
| ----------------- | ----------------------------------------------------------------------------- |
| Booked today      | 1 when the child has at least one booking today, else 0                       |
| Booked tomorrow   | 1 when the child has at least one booking tomorrow, else 0                    |
| Today             | The activities booked today ("Accueil de loisirs : Matin, Repas, Après-midi") |
| Tomorrow          | The activities booked tomorrow                                                |
| Days booked ahead | Number of days booked over the period read                                    |

An absence or a place on a waiting list does not count as a booking.

Every device shows the **cloud** badge; it turns **unreachable** when the portal does not answer.

## Scene triggers

In a scene, pick the trigger **Integrations → iNoé Espace Famille**:

| Key                | When                                                     | Variables                                                         |
| ------------------ | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `new_invoice`      | A new invoice to pay appears                             | `number`, `label`, `structure`, `amount`, `due_date`              |
| `invoice_due_soon` | An invoice is due soon (once per invoice)                | the same + `days_left`                                            |
| `booking_changed`  | An activity is booked or cancelled in a child's planning | `child_name`, `date`, `activity`, `change` (`booked`/`cancelled`) |
| `new_message`      | The structure publishes a new message                    | `title`, `date`                                                   |

`booking_changed` can be filtered on a child and on the kind of change. In the following
actions, use for instance `{{triggerEvent.data.amount}}`.

On the very first read of an account nothing is reported (every invoice already there would be
"new") — except an invoice already due soon.

## Scene actions

| Key             | What it does                                                  | Outputs                         |
| --------------- | ------------------------------------------------------------- | ------------------------------- |
| `refresh`       | Reads the portal now, without waiting for the interval        | `amount_due`, `unpaid_invoices` |
| `check_booking` | Says whether a child is booked today or tomorrow, and on what | `booked`, `activities`          |

Example: every evening at 8 pm, `check_booking` for Léa, tomorrow; when `booked` is true, send
"Tomorrow: {{…activities}}" on Telegram.

## Dashboard widget

The **Family space** widget (`family_space`) shows the amount due (live), the next invoice
(orange when its due date is near, red once it is past), each child's day today and tomorrow,
and the documents expected. The **Refresh** button reads the portal again; **Open the portal**
opens your Espace Famille.

The **Upcoming bookings** widget (`upcoming_bookings`) lists the booked days of the coming days
(the **Planning read ahead (days)** setting), one card per day, at most 8: the children booked and
their slots, "Today" and "Tomorrow" in colour. Tap a card to see each child's activities in full.
It has the same **Refresh** and **Open the portal** buttons.

## Troubleshooting

| Message                                        | What to do                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| "This portal address is unknown to iNoé"       | Copy the address again from your structure's email.                                |
| "The portal refused the email or the password" | Sign in on the portal itself; if the password changed, update it in Gladys.        |
| "The iNoé portal is in maintenance"            | Nothing to do: it is retried at the next refresh.                                  |
| A child shows "planning unreadable"            | The structure may have closed an activity. The other information stays up to date. |

The portal has no public API: the integration uses the same exchanges as the website. If AIGA
changes its website, an update of the integration may be needed.

## Privacy

- The password is only sent to `ism.aiga.fr` (the AIGA sign-in server).
- Nothing is sent anywhere but to the AIGA servers and to your Gladys.
- Only a small memory (invoice and message numbers, bookings already seen) is kept in the
  integration's `/data` volume, so the same thing is never reported twice.
