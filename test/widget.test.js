import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  buildBookingsWidget,
  buildFamilyWidget,
  createWidgets,
} from '../src/capabilities/widget.js';
import { BOOKINGS_WIDGET, FAMILY_WIDGET, WIDGET_ACTIONS } from '../src/capabilities/keys.js';
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

test('the status rows show the next invoice and each child today and tomorrow', async () => {
  const { service } = await setup();
  await service.refresh();
  const { items } = buildFamilyWidget(service).components.find((c) => c.type === 'status');
  assert.match(items[0].value.fr, /42,50\s€/);
  assert.deepEqual(
    items.slice(1, 5).map((item) => item.label.fr),
    ["Léa · aujourd'hui", 'Léa · demain', "Tom · aujourd'hui", 'Tom · demain'],
  );
  assert.equal(items[1].value, 'Cantine');
  // The full day fits in its own row.
  assert.equal(items[2].value, 'Matin, Repas, Après-midi');
  assert.equal(items[3].value.fr, 'Rien');
  assert.equal(items[5].value, 1); // documents expected
});

test('an invoice close to its due date shows in orange', async () => {
  const { service } = await setup({ now: new Date('2026-11-03T08:00:00Z') });
  await service.refresh();
  const { items } = buildFamilyWidget(service).components.find((c) => c.type === 'status');
  assert.equal(items[0].color, 'warning'); // due in 2 days, reminder at 3
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

test('the bookings widget shows one card per booked day, in date order', async () => {
  const { service } = await setup();
  await service.refresh();
  const content = buildBookingsWidget(service);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].text.fr, 'Les 7 prochains jours');
  const { items } = content.components.find((c) => c.type === 'card-list');
  // Monday's canteen and Tuesday's full day; the absence of Wednesday is no booking.
  assert.deepEqual(
    items.map((item) => item.title.fr),
    ['lundi 26 octobre', 'mardi 27 octobre'],
  );
  assert.equal(items[0].subtitle, 'Léa : Cantine');
  assert.equal(items[0].badge.text.fr, "Aujourd'hui");
  assert.equal(items[1].badge.text.fr, 'Demain');
  assert.equal(items[1].subtitle, 'Léa : Matin, Repas, Après-midi');
  assert.match(items[1].description, /^Léa — Accueil de loisirs : Matin, Repas, Après-midi$/);
  assert.ok(!content.components.some((c) => c.type === 'text' && c.variant === 'body'));
});

test('the bookings widget says when nothing is booked or a planning is unreadable', async () => {
  const { inoe, service } = await setup();
  inoe.events[501] = [];
  await service.refresh();
  let content = buildBookingsWidget(service);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.ok(!content.components.some((c) => c.type === 'card-list'));
  assert.ok(
    content.components.some((c) => c.type === 'text' && /Aucune réservation/.test(c.text.fr)),
  );

  inoe.failPlanningOf = '502';
  await service.refresh();
  content = buildBookingsWidget(service);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.ok(content.components.some((c) => c.type === 'text' && /illisible : Tom/.test(c.text.fr)));
});

test('the bookings widget waits for the first read and has a working Refresh button', async () => {
  const { service } = await setup();
  const waiting = buildBookingsWidget(service);
  assert.deepEqual(validateWidgetContent(waiting), []);
  assert.match(waiting.components[0].text.fr, /première lecture/);

  const widget = createWidgets(service)[BOOKINGS_WIDGET];
  const toast = await widget.action(WIDGET_ACTIONS.REFRESH);
  assert.match(toast.fr, /Actualisé/);
  assert.ok(service.snapshot);
});
