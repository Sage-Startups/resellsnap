# Deploying to Railway

A complete walkthrough, from nothing to a working deployment. Allow about an
hour the first time, most of it waiting for builds.

You will end up with **three Railway services** sharing one image and one
database:

| Service | Runs | Why |
| --- | --- | --- |
| `web` | `pnpm db:deploy && pnpm start` | Serves the app; applies migrations on release |
| `worker` | `pnpm worker` | Processes photos, generates listings, builds exports |
| `cron` | `pnpm maintenance` | Daily cleanup |

The worker is **not optional**. Without it, uploads sit at "processing"
forever and nothing is ever generated.

---

## Before you start

Create these accounts. Nothing in this repository ships with a working key —
every credential below is yours.

- **Railway** — hosting, PostgreSQL, cron.
- **OpenAI** — an API key. Set a spend limit on it while you are there.
- **Object storage** — a Railway bucket, created inside the project in Part 1.
  Any S3-compatible provider works instead; see the end of Part 2.
- **Resend** — transactional email, with your sending domain verified.
- **Stripe** — only if you want to charge money. Can wait.
- **eBay Developer** — only if you want direct publishing. Can wait, and
  requires eBay's approval. See Part 9.

Generate three secrets now and put them somewhere safe:

```bash
openssl rand -base64 48   # BETTER_AUTH_SECRET
openssl rand -hex 32      # TOKEN_ENCRYPTION_KEY
openssl rand -hex 32      # CRON_SECRET
```

> **`TOKEN_ENCRYPTION_KEY` is the one you cannot lose.** It encrypts every
> stored marketplace token. If it is lost or changed, every customer must
> reconnect their marketplace account — and no database backup can recover it.

---

## Part 1 — Project, database and bucket

Railway Buckets are S3-compatible object storage that lives in the same project
as the app, so this is all one place.

1. In Railway: **New Project → Deploy from GitHub repo**, and select this
   repository. Railway reads `railway.json` and builds the `Dockerfile`.

2. The first build will start and may fail or crash-loop. That is expected —
   there are no variables yet. Ignore it until Part 3.

3. Rename that service to `web` (**Settings → Service Name**), so the services
   stay easy to tell apart.

4. **New → Database → Add PostgreSQL.**

5. **New → Bucket.** Name it, for example, `resellsnap-photos`.

   Leave it **private**. The app serves photographs through its own authorised
   routes and short-lived signed URLs; a public bucket would expose every
   customer's photographs to anyone with the object key. Do not attach a
   public-bucket or CDN proxy template to it.

> **Back this bucket up yourself.** Railway's PostgreSQL backups do not cover
> bucket contents, and it holds photographs your customers may have nowhere
> else.

---

## Part 2 — Bucket credentials and CORS

### The credentials

Open the bucket service → **Variables**. Railway exposes the S3 credentials
under names that depend on which client preset you picked when creating it —
commonly either

```
BUCKET_ENDPOINT   BUCKET_NAME   BUCKET_ACCESS_KEY_ID   BUCKET_SECRET_ACCESS_KEY
```

or the AWS SDK preset:

```
AWS_ENDPOINT_URL   AWS_S3_BUCKET_NAME   AWS_ACCESS_KEY_ID   AWS_SECRET_ACCESS_KEY   AWS_DEFAULT_REGION
```

**Read the real names off that Variables tab** rather than assuming. This app
uses its own `S3_*` names, so wire them across with Railway variable
references. With the `BUCKET_*` preset and a bucket service named `Bucket`:

```bash
STORAGE_DRIVER=s3
S3_ENDPOINT=${{Bucket.BUCKET_ENDPOINT}}
S3_BUCKET=${{Bucket.BUCKET_NAME}}
S3_ACCESS_KEY_ID=${{Bucket.BUCKET_ACCESS_KEY_ID}}
S3_SECRET_ACCESS_KEY=${{Bucket.BUCKET_SECRET_ACCESS_KEY}}
S3_REGION=auto
S3_FORCE_PATH_STYLE=true
```

Substitute the service name and the variable names you actually see. You can
also read them from a terminal with `railway bucket credentials`.

### The CORS policy

The browser uploads straight to the bucket over a short-lived signed `PUT` —
the file never passes through the app server. That is a cross-origin request,
so without a CORS policy **every upload fails**, and it fails looking like a
broken app rather than a missing bucket setting.

Railway has **no CORS panel in the dashboard**. Set it with the AWS CLI against
the bucket's endpoint.

Save this as `cors.json`, with your real origin — `https://`, no trailing
slash:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://your-domain.com"],
      "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["content-type", "content-length"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

Then apply it, using the bucket's own credentials:

```bash
export AWS_ACCESS_KEY_ID=<the bucket's access key id>
export AWS_SECRET_ACCESS_KEY=<the bucket's secret access key>
export AWS_DEFAULT_REGION=auto

aws s3api put-bucket-cors \
  --endpoint-url "<the bucket's endpoint>" \
  --bucket "<the bucket name>" \
  --cors-configuration file://cors.json
```

Check it took:

```bash
aws s3api get-bucket-cors \
  --endpoint-url "<the bucket's endpoint>" \
  --bucket "<the bucket name>"
```

If you are testing on the `*.up.railway.app` address first, put that in
`AllowedOrigins` and re-run this command when you attach your real domain in
Part 7.

`AllowedHeaders` lists exactly the two headers the signed upload sends. `PUT`
is the only method the browser needs: photographs are read back through the
app's own proxy route, and export downloads are ordinary top-level navigations,
neither of which is a cross-origin fetch.

### If you would rather not use a Railway bucket

Any S3-compatible provider works — the app only needs presigned `PUT` and a
CORS policy. The variables and the CORS rule above are the same; only the
endpoint, region and path-style differ.

| Provider | `S3_ENDPOINT` | `S3_REGION` | `S3_FORCE_PATH_STYLE` |
| --- | --- | --- | --- |
| Cloudflare R2 | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | `auto` | `true` |
| AWS S3 | *(leave empty)* | the bucket's real region | `false` |
| Backblaze B2 | `https://s3.<region>.backblazeb2.com` | e.g. `us-west-004` | `true` |

R2 and AWS both have a CORS editor in their dashboards, so there you can paste
the rule rather than using the CLI. Keep the bucket private in every case.

---

## Part 3 — Variables for the web service

Open the `web` service → **Variables** → **Raw Editor**, and paste the
following, substituting your own values.

```bash
# Database — this exact syntax references the Postgres service
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Public address. Use the Railway-provided domain for now; change it in Part 7.
APP_URL=https://your-app.up.railway.app

# Secrets you generated earlier
BETTER_AUTH_SECRET=<openssl rand -base64 48>
TOKEN_ENCRYPTION_KEY=<openssl rand -hex 32>
CRON_SECRET=<openssl rand -hex 32>

# The account you will promote to super admin in Part 8
SUPER_ADMIN_EMAIL=you@example.com

# AI
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
AI_DAILY_COST_LIMIT_CENTS=0

# Storage — from Part 2. Check the real variable names on the bucket
# service's own Variables tab; the preset decides them.
STORAGE_DRIVER=s3
S3_ENDPOINT=${{Bucket.BUCKET_ENDPOINT}}
S3_BUCKET=${{Bucket.BUCKET_NAME}}
S3_ACCESS_KEY_ID=${{Bucket.BUCKET_ACCESS_KEY_ID}}
S3_SECRET_ACCESS_KEY=${{Bucket.BUCKET_SECRET_ACCESS_KEY}}
S3_REGION=auto
S3_FORCE_PATH_STYLE=true

# Email
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
EMAIL_FROM=ResellSnap AI <no-reply@your-domain.com>
SUPPORT_EMAIL=support@your-domain.com
```

Do **not** set `PORT` — Railway provides it.

`.env.example` in the repository documents every variable, including the
optional ones this guide leaves until later.

Deploy. The web service should now build and go green. If the boot fails, read
the deploy log: the app validates its environment on startup and names the
variable that is wrong, rather than failing later under load.

---

## Part 4 — The worker service

1. **New → GitHub Repo**, and select the same repository again.
2. Rename it to `worker`.
3. **Settings → Config-as-code**, set the path to:

   ```
   railway.worker.json
   ```

   This is what makes the worker run `pnpm worker` and, importantly, stops it
   inheriting the web service's HTTP healthcheck — the worker serves no HTTP,
   so that healthcheck would fail it forever.

4. **Settings → Networking**: the worker needs no public domain. If one was
   generated, remove it.

5. Give it the same variables as `web`. The tidiest way is a **shared
   variable group**: in the project's **Variables** tab create a group with
   everything from Part 3 and attach it to both services. Otherwise copy the
   raw editor contents across.

6. Deploy, then check its log. You are looking for:

   ```
   [info] Worker started {"workerId":"worker-...","concurrency":4}
   ```

---

## Part 5 — The cron service

1. **New → GitHub Repo**, same repository. Rename it to `cron`.
2. **Settings → Config-as-code**: `railway.cron.json`.
3. **Settings → Cron Schedule**: `0 3 * * *` (daily, 03:00 UTC).
4. Give it the same variables, and no public domain.

This expires old download artifacts and deletes their objects, reclaims stalled
jobs, purges soft-deleted items and photos, refreshes marketplace connection
state, and prunes expired OAuth states and rate-limit rows.

---

## Part 6 — Seed the reference data

Migrations run automatically on every release, but the reference data — plans,
platform templates, prompt versions, the sample workspace — is seeded once, by
you.

From the `web` service, open a shell (Railway's **Command Palette → Shell**, or
`railway run` with the CLI) and run:

```bash
pnpm db:seed
```

It is safe to run again; it upserts.

---

## Part 7 — Your domain

1. `web` service → **Settings → Networking → Custom Domain**. Add your domain
   and create the CNAME record Railway shows you.
2. Update `APP_URL` to exactly that address — `https://`, no trailing slash.
3. **Re-apply the bucket's CORS policy** (Part 2) with `AllowedOrigins` set to
   the same address, and confirm it with `aws s3api get-bucket-cors`.

`APP_URL` is checked against the address in the browser's bar for auth cookies
and OAuth redirects. A mismatch — `www` versus bare, `http` versus `https`, a
stray trailing slash — breaks sign-in with no obvious clue.

---

## Part 8 — Become the super admin

1. Sign up through the app like any customer, and confirm the verification
   email.
2. From the `web` service shell:

   ```bash
   pnpm bootstrap:admin
   ```

   It promotes the account matching `SUPER_ADMIN_EMAIL`. It never creates a
   user and never sets a password — there is no universal admin credential in
   this product, by design.

3. Visit `/admin`. Check `/admin/health`: the worker should show as alive and
   each integration should report its real state.

---

## Part 9 — Optional integrations

### Stripe

Until this is configured, billing is switched off and the app says so rather
than offering a checkout that cannot work.

1. Create your products and prices in the Stripe dashboard. The app never
   creates Stripe objects itself, so it cannot spawn live ones by accident.
2. Add the price IDs:

   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PRICE_STARTER_MONTHLY=price_...
   STRIPE_PRICE_PRO_MONTHLY=price_...
   STRIPE_PRICE_PACK_20=price_...
   STRIPE_PRICE_PACK_75=price_...
   STRIPE_PRICE_PACK_200=price_...
   ```

3. **Developers → Webhooks → Add endpoint**, pointing at:

   ```
   https://your-domain.com/api/webhooks/stripe
   ```

   Subscribe to: `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`,
   `invoice.payment_failed`.

4. Copy the endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`.

5. Re-run `pnpm db:seed` so the plans pick up their price IDs.

Deliveries and their outcomes are visible at `/admin/webhooks`, where a failed
one can be replayed safely — processing deduplicates on the Stripe event id and
every grant carries its own idempotency key.

### eBay

Direct publishing is off until all three values are set, and the interface
honestly reports "not configured" rather than offering a dead button.

