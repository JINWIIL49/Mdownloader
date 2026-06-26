// supabase/functions/tiktok-download/index.ts
// Generic media proxy used by the frontend's <a download> links.
// Forwards Range/HEAD, sets Content-Disposition so the browser actually
// saves a file, and only allows known media hosts.
//
// Deploy with "Verify JWT" = OFF.

const ALLOWED_HOST_SUFFIXES = [
  // TikTok
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "tiktokcdn-eu.com",
  "tiktokv.com",
  "tiktokv.us",
  "muscdn.com",
  "musical.ly",
  "byteoversea.com",
  "akamaized.net",
  // Instagram / Facebook
  "cdninstagram.com",
  "fbcdn.net",
  // Twitter / X
  "twimg.com",
  "video.twimg.com",
  // LinkedIn
  "licdn.com",
  "dms.licdn.com",
  "media.licdn.com",
  // YouTube / googlevideo
  "googlevideo.com",
  "ytimg.com",
  // Invidious mirrors (so YT downloads via Invidious proxy work)
  "invidious.nerdvpn.de",
  "invidious.privacyredirect.com",
  "iv.melmac.space",
  "yewtu.be",
  "invidious.lunar.icu",
  "invidious.fdn.fr",
  "invidious.projectsegfau.lt",
  // Generic CDNs sometimes used by scrapers
  "cloudfront.net",
  "amazonaws.com",
];

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges, content-disposition",
};

function hostAllowed(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => h === suffix || h.endsWith("." + suffix));
}

function safeFilename(name: string, fallback = "download"): string {
  const cleaned = (name || "").replace(/[\\/:*?"<>|\r\n]+/g, "_").trim();
  return cleaned || fallback;
}

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "GET" && req.method !== "HEAD") {
    return jsonError("Method not allowed", 405);
  }

  const url = new URL(req.url);
  const fileParam = url.searchParams.get("file");
  const filenameParam = url.searchParams.get("filename") || "download";

  if (!fileParam) return jsonError("Missing 'file' query parameter");

  let target: URL;
  try {
    target = new URL(fileParam);
  } catch {
    return jsonError("Invalid 'file' URL");
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return jsonError("Only http(s) URLs allowed");
  }
  if (!hostAllowed(target)) {
    return jsonError(`Host not allowed: ${target.hostname}`, 400);
  }

  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: target.origin + "/",
  };
  const range = req.headers.get("range");
  if (range) upstreamHeaders["Range"] = range;

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method: req.method,
      headers: upstreamHeaders,
      redirect: "follow",
    });
  } catch (e) {
    return jsonError(`Upstream fetch failed: ${(e as Error).message}`, 502);
  }

  if (!upstream.ok && upstream.status !== 206) {
    return jsonError(`Upstream error ${upstream.status}`, 502);
  }

  const outHeaders = new Headers(corsHeaders);
  const passthrough = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "last-modified",
    "etag",
  ];
  for (const h of passthrough) {
    const v = upstream.headers.get(h);
    if (v) outHeaders.set(h, v);
  }
  if (!outHeaders.has("content-type")) outHeaders.set("content-type", "application/octet-stream");
  outHeaders.set(
    "content-disposition",
    `attachment; filename="${safeFilename(filenameParam)}"`,
  );
  outHeaders.set("cache-control", "private, max-age=0, no-store");

  return new Response(req.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
});
