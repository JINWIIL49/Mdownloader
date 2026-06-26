// In the original Express repo these ran on a local Node server.
// Here we always call the deployed Supabase Edge Functions instead.
const APP_HOSTED_FUNCTIONS = new Set<string>([
  "youtube-download",
  "tiktok-download",
  "facebook-download",
  "linkedin-download",
  "instagram-download",
  "tinyurl-tools",
  "twitter-download",
  "spotify-download",
  "spotify-collection-info",
]);

export const usesLocalDevFunction = (functionName: string) => APP_HOSTED_FUNCTIONS.has(functionName);

export const publicFunctionBase = (functionName: string) =>
  // Local dev helpers (functions served by the dev server)
  usesLocalDevFunction(functionName)
    ? window.location.origin
    : import.meta.env.VITE_SUPABASE_URL;

const readFunctionError = async (response: Response) => {
  try {
    const payload = await response.clone().json() as { error?: string };
    if (payload?.error) return payload.error;
  } catch {
    try {
      const text = await response.clone().text();
      if (text) return text;
    } catch {
      // Ignore parsing errors and fall through.
    }
  }

  return `Function error ${response.status}`;
};

const trimStr = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Edge Functions validate `Authorization: Bearer` as a JWT. The legacy **anon**
 * key (`eyJ…`) works. New **publishable** keys (`sb_publishable_…`) are not JWTs
 * and return `UNAUTHORIZED_INVALID_JWT_FORMAT`. Prefer `VITE_SUPABASE_ANON_KEY`.
 */
function jwtForEdgeFunctions(): string {
  const anon = trimStr(
    (globalThis as any).VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    (globalThis as any).process?.env?.VITE_SUPABASE_ANON_KEY
  );
  const pub = trimStr(
    (globalThis as any).VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    (globalThis as any).process?.env?.VITE_SUPABASE_PUBLISHABLE_KEY
  );

  if (anon.startsWith("eyJ")) return anon;
  if (pub.startsWith("eyJ")) return pub;

  throw new Error(
    "Edge Functions require the anon JWT (starts with eyJ). In Supabase → Project Settings → API, copy the anon public key and set VITE_SUPABASE_ANON_KEY in your .env. VITE_SUPABASE_PUBLISHABLE_KEY (sb_publishable_…) is not a JWT and causes Invalid JWT — this is separate from REMOVE_BG_API_KEY.",
  );
}

/**
 * Call a Supabase Edge Function with the anon JWT. We use `fetch` instead of
 * `supabase.functions.invoke` so non-2xx responses still expose the JSON
 * `{ error: "…" }` body. The client helper often only surfaces "Edge Function
 * returned a non-2xx status code", which hides missing secrets / API failures.
 */
async function invokeHostedEdgeFunction<T>(functionName: string, body: unknown): Promise<T> {
  const base = String(
    (globalThis as any).VITE_SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");
  const key = jwtForEdgeFunctions();
  if (!base) {
    throw new Error("VITE_SUPABASE_URL is not configured");
  }

  const response = await fetch(`${base}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed = {} as { error?: string } & T;
  if (text) {
    try {
      parsed = JSON.parse(text) as { error?: string } & T;
    } catch {
      if (!response.ok) throw new Error(text.slice(0, 400) || `Function error ${response.status}`);
      throw new Error("Invalid JSON from Edge Function");
    }
  }

  if (!response.ok) {
    const msg =
      (typeof parsed?.error === "string" && parsed.error.trim()) ||
      text?.slice(0, 400) ||
      `Function error ${response.status}`;
    throw new Error(msg);
  }

  if (typeof parsed?.error === "string" && parsed.error.trim()) {
    throw new Error(parsed.error);
  }

  return parsed as T;
}

export const invokePublicFunction = async <T>(functionName: string, body: unknown): Promise<T> => {
  if (usesLocalDevFunction(functionName)) {
    const response = await fetch(`${publicFunctionBase(functionName)}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(await readFunctionError(response));
    }

    const payload = await response.json() as { error?: string } & T;
    if (payload?.error) throw new Error(payload.error);
    return payload as T;
  }

  return invokeHostedEdgeFunction<T>(functionName, body);
};
