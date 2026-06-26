// supabase/functions/youtube-download/index.ts
// Works in any Deno environment - no external binaries needed!
// Uses public yt-dlp API proxies as fallback

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

function safeFilename(s: string, fallback = "youtube"): string {
  return (s || "").replace(/[\\/:*?"<>|\r\n]+/g, "_").trim() || fallback;
}

function parseYouTubeId(input: string): { kind: "video" | "playlist"; id: string } | null {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    if (/^[\w-]{11}$/.test(input)) return { kind: "video", id: input };
    return null;
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = u.pathname.replace(/^\//, "").split("/")[0];
    if (/^[\w-]{11}$/.test(id)) return { kind: "video", id };
  }

  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    const list = u.searchParams.get("list");
    if (u.pathname === "/playlist" && list) return { kind: "playlist", id: list };
    const v = u.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return { kind: "video", id: v };
    const segs = u.pathname.split("/").filter(Boolean);
    const idx = segs.findIndex((s) => s === "shorts" || s === "embed" || s === "v" || s === "live");
    if (idx >= 0 && segs[idx + 1] && /^[\w-]{11}$/.test(segs[idx + 1])) {
      return { kind: "video", id: segs[idx + 1] };
    }
    if (list) return { kind: "playlist", id: list };
  }
  return null;
}

// Strategy 0: Use davidcyriltech API (extremely fast ytmp3/ytmp4 download proxy)
async function fetchViaDavidCyrilTechApi(videoId: string, mode: string): Promise<string | null> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const apiType = mode === "audio" ? "ytmp3" : "ytmp4";
  const apiUrl = `https://apis.davidcyriltech.my.id/download/${apiType}?url=${encodeURIComponent(url)}`;
  try {
    console.log(`[YouTube Edge] Trying DavidCyrilTech API: ${apiUrl}`);
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000)
    });
    if (res.ok) {
      const data = await res.json();
      const link = data?.result?.download_url || data?.result?.downloadUrl || data?.result?.url || data?.url || data?.link;
      if (link) {
        console.log(`[YouTube Edge] Resolved download link from DavidCyrilTech API: ${link}`);
        return link;
      }
    }
  } catch (e) {
    console.log(`[YouTube Edge] DavidCyrilTech API failed: ${e.message}`);
  }
  return null;
}

// Strategy 1: Use public yt-dlp API proxies (most reliable)
async function fetchViaYtDlpApi(url: string, mode: string): Promise<any> {
  // List of public yt-dlp API endpoints
  const apis = [
    `https://ytdlapi.com/api/download?url=${encodeURIComponent(url)}`,
    `https://ytdl-json-api.vercel.app/api/info?url=${encodeURIComponent(url)}`,
    `https://ytdl-python-api.vercel.app/api/info?url=${encodeURIComponent(url)}`,
  ];
  
  for (const apiUrl of apis) {
    try {
      console.log(`Trying API: ${apiUrl}`);
      const res = await fetch(apiUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.formats || data.url) return data;
      }
    } catch (e) {
      console.log(`API failed: ${e.message}`);
    }
  }
  return null;
}

// Strategy 2: Use yewtu.be (Invidious) with updated working instances
async function fetchViaInvidious(videoId: string): Promise<any> {
  const workingInstances = [
    "https://yewtu.be",
    "https://inv.zzls.xyz",
    "https://invidious.flokinet.to",
    "https://inv.riverside.rocks",
    "https://invidious.slipfox.xyz",
  ];
  
  for (const base of workingInstances) {
    try {
      const url = `${base}/api/v1/videos/${videoId}`;
      console.log(`Trying Invidious: ${url}`);
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.formatStreams?.length || data.adaptiveFormats?.length) {
          return data;
        }
      }
    } catch (e) {
      console.log(`Invidious ${base} failed: ${e.message}`);
    }
  }
  return null;
}

// Strategy 3: Direct oembed + fallback (simple)
async function fetchViaOembed(videoId: string): Promise<any> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title,
        author: data.author_name,
        thumbnail: data.thumbnail_url,
        videoId,
      };
    }
  } catch (e) {
    console.log(`Oembed failed: ${e.message}`);
  }
  return null;
}

async function handleVideo(videoId: string, mode: string) {
  console.log(`Handling video ${videoId} in mode ${mode}`);
  
  // Try DavidCyrilTech API first (Strategy 0)
  try {
    const directLink = await fetchViaDavidCyrilTechApi(videoId, mode);
    if (directLink) {
      const oembedData = await fetchViaOembed(videoId);
      const title = oembedData?.title || `youtube-${videoId}`;
      const author = oembedData?.author || null;
      const thumbnail = oembedData?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      const baseName = safeFilename(title);
      
      if (mode === "audio") {
        return {
          platform: "youtube",
          mode,
          videoId,
          title,
          author,
          thumbnail,
          media: [{
            type: "audio" as const,
            url: directLink,
            filename: `${baseName}.mp3`,
            bitrate: "128kbps",
            codec: "mp3",
            size: null
          }]
        };
      } else {
        return {
          platform: "youtube",
          mode,
          videoId,
          title,
          author,
          thumbnail,
          media: [{
            type: "video" as const,
            url: directLink,
            filename: `${baseName}-720p.mp4`,
            quality: "720p",
            codec: "h264",
            size: null
          }]
        };
      }
    }
  } catch (e) {
    console.log(`DavidCyrilTech strategy failed: ${e.message}, falling back`);
  }

  // Try Invidious first (gives direct stream URLs)
  let invidiousData = await fetchViaInvidious(videoId);
  let title = "";
  let author = "";
  let thumbnail = "";
  let formats: any[] = [];
  
  if (invidiousData) {
    console.log("Got data from Invidious");
    title = invidiousData.title;
    author = invidiousData.author;
    thumbnail = invidiousData.videoThumbnails?.find((t: any) => t.quality === "high")?.url || 
                invidiousData.videoThumbnails?.[0]?.url ||
                `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    
    // Combine progressive and adaptive formats
    formats = [
      ...(invidiousData.formatStreams || []),
      ...(invidiousData.adaptiveFormats || [])
    ].filter((f: any) => f.url);
  } else {
    // Try yt-dlp API
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const apiData = await fetchViaYtDlpApi(url, mode);
    if (apiData) {
      console.log("Got data from yt-dlp API");
      title = apiData.title;
      author = apiData.uploader || apiData.author;
      thumbnail = apiData.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      formats = apiData.formats?.filter((f: any) => f.url) || [];
    } else {
      // Last resort: try oembed for basic info + construct a generic format
      const oembedData = await fetchViaOembed(videoId);
      if (oembedData) {
        title = oembedData.title;
        author = oembedData.author;
        thumbnail = oembedData.thumbnail;
        // Construct a generic HLS/manifest URL
        const hlsManifest = `https://manifest.googlevideo.com/api/manifest/hls_variant/expire/.../${videoId}`;
        formats = [{
          url: `https://www.youtube.com/watch?v=${videoId}`,
          isManifest: true,
        }];
      } else {
        throw new Error("Could not fetch video info from any source");
      }
    }
  }
  
  const baseName = safeFilename(title || `youtube-${videoId}`);
  
  if (mode === "audio") {
    // Find best audio format
    const audioFormat = formats.find((f: any) => 
      f.type?.startsWith("audio/") || 
      f.audioQuality || 
      (f.acodec && f.acodec !== "none" && !f.vcodec)
    ) || formats.find((f: any) => f.acodec && f.acodec !== "none");
    
    if (!audioFormat) {
      throw new Error("No audio formats found");
    }
    
    let audioUrl = audioFormat.url;
    let ext = "m4a";
    if (audioFormat.type?.includes("webm")) ext = "webm";
    if (audioFormat.container === "webm") ext = "webm";
    
    return {
      platform: "youtube",
      mode,
      videoId,
      title: title || "YouTube Audio",
      author: author || null,
      thumbnail: thumbnail || null,
      media: [{
        type: "audio" as const,
        url: audioUrl,
        filename: `${baseName}.${ext}`,
        bitrate: audioFormat.bitrate ? `${audioFormat.bitrate}kbps` : null,
        codec: audioFormat.encoding || audioFormat.type?.split("codecs=")[1]?.replace(/"/g, "") || null,
        size: audioFormat.size || null,
      }]
    };
  }
  
  // Video mode: find best progressive (video+audio) or video-only
  let videoFormat = formats.find((f: any) => 
    f.type?.startsWith("video/") && f.type?.includes("audio/") && f.url
  );
  
  if (!videoFormat) {
    videoFormat = formats.find((f: any) => 
      (f.type?.startsWith("video/") || f.qualityLabel) && f.url
    );
  }
  
  if (!videoFormat) {
    throw new Error("No downloadable video streams found");
  }
  
  let videoUrl = videoFormat.url;
  let ext = "mp4";
  if (videoFormat.type?.includes("webm")) ext = "webm";
  if (videoFormat.container === "webm") ext = "webm";
  
  let quality = videoFormat.qualityLabel || videoFormat.resolution || "medium";
  
  return {
    platform: "youtube",
    mode,
    videoId,
    title: title || "YouTube Video",
    author: author || null,
    thumbnail: thumbnail || null,
    media: [{
      type: "video" as const,
      url: videoUrl,
      filename: `${baseName}-${quality}.${ext}`,
      quality,
      codec: videoFormat.encoding || videoFormat.type?.split("codecs=")[1]?.replace(/"/g, "") || null,
      size: videoFormat.size || videoFormat.contentLength || null,
    }]
  };
}

async function handlePlaylist(playlistId: string) {
  // Use Invidious for playlist
  const workingInstances = [
    "https://yewtu.be",
    "https://inv.zzls.xyz",
    "https://invidious.flokinet.to",
  ];
  
  for (const base of workingInstances) {
    try {
      const url = `${base}/api/v1/playlists/${playlistId}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const items = (data.videos || []).map((v: any) => ({
          videoId: v.videoId,
          title: v.title,
          lengthSeconds: v.lengthSeconds || null,
          thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          watchUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
        }));
        return {
          platform: "youtube",
          mode: "playlist",
          title: data.title,
          author: data.author || null,
          videoCount: data.videoCount || items.length,
          thumbnail: data.playlistThumbnail || items[0]?.thumbnail || null,
          items,
        };
      }
    } catch (e) {
      console.log(`Playlist fetch from ${base} failed: ${e.message}`);
    }
  }
  throw new Error("Could not fetch playlist from any source");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonError("Method not allowed", 405);
  
  let body: { url?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  
  const url = (body.url ?? "").trim();
  const mode = (body.mode ?? "video").toLowerCase();
  if (!url) return jsonError("Missing 'url'");
  
  const parsed = parseYouTubeId(url);
  if (!parsed) return jsonError("Could not recognise this YouTube URL");
  
  try {
    const result = (parsed.kind === "playlist" || mode === "playlist")
      ? await handlePlaylist(parsed.id)
      : await handleVideo(parsed.id, mode);
    
    // Ensure we always return a valid response
    if (!result.media || result.media.length === 0) {
      throw new Error("No media streams found");
    }
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Full error:", e);
    return jsonError(`YouTube resolve failed: ${e.message}`, 502);
  }
});
