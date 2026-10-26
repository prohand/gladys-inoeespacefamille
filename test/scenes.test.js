import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSceneActions } from '../src/capabilities/scenes.js';
import { SCENE_ACTIONS } from '../src/capabilities/keys.js';
import { NOW, setup } from './helpers/setup.js';

test('refresh returns the amount due and the invoices to pay', async () => {
  const { service } = await setup();
  const actions = createSceneActions(service);
  assert.deepEqual(await actions[SCENE_ACTIONS.REFRESH](), {
    amount_due: 42.5,
    unpaid_invoices: 1,
  });
});

test('check_booking answers for today and tomorrow', async () => {
  const { gladys, service } = await setup();
  const actions = createSceneActions(service);
  await service.refresh();
  const [, lea, tom] = gladys.fake.discoveredDevices;

  assert.deepEqual(
    await actions[SCENE_ACTIONS.CHECK_BOOKING]({ device: lea.external_id, day: 'today' }),
    { booked: true, activities: 'Périscolaire : Cantine' },
  );
  assert.deepEqual(
    await actions[SCENE_ACTIONS.CHECK_BOOKING]({ device: lea.external_id, day: 'tomorrow' }),
    { booked: true, activities: 'Accueil de loisirs : Matin, Repas, Après-midi' },
  );
  // Not booked is an output, not a failure.
  assert.deepEqual(
    await actions[SCENE_ACTIONS.CHECK_BOOKING]({ device: tom.external_id, day: 'today' }),
    { booked: false, activities: '' },
  );
});

test('check_booking reads the portal again once the day has changed', async () => {
  const { inoe, service, clock } = await setup();
  const actions = createSceneActions(service);
  await service.refresh();
  clock.now = new Date(NOW.getTime() + 24 * 3600 * 1000);
  const before = inoe.calls.length;
  const lea = service.snapshot.children[0];
  const device = service.gladys.externalIds('child', `11578177-${lea.id}`).device;
  assert.deepEqual(await actions[SCENE_ACTIONS.CHECK_BOOKING]({ device, day: 'today' }), {
    booked: true,
    activities: 'Accueil de loisirs : Matin, Repas, Après-midi',
  });
  assert.ok(inoe.calls.length > before);
});

test('check_booking refuses a device that is not a child', async () => {
  const { gladys, service } = await setup();
  await service.refresh();
  const family = gladys.fake.discoveredDevices[0];
  await assert.rejects(
    createSceneActions(service)[SCENE_ACTIONS.CHECK_BOOKING]({
      device: family.external_id,
      day: 'today',
    }),
    /not a child/,
  );
});

test('the outputs only carry the declared keys', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(
    await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
  );
  const { gladys, service } = await setup();
  const actions = createSceneActions(service);
  await service.refresh();
  const lea = gladys.fake.discoveredDevices[1];
  const results = {
    [SCENE_ACTIONS.REFRESH]: await actions[SCENE_ACTIONS.REFRESH](),
    [SCENE_ACTIONS.CHECK_BOOKING]: await actions[SCENE_ACTIONS.CHECK_BOOKING]({
      device: lea.external_id,
      day: 'today',
    }),
  };
  for (const declaration of manifest.scene_actions) {
    const declared = declaration.outputs.map((output) => output.key).sort();
    assert.deepEqual(Object.keys(results[declaration.key]).sort(), declared);
  }
});

test('the scene events only carry the declared keys', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(
    await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
  );
  const { gladys, inoe, service } = await setup({ now: new Date('2026-11-03T08:00:00Z') });
  await service.refresh();
  inoe.invoices.push({ id: 1, numero: 'X', montantFacture: '1', solde: '1' });
  inoe.news.push({ id: 99, titre: 'Hello', date: '2026-11-03' });
  inoe.events[501].push({
    id: 50,
    date: '2026-11-04T00:00:00',
    idActivite: 10,
    nouvellePalette: { presence: true },
  });
  await service.refresh();
  const fired = new Set(gladys.fake.sceneEvents.map(({ key }) => key));
  assert.deepEqual([...fired].sort(), [
    'booking_changed',
    'invoice_due_soon',
    'new_invoice',
    'new_message',
  ]);
  for (const { key, data } of gladys.fake.sceneEvents) {
    const trigger = manifest.scene_triggers.find((entry) => entry.key === key);
    const declared = new Set([
      ...(trigger.fields ?? []).map((field) => field.key),
      ...(trigger.variables ?? []).map((variable) => variable.key),
    ]);
    for (const dataKey of Object.keys(data)) {
      assert.ok(declared.has(dataKey), `${key}.${dataKey} is not declared`);
    }
  }
});
