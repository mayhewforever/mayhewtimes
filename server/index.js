import 'dotenv/config';
import { createApp } from './app.js';
import { createIyzicoProvider } from './iyzico.js';
import { resolveRuntimeConfig } from './config.js';

const config = resolveRuntimeConfig();
const { app, close } = createApp({ config, billingProvider: config.previewMode ? undefined : createIyzicoProvider() });
const port = Number(process.env.PORT ?? 3001);
const server = app.listen(port, '0.0.0.0', () => console.log(`NeatQuote API listening on port ${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => { close(); process.exit(0); }));
}
