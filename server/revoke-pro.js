import 'dotenv/config';
import { createApp } from './app.js';
import { revokeProForUser } from './iyzico.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: node server/revoke-pro.js account@example.com');
  process.exit(1);
}
const { db, close } = createApp();
try {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) { console.error('Account not found.'); process.exitCode = 1; }
  else { revokeProForUser(db, user.id); console.log('Pro access revoked. Future verified purchases can activate Pro again.'); }
} finally { close(); }
