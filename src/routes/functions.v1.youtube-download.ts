import { Innertube } from "youtubei.js";
import { createFileRoute } from "@tanstack/react-router";

async function loadNodeDependencies() {
  const isServerlessEnv =
    typeof process === "undefined" ||
    !process.versions ||
    !process.versions.node ||
    (typeof globalThis !== "undefined" && (globalThis as any).WebSocketPair !== undefined);

  if (isServerlessEnv) {
    throw new Error("Serverless environment detected (Node.js API not available)");
  }

  const [child_process, os, path, fs, stream, ffmpegStatic] = await Promise.all([
    import("child_process"),
    import("os"),
    import("path"),
    import("fs"),
    import("stream"),
    import("ffmpeg-static").catch(() => ({ default: null })),
  ]);

  if (child_process?.spawn) {
    try {
      // In unenv, calling spawn throws "not implemented yet"
      // In real Node, passing empty/invalid arguments throws a TypeError or ENOENT
      child_process.spawn("" as any);
    } catch (e: any) {
      if (e.message && (e.message.includes("unenv") || e.message.includes("not implemented yet"))) {
        throw new Error("unenv/serverless child_process mock detected");
      }
    }
  } else {
    throw new Error("child_process.spawn not available");
  }

  const ffmpegPath = typeof ffmpegStatic.default === "string" 
    ? ffmpegStatic.default 
    : (ffmpegStatic.default as any)?.default || (ffmpegStatic.default as any)?.path || ffmpegStatic.default;

  return {
    spawn: child_process.spawn,
    tmpdir: os.tmpdir,
    join: path.join,
    existsSync: fs.existsSync,
    statSync: fs.statSync,
    createReadStream: fs.createReadStream,
    createWriteStream: fs.createWriteStream,
    unlinkSync: fs.unlinkSync,
    unlink: fs.unlink,
    Readable: stream.Readable,
    ffmpegPath,
  };
}

const COMMON_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function safeFilename(name: string, fallback = "download") {
  const cleaned = (name || "").replace(/[\\/:*?"<>|\r\n]+/g, "_").trim();
  return cleaned || fallback;
}

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

// ---------- Innertube clients ----------
let ytWeb: Innertube | null = null;
let ytAndroid: Innertube | null = null;

async function getYt(client: "WEB" | "ANDROID" = "WEB") {
  if (client === "WEB") {
    if (!ytWeb) {
      ytWeb = await Innertube.create({
        generate_session_locally: true,
        client_type: "WEB",
        user_agent: COMMON_USER_AGENT,
      });
    }
    return ytWeb;
  }
  if (!ytAndroid) {
    ytAndroid = await Innertube.create({
      generate_session_locally: true,
      client_type: "ANDROID",
      user_agent: COMMON_USER_AGENT,
    });
  }
  return ytAndroid;
}

async function decipherFormats(formats: any[], yt: Innertube) {
  for (const f of formats) {
    if (typeof f.decipher === "function") {
      try {
        const url = await f.decipher(yt.session.player);
        if (url) f.url = url;
      } catch {
        /* keep existing */
      }
    }
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(id);
  }
}

async function fetchViaYtDlpApi(url: string, mode: string): Promise<any> {
  const apis = [
    `https://ytdlapi.com/api/download?url=${encodeURIComponent(url)}`,
    `https://ytdl-json-api.vercel.app/api/info?url=${encodeURIComponent(url)}`,
    `https://ytdl-python-api.vercel.app/api/info?url=${encodeURIComponent(url)}`,
  ];
  
  for (const apiUrl of apis) {
    try {
      console.log(`Trying API: ${apiUrl}`);
      const res = await fetchWithTimeout(apiUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
      }, 10000);
      if (res.ok) {
        const data = await res.json();
        if (data && (data.formats || data.url)) return data;
      }
    } catch (e: any) {
      console.log(`API failed (${apiUrl}): ${e.message}`);
    }
  }
  return null;
}

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
      const res = await fetchWithTimeout(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
      }, 8000);
      if (res.ok) {
        const data = await res.json();
        if (data && (data.formatStreams?.length || data.adaptiveFormats?.length)) {
          return { data, base };
        }
      }
    } catch (e: any) {
      console.log(`Invidious ${base} failed: ${e.message}`);
    }
  }
  return null;
}

// Extract the raw numeric itag from a format object (handles "inv_stream_137", 137, etc.)
function getRawItag(fmt: any): number | null {
  if (typeof fmt.itag === "number") return fmt.itag;
  const s = String(fmt.itag || "");
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

const INVIDIOUS_INSTANCES = [
  "https://yewtu.be",
  "https://inv.zzls.xyz",
  "https://invidious.flokinet.to",
  "https://inv.riverside.rocks",
  "https://invidious.slipfox.xyz",
];

// Try each Invidious instance's /latest_version proxy endpoint for a given itag.
// This routes the stream through the Invidious server's IP, bypassing googlevideo 429/403 blocks.
// NOTE: Uses clean browser headers — NOT YouTube-specific Referer/Origin which Invidious may reject.
async function tryInvidiousStream(videoId: string, itag: number): Promise<Response | null> {
  const cleanHeaders = new Headers({
    "User-Agent": COMMON_USER_AGENT,
    "Accept": "video/webm,video/mp4,video/*,*/*",
    "Accept-Language": "en-US,en;q=0.9",
  });
  for (const base of INVIDIOUS_INSTANCES) {
    const proxyUrl = `${base}/latest_version?id=${videoId}&itag=${itag}&local=true`;
    try {
      const res = await fetch(proxyUrl, { headers: cleanHeaders });
      if (res.ok) {
        console.log(`Invidious proxy stream succeeded: ${proxyUrl} (itag ${itag})`);
        return res;
      }
      console.warn(`Invidious proxy ${base} returned ${res.status} for itag ${itag}`);
    } catch (e: any) {
      console.warn(`Invidious proxy ${base} failed: ${e.message}`);
    }
  }
  return null;
}

async function fetchViaOembed(videoId: string): Promise<any> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetchWithTimeout(oembedUrl, {}, 5000);
    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title,
        author: data.author_name,
        thumbnail: data.thumbnail_url,
        videoId,
      };
    }
  } catch (e: any) {
    console.log(`Oembed failed: ${e.message}`);
  }
  return null;
}

async function fetchVideoInfo(videoId: string) {
  let info: any = null;
  const allFormats: any[] = [];

  const isServerlessEnv =
    typeof process === "undefined" ||
    !process.versions ||
    !process.versions.node ||
    (typeof globalThis !== "undefined" && (globalThis as any).WebSocketPair !== undefined);

  if (!isServerlessEnv) {
    // ANDROID Innertube
    try {
      const ytA = await getYt("ANDROID");
      info = await ytA.getBasicInfo(videoId, "ANDROID");
      const androidFormats = [
        ...(info.streaming_data?.formats || []),
        ...(info.streaming_data?.adaptive_formats || []),
      ];
      await decipherFormats(androidFormats, ytA);
      for (const f of androidFormats) {
        if (f.url) {
          allFormats.push({
            itag: f.itag,
            url: f.url,
            has_video: !!f.has_video,
            has_audio: !!f.has_audio,
            width: f.width,
            height: f.height,
            bitrate: f.bitrate,
            mime_type: f.mime_type || f.type,
          });
        }
      }
    } catch (e: any) {
      console.warn("ANDROID client failed:", e.message);
    }

    // WEB Innertube
    try {
      const ytW = await getYt("WEB");
      const webInfo: any = await ytW.getBasicInfo(videoId, "WEB");
      if (!info || !info.basic_info?.title) info = webInfo;

      const webFormats = [
        ...(webInfo.streaming_data?.formats || []),
        ...(webInfo.streaming_data?.adaptive_formats || []),
      ];
      await decipherFormats(webFormats, ytW);

      const existingItags = new Set(allFormats.map((f: any) => f.itag));
      for (const f of webFormats) {
        if (f.url && !existingItags.has(f.itag)) {
          allFormats.push({
            itag: f.itag,
            url: f.url,
            has_video: !!f.has_video,
            has_audio: !!f.has_audio,
            width: f.width,
            height: f.height,
            bitrate: f.bitrate,
            mime_type: f.mime_type || f.type,
          });
        }
      }
    } catch (e: any) {
      console.warn("WEB client failed:", e.message);
    }
  } else {
    console.log("Serverless mode: skipping Innertube to prevent CPU/memory timeout");
  }

  // Fallback 1: Invidious
  if (allFormats.length === 0) {
    console.log("Innertube failed, trying Invidious fallback...");
    try {
      const invidiousResult = await fetchViaInvidious(videoId);
      if (invidiousResult) {
        const { data: invidiousData, base } = invidiousResult;
        info = {
          basic_info: {
            title: invidiousData.title,
            author: invidiousData.author || "Unknown",
            thumbnail: [
              {
                url: invidiousData.videoThumbnails?.find((t: any) => t.quality === "high")?.url || 
                     invidiousData.videoThumbnails?.[0]?.url ||
                     `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
              }
            ]
          }
        };

        const formatStreams = invidiousData.formatStreams || [];
        const adaptiveFormats = invidiousData.adaptiveFormats || [];

        for (const f of formatStreams) {
          if (f.url) {
            let height = 360;
            if (f.qualityLabel) {
              height = parseInt(f.qualityLabel) || 360;
            }
            // Rewrite googlevideo.com URLs to the Invidious proxy stream endpoint
            let streamUrl = f.url;
            if (streamUrl.includes("googlevideo.com")) {
              streamUrl = `${base}/latest_version?id=${videoId}&itag=${f.itag}&local=true`;
            } else if (streamUrl.startsWith("/")) {
              streamUrl = `${base}${streamUrl}`;
            }

            allFormats.push({
              itag: `inv_stream_${f.itag || f.quality || Math.random()}`,
              url: streamUrl,
              has_video: true,
              has_audio: true,
              width: f.width || 640,
              height: f.height || height,
              bitrate: f.bitrate || 0,
              mime_type: f.type || "video/mp4",
            });
          }
        }

        for (const f of adaptiveFormats) {
          if (f.url) {
            const isVideo = f.type?.startsWith("video/") || f.qualityLabel || f.height;
            const isAudio = f.type?.startsWith("audio/");
            let height = f.height;
            if (!height && f.qualityLabel) {
              height = parseInt(f.qualityLabel);
            }
            // Rewrite googlevideo.com URLs to the Invidious proxy stream endpoint
            let streamUrl = f.url;
            if (streamUrl.includes("googlevideo.com")) {
              streamUrl = `${base}/latest_version?id=${videoId}&itag=${f.itag}&local=true`;
            } else if (streamUrl.startsWith("/")) {
              streamUrl = `${base}${streamUrl}`;
            }

            allFormats.push({
              itag: `inv_adapt_${f.itag || f.bitrate || Math.random()}`,
              url: streamUrl,
              has_video: !!isVideo,
              has_audio: !!isAudio,
              width: f.width || 0,
              height: height || 0,
              bitrate: parseInt(f.bitrate) || 0,
              mime_type: f.type || (isVideo ? "video/mp4" : "audio/mp4"),
            });
          }
        }
      }
    } catch (invidiousErr: any) {
      console.warn("Invidious fallback failed:", invidiousErr.message);
    }
  }

  // Fallback 2: Public yt-dlp API
  if (allFormats.length === 0) {
    console.log("Invidious failed, trying public yt-dlp API fallback...");
    try {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const apiData = await fetchViaYtDlpApi(url, "video");
      if (apiData) {
        info = {
          basic_info: {
            title: apiData.title,
            author: apiData.uploader || apiData.author || "Unknown",
            thumbnail: [{ url: apiData.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }]
          }
        };

        const formats = apiData.formats || [];
        for (const f of formats) {
          if (f.url) {
            const hasVideo = f.vcodec && f.vcodec !== "none";
            const hasAudio = f.acodec && f.acodec !== "none";
            allFormats.push({
              itag: f.format_id || `ytdlp_${f.itag || Math.random()}`,
              url: f.url,
              has_video: !!hasVideo,
              has_audio: !!hasAudio,
              width: f.width || 0,
              height: f.height || 0,
              bitrate: f.tbr || f.bitrate || 0,
              mime_type: f.ext ? `${hasVideo ? "video" : "audio"}/${f.ext}` : undefined,
            });
          }
        }
      }
    } catch (apiErr: any) {
      console.warn("yt-dlp API fallback failed:", apiErr.message);
    }
  }

  // Fallback 3: oembed for basic metadata
  if (!info) {
    console.log("All resolvers failed, trying oembed for basic metadata...");
    try {
      const oembedData = await fetchViaOembed(videoId);
      if (oembedData) {
        info = {
          basic_info: {
            title: oembedData.title,
            author: oembedData.author || "Unknown",
            thumbnail: [{ url: oembedData.thumbnail }]
          }
        };
        // Stub progressive format
        allFormats.push({
          itag: "oembed_fallback",
          url: `https://www.youtube.com/watch?v=${videoId}`,
          has_video: true,
          has_audio: true,
          width: 640,
          height: 360,
          bitrate: 0,
          mime_type: "video/mp4",
        });
      }
    } catch (oembedErr: any) {
      console.warn("Oembed fallback failed:", oembedErr.message);
    }
  }

  if (!info) throw new Error("Could not fetch video info from any client or fallback API");
  return { info, formats: allFormats.filter((f: any) => f.url) };
}

async function downloadDirectStream(url: string, destPath: string, onProgress: (loaded: number, total: number) => void, signal?: AbortSignal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Google Video CDN returned status ${res.status}`);
  const contentLength = Number(res.headers.get("content-length")) || 0;
  if (!res.body) throw new Error("No response body from Google Video CDN");

  const writer = createWriteStream(destPath);
  const reader = res.body.getReader();
  let loaded = 0;

  try {
    while (true) {
      if (signal?.aborted) {
        throw new Error("Download aborted");
      }
      const { done, value } = await reader.read();
      if (done) break;
      writer.write(Buffer.from(value));
      loaded += value.length;
      onProgress(loaded, contentLength);
    }
  } finally {
    writer.end();
  }
}

function selectDirectFormats(formats: any[], targetHeight: number, isAudioOnly: boolean) {
  if (isAudioOnly) {
    const audioFormats = formats.filter(f => f.has_audio && !f.has_video);
    audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    const m4aAudio = audioFormats.find(f => (f.mime_type || '').includes('audio/mp4'));
    return { videoFormat: null, audioFormat: m4aAudio || audioFormats[0] };
  }

  const videoFormats = formats.filter(f => f.has_video);
  const candidates = videoFormats.filter(f => f.height && f.height <= targetHeight);
  candidates.sort((a, b) => {
    if (b.height !== a.height) return b.height - a.height;
    return (b.bitrate || 0) - (a.bitrate || 0);
  });

  if (candidates.length === 0) {
    return { videoFormat: null, audioFormat: null };
  }

  // To prevent low-quality fallback, determine the best available resolution closest to targetHeight
  const maxAvailableHeight = candidates[0].height || 0;

  // Prioritize avc1 within the best resolution tier first, otherwise fall back to any codec (VP9/AV1) at that same resolution
  let bestVideo = candidates.find(
    f => f.height === maxAvailableHeight && 
         (f.mime_type || '').includes('video/mp4') && 
         (f.mime_type || '').includes('avc1')
  );
  if (!bestVideo) {
    bestVideo = candidates.find(f => f.height === maxAvailableHeight);
  }
  if (!bestVideo) {
    bestVideo = candidates[0];
  }

  if (bestVideo.has_audio) {
    return { videoFormat: bestVideo, audioFormat: null };
  }

  const audioFormats = formats.filter(f => f.has_audio && !f.has_video);
  audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  const m4aAudio = audioFormats.find(f => (f.mime_type || '').includes('audio/mp4'));

  return { videoFormat: bestVideo, audioFormat: m4aAudio || audioFormats[0] };
}

async function buildVideoOrShortResult(
  videoId: string,
  mode: "video" | "short" | "audio"
) {
  if (mode === "short") {
    const { info, formats } = await fetchVideoInfo(videoId);
    const title = info.basic_info?.title || "YouTube Video";
    const authorName = info.basic_info?.author || "Unknown";
    const cover =
      info.basic_info?.thumbnail?.[0]?.url ??
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    // Group by resolution (smartly map vertical/portrait dimensions to standard quality selectors)
    const resolutionMap = new Map<number, any>();
    formats
      .filter((f: any) => f.has_video)
      .forEach((f: any) => {
        const w = f.width || 0;
        const h = f.height || 0;
        let matchedRes = 0;
        if (w === 2160 || h === 2160 || w === 3840 || h === 3840) matchedRes = 2160;
        else if (w === 1440 || h === 1440 || w === 2560 || h === 2560) matchedRes = 1440;
        else if (w === 1080 || h === 1080 || w === 1920 || h === 1920) matchedRes = 1080;
        else if (w === 720 || h === 720 || w === 1280 || h === 1280) matchedRes = 720;
        else if (w === 480 || h === 480 || w === 854 || h === 854) matchedRes = 480;
        else if (w === 360 || h === 360 || w === 640 || h === 640) matchedRes = 360;

        if (!matchedRes) {
          const dim = Math.min(w, h) || h || w;
          if (dim >= 1800) matchedRes = 2160;
          else if (dim >= 1200) matchedRes = 1440;
          else if (dim >= 900) matchedRes = 1080;
          else if (dim >= 600) matchedRes = 720;
          else if (dim >= 400) matchedRes = 480;
          else if (dim >= 300) matchedRes = 360;
        }

        if (!matchedRes) return;
        const existing = resolutionMap.get(matchedRes);
        if (!existing) {
          resolutionMap.set(matchedRes, f);
        } else {
          const existProg = !!existing.has_audio;
          const newProg = !!f.has_audio;
          if (newProg && !existProg) {
            resolutionMap.set(matchedRes, f);
          } else if (newProg === existProg && (f.bitrate || 0) > (existing.bitrate || 0)) {
            resolutionMap.set(matchedRes, f);
          }
        }
      });

    const downloads: any[] = [];
    const qualities = [
      { height: 1080, label: "HD Video (1080p)" },
      { height: 720, label: "HD Video (720p)" },
      { height: 480, label: "SD Video (480p)" },
      { height: 360, label: "Low Quality (360p)" },
    ];

    for (const q of qualities) {
      // Always include all quality tiers — yt-dlp picks the best available at download time.

      // Target vertical resolutions specifically by matching shorter dimension (width) in yt-dlp format selection
      const ytdlpFormat = `bestvideo[width<=${q.height}]+bestaudio[ext=m4a]/bestvideo[width<=${q.height}]+bestaudio/bestvideo[height<=${q.height}]+bestaudio[ext=m4a]/best[width<=${q.height}]`;
      downloads.push({
        label: q.label,
        url: `ytdlp:${videoId}:${encodeURIComponent(ytdlpFormat)}`,
        filename: `${safeFilename(title)}_${q.height}p.mp4`,
        mimeType: "video/mp4",
        quality: q.height,
        hasAudio: true,
        functionName: "youtube-download",
      });
    }

    // Audio-only download — force M4A (AAC) for maximum compatibility
    downloads.push({
      label: "Audio Only (MP3 / M4A)",
      url: `ytdlp:${videoId}:${encodeURIComponent("bestaudio[ext=m4a]/bestaudio")}`,
      filename: `${safeFilename(title)}.m4a`,
      mimeType: "audio/mp4",
      quality: 0,
      hasAudio: true,
      functionName: "youtube-download",
    });

    return {
      platform: "youtube",
      id: videoId,
      sourceType: mode,
      title,
      authorName,
      cover,
      items: [
        {
          id: videoId,
          type: "video",
          title,
          downloads,
        },
      ],
    };
  }

  const { info, formats } = await fetchVideoInfo(videoId);
  const title = info.basic_info?.title || "YouTube Video";
  const authorName = info.basic_info?.author || "Unknown";
  const cover =
    info.basic_info?.thumbnail?.[0]?.url ??
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  // Group by resolution (height)
  const resolutionMap = new Map<number, any>();
  formats
    .filter((f: any) => f.has_video)
    .forEach((f: any) => {
      const h = f.height;
      if (!h) return;
      const existing = resolutionMap.get(h);
      if (!existing) {
        resolutionMap.set(h, f);
      } else {
        const existProg = !!existing.has_audio;
        const newProg = !!f.has_audio;
        if (newProg && !existProg) {
          resolutionMap.set(h, f);
        } else if (newProg === existProg && (f.bitrate || 0) > (existing.bitrate || 0)) {
          resolutionMap.set(h, f);
        }
      }
    });

  const bestAudio = formats
    .filter((f: any) => f.has_audio && !f.has_video)
    .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];

  const downloads: any[] = [];
  const qualities = [
    { height: 1080, label: "HD Video (1080p)" },
    { height: 720, label: "HD Video (720p)" },
    { height: 480, label: "SD Video (480p)" },
    { height: 360, label: "Low Quality (360p)" },
  ];

  for (const q of qualities) {
    const ytdlpFormat = `bestvideo[height<=${q.height}]+bestaudio[ext=m4a]/bestvideo[height<=${q.height}]+bestaudio/best[height<=${q.height}]`;
    downloads.push({
      label: q.label,
      url: `ytdlp:${videoId}:${encodeURIComponent(ytdlpFormat)}`,
      filename: `${safeFilename(title)}_${q.height}p.mp4`,
      mimeType: "video/mp4",
      quality: q.height,
      hasAudio: true,
      functionName: "youtube-download",
    });
  }

  // Audio-only download — force M4A (AAC) for maximum compatibility
  downloads.push({
    label: "Audio Only (MP3 / M4A)",
    url: `ytdlp:${videoId}:${encodeURIComponent("bestaudio[ext=m4a]/bestaudio")}`,
    filename: `${safeFilename(title)}.m4a`,
    mimeType: "audio/mp4",
    quality: 0,
    hasAudio: true,
    functionName: "youtube-download",
  });

  return {
    platform: "youtube",
    id: videoId,
    sourceType: mode,
    title,
    authorName,
    cover,
    items: [
      {
        id: videoId,
        type: mode === "audio" ? "audio" : "video",
        title,
        downloads,
      },
    ],
  };
}

async function buildPlaylistResult(playlistId: string) {
  let itemsList: any[] = [];
  let playlistTitle = "YouTube Playlist";
  let playlistAuthor: string | null = null;
  let playlistThumb: string | null = null;

  // ytpl
  try {
    const ytpl = await import("ytpl");
    const result = await ytpl.default(playlistId, { limit: 50 });
    playlistTitle = result.title || playlistTitle;
    playlistAuthor = result.author?.name || null;
    playlistThumb = result.bestThumbnail?.url || null;
    itemsList = result.items.map((item: any) => ({
      videoId: item.id,
      title: { text: item.title },
      thumbnails: item.bestThumbnail ? [item.bestThumbnail] : [],
    }));
  } catch (e) {
    console.warn("ytpl failed:", (e as any).message);
  }

  // Innertube ANDROID
  if (itemsList.length === 0) {
    try {
      const yt = await getYt("ANDROID");
      const playlist: any = await yt.getPlaylist(playlistId);
      playlistTitle = playlist?.info?.title || playlistTitle;
      playlistAuthor = playlist?.info?.author?.name || null;
      playlistThumb = playlist?.info?.thumbnails?.[0]?.url || null;
      const vids = playlist?.videos || playlist?.items || [];
      if (vids.length) itemsList = vids;
      else {
        const str = JSON.stringify(playlist);
        const matches = str.matchAll(/"videoId":"([\w-]{11})"/g);
        const ids = [...new Set([...matches].map((m) => m[1]))];
        itemsList = ids.map((id) => ({ videoId: id }));
      }
    } catch (e) {
      console.warn("ANDROID getPlaylist failed:", (e as any).message);
    }
  }

  // Innertube WEB
  if (itemsList.length === 0) {
    try {
      const yt = await getYt("WEB");
      const playlist: any = await yt.getPlaylist(playlistId);
      playlistTitle = playlist?.info?.title || playlistTitle;
      const vids = playlist?.videos || playlist?.items || [];
      if (vids.length) itemsList = vids;
      else {
        const str = JSON.stringify(playlist);
        const matches = str.matchAll(/"videoId":"([\w-]{11})"/g);
        const ids = [...new Set([...matches].map((m) => m[1]))];
        itemsList = ids.map((id) => ({ videoId: id }));
      }
    } catch (e) {
      console.warn("WEB getPlaylist failed:", (e as any).message);
    }
  }

  // HTTP scrape fallback
  if (itemsList.length === 0) {
    const res = await fetch(
      `https://www.youtube.com/playlist?list=${playlistId}`,
      {
        headers: {
          "User-Agent": COMMON_USER_AGENT,
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "text/html,application/xhtml+xml",
          Cookie: "CONSENT=YES+cb",
        },
      }
    );
    const html = await res.text();
    const idMatches = html.matchAll(/"videoId"\s*:\s*"([\w-]{11})"/g);
    const ids = [...new Set([...idMatches].map((m) => m[1]))];
    itemsList = ids.map((id) => ({ videoId: id }));
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    if (titleMatch)
      playlistTitle = titleMatch[1].replace(/ - YouTube$/, "").trim();
  }

  if (itemsList.length === 0)
    throw new Error("Could not find any videos in this playlist");

  const items = itemsList.slice(0, 50).map((v: any) => {
    const id = v.id || v.videoId;
    if (!id) return null;
    const title = v.title?.text || v.title?.toString?.() || `Video ${id}`;
    const thumb =
      v.thumbnails?.[0]?.url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    return {
      id,
      type: "video",
      title,
      thumbnail: thumb,
      downloads: [
        {
          label: "HD Video (1080p)",
          url: `ytdlp:${id}:${encodeURIComponent("bestvideo[height<=1080]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]")}`,
          filename: `${safeFilename(title)}_1080p.mp4`,
          mimeType: "video/mp4",
          quality: 1080,
          hasAudio: true,
          functionName: "youtube-download",
        },
        {
          label: "HD Video (720p)",
          url: `ytdlp:${id}:${encodeURIComponent("bestvideo[height<=720]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]")}`,
          filename: `${safeFilename(title)}_720p.mp4`,
          mimeType: "video/mp4",
          quality: 720,
          hasAudio: true,
          functionName: "youtube-download",
        },
        {
          label: "SD Video (480p)",
          url: `ytdlp:${id}:${encodeURIComponent("bestvideo[height<=480]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480]")}`,
          filename: `${safeFilename(title)}_480p.mp4`,
          mimeType: "video/mp4",
          quality: 480,
          hasAudio: true,
          functionName: "youtube-download",
        },
        {
          label: "Low Quality (360p)",
          url: `ytdlp:${id}:${encodeURIComponent("bestvideo[height<=360]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best[height<=360]")}`,
          filename: `${safeFilename(title)}_360p.mp4`,
          mimeType: "video/mp4",
          quality: 360,
          hasAudio: true,
          functionName: "youtube-download",
        },
        {
          label: "Audio Only (MP3 / M4A)",
          url: `ytdlp:${id}:${encodeURIComponent("bestaudio[ext=m4a]/bestaudio")}`,
          filename: `${safeFilename(title)}.m4a`,
          mimeType: "audio/mp4",
          quality: 0,
          hasAudio: true,
          functionName: "youtube-download",
        }
      ],
    };
  }).filter(Boolean);

  return {
    platform: "youtube",
    id: playlistId,
    sourceType: "playlist",
    title: playlistTitle,
    authorName: playlistAuthor,
    cover: playlistThumb ?? (items[0] as any)?.thumbnail ?? null,
    items,
  };
}

const downloadProgress = new Map<string, number>();

function getPythonBackendUrl(request?: Request): string | null {
  let envUrl = "";
  try {
    envUrl = (globalThis as any).VITE_PY_BACKEND_URL || 
             (import.meta.env ? (import.meta.env.VITE_PY_BACKEND_URL as string) : "") || 
             (typeof process !== 'undefined' && process.env ? process.env.VITE_PY_BACKEND_URL : "") ||
             (globalThis as any).process?.env?.VITE_PY_BACKEND_URL || "";
  } catch (e) {}

  if (envUrl && typeof envUrl === 'string' && envUrl.trim().startsWith('http')) {
    return envUrl.trim().replace(/\/$/, "");
  }

  // Fallback to local python backend process on port 8001
  return "http://127.0.0.1:8001";
}

// ---------- Route ----------
export const Route = createFileRoute("/functions/v1/youtube-download")({
  server: {
    handlers: {
      // GET handler: proxy the actual video stream to avoid 403
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const action = url.searchParams.get("action");
          const filename = url.searchParams.get("filename") || "video.mp4";

          if (action === "config") {
            const pyBackend = getPythonBackendUrl(request);
            return Response.json({
              pyBackendUrl: pyBackend || null
            });
          }

          if (action === "progress") {
            let pyProgress = 0;
            let pyData: any = null;
            try {
              const pyBackend = getPythonBackendUrl(request);
              if (pyBackend) {
                const progressRes = await fetch(`${pyBackend}/youtube/progress?filename=${encodeURIComponent(filename)}`);
                if (progressRes.ok) {
                  pyData = await progressRes.json();
                  pyProgress = pyData?.progress ?? 0;
                }
              }
            } catch (e) {
              console.warn("Could not check progress on Python backend, checking local:", e);
            }

            const localProgress = downloadProgress.get(filename) ?? 0;

            // If local progress is active and higher/equal, or if pyProgress is 0 but we have local progress, prioritize local
            if (localProgress > 0 && localProgress >= pyProgress) {
              return Response.json({
                progress: localProgress,
                downloaded_bytes: 0,
                total_bytes: 0
              });
            }

            if (pyData) {
              return Response.json(pyData);
            }

            return Response.json({
              progress: localProgress,
              downloaded_bytes: 0,
              total_bytes: 0
            });
          }

          const fileUrl = url.searchParams.get("file");
          if (!fileUrl) return jsonError("file parameter is required", 400);

          if (fileUrl.startsWith("mux:") || fileUrl.startsWith("ytdlp:")) {
            let pyConnected = false;
            const pyBackend = getPythonBackendUrl(request);
            if (pyBackend) {
              try {
                console.log(`Proxying download to Python backend: ${pyBackend}/youtube/download`);
                const downloadRes = await fetch(
                  `${pyBackend}/youtube/download?file=${encodeURIComponent(fileUrl)}&filename=${encodeURIComponent(filename)}`,
                  { signal: request.signal }
                );
                pyConnected = true;

                if (downloadRes.ok) {
                  return new Response(downloadRes.body, {
                    status: downloadRes.status,
                    headers: {
                      "Content-Type": downloadRes.headers.get("content-type") || "video/mp4",
                      "Content-Length": downloadRes.headers.get("content-length") || "",
                      "Content-Disposition": `attachment; filename="${filename.replace(/[^ -~]/g, "?")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
                      "Access-Control-Expose-Headers": "Content-Length",
                      "Cache-Control": "no-cache",
                    },
                  });
                } else {
                  const errText = await downloadRes.text();
                  console.warn(`Python backend download returned error ${downloadRes.status}: ${errText}. Falling back to serverless downloader.`);
                }
              } catch (e: any) {
                // If client aborted the request, return 499 directly without falling back
                if (request.signal.aborted || e.name === "AbortError") {
                  console.log("Download request aborted by client.");
                  return new Response("Cancelled", { status: 499 });
                }
                console.warn("Python backend download failed or unreachable. Falling back to serverless downloader:", e.message);
              }
            } else {
              console.log("No Python backend configured — using local Node.js downloader.");
            }

            const colonIdx = fileUrl.indexOf(":");
            const type = fileUrl.slice(0, colonIdx);
            const rest = fileUrl.slice(colonIdx + 1);
            const secondColon = rest.indexOf(":");
            const vid = rest.slice(0, secondColon);
            const rawFormat = rest.slice(secondColon + 1);
            // Decode URL-encoded format strings (e.g. bestvideo[height<=1080]+bestaudio)
            const formatArgs = decodeURIComponent(rawFormat);

            let nodeDeps;
            let isServerless = false;
            try {
              nodeDeps = await loadNodeDependencies();
            } catch (err: any) {
              isServerless = true;
            }

            const decodedVid = (vid.startsWith("http") || vid.includes("%3A")) ? decodeURIComponent(vid) : "";
            const isYouTube = !decodedVid || decodedVid.includes("youtube.com") || decodedVid.includes("youtu.be");

            if (isServerless) {
              if (isYouTube) {
                try {
                  const videoId = decodedVid ? (decodedVid.match(/(?:v=|v\/|vi\/|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/) || [])[1] : vid;
                  if (!videoId) throw new Error("Could not parse YouTube video ID");

                  console.log(`Serverless YouTube download initiated for Video ID: ${videoId}`);
                  const { info, formats } = await fetchVideoInfo(videoId);
                  const ext = filename.endsWith(".mp3") ? "mp3" : filename.endsWith(".m4a") ? "m4a" : "mp4";
                  const isAudioOnly = ext === "m4a" || ext === "mp3";

                  let targetHeight = 1080;
                  if (formatArgs.includes("height<=720") || formatArgs.includes("width<=720")) targetHeight = 720;
                  else if (formatArgs.includes("height<=480") || formatArgs.includes("width<=480")) targetHeight = 480;
                  else if (formatArgs.includes("height<=360") || formatArgs.includes("width<=360")) targetHeight = 360;

                  const { videoFormat, audioFormat } = selectDirectFormats(formats, targetHeight, isAudioOnly);
                  let selectedFormat = isAudioOnly ? audioFormat : videoFormat;
                  if (!isAudioOnly && selectedFormat && !selectedFormat.has_audio) {
                    const progressiveFormats = formats.filter(f => f.has_video && f.has_audio);
                    progressiveFormats.sort((a, b) => (b.height || 0) - (a.height || 0));
                    selectedFormat = progressiveFormats[0] || selectedFormat;
                  }

                  if (!selectedFormat || !selectedFormat.url) {
                    throw new Error("No compatible stream format found");
                  }

                  // Helper: check if a URL belongs to an Invidious instance
                  const isInvidiousUrl = (url: string) =>
                    INVIDIOUS_INSTANCES.some(inst => url.startsWith(inst));

                  // If the format URL is already an Invidious proxy URL, redirect the
                  // browser directly to it. Streaming through the Worker would hit the
                  // 30-second subrequest timeout and produce ~1 MB truncated files.
                  if (isInvidiousUrl(selectedFormat.url)) {
                    console.log(`Redirecting browser to Invidious stream: ${selectedFormat.url}`);
                    return new Response(null, {
                      status: 302,
                      headers: {
                        "Location": selectedFormat.url,
                        "Access-Control-Allow-Origin": "*",
                      },
                    });
                  }

                  const upstreamHeaders = new Headers({
                    "User-Agent": COMMON_USER_AGENT,
                    "Referer": "https://www.youtube.com/",
                    "Origin": "https://www.youtube.com",
                    "Accept": "*/*",
                  });

                  let streamRes = await fetch(selectedFormat.url, {
                    headers: upstreamHeaders,
                  });

                  if (!streamRes.ok) {
                    console.warn(`Primary format stream returned status ${streamRes.status}. Attempting progressive format fallback...`);
                    const failedUrl = selectedFormat.url;
                    const progressiveFallback = formats.filter(
                      (f: any) => f.has_video && f.has_audio && f.url && f.url !== failedUrl
                    );
                    progressiveFallback.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

                    let fallbackSuccess = false;
                    for (const fbFormat of progressiveFallback) {
                      // Invidious progressive URLs → redirect directly (no proxy timeout)
                      if (isInvidiousUrl(fbFormat.url)) {
                        console.log(`Redirecting to Invidious progressive fallback: ${fbFormat.url}`);
                        return new Response(null, {
                          status: 302,
                          headers: { "Location": fbFormat.url, "Access-Control-Allow-Origin": "*" },
                        });
                      }
                      try {
                        console.log(`Trying progressive fallback stream URL: ${fbFormat.url}`);
                        const fbRes = await fetch(fbFormat.url, { headers: upstreamHeaders });
                        if (fbRes.ok) {
                          streamRes = fbRes;
                          selectedFormat = fbFormat;
                          fallbackSuccess = true;
                          break;
                        }
                      } catch (fbErr: any) {
                        console.warn(`Fallback progressive format failed: ${fbErr.message}`);
                      }
                    }

                    if (!fallbackSuccess) {
                      // All direct YouTube CDN streams are blocked (429/403).
                      // Redirect the browser to an Invidious proxy URL — the browser
                      // downloads directly from Invidious which proxies YouTube,
                      // bypassing both the Worker timeout and the datacenter IP block.
                      console.warn("All direct streams blocked. Redirecting browser to Invidious proxy...");
                      const rawItag = getRawItag(selectedFormat);
                      // Candidate itags: prefer the original, then common progressive/adaptive ones
                      const candidateItags = rawItag
                        ? [rawItag, ...([22, 137, 248, 399, 136, 247, 18].filter(i => i !== rawItag))]
                        : [22, 137, 248, 399, 136, 247, 18];
                      // Try each Invidious instance × itag until we get a successful HEAD ping
                      let redirectUrl: string | null = null;
                      outer: for (const fbItag of candidateItags) {
                        for (const invBase of INVIDIOUS_INSTANCES) {
                          const candidate = `${invBase}/latest_version?id=${videoId}&itag=${fbItag}&local=true`;
                          try {
                            const ping = await fetch(candidate, { method: "HEAD" });
                            if (ping.ok) { redirectUrl = candidate; break outer; }
                          } catch {}
                        }
                      }
                      if (!redirectUrl) {
                        // HEAD pings failed — fall back to first instance/itag as best guess
                        const firstItag = candidateItags[0] ?? 22;
                        redirectUrl = `${INVIDIOUS_INSTANCES[0]}/latest_version?id=${videoId}&itag=${firstItag}&local=true`;
                      }
                      console.log(`Redirecting to Invidious: ${redirectUrl}`);
                      return new Response(null, {
                        status: 302,
                        headers: { "Location": redirectUrl, "Access-Control-Allow-Origin": "*" },
                      });
                    }
                  }

                  return new Response(streamRes.body, {
                    status: 200,
                    headers: {
                      "Content-Type": isAudioOnly ? (ext === "mp3" ? "audio/mpeg" : "audio/mp4") : "video/mp4",
                      "Content-Disposition": `attachment; filename="${filename.replace(/[^ -~]/g, "?")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
                      "Content-Length": streamRes.headers.get("content-length") || "",
                      "Access-Control-Expose-Headers": "Content-Length",
                      "Cache-Control": "no-cache",
                    },
                  });

                } catch (serverlessError: any) {
                  console.error("Serverless download failed:", serverlessError.message);
                  return jsonError(`Failed to process video: ${serverlessError.message}`, 500);
                }
              } else {
                return jsonError("Serverless mode only supported for YouTube downloads.", 500);
              }
            }

            const {
              spawn,
              tmpdir,
              join,
              existsSync,
              statSync,
              createReadStream,
              createWriteStream,
              unlinkSync,
              unlink,
              Readable,
              ffmpegPath,
            } = nodeDeps;

            if (!ffmpegPath) return jsonError(`ffmpeg not found to process the download`, 500);

            if (isYouTube) {
              try {
                const videoId = decodedVid ? (decodedVid.match(/(?:v=|v\/|vi\/|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/) || [])[1] : vid;
                if (!videoId) throw new Error("Could not parse YouTube video ID");

                console.log(`Direct downloader initiated for YouTube Video ID: ${videoId}`);
                downloadProgress.set(filename, 5);

                const { info, formats } = await fetchVideoInfo(videoId);
                downloadProgress.set(filename, 15);

                const ext = filename.endsWith(".mp3") ? "mp3" : filename.endsWith(".m4a") ? "m4a" : "mp4";
                const isAudioOnly = ext === "m4a" || ext === "mp3";

                // Parse target height
                let targetHeight = 1080;
                if (formatArgs.includes("height<=720") || formatArgs.includes("width<=720")) targetHeight = 720;
                else if (formatArgs.includes("height<=480") || formatArgs.includes("width<=480")) targetHeight = 480;
                else if (formatArgs.includes("height<=360") || formatArgs.includes("width<=360")) targetHeight = 360;

                const { videoFormat, audioFormat } = selectDirectFormats(formats, targetHeight, isAudioOnly);

                if (!audioFormat && !videoFormat) {
                  throw new Error("Could not find any matching video or audio formats");
                }

                const tmpVideoFile = join(tmpdir(), `yt_vid_${videoId}_${Date.now()}.tmp`);
                const tmpAudioFile = join(tmpdir(), `yt_aud_${videoId}_${Date.now()}.tmp`);
                const tmpFile = join(tmpdir(), `yt_${videoId}_${Date.now()}.${ext}`);

                let vidProgress = 0;
                let audProgress = 0;
                const updateOverallProgress = () => {
                  let overall = 15;
                  if (videoFormat && audioFormat) {
                    overall = 15 + Math.round(((vidProgress + audProgress) / 200) * 75);
                  } else {
                    overall = 15 + Math.round((Math.max(vidProgress, audProgress) / 100) * 75);
                  }
                  downloadProgress.set(filename, Math.min(overall, 90));
                };

                const downloadsToRun: Promise<void>[] = [];

                if (videoFormat) {
                  downloadsToRun.push(
                    downloadDirectStream(videoFormat.url, tmpVideoFile, (loaded, total) => {
                      vidProgress = total ? Math.round((loaded / total) * 100) : 50;
                      updateOverallProgress();
                    }, request.signal)
                  );
                }

                if (audioFormat) {
                  downloadsToRun.push(
                    downloadDirectStream(audioFormat.url, tmpAudioFile, (loaded, total) => {
                      audProgress = total ? Math.round((loaded / total) * 100) : 50;
                      updateOverallProgress();
                    }, request.signal)
                  );
                }

                await Promise.all(downloadsToRun);
                downloadProgress.set(filename, 92);

                const ffmpegArgs: string[] = [];
                if (videoFormat && audioFormat) {
                  ffmpegArgs.push("-y", "-i", tmpVideoFile, "-i", tmpAudioFile, "-c:v", "copy", "-c:a", "copy", tmpFile);
                } else if (videoFormat) {
                  ffmpegArgs.push("-y", "-i", tmpVideoFile, "-c:v", "copy", "-c:a", "copy", tmpFile);
                } else if (audioFormat) {
                  ffmpegArgs.push("-y", "-i", tmpAudioFile, "-c:a", "copy", tmpFile);
                }

                console.log(`Running ffmpeg direct merge: ${ffmpegPath} ${ffmpegArgs.join(" ")}`);
                await new Promise((resolve, reject) => {
                  const ffmpegProc = spawn(ffmpegPath, ffmpegArgs);
                  request.signal.addEventListener("abort", () => {
                    ffmpegProc.kill();
                    try { unlinkSync(tmpVideoFile); } catch {}
                    try { unlinkSync(tmpAudioFile); } catch {}
                    try { unlinkSync(tmpFile); } catch {}
                  });
                  ffmpegProc.on("close", (code) => {
                    try { unlinkSync(tmpVideoFile); } catch {}
                    try { unlinkSync(tmpAudioFile); } catch {}

                    if (code === 0) resolve(true);
                    else reject(new Error(`ffmpeg exited with code ${code}`));
                  });
                  ffmpegProc.on("error", (err) => {
                    try { unlinkSync(tmpVideoFile); } catch {}
                    try { unlinkSync(tmpAudioFile); } catch {}
                    reject(err);
                  });
                });

                downloadProgress.set(filename, 99);

                if (!existsSync(tmpFile)) {
                  throw new Error("File was not successfully generated by direct merger.");
                }

                const stat = statSync(tmpFile);
                const nodeStream = createReadStream(tmpFile);
                nodeStream.on("close", () => { unlink(tmpFile, () => { }); });
                const webStream = Readable.toWeb(nodeStream);

                downloadProgress.delete(filename);

                return new Response(webStream as any, {
                  status: 200,
                  headers: {
                    "Content-Type": ext === "mp3" ? "audio/mpeg" : ext === "m4a" ? "audio/mp4" : "video/mp4",
                    "Content-Disposition": `attachment; filename="${filename.replace(/[^ -~]/g, "?")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
                    "Content-Length": stat.size.toString(),
                    "Access-Control-Expose-Headers": "Content-Length",
                    "Cache-Control": "no-cache",
                  },
                });

              } catch (directError: any) {
                console.error("Direct Innertube downloader failed, falling back to yt-dlp:", directError.message);
              }
            }

            const targetUrl = decodedVid || `https://www.youtube.com/watch?v=${vid}`;
            const ext = filename.endsWith(".mp3") ? "mp3" : filename.endsWith(".m4a") ? "m4a" : "mp4";
            const fileId = decodedVid ? `ext_${Date.now()}` : vid;
            const tmpFile = join(tmpdir(), `yt_${fileId}_${Date.now()}.${ext}`);

            const isAudioOnly = ext === "m4a" || ext === "mp3";
            const isWebpageUrl = !!decodedVid && (
              decodedVid.includes("instagram.com") ||
              decodedVid.includes("instagr.am") ||
              decodedVid.includes("youtube.com") ||
              decodedVid.includes("youtu.be") ||
              decodedVid.includes("facebook.com") ||
              decodedVid.includes("fb.watch") ||
              decodedVid.includes("tiktok.com") ||
              decodedVid.includes("linkedin.com")
            );
            const isDirectUrl = !!decodedVid && (decodedVid.startsWith("http") || decodedVid.startsWith("https")) && !isWebpageUrl;
            const formatToUse = isDirectUrl ? "best" : formatArgs;

            const ytArgs = isAudioOnly
              ? [
                "-m", "yt_dlp",
                "-f", formatToUse,
                "-x",
                "--audio-format", ext,
                "--audio-quality", "0",
                "--ffmpeg-location", ffmpegPath,
                "--concurrent-fragments", "16",
                "--js-runtimes", "node",
                "--buffer-size", "1024K",
                "-o", tmpFile,
                targetUrl
              ]
              : [
                "-m", "yt_dlp",
                "-f", formatToUse,
                "--merge-output-format", ext,
                "--ffmpeg-location", ffmpegPath,
                "--concurrent-fragments", "16",
                "--js-runtimes", "node",
                "--buffer-size", "1024K",
                "-o", tmpFile,
                targetUrl
              ];

            const ytProcess = spawn("python", ytArgs);
            
            downloadProgress.set(filename, 0);

            ytProcess.stdout?.on("data", (chunk) => {
              const str = chunk.toString();
              const match = str.match(/\[download\]\s+(\d+\.\d+)%/);
              if (match) {
                const percent = parseFloat(match[1]);
                downloadProgress.set(filename, Math.round(percent));
              } else if (str.includes("[Merger]") || str.includes("Merging formats")) {
                downloadProgress.set(filename, 99);
              }
            });

            ytProcess.stderr?.on("data", (chunk) => {
              const str = chunk.toString();
              const match = str.match(/\[download\]\s+(\d+\.\d+)%/);
              if (match) {
                const percent = parseFloat(match[1]);
                downloadProgress.set(filename, Math.round(percent));
              }
            });

            request.signal.addEventListener("abort", () => {
              ytProcess.kill();
              downloadProgress.delete(filename);
              try { unlinkSync(tmpFile); } catch (e) { }
            });

            try {
              await new Promise((resolve, reject) => {
                ytProcess.on("close", (code) => {
                  downloadProgress.delete(filename);
                  if (code === 0) resolve(true);
                  else reject(new Error(`yt-dlp exited with code ${code}`));
                });
                ytProcess.on("error", (err) => {
                  downloadProgress.delete(filename);
                  reject(err);
                });
              });
            } catch (err: any) {
              downloadProgress.delete(filename);
              try { unlinkSync(tmpFile); } catch (e) { }
              return jsonError(`Failed to process video: ${err.message}`, 500);
            }

            if (!existsSync(tmpFile)) {
              return jsonError("File was not successfully generated.", 500);
            }

            const stat = statSync(tmpFile);
            const nodeStream = createReadStream(tmpFile);
            nodeStream.on("close", () => { unlink(tmpFile, () => { }); });
            const webStream = Readable.toWeb(nodeStream);

            return new Response(webStream as any, {
              status: 200,
              headers: {
                "Content-Type": filename.endsWith(".mp3") ? "audio/mpeg" : filename.endsWith(".m4a") ? "audio/mp4" : "video/mp4",
                "Content-Disposition": `attachment; filename="${filename.replace(/[^ -~]/g, "?")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
                "Content-Length": stat.size.toString(),
                "Access-Control-Expose-Headers": "Content-Length",
                "Cache-Control": "no-cache",
              },
            });
          }

          // Only allow known YouTube CDN domains
          if (!fileUrl.includes("googlevideo.com") && !fileUrl.includes("youtube.com")) {
            return jsonError("Invalid download URL", 400);
          }

          const upstreamHeaders = new Headers({
            "User-Agent": COMMON_USER_AGENT,
            "Referer": "https://www.youtube.com/",
            "Origin": "https://www.youtube.com",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept": "video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8",
            "Sec-Fetch-Dest": "video",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "cross-site",
            "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Connection": "keep-alive"
          });

          const range = request.headers.get("range");
          if (range) upstreamHeaders.set("Range", range);

          // Fetch the stream with correct headers
          let response = await fetch(fileUrl, {
            headers: upstreamHeaders,
            redirect: "follow"
          });

          if (!response.ok) {
            console.warn(`YouTube stream fetch error: ${response.status}. Attempting to resolve video ID directly.`);
            try {
              const urlObj = new URL(fileUrl);
              const videoId = urlObj.searchParams.get("videoId");
              if (videoId) {
                console.log(`Resolving fallback stream directly for Video ID: ${videoId}`);
                const { info, formats } = await fetchVideoInfo(videoId);
                const ext = filename.endsWith(".mp3") ? "mp3" : filename.endsWith(".m4a") ? "m4a" : "mp4";
                const isAudioOnly = ext === "m4a" || ext === "mp3";

                let targetHeight = 1080;
                if (filename.includes("720p")) targetHeight = 720;
                else if (filename.includes("480p")) targetHeight = 480;
                else if (filename.includes("360p")) targetHeight = 360;

                const { videoFormat, audioFormat } = selectDirectFormats(formats, targetHeight, isAudioOnly);
                let selectedFormat = isAudioOnly ? audioFormat : videoFormat;
                if (!isAudioOnly && selectedFormat && !selectedFormat.has_audio) {
                  const progressiveFormats = formats.filter(f => f.has_video && f.has_audio);
                  progressiveFormats.sort((a, b) => (b.height || 0) - (a.height || 0));
                  selectedFormat = progressiveFormats[0] || selectedFormat;
                }

                if (selectedFormat && selectedFormat.url) {
                  console.log(`Resolved fresh format URL on Worker's IP.`);
                  response = await fetch(selectedFormat.url, {
                    headers: upstreamHeaders,
                    redirect: "follow"
                  });
                }
              }
            } catch (resolveErr: any) {
              console.error("Failed to resolve backup stream:", resolveErr.message);
            }
          }

          if (!response.ok) {
            console.error(`YouTube stream fetch error after fallback: ${response.status}`);
            return jsonError("Failed to fetch video stream", 502);
          }

          return new Response(response.body, {
            status: response.status,
            headers: {
              "Content-Type": response.headers.get("content-type") || "video/mp4",
              "Content-Length": response.headers.get("content-length") || "",
              "Content-Disposition": `attachment; filename="${filename.replace(/[^ -~]/g, "?")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
              "Access-Control-Expose-Headers": "Content-Length",
              "Accept-Ranges": "bytes",
              "Cache-Control": "no-cache",
            },
          });
        } catch (e: any) {
          console.error("YouTube GET error:", e);
          return jsonError(e.message || "Internal server error", 500);
        }
      },

      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { url, mode: modeRaw, action, video_id, filename } = body;

          // ── Cancel action: kill a running yt-dlp download ──────────────────
          if (action === 'cancel') {
            try {
              const pyBackend = getPythonBackendUrl(request);
              if (pyBackend) {
                const cancelRes = await fetch(`${pyBackend}/youtube/cancel`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ video_id, filename }),
                });
                const result = cancelRes.ok ? await cancelRes.json() : { cancelled: false };
                return Response.json(result);
              }
            } catch (e: any) {
              console.warn('Cancel proxy failed:', e.message);
            }
            return Response.json({ cancelled: false });
          }

          if (!url) return jsonError("URL is required");

          // 1. Try Python backend first for metadata extraction (if configured/local)
          try {
            const pyBackend = getPythonBackendUrl(request);
            if (pyBackend) {
              console.log(`Proxying metadata request to Python backend: ${pyBackend}/youtube/info`);
              const infoRes = await fetch(`${pyBackend}/youtube/info`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url, mode: modeRaw }),
              });
              if (infoRes.ok) {
                const data = await infoRes.json();
                return Response.json(data);
              } else {
                const errText = await infoRes.text();
                console.warn(`Python backend info failed with status ${infoRes.status}: ${errText}. Falling back to local resolution.`);
              }
            } else {
              console.log("No Python backend configured — trying local Worker resolution.");
            }
          } catch (e: any) {
            console.warn("Python backend info proxy failed, trying local Worker resolution:", e.message);
          }

          // 2. Try local Worker resolution (Invidious, yt-dlp API, Innertube fallbacks)
          // This returns all DASH formats (1080p, 720p, etc.) and allows streaming bound to the Worker's IP.
          const isPlaylist = url.includes("list=");
          let localSuccess = false;
          let localData: any = null;

          try {
            if (isPlaylist && modeRaw !== "video" && modeRaw !== "short") {
              const plMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
              const plId = plMatch?.[1];
              if (!plId) throw new Error("Could not parse playlist ID");
              console.log(`Resolving playlist locally: ${plId}`);
              localData = await buildPlaylistResult(plId);
              localSuccess = true;
            } else {
              const vidMatch = url.match(
                /(?:v=|v\/|vi\/|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/
              );
              const videoId = vidMatch?.[1];
              if (!videoId) throw new Error("Could not parse YouTube video ID");
              const mode = modeRaw === "audio" ? "audio" : modeRaw === "short" ? "short" : "video";
              console.log(`Resolving video locally: ${videoId} (${mode})`);
              localData = await buildVideoOrShortResult(videoId, mode);
              localSuccess = true;
            }
          } catch (localErr: any) {
            console.warn("Local Worker resolution failed:", localErr.message);
          }

          if (localSuccess && localData) {
            return Response.json(localData);
          }

          // 3. Try hosted Supabase function next (last resort fallback)
          try {
            const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kZWFpenp3aWpibmFyenFybGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTI5NjksImV4cCI6MjA5MjM4ODk2OX0.QqjYI5_Zzr7jTceLxH7lWY5nJGBHOLoS3WkNQ5Lgpdo";
            console.log(`Trying hosted Supabase YouTube function for URL: ${url}`);
            const supaRes = await fetch("https://mdeaizzwijbnarzqrlbh.supabase.co/functions/v1/youtube-download", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${key}`
              },
              body: JSON.stringify({ url, mode: modeRaw })
            });
            if (supaRes.ok) {
              const data = await supaRes.json();
              if (data && !data.error) {
                return Response.json(data);
              }
            } else {
              const errText = await supaRes.text();
              console.warn(`Supabase YouTube function returned status ${supaRes.status}: ${errText}`);
            }
          } catch (supaErr: any) {
            console.warn("Supabase YouTube function failed:", supaErr.message);
          }

          return jsonError("Failed to resolve YouTube media from any backend or local fallback.", 500);
        } catch (e: any) {
          console.error("YouTube POST error:", e);
          return jsonError(e.message || "Internal server error", 500);
        }
      },
    },
  },
});
