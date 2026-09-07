# Handover checklist

For whoever takes ownership of this codebase and the running service.

## 1. Accounts you must hold in your own name

The application has no credentials of its own. Everything below is yours to
create and own; nothing here ships with a working key.

- [ ] **Railway** — hosting, PostgreSQL, and the cron service.
- [ ] **OpenAI** — an API key. Set a billing limit on it.
- [ ] **S3-compatible storage** — Cloudflare R2, Backblaze B2 or AWS S3.
      The bucket must be **private**.
- [ ] **Stripe** — for billing. Products and prices are created by you in the
      Stripe dashboard; the app never creates them, so it cannot spawn live
      objects by accident.
- [ ] **Resend** (or another provider) — transactional email, with your sending
      domain verified.
- [ ] **eBay Developer** — only if you want direct publishing. Requires eBay's
      approval for production access; see below.
- [ ] **Domain and DNS.**

## 2. Secrets to generate

```bash
openssl rand -base64 48   # BETTER_AUTH_SECRET
openssl rand -hex 32      # TOKEN_ENCRYPTION_KEY
openssl rand -hex 32      # CRON_SECRET
```

Store them in a password manager before pasting them into Railway.

`TOKEN_ENCRYPTION_KEY` deserves particular care: it encrypts every stored
marketplace token. **Lose it and every customer must reconnect their
marketplace account.** It is the one value that cannot be recovered from a
database backup.

## 3. First deployment

Follow the ten steps in the [README](../README.md#deploying-to-railway). In
short: create the project, add PostgreSQL and a bucket, set the variables, add
the worker service, deploy, seed, attach the domain, wire Stripe, promote
yourself, schedule maintenance.

- [ ] Web service deploys and `/api/health` answers.
- [ ] `/api/ready` answers — this proves the database connection.
- [ ] Worker service is running (`/admin/health` shows it alive).
- [ ] `pnpm db:seed` has been run once.
- [ ] `APP_URL` exactly matches the domain in the browser's address bar.
- [ ] Cron service runs `pnpm maintenance` daily.

## 4. Prove it works, end to end

Do this yourself before letting anyone else in:

- [ ] Sign up, receive the verification email, and confirm.
- [ ] Upload a photo of a real item and generate drafts.
- [ ] Edit a draft and confirm the edit survives a reload.
- [ ] Export the listing text and read it.
- [ ] Buy a credit pack with a Stripe test card and see the balance rise.
- [ ] Run `pnpm bootstrap:admin` and reach `/admin`.
- [ ] Grant a credit from the admin area and find it in the audit log.
- [ ] Open the app on a phone and walk the wizard.

## 5. Before you take payment from anyone

- [ ] Replace the placeholder legal pages (`/legal/terms`, `/legal/privacy`,
      `/legal/acceptable-use`) with text your own lawyer has approved. The
      supplied text is a starting structure, not legal advice.
- [ ] Set `SUPPORT_EMAIL` to an address a person actually reads.
- [ ] Decide your refund policy and reflect it in the terms.
- [ ] Confirm your data-protection position: where the database and bucket are
      hosted, how long you keep photographs, and how someone deletes their
      account. The product supports deletion; the policy is yours to state.
- [ ] Move Stripe out of test mode and verify with one real transaction.

## 6. Content that is deliberately empty

The product ships with **no** testimonials, customer counts, sales totals or
"as seen in" logos, because inventing them would be dishonest. Where the
interface shows figures from the sample workspace it labels them **Sample
data**.

If you add real ones, they must be real. `/admin/content` edits the marketing
copy blocks without a deployment.

## 7. eBay, specifically

This is the item most likely to surprise you.

- eBay production access requires **their** approval of **your** application.
  That is a review process with a timeline outside your control.
- Until it is granted, use the sandbox: set `EBAY_ENVIRONMENT=sandbox`.
- With no credentials at all, the product is fully usable — eBay simply appears
  as an export-only marketplace like the others. Nothing is broken; the
  interface says what is and is not available.
- Vinted, Depop and Facebook Marketplace have no public listing API. That is
  not a gap waiting to be filled by configuration — there is nothing to
  configure. Do not promise customers automatic publishing to them.

## 8. Running the checks yourself

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm build
DATABASE_URL=<throwaway database> pnpm db:deploy && pnpm test
```

The end-to-end suite additionally needs a built app, a running worker, and
`AUTH_RATE_LIMIT=relaxed`. See the README.

## 9. Things a future maintainer should not undo

Each of these looks like it could be simplified. Each is load-bearing:

- **The credit ledger is append-only.** Correct mistakes with a compensating
  entry. Editing history makes disputes unanswerable.
- **`ai_job_one_active_per_item`**, the partial unique index. It is what stops
  a double-click charging twice; the application-level check in front of it is
  only there to produce a friendlier message.
- **Publication success requires a listing id.** eBay can return 200 with
  warnings and no listing. Recording that as published tells a seller their
  item is live when it is not.
- **Marketplace capability is re-checked on the server.** The interface follows
  the declaration, but the server refusal is what actually protects it.
- **`src/components/ui/slot.tsx` is not a client component.** Making it one
  breaks `asChild` in production only — dev works fine, which is what makes it
  expensive to rediscover.
- **The healthcheck does not touch the database.** If it did, a brief database
  blip would restart healthy containers.
- **Token refresh uses a transaction-scoped advisory lock.** A session-scoped
  one leaks over a connection pool and eventually deadlocks all refreshes.

## 10. Known limitations

Stated plainly so they are not discovered later:

- Direct publishing is eBay only, and only after eBay approves your
  application. Everything else is export-and-paste, by necessity.
- Price suggestions are estimates from category guidelines, the seller's own
  history, and the model's judgement. **There is no comparable-sales data
  feed**, and the product never claims one.
- The AI does not authenticate items, verify hidden damage, or confirm
  provenance, materials, size or model. Sellers remain responsible for
  accuracy.
- Money is handled in USD. The schema stores an ISO currency code alongside
  every amount, so more currencies are a pricing and presentation job, not a
  data migration.
- One workspace per user. The membership model supports more, but there is no
  invitation flow yet.
- Object storage is not covered by Railway's database backups. Configure
  versioning or lifecycle rules with your storage provider.
