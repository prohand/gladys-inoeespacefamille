import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Service } from '../src/service.js';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { setup } from './helpers/setup.js';

const PREFIX = 'ext:test-integration:';

test('a refresh publishes the family and one device per child', async () => {
  const { gladys, service } = await setup();
  await service.refresh();

  const devices = gladys.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => device.name),
    ['Ville de Démo – MARTIN', 'Léa – iNoé', 'Tom – iNoé'],
  );
  for (const device of devices) {
    assert.ok(device.external_id.startsWith(PREFIX));
    for (const feature of device.features) {
      assert.equal(feature.read_only, true);
      assert.ok(feature.min !== undefined && feature.max !== undefined, feature.external_id);
    }
  }
});

test('the states say what the portal shows', async () => {
  const { gladys, service } = await setup();
  await service.refresh();
  const family = gladys.fake.discoveredDevices[0];
  const lea = gladys.fake.discoveredDevices[1];
  const state = (device, key) => gladys.fake.lastState(`${device.external_id}:${key}`);

  assert.equal(state(family, 'amount-due'), 42.5);
  assert.equal(state(family, 'unpaid-invoices'), 1);
  assert.equal(state(family, 'next-due-date'), '2026-11-05');
  assert.equal(state(family, 'documents-expected'), 1);
  assert.equal(state(family, 'latest-news'), 'Fermeture le 11 novembre');

  assert.equal(state(lea, 'booked-today'), 1);
  assert.equal(state(lea, 'booked-tomorrow'), 1);
  assert.equal(state(lea, 'today'), 'Cantine');
  assert.equal(state(lea, 'tomorrow'), 'Cantine, Garderie soir');
  // The 28th carries an absence: two days booked over the week.
  assert.equal(state(lea, 'booked-days'), 2);
});

test('the devices are cloud devices, unreachable when the portal fails', async () => {
  const { gladys, inoe, service } = await setup();
  await service.refresh();
  assert.ok(gladys.fake.transports.every((entry) => entry.transport === 'cloud'));
  assert.equal(gladys.fake.connectionStatus.connected, true);

  inoe.maintenance = true;
  service.client.reset();
  await assert.rejects(service.refresh());
  const last = gladys.fake.transports.slice(-3);
  assert.ok(last.every((entry) => entry.transport === 'unreachable'));
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /maintenance/);
});

test('the devices are re-published only when their list changes', async () => {
  const { gladys, inoe, service } = await setup();
  await service.refresh();
  await service.refresh();
  assert.equal(gladys.fake.bodies('POST', '/discovered_device').length, 1);

  inoe.dashboard.familleVO.listeEnfants.push({ id: 503, prenom: 'Zoé' });
  await service.refresh();
  assert.equal(gladys.fake.bodies('POST', '/discovered_device').length, 2);
  assert.equal(gladys.fake.discoveredDevices.length, 4);
});

test('an incomplete configuration says what to fill in', async () => {
  const gladys = createFakeGladys();
  await gladys.connect();
  const service = new Service(gladys);
  service.configure({ portal_url: 'https://espacefamille.aiga.fr/123' });
  assert.equal(await service.refresh(), null);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /E-mail, Mot de passe/);
});

test('a wrong password shows in the connection status', async () => {
  const { gladys, service } = await setup({
    config: { portal_url: '11578177', username: 'parent@example.fr', password: 'wrong' },
  });
  await assert.rejects(service.refresh());
  assert.match(gladys.fake.connectionStatus.message.en, /refused the email or the password/);
});

test('one child planning failing keeps the others and publishes no false state', async () => {
  const { gladys, inoe, service } = await setup();
  inoe.failPlanningOf = '501';
  const snapshot = await service.refresh();
  assert.equal(snapshot.children[0].planningRead, false);
  assert.equal(snapshot.children[1].planningRead, true);
  const lea = gladys.fake.discoveredDevices[1];
  assert.equal(gladys.fake.lastState(`${lea.external_id}:booked-today`), undefined);
});

test('refreshes never overlap', async () => {
  const { inoe, service } = await setup();
  await Promise.all([service.refresh(), service.refresh(), service.refresh()]);
  assert.equal(inoe.calls.filter((call) => call.url.includes('tableaudebord')).length, 1);
});

test('the widget is nudged after every refresh', async () => {
  const { gladys, service } = await setup();
  await service.refresh();
  assert.deepEqual(gladys.fake.widgetRefreshes, ['family_space']);
});

test('a new account starts from a fresh session and a fresh device list', async () => {
  const { service } = await setup();
  await service.refresh();
  const first = service.client;
  service.configure({ portal_url: '11578177', username: 'parent@example.fr', password: 'other' });
  assert.notEqual(service.client, first);
  assert.equal(service.snapshot, null);
});

test('states refused by Gladys do not fail the refresh', async (t) => {
  const { gladys, service } = await setup();
  t.mock.method(gladys, 'publishChangedStates', async () => {
    throw new Error('404 device not found');
  });
  const snapshot = await service.refresh();
  assert.ok(snapshot);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('after a failure the next refresh finds the build again', async () => {
  const { inoe, service } = await setup();
  await service.refresh();
  inoe.maintenance = true;
  await assert.rejects(service.refresh());
  inoe.maintenance = false;
  inoe.build = 'v5.76.0.prod.20261101.1';
  await service.refresh();
  assert.equal(
    service.client.apiBase,
    `https://espacefamille.aiga.fr/inoe/inoe${inoe.build}/api/EF/`,
  );
});
