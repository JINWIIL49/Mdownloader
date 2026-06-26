// supabase/functions/spotify-download/index.ts
// Resolves Spotify track YouTube IDs and proxies the raw audio stream serverless-ly!

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Strategy 0: Use davidcyriltech API (fastest ytmp3 download proxy)
async function fetchViaDavidCyrilTechApi(videoId: string): Promise<string | null> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const apiUrl = `https://apis.davidcyriltech.my.id/download/ytmp3?url=${encodeURIComponent(url)}`;
  try {
    console.log(`[Spotify Edge] Trying DavidCyrilTech API: ${apiUrl}`);
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000)
    });
    if (res.ok) {
      const data = await res.json();
      const link = data?.result?.download_url || data?.result?.downloadUrl || data?.result?.url || data?.url || data?.link;
      if (link) {
        console.log(`[Spotify Edge] Resolved download link from DavidCyrilTech API: ${link}`);
        return link;
      }
    }
  } catch (e) {
    console.log(`[Spotify Edge] DavidCyrilTech API failed: ${e.message}`);
  }
  return null;
}

// Strategy 1: Use public yt-dlp API proxies
async function fetchViaYtDlpApi(videoId: string): Promise<any> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const apis = [
    `https://ytdlapi.com/api/download?url=${encodeURIComponent(url)}`,
    `https://ytdl-json-api.vercel.app/api/info?url=${encodeURIComponent(url)}`,
    `https://ytdl-python-api.vercel.app/api/info?url=${encodeURIComponent(url)}`,
  ];
  
  for (const apiUrl of apis) {
    try {
      console.log(`[Spotify Edge] Trying API: ${apiUrl}`);
      const res = await fetch(apiUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.formats || data.url) return data;
      }
    } catch (e) {
      console.log(`[Spotify Edge] API failed: ${e.message}`);
    }
  }
  return null;
}

// Strategy 2: Use Invidious instances
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
      console.log(`[Spotify Edge] Trying Invidious: ${url}`);
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
      console.log(`[Spotify Edge] Invidious ${base} failed: ${e.message}`);
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return jsonError("Method not allowed", 405);
  
  const urlObj = new URL(req.url);
  const fileParam = urlObj.searchParams.get("file");
  const filename = urlObj.searchParams.get("filename") || "track.mp3";
  
  if (!fileParam) return jsonError("Missing 'file' parameter");
  
  // Parse video ID from file parameter (e.g. ytdlp:dsnuu20RSFU:bestaudio or just dsnuu20RSFU)
  let videoId = "";
  if (fileParam.startsWith("ytdlp:")) {
    const parts = fileParam.split(":");
    if (parts.length >= 2) {
      videoId = parts[1];
    }
  } else {
    videoId = fileParam;
  }
  
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
    return jsonError("Invalid YouTube Video ID");
  }
  
  console.log(`[Spotify Edge] Servicing download for video ID: ${videoId}, filename: ${filename}`);
  
  try {
    let audioUrl = "";
    
    // Strategy 0: Try DavidCyrilTech MP3 direct API first (extremely fast & reliable)
    const directMp3Link = await fetchViaDavidCyrilTechApi(videoId);
    if (directMp3Link) {
      audioUrl = directMp3Link;
    } else {
      let formats: any[] = [];
      
      // Try Invidious
      const invidiousData = await fetchViaInvidious(videoId);
      if (invidiousData) {
        formats = [
          ...(invidiousData.formatStreams || []),
          ...(invidiousData.adaptiveFormats || [])
        ].filter((f: any) => f.url);
      }
      
      // Fallback to yt-dlp API
      if (formats.length === 0) {
        const apiData = await fetchViaYtDlpApi(videoId);
        if (apiData) {
          formats = apiData.formats?.filter((f: any) => f.url) || [];
        }
      }
      
      if (formats.length === 0) {
        throw new Error("Could not resolve format streams from any public API sources");
      }
      
      // Find best audio format
      const audioFormat = formats.find((f: any) => 
        f.type?.startsWith("audio/") || 
        f.audioQuality || 
        (f.acodec && f.acodec !== "none" && !f.vcodec)
      ) || formats.find((f: any) => f.acodec && f.acodec !== "none") || formats[0];
      
      audioUrl = audioFormat.url;
    }
    
    console.log(`[Spotify Edge] Resolved audio stream URL: ${audioUrl}`);
    
    // Fetch and proxy the audio stream
    const audioRes = await fetch(audioUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    
    if (!audioRes.ok) {
      throw new Error(`Failed to fetch audio from source: ${audioRes.statusText} (${audioRes.status})`);
    }
    
    // Stream response directly to client
    const headers = {
      ...corsHeaders,
      "Content-Type": audioRes.headers.get("Content-Type") || "audio/mpeg",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    };
    
    const contentLength = audioRes.headers.get("Content-Length");
    if (contentLength) {
      headers["Content-Length"] = contentLength;
    }
    
    return new Response(audioRes.body, { headers });
  } catch (e) {
    console.error(`[Spotify Edge] Error:`, e);
    return jsonError(`Failed to stream audio: ${e.message}`, 502);
  }
});
