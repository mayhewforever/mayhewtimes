import Iyzipay from 'iyzipay';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { z } from 'zod';

const DAYS_30 = 30 * 24 * 60 * 60 * 1000;
const PRICE = '399.00';
const API_HOSTS = new Set(['sandbox-api.iyzipay.com', 'api.iyzipay.com']);
const CHECKOUT_HOSTS = new Set(['sandbox-cpp.iyzipay.com', 'cpp.iyzipay.com', 'checkout.iyzipay.com']);
const buyerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  surname: z.string().trim().min(1).max(80),
  phone: z.string().trim().transform((value) => value.replace(/[\s()-]/g, ''))
    .refine((value) => /^(?:\+90|0)?5\d{9}$/.test(value), 'Enter a Turkish mobile number, for example +905351234567.')
    .transform((value) => value.startsWith('+90') ? value : `+90${value.startsWith('0') ? value.slice(1) : value}`),
  identityNumber: z.string().trim().regex(/^[1-9]\d{10}$/, 'Enter your 11-digit Turkish identity number.'),
  address: z.string().trim().min(5).max(500),
  city: z.string().trim().min(2).max(80),
}).strict();

function billingError(status, message) { return Object.assign(new Error(message), { status }); }

// Canonical field order is from the official SDK's Checkout Form samples:
// https://github.com/iyzico/iyzipay-node/blob/master/samples/IyzipaySamples.js
function verifySignature(result, fields, secretKey) {
  if (typeof result.signature !== 'string' || !/^[a-f0-9]{64}$/i.test(result.signature)) return false;
  if (fields.some((field) => result[field] === undefined || result[field] === null)) return false;
  const expected = createHmac('sha256', secretKey).update(fields.map((field) => String(result[field])).join(':')).digest();
  return timingSafeEqual(expected, Buffer.from(result.signature, 'hex'));
}

function sdkCall(resource, method, input) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (resource._config?.body === input) delete resource._config.body;
      reject(billingError(502, 'The payment provider did not respond. Please try again.'));
    }, 15000);
    try {
      resource[method](input, (error, result) => {
        clearTimeout(timer);
        // The SDK caches its last request. Release buyer details after the call.
        if (resource._config?.body === input) delete resource._config.body;
        if (error || !result || typeof result !== 'object') return reject(billingError(502, 'The payment provider could not be reached. Please try again.'));
        resolve(result);
      });
    } catch {
      clearTimeout(timer);
      if (resource._config?.body === input) delete resource._config.body;
      reject(billingError(502, 'The payment provider could not be reached. Please try again.'));
    }
  });
}

function isExpectedPrice(value) {
  return /^(?:399)(?:\.0{1,2})?$/.test(String(value));
}