1. Create an [eBay developer account](https://developer.ebay.com/) and a
   keyset. Start with **sandbox**.
2. Configure a redirect in your developer account whose callback URL is:

   ```
   https://your-domain.com/api/integrations/ebay/callback
   ```

3. eBay gives that redirect a **RuName**. This is the detail that catches
   everyone: `EBAY_REDIRECT_URI` is **not a URL** — it is that RuName string.

   ```
   EBAY_ENVIRONMENT=sandbox
   EBAY_CLIENT_ID=<App ID>
   EBAY_CLIENT_SECRET=<Cert ID>
   EBAY_REDIRECT_URI=<your RuName>
   EBAY_MARKETPLACE_ID=EBAY_US
   ```

4. For production, apply to eBay for production access. **That is their review
   on their timeline.** Until it is granted, keep `EBAY_ENVIRONMENT=sandbox`.

Sellers also need payment, return and fulfilment business policies on their
eBay account; the pre-flight check refuses and says which is missing rather
than sending a request eBay would reject.

### Google sign-in

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Authorised redirect URI: `https://your-domain.com/api/auth/callback/google`.

---

## Verify it end to end

Do this yourself before letting anyone else in.

- [ ] `https://your-domain.com/api/health` returns 200.
- [ ] `/api/ready` returns 200 — this one proves the database connection.
- [ ] Sign up, receive the verification email, confirm it.
- [ ] Upload a photo. **This is the step that proves your bucket and its CORS
      policy are right.** If the upload spins or errors, see below.
- [ ] The photo reaches "processed" and Continue unlocks — this proves the
      worker is running.
- [ ] Generate drafts, edit one, reload, and confirm the edit persisted.
- [ ] Export the listing text and read it.
- [ ] `/admin/health` shows the worker alive and integrations in their real
      state.
- [ ] Open it on a phone and walk the wizard.

---

## When something is wrong

**Uploads fail or hang.** Almost always the bucket. Open the browser's network
tab and look at the `PUT`:

- A CORS error, or a failed `OPTIONS` preflight → the CORS policy is missing or
  its `AllowedOrigins` does not exactly match `APP_URL`.
- `403 SignatureDoesNotMatch` → `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` are
  wrong, or `S3_REGION` does not match the bucket.
- `404 NoSuchBucket` → `S3_BUCKET` or `S3_ENDPOINT` is wrong.

**You cannot find the CORS setting in Railway.** There isn't one — Railway has
no CORS panel. It is set with `aws s3api put-bucket-cors` against the bucket's
endpoint, as in Part 2.

**Photos stay at "processing".** The worker is down or was never created.
Check its log for `Worker started`, and `/admin/health` for a rising "oldest
queued" figure.

**Sign-in fails, or you are bounced back to the login page.** `APP_URL` does
not exactly match the address in the browser. Check `https`, `www`, and the
trailing slash.

**The web service starts, then exits with "This deployment is not correctly
configured".** That is the environment check, and the lines under it name every
variable that is missing or malformed — set them and redeploy. The check runs
before the server accepts a single request, deliberately: a container that dies
is a failed deploy the platform shows you, whereas one that starts and then
500s looks healthy and passes its healthcheck.

A production deployment also refuses to start with `AI_PROVIDER=fake`,
`STORAGE_DRIVER=local`, `AUTH_RATE_LIMIT=relaxed`, or an `http://` `APP_URL`.

> Local runs are more forgiving than the image: Next.js loads your `.env`
> automatically, so a variable you have locally but never set in Railway will
> look fine on your machine and only fail once deployed.

**The worker deploy is marked unhealthy.** Its config-as-code path is not set
to `railway.worker.json`, so it inherited the web service's HTTP healthcheck.

**Stripe webhooks fail signature verification.** `STRIPE_WEBHOOK_SECRET`
belongs to a different endpoint than the one delivering, or you copied the API
key instead of the endpoint's signing secret.

---

## Before you take real money

- Replace the placeholder text at `/legal/terms`, `/legal/privacy` and
  `/legal/acceptable-use` with wording your own lawyer has approved. What ships
  is a starting structure, not legal advice.
- Point `SUPPORT_EMAIL` at an address a person reads.
- Decide your refund policy and say so in the terms.
- Move Stripe out of test mode and put one real transaction through it.
- Confirm your data-protection position: where the database and bucket live,
  how long you keep photographs, and how somebody deletes their account.

The product ships with no testimonials, customer counts or sales totals,
because inventing them would be dishonest. Sample figures are labelled **Sample
data**. If you add real ones, they must be real.
