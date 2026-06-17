// files.ts — Storage gateway Edge Function (Deno).
//
// The client SDK is anon-only and has NO storage module. This function runs
// server-side with the project SERVICE key (ich_admin_), so it can mint signed
// read URLs, signed upload (PUT) URLs, and delete objects on the caller's
// behalf — without ever exposing the service key to the app.
//
// The client (app/storage/storage-client.tsx) calls it via:
//   ichi.functions.invoke('files', { body: { op: 'get' | 'put' | 'delete', ... } })
//
// Deploy this as an Edge Function named `files` in your project dashboard. Env
// injected by the dashboard on deploy:
//   ICHIBASE_PROJECT_URL  e.g. https://myapp.ichibase.net
//   ICHIBASE_SERVICE_KEY  the ich_admin_ service key (NEVER ship this to a client)

const BASE = Deno.env.get("ICHIBASE_PROJECT_URL")!;
const SERVICE = Deno.env.get("ICHIBASE_SERVICE_KEY")!;

interface FilesRequest {
  op?: "get" | "put" | "delete";
  bucket?: string;
  path?: string;
  content_type?: string;
  // Required for `put`: the exact byte length of the body you're about to
  // upload. The signed PUT URL binds to this size, so the client must then send
  // exactly this many bytes.
  content_length?: number;
  // For folder reads: sign every object under `path`.
  recursive?: boolean;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Forward to the control plane with the service key.
async function callStorage(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const res = await fetch(`${BASE}/storage/${endpoint}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Service key — the whole point of doing this server-side.
      authorization: `Bearer ${SERVICE}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return json(data, res.status);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return json({ code: "method_not_allowed", detail: "POST only" }, 405);
  }

  // The SDK attaches the signed-in user's token here. Authenticate / authorize
  // the caller before signing anything. In a real app you would verify this
  // JWT and check that the user is allowed to touch `bucket/path`.
  const userToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  let body: FilesRequest;
  try {
    body = (await req.json()) as FilesRequest;
  } catch {
    return json({ code: "bad_request", detail: "invalid JSON body" }, 400);
  }

  const { op = "get", bucket, path, content_type, content_length, recursive } = body;
  if (!bucket || !path) {
    return json({ code: "bad_request", detail: "bucket and path required" }, 400);
  }

  // ── Authorization gate (replace with your real rules) ────────────────────
  // Example policy: only signed-in users may touch the `private` bucket.
  if (bucket === "private" && !userToken) {
    return json({ code: "unauthorized", detail: "login required" }, 401);
  }

  switch (op) {
    case "get":
      // Returns { url } — a temporary read URL with a ?token=<jwt> query param.
      return callStorage("get-url", { bucket, path, recursive: !!recursive });

    case "put":
      // Returns { url } — a signed PUT url the client uploads bytes to.
      // get-put-url REQUIRES content_length (binds the URL to the exact size +
      // meters it against your storage quota up front).
      if (typeof content_length !== "number" || content_length < 1) {
        return json(
          { code: "bad_request", detail: "content_length (bytes, >= 1) required for put" },
          400,
        );
      }
      return callStorage("get-put-url", {
        bucket,
        path,
        content_type: content_type ?? "application/octet-stream",
        content_length,
      });

    case "delete":
      return callStorage("delete", { bucket, path });

    default:
      return json({ code: "bad_request", detail: `unknown op: ${op}` }, 400);
  }
});