/** Inject client with checkoutFormInitialize.create and checkoutForm.retrieve callbacks for tests. */
export function createIyzicoProvider({
  apiKey = process.env.IYZIPAY_API_KEY,
  secretKey = process.env.IYZIPAY_SECRET_KEY,
  uri = process.env.IYZIPAY_URI ?? 'https://sandbox-api.iyzipay.com',
  client,
} = {}) {
  const enabled = Boolean(apiKey && secretKey);
  if (!enabled) return { enabled: false, name: 'iyzico' };
  const apiUrl = new URL(uri);
  if (apiUrl.protocol !== 'https:' || !API_HOSTS.has(apiUrl.hostname) || apiUrl.username || apiUrl.password || apiUrl.port || !['', '/'].includes(apiUrl.pathname) || apiUrl.search || apiUrl.hash) {
    throw new Error('IYZIPAY_URI must be the official HTTPS sandbox or production API URL.');
  }
  const iyzipay = client ?? new Iyzipay({ apiKey, secretKey, uri: apiUrl.origin });
  return {
    enabled: true,
    name: 'iyzico',
    async createCheckout({ user, db, appUrl, body, ip }) {
      const parsed = buyerSchema.safeParse(body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw billingError(400, `${issue.path.join('.')}: ${issue.message}`);
      }
      const buyer = parsed.data;
      const purchaseId = randomUUID();
      db.prepare('INSERT INTO purchases (id, user_id, status, created_at) VALUES (?, ?, ?, ?)')
        .run(purchaseId, user.id, 'initializing', Date.now());
      const contactAddress = { contactName: `${buyer.name} ${buyer.surname}`, address: buyer.address, city: buyer.city, country: 'Turkey' };
      const request = {
        locale: 'tr', conversationId: purchaseId, basketId: purchaseId,
        price: PRICE, paidPrice: PRICE, currency: 'TRY', paymentGroup: 'PRODUCT',
        callbackUrl: new URL('/api/billing/iyzico/callback', appUrl).toString(),
        enabledInstallments: [1],
        buyer: {
          id: user.id, name: buyer.name, surname: buyer.surname, gsmNumber: buyer.phone,
          email: user.email, identityNumber: buyer.identityNumber, registrationAddress: buyer.address,
          city: buyer.city, country: 'Turkey', ip: ip || '127.0.0.1',
        },
        shippingAddress: contactAddress, billingAddress: contactAddress,
        basketItems: [{ id: 'neatquote-pro-30days', name: 'NeatQuote Pro — 30 days', category1: 'Software', itemType: 'VIRTUAL', price: PRICE }],
      };
      try {
        const result = await sdkCall(iyzipay.checkoutFormInitialize, 'create', request);
        if (result.status !== 'success') throw billingError(502, 'Checkout could not be created. Please check your buyer details and try again.');
        if (!verifySignature(result, ['conversationId', 'token'], secretKey) || result.conversationId !== purchaseId || typeof result.token !== 'string' || result.token.length < 10 || result.token.length > 512) {
          throw billingError(502, 'The payment provider response could not be verified.');
        }
        let checkout;
        try { checkout = new URL(result.paymentPageUrl); } catch { throw billingError(502, 'The payment provider returned an invalid checkout address.'); }
        if (checkout.protocol !== 'https:' || !CHECKOUT_HOSTS.has(checkout.hostname) || checkout.username || checkout.password || checkout.port) {
          throw billingError(502, 'The payment provider returned an invalid checkout address.');
        }
        if (checkout.searchParams.has('token') && checkout.searchParams.get('token') !== result.token) {
          throw billingError(502, 'The payment provider returned an invalid checkout token.');
        }
        db.prepare("UPDATE purchases SET token = ?, status = 'pending' WHERE id = ?").run(result.token, purchaseId);
        return checkout.toString();
      } catch (error) {
        db.prepare("UPDATE purchases SET status = 'failed' WHERE id = ? AND status = 'initializing'").run(purchaseId);
        throw error;
      }
    },
    async handleCallback({ body, db }) {
      const token = body?.token;
      if (typeof token !== 'string' || !/^[A-Za-z0-9._~-]{10,512}$/.test(token)) return false;
      const purchase = db.prepare('SELECT * FROM purchases WHERE token = ?').get(token);
      if (!purchase) return false;
      if (purchase.status === 'paid') return true;
      if (purchase.status === 'revoked' || purchase.status === 'refunded') return false;
      const result = await sdkCall(iyzipay.checkoutForm, 'retrieve', { locale: 'tr', conversationId: purchase.id, token });
      const signatureFields = ['paymentStatus', 'paymentId', 'currency', 'basketId', 'conversationId', 'paidPrice', 'price', 'token'];
      if (result.status !== 'success' || !verifySignature(result, signatureFields, secretKey) ||
        result.paymentStatus !== 'SUCCESS' || result.currency !== 'TRY' ||
        !isExpectedPrice(result.paidPrice) || !isExpectedPrice(result.price) ||
        result.token !== token || result.conversationId !== purchase.id || result.basketId !== purchase.id ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(String(result.paymentId)) ||
        (result.fraudStatus !== undefined && Number(result.fraudStatus) !== 1)) {
        // An unverified callback never changes access. Keep pending for a valid retry.
        return false;
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchase.id);
        if (current.status === 'paid') { db.exec('COMMIT'); return true; }
        if (current.status === 'revoked' || current.status === 'refunded') { db.exec('ROLLBACK'); return false; }
        const duplicate = db.prepare('SELECT id FROM purchases WHERE payment_id = ? AND id != ?').get(String(result.paymentId), purchase.id);
        if (duplicate) { db.exec('ROLLBACK'); return false; }
        const user = db.prepare('SELECT pro_until FROM users WHERE id = ?').get(purchase.user_id);
        if (!user) { db.exec('ROLLBACK'); return false; }
        const proUntil = Math.max(Date.now(), user.pro_until ?? 0) + DAYS_30;
        db.prepare("UPDATE users SET plan = 'pro', pro_until = ? WHERE id = ?").run(proUntil, purchase.user_id);
        db.prepare("UPDATE purchases SET status = 'paid', payment_id = ? WHERE id = ?").run(String(result.paymentId), purchase.id);
        db.exec('COMMIT');
        return true;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}

/** Operator-only: use after verifying a refund or chargeback in iyzico. */
export function revokeProForUser(db, userId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare("UPDATE users SET plan = 'free', pro_until = NULL WHERE id = ?").run(userId);
    db.prepare("UPDATE purchases SET status = 'revoked' WHERE user_id = ? AND status = 'paid'").run(userId);
    db.exec('COMMIT');
    return Number(result.changes) > 0;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
