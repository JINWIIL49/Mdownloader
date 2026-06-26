import { createFileRoute } from "@tanstack/react-router";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MOBILE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";
const SHARE_RESOLVER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function safeFilename(name: string, fallback = "facebook") {
  const cleaned = (name || "").replace(/[\\/:*?"<>|\r\n]+/g, "_").trim().slice(0, 80);
  return cleaned || fallback;
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function decodeJsonString(s: string): string {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\\//g, "/")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function normalizeFacebookUrl(input: string): string {
  try {
    const u = new URL(input);
    if (u.hostname === "fb.watch" || u.hostname === "www.fb.watch") return input;
    u.hostname = "www.facebook.com";
    return u.toString();
  } catch {
    return input;
  }
}

async function fetchHtml(url: string, userAgent: string, redirect: RequestRedirect = "follow") {
  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Cookie: "locale=en_US; wd=1280x720; dpr=1",
    },
    redirect,
  });

  return {
    ok: res.ok,
    status: res.status,
    url: res.url,
    location: res.headers.get("location"),
    html: await res.text(),
  };
}

function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+property=["']${property}["']`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }

  return null;
}

function extractTitle(html: string): string | null {
  const og = extractMeta(html, "og:title");
  if (og) return og;

  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
  return title ? decodeHtmlEntities(title).replace(/ \| Facebook$/i, "").trim() : null;
}

function extractThumbnail(html: string): string | null {
  return extractMeta(html, "og:image");
}

function extractCanonicalUrl(html: string): string | null {
  return extractMeta(html, "og:url")
    ?? html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    ?? null;
}

