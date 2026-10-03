import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createApp } from '../server/app.js';
import { createIyzicoProvider, revokeProForUser } from '../server/iyzico.js';

const secret = 'unit-test-signing-secret';
const buyer = { name: 'John', surname: 'Doe', phone: '+905350000000', identityNumber: '74300864791', address: 'Test address for sandbox only', city: 'Istanbul' };
const sign = (response, keys) => ({ ...response, signature: createHmac('sha256', secret).update(keys.map(key => String(response[key])).join(':')).digest('hex') });

async function setup(t) {
  const state = { mode: 'success', sequence: 0, inputs: [], retrieveCount: 0, initialSignature: true };
  const client = {
    checkoutFormInitialize: { create(input, done) {
      state.inputs.push(input);
      const token = `sandbox-token-${++state.sequence}`;
      const result = sign({ status: 'success', conversationId: input.conversationId, token, paymentPageUrl: `https://sandbox-cpp.iyzipay.com/?token=${token}` }, ['conversationId', 'token']);
      if (!state.initialSignature) result.signature = '0'.repeat(64);
      done(null, result);
    } },
    checkoutForm: { retrieve(input, done) {
      state.retrieveCount++;
      let result = {
        status: 'success', paymentStatus: state.mode === 'failed' ? 'FAILURE' : 'SUCCESS',
        paymentId: `payment-${input.token}`, currency: state.mode === 'currency' ? 'USD' : 'TRY',
        basketId: state.mode === 'basket' ? 'different-purchase' : input.conversationId,
        conversationId: input.conversationId, token: input.token,
        price: '399.00', paidPrice: state.mode === 'amount' ? '1.00' : '399.00', fraudStatus: 1,
      };
      result = sign(result, ['paymentStatus', 'paymentId', 'currency', 'basketId', 'conversationId', 'paidPrice', 'price', 'token']);
      if (state.mode === 'signature') result.signature = '0'.repeat(64);
      done(null, result);
    } },
  };
  const billingProvider = createIyzicoProvider({ apiKey: 'unit-test-key', secretKey: secret, client });
  const instance = createApp({ dataDir: ':memory:', config: { appUrl: 'http://localhost:5173', nodeEnv: 'test' }, billingProvider });
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); instance.close(); });
  async function request(path, { method = 'GET', body, cookie, form = false } = {}) {
    const response = await fetch(`${base}${path}`, {
      method, redirect: 'manual', headers: {
        Origin: form ? 'https://sandbox-cpp.iyzipay.com' : 'http://localhost:5173',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}),
      }, body: body === undefined ? undefined : form ? new URLSearchParams(body).toString() : JSON.stringify(body),
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: response.status, json, location: response.headers.get('location'), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const signup = await request('/api/auth/signup', { method: 'POST', body: { name: 'John Doe', businessName: 'Test Cleaning', email: 'test@example.com', password: 'unit-test-password-24' } });
  assert.equal(signup.status, 201);
  async function checkout() {
    const result = await request('/api/billing/checkout', { method: 'POST', cookie: signup.cookie, body: buyer });
    assert.equal(result.status, 200);
    return new URL(result.json.url).searchParams.get('token');
  }
  const callback = token => request('/api/billing/iyzico/callback', { method: 'POST', form: true, body: { token } });
  return { state, request, checkout, callback, cookie: signup.cookie, userId: signup.json.user.id, db: instance.db };
}

test('verified hosted payment grants 30 days once, and expiry restores free limits', async t => {
  const { state, request, checkout, callback, cookie, db, userId } = await setup(t);
  assert.equal((await request('/api/health')).json.billingEnabled, true);
  const token = await checkout();
  assert.equal(state.inputs[0].currency, 'TRY');
  assert.equal(state.inputs[0].paidPrice, '399.00');
  assert.equal(state.inputs[0].callbackUrl, 'http://localhost:5173/api/billing/iyzico/callback');
  assert.equal((await request('/api/auth/me', { cookie })).json.user.plan, 'free');
  const paid = await callback(token);
  assert.equal(paid.status, 303);
  assert.match(paid.location, /payment=success/);
  const user = (await request('/api/auth/me', { cookie })).json.user;
  assert.equal(user.plan, 'pro');
  assert.ok(Date.parse(user.proUntil) > Date.now() + 29 * 86400000);
  const stored = db.prepare('SELECT * FROM purchases').get();
  assert.equal(stored.status, 'paid');
  assert.equal(stored.identityNumber, undefined);
  assert.equal((await request('/api/quotes', { cookie })).json.usage.limit, null);
  await callback(token);
  assert.equal((await request('/api/auth/me', { cookie })).json.user.proUntil, user.proUntil);
  assert.equal(state.retrieveCount, 1);
  db.prepare('UPDATE users SET pro_until = ? WHERE id = ?').run(Date.now() - 1000, userId);
  assert.equal((await request('/api/auth/me', { cookie })).json.user.plan, 'free');
  assert.equal((await request('/api/quotes', { cookie })).json.usage.limit, 3);
});

test('wrong amount, currency, basket, failed payment and bad signatures never grant access', async t => {
  const { state, request, checkout, callback, cookie } = await setup(t);
  const token = await checkout();
  for (const mode of ['amount', 'currency', 'basket', 'failed', 'signature']) {
    state.mode = mode;
    const result = await callback(token);
    assert.equal(result.status, 303);
    assert.match(result.location, /payment=failed/, mode);
    assert.equal((await request('/api/auth/me', { cookie })).json.user.plan, 'free', mode);
  }
  const unknown = await callback('unknown-token-123');
  assert.match(unknown.location, /payment=failed/);
  state.mode = 'success';
  assert.match((await callback(token)).location, /payment=success/);
});

test('initialize signature verification and buyer validation protect checkout', async t => {
  const { state, request, cookie } = await setup(t);
  const invalid = await request('/api/billing/checkout', { method: 'POST', cookie, body: { ...buyer, identityNumber: '' } });
  assert.equal(invalid.status, 400);
  assert.equal(state.inputs.length, 0);
  state.initialSignature = false;
  assert.equal((await request('/api/billing/checkout', { method: 'POST', cookie, body: buyer })).status, 502);
  assert.equal((await request('/api/auth/me', { cookie })).json.user.plan, 'free');
});

test('operator refund revocation cannot be undone by replaying a paid callback', async t => {
  const { request, checkout, callback, cookie, db, userId } = await setup(t);
  const token = await checkout();
  await callback(token);
  assert.equal(revokeProForUser(db, userId), true);
  assert.equal((await request('/api/auth/me', { cookie })).json.user.plan, 'free');
  assert.match((await callback(token)).location, /payment=failed/);
  assert.equal((await request('/api/auth/me', { cookie })).json.user.plan, 'free');
});
