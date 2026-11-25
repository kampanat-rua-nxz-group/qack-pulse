import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tip } from '../src/tip.ts';

test('renders a labelled button described by its hidden tooltip text', () => {
  assert.equal(
    tip('tip-x', 'About x', 'Explains x.'),
    '<span class="tip"><button type="button" class="tip-button" aria-label="About x" aria-describedby="tip-x">i</button><span class="tip-text" role="tooltip" id="tip-x">Explains x.</span></span>',
  );
});

test('escapes the label and the text', () => {
  const html = tip('tip-y', 'About <y>', 'a & "b"');
  assert.match(html, /aria-label="About &lt;y&gt;"/);
  assert.match(html, />a &amp; &quot;b&quot;<\/span>/);
});
