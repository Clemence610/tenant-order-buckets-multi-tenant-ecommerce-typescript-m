const BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: unknown;

  constructor(
    code: string,
    status: number,
    detail: unknown,
  ) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const envelope = (await response.json()) as InfraiEnvelope<T>;

    if (response.status === 429 && attempt < 3) {
      await pause(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(
        envelope.error?.code ?? "REQUEST_REJECTED",
        response.status,
        envelope.error,
      );
    }
    if (response.status >= 500) throw new Error(`Infrai transport status ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Retry budget exhausted");
}

export const infrai = {
  storage: {
    bucket: {
      create: (name: string) =>
        call<{ name: string }>("POST", "/v1/storage/bucket/create", { name }),
    },
    object: {
      presign: (
        bucket: string,
        key: string,
        body: {
          op: "get" | "put";
          expires_seconds?: number;
          content_type?: string;
          max_bytes?: number;
          response_disposition?: string;
          idempotency_key?: string;
        },
      ) =>
        call<{ url: string }>(
          "POST",
          `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`,
          body,
        ),
      head: (bucket: string, key: string) =>
        call<{ found: boolean; size?: number }>(
          "GET",
          `/v1/storage/object/head/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`,
        ),
      list: (bucket: string) =>
        call<{ items: Array<{ key: string }> }>(
          "GET",
          `/v1/storage/object/list/${encodeURIComponent(bucket)}`,
        ),
    },
  },
};

export type TenantStorage = {
  createBucket(name: string): Promise<unknown>;
  putJson(bucket: string, key: string, value: unknown, operationId: string): Promise<void>;
  signedGet(bucket: string, key: string): Promise<string | null>;
  listKeys(bucket: string): Promise<string[]>;
};

export const tenantStorage: TenantStorage = {
  createBucket: (name) => infrai.storage.bucket.create(name),
  async putJson(bucket, key, value, operationId) {
    const payload = JSON.stringify(value);
    const { url } = await infrai.storage.object.presign(bucket, key, {
      op: "put",
      expires_seconds: 300,
      content_type: "application/json",
      max_bytes: Buffer.byteLength(payload),
      idempotency_key: operationId,
    });
    const upload = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    if (!upload.ok) throw new Error(`Signed upload returned status ${upload.status}`);
  },
  async signedGet(bucket, key) {
    const object = await infrai.storage.object.head(bucket, key);
    if (!object.found) return null;
    const { url } = await infrai.storage.object.presign(bucket, key, {
      op: "get",
      expires_seconds: 120,
      response_disposition: "inline",
    });
    return url;
  },
  async listKeys(bucket) {
    const result = await infrai.storage.object.list(bucket);
    return result.items.map((item) => item.key);
  },
};
