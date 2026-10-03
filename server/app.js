import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(scryptCallback);
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const COOKIE = 'neatquote_session';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const now = () => new Date().toISOString();
const month = () => now().slice(0, 7);

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const text = (max) => z.string().trim().max(max);
const email = z.string().trim().email('Enter a valid email address.').max(254).transform((v) => v.toLowerCase());
const optionalEmail = z.union([email, z.literal('')]).default('');
const signupSchema = z.object({
  name: text(80).min(1, 'Your name is required.'),
  businessName: text(100).min(1, 'Business name is required.'),
  email,
  password: z.string().min(8, 'Use a password with at least 8 characters.').max(128),
}).strict();
const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
const profileSchema = z.object({
  name: text(80).min(1), businessName: text(100).min(1),
  businessEmail: optionalEmail, phone: text(80),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code.'),
}).partial().strict();
const twoDecimals = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format.')
  .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Enter a valid date.');
const quoteSchema = z.object({
  title: text(160).min(1, 'Quote title is required.'),
  clientName: text(120).min(1, 'Client name is required.'),
  clientEmail: optionalEmail,
  address: text(1000).default(''),
  frequency: z.enum(['one-time', 'weekly', 'biweekly', 'monthly']).default('one-time'),
  items: z.array(z.object({
    name: text(160).min(1, 'Each line item needs a name.'),
    description: text(1000).default(''),
    quantity: z.number().finite().positive().max(10000).refine(twoDecimals, 'Quantities support up to two decimal places.'),
    unitPrice: z.number().int().min(0).max(10000000),
  }).strict()).min(1, 'Add at least one line item.').max(50),
  discountPercent: z.number().finite().min(0).max(100).refine(twoDecimals).default(0),
  taxPercent: z.number().finite().min(0).max(100).refine(twoDecimals).default(0),
  notes: text(5000).default(''),
  validUntil: dateSchema,
}).strict();

function validated(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join('.');
    throw new ApiError(400, `${field ? `${field}: ` : ''}${issue.message}`);
  }
  return result.data;
}

export function calculateTotals(items, discountPercent = 0, taxPercent = 0) {
  // Scale decimal inputs before multiplication: 0.29 * 50 in floating point
  // falls below 14.5, while integer hundredths preserve the intended rounding.
  const subtotal = items.reduce((sum, item) => sum + Math.floor((Math.round(item.quantity * 100) * item.unitPrice + 50) / 100), 0);
  if (!Number.isSafeInteger(subtotal) || subtotal > 1000000000) throw new ApiError(400, 'Quote total is too large.');
  const discount = Math.floor((subtotal * Math.round(discountPercent * 100) + 5000) / 10000);
  const tax = Math.floor(((subtotal - discount) * Math.round(taxPercent * 100) + 5000) / 10000);
  const total = subtotal - discount + tax;
  if (![subtotal, discount, tax, total].every(Number.isSafeInteger) || total > 1000000000) {
    throw new ApiError(400, 'Quote total is too large.');
  }
  return { subtotal, discount, tax, total };
}

function cookieToken(req) {
  const part = req.headers.cookie?.split(';').find((v) => v.trim().startsWith(`${COOKIE}=`));
  if (!part) return null;
  try { return decodeURIComponent(part.trim().slice(COOKIE.length + 1)); } catch { return null; }
}

function publicUser(row) {
  return {
    id: row.id, name: row.name, email: row.email, businessName: row.business_name,
    businessEmail: row.business_email, phone: row.phone, currency: row.currency, plan: row.plan,
    proUntil: row.pro_until ? new Date(row.pro_until).toISOString() : null,
  };
}

/**
 * Create an isolated application. The caller owns app.listen() and close().
 * dataDir may be ':memory:' for tests. config overrides environment settings.
 * Billing is enabled only by a configured provider with verified webhooks.
 */
