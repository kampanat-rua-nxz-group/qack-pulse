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
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = 'Unlocking...';
  try {
    const html = await decryptPayload(payload, document.getElementById('passcode').value);
    document.open();
    document.write(html);
    document.close();
  } catch {
    message.textContent = 'Wrong passcode.';
  }
});`;

const PAGE_STYLE = `
:root { color-scheme: light dark; }
body { font: 16px system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; }
form { display: grid; gap: 12px; width: min(320px, 90vw); }
input, button { font: inherit; padding: 10px; }
#message { min-height: 1.2em; margin: 0; }`;

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
<form id="unlock">
<label for="passcode">Passcode</label>
<input id="passcode" type="password" autocomplete="current-password" autofocus required>
<button type="submit">Unlock</button>
<p id="message" role="status"></p>
</form>
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
