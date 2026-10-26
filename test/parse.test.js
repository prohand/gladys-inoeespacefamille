import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  bookingsByDay,
  daysBetween,
  isBooked,
  localDay,
  normalizeChildren,
  normalizeInvoices,
  normalizeNews,
  parseAmount,
  parseDay,
} from '../src/inoe/parse.js';

test('amounts are read whatever their format', () => {
  assert.equal(parseAmount('12.50'), 12.5);
  assert.equal(parseAmount('12,50'), 12.5);
  assert.equal(parseAmount('1 234,56 €'), 1234.56);
  assert.equal(parseAmount('1 234,56 €'), 1234.56);
  assert.equal(parseAmount('1.234,56'), 1234.56);
  assert.equal(parseAmount('1,234.56'), 1234.56);
  assert.equal(parseAmount(7), 7);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount(null), null);
  assert.equal(parseAmount('n/a'), null);
});

test('days are read from the formats the portal uses', () => {
  assert.equal(parseDay('2026-10-27'), '2026-10-27');
  assert.equal(parseDay('2026-10-27T00:00:00'), '2026-10-27');
  assert.equal(parseDay('27/10/2026'), '2026-10-27');
  assert.equal(parseDay(null), null);
});

test('today is the family day, not the UTC one', () => {
  // 23:30 UTC on the 26th is already the 27th in Paris (UTC+1 in winter).
  const late = new Date('2026-10-26T23:30:00Z');
  assert.equal(localDay(late, 'Europe/Paris'), '2026-10-27');
  assert.equal(localDay(late, 'UTC'), '2026-10-26');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-10-26', '2026-11-05'), 10);
});

test('invoices with nothing left to pay are dropped, the earliest due first', () => {
  const invoices = normalizeInvoices([
    { id: 1, numero: 'A', montantFacture: '10', solde: '0' },
    { id: 2, numero: 'B', montantFacture: '20', solde: '20', reglerAvant: '2026-12-01' },
    { id: 3, numero: 'C', montantFacture: '30', montantRegle: '5', dateEcheance: '2026-11-01' },
  ]);
  assert.deepEqual(
    invoices.map((invoice) => [invoice.number, invoice.balance, invoice.dueDate]),
    [
      ['C', 25, '2026-11-01'],
      ['B', 20, '2026-12-01'],
    ],
  );
  assert.deepEqual(normalizeInvoices(null), []);
});

test('the children exclude the parents and the placeholder', () => {
  const children = normalizeChildren({
    familleVO: {
      listeEnfants: [
        { id: -1, prenom: 'Ajouter' },
        { id: 1, prenom: 'Léa' },
        { id: 2, prenom: 'Papa', parent: true },
      ],
    },
  });
  assert.deepEqual(children, [{ id: '1', firstName: 'Léa', lastName: '' }]);
  assert.deepEqual(normalizeChildren({}), []);
});

test('isBooked reads the presence flag in every form', () => {
  const withPresence = (presence) => ({ nouvellePalette: { presence } });
  assert.equal(isBooked(withPresence(true)), true);
  assert.equal(isBooked(withPresence(false)), false);
  assert.equal(isBooked(withPresence(1)), true);
  assert.equal(isBooked(withPresence(0)), false);
  assert.equal(isBooked(withPresence('P')), true);
  assert.equal(isBooked(withPresence('A')), false);
  assert.equal(isBooked(withPresence(undefined)), true);
  assert.equal(isBooked({ anciennePalette: { presence: true } }), true);
  assert.equal(isBooked({}), false);
  assert.equal(isBooked({ ...withPresence(true), toDelete: true }), false);
  assert.equal(isBooked({ ...withPresence(true), listeAttente: true }), false);
});

test('bookingsByDay groups the booked activities by day, by name', () => {
  const days = bookingsByDay({
    slots: [
      { idActivite: 10, intitule: 'Cantine' },
      { idActivite: 11, intitule: 'Garderie' },
    ],
    events: [
      { date: '2026-10-27T00:00:00', idActivite: 11, nouvellePalette: { presence: true } },
      { date: '2026-10-27T00:00:00', idActivite: 10, nouvellePalette: { presence: true } },
      { date: '2026-10-27T00:00:00', idActivite: 10, nouvellePalette: { presence: true } },
      { date: '2026-10-28T00:00:00', idActivite: 10, nouvellePalette: { presence: false } },
      { date: '2026-10-29T00:00:00', idActivite: 99, nouvellePalette: { presence: true } },
    ],
  });
  assert.deepEqual(Object.fromEntries(days), {
    '2026-10-27': ['Cantine', 'Garderie'],
    '2026-10-29': ['#99'],
  });
});

test('news are sorted newest first', () => {
  const news = normalizeNews([
    { id: 1, titre: 'Old', date: '2026-01-01T00:00:00' },
    { id: 2, titre: 'New', date: '2026-10-01T00:00:00' },
    { titre: 'no id' },
  ]);
  assert.deepEqual(
    news.map((message) => message.title),
    ['New', 'Old'],
  );
});
