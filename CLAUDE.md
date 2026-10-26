# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for **iNoé Espace Famille**, the family portal
AIGA sells to French towns and structures (canteen, after-school club, leisure centre, nursery).
Requires Gladys 5.3+. **Cloud only, read-only**: it signs in to the portal like a parent, reads
invoices, bookings and news, and never books, cancels or pays anything.

Started from the official template
([GladysAssistant/integration-template-js](https://github.com/GladysAssistant/integration-template-js));
CI and release workflows are those of [prohand/gladys-devmel](https://github.com/prohand/gladys-devmel).

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/client.test.js             # one file
node --test --test-name-pattern "booking"   # tests whose name matches
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store --skip-image-check .   # store admission checks
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24, plus the store checks and a Docker
build on pull requests. Releases: **Actions → Release** only (bumps `package.json`, manifest
`version` + `docker_image`, moves the changelog, re-runs Prettier, tags, builds, publishes the
GitHub Release). The repository starts at `0.0.0`: the first release is a `major` (→ 1.0.0).

## Architecture

```
index.js                     SDK wiring only: handlers registered before connect()
src/config.js                DEFAULT_CONFIG (mirrors the manifest defaults), parseDossierId, bounds
src/service.js               the sync loop: snapshot -> devices, states, badges, scene events, status
src/store.js                 the "memory" of what was reported, /data/memory.json
src/messages.js              user-facing messages {en, fr, de, es}, amounts and days formatting
src/i18n.js                  LANGUAGES, pick, localize
src/inoe/client.js           HTTP client of the portal (version, dossier, ISM login, stores)
src/inoe/cookies.js          cookie jar (the session is in cookies on .aiga.fr)
src/inoe/parse.js            tolerant parsing: amounts, days, invoices, children, bookings
src/inoe/snapshot.js         one read of the portal -> the snapshot everything else reads
src/inoe/changes.js          what changed since the last read -> scene events + new memory
src/devices/                 family device, one device per child, registry
src/capabilities/keys.js     the trigger / action / widget keys (stored by users: never rename)
src/capabilities/scenes.js   scene actions `refresh`, `check_booking`
src/capabilities/widget.js   "Family space" widget
docs/{en,fr,de,es}.md        user documentation, re-hosted by Gladys
test/helpers/fakeInoe.js     a fake portal (fetch) — no test touches the network
```

### How the portal is read (no public API)

iNoé has no documented API: the client speaks to the endpoints of the portal's own ExtJS web
application (`https://espacefamille.aiga.fr`), read-only:

1. `GET /prod.js` lists the deployed builds; `GET https://inoe.aiga.fr/inoe/inoe<first build>/version?dossierID=<n>`
   names the build serving the structure. API base: `https://espacefamille.aiga.fr/inoe/inoe<build>/api/EF/`.
2. `POST <api>/<n>/public/infoDossierController/dossier` → `{ code, infosGenerales.nomStructure }`.
   A 303 moves the structure to another API base (follow `Location` once).
3. `POST https://ism.aiga.fr/login` `{ username, password }` (JSON) → session **cookies** on
   `.aiga.fr`; its answer is NOT the session. Then `POST <api>/<CODE>/loginController/getSession`
   (`token=null`, cookies) → `{ apiUser: { id, login, roles } }`: `id === -1` means no session
   was opened, `roles` must hold `ROLE_FAMILLE`. The web form also shows a reCAPTCHA, but the
   login call itself carries none. A failed login logs the SHAPE of both answers and the cookie
   names (`describeShape`), never their values.
4. Data, with `token=null` and the cookies: `POST tableaudebordController/infos/` (dashboard:
   `familleFacturesMontant`, `familleDocumentsAttendus`, `familleVO.listeEnfants`),
   `GET factureController/factures`, `GET filactuController/messages/`,
   `GET pointageANController/events/?idIndividu&dateDebut&dateFin` and
   `GET pointageANController/plageFonctionnements/` (same params: activity names).

A 401/403 on a data call = session expired: log in again once (`withSession`).

### Invariants worth knowing

- **Read-only.** Never add a call that books, cancels, pays or edits the family file.
- **The password goes to `ism.aiga.fr` only** and is never logged; cookie values are never
  logged (`CookieJar.describe` prints names only). Tests check both.
- **External ids are forever**: family = `family:<dossierId>-<familyId>`, child =
  `child:<dossierId>-<childId>` (iNoé ids, never names). Feature keys, trigger, action and widget
  keys are stored by users: never rename them.
- **"Booked"** = a planning event whose palette (`nouvellePalette`, else `anciennePalette`) means
  presence, not `toDelete`, not `listeAttente` (`isBooked`). The type of `presence` is not
  documented: boolean, 0/1 and letters are all read. Confirm on a real account before changing it.
- **Today / tomorrow** are computed in the configured `timezone` (default Europe/Paris), never
  in the container's UTC.
- **Scene events only for changes**: the first read of an account records without reporting
  (except `invoice_due_soon`, once per invoice); a day entering the planning window is never
  "booked". The memory lives in `/data/memory.json` (`DATA_DIR` overrides it).
- **A list that could not be read publishes nothing** (no false 0) and keeps the memory, so its
  next good read does not report everything as new.
- **Transport badge**: `cloud` after a good read, `unreachable` after a failed one. The manifest
  declares `"transports": ["cloud"]` (one channel: no "prefer local" toggle).
- **Every feature declares `min`/`max`** (NOT NULL in Gladys), text features included.
- Gladys 5.3+ (`keywords`, `countries`); 5.1+ for the widget and scenes.

### Manifest

`test/manifest.test.js` keeps `gladys-assistant-integration.json` (config schema, actions,
5.1 capabilities, keywords, countries, transports, four languages everywhere, store length
limits) in sync with `DEFAULT_CONFIG`, `src/capabilities/keys.js` and `index.js`.

## Conventions

- **Changelog**: every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a
  version heading: the Release workflow does.
- **Versions** belong to the Release workflow: never edit `version` / `docker_image` by hand.
- User-facing text is `{ en, fr, de, es }` (built with `src/i18n.js`); user docs in
  `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md`, kept in sync.
- Prettier formats, ESLint catches mistakes. Comments explain **why**, in English. Tests never
  touch the network.
