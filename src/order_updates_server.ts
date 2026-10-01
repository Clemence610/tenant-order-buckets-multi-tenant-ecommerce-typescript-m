import { createServer } from "node:http";
import { z } from "zod";
import { acceptCheckout, customerOrderUpdate } from "./checkout_service.js";
import { InfraiError, tenantStorage } from "./tenant_storage.js";

const checkoutBody = z.object({
  tenantId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,30}$/),
  orderId: z.string().min(1).max(80),
  customerId: z.string().min(1).max(80),
  totalCents: z.number().int().nonnegative(),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  shippingAddress: z.object({
    country: z.string().length(2).transform((value) => value.toUpperCase()),
    postalCode: z.string().min(1).max(20),
  }),
});

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: import("node:http").ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/checkouts") {
      const parsed = checkoutBody.safeParse(await readJson(request));
      if (!parsed.success) return send(response, 400, { error: "invalid_checkout", issues: parsed.error.issues });
      return send(response, 201, await acceptCheckout(tenantStorage, parsed.data));
    }

    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(/^\/tenants\/([^/]+)\/customers\/([^/]+)\/orders\/([^/]+)$/);
    if (request.method === "GET" && match) {
      const [, tenantId, customerId, orderId] = match.map(decodeURIComponent);
      const update = await customerOrderUpdate(tenantStorage, tenantId, customerId, orderId);
      return send(response, update.found ? 200 : 404, update);
    }
    return send(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof SyntaxError) return send(response, 400, { error: "invalid_json" });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return send(response, status, { error: error.code });
    }
    console.error(error);
    return send(response, 500, { error: "request_failed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Order update service listening on http://localhost:${port}`));
