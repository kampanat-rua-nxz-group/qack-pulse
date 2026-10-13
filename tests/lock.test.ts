import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DECRYPT_SOURCE, MIN_PASSCODE_LENGTH, lockFile, lockPage } from '../src/lock.ts';

const PASSCODE = 'correct-horse-battery-staple';
const HTML = '<!doctype html><html><body><h1>merchant-api 42 passed</h1></body></html>';
const FAST = 1000;

const payloadOf = (page: string) => {
  const match = page.match(/<script type="application\/json" id="payload">(.*?)<\/script>/s);
  assert.ok(match, 'page has a payload script');
  return JSON.parse(match[1]);
};

// The same function the browser runs, evaluated in Node.
const browserDecrypt = (): ((payload: unknown, passcode: string) => Promise<string>) =>
  new Function(`${DECRYPT_SOURCE}\nreturn decryptPayload;`)();

test('page does not contain the original content or the passcode', () => {
  const page = lockPage(HTML, PASSCODE, FAST);
  assert.doesNotMatch(page, /merchant-api/);
  assert.doesNotMatch(page, /42 passed/);
  assert.equal(page.includes(PASSCODE), false);
});

test('page has a password form and asks search engines to skip it', () => {
  const page = lockPage(HTML, PASSCODE, FAST);
  assert.match(page, /<form/);
  assert.match(page, /<input[^>]+type="password"/);
  assert.match(page, /noindex/);
});

test('page is a login card styled with the QACK design tokens', () => {
  const page = lockPage(HTML, PASSCODE, FAST);
  assert.match(page, /<h1>Sign in<\/h1>/);
  assert.match(page, /<label for="passcode">Passcode<\/label>/);
  assert.match(page, /--color-brand-primary: #2dd4bf/);
  assert.match(page, /--color-canvas: #09101a/);
  assert.match(page, /class="card"/);
  assert.match(page, /id="message" role="status"/);
});

test('the browser decrypt function restores the original page', async () => {
  const payload = payloadOf(lockPage(HTML, PASSCODE, FAST));
  assert.equal(await browserDecrypt()(payload, PASSCODE), HTML);
});

test('a wrong passcode fails to decrypt', async () => {
  const payload = payloadOf(lockPage(HTML, PASSCODE, FAST));
  await assert.rejects(browserDecrypt()(payload, 'wrong-passcode-wrong'));
});

test('each call uses a new salt and iv', () => {
  const a = payloadOf(lockPage(HTML, PASSCODE, FAST));
  const b = payloadOf(lockPage(HTML, PASSCODE, FAST));
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.data, b.data);
});

test('the payload records the iteration count', () => {
  assert.equal(payloadOf(lockPage(HTML, PASSCODE, FAST)).iterations, FAST);
});

test('rejects a passcode shorter than the minimum', () => {
  assert.throws(() => lockPage(HTML, 'x'.repeat(MIN_PASSCODE_LENGTH - 1), FAST), /at least \d+ characters/);
});

test('lockFile reads one file and writes the locked page to another', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qack-pulse-lock-'));
  writeFileSync(join(dir, 'in.html'), HTML);
  await lockFile(join(dir, 'in.html'), join(dir, 'site', 'index.html'), PASSCODE, FAST);
  const out = readFileSync(join(dir, 'site', 'index.html'), 'utf8');
  assert.equal(await browserDecrypt()(payloadOf(out), PASSCODE), HTML);
});
