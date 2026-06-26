// supabase/functions/linkedin-download/index.ts
// Resolves a LinkedIn post URL into downloadable image AND video assets.
// Returns JSON the frontend feeds into the generic media proxy.
//
// Deploy with "Verify JWT" = OFF.

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function decodeJsonStrings(html: string): string {
  // LinkedIn embeds JSON inside <code> blocks with escaped slashes.
  return html.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
}

function extractImages(html: string): string[] {
  const out: string[] = [];
  // og:image
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi);
  if (og) {
    for (const tag of og) {
      const m = tag.match(/content=["']([^"']+)["']/i);
      if (m) out.push(m[1]);
    }
  }
  // media.licdn.com images in post body
  const re = /https:\/\/media\.licdn\.com\/[^\s"'<>\\]+?\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>\\]*)?/gi;
  for (const m of html.match(re) ?? []) out.push(m);
  return unique(out);
}

function extractVideos(html: string): string[] {
  const out: string[] = [];
  // 1) Direct .mp4 URLs in the markup
  const mp4Re = /https:\/\/[^\s"'<>\\]+?\.mp4(?:\?[^\s"'<>\\]*)?/gi;
  for (const m of html.match(mp4Re) ?? []) out.push(m);

  // 2) progressiveStreams / progressiveUrl JSON keys
  const progRe = /"progressiveUrl"\s*:\s*"([^"]+)"/g;
  let pm: RegExpExecArray | null;
  while ((pm = progRe.exec(html))) out.push(pm[1]);

  const progStreamsRe = /"progressiveStreams"\s*:\s*\[([\s\S]*?)\]/g;
  while ((pm = progStreamsRe.exec(html))) {
    const block = pm[1];
    const inner = /"streamingLocations"\s*:\s*\[\s*\{[^}]*"url"\s*:\s*"([^"]+)"/g;
    let im: RegExpExecArray | null;
    while ((im = inner.exec(block))) out.push(im[1]);
  }

  // 3) HLS playlists (still useful even if browsers can't natively download them)
  const m3u8Re = /https:\/\/[^\s"'<>\\]+?\.m3u8(?:\?[^\s"'<>\\]*)?/gi;
  for (const m of html.match(m3u8Re) ?? []) out.push(m);

  return unique(out.map((u) => u.replace(/\\u0026/g, "&").replace(/\\&/g, "&")));
}

function pickTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og) return og[1];
  const t = html.match(/<title>([^<]+)<\/title>/i);
  return t ? t[1].replace(/\s*\|\s*LinkedIn.*$/i, "").trim() : "linkedin-post";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const target = (body.url ?? "").trim();
  if (!target) return jsonError("Missing 'url'");
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return jsonError("Invalid URL");
  }
  if (!/(^|\.)linkedin\.com$/i.test(parsed.hostname)) {
    return jsonError("URL must be on linkedin.com");
  }

  let html = "";
  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok) return jsonError(`LinkedIn responded ${res.status}`, 502);
    html = decodeJsonStrings(await res.text());
  } catch (e) {
    return jsonError(`Fetch failed: ${(e as Error).message}`, 502);
  }

  const title = pickTitle(html);
  const images = extractImages(html).map((url, i) => ({
    type: "image" as const,
    url,
    filename: `linkedin-image-${String(i + 1).padStart(2, "0")}.jpg`,
  }));
  const videos = extractVideos(html).map((url, i) => ({
    type: url.endsWith(".m3u8") ? ("hls" as const) : ("video" as const),
    url,
    filename: url.endsWith(".m3u8")
      ? `linkedin-video-${String(i + 1).padStart(2, "0")}.m3u8`
      : `linkedin-video-${String(i + 1).padStart(2, "0")}.mp4`,
  }));

  if (images.length === 0 && videos.length === 0) {
    return jsonError("No downloadable media found in this post", 404);
  }

  return new Response(
    JSON.stringify({
      platform: "linkedin",
      title,
      sourceUrl: parsed.toString(),
      media: [...videos, ...images],
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