function extractVideoId(value: string): string | null {
  const patterns = [
    /[?&]v=(\d{6,})/,
    /\/reel\/(\d{6,})/,
    /\/videos\/(\d{6,})/,
    /\/watch\/\?v=(\d{6,})/,
    /story_fbid=(\d{6,})/,
    /pageID":(\d{6,})/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

async function resolveShareUrl(inputUrl: string): Promise<string> {
  if (!/facebook\.com\/share\//i.test(inputUrl)) return inputUrl;

  try {
    const res = await fetchHtml(inputUrl, SHARE_RESOLVER_UA, "manual");
    const location = res.location;
    if (location) {
      return location.startsWith("http") ? location : new URL(location, inputUrl).toString();
    }

    const ogUrl = extractCanonicalUrl(res.html);
    if (ogUrl) return ogUrl;
  } catch {
    // Fall back to the original URL; later candidates may still work.
  }

  return inputUrl;
}

function buildCandidateUrls(inputUrl: string): string[] {
  const normalized = normalizeFacebookUrl(inputUrl);
  const id = extractVideoId(normalized);
  const candidates = [normalized];

  if (id) {
    candidates.unshift(
      `https://www.facebook.com/watch/?v=${id}`,
      `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(`https://www.facebook.com/reel/${id}`)}&show_text=0`,
      `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(`https://www.facebook.com/watch/?v=${id}`)}&show_text=0`,
    );
  }

  return uniq(candidates);
}

function extractVideoUrls(html: string) {
  const hd: string[] = [];
  const sd: string[] = [];
  const patterns: Array<[string[], RegExp]> = [
    [hd, /"hd_src":"([^"\\]*(?:\\.[^"\\]*)*)"/g],
    [sd, /"sd_src":"([^"\\]*(?:\\.[^"\\]*)*)"/g],
    [hd, /"playable_url_quality_hd":"([^"\\]*(?:\\.[^"\\]*)*)"/g],
    [sd, /"playable_url":"([^"\\]*(?:\\.[^"\\]*)*)"/g],
    [hd, /"browser_native_hd_url":"([^"\\]*(?:\\.[^"\\]*)*)"/g],
    [sd, /"browser_native_sd_url":"([^"\\]*(?:\\.[^"\\]*)*)"/g],
  ];

  for (const [bucket, regex] of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html))) {
      bucket.push(decodeJsonString(match[1]));
    }
  }

  return {
    hd: uniq(hd.filter((u) => u.startsWith("http"))),
    sd: uniq(sd.filter((u) => u.startsWith("http"))),
  };
}

async function fetchBestFacebookPage(inputUrl: string) {
  const resolvedShare = await resolveShareUrl(inputUrl);
  const candidates = buildCandidateUrls(resolvedShare);
  const attempts: string[] = [];

  for (const candidate of candidates) {
    for (const ua of [DESKTOP_UA, MOBILE_SAFARI_UA]) {
      try {
        const res = await fetchHtml(candidate, ua, "follow");
        attempts.push(`${candidate} → ${res.status}`);
        if (!res.ok || res.html.length < 500) continue;

        const media = extractVideoUrls(res.html);
        if (media.hd.length || media.sd.length) {
          return {
            html: res.html,
            media,
            resolvedUrl: extractCanonicalUrl(res.html) ?? resolvedShare,
          };
        }
      } catch (error) {
        attempts.push(`${candidate} → ${error instanceof Error ? error.message : "fetch failed"}`);
      }
    }
  }

  throw new Error(`No downloadable media found. Tried: ${attempts.join(" | ")}`);
}

export const Route = createFileRoute("/functions/v1/facebook-download")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { url?: string; mode?: string };
        try {
          body = await request.json();
        } catch {
          return jsonError("Invalid JSON body");
        }

        const inputUrl = (body.url ?? "").trim();
        const mode = (body.mode ?? "video").toLowerCase();
        if (!inputUrl) return jsonError("Missing 'url'");

        try {
          const fetched = await fetchBestFacebookPage(inputUrl);
          const title = extractTitle(fetched.html);
          const thumbnail = extractThumbnail(fetched.html);
          const baseName = safeFilename(title ?? "facebook-video");
          const items: Array<Record<string, unknown>> = [];
          const videoDownloads: any[] = [];

          fetched.media.hd.forEach((url, index) => {
            videoDownloads.push({
              label: fetched.media.hd.length > 1 ? `HD Video Option ${index + 1} (Original HD)` : "HD Video (Original HD)",
              url,
              filename: `${baseName}-hd.mp4`,
              functionName: "tiktok-download",
              mimeType: "video/mp4",
              quality: "HD",
            });
          });

          fetched.media.sd.forEach((url, index) => {
            videoDownloads.push({
              label: fetched.media.sd.length > 1 ? `SD Video Option ${index + 1} (Standard SD)` : "SD Video (Standard SD)",
              url,
              filename: `${baseName}-sd.mp4`,
              functionName: "tiktok-download",
              mimeType: "video/mp4",
              quality: "SD",
            });
          });

          if (videoDownloads.length > 0) {
            items.push({
              id: "facebook-video",
              type: "video",
              title: title || "Facebook Video",
              description: "Facebook MP4 Video",
              thumbnail,
              downloads: videoDownloads,
            });
          }

          if (thumbnail) {
            items.push({
              id: "facebook-thumb",
              type: "image",
              title: "Thumbnail",
              description: "Cover image",
              thumbnail,
              downloads: [{
                label: "Thumbnail",
                url: thumbnail,
                filename: `${baseName}-thumb.jpg`,
                functionName: "tiktok-download",
                mimeType: "image/jpeg",
              }],
            });
          }

          let parsedTitle = title || "Facebook Video";
          let parsedUsername = "facebook";
          if (title && title.includes("|")) {
            const parts = title.split("|");
            if (parts.length >= 2) {
              parsedTitle = parts.slice(0, -1).join("|").trim() || parsedTitle;
              parsedUsername = parts[parts.length - 1].trim() || parsedUsername;
            }
          }

          return Response.json({
            platform: "facebook",
            sourceType: mode,
            title: parsedTitle,
            caption: parsedTitle,
            username: parsedUsername,
            authorName: parsedUsername,
            profilePic: null,
            cover: thumbnail,
            items,
            resolvedUrl: fetched.resolvedUrl,
          });
        } catch (error) {
          return jsonError(error instanceof Error ? error.message : "Facebook download failed", 502);
        }
      },
    },
  },
});