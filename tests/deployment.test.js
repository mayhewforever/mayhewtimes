import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRuntimeConfig } from '../server/config.js';
import { createApp } from '../server/app.js';

test('host-provided HTTPS origin supports production authentication and preview disables payments', async t => {
  const config = resolveRuntimeConfig({ NODE_ENV: 'production', RENDER_EXTERNAL_URL: 'https://neatquote-test.onrender.com', NEATQUOTE_PREVIEW: '1' });
  let paymentCalls = 0;
  const instance = createApp({ dataDir: ':memory:', config, billingProvider: { enabled: true, createCheckout() { paymentCalls++; } } });
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); instance.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(base + '/api/health')).json();
  assert.equal(health.previewMode, true);
  assert.equal(health.billingEnabled, false);
  const headers = { Origin: 'https://neatquote-test.onrender.com', 'Content-Type': 'application/json' };
  const registered = await fetch(base + '/api/auth/signup', { method: 'POST', headers, body: JSON.stringify({ name: 'Preview tester', businessName: 'Test Cleaning', email: 'preview@example.com', password: 'preview-test-password' }) });
  assert.equal(registered.status, 201);
  const cookie = registered.headers.get('set-cookie');
  assert.match(cookie, /Secure/);
  await registered.json();
  const session = cookie.split(';')[0];
  assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: session } })).status, 200);
  const checkout = await fetch(base + '/api/billing/checkout', { method: 'POST', headers: { ...headers, Cookie: session }, body: '{}' });
  assert.equal(checkout.status, 503);
  assert.equal(paymentCalls, 0);
  const wrongOrigin = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Origin: 'https://other.onrender.com', Cookie: session } });
  assert.equal(wrongOrigin.status, 403);
});

test('explicit application origin overrides host URL and unsafe production configuration fails', () => {
  const explicit = resolveRuntimeConfig({ NODE_ENV: 'production', APP_URL: 'https://quotes.example.com/', RENDER_EXTERNAL_URL: 'https://neatquote-test.onrender.com' });
  assert.equal(explicit.appUrl, 'https://quotes.example.com');
  assert.equal(explicit.previewMode, false);
  for (const address of ['http://quotes.example.com', 'https://user:password@quotes.example.com', 'https://quotes.example.com/path', 'invalid']) {
    assert.throws(() => resolveRuntimeConfig({ NODE_ENV: 'production', APP_URL: address }));
  }
  assert.throws(() => resolveRuntimeConfig({ NODE_ENV: 'production' }));
  assert.equal(resolveRuntimeConfig({}).appUrl, 'http://localhost:5173');
});
