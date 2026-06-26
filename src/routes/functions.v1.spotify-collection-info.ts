import { createFileRoute } from "@tanstack/react-router";

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function safeName(s: string) {
  return (s || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim() || "Unknown";
}

function parseSpotifyUrl(url: string): { type: string; id: string } | null {
  let m = url.match(/open\.spotify\.com\/(?:[a-z]{2}\/)?playlist\/([A-Za-z0-9]+)/i);
  if (m) return { type: "playlist", id: m[1] };
  m = url.match(/open\.spotify\.com\/(?:[a-z]{2}\/)?album\/([A-Za-z0-9]+)/i);
  if (m) return { type: "album", id: m[1] };
  m = url.match(/open\.spotify\.com\/(?:[a-z]{2}\/)?track\/([A-Za-z0-9]+)/i);
  if (m) return { type: "track", id: m[1] };
  m = url.match(/spotify:track:([A-Za-z0-9]+)/);
  if (m) return { type: "track", id: m[1] };
  if (/open\.spotify\.com\/collection\/tracks/i.test(url)) return { type: "collection_tracks", id: "liked" };
  return null;
}

const EMBED_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Get Spotify anonymous access token — three methods in order:
 * 1. open.spotify.com/get_access_token  (no cookies needed for anonymous token)
 * 2. __NEXT_DATA__ in embed page (multiple JSON paths)
 * 3. Regex search the entire embed HTML for a BQ... token
 */
async function getSpotifyToken(type: string, id: string): Promise<string | null> {
  // Method 1 — direct anonymous token endpoint
  try {
    const r = await fetch("https://open.spotify.com/get_access_token?reason=transport&productType=web_player", {
      headers: {
        "User-Agent": EMBED_UA,
        "Accept": "application/json",
        "Referer": "https://open.spotify.com/",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) {
      const d = await r.json();
      if (d?.accessToken) { console.log("[Token] Method 1 (get_access_token)"); return d.accessToken; }
    }
  } catch (e: any) { console.warn(`Token M1: ${e.message}`); }

  // Method 2 — embed page __NEXT_DATA__ + regex fallback
  try {
    const r = await fetch(`https://open.spotify.com/embed/${type}/${id}?utm_source=generator`, {
      headers: { "User-Agent": EMBED_UA, "Accept": "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(15000),
    });
    if (r.ok) {
      const html = await r.text();
      // Try structured __NEXT_DATA__ paths first
      const ndMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (ndMatch) {
        const nd = JSON.parse(ndMatch[1]);
        const t = nd?.props?.pageProps?.accessToken
          || nd?.props?.pageProps?.serverAccessToken
          || nd?.props?.pageProps?.session?.accessToken
          || nd?.props?.accessToken;
        if (t) { console.log("[Token] Method 2a (__NEXT_DATA__)"); return t; }
      }
      // Regex search for any BQ... token in the HTML
      const rx = html.match(/"accessToken"\s*:\s*"(BQ[A-Za-z0-9._\-]{50,})"/); 
      if (rx) { console.log("[Token] Method 2b (HTML regex)"); return rx[1]; }
    }
  } catch (e: any) { console.warn(`Token M2: ${e.message}`); }

  // Method 3 — main Spotify web player page
  try {
    const r = await fetch("https://open.spotify.com/", {
      headers: { "User-Agent": EMBED_UA, "Accept": "text/html" },
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) {
      const html = await r.text();
      const rx = html.match(/"accessToken"\s*:\s*"(BQ[A-Za-z0-9._\-]{50,})"/);  
      if (rx) { console.log("[Token] Method 3 (main page)"); return rx[1]; }
    }
  } catch (e: any) { console.warn(`Token M3: ${e.message}`); }

  return null;
}

/** Fetch all playlist tracks (handles Spotify pagination) */
async function fetchPlaylistTracks(playlistId: string, token: string) {
  let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&market=US`;
  const tracks: any[] = [];
  let pages = 0;
  while (url && pages < 20 && tracks.length < 1000) {
    pages++;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) { console.warn(`Playlist tracks page ${pages}: ${res.status}`); break; }
    const data = await res.json();
    for (const item of data.items ?? []) {
      if (item?.track?.id) tracks.push(item.track);
    }
    url = data.next ?? null;
  }
  return tracks;
}

/** Fetch album metadata + all track items */
async function fetchAlbumData(albumId: string, token: string) {
  const albumRes = await fetch(`https://api.spotify.com/v1/albums/${albumId}?market=US`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
  });
  if (!albumRes.ok) throw new Error(`Album API ${albumRes.status}`);
  const album = await albumRes.json();

  const tracks: any[] = [];
  let url: string | null = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50&market=US`;
  let pages = 0;
  while (url && pages < 10) {
    pages++;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) break;
    const data = await res.json();
    for (const item of data.items ?? []) {
      if (item?.id) tracks.push({ ...item, _albumImages: album.images, _albumName: album.name });
    }
    url = data.next ?? null;
  }
  return { album, tracks };
}

/** Build a pre-normalized MediaItem (matches isMediaItemLike → {id: string, downloads: Array}) */
function toMediaItem(idx: number, trackId: string, title: string, artist: string, albumName: string, thumb: string) {
  return {
    id: `spotify-audio-${idx}`,
    type: "audio" as const,
    title: `${title} — ${artist}`,
    description: albumName || null,
    thumbnail: thumb || null,
    downloads: [{
      label: "High Quality MP3",
      // url here is the `file` parameter passed to GET /functions/v1/spotify-download
      url: `spotifydown:${trackId}`,
      filename: `${safeName(artist)} - ${safeName(title)}.mp3`,
      functionName: "spotify-download",
      quality: "High",
      mimeType: "audio/mpeg",
    }],
  };
}

export const Route = createFileRoute("/functions/v1/spotify-collection-info")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { url?: string; mode?: string } = {};
        try { body = await request.json(); } catch { return jsonError("Invalid JSON body"); }
        const { url } = body;
        if (!url) return jsonError("Missing url");

        const parsed = parseSpotifyUrl(url);
        if (!parsed) return jsonError("Could not parse Spotify URL — expected playlist, album, or track link.");
        const { type, id } = parsed;

        if (type === "collection_tracks") {
          return jsonError("Liked Songs requires Spotify login and cannot be accessed publicly. Try a public playlist or album URL.", 403);
        }

        // ── 1. Try Python backend at localhost (best quality, cover art, yt-dlp) ─────────
        for (const base of ["http://127.0.0.1:8001", "http://127.0.0.1:8000"]) {
          try {
            const pyRes = await fetch(`${base}/spotify/collection-info`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url, mode: body.mode }),
              signal: AbortSignal.timeout(90000),
            });
            if (pyRes.ok) {
              const d = await pyRes.json();
              if (d?.items?.length) {
                console.log(`[CollectionInfo] Python @ ${base}: ${d.items.length} tracks`);
                return Response.json(d);
              }
            }
          } catch (e: any) { console.warn(`Python @ ${base}: ${e.message}`); }
        }

        // ── 2. Serverless: anonymous Spotify token → official Spotify Web API ─────────────
        console.log(`[CollectionInfo] Getting Spotify token via embed (${type}/${id})`);
        const token = await getSpotifyToken(type, id);

        if (!token) {
          return jsonError("Could not obtain Spotify access token. The playlist/album may be private.", 502);
        }

        let collectionName = "Collection", collectionCover = "", collectionArtist = "";
        let items: ReturnType<typeof toMediaItem>[] = [];

        if (type === "playlist") {
          // Get playlist metadata
          try {
            const metaRes = await fetch(`https://api.spotify.com/v1/playlists/${id}?fields=name,images,owner.display_name&market=US`, {
              headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
            });
            if (metaRes.ok) {
              const meta = await metaRes.json();
              collectionName = meta.name || collectionName;
              collectionCover = meta.images?.[0]?.url || "";
              collectionArtist = meta.owner?.display_name || "";
            }
          } catch (e: any) { console.warn(`Playlist meta: ${e.message}`); }

          const tracks = await fetchPlaylistTracks(id, token);
          items = tracks.map((t, i) =>
            toMediaItem(
              i,
              t.id,
              t.name || "Unknown",
              (t.artists as any[])?.map((a) => a.name).filter(Boolean).join(", ") || "Unknown",
              t.album?.name || collectionName,
              (t.album?.images as any[])?.[0]?.url || collectionCover,
            )
          );

        } else if (type === "album") {
          const { album, tracks } = await fetchAlbumData(id, token);
          collectionName = album.name || collectionName;
          collectionCover = (album.images as any[])?.[0]?.url || "";
          collectionArtist = (album.artists as any[])?.map((a: any) => a.name).filter(Boolean).join(", ") || "";

          items = tracks.map((t, i) =>
            toMediaItem(
              i,
              t.id,
              t.name || "Unknown",
              (t.artists as any[])?.map((a) => a.name).filter(Boolean).join(", ") || collectionArtist,
              t._albumName || collectionName,
              (t._albumImages as any[])?.[0]?.url || collectionCover,
            )
          );
        }

        if (!items.length) {
          return jsonError("No tracks found. The playlist/album may be empty or private.");
        }

        console.log(`[CollectionInfo] Spotify API returned ${items.length} tracks`);
        return Response.json({
          title: collectionName,
          thumbnail: collectionCover,
          author: collectionArtist,
          platform: "spotify",
          items,
        });
      },

      OPTIONS: async () => new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }),
    },
  },
});
