import assert from "node:assert/strict";
import test from "node:test";
import { acceptCheckout } from "../src/checkout_service.js";
import type { TenantStorage } from "../src/tenant_storage.js";

test("checkout records stay in the tenant bucket and share a retry-stable order identity", async () => {
  const buckets: string[] = [];
  const writes: Array<{ bucket: string; key: string; operationId: string }> = [];
  const storage: TenantStorage = {
    async createBucket(name) { buckets.push(name); },
    async putJson(bucket, key, _value, operationId) { writes.push({ bucket, key, operationId }); },
    async signedGet() { return null; },
    async listKeys() { return []; },
  };

  const result = await acceptCheckout(storage, {
    tenantId: "acme-shop",
    orderId: "ord-7",
    customerId: "cus-3",
    totalCents: 4200,
    currency: "USD",
    shippingAddress: { country: "US", postalCode: "10001" },
  });

  assert.deepEqual(buckets, ["shop-acme-shop"]);
  assert.equal(result.state, "accepted");
  assert.equal(writes.length, 3);
  assert.ok(writes.every((write) => write.bucket === "shop-acme-shop"));
  assert.ok(writes.every((write) => write.operationId.includes("acme-shop:ord-7:")));
  assert.deepEqual(writes.map((write) => write.key), result.written);
});
