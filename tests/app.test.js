import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, calculateTotals } from '../server/app.js';

async function fixture(t, extra = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'neatquote-test-'));
  const instance = createApp({ dataDir, config: { appUrl: 'http://localhost:5173', nodeEnv: 'test', ...extra } });
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    instance.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  async function request(path, { method = 'GET', body, cookie, origin = 'http://localhost:5173' } = {}) {
    const headers = { Origin: origin };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { status: response.status, json, headers: response.headers, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function signup(email = 'owner@example.com') {
    const result = await request('/api/auth/signup', { method: 'POST', body: { name: 'Ada Cleaner', email, password: 'Good-password-2026!', businessName: 'Ada Cleaning' } });
    assert.equal(result.status, 201);
    assert.ok(result.cookie);
    return result;
  }
  return { request, signup, instance, dataDir };
}

const validUntil = () => new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const draft = (overrides = {}) => ({
  title: 'Deep clean', clientName: 'Alex Customer', clientEmail: 'alex@example.com',
  address: '42 Garden Street', frequency: 'one-time',
  items: [{ name: 'Home cleaning', description: 'Kitchen, bathrooms, floors', quantity: 1.5, unitPrice: 10001 }],
  discountPercent: 10, taxPercent: 20, notes: 'Supplies included.', validUntil: validUntil(), ...overrides,
});

test('signup, password login, session logout and protected routes work', async t => {
  const { request, signup } = await fixture(t);
  assert.equal((await request('/api/quotes')).status, 401);
  const account = await signup();
  assert.equal(account.json.user.plan, 'free');
  assert.equal(account.json.user.password, undefined);
  assert.match(account.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(account.headers.get('set-cookie'), /SameSite=Lax/i);
  assert.equal((await request('/api/auth/me', { cookie: account.cookie })).json.user.email, 'owner@example.com');
  const wrong = await request('/api/auth/login', { method: 'POST', body: { email: 'owner@example.com', password: 'incorrect-password' } });
  assert.equal(wrong.status, 401);
  const login = await request('/api/auth/login', { method: 'POST', body: { email: 'owner@example.com', password: 'Good-password-2026!' } });
  assert.equal(login.status, 200);
  assert.ok(login.cookie);
  await request('/api/auth/logout', { method: 'POST', cookie: login.cookie });
  assert.equal((await request('/api/auth/me', { cookie: login.cookie })).status, 401);
});

test('quotes round money on the server and persist in the database', async t => {
  const { request, signup } = await fixture(t);
  const { cookie } = await signup();
  const forged = await request('/api/quotes', { method: 'POST', cookie, body: draft({ total: 1, status: 'accepted' }) });
  assert.equal(forged.status, 400);
  const made = await request('/api/quotes', { method: 'POST', cookie, body: draft() });
  assert.equal(made.status, 201);
  const quote = made.json.quote;
  assert.equal(quote.subtotal, 15002);
  assert.equal(quote.discount, 1500);
  assert.equal(quote.tax, 2700);
  assert.equal(quote.total, 16202);
  assert.equal(quote.status, 'draft');
  const fetched = await request(`/api/quotes/${quote.id}`, { cookie });
  assert.equal(fetched.json.quote.total, 16202);
  const list = await request('/api/quotes', { cookie });
  assert.equal(list.json.quotes.length, 1);
  assert.equal(list.json.usage.used, 1);
  assert.equal(calculateTotals([{ quantity: 0.29, unitPrice: 50 }]).total, 15);
});

test('free quote allowance cannot be reset by deleting a quote', async t => {
  const { request, signup } = await fixture(t);
  const { cookie } = await signup();
  for (let i = 0; i < 3; i++) {
    const made = await request('/api/quotes', { method: 'POST', cookie, body: draft() });
    assert.equal(made.status, 201);
    const removed = await request(`/api/quotes/${made.json.quote.id}`, { method: 'DELETE', cookie });
    assert.ok([200, 204].includes(removed.status));
  }
  const fourth = await request('/api/quotes', { method: 'POST', cookie, body: draft() });
  assert.ok([402, 403].includes(fourth.status));
  const list = await request('/api/quotes', { cookie });
  assert.equal(list.json.usage.used, 3);
  assert.equal(list.json.quotes.length, 0);
});

test('public quote sharing, client acceptance and accepted quote protection work', async t => {
  const { request, signup } = await fixture(t);
  const { cookie } = await signup();
  const made = await request('/api/quotes', { method: 'POST', cookie, body: draft() });
  const { id, publicToken } = made.json.quote;
  assert.equal((await request(`/api/public/quotes/${publicToken}`)).status, 404);
  const sent = await request(`/api/quotes/${id}/send`, { method: 'POST', cookie });
  assert.equal(sent.status, 200);
  assert.equal(sent.json.quote.status, 'sent');
  const shared = await request(`/api/public/quotes/${publicToken}`);
  assert.equal(shared.status, 200);
  assert.equal(shared.json.business.name, 'Ada Cleaning');
  assert.equal(shared.json.quote.ownerId, undefined);
  const accepted = await request(`/api/public/quotes/${publicToken}/accept`, { method: 'POST', body: { name: 'Alex Customer' } });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json.quote.status, 'accepted');
  assert.equal(accepted.json.quote.acceptedName, 'Alex Customer');
  const repeat = await request(`/api/public/quotes/${publicToken}/accept`, { method: 'POST', body: { name: 'Different name' } });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.json.quote.acceptedName, 'Alex Customer');
  const changed = await request(`/api/quotes/${id}`, { method: 'PUT', cookie, body: draft({ title: 'Changed after acceptance' }) });
  assert.equal(changed.status, 409);
  assert.equal((await request(`/api/quotes/${id}`, { method: 'DELETE', cookie })).status, 409);
});

