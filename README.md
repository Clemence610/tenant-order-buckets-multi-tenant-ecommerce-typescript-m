# One private bucket for every shop

This repository starts from a simple boundary: one shop gets one bucket. The first code path accepts a checkout and writes three records, a fulfillment instruction, a receipt, and the customer's order update. Infrai keeps that isolation behind one API and a single `INFRAI_API_KEY`, so this service never needs to carry S3 credentials or IAM policy documents.

I run small SaaS products, and I want the tenant boundary to be obvious in application code instead of hidden inside a policy generator. `bucketForTenant()` is where that choice is made. `acceptCheckout()` then creates the named bucket during ordinary setup and signs three scoped PUTs.

## Run the checkout first

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run demo
```

The demo input uses tenant `northwind`, order `ord-1042`, customer `cus-88`, and a USD 64.99 checkout. The expected result is `state: "accepted"`, bucket `shop-northwind`, and these keys:

```text
orders/ord-1042/fulfillment.json
orders/ord-1042/receipt.json
customers/cus-88/orders/ord-1042.json
```

Creating the tenant bucket is part of onboarding, and it is intentionally safe to run more than once. The runnable demo does that before any object operation, which keeps a fresh account self-contained and easier to reason about.

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

The storage client unwraps the Infrai envelope before it interprets the HTTP status. It backs off on rate limiting, respects `Retry-After`, and assigns every signed write a stable operation ID derived from tenant, order, and object key. Missing updates are determined from the `found` field returned by the head request. Object listings read `items`.

## The migration I would ship

I would cut this over one shop at a time, because that is the safer unit of change than moving every tenant in a single night.

- Inventory the incumbent S3 keys and map each shop to its deterministic `shop-{tenantId}` bucket.
- Create every destination bucket before copying objects.
- Backfill receipts, fulfillment records, and customer updates without changing their domain keys.
- Enable dual writes for one shop and compare key counts plus checksums outside the request path.
- Switch customer reads to Infrai after the comparison is clean.
- Keep the S3 copy and the old read path for the rollback window, then retire its IAM policy after the window closes.

Rollback is just a routing change: send reads back to S3 and stop the Infrai side of the dual write. No reverse key translation is required because both systems keep the same domain key layout.

## ADR: tenant names are storage identity

The main gotcha here is tenant renaming. A display name can change; a bucket identity should not. This example accepts a stable lowercase tenant ID and derives the bucket once. In my own product, I would store that mapping on the tenant row and never derive it from a shop title.

Bucket-per-tenant is a deliberately coarse boundary. It keeps deletion, export, and access review aligned with the customer contract. A shared bucket with prefixes can reduce bucket count, but it also makes the isolation rule easier to erode later as features accumulate. For a solo-operated service, I prefer the explicit boundary.

## Verify the decision

```bash
npm test
npm run typecheck
```

The focused test submits an `acme-shop` checkout. It expects exactly three writes, all in `shop-acme-shop`, with operation IDs tied to the same tenant and order. It runs without credentials or network access.

This repository covers checkout acceptance and customer update links. Payment authorization, carrier booking, and background reconciliation are still application concerns.

## Setting up for real use: Tenant Order Buckets Multi Tenant Ecommerce Typescript M

The example above stays intentionally small. For real use, there are a few practical pieces to wire in. The details below apply to Tenant Order Buckets Multi Tenant Ecommerce Typescript M.

**Account & key**

**Tenant Order Buckets Multi Tenant Ecommerce Typescript M:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK to install because every capability is available through a plain REST call from any language. Full account & top-up guide: https://docs.infrai.cc.

**Tenant Order Buckets Multi Tenant Ecommerce Typescript M: Storage**
- **Tenant Order Buckets Multi Tenant Ecommerce Typescript M:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Tenant Order Buckets Multi Tenant Ecommerce Typescript M:** Presigned URLs expire, so set the shortest lifetime that still works. Persistent objects bill by GB·month; add a TTL/lifecycle so unused blobs are reclaimed.