import { acceptCheckout } from "./checkout_service.js";
import { tenantStorage } from "./tenant_storage.js";

const result = await acceptCheckout(tenantStorage, {
  tenantId: "northwind",
  orderId: "ord-1042",
  customerId: "cus-88",
  totalCents: 6499,
  currency: "USD",
  shippingAddress: { country: "US", postalCode: "97205" },
});

console.log(JSON.stringify(result, null, 2));
