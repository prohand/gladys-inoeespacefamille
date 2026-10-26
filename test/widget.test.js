import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildFamilyWidget, createWidgets } from '../src/capabilities/widget.js';
import { FAMILY_WIDGET, WIDGET_ACTIONS } from '../src/capabilities/keys.js';
import { setup } from './helpers/setup.js';

test('the widget is rendered exactly as sent, before and after the first read', async () => {
  const { service } = await setup();
  const waiting = buildFamilyWidget(service);
  assert.deepEqual(validateWidgetContent(waiting), []);
  assert.match(waiting.components[0].text.fr, /première lecture/);

  await service.refresh();
  const content = buildFamilyWidget(service);
  assert.deepEqual(validateWidgetContent(content), []);
});

test('the amount tile is bound to the published amount-due feature', async () => {
  const { gladys, service } = await setup();
  await service.refresh();
  const tile = buildFamilyWidget(service).components.find((c) => c.type === 'value');
  const family = gladys.fake.discoveredDevices[0];
  assert.equal(tile.device_feature, `${family.external_id}:amount-due`);
  assert.ok(family.features.some((feature) => feature.external_id === tile.device_feature));
});

test('the status rows show the next invoice and every child', async () => {
  const { service } = await setup({ now: new Date('2026-11-03T08:00:00Z') });
  await service.refresh();
  const { items } = buildFamilyWidget(service).components.find((c) => c.type === 'status');
  assert.equal(items[0].color, 'warning'); // due in 2 days, reminder at 3
  assert.match(items[0].value.fr, /42,50\s€/);
  assert.deepEqual(
    items.slice(1, 3).map((item) => item.label),
    ['Léa', 'Tom'],
  );
  assert.equal(items[3].value, 1); // documents expected
});

test('a failed read keeps the last rows and says why', async () => {
  const { inoe, service } = await setup();
  await service.refresh();
  inoe.maintenance = true;
  service.client.reset();
  await service.refresh().catch(() => {});
  const content = buildFamilyWidget(service);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.ok(content.components.some((c) => c.type === 'text' && /maintenance/.test(c.text.en)));
});

test('the Refresh button reads the portal and answers a toast', async () => {
  const { inoe, service } = await setup();
  const widget = createWidgets(service)[FAMILY_WIDGET];
  const toast = await widget.action(WIDGET_ACTIONS.REFRESH);
  assert.match(toast.fr, /Actualisé/);
  assert.ok(inoe.calls.some((call) => call.url.includes('tableaudebord')));
  await assert.rejects(widget.action('nope'), /Unknown widget action/);
});

test('every button action of the content is handled', async () => {
  const { service } = await setup();
  await service.refresh();
  const widget = createWidgets(service)[FAMILY_WIDGET];
  const actions = buildFamilyWidget(service)
    .components.filter((c) => c.type === 'button' && c.action)
    .map((c) => c.action.key);
  assert.deepEqual(actions, [WIDGET_ACTIONS.REFRESH]);
  for (const key of actions) {
    await widget.action(key);
  }
});
