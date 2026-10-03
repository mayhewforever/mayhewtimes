# NeatQuote

A quote workspace for independent residential cleaning businesses. Create a professional estimate, share it with a customer, capture their acceptance, and copy a personal follow-up. The pricing helper turns estimated labor, supplies, travel, and a target margin into an editable suggested price.

This is a working first release, with an experimental business model: **3 new quotes per calendar month free**, or **₺399 for 30 days of Pro access**. Pro is prepaid; it does not renew automatically. Customer payments for cleaning jobs are arranged separately. NeatQuote charges businesses for using the software.

## Run locally

Use Node.js 24 and npm. The repository has no other runtime services.

```sh
cd /workspace/mayhewtimes
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run dev
```

Vite runs on port 5173 and proxies `/api` to Express on port 3001. Open the application in your own local development setup. Cloud onboarding uses internal HTTP requests for validation; loopback URLs are not public previews.

The free workflow works without payment credentials. Local data is persisted in the ignored `data/` directory. `.env.example` lists supported configuration; copy it to `.env` if you need overrides. Never commit credentials or a customer database.

```sh
npm test
npm run build
```

The tests cover account sessions, quote arithmetic, private data isolation, validation, usage limits, customer acceptance, and payment verification with a mock provider. A mocked payment does not establish live merchant approval or an actual transaction.

## Features

- Accounts with hashed passwords and private workspaces.
- Standard, deep-clean, and move-out templates; editable scope, quantities, taxes, and discounts.
- Cost and target-margin pricing helper. Its values are your estimates, not verified market rates.
- Draft, shared, and accepted quote pipeline; search and status filters.
- Client links that work without client accounts, named acceptance, and printable quotes / browser PDF export.
- Copyable follow-up messages. The app does not send email or WhatsApp messages.
- Business contact settings and selectable quote currency, including TRY.
- Hosted iyzico checkout for prepaid Pro access. The app never receives card details.

## Payments in Türkiye

The integration uses iyzico's official [Node SDK](https://github.com/iyzico/iyzipay-node), whose examples support TRY and Turkish payment cards. You still need an approved merchant account, an eligible payout arrangement, and live API keys. Provider approval, fees, and your business eligibility must be confirmed with iyzico. No merchant account or live payment was created during development.

Set these process environment variables securely on the host:

| Variable | Purpose |
| --- | --- |
| `IYZIPAY_API_KEY` | Your merchant API key |
| `IYZIPAY_SECRET_KEY` | Your merchant signing key; the SDK needs the actual value locally |
| `IYZIPAY_URI` | `https://sandbox-api.iyzipay.com` for testing; `https://api.iyzipay.com` for live sales |
| `APP_URL` | Public HTTPS origin of your deployed app |

Use real buyer details when making a live purchase. Hosted checkout requires buyer billing information; the application forwards it to iyzico and does not retain the national identity number in its database. Add an owner-reviewed privacy notice and customer terms that accurately describe this processing before collecting real customer information.

The callback is `POST /api/billing/iyzico/callback`. It must be reachable over public HTTPS. The app checks locally issued checkout tokens, authenticates retrieval through the SDK, verifies response signatures and the expected amount/currency, and grants Pro once per successful payment. A browser redirect alone never grants access. Sandbox payments must never be presented as real sales.

Refunds are handled in the merchant dashboard. This release does not automatically reconcile refunds or chargebacks: after confirming a refund, the operator can run `node server/revoke-pro.js account@example.com` with the production `DATA_DIR` to revoke that account's current Pro access and prevent paid-callback replay. Maintain a support process. No recurring card charging is implemented.

## Production deployment

For a free preview with an automatic HTTPS address, use the root `render.yaml` and the [free preview instructions](docs/FREE_PREVIEW.md). It has no persistent disk and forces payments off. The owner must create a Render account and activate deployment; no public web address has been created by this configuration file.

```sh
npm ci --no-audit --no-fund
npm run build
NODE_ENV=production APP_URL=https://your-domain.example PORT=3001 npm start
```

Use an HTTPS reverse proxy. Set `TRUST_PROXY=1` only when there is exactly one trusted reverse proxy and direct access to the app port is restricted. Production session cookies are Secure; an HTTP-only public deployment cannot support login correctly.

On Render, `RENDER_EXTERNAL_URL` supplies the public origin when `APP_URL` is unset. `APP_URL` takes precedence. Set `NEATQUOTE_PREVIEW=1` for temporary previews; this disables all payment endpoints and displays a notice to use sample information.

Use **one application instance with persistent disk** for `DATA_DIR`. SQLite is local storage; this build is not intended for ephemeral serverless hosting or multiple independent replicas. Back up the database safely, including its WAL state, and test restoration before launch. Do not copy a live database file without a SQLite backup operation.

A Dockerfile is included. Mount persistent storage at `/app/data`, supply `APP_URL`, and add payment variables only when your account is approved. The Docker image has not been published. The build does not include `.env` or the development database.

Before launch, verify the actual public domain, HTTPS login, signup, quote sharing, and a complete iyzico sandbox checkout/callback. Then switch to approved live keys and confirm the merchant dashboard receives a small real transaction. Owner-reviewed privacy/terms, support and account recovery, refund handling, and backups remain launch responsibilities; these are not configured by the cloud setup.

See [the first-customer plan](docs/FIRST_CUSTOMERS.md) for a focused way to test demand in Türkiye. Pricing and demand are unvalidated; this app does not guarantee income.

The requested [member referral reward model](docs/REFERRAL_MODEL.md) is documented separately. Referral tracking and free-access rewards are proposed, not implemented in this release.

## Architecture

React + TypeScript + Vite frontend; Express backend; Node 24 built-in SQLite. Money is calculated on the server in integer minor units. Quote currency is saved with the quote, so changing a business's currency does not alter past estimates. Accepted quotes cannot be edited or deleted.

Future cloud tasks should use this existing checkout. Cloud tasks are already isolated; do not create a Git worktree unless explicitly requested. Reuse installed dependencies when valid, run the saved startup instructions, and treat live processes as needing restart after a snapshot restore.
