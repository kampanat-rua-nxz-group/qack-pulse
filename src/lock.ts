import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const MIN_PASSCODE_LENGTH = 16;
const DEFAULT_ITERATIONS = 600_000;

// Runs in the browser and in the tests. Key = PBKDF2-SHA256, cipher = AES-256-GCM (tag at the end of data).
export const DECRYPT_SOURCE = `
const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
async function decryptPayload(payload, passcode) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(payload.salt), iterations: payload.iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(payload.iv) }, key, fromBase64(payload.data));
  return new TextDecoder().decode(plain);
}`;

const PAGE_SCRIPT = `
${DECRYPT_SOURCE}
const payload = JSON.parse(document.getElementById('payload').textContent);
const form = document.getElementById('unlock');
const message = document.getElementById('message');
const input = document.getElementById('passcode');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.className = '';
  message.textContent = 'Unlocking...';
  input.removeAttribute('aria-invalid');
  try {
    const html = await decryptPayload(payload, input.value);
    document.open();
    document.write(html);
    document.close();
  } catch {
    message.className = 'error';
    message.textContent = 'Wrong passcode.';
    input.setAttribute('aria-invalid', 'true');
    input.value = '';
    input.focus();
  }
});`;

// Layout follows the Lockbox sign-in card. Token values are copied from src/style.ts (QACK DESIGN note).
const PAGE_STYLE = `
:root {
  --color-brand-primary: #2dd4bf;
  --color-brand-secondary: #5eead4;
  --color-brand-tint: rgb(45 212 191 / 5%);
  --color-brand-border: rgb(45 212 191 / 30%);
  --color-focus-ring: rgb(45 212 191 / 50%);
  --color-canvas: #09101a;
  --color-canvas-gradient-end: #151b2c;
  --color-row-module: #0d1626;
  --color-text-primary: #f8fafc;
  --color-text-heading: #ffffff;
  --color-text-muted: #a1a1aa;
  --color-border-subtle: rgb(255 255 255 / 5%);
  --color-border-card: rgb(39 39 42 / 90%);
  --color-form-error: #f43f5e;
  --color-error: #f87171;
  --radius-card: 0.75rem;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem;
  background: linear-gradient(to bottom, var(--color-canvas), var(--color-canvas-gradient-end)) fixed;
  color: var(--color-text-primary);
  font: 400 0.875rem/1.25rem ui-sans-serif, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.card {
  width: min(100%, 23.75rem); padding: 2.5rem 2.25rem 2.25rem;
  border: 1px solid var(--color-border-card); border-radius: var(--radius-card);
  background: var(--color-row-module);
  box-shadow: 0 1px 0 rgb(255 255 255 / 4%) inset, 0 24px 48px -24px rgb(0 0 0 / 55%);
}
.brand { display: flex; align-items: center; gap: 0.625rem; margin-bottom: 2rem; }
.mark {
  display: grid; place-items: center; width: 2.25rem; height: 2.25rem;
  border: 1px solid var(--color-brand-border); border-radius: 0.5rem;
  background: var(--color-brand-tint); color: var(--color-brand-primary);
}
.name { color: var(--color-text-heading); font-size: 1.125rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.25rem; }
.tagline { color: var(--color-text-muted); font-size: 0.6875rem; font-weight: 500; }
h1 { margin: 0 0 0.25rem; color: var(--color-text-heading); font-size: 1.25rem; line-height: 1.75rem; font-weight: 700; }
.lede { margin: 0 0 1.75rem; color: var(--color-text-muted); font-size: 0.8125rem; }
label { display: block; margin-bottom: 0.375rem; color: var(--color-text-muted); font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
input {
  width: 100%; padding: 0.625rem 0.75rem; border: 1px solid var(--color-border-card); border-radius: 0.5rem;
  background: var(--color-canvas); color: var(--color-text-primary); font: inherit; font-size: 0.875rem; outline: none;
  transition: border-color 150ms, box-shadow 150ms;
}
input:focus { border-color: var(--color-brand-primary); box-shadow: 0 0 0 3px var(--color-focus-ring); }
input[aria-invalid="true"] { border-color: var(--color-form-error); }
button {
  width: 100%; margin-top: 1.25rem; padding: 0.6875rem 1rem; border: 0; border-radius: 0.5rem;
  background: var(--color-brand-primary); color: var(--color-canvas); font: inherit; font-size: 0.875rem; font-weight: 600; cursor: pointer;
  transition: background 150ms, opacity 150ms;
}
button:hover { background: var(--color-brand-secondary); }
button:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }
button:disabled { opacity: 0.6; cursor: not-allowed; }
#message { min-height: 1.125rem; margin: 0.5rem 0 0; color: var(--color-text-muted); font-size: 0.75rem; line-height: 1.125rem; }
#message.error { color: var(--color-error); }
.foot { margin: 1.5rem 0 0; color: var(--color-text-muted); font-size: 0.6875rem; text-align: center; }`;

const LOCK_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';

// Returns a page that holds the encrypted HTML and asks for the passcode before showing it.
export function lockPage(html: string, passcode: string, iterations: number = DEFAULT_ITERATIONS): string {
  if (passcode.length < MIN_PASSCODE_LENGTH) {
    throw new Error(`Passcode must be at least ${MIN_PASSCODE_LENGTH} characters`);
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(passcode, salt, iterations, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(html, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  const payload = { salt: salt.toString('base64'), iv: iv.toString('base64'), iterations, data: data.toString('base64') };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>qack-pulse</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<main class="card">
<div class="brand">
<span class="mark">${LOCK_ICON}</span>
<div><div class="name">qack-pulse</div><div class="tagline">Test automation results</div></div>
</div>
<h1>Sign in</h1>
<p class="lede">Enter the passcode to continue</p>
<form id="unlock">
<label for="passcode">Passcode</label>
<input id="passcode" type="password" autocomplete="current-password" placeholder="Enter passcode" autofocus required>
<button type="submit">Unlock</button>
<p id="message" role="status"></p>
</form>
<p class="foot">Internal tool. Restricted access.</p>
</main>
<script type="application/json" id="payload">${JSON.stringify(payload)}</script>
<script>${PAGE_SCRIPT}</script>
</body>
</html>
`;
}

export async function lockFile(
  inPath: string,
  outPath: string,
  passcode: string,
  iterations: number = DEFAULT_ITERATIONS,
): Promise<void> {
  const locked = lockPage(await readFile(inPath, 'utf8'), passcode, iterations);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, locked);
}

if (import.meta.main) {
  const [inPath, outPath] = process.argv.slice(2);
  const passcode = process.env.PULSE_PASSCODE ?? '';
  if (inPath === undefined || outPath === undefined) {
    process.stderr.write('Usage: node src/lock.ts <in.html> <out.html> (passcode in PULSE_PASSCODE)\n');
    process.exitCode = 1;
  } else {
    try {
      await lockFile(inPath, outPath, passcode);
      process.stdout.write(`Wrote ${outPath}\n`);
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  }
}