test('tenant isolation protects read, edit, send and delete', async t => {
  const { request, signup } = await fixture(t);
  const owner = await signup();
  const other = await signup('other@example.com');
  const made = await request('/api/quotes', { method: 'POST', cookie: owner.cookie, body: draft() });
  const path = `/api/quotes/${made.json.quote.id}`;
  for (const options of [
    { method: 'GET' }, { method: 'PUT', body: draft() }, { method: 'DELETE' },
  ]) assert.equal((await request(path, { ...options, cookie: other.cookie })).status, 404);
  assert.equal((await request(`${path}/send`, { method: 'POST', cookie: other.cookie })).status, 404);
  assert.equal((await request('/api/quotes', { cookie: other.cookie })).json.quotes.length, 0);
});

test('input validation and cross-origin protections reject unsafe requests', async t => {
  const { request, signup } = await fixture(t);
  const { cookie } = await signup();
  const badItems = await request('/api/quotes', { method: 'POST', cookie, body: draft({ items: [{ name: 'Bad', description: '', quantity: -1, unitPrice: -100 }] }) });
  assert.equal(badItems.status, 400);
  const badDate = await request('/api/quotes', { method: 'POST', cookie, body: draft({ validUntil: '2026-99-99' }) });
  assert.equal(badDate.status, 400);
  const badProfile = await request('/api/profile', { method: 'PUT', cookie, body: { name: 'Ada', businessName: 'Ada Cleaning', businessEmail: 'a@example.com', phone: '', currency: 'FAKE' } });
  assert.equal(badProfile.status, 400);
  const evilOrigin = await request('/api/quotes', { method: 'POST', cookie, origin: 'https://evil.example', body: draft() });
  assert.equal(evilOrigin.status, 403);
  const profile = await request('/api/profile', { method: 'PUT', cookie, body: { name: 'Ada', businessName: 'Ada Cleaning', businessEmail: 'hello@example.com', phone: '+90 555 000 0000', currency: 'TRY' } });
  assert.equal(profile.status, 200);
  assert.equal(profile.json.user.currency, 'TRY');
});

test('expired estimates cannot be accepted and disabled billing cannot fake payment', async t => {
  const { request, signup, instance } = await fixture(t);
  const { cookie } = await signup();
  const health = await request('/api/health');
  assert.equal(health.json.ok, true);
  assert.equal(health.json.billingEnabled, false);
  const bill = await request('/api/billing/checkout', { method: 'POST', cookie });
  assert.equal(bill.status, 503);
  assert.equal((await request('/api/auth/me', { cookie })).json.user.plan, 'free');
  const made = await request('/api/quotes', { method: 'POST', cookie, body: draft() });
  assert.equal(made.status, 201);
  const sent = await request(`/api/quotes/${made.json.quote.id}/send`, { method: 'POST', cookie });
  assert.equal(sent.status, 200);
  // Simulate the passage of time after a valid quote was shared.
  const expired = { ...sent.json.quote, validUntil: '2020-01-01' };
  instance.db.prepare('UPDATE quotes SET data = ? WHERE id = ?').run(JSON.stringify(expired), expired.id);
  const accepted = await request(`/api/public/quotes/${expired.publicToken}/accept`, { method: 'POST', body: { name: 'Alex' } });
  assert.equal(accepted.status, 409);
  assert.equal((await request(`/api/quotes/${expired.id}`, { cookie })).json.quote.status, 'sent');
});

test('accounts, sessions, quotes and quota persist after database reopen', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'neatquote-restart-'));
  let current;
  let server;
  async function start() {
    current = createApp({ dataDir, config: { appUrl: 'http://localhost:5173', nodeEnv: 'test' } });
    server = current.app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() { await new Promise(resolve => server.close(resolve)); current.close(); }
  t.after(async () => { if (server.listening) await stop(); await rm(dataDir, { recursive: true, force: true }); });
  let base = await start();
  const headers = { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' };
  const registered = await fetch(`${base}/api/auth/signup`, { method: 'POST', headers, body: JSON.stringify({ name: 'Ada', businessName: 'Ada Cleaning', email: 'persist@example.com', password: 'persistence-password' }) });
  assert.equal(registered.status, 201);
  const cookie = registered.headers.get('set-cookie').split(';')[0];
  await registered.json();
  const made = await fetch(`${base}/api/quotes`, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify(draft()) });
  assert.equal(made.status, 201);
  const original = (await made.json()).quote;
  await stop();
  base = await start();
  const restored = await fetch(`${base}/api/quotes`, { headers: { Cookie: cookie } });
  assert.equal(restored.status, 200);
  const result = await restored.json();
  assert.equal(result.quotes[0].id, original.id);
  assert.equal(result.quotes[0].total, original.total);
  assert.equal(result.usage.used, 1);
});
