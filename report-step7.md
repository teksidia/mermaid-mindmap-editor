# Step 7 report – GitHub Action to deploy to Cloudflare

## Added
- `.github/workflows/deploy.yml` – CI/CD workflow that deploys the site to Cloudflare Workers (static assets).
  - **Triggers**: push to `main`, and manual runs (`workflow_dispatch`).
  - **Steps**: checkout → Node 22 with npm cache → `npm ci` → `npm test` → `npx wrangler deploy`.
  - **Gate**: a failing test stops the job before the deploy step.
  - **Concurrency**: one deploy at a time (`group: deploy`, in-progress runs are not cancelled, so a deploy is never interrupted midway).
  - **Timeout**: 10 minutes.
  - Worker name and assets directory come from the existing `wrangler.jsonc`; no config changes were needed. The Worker is created on first deploy.

## Required GitHub secrets
Added in the repo under **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Purpose | Where to get it |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Authenticates Wrangler | Cloudflare dashboard → My Profile → API Tokens → Create Token, using the "Edit Cloudflare Workers" template (can be scoped to a single account) |
| `CLOUDFLARE_ACCOUNT_ID` | Selects the account to deploy to | Cloudflare dashboard → Workers & Pages (Account ID in the sidebar, also in the dashboard URL) |

Secrets are referenced only via `${{ secrets.* }}` in the workflow; no values are stored in the repository. They can also be set from the CLI with `gh secret set <NAME>`.

## Verification
- The workflow was committed and pushed to `main`, which triggers its first run.
- **Not verified by me**: that the run succeeds. It will fail at the deploy step until both secrets are added. Once added, re-run from the Actions tab (or use "Run workflow").

## Known gaps
- Deploys only from `main`; there are no preview deployments for pull requests.
- Node version is pinned to 22 in the workflow and is not read from `package.json` (no `engines` field is set).
