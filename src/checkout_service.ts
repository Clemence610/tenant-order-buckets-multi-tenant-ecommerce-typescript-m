import type { TenantStorage } from "./tenant_storage.js";

export type Checkout = {
  tenantId: string;
  orderId: string;
  customerId: string;
  totalCents: number;
  currency: string;
  shippingAddress: { country: string; postalCode: string };
};

export type CheckoutResult = {
  bucket: string;
  orderId: string;
  state: "accepted";
  written: string[];
};

export function bucketForTenant(tenantId: string): string {
  return `shop-${tenantId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
}

export async function acceptCheckout(
  storage: TenantStorage,
  checkout: Checkout,
): Promise<CheckoutResult> {
  const bucket = bucketForTenant(checkout.tenantId);
  await storage.createBucket(bucket);

  const records = [
    {
      key: `orders/${checkout.orderId}/fulfillment.json`,
      value: {
        orderId: checkout.orderId,
        state: "ready_to_pick",
        destination: checkout.shippingAddress,
      },
    },
    {
      key: `orders/${checkout.orderId}/receipt.json`,
      value: {
        orderId: checkout.orderId,
        customerId: checkout.customerId,
        totalCents: checkout.totalCents,
        currency: checkout.currency,
      },
    },
    {
      key: `customers/${checkout.customerId}/orders/${checkout.orderId}.json`,
      value: { orderId: checkout.orderId, state: "accepted" },
    },
  ];

  await Promise.all(
    records.map((record) =>
      storage.putJson(
        bucket,
        record.key,
        record.value,
        `${checkout.tenantId}:${checkout.orderId}:${record.key}`,
      ),
    ),
  );

  return {
    bucket,
    orderId: checkout.orderId,
    state: "accepted",
    written: records.map((record) => record.key),
  };
}

export async function customerOrderUpdate(
  storage: TenantStorage,
  tenantId: string,
  customerId: string,
  orderId: string,
): Promise<{ found: boolean; downloadUrl?: string }> {
  const key = `customers/${customerId}/orders/${orderId}.json`;
  const downloadUrl = await storage.signedGet(bucketForTenant(tenantId), key);
  return downloadUrl ? { found: true, downloadUrl } : { found: false };
}
