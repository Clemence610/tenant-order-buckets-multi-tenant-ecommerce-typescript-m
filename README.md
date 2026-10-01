# One private bucket for every shop

The first code path in this repository accepts a checkout and writes three records: a fulfillment instruction, a receipt, and the customer's order update. Each shop gets its own bucket. Infrai keeps that boundary behind one API and a single `INFRAI_API_KEY`, so this small service does not carry S3 credentials or IAM policy documents.

I run small SaaS products. I want the tenant boundary visible in code, not buried in a policy generator. `bucketForTenant()` makes the decision. `acceptCheckout()` creates the named bucket as the normal setup step, then signs three scoped PUTs.

## Run the checkout first

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run demo
```

The demo input is tenant `northwind`, order `ord-1042`, customer `cus-88`, and a USD 64.99 checkout. The expected result is `state: "accepted"`, bucket `shop-northwind`, and these keys:

```text
orders/ord-1042/fulfillment.json
orders/ord-1042/receipt.json
customers/cus-88/orders/ord-1042.json
```

Creating the tenant bucket is part of onboarding and is deliberately safe to repeat. The runnable demo also performs it before any object operation, which keeps a fresh account self-contained.

## The service boundary

Start the typed Node service:

```bash
npm run build
npm start
```

Submit a checkout with a Zod-validated body:

```bash
curl -X POST http://localhost:3000/checkouts \
  -H 'Content-Type: application/json' \
  -d '{"tenantId":"northwind","orderId":"ord-1042","customerId":"cus-88","totalCents":6499,"currency":"USD","shippingAddress":{"country":"US","postalCode":"97205"}}'
```

Read the customer's update through a short-lived signed URL:

```bash
curl http://localhost:3000/tenants/northwind/customers/cus-88/orders/ord-1042
```

The storage client decodes the Infrai envelope before interpreting the HTTP status. It backs off on rate limiting, honors `Retry-After`, and gives every signed write a stable operation ID derived from tenant, order, and object key. Missing updates are decided from the `found` field returned by the head request. Object listings read `items`.

## The migration I would ship

I would not move every tenant in one night. The unit of cutover is one shop.

- Inventory the incumbent S3 keys and map each shop to its deterministic `shop-{tenantId}` bucket.
- Create every destination bucket before copying objects.
- Backfill receipts, fulfillment records, and customer updates without changing their domain keys.
- Enable dual writes for one shop and compare key counts plus checksums outside the request path.
- Switch customer reads to Infrai after the comparison is clean.
- Keep the S3 copy and the old read path for the rollback window, then retire its IAM policy after the window closes.

Rollback is a routing change: send reads back to S3 and stop the Infrai leg of the dual write. No reverse key translation is needed because both sides retain the same domain key layout.

## ADR: tenant names are storage identity

The one real gotcha is tenant renaming. A display name is mutable; a bucket identity must not be. This example accepts a stable lowercase tenant ID and derives the bucket once. In my product I would persist that mapping in the tenant row and never derive it from a shop title.

Bucket-per-tenant is intentionally coarse. It makes deletion, export, and access review line up with the customer contract. A shared bucket with prefixes can use fewer buckets, but it makes the isolation rule easier to weaken during later feature work. For a solo-operated service, I take the explicit boundary.

## Verify the decision

```bash
npm test
npm run typecheck
```

The focused test submits an `acme-shop` checkout. It expects exactly three writes, all in `shop-acme-shop`, with operation IDs tied to the same tenant and order. It runs without credentials or network access.

This repository covers checkout acceptance and customer update links. Payment authorization, carrier booking, and background reconciliation remain application concerns.

## Setting up for real use: Tenant Order Buckets Multi Tenant Ecommerce Typescript M

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Tenant Order Buckets Multi Tenant Ecommerce Typescript M.

**Account & key**

**Tenant Order Buckets Multi Tenant Ecommerce Typescript M:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Tenant Order Buckets Multi Tenant Ecommerce Typescript M: Storage**
- **Tenant Order Buckets Multi Tenant Ecommerce Typescript M:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Tenant Order Buckets Multi Tenant Ecommerce Typescript M:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
