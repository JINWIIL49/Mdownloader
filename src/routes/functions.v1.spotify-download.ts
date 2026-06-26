import { createFileRoute } from "@tanstack/react-router";

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function safeName(s: string) {
  return (s || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim() || "Unknown";
}

function contentDisposition(filename: string) {
  const safe = filename.replace(/[^ -~]/g, "_");
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function audioResponse(body: ReadableStream | null, filename: string, cl?: string | null) {
  const h = new Headers();
  h.set("Content-Type", "audio/mpeg");
  h.set("Content-Disposition", contentDisposition(filename));
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Expose-Headers", "Content-Length, Content-Disposition");
  if (cl) h.set("Content-Length", cl);
  return new Response(body, { status: 200, headers: h });
}

const EMBED_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Fetch Spotify embed page and return parsed __NEXT_DATA__ */
async function getEmbedNextData(type: string, id: string): Promise<any | null> {
  try {
    const res = await fetch(`https://open.spotify.com/embed/${type}/${id}?utm_source=generator`, {
      headers: { "User-Agent": EMBED_UA, "Accept": "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    return m ? JSON.parse(m[1]) : null;
  } catch (e: any) {
    console.warn(`getEmbedNextData(${type}/${id}): ${e.message}`);
    return null;
  }
}

/** Parse ytdlp URI → videoId */
function parseYtUri(s: string): string | null {
  if (!s.startsWith("ytdlp:")) return null;
  const rest = s.slice(6);
  const id = rest.slice(0, rest.indexOf(":"));
  return /^[\w-]{11}$/.test(id) ? id : null;
}

/** Parse spotifydown URI → trackId */
function parseSdUri(s: string): string | null {
  if (!s.startsWith("spotifydown:")) return null;
  return s.slice(12).split(":")[0] || null;
}

export const Route = createFileRoute("/functions/v1/spotify-download")({
  server: {
    handlers: {

      // ── POST: Track info lookup (fallback when Python backend is cold) ────────────────────
      POST: async ({ request }) => {
        let body: { url?: string } = {};
        try { body = await request.json(); } catch { return jsonError("Invalid JSON body"); }
        const { url } = body;
        if (!url) return jsonError("Missing url");

        // Parse track ID
        const m = url.match(/open\.spotify\.com\/(?:[a-z]{2}\/)?track\/([A-Za-z0-9]+)/i)
          || url.match(/spotify:track:([A-Za-z0-9]+)/);
        if (!m) return jsonError("Not a valid Spotify track URL");
        const trackId = m[1];

        // 1. Try Python backend at localhost (works on Render server-side)
        for (const base of ["http://127.0.0.1:8001", "http://127.0.0.1:8000"]) {
          try {
            const pyRes = await fetch(`${base}/spotify/info`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url }),
              signal: AbortSignal.timeout(12000),
            });
            if (pyRes.ok) {
              const d = await pyRes.json();
              if (d?.items?.length || d?.media?.length) {
                console.log(`[SpotifyDL/POST] Python @ ${base} served track`);
                return Response.json(d);
              }
            }
          } catch { /* try next */ }
        }

        // 2. Get anonymous Spotify access token from embed page
        let title = "Unknown Track", artist = "Unknown Artist", album = "", coverUrl = "";
        const nd = await getEmbedNextData("track", trackId);
        const token = nd?.props?.pageProps?.accessToken as string | undefined;

        if (token) {
          // Use official Spotify Web API (token obtained without any credentials)
          try {
            const apiRes = await fetch(`https://api.spotify.com/v1/tracks/${trackId}?market=US`, {
              headers: { "Authorization": `Bearer ${token}` },
              signal: AbortSignal.timeout(10000),
            });
            if (apiRes.ok) {
              const t = await apiRes.json();
              title = t.name || title;
              artist = (t.artists as any[])?.map((a) => a.name).filter(Boolean).join(", ") || artist;
              album = t.album?.name || "";
              coverUrl = (t.album?.images as any[])?.[0]?.url || "";
            }
          } catch (e: any) { console.warn(`Spotify API track: ${e.message}`); }
        } else {
          // Fallback: parse entity from __NEXT_DATA__ if no token
          const entity = nd?.props?.pageProps?.state?.data?.entity;
          if (entity) {
            title = entity.name || title;
            artist = (entity.artists as any[])?.map((a: any) => a.name).filter(Boolean).join(", ") || artist;
            album = entity.album?.name || "";
            coverUrl = entity.coverArt?.sources?.[0]?.url || entity.album?.coverArt?.sources?.[0]?.url || "";
          }
        }

        console.log(`[SpotifyDL/POST] Serverless track: "${title}" by "${artist}"`);

        // 3. Search YouTube for the track via Invidious (to get a ytdlp:videoId URI)
        let ytVideoId: string | null = null;
        const searchQuery = artist && title ? `${artist} - ${title}` : title;
        const invidiousInstances = [
          "https://yewtu.be",
          "https://inv.zzls.xyz",
          "https://invidious.flokinet.to",
          "https://inv.riverside.rocks",
        ];
        for (const base of invidiousInstances) {
          try {
            const res = await fetch(
              `${base}/api/v1/search?q=${encodeURIComponent(searchQuery)}&type=video&fields=videoId&page=1`,
              { signal: AbortSignal.timeout(8000) }
            );
            if (res.ok) {
              const results = await res.json() as any[];
              if (Array.isArray(results) && results.length > 0 && results[0].videoId) {
                ytVideoId = results[0].videoId;
                console.log(`[SpotifyDL/POST] Found YouTube ID via Invidious (${base}): ${ytVideoId}`);
                break;
              }
            }
          } catch (e: any) { console.warn(`[SpotifyDL/POST] Invidious ${base}: ${e.message}`); }
        }

        // Use ytdlp URI if we found a YouTube ID, otherwise fall back to spotifydown
        const mediaUrl = ytVideoId
          ? `ytdlp:${ytVideoId}:bestaudio:`
          : `spotifydown:${trackId}`;

        // Return in `media` array format — the normalizer maps url → file param for spotify-download GET
        return Response.json({
          title,
          thumbnail: coverUrl,
          author: artist,
          platform: "spotify",
          media: [{
            url: mediaUrl,
            filename: `${safeName(artist)} - ${safeName(title)}.mp3`,
            quality: "High",
            type: "audio/mpeg",
          }],
        });
      },

      // ── GET: Actual audio download ────────────────────────────────────────────────────────
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const fileParam = params.get("file");
        const filename = params.get("filename") || "track.mp3";
        if (!fileParam) return jsonError("Missing file parameter");

        // A. Direct HTTP URL
        if (fileParam.startsWith("http")) {
          const res = await fetch(fileParam, {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(30000),
          }).catch((e) => { throw new Error(`Audio fetch failed: ${e.message}`); });
          if (!res.ok) return jsonError(`Upstream returned ${res.status}`, 502);
          return audioResponse(res.body, filename, res.headers.get("Content-Length"));
        }

        // B. spotifydown:{trackId} — DavidCyrilTech primary, spotifydown CDN fallback
        const sdTrackId = parseSdUri(fileParam);
        if (sdTrackId) {
          console.log(`[SpotifyDL/GET] spotifydown track: ${sdTrackId}`);

          // B1. DavidCyrilTech — try multiple Spotify endpoint variants
          const dcEndpoints = [
            `https://apis.davidcyriltech.my.id/download/spotify?url=${encodeURIComponent(`https://open.spotify.com/track/${sdTrackId}`)}`,
            `https://apis.davidcyriltech.my.id/spotify/download?url=${encodeURIComponent(`https://open.spotify.com/track/${sdTrackId}`)}`,
            `https://apis.davidcyriltech.my.id/spotify?url=${encodeURIComponent(`https://open.spotify.com/track/${sdTrackId}`)}`,
          ];
          for (const ep of dcEndpoints) {
            try {
              const res = await fetch(ep, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000) });
              if (res.ok) {
                const d = await res.json();
                const dlUrl = d?.result?.download_url || d?.result?.link || d?.result?.url || d?.link || d?.url;
                if (dlUrl) {
                  const audio = await fetch(dlUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60000) });
                  if (audio.ok) return audioResponse(audio.body, filename, audio.headers.get("Content-Length"));
                }
              }
            } catch (e: any) { console.warn(`DC Spotify ${ep.slice(0, 60)}: ${e.message}`); }
          }

          // B2. api.spotifydown.com (may be blocked on some infra, but worth trying)
          try {
            const sdRes = await fetch(`https://api.spotifydown.com/download/${sdTrackId}`, {
              headers: { origin: "https://spotifydown.com", referer: "https://spotifydown.com/", "User-Agent": "Mozilla/5.0" },
              signal: AbortSignal.timeout(20000),
            });
            if (sdRes.ok) {
              const d = await sdRes.json();
              const dlUrl = d?.link || d?.url;
              if (dlUrl) {
                const audio = await fetch(dlUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60000) });
                if (audio.ok) return audioResponse(audio.body, filename, audio.headers.get("Content-Length"));
              }
            }
          } catch (e: any) { console.warn(`SpotifyDown CDN: ${e.message}`); }

          return jsonError("Could not download this track. Please try again later.", 502);
        }

        // C. ytdlp:{videoId}:bestaudio — DavidCyrilTech YouTube-to-MP3 primary
        const videoId = parseYtUri(fileParam);
        if (!videoId) return jsonError("Invalid file parameter");

        // C1. DavidCyrilTech ytmp3
        try {
          const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
          const res = await fetch(`https://apis.davidcyriltech.my.id/download/ytmp3?url=${encodeURIComponent(ytUrl)}`, {
            headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000),
          });
          if (res.ok) {
            const d = await res.json();
            const dlUrl = d?.result?.download_url || d?.result?.downloadUrl || d?.result?.url || d?.url || d?.link;
            if (dlUrl) {
              const audio = await fetch(dlUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60000) });
              if (audio.ok) return audioResponse(audio.body, filename, audio.headers.get("Content-Length"));
            }
          }
        } catch (e: any) { console.warn(`DC ytmp3: ${e.message}`); }

        // C2. Python localhost fallback
        try {
          const dlRes = await fetch(
            `http://127.0.0.1:8001/spotify/download?file=${encodeURIComponent(fileParam)}&filename=${encodeURIComponent(filename)}`,
            { signal: request.signal }
          );
          if (dlRes.ok) return audioResponse(dlRes.body, filename, dlRes.headers.get("content-length"));
        } catch (e: any) { console.warn(`Python localhost: ${e.message}`); }

        return jsonError("Failed to download track from any source.", 500);
      },
    },
  },
});
