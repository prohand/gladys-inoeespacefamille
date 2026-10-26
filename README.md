# iNoé Espace Famille — Gladys Assistant integration

External integration for [Gladys Assistant](https://gladysassistant.com) that reads your
**iNoé Espace Famille** — the family portal [AIGA](https://www.aiga.fr) provides to French towns
and structures (school canteen, after-school club, leisure centre, nursery) — and brings it
into Gladys: invoices to pay, each child's bookings, the structure's news.

- **Cloud**, **read-only**: it signs in to the portal like a parent and never books, cancels
  or pays anything.
- Gladys **5.3+**, built on
  [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
  started from the official
  [JavaScript template](https://github.com/GladysAssistant/integration-template-js).
- Texts and documentation in **English, French, German and Spanish**.

User documentation (re-hosted by Gladys, linked from the Configuration screen):
[English](docs/en.md) · [Français](docs/fr.md) · [Deutsch](docs/de.md) · [Español](docs/es.md).

## What you get in Gladys

| Surface              | Content                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Device "family"      | Amount due (€), invoices to pay, next due date, documents expected, latest news                                     |
| One device per child | Booked today / tomorrow (0/1), activities today / tomorrow (text), days booked ahead                                |
| Scene triggers       | `new_invoice`, `invoice_due_soon`, `booking_changed` (filter: child, booked/cancelled), `new_message`               |
| Scene actions        | `refresh` (→ `amount_due`, `unpaid_invoices`), `check_booking` (→ `booked`, `activities`)                           |
| Dashboard widget     | `family_space`: amount due (live), next invoice, each child's day, Refresh, link to the portal                      |
| Configuration screen | Portal address, email, password, refresh interval, reminder days, planning days, time zone; **Test the connection** |
| Transport badge      | `cloud` on every device, `unreachable` when the portal does not answer (manifest `"transports": ["cloud"]`)         |

## How it works

iNoé has no public API. The integration speaks to the same endpoints as the portal's own web
application, read-only (details in [CLAUDE.md](CLAUDE.md)):

1. find the build serving the structure (`prod.js`, `/version?dossierID=`);
2. read the structure (`infoDossierController/dossier`);
3. sign in on `ism.aiga.fr` (session cookies);
4. read the dashboard, the invoices, the news and each child's planning.

A refresh runs every `refresh_minutes` (60 by default); what changed since the last read fires
the scene triggers. A small memory in `/data/memory.json` keeps the same invoice, message or
booking from being reported twice, across restarts and updates.

## Project structure

```
.
├─ index.js                          # SDK bootstrap + wiring (no portal logic)
├─ src/
│  ├─ service.js                     # sync loop: snapshot -> devices, states, badges, events
│  ├─ config.js                      # defaults (mirror the manifest) + normalization
│  ├─ messages.js / i18n.js          # user-facing texts {en, fr, de, es}
│  ├─ store.js                       # memory of what was reported (/data)
│  ├─ inoe/                          # portal client, cookies, parsing, snapshot, changes
│  ├─ devices/                       # family device, child devices, registry
│  └─ capabilities/                  # keys, scene actions, widget
├─ docs/{en,fr,de,es}.md             # user documentation
├─ test/                             # node --test, fake portal + SDK fake Gladys
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md / CLAUDE.md / SECURITY.md
├─ .github/workflows/ci.yml          # format, lint, tests (Node 22 + 24), store checks, Docker build
├─ .github/workflows/release.yml     # UI-driven release: bump + changelog + tag + build + store check
├─ .github/workflows/build.yml       # multi-arch build (git tag, manual run, or called by release)
├─ .github/workflows/github-release.yml # GitHub Release of every version tag
├─ .github/scripts/changelog-release.mjs # moves [Unreleased] under the released version
└─ .github/dependabot.yml            # weekly npm, monthly Actions and Docker base image
```

## Development

```bash
npm install
npm test               # node --test, no network
npm run lint           # ESLint
npm run format:check   # Prettier (CI gate)
npm run format         # Prettier, fix in place
npx github:GladysAssistant/integration-store --skip-image-check .   # store admission checks
```

Run it against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="inoe-espace-famille" \
DATA_DIR=./data LOG_LEVEL=debug \
npm start
```

## Publishing

1. Add the GitHub topic `gladys-assistant-integration` to the repository, and turn on
   **Private vulnerability reporting** in the security settings ([SECURITY.md](SECURITY.md)
   sends reporters there).
2. Describe the changes under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
3. **Actions → Release → Run workflow**, pick `patch`, `minor` or `major`. The repository starts
   at `0.0.0`: the first release is a **`major`** (→ `1.0.0`). The workflow bumps
   `package.json` and the manifest (`version` + `docker_image`), moves the changelog, tags,
   builds the `linux/amd64` + `linux/arm64` image to `ghcr.io/prohand/gladys-inoeespacefamille`,
   publishes the GitHub Release and runs the store checks with the image.
4. Make the ghcr.io package **public** after the first build (Package settings → visibility),
   so Gladys can pull it.

Replace `cover.png` (800×534 px, ≤ 150 KB) with your own picture before the first release: the
one here is the template's placeholder.

## License

Apache-2.0
