import { test } from 'node:test';
import assert from 'node:assert/strict';
import { event } from './helpers/fakeInoe.js';
import { NOW, setup } from './helpers/setup.js';

const keys = (events) => events.map(({ key }) => key);

test('the first read records without reporting, except an invoice already due soon', async () => {
  // 2026-11-03: the invoice due on the 5th is 2 days away.
  const { gladys, service, disk } = await setup({ now: new Date('2026-11-03T08:00:00Z') });
  await service.refresh();
  assert.deepEqual(keys(gladys.fake.sceneEvents), ['invoice_due_soon']);
  assert.deepEqual(gladys.fake.sceneEvents[0].data, {
    number: 'F2026-0042',
    label: 'Restauration scolaire octobre',
    structure: 'Régie périscolaire',
    amount: 42.5,
    due_date: '2026-11-05',
    days_left: 2,
  });
  assert.ok(disk.memory.invoices.includes('7001'));

  // Reminded once only.
  await service.refresh();
  assert.equal(gladys.fake.sceneEvents.length, 1);
});

test('a new invoice and a new message fire their triggers', async () => {
  const { gladys, inoe, service } = await setup();
  await service.refresh();
  assert.deepEqual(gladys.fake.sceneEvents, []);

  inoe.invoices.push({
    id: 7002,
    numero: 'F2026-0050',
    intitule: 'Accueil de loisirs',
    montantFacture: '18.00',
    solde: '18.00',
    dateEcheance: '2026-12-10',
  });
  inoe.news.unshift({ id: 32, titre: 'Sortie au musée', date: '2026-10-26T07:00:00' });
  await service.refresh();

  assert.deepEqual(keys(gladys.fake.sceneEvents).sort(), ['new_invoice', 'new_message']);
  const invoice = gladys.fake.sceneEvents.find(({ key }) => key === 'new_invoice');
  assert.equal(invoice.data.number, 'F2026-0050');
  assert.equal(invoice.data.amount, 18);
  const message = gladys.fake.sceneEvents.find(({ key }) => key === 'new_message');
  assert.deepEqual(message.data, { title: 'Sortie au musée', date: '2026-10-26' });
});

test('a booking added or cancelled fires booking_changed for the child', async () => {
  const { gladys, inoe, service } = await setup();
  await service.refresh();
  const lea = gladys.fake.discoveredDevices[1];

  inoe.events[501] = inoe.events[501].filter((item) => item.id !== 3); // no more after-school club on the 27th
  inoe.events[501].push(event(9, '2026-10-29', 10)); // canteen on the 29th
  await service.refresh();

  const changes = gladys.fake.sceneEvents
    .filter(({ key }) => key === 'booking_changed')
    .map(({ data }) => data);
  assert.deepEqual(
    changes.sort((a, b) => a.date.localeCompare(b.date)),
    [
      {
        device: lea.external_id,
        change: 'cancelled',
        child_name: 'Léa',
        date: '2026-10-27',
        activity: 'Garderie soir',
      },
      {
        device: lea.external_id,
        change: 'booked',
        child_name: 'Léa',
        date: '2026-10-29',
        activity: 'Cantine',
      },
    ],
  );
});

test('a day entering the window is not reported as booked', async () => {
  const { gladys, inoe, service, clock } = await setup();
  await service.refresh();
  // The next day, the 7-day window reaches 2026-11-02 for the first time.
  inoe.events[501].push(event(10, '2026-11-02', 10));
  clock.now = new Date(NOW.getTime() + 24 * 3600 * 1000);
  await service.refresh();
  assert.deepEqual(
    gladys.fake.sceneEvents.filter(({ key }) => key === 'booking_changed'),
    [],
  );
});

test('the memory survives a restart: nothing is reported twice', async () => {
  const first = await setup();
  await first.service.refresh();
  const second = await setup({ memory: first.disk.memory });
  await second.service.refresh();
  assert.deepEqual(second.gladys.fake.sceneEvents, []);
});

test('an unreadable invoice list does not make every invoice new afterwards', async () => {
  const { gladys, inoe, service } = await setup();
  await service.refresh();
  const invoices = inoe.invoices;
  inoe.invoices = undefined; // the store answers { success, data: undefined } -> []
  // Simulate a failed read of the list only.
  const original = service.client.invoices.bind(service.client);
  service.client.invoices = async () => {
    throw new Error('timeout');
  };
  await service.refresh();
  service.client.invoices = original;
  inoe.invoices = invoices;
  await service.refresh();
  assert.deepEqual(
    gladys.fake.sceneEvents.filter(({ key }) => key === 'new_invoice'),
    [],
  );
});
