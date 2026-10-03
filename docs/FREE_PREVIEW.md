# Open NeatQuote on the web

The root `render.yaml` prepares a free Render preview using Node 24 and a provider-assigned HTTPS address. You do not need to buy a domain. The preview uses temporary storage: saved accounts and quotes can reset after restarts or redeployments. Use sample information. Payments are disabled even if payment keys are accidentally added.

The app is prepared locally. It is not publicly deployed yet. Activation requires a Render account that you create yourself, and the app source must be available on the repository's `main` branch.

1. Create an account at https://dashboard.render.com/register using your GitHub account.
2. Open https://dashboard.render.com/select-repo?type=blueprint and connect `mayhewforever/mayhewtimes`. Grant Render access to that repository if prompted.
3. Select the `main` branch and the root `render.yaml`. Check that the service plan shown is **Free** and there is no paid disk. If Render's current eligibility or quotas differ, stop before choosing a paid service.
4. Create the Blueprint and wait for the deployment to finish.
5. Open the HTTPS service address shown in Render's dashboard. Create a test account and try a quote. Initial startup may take time; use the deployment logs if the service is not ready.

`RENDER_EXTERNAL_URL` supplies the application origin automatically. If the provider does not supply it, set `APP_URL` to the HTTPS address shown in the dashboard and redeploy. The server validates that address and uses it for origin checks; it does not trust an incoming Host header.

No iyzico keys or payment account are required for this preview. The preview notice appears in the app. Referral rewards are documented but not implemented.

## Verification limits

The native Node installation, application build, production startup, and preview settings have been checked locally. The actual Render deployment, current free-plan availability, and assigned web address can be confirmed only in the owner's Render account. Official Render documentation requests were blocked by the cloud network proxy during preparation; no current free quotas or hosting prices are asserted here. The optional Docker image build was not completed in this cloud environment; the free Blueprint uses the tested native Node commands.

Permanent hosting requires a separate decision: one service instance, a persistent writable disk for SQLite, HTTPS, backups, and owner-approved merchant setup. The free Blueprint does not create a paid service or disk.