export function createApp({ dataDir, config = {}, billingProvider } = {}) {
  const settings = {
    nodeEnv: config.nodeEnv ?? process.env.NODE_ENV ?? 'development',
    appUrl: config.appUrl ?? process.env.APP_URL ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:5173',
    trustProxy: config.trustProxy ?? process.env.TRUST_PROXY === '1',
    defaultCurrency: config.defaultCurrency ?? 'TRY',
    previewMode: config.previewMode ?? process.env.NEATQUOTE_PREVIEW === '1',
    ...config,
  };
  let appOrigin;
  try { appOrigin = new URL(settings.appUrl).origin; } catch { throw new Error('APP_URL must be a valid URL.'); }
  const directory = dataDir ?? config.dataDir ?? process.env.DATA_DIR ?? path.join(ROOT, 'data');
  if (directory !== ':memory:') mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(directory === ':memory:' ? ':memory:' : path.join(directory, 'neatquote.sqlite'));
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, business_name TEXT NOT NULL,
      business_email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'USD', plan TEXT NOT NULL DEFAULT 'free',
      billing_customer_id TEXT, billing_subscription_id TEXT,
      billing_event_created INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_billing_customer ON users(billing_customer_id) WHERE billing_customer_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      public_token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS quotes_owner ON quotes(user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS quote_usage (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      month TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, month)
    );
    CREATE TABLE IF NOT EXISTS billing_events (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE, payment_id TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'initializing',
      created_at INTEGER NOT NULL
    );
  `);
  // Additive migration preserves databases created before prepaid billing.
  if (!db.prepare('PRAGMA table_info(users)').all().some((column) => column.name === 'pro_until')) {
    db.exec('ALTER TABLE users ADD COLUMN pro_until INTEGER');
  }

  const app = express();
  app.disable('x-powered-by');
  if (settings.trustProxy) app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: settings.nodeEnv === 'production' ? undefined : false,
    strictTransportSecurity: settings.nodeEnv === 'production' ? undefined : false,
  }));

  const billingEnabled = !settings.previewMode && Boolean(billingProvider?.enabled);
  if (billingEnabled && typeof billingProvider.handleCallback === 'function') {
    const callbackLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
      message: { error: 'Too many payment callbacks. Please try again later.' } });
    app.post('/api/billing/iyzico/callback', callbackLimiter, express.urlencoded({ extended: false, limit: '8kb' }), async (req, res) => {
      let success = false;
      try { success = await billingProvider.handleCallback({ body: req.body, db }); }
      catch { console.error('Payment callback could not be verified.'); }
      const redirect = new URL(settings.appUrl);
      redirect.searchParams.set('payment', success ? 'success' : 'failed');
      res.redirect(303, redirect.toString());
    });
  }
  if (billingEnabled) {
    app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
      try {
        await billingProvider.handleWebhook({ req, db });
        res.json({ received: true });
      } catch (error) {
        const status = error.status ?? 400;
        res.status(status).json({ error: status < 500 ? 'Invalid billing webhook.' : 'Billing webhook could not be processed.' });
      }
    });
  }
  app.use(express.json({ limit: '128kb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if ((origin && origin !== appOrigin) || (!origin && req.get('sec-fetch-site') === 'cross-site')) {
        return res.status(403).json({ error: 'Request origin is not allowed.' });
      }
    }
    next();
  });
  const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 200, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a minute.' } });
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Please try again in 15 minutes.' } });
  const acceptanceLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' } });
  app.use('/api', apiLimiter);

  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: settings.nodeEnv === 'production', path: '/' };
  function makeSession(res, userId) {
    const token = randomBytes(32).toString('base64url');
    const expires = Date.now() + SESSION_MS;
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), userId, expires);
    res.cookie(COOKIE, token, { ...cookieOptions, maxAge: SESSION_MS });
  }
  function authenticate(req, res, next) {
    const token = cookieToken(req);
    if (!token || token.length > 128) return res.status(401).json({ error: 'Please sign in to continue.' });
    const user = db.prepare(`SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(hashToken(token), Date.now());
    if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
    if (user.plan === 'pro' && (!user.pro_until || user.pro_until <= Date.now())) {
      db.prepare("UPDATE users SET plan = 'free' WHERE id = ?").run(user.id);
      user.plan = 'free';
    }
    req.user = user;
    next();
  }
  function getQuote(userId, id) {
    const row = db.prepare('SELECT data FROM quotes WHERE id = ? AND user_id = ?').get(id, userId);
    if (!row) throw new ApiError(404, 'Quote not found.');
    return JSON.parse(row.data);
  }
  function saveQuote(userId, quote) {
    db.prepare('UPDATE quotes SET data = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(quote), quote.id, userId);
  }
  function getPublicQuote(token) {
    if (token.length > 100) throw new ApiError(404, 'Quote not found.');
    const row = db.prepare(`SELECT quotes.data, users.business_name, users.business_email, users.phone, users.currency
      FROM quotes JOIN users ON users.id = quotes.user_id WHERE quotes.public_token = ?`).get(token);
    if (!row) throw new ApiError(404, 'Quote not found.');
    const quote = JSON.parse(row.data);
    if (quote.status === 'draft') throw new ApiError(404, 'Quote not found.');
    return { quote, business: { name: row.business_name, email: row.business_email, phone: row.phone, currency: quote.currency ?? row.currency } };
  }

  app.get('/api/health', (req, res) => res.json({ ok: true, billingEnabled, previewMode: settings.previewMode,
    billingProvider: billingProvider?.name ?? 'iyzico', proPrice: 39900, proCurrency: 'TRY' }));
  app.post('/api/auth/signup', authLimiter, async (req, res) => {
    const input = validated(signupSchema, req.body);
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(input.email)) throw new ApiError(409, 'An account already exists for this email.');
    const salt = randomBytes(16).toString('hex');
    const digest = (await scrypt(input.password, salt, 64)).toString('hex');
    const id = randomUUID();
    try {
      db.prepare(`INSERT INTO users (id, name, email, password_hash, business_name, business_email, currency, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.name, input.email, `${salt}:${digest}`, input.businessName, input.email, settings.defaultCurrency, now());
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) throw new ApiError(409, 'An account already exists for this email.');
      throw error;
    }
    makeSession(res, id);
    res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
  });
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const input = validated(loginSchema, req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(input.email);
    const [salt, expected] = (user?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
    const actual = await scrypt(input.password, salt, 64);
    if (!user || !timingSafeEqual(actual, Buffer.from(expected, 'hex'))) throw new ApiError(401, 'Email or password is incorrect.');
    const previousToken = cookieToken(req);
    if (previousToken) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(previousToken));
    makeSession(res, user.id);
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', (req, res) => {
    const token = cookieToken(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    res.clearCookie(COOKIE, cookieOptions);
    res.json({ ok: true });
  });
  app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));
  app.put('/api/profile', authenticate, (req, res) => {
    const input = validated(profileSchema, req.body);
    const user = { ...publicUser(req.user), ...input };
    db.prepare(`UPDATE users SET name = ?, business_name = ?, business_email = ?, phone = ?, currency = ? WHERE id = ?`)
      .run(user.name, user.businessName, user.businessEmail, user.phone, user.currency, user.id);
    res.json({ user });
  });

  app.get('/api/quotes', authenticate, (req, res) => {
    const usageMonth = month();
    const quotes = db.prepare('SELECT data FROM quotes WHERE user_id = ? ORDER BY created_at DESC, id DESC').all(req.user.id).map((r) => JSON.parse(r.data));
    const used = db.prepare('SELECT used FROM quote_usage WHERE user_id = ? AND month = ?').get(req.user.id, usageMonth)?.used ?? 0;
    res.json({ quotes, usage: { used, limit: req.user.plan === 'pro' ? null : 3, month: usageMonth } });
  });
  app.post('/api/quotes', authenticate, (req, res) => {
    const input = validated(quoteSchema, req.body);
    const totals = calculateTotals(input.items, input.discountPercent, input.taxPercent);
    const timestamp = now();
    const usageMonth = timestamp.slice(0, 7);
    const quote = {
      ...input, ...totals, id: randomUUID(), status: 'draft', currency: req.user.currency,
      publicToken: randomBytes(24).toString('base64url'), createdAt: timestamp, updatedAt: timestamp,
      acceptedAt: null, acceptedName: null,
    };
    db.exec('BEGIN IMMEDIATE');
    try {
      const used = db.prepare('SELECT used FROM quote_usage WHERE user_id = ? AND month = ?').get(req.user.id, usageMonth)?.used ?? 0;
      if (req.user.plan !== 'pro' && used >= 3) throw new ApiError(403, 'You have used your 3 free quotes this month. Upgrade to Pro to create more.');
      db.prepare('INSERT INTO quotes (id, user_id, public_token, created_at, data) VALUES (?, ?, ?, ?, ?)')
        .run(quote.id, req.user.id, quote.publicToken, timestamp, JSON.stringify(quote));
      db.prepare(`INSERT INTO quote_usage (user_id, month, used) VALUES (?, ?, 1)
        ON CONFLICT(user_id, month) DO UPDATE SET used = used + 1`).run(req.user.id, usageMonth);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.status(201).json({ quote });
  });
  app.get('/api/quotes/:id', authenticate, (req, res) => res.json({ quote: getQuote(req.user.id, req.params.id) }));
  app.put('/api/quotes/:id', authenticate, (req, res) => {
    const quote = getQuote(req.user.id, req.params.id);
    if (quote.status === 'accepted') throw new ApiError(409, 'Accepted quotes cannot be edited.');
    const input = validated(quoteSchema, req.body);
    const updated = { ...quote, ...input, ...calculateTotals(input.items, input.discountPercent, input.taxPercent), updatedAt: now() };
    saveQuote(req.user.id, updated);
    res.json({ quote: updated });
  });
  app.delete('/api/quotes/:id', authenticate, (req, res) => {
    const quote = getQuote(req.user.id, req.params.id);
    if (quote.status === 'accepted') throw new ApiError(409, 'Accepted quotes cannot be deleted.');
    db.prepare('DELETE FROM quotes WHERE id = ? AND user_id = ?').run(quote.id, req.user.id);
    res.json({ ok: true });
  });
  app.post('/api/quotes/:id/send', authenticate, (req, res) => {
    const quote = getQuote(req.user.id, req.params.id);
    if (quote.status === 'accepted') throw new ApiError(409, 'This quote has already been accepted.');
    if (quote.validUntil < now().slice(0, 10)) throw new ApiError(409, 'Extend the validity date before sharing this quote.');
    const updated = { ...quote, status: 'sent', updatedAt: now() };
    saveQuote(req.user.id, updated);
    res.json({ quote: updated });
  });
  app.get('/api/public/quotes/:token', (req, res) => res.json(getPublicQuote(req.params.token)));
  app.post('/api/public/quotes/:token/accept', acceptanceLimiter, (req, res) => {
    const input = validated(z.object({ name: text(120).min(1, 'Enter your name to accept this quote.') }).strict(), req.body);
    const { quote } = getPublicQuote(req.params.token);
    if (quote.status === 'accepted') return res.json({ quote });
    if (quote.validUntil < now().slice(0, 10)) throw new ApiError(409, 'This quote has expired. Contact the business for an updated quote.');
    const timestamp = now();
    const updated = { ...quote, status: 'accepted', acceptedAt: timestamp, acceptedName: input.name, updatedAt: timestamp };
    db.prepare('UPDATE quotes SET data = ? WHERE public_token = ?').run(JSON.stringify(updated), quote.publicToken);
    res.json({ quote: updated });
  });

  app.post('/api/billing/checkout', authenticate, async (req, res) => {
    if (!billingEnabled) throw new ApiError(503, 'Paid checkout is not configured yet. You can keep using the free plan.');
    const url = await billingProvider.createCheckout({ user: req.user, db, appUrl: settings.appUrl, body: req.body, ip: req.ip });
    res.json({ url });
  });
  app.post('/api/billing/portal', authenticate, async (req, res) => {
    if (!billingEnabled) throw new ApiError(503, 'Paid checkout is not configured yet.');
    if (typeof billingProvider.createPortal !== 'function') throw new ApiError(409, 'Pro is prepaid for 30 days and does not renew automatically.');
    const url = await billingProvider.createPortal({ user: req.user, db, appUrl: settings.appUrl });
    res.json({ url });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  const dist = path.join(ROOT, 'dist');
  if (settings.nodeEnv === 'production' && existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false }));
    app.get('/{*path}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Send a valid JSON request.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    const status = error.status ?? 500;
    if (status >= 500 && !(error instanceof ApiError)) console.error(`Request failed: ${error.name ?? 'Error'}`);
    res.status(status).json({ error: status < 500 ? error.message : 'Something went wrong. Please try again.' });
  });
  return { app, db, close: () => db.close() };
}
