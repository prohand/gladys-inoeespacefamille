import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CookieJar, parseSetCookie } from '../src/inoe/cookies.js';

function headersOf(...setCookies) {
  return { getSetCookie: () => setCookies };
}

test('a cookie set for .aiga.fr by ism.aiga.fr is sent to espacefamille.aiga.fr', () => {
  const jar = new CookieJar();
  jar.store('https://ism.aiga.fr/login', headersOf('SESSION=abc; Domain=.aiga.fr; Path=/; Secure'));
  assert.equal(jar.header('https://espacefamille.aiga.fr/inoe/x'), 'SESSION=abc');
  assert.equal(jar.header('https://example.com/'), undefined);
});

test('a host-only cookie stays on its host', () => {
  const jar = new CookieJar();
  jar.store('https://ism.aiga.fr/login', headersOf('XSRF=1; Path=/'));
  assert.equal(jar.header('https://ism.aiga.fr/refresh'), 'XSRF=1');
  assert.equal(jar.header('https://espacefamille.aiga.fr/'), undefined);
});

test('a host cannot set a cookie for a domain it does not belong to', () => {
  const cookie = parseSetCookie('A=1; Domain=evil.com', 'ism.aiga.fr');
  assert.equal(cookie.domain, 'ism.aiga.fr');
  assert.equal(cookie.hostOnly, true);
});

test('an expired cookie is removed', () => {
  const jar = new CookieJar();
  jar.store('https://ism.aiga.fr/', headersOf('SESSION=abc; Domain=aiga.fr'));
  jar.store('https://ism.aiga.fr/', headersOf('SESSION=; Domain=aiga.fr; Max-Age=0'));
  assert.equal(jar.size, 0);
});

test('describe names the cookies, never their values', () => {
  const jar = new CookieJar();
  jar.store('https://ism.aiga.fr/', headersOf('SESSION=top-secret; Domain=aiga.fr'));
  assert.equal(jar.describe(), 'SESSION@aiga.fr');
  assert.doesNotMatch(jar.describe(), /top-secret/);
});
