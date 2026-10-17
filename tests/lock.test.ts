import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { LOGO } from '../src/icons.ts';
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

// Execute the generated browser script with real crypto and a minimal DOM boundary.
function openLockedPage(page: string, storage: Map<string, string>, blocked = false, hash = '') {
  let submit: (event: { preventDefault(): void }) => Promise<void>;
  let rendered = '';
  let scrolled = false;
  const input = { value: '', removeAttribute() {}, setAttribute() {}, focus() {} };
  const message = { textContent: '', className: '' };
  const document = {
    getElementById(id: string) {
      if (id === 'payload') return { textContent: JSON.stringify(payloadOf(page)) };
      if (id === 'unlock') return { addEventListener(_event: string, handler: typeof submit) { submit = handler; } };
      if (id === 'message') return message;
      if (id === 'passcode') return input;
      if (id === 'job') return { scrollIntoView() { scrolled = true; } };
      return null;
    },
    open() {},
    write(html: string) { rendered = html; },
    close() {},
  };
  const sessionStorage = {
    getItem(key: string) {
      if (blocked) throw new Error('Storage blocked');
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (blocked) throw new Error('Storage blocked');
      storage.set(key, value);
    },
    removeItem(key: string) {
      if (blocked) throw new Error('Storage blocked');
      storage.delete(key);
    },
  };
  const script = page.match(/<script>(.*?)<\/script>/s);
  assert.ok(script);
  new Function('document', 'sessionStorage', 'location', script[1])(document, sessionStorage, { hash });
  return {
    input,
    message,
    get html() { return rendered; },
    get scrolled() { return scrolled; },
    async unlock(passcode: string) {
      input.value = passcode;
      await submit({ preventDefault() {} });
    },
    async waitForAutomaticUnlock() {
      for (let i = 0; i < 100 && rendered === '' && message.className !== 'error'; i++) await delay(10);
    },
  };
}

test('unlocking the dashboard remembers access for history and refresh in the same tab', async () => {
  const storage = new Map<string, string>();
  const dashboard = openLockedPage(lockPage(HTML, PASSCODE, FAST), storage);
  await dashboard.unlock(PASSCODE);
  assert.equal(dashboard.html, HTML);
  const historyHtml = '<html><body><h1>History</h1><div id="job"></div></body></html>';
  const historyPage = lockPage(historyHtml, PASSCODE, FAST);
  for (let i = 0; i < 2; i++) {
    const history = openLockedPage(historyPage, storage, false, '#job');
    await history.waitForAutomaticUnlock();
    assert.equal(history.html, historyHtml);
    assert.equal(history.scrolled, true);
  }
});

test('a fresh tab session requires manual unlock', async () => {
  const page = openLockedPage(lockPage(HTML, PASSCODE, FAST), new Map());
  assert.equal(page.html, '');
  await page.unlock(PASSCODE);
  assert.equal(page.html, HTML);
});

test('wrong passcodes are not remembered', async () => {
  const storage = new Map<string, string>();
  const page = openLockedPage(lockPage(HTML, PASSCODE, FAST), storage);
  await page.unlock('wrong-passcode-wrong');
  assert.equal(page.html, '');
  assert.equal(page.message.className, 'error');
  assert.equal(storage.size, 0);
});

test('a changed passcode clears remembered access and allows manual unlock', async () => {
  const storage = new Map<string, string>();
  const dashboard = openLockedPage(lockPage(HTML, PASSCODE, FAST), storage);
  await dashboard.unlock(PASSCODE);
  assert.equal(storage.size, 1);
  const newPasscode = 'new-correct-horse-battery-staple';
  const history = openLockedPage(lockPage(HTML, newPasscode, FAST), storage);
  await history.waitForAutomaticUnlock();
  assert.equal(history.html, '');
  assert.equal(storage.size, 0);
  await history.unlock(newPasscode);
  assert.equal(history.html, HTML);
});

test('manual unlock still works when session storage is blocked', async () => {
  const page = openLockedPage(lockPage(HTML, PASSCODE, FAST), new Map(), true);
  await page.unlock(PASSCODE);
  assert.equal(page.html, HTML);
});

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

test('page brand matches the dashboard logo and wordmark', () => {
  const page = lockPage(HTML, PASSCODE, FAST);
  assert.ok(page.includes(LOGO));
  assert.match(page, /QACK <span class="accent">PULSE<\/span>/);
  assert.match(page, /--color-surface-card-top: /);
  assert.match(page, /--color-guide: /);
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
