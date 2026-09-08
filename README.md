# ResellSnap AI

Photograph a second-hand item, answer a few questions only you can answer, and
get marketplace-ready listing drafts for eBay, Vinted, Depop and Facebook
Marketplace — each written to that platform's own limits and tone.

Every draft is yours to edit before it goes anywhere. Nothing is ever published
without an explicit confirmation, and prices are always presented as estimates
with their basis and confidence attached.

## What it does, and what it deliberately does not

**Does**

- Analyses your photos and drafts a title, description and item specifics.
- Writes a separate draft per marketplace, respecting each one's title length,
  description limits, hashtag conventions and tone.
- Suggests a price with three strategies, always labelled as an estimate.
- Publishes directly to eBay through eBay's official Sell API, once you have
  connected your account and confirmed the listing.
- Exports to text, JSON, CSV or a photo bundle for every other marketplace.
- Tracks inventory, sales and margins, and meters usage with a credit ledger.

**Does not**

- Scrape marketplaces, drive their websites, or touch undocumented APIs. Where
  there is no approved public API, the product says so and gives you an export
  to paste yourself.
- Ask for a marketplace password. Connections use that platform's own OAuth
  screen, with the narrowest scopes the job needs.
- Publish anything automatically. A review screen and an explicit confirmation
  stand between a generated draft and a live listing.
- Claim to have authenticated an item, verified hidden damage, or confirmed
  provenance, materials, size or model.
- Invent comparable-sales data. Where the underlying figures do not exist, the
  interface says so rather than showing a number.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) on React 19 |
| Language | TypeScript, strict |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL via Prisma 7 (driver adapter, no Rust engine) |
| Auth | Better Auth (email + password, optional Google) |
| Background work | PostgreSQL job queue, separate worker process, no Redis |
| AI | OpenAI Responses API with structured output |
| Payments | Stripe |
| Storage | Any S3-compatible object storage |
| Hosting | Railway (Docker) |

There is no dependency on Supabase, Firebase or any Vercel-only service —
lint fails the build if one is imported.

## Running it locally

Requirements: Node 22+, pnpm 9+, and a PostgreSQL 15+ database.

```bash
pnpm install
cp .env.example .env          # then fill it in — see the comments in the file
pnpm db:deploy                # apply migrations
pnpm db:seed                  # plans, platform templates, prompts, sample data
```

For local work you can avoid every paid dependency:

```bash
AI_PROVIDER=fake              # deterministic fixtures, refused in production
EMAIL_PROVIDER=console        # emails are logged, not sent
STORAGE_DRIVER=local          # photos written to .storage/
```

Then run the web app and the worker in two terminals:

```bash
pnpm dev
pnpm dev:worker
```

The worker is not optional. Photo processing, listing generation and export
building all run through the queue, so without it uploads sit at "processing"
forever.

Make yourself a super admin by signing up through the app, then:

```bash
SUPER_ADMIN_EMAIL=you@example.com pnpm bootstrap:admin
```

That command only ever promotes an existing account. It never creates a user
and never sets a password: there is no universal admin credential in this
product.

## Checks

```bash
pnpm lint        # ESLint
pnpm typecheck   # tsc --noEmit
pnpm test        # unit + integration (needs a PostgreSQL test database)
pnpm test:e2e    # Playwright, against a production build
pnpm build       # production build
```

The integration tests run against a real database rather than a mocked Prisma
client, because what they are checking — transactions, unique constraints, row
locks in the credit ledger — only exists in the database. Point
`DATABASE_URL` at a throwaway database and run `pnpm db:deploy` against it
first.

The end-to-end suite needs the app built (`pnpm build`), a worker running, and
`AUTH_RATE_LIMIT=relaxed` so it can drive the real sign-in form repeatedly from
one address.

## Deploying to Railway

Ten steps, start to finish. [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) is the
same journey in full detail, including bucket and CORS setup, and what to check
when something does not work.

1. **Create the project.** In Railway, *New Project → Deploy from GitHub repo*
   and pick this repository. Railway reads `railway.json` and builds the
   `Dockerfile`.

