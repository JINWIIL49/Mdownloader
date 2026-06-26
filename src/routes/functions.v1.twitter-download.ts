import { createFileRoute } from "@tanstack/react-router";

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function safeFilename(name: string, fallback = "twitter") {
  const cleaned = (name || "").replace(/[\\/:"*?<>|\r\n]+/g, "_").trim().slice(0, 80);
  return cleaned || fallback;
}

/**
 * Extract tweet ID from a Twitter/X URL.
 * Handles x.com and twitter.com variants.
 */
function extractTweetId(url: string): string | null {
  const m = url.match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/i);
  return m ? m[1] : null;
}

/**
 * Fetch tweet data using multiple public APIs as fallbacks.
 * Primary: api.fxtwitter.com — fallback: api.vxtwitter.com
 */
async function fetchTweetData(tweetId: string): Promise<any> {
  const apis = [
    `https://api.fxtwitter.com/status/${tweetId}`,
    `https://api.vxtwitter.com/status/${tweetId}`,
  ];

  let lastError = "Could not fetch tweet data";
  for (const apiUrl of apis) {
    try {
      const response = await fetch(apiUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        lastError = `Twitter API returned ${response.status}`;
        continue;
      }

      const data = await response.json() as any;

      // fxtwitter / vxtwitter both wrap tweet in data.tweet
      const tweet = data?.tweet ?? data?.data ?? data;
      if (tweet?.author || tweet?.media || tweet?.text) {
        return tweet;
      }
      lastError = "No tweet data in API response";
    } catch (e: any) {
      lastError = e.message;
      console.warn(`[Twitter] ${apiUrl} failed: ${e.message}`);
    }
  }

  throw new Error(`${lastError}. Make sure the tweet is public and contains media.`);
}

export const Route = createFileRoute("/functions/v1/twitter-download")({
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
        const mode = (body.mode ?? "post").toLowerCase();
        if (!inputUrl) return jsonError("Missing 'url'");

        const tweetId = extractTweetId(inputUrl);
        if (!tweetId) {
          return jsonError("Could not extract tweet ID. URL must match x.com/.../status/... or twitter.com/.../status/...");
        }

        try {
          const tweet = await fetchTweetData(tweetId);

          const authorName = tweet.author?.name ?? tweet.author?.screen_name ?? "Twitter User";
          const username = tweet.author?.screen_name ?? "twitter_user";
          const tweetText = tweet.text ?? tweet.full_text ?? "";
          const cover = tweet.media?.photos?.[0]?.url ?? tweet.media?.videos?.[0]?.thumbnail_url ?? tweet.author?.avatar_url ?? null;

          const items: any[] = [];

          // — Videos —
          const videoMedia = tweet.media?.videos ?? (tweet.media?.video ? [tweet.media.video] : []);
          if ((mode === "post" || mode === "video") && videoMedia.length > 0) {
            for (let i = 0; i < videoMedia.length; i++) {
              const vid = videoMedia[i];
              const baseName = safeFilename(tweetText || `twitter_${tweetId}`);

              // Collect quality variants
              const variants: any[] = vid.variants ?? [];
              // Sort by bitrate descending for best-first ordering
              const sorted = [...variants]
                .filter((v: any) => v.content_type === "video/mp4" && v.url)
                .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

              const downloads: any[] = [];
              sorted.forEach((v: any, idx: number) => {
                const label = idx === 0
                  ? "HD Video (Best Quality)"
                  : idx === 1
                  ? "SD Video (Standard)"
                  : `Video Option ${idx + 1}`;
                downloads.push({
                  label,
                  url: v.url,
                  filename: `${baseName}_${idx === 0 ? "hd" : "sd"}.mp4`,
                  functionName: "tiktok-download",
                  mimeType: "video/mp4",
                  quality: v.bitrate ? Math.round(v.bitrate / 1000) : undefined,
                  hasAudio: true,
                });
              });

              // Fallback: if fxtwitter gives a single .mp4 url field
              if (downloads.length === 0 && vid.url) {
                downloads.push({
                  label: "Video (MP4)",
                  url: vid.url,
                  filename: `${baseName}.mp4`,
                  functionName: "tiktok-download",
                  mimeType: "video/mp4",
                  hasAudio: true,
                });
              }

              if (downloads.length > 0) {
                const thumb = vid.thumbnail_url ?? cover;
                items.push({
                  id: `video-${i}`,
                  type: "video",
                  title: tweetText || `Twitter Video ${i + 1}`,
                  description: `@${username}`,
                  thumbnail: thumb,
                  downloads,
                });
              }
            }
          }

          // — Images / Photos —
          const photos = tweet.media?.photos ?? [];
          if ((mode === "post" || mode === "image") && photos.length > 0) {
            for (let i = 0; i < photos.length; i++) {
              const photo = photos[i];
              const photoUrl: string = photo.url ?? "";
              if (!photoUrl) continue;

              const baseName = safeFilename(tweetText || `twitter_${tweetId}`);
              const ext = photoUrl.includes(".png") ? "png" : "jpg";
              // Twitter images: append ?name=orig for original quality
              const origUrl = photoUrl.includes("?")
                ? photoUrl.replace(/([?&])name=[^&]*/i, "$1name=orig")
                : `${photoUrl}?name=orig`;

              items.push({
                id: `image-${i}`,
                type: "image",
                title: tweetText || `Twitter Image ${i + 1}`,
                description: `@${username}`,
                thumbnail: photoUrl,
                downloads: [
                  {
                    label: "Original Quality",
                    url: origUrl,
                    filename: `${baseName}_${i + 1}.${ext}`,
                    functionName: "tiktok-download",
                    mimeType: `image/${ext}`,
                  },
                  {
                    label: "Large (4096px)",
                    url: photoUrl.includes("?")
                      ? photoUrl.replace(/([?&])name=[^&]*/i, "$1name=4096x4096")
                      : `${photoUrl}?name=4096x4096`,
                    filename: `${baseName}_${i + 1}_large.${ext}`,
                    functionName: "tiktok-download",
                    mimeType: `image/${ext}`,
                  },
                ],
              });
            }
          }

          if (items.length === 0) {
            return jsonError(
              mode === "video"
                ? "No video found in this tweet. Try 'Post' mode to see all media."
                : mode === "image"
                ? "No images found in this tweet. Try 'Post' mode to see all media."
                : "No downloadable media found in this tweet. Make sure the tweet is public and contains a video or image."
            );
          }

          return Response.json({
            platform: "twitter",
            mode,
            sourceType: mode,
            id: tweetId,
            title: tweetText || `Tweet by @${username}`,
            caption: tweetText,
            username,
            authorName,
            cover,
            items,
          });
        } catch (error) {
          console.error("Twitter download error:", error);
          const msg = error instanceof Error ? error.message : "Twitter download failed";
          return jsonError(msg, 502);
        }
      },
    },
  },
});
