import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  isValidTimezone,
  missingSettings,
  normalizeConfig,
  parseDossierId,
} from '../src/config.js';

test('the structure number is read from what the user pastes', () => {
  assert.equal(parseDossierId('https://espacefamille.aiga.fr/11578177'), '11578177');
  assert.equal(parseDossierId('https://espacefamille.aiga.fr/11578177/'), '11578177');
  assert.equal(parseDossierId('https://espacefamille.aiga.fr/11578177#login'), '11578177');
  assert.equal(
    parseDossierId('https://espacefamille.aiga.fr/index.html?dossier=2000212'),
    '2000212',
  );
  // The sign-in page as the browser shows it, hash included.
  assert.equal(
    parseDossierId('https://espacefamille.aiga.fr/index.html?dossier=1626256#connexion&212628'),
    '1626256',
  );
  assert.equal(parseDossierId(' 11578177 '), '11578177');
  assert.equal(parseDossierId('https://espacefamille.aiga.fr/'), null);
  assert.equal(parseDossierId('mairie'), null);
  assert.equal(parseDossierId(''), null);
  assert.equal(parseDossierId(undefined), null);
});

test('normalizeConfig applies the defaults and the bounds', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  const config = normalizeConfig({
    portal_url: ' 123 ',
    username: ' a@b.fr ',
    refresh_minutes: '5',
    reminder_days: '99',
    planning_days: '',
    timezone: 'Mars/Olympus',
  });
  assert.equal(config.portal_url, '123');
  assert.equal(config.username, 'a@b.fr');
  assert.equal(config.refresh_minutes, 15);
  assert.equal(config.reminder_days, 30);
  assert.equal(config.planning_days, DEFAULT_CONFIG.planning_days);
  assert.equal(config.timezone, 'Europe/Paris');
  assert.equal(normalizeConfig({ timezone: 'Indian/Reunion' }).timezone, 'Indian/Reunion');
});

test('the password is kept as typed, spaces included', () => {
  assert.equal(normalizeConfig({ password: ' a b ' }).password, ' a b ');
});

test('missingSettings names what is left to fill in', () => {
  assert.deepEqual(missingSettings(normalizeConfig()), ['portal_url', 'username', 'password']);
  assert.deepEqual(
    missingSettings(normalizeConfig({ portal_url: '1', username: 'u', password: 'p' })),
    [],
  );
});

test('isValidTimezone knows the IANA names', () => {
  assert.equal(isValidTimezone('Europe/Paris'), true);
  assert.equal(isValidTimezone('Nowhere/Land'), false);
});