2. **Add PostgreSQL.** *New → Database → Add PostgreSQL* in the same project.

3. **Add object storage.** *New → Bucket* in the same project. Keep it
   **private** — the app serves photos through its own authorised routes and
   short-lived signed URLs, and a public bucket would expose every customer's
   photographs. Then set a CORS policy allowing `PUT` from your domain, without
   which every upload fails; Railway has no CORS panel, so this is an
   `aws s3api put-bucket-cors` call. Any other S3-compatible provider works
   too. [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) has the exact commands.

4. **Set the web service variables.** Under the web service → *Variables*:

   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   APP_URL=https://your-domain.com
   BETTER_AUTH_SECRET=<openssl rand -base64 48>
   TOKEN_ENCRYPTION_KEY=<openssl rand -hex 32>
   SUPER_ADMIN_EMAIL=you@example.com
   OPENAI_API_KEY=<your key>
   STORAGE_DRIVER=s3
   S3_ENDPOINT=<your endpoint>
   S3_BUCKET=<your bucket>
   S3_ACCESS_KEY_ID=<...>
   S3_SECRET_ACCESS_KEY=<...>
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=<...>
   EMAIL_FROM=ResellSnap AI <no-reply@your-domain.com>
   ```

   `.env.example` documents every variable, including the optional ones.

5. **Add the worker service.** *New → GitHub Repo*, the same repository again.
   Under *Settings → Config-as-code* set the path to `railway.worker.json`,
   which runs `pnpm worker` and keeps the worker from inheriting the web
   service's HTTP healthcheck — it serves no HTTP, so that check would fail it
   forever. Give it the same variables as the web service; a shared variable
   group is the tidiest way. Without this service nothing is ever generated.

6. **Deploy.** The web service's start command runs `pnpm db:deploy` before
   booting, so migrations are applied on every release. Watch the deploy log:
   the environment is validated before the server accepts any request, so a
   missing or malformed variable exits the container and names itself rather
   than letting a broken deployment go green.

7. **Seed the reference data.** Once, from the web service shell:

   ```bash
   pnpm db:seed
   ```

   This inserts plans, platform templates, prompt versions and the sample
   workspace. It is safe to re-run.

8. **Attach your domain.** Web service → *Settings → Networking → Custom
   Domain*, then set `APP_URL` to exactly that address. Auth cookies and OAuth
   redirects are checked against it, so a mismatch breaks sign-in.

9. **Wire up Stripe.** Create your products and prices in Stripe, put the price
   IDs in the variables, then add a webhook endpoint pointing at
   `https://your-domain.com/api/webhooks/stripe` for `checkout.session.completed`,
   `customer.subscription.*`, `invoice.paid` and `invoice.payment_failed`. Put
   its signing secret in `STRIPE_WEBHOOK_SECRET`. Until this is set, billing is
   switched off and the app says so rather than offering a broken checkout.

10. **Promote yourself and schedule maintenance.** Sign up through the app,
    then run `pnpm bootstrap:admin` from the service shell. Finally add a third
    service from the same repository with its config-as-code path set to
    `railway.cron.json` and a daily *Cron Schedule*, to expire old exports,
    reclaim stalled jobs and prune dead data.

### After it is up

- `/api/health` answers as soon as the process is alive — that is the
  healthcheck, and it deliberately does not touch the database, because a brief
  database blip should not make the platform restart a healthy container.
- `/api/ready` does check the database, for your own monitoring.
- `/admin/health` shows queue depth, worker liveness and the status of each
  external integration. It reports whether each secret is *present*, never its
  value.

## Documentation

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — the full deployment
  walkthrough, including object storage and troubleshooting.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how the pieces fit, and the state
  machines behind AI jobs, credits and publication.
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — running it day to day.
- [`docs/MARKETPLACES.md`](docs/MARKETPLACES.md) — what each integration can
  and cannot do, and what approval each requires.
- [`docs/HANDOVER.md`](docs/HANDOVER.md) — the checklist for taking ownership.

## Licence

Proprietary. All rights reserved.
