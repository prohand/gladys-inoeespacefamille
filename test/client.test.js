import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiBaseFor,
  baseFromRedirect,
  INOE_ERRORS,
  InoeClient,
  InoeError,
  parseBuilds,
} from '../src/inoe/client.js';
import { BUILD, createFakeInoe, DOSSIER_ID, PASSWORD, USERNAME } from './helpers/fakeInoe.js';

function clientFor(fake, account = {}) {
  return new InoeClient(
    { dossierId: DOSSIER_ID, username: USERNAME, password: PASSWORD, ...account },
    { fetch: fake.fetch },
  );
}

test('parseBuilds reads the builds prod.js lists', () => {
  assert.deepEqual(parseBuilds('a.push(\'v1\');\na.push("v2");'), ['v1', 'v2']);
  assert.deepEqual(parseBuilds(''), []);
});

test('apiBaseFor and baseFromRedirect build the API base', () => {
  assert.equal(apiBaseFor('"v5.75.1"'), 'https://espacefamille.aiga.fr/inoe/inoev5.75.1/api/EF/');
  assert.equal(
    baseFromRedirect(
      'https://other.aiga.fr/inoe/inoev9/api/EF/123/public/infoDossierController/dossier',
      'https://espacefamille.aiga.fr/x',
    ),
    'https://other.aiga.fr/inoe/inoev9/api/EF/',
  );
  assert.equal(
    baseFromRedirect('/inoe/inoev9/api/EF', 'https://espacefamille.aiga.fr/x'),
    'https://espacefamille.aiga.fr/inoe/inoev9/api/EF/',
  );
});

test('the whole flow: build, dossier, login, then the data', async () => {
  const fake = createFakeInoe();
  const client = clientFor(fake);

  const dossier = await client.loadDossier();
  assert.deepEqual(dossier, { id: DOSSIER_ID, code: 'DEMO', name: 'Ville de Démo' });
  assert.equal(client.apiBase, `https://espacefamille.aiga.fr/inoe/inoe${BUILD}/api/EF/`);

  const dashboard = await client.dashboard();
  assert.equal(dashboard.familleFacturesMontant, 42.5);
  assert.equal((await client.invoices()).length, 1);
  assert.equal((await client.news()).length, 1);
  const planning = await client.planning('501', '2026-10-26', '2026-10-27');
  assert.equal(planning.events.length, 3);
  assert.equal(planning.slots.length, 2);
  assert.equal(fake.logins, 1);
});

test('the version is asked with the FIRST build prod.js lists, as the portal does', async () => {
  const fake = createFakeInoe();
  await clientFor(fake).loadDossier();
  const versionCall = fake.calls.find((call) => call.url.includes('/version'));
  assert.match(
    versionCall.url,
    /inoev5\.74\.0\.prod\.20260915\.55231\/version\?dossierID=11578177/,
  );
});

test('the password only ever goes to the ISM login', async () => {
  const fake = createFakeInoe();
  const client = clientFor(fake);
  await client.dashboard();
  const carrying = fake.calls.filter((call) => String(call.body ?? '').includes(PASSWORD));
  assert.equal(carrying.length, 1);
  assert.equal(new URL(carrying[0].url).host, 'ism.aiga.fr');
  assert.doesNotMatch(JSON.stringify(client), new RegExp(PASSWORD));
});

test('a 303 of the dossier endpoint moves the client to the new API base', async () => {
  const fake = createFakeInoe();
  fake.redirectDossierTo = `https://espacefamille.aiga.fr/inoe/inoev9.0.0/api/EF/${DOSSIER_ID}/public/infoDossierController/dossier`;
  const client = clientFor(fake);
  await client.loadDossier();
  assert.equal(client.apiBase, 'https://espacefamille.aiga.fr/inoe/inoev9.0.0/api/EF/');
});

test('an unknown structure number is a DOSSIER error', async () => {
  const fake = createFakeInoe();
  await assert.rejects(clientFor(fake, { dossierId: '999' }).loadDossier(), (err) => {
    assert.ok(err instanceof InoeError);
    assert.equal(err.code, INOE_ERRORS.DOSSIER);
    return true;
  });
});

test('a wrong password is a LOGIN error', async () => {
  const fake = createFakeInoe();
  await assert.rejects(clientFor(fake, { password: 'nope' }).dashboard(), {
    code: INOE_ERRORS.LOGIN,
  });
});

test('an expired session is renewed once, transparently', async () => {
  const fake = createFakeInoe();
  const client = clientFor(fake);
  await client.dashboard();
  fake.expireSessions();
  await client.invoices();
  assert.equal(fake.logins, 2);
});

test('maintenance and network failures have their own code', async () => {
  const fake = createFakeInoe();
  fake.maintenance = true;
  await assert.rejects(clientFor(fake).loadDossier(), { code: INOE_ERRORS.MAINTENANCE });

  const offline = new InoeClient(
    { dossierId: DOSSIER_ID, username: USERNAME, password: PASSWORD },
    {
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    },
  );
  await assert.rejects(offline.loadDossier(), { code: INOE_ERRORS.NETWORK });
});

test('reset forgets the session: the next call logs in again', async () => {
  const fake = createFakeInoe();
  const client = clientFor(fake);
  await client.dashboard();
  client.reset();
  await client.dashboard();
  assert.equal(fake.logins, 2);
});
