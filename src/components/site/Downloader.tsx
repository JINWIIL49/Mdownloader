import { useState, useEffect } from "react";
import { Clipboard, Crown, Download, Images, Loader2, Music, Sparkles, Video } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { invokePublicFunction } from "@/lib/public-functions";
import { downloadSlideshowZip, triggerDownload } from "@/lib/download";
import { buildHistoryEntry } from "@/lib/history";
import { applyPattern, DEFAULT_PATTERN } from "@/lib/filename-pattern";
import { resolveInputUrl } from "@/lib/url-resolution";
import { useDownloadHistory } from "@/hooks/use-download-history";
import { useDownloadLimit } from "@/hooks/use-download-limit";
import { PlatformRouteLinks } from "@/components/site/PlatformRouteLinks";

interface VideoResult {
  title: string;
  cover: string | null;
  duration: number | null;
  type?: "video" | "slideshow";
  images?: string[];
  author: { nickname: string; unique_id: string; avatar: string | null };
  stats: { plays: number; likes: number; comments: number; shares: number };
  downloads: {
    no_watermark: string | null;
    no_watermark_hd: string | null;
    watermark: string | null;
    music: string | null;
  };
}

const formatNum = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

export const Downloader = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VideoResult | null>(null);
  const [pattern, setPattern] = useState<string>(DEFAULT_PATTERN);
  const [openDropdown, setOpenDropdown] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<{ label: string; url: string; key: string; file: string } | null>(null);
  
  // Set default selected video when result changes
  useEffect(() => {
    if (result) {
      if (result.downloads.no_watermark_hd) setSelectedVideo({ label: "Ultra HD (HEVC) - No Watermark", url: result.downloads.no_watermark_hd, key: "no_watermark_hd", file: "video-hd" });
      else if (result.downloads.no_watermark) setSelectedVideo({ label: "HD Quality - No Watermark", url: result.downloads.no_watermark, key: "no_watermark", file: "video" });
      else if (result.downloads.watermark) setSelectedVideo({ label: "Standard Quality - With Watermark", url: result.downloads.watermark, key: "watermark", file: "video-wm" });
      else setSelectedVideo(null);
    }
  }, [result]);

  const { add: addToHistory } = useDownloadHistory();
  const isPro = false;
  const { remaining, canDownload, used, limit, increment } = useDownloadLimit(isPro);

  const guardedDownload = (fn: () => void | Promise<void>) => {
    if (!canDownload) {
      toast.error(`Daily limit reached (${limit}/day). Upgrade to Pro for unlimited downloads.`);
      return;
    }
    increment();
    void fn();
  };

  const tkName = (type: string, original: string, index = 1) =>
    applyPattern(pattern || DEFAULT_PATTERN, {
      username: result?.author.unique_id ?? "tiktok",
      type,
      index,
      original,
      title: result?.title || "tiktok",
    });

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        toast.success("Pasted from clipboard");
      }
    } catch {
      toast.error("Cannot access clipboard");
    }
  };

  const fetchTikTokDirectly = async (targetUrl: string): Promise<VideoResult> => {
    const clientRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`);
    if (!clientRes.ok) {
      throw new Error(`TikTok API request failed (HTTP ${clientRes.status})`);
    }
    const clientPayload = await clientRes.json();
    if (clientPayload.code !== 0 || !clientPayload.data) {
      throw new Error(clientPayload.msg || "Failed to parse TikTok video details from TikWM.");
    }
    const d = clientPayload.data;
    return {
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error(
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-foreground text-sm">No URL entered</span>
          <span className="text-xs text-muted-foreground font-medium opacity-80">
            Paste a TikTok URL to get started
          </span>
        </div>
      );
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const resolvedInput = await resolveInputUrl(trimmed);
      const isTikTok = /(?:tiktok\.com|tikwm\.com|douyin\.com)/i.test(resolvedInput.url);
      const isTiny = /https?:\/\/(?:www\.)?(?:tinyurl\.com|tiny\.one)\//i.test(trimmed);
      if (!isTikTok && !isTiny) {
        toast.error(
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-foreground text-sm">Not a TikTok URL</span>
            <span className="text-xs text-muted-foreground font-medium opacity-80">
              Expected: tiktok.com/@user/video/… or vm.tiktok.com/…
            </span>
          </div>
        );
        setLoading(false);
        return;
      }
      let payload: VideoResult;

      try {
        const res = await invokePublicFunction<any>("tiktok-download", {
          url: resolvedInput.url,
        });

        if (res && res.fallback_client_fetch) {
          console.log("Worker rate limit hit, fetching directly in browser...");
          payload = await fetchTikTokDirectly(res.url || resolvedInput.url);
        } else {
          payload = res;
        }
      } catch (err) {
        console.warn("Worker fetch failed, falling back to direct browser fetch:", err);
        payload = await fetchTikTokDirectly(resolvedInput.url);
      }

      setResult(payload);

      addToHistory(
        buildHistoryEntry(resolvedInput.url, {
          platform: "tiktok",
          sourceType: payload.type ?? "video",
          title: payload.title,
          caption: null,
          username: payload.author.unique_id,
          authorName: payload.author.nickname,
          profilePic: payload.author.avatar,
          cover: payload.cover,
          items: [
            ...(payload.type === "slideshow" && payload.images?.length
              ? [
                  {
                    id: "slideshow",
                    type: "image" as const,
                    title: "Slideshow images",
                    thumbnail: payload.cover,
                    downloads: payload.images.map((image, index) => ({
                      label: `Image ${index + 1}`,
                      url: image,
                      filename: `${String(index + 1).padStart(2, "0")}.jpg`,
                      functionName: "tiktok-download",
                    })),
                  },
                ]
              : []),
            ...(payload.downloads.no_watermark
              ? [
                  {
                    id: "video",
                    type: "video" as const,
                    title: "No watermark video",
                    thumbnail: payload.cover,
                    downloads: [
                      {
                        label: "Video",
                        url: payload.downloads.no_watermark,
                        filename: `${payload.author.unique_id || "tiktok"}.mp4`,
                        functionName: "tiktok-download",
                      },
                      ...(payload.downloads.no_watermark_hd
                        ? [
                            {
                              label: "HD video",
                              url: payload.downloads.no_watermark_hd,
                              filename: `${payload.author.unique_id || "tiktok"}-hd.mp4`,
                              functionName: "tiktok-download",
                            },
                          ]
                        : []),
                      ...(payload.downloads.watermark
                        ? [
                            {
                              label: "With watermark",
                              url: payload.downloads.watermark,
                              filename: `${payload.author.unique_id || "tiktok"}-wm.mp4`,
                              functionName: "tiktok-download",
                            },
                          ]
                        : []),
                    ],
                  },
                ]
              : []),
            ...(payload.downloads.music
              ? [
                  {
                    id: "audio",
                    type: "audio" as const,
                    title: "Audio",
                    thumbnail: payload.cover,
                    downloads: [
                      {
                        label: "MP3 audio",
                        url: payload.downloads.music,
                        filename: `${payload.author.unique_id || "tiktok"}.mp3`,
                        functionName: "tiktok-download",
                      },
                    ],
                  },
                ]
              : []),
          ],
        }),
      );

      toast.success(
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-sm">Media Ready</span>
            {resolvedInput.resolved ? (
              <span className="px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-bold text-[9px] uppercase tracking-wider border border-blue-500/20">Resolved</span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 font-bold text-[9px] uppercase tracking-wider border border-indigo-500/20">Ready</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground font-medium opacity-80">
            {resolvedInput.resolved ? "TinyURL resolved and video ready to download!" : "Video ready to download!"}
          </span>
        </div>
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch video";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="downloader" className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-soft" />
      <div className="absolute -top-24 left-1/2 -z-10 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

      <div className="container py-16 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Free - No watermark - HD quality
          </span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
            Download TikTok videos <span className="text-gradient">without watermark</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            Paste any TikTok link and instantly save videos in HD quality, with or without watermark, or as MP3 audio.
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-5xl">
          <PlatformRouteLinks current="tiktok" compact />
        </div>

        <form onSubmit={handleSubmit} className="mx-auto mt-10 max-w-2xl">
          <Card className="flex flex-col gap-3 p-3 shadow-elegant sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste TikTok video link here..."
                className="h-12 border-0 bg-transparent pr-24 text-base shadow-none focus-visible:ring-0"
                disabled={loading}
              />
              <button
                type="button"
                onClick={handlePaste}
                disabled={loading}
                className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-md bg-secondary px-2.5 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
              >
                <Clipboard className="h-3.5 w-3.5" />
                Paste
              </button>
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className="h-12 bg-gradient-hero px-8 text-base font-semibold shadow-elegant"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Fetching...
                </>
              ) : (
                <>
                  <Download className="h-5 w-5" />
                  Download
                </>
              )}
            </Button>
          </Card>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            By using our service you accept our terms. We do not store any videos.
          </p>
        </form>

        {!isPro && (
          <div className="mx-auto mt-6 flex max-w-2xl flex-col items-center justify-between gap-3 rounded-lg border border-border bg-background/60 p-3 text-sm shadow-soft backdrop-blur sm:flex-row">
            <p className="text-muted-foreground">
              <Crown className="mr-1 inline h-4 w-4 text-primary" />
              Free plan: <span className="font-semibold text-foreground">{Math.min(used, limit)}/{limit}</span> downloads used today
              {remaining === 0 && <span className="ml-1 text-destructive">- limit reached</span>}
            </p>
            <Button asChild size="sm" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10">
              <Link to="/pro">
                <Crown className="h-4 w-4" /> Upgrade to Pro
              </Link>
            </Button>
          </div>
        )}

        {result && (
          <div className="mx-auto mt-10 max-w-3xl">
            <Card className="shadow-elegant">
              <div className="grid gap-6 p-6 md:grid-cols-[200px_1fr]">
                {result.cover && (
                  <div className="relative mx-auto aspect-[9/16] w-full max-w-[200px] overflow-hidden rounded-lg bg-muted">
                    <img src={result.cover} alt={result.title} className="h-full w-full object-cover" loading="lazy" />
                    {result.duration && (
                      <span className="absolute bottom-2 right-2 rounded bg-foreground/80 px-1.5 py-0.5 text-xs text-background">
                        {Math.floor(result.duration / 60)}:{String(result.duration % 60).padStart(2, "0")}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex flex-col">
                  <div className="flex items-center gap-3">
                    {result.author.avatar && (
                      <img src={result.author.avatar} alt={result.author.nickname} className="h-10 w-10 rounded-full" loading="lazy" />
                    )}
                    <div>
                      <p className="font-semibold">{result.author.nickname}</p>
                      <p className="text-xs text-muted-foreground">@{result.author.unique_id}</p>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm">{result.title}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Plays {formatNum(result.stats.plays)}</span>
                    <span>Likes {formatNum(result.stats.likes)}</span>
                    <span>Comments {formatNum(result.stats.comments)}</span>
                    <span>Shares {formatNum(result.stats.shares)}</span>
                  </div>
                  {result.type === "slideshow" && result.images && result.images.length > 0 && (() => { const imgs = result.images!; return (
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {imgs.slice(0, 8).map((image, index) => (
                        <div key={index} className="relative aspect-square overflow-hidden rounded-md bg-muted">
                          <img src={image} alt={`Slide ${index + 1}`} className="h-full w-full object-cover" loading="lazy" />
                          {index === 7 && imgs.length > 8 && (
                            <div className="absolute inset-0 flex items-center justify-center bg-foreground/60 text-sm font-semibold text-background">
                              +{imgs.length - 8}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ); })()}
                  <div className="mt-4 rounded-md border border-border bg-background/60 p-3">
                    <label className="block text-xs font-medium text-muted-foreground" htmlFor="tk-pattern">
                      Filename pattern
                    </label>
                    <Input
                      id="tk-pattern"
                      value={pattern}
                      onChange={(e) => setPattern(e.target.value)}
                      placeholder={DEFAULT_PATTERN}
                      className="mt-1 h-9 text-xs"
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Tokens: <code>{"{username}"}</code> <code>{"{type}"}</code> <code>{"{index}"}</code> <code>{"{index2}"}</code> <code>{"{ext}"}</code> <code>{"{original}"}</code> <code>{"{title}"}</code>
                    </p>
                    <p className="mt-1 truncate text-[10px] text-muted-foreground">
                      Preview: <span className="font-mono text-foreground">{tkName("video", `${result.author.unique_id}.mp4`)}</span>
                    </p>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {result.type === "slideshow" && result.images && result.images.length > 0 && (
                        <Button
                          onClick={() => guardedDownload(() => downloadSlideshowZip(result.images!, result.author.unique_id || "tiktok"))}
                          className="bg-gradient-hero col-span-1 sm:col-span-2"
                        >
                          <Images className="h-4 w-4 mr-1" /> Download all images (ZIP)
                        </Button>
                      )}
                      
                      {(result.downloads.no_watermark_hd || result.downloads.no_watermark || result.downloads.watermark) && (
                         <div className="flex flex-col gap-2 relative">
                           <div className="relative z-10 w-full">
                              <button
                                type="button"
                                onClick={() => setOpenDropdown(!openDropdown)}
                                className="w-full h-10 px-3 flex items-center justify-between gap-2 rounded-md border border-primary/20 bg-background/60 backdrop-blur-md text-sm font-semibold shadow-sm hover:border-primary/40 hover:bg-secondary/20 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 cursor-pointer text-foreground"
                              >
                                <span>{selectedVideo?.label || "🎬 Select Quality"}</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground transition-transform duration-200" style={{ transform: openDropdown ? 'rotate(180deg)' : 'none' }}>
                                  <path d="m6 9 6 6 6-6"/>
                                </svg>
                              </button>
                              
                              {openDropdown && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(false)} />
                                  <div className="absolute left-0 mt-1 w-full max-h-[300px] overflow-y-auto rounded-lg border border-primary/10 bg-background/95 backdrop-blur-xl p-1 shadow-2xl z-20 animate-in fade-in slide-in-from-top-2 duration-200">
                                    {[
                                      result.downloads.no_watermark_hd && { label: "Ultra HD (HEVC) - No Watermark", url: result.downloads.no_watermark_hd, key: "no_watermark_hd", file: "video-hd" },
                                      result.downloads.no_watermark && { label: result.downloads.no_watermark_hd ? "High Quality - No Watermark" : "HD Quality - No Watermark", url: result.downloads.no_watermark, key: "no_watermark", file: "video" },
                                      result.downloads.watermark && { label: "Standard Quality - With Watermark", url: result.downloads.watermark, key: "watermark", file: "video-wm" }
                                    ].filter(Boolean).map((opt: any, idx) => (
                                      <button
                                        key={idx}
                                        type="button"
                                        className="w-full flex items-center justify-between px-3 py-2 text-left text-sm font-semibold rounded-md hover:bg-primary/10 hover:text-primary transition-colors text-foreground"
                                        onClick={() => {
                                          setSelectedVideo(opt);
                                          setOpenDropdown(false);
                                        }}
                                      >
                                        <span>{opt.label}</span>
                                        {selectedVideo?.key === opt.key && <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M20 6 9 17l-5-5"/></svg>}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                           </div>
                           <Button
                             onClick={() => guardedDownload(() => triggerDownload(selectedVideo!.url, tkName(selectedVideo!.file, `${result.author.unique_id}.mp4`)))}
                             className="bg-gradient-hero w-full"
                             disabled={!selectedVideo}
                           >
                             <Video className="h-4 w-4 mr-1" /> Download Video
                           </Button>
                         </div>
                      )}

                      {result.downloads.music && (
                        <div className="flex flex-col gap-2">
                           <Button onClick={() => guardedDownload(() => triggerDownload(result.downloads.music!, tkName("audio", `${result.author.unique_id}.mp3`)))} variant="outline" className="w-full h-10 mt-[2.75rem]">
                             <Music className="h-4 w-4 mr-1" /> MP3 Audio
                           </Button>
                        </div>
                      )}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </section>
  );
};
