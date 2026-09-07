# Marketplaces

What each integration can do, why, and what you must obtain yourself.

The rule the product follows: a **Connect** or **Publish** action appears only
where an approved official API and valid credentials exist. Everywhere else the
seller is told plainly that they will be exporting and pasting themselves.

No integration here scrapes a marketplace, drives its website, captures a
marketplace password, works around a CAPTCHA, or uses an undocumented private
API.

## Summary

| Marketplace | Direct publishing | Why |
| --- | --- | --- |
| eBay | Yes, with your own credentials | Official Sell API, publicly documented |
| Vinted | No | No public listing API |
| Depop | No | No public listing API |
| Facebook Marketplace | No | No general-purpose listing API for individuals |

For the three without an API the product provides text, JSON, CSV and photo
bundle exports, each written to that platform's own limits.

## eBay

Direct publishing is supported through eBay's official Sell API. It is off
until you supply credentials, and the interface says "not configured" rather
than offering a button that cannot work.

### What you need

1. An [eBay developer account](https://developer.ebay.com/).
2. An application keyset — sandbox first, production once approved.
3. A **RuName**. This is the crucial detail: eBay's OAuth `redirect_uri`
   parameter is not a URL, it is the RuName string from the redirect you
   configure in your developer account. The actual callback URL is configured
   on eBay's side and must point at `https://your-domain.com/api/integrations/ebay/callback`.
4. Production access, which eBay grants after a review of your application.

Then set:

```
EBAY_ENVIRONMENT=sandbox        # or production
EBAY_CLIENT_ID=<App ID>
EBAY_CLIENT_SECRET=<Cert ID>
EBAY_REDIRECT_URI=<your RuName>
EBAY_MARKETPLACE_ID=EBAY_US
```

### What the seller must also have

eBay requires business policies before an offer can be published. If the
seller's account has no payment, return or fulfilment policy, the pre-flight
check refuses and tells them which is missing, rather than sending a request
that eBay would reject.

### How publishing works

Three documented calls, in order:

1. `PUT /sell/inventory/v1/inventory_item/{sku}` — the item.
2. `POST /sell/inventory/v1/offer` — the offer for a marketplace.
3. `POST /sell/inventory/v1/offer/{offerId}/publish` — go live.

Success is recorded only when eBay returns a listing id. A 200 carrying
warnings and no listing id is a failure, because the item is not live — and
telling a seller otherwise is worse than telling them nothing.

Each attempt has a unique idempotency key, so a retry after a network timeout
resumes the existing attempt rather than creating a second listing.

### Scopes

The narrowest that the work requires: inventory and account access for
publishing and for reading the seller's own policies. No scope is requested
that the product does not use.

## Vinted, Depop, Facebook Marketplace

These have no public listing API available to an application like this one.
The product does not pretend otherwise, and there is no code path that could
publish to them — the adapter throws rather than silently doing nothing.

What sellers get instead:

- **Listing text** — laid out for copy-and-paste into that platform's form,
  with the fields it asks for in the order it asks for them.
- **JSON** — every field, structured.
- **CSV** — one row, for a spreadsheet or a bulk tool.
- **Photo bundle** — a zip of the photographs in listing order, with the
  listing text alongside.

Each export respects that marketplace's own limits — title length, description
length, hashtag conventions — because the draft was written to them.

If any of these publishes an official API in future, the adapter contract is
the place to add it: declare the capability, implement `publish`, and the
interface follows the declaration. Nothing else needs to change.

## Prices in exports

Every export carries the price with its qualifier: that it is an estimate,
what it is based on, and how confident the estimate is. A bare number in a
copy-paste export would read as a valuation, which it is not.
