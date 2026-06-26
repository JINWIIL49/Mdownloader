import { createFileRoute } from "@tanstack/react-router";

const COMMON_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const ANDROID_USER_AGENT = "com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip";

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/functions/v1/tiktok-download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const urlParams = new URL(request.url).searchParams;
        const targetUrl = urlParams.get("file");

        if (!targetUrl) return jsonError("URL ('file') is required");

        const target = new URL(targetUrl);
        const isYouTube = target.hostname.includes("googlevideo.com");
        const isTwitter = target.hostname.includes("twimg.com") || target.hostname.includes("twitter.com");
        const isInstagram = target.hostname.includes("cdninstagram.com") || target.hostname.includes("instagram.com") || target.hostname.includes("fbcdn.net");
        const isFacebook = target.hostname.includes("fbcdn.net") || target.hostname.includes("facebook.com") || target.hostname.includes("fbsbx.com");
        const isLinkedIn = target.hostname.includes("linkedin.com") || target.hostname.includes("licdn.com") || target.hostname.includes("media-exp");

        // YouTube CDN validates that the User-Agent matches the client that generated the URL.
        // ANDROID URLs must use the Android app UA; any mismatch causes a 403.
        const ytClient = isYouTube ? (target.searchParams.get("c") ?? "") : "";
        const isAndroidClient = ytClient === "ANDROID" || ytClient === "ANDROID_EMBEDDED_PLAYER" || ytClient === "ANDROID_CREATOR";
        const effectiveUA = (isYouTube && isAndroidClient) ? ANDROID_USER_AGENT : COMMON_USER_AGENT;

        const platformReferer = isYouTube
          ? "https://www.youtube.com/"
          : isTwitter
          ? "https://x.com/"
          : isInstagram
          ? "https://www.instagram.com/"
          : isFacebook
          ? "https://www.facebook.com/"
          : isLinkedIn
          ? "https://www.linkedin.com/"
          : `${target.origin}/`;

        const upstreamHeaders = new Headers({
          "User-Agent": effectiveUA,
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: platformReferer,
        });

        if (isYouTube) {
          upstreamHeaders.set("Connection", "keep-alive");
          // For WEB client URLs, apply desktop browser fingerprint headers
          if (!isAndroidClient && ytClient !== "") {
            upstreamHeaders.set("Origin", "https://www.youtube.com");
            upstreamHeaders.set("Sec-Fetch-Dest", "video");
            upstreamHeaders.set("Sec-Fetch-Mode", "cors");
            upstreamHeaders.set("Sec-Fetch-Site", "cross-site");
            upstreamHeaders.set("Sec-Ch-Ua", '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"');
            upstreamHeaders.set("Sec-Ch-Ua-Mobile", "?0");
            upstreamHeaders.set("Sec-Ch-Ua-Platform", '"Windows"');
          }
        } else if (isTwitter) {
          upstreamHeaders.set("Origin", "https://x.com");
          upstreamHeaders.set("Sec-Fetch-Dest", "video");
          upstreamHeaders.set("Sec-Fetch-Mode", "cors");
          upstreamHeaders.set("Sec-Fetch-Site", "cross-site");
        } else if (isInstagram || isFacebook) {
          upstreamHeaders.set("Sec-Fetch-Dest", "video");
          upstreamHeaders.set("Sec-Fetch-Mode", "cors");
          upstreamHeaders.set("Sec-Fetch-Site", "cross-site");
        }

        const range = request.headers.get("range");
        if (range) upstreamHeaders.set("Range", range);

        try {
          const upstream = await fetch(target.toString(), {
            method: "GET",
            headers: upstreamHeaders,
            redirect: "follow",
          });

          if (!upstream.ok && upstream.status !== 206) {
            const body = await upstream.text().catch(() => "N/A");
            console.error(`Upstream error ${upstream.status} for ${target.hostname}. Body: ${body.slice(0, 200)}`);
            return jsonError(`Upstream error ${upstream.status}`, 502);
          }

          // Build clean response headers — strip headers that would corrupt the
          // response or prevent the browser from reading the body stream:
          //  • Content-Encoding: CF Workers auto-decompresses gzip/br; passing it
          //    through makes the client try to decompress already-decoded bytes → corruption.
          //  • Transfer-Encoding: handled by the runtime, must not be forwarded.
          //  • Set-Cookie / Cookie: not needed on the download response.
          const STRIP_HEADERS = new Set([
            "content-encoding",
            "transfer-encoding",
            "set-cookie",
            "cookie",
            "strict-transport-security",
            "x-frame-options",
            "x-content-type-options",
          ]);

          const responseHeaders = new Headers();
          for (const [key, value] of upstream.headers.entries()) {
            if (!STRIP_HEADERS.has(key.toLowerCase())) {
              responseHeaders.set(key, value);
            }
          }

          // Force download (not inline play) and set the correct filename.
          const filenameParam = urlParams.get("filename");
          if (filenameParam) {
            const safe = filenameParam.replace(/[^\w.\-]/g, "_");
            responseHeaders.set(
              "Content-Disposition",
              `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filenameParam)}`,
            );
          } else if (!responseHeaders.has("Content-Disposition")) {
            responseHeaders.set("Content-Disposition", "attachment");
          }

          // Allow the browser JS (fetch stream reader) to see all headers so the
          // progress bar can read Content-Length.
          responseHeaders.set("Access-Control-Allow-Origin", "*");
          responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Type");

          return new Response(upstream.body, {
            status: upstream.status,
            headers: responseHeaders,
          });
        } catch (err: any) {
          console.error("Proxy error:", err);
          return jsonError(`Proxy failed: ${err.message}`, 502);
        }
      },
      POST: async ({ request }) => {
        let body: { url?: string };
        try {
          body = await request.json();
        } catch {
          return jsonError("Invalid JSON body");
        }

        const inputUrl = (body.url ?? "").trim();
        if (!inputUrl) return jsonError("Missing 'url'");

        try {
          const apiRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(inputUrl)}`);
          if (!apiRes.ok) throw new Error(`TikWM API failed with status ${apiRes.status}`);

          const payload = await apiRes.json();
          if (payload.code !== 0 || !payload.data) {
            const msg = payload.msg || "";
            if (msg.toLowerCase().includes("limit") || msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("free api")) {
              console.warn("TikTok rate limit hit on worker, instructing client to fetch directly.");
              return Response.json({ fallback_client_fetch: true, url: inputUrl });
            }
            throw new Error(msg || "Failed to fetch TikTok video data");
          }

          const d = payload.data;
          const result = {
            title: d.title || "TikTok Video",
            cover: d.cover || null,
            duration: d.duration || null,
            type: d.images && d.images.length > 0 ? "slideshow" : "video",
            images: d.images || [],
            author: {
              nickname: d.author?.nickname || "TikTok User",
              unique_id: d.author?.unique_id || "tiktok_user",
              avatar: d.author?.avatar || null,
            },
            stats: {
              plays: d.play_count || 0,
              likes: d.digg_count || 0,
              comments: d.comment_count || 0,
              shares: d.share_count || 0,
            },
            downloads: {
              no_watermark: d.play || null,
              no_watermark_hd: d.hdplay || null,
              watermark: d.wmplay || null,
              music: d.music || null,
            },
          };

          return Response.json(result);
        } catch (error: any) {
          console.error("TikTok scrape error:", error);
          // Fall back to client fetch on network or generic proxy errors too
          return Response.json({ fallback_client_fetch: true, url: inputUrl });
        }
      },
    },
  },
});