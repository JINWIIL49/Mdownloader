import { createFileRoute } from "@tanstack/react-router";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function safeFilename(name: string, fallback = "linkedin") {
  const cleaned = (name || "").replace(/[\\/:*?"<>|\r\n]+/g, "_").trim().slice(0, 80);
  return cleaned || fallback;
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
  return title ? decodeHtmlEntities(title).replace(/\s*\|\s*LinkedIn.*$/i, "").trim() : null;
}

function extractJsonLd(html: string) {
  const re = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      const obj = JSON.parse(match[1]);
      if (obj?.["@type"] === "VideoObject" || obj?.contentUrl || obj?.thumbnailUrl) {
        return obj;
      }
      if (Array.isArray(obj)) {
        for (const item of obj) {
          if (item?.["@type"] === "VideoObject" || item?.contentUrl || item?.thumbnailUrl) {
            return item;
          }
        }
      }
    } catch {
      // ignore JSON parse error
    }
  }
  return null;
}

async function fetchPageHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": DESKTOP_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  return res.text();
}

export const Route = createFileRoute("/functions/v1/linkedin-download")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { url } = body;
          if (!url) return jsonError("URL is required");

          const targetUrl = String(url).trim();
          let html = "";
          try {
            html = await fetchPageHtml(targetUrl);
          } catch (e: any) {
            return jsonError(`Failed to connect to LinkedIn: ${e.message}`, 502);
          }

          let jsonLd = extractJsonLd(html);
          
          // Fallback: If we didn't find video/media elements, try to fetch the embed pages
          if (!jsonLd) {
            const idMatch = targetUrl.match(/activity-(\d+)/) || targetUrl.match(/posts\/[^\s_]+-(\d+)/) || targetUrl.match(/feed\/update\/urn:li:activity:(\d+)/) || targetUrl.match(/(\d+)/);
            if (idMatch?.[1]) {
              const activityId = idMatch[1];
              const embedTypes = ["activity", "share", "ugcPost"];
              for (const type of embedTypes) {
                try {
                  const embedUrl = `https://www.linkedin.com/embed/feed/update/urn:li:${type}:${activityId}`;
                  const embedHtml = await fetchPageHtml(embedUrl);
                  const embedJson = extractJsonLd(embedHtml);
                  if (embedJson) {
                    jsonLd = embedJson;
                    break;
                  }
                } catch {
                  // try next embed format
                }
              }
            }
          }

          const title = extractTitle(html) || jsonLd?.name || "LinkedIn Media";
          const baseName = safeFilename(title, "linkedin");

          const items: any[] = [];
          
          // 1. High-Quality Video Option
          if (jsonLd?.contentUrl) {
            items.push({
              id: "video_hq",
              type: "video",
              description: "High Quality Video",
              downloads: [{
                label: "Download Video",
                url: jsonLd.contentUrl,
                filename: `${baseName}.mp4`,
                functionName: "tiktok-download",
                mimeType: "video/mp4",
                quality: "High Quality MP4"
              }]
            });

            // 2. High-Quality Audio Option (extracted from Video stream!)
            items.push({
              id: "audio_hq",
              type: "audio",
              description: "High Quality Audio",
              downloads: [{
                label: "Download Audio",
                url: jsonLd.contentUrl,
                filename: `${baseName}.mp3`,
                functionName: "tiktok-download",
                mimeType: "audio/mp3",
                quality: "High Quality MP3"
              }]
            });
          }

          // 3. Image Options (direct cover cover, og:image, or other found photos)
          const coverUrl = jsonLd?.thumbnailUrl || extractMeta(html, "og:image");
          if (coverUrl) {
            items.push({
              id: "thumbnail",
              type: "image",
              description: "Cover Thumbnail",
              downloads: [{
                label: "Download Image",
                url: coverUrl,
                filename: `${baseName}-cover.jpg`,
                functionName: "tiktok-download",
                mimeType: "image/jpeg",
              }]
            });
          }

          if (items.length === 0) {
            try {
              // Final fallback: try using yt-dlp to extract metadata directly
              const metadata = await new Promise<any>(async (resolve, reject) => {
                try {
                  const isServerlessEnv =
                    typeof process === "undefined" ||
                    !process.versions ||
                    !process.versions.node ||
                    (typeof globalThis !== "undefined" && (globalThis as any).WebSocketPair !== undefined);

                  if (isServerlessEnv) {
                    throw new Error("Serverless environment (local child_process execution not supported)");
                  }

                  const { spawn } = await import("child_process");
                  let out = "";
                  const ytArgs = ["-m", "yt_dlp", "-J", "--no-warnings", targetUrl];
                  const proc = spawn("python", ytArgs);
                  proc.stdout.on("data", (chunk) => (out += chunk.toString()));
                  proc.on("close", (code) => {
                    if (code === 0) {
                      try { resolve(JSON.parse(out)); } catch (e) { reject(e); }
                    } else {
                      reject(new Error(`yt-dlp exited with code ${code}`));
                    }
                  });
                  proc.on("error", reject);
                } catch (err: any) {
                  reject(new Error(`Local execution is not supported: ${err.message}`));
                }
              });

              if (metadata && metadata.url) {
                const ytTitle = metadata.title || title;
                const ytBaseName = safeFilename(ytTitle, "linkedin");
                
                items.push({
                  id: "video_yt",
                  type: "video",
                  description: "High Quality Video",
                  downloads: [{
                    label: "Download Video",
                    url: metadata.url,
                    filename: `${ytBaseName}.mp4`,
                    functionName: "tiktok-download",
                    mimeType: "video/mp4",
                    quality: metadata.resolution || "HQ"
                  }]
                });

                // Provide audio extraction for yt-dlp fallback video stream
                items.push({
                  id: "audio_yt",
                  type: "audio",
                  description: "High Quality Audio",
                  downloads: [{
                    label: "Download Audio",
                    url: metadata.url,
                    filename: `${ytBaseName}.mp3`,
                    functionName: "tiktok-download",
                    mimeType: "audio/mp3",
                    quality: "High Quality MP3"
                  }]
                });

                return Response.json({
                  platform: "linkedin",
                  title: ytTitle,
                  caption: metadata.description || ytTitle,
                  cover: metadata.thumbnail || coverUrl,
                  items,
                });
              }
            } catch (fallbackError: any) {
              console.error("yt-dlp fallback error:", fallbackError);
            }

            return jsonError("Could not find any video, audio, or image links for this post. Please verify the URL is public.");
          }

          return Response.json({
            platform: "linkedin",
            title,
            caption: jsonLd?.description || title,
            cover: coverUrl,
            items,
          });
        } catch (error: any) {
          return jsonError(error.message || "LinkedIn parser error", 500);
        }
      },
    },
  },
});
