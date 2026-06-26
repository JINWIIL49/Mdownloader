import { useMemo, useState } from "react";
import { ArrowLeft, Check, Download, Film, FileArchive, Image as ImageIcon, Images, Instagram as InstagramIcon, Loader2, Music, PlaySquare, Video, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { invokePublicFunction } from "@/lib/public-functions";
import { downloadMixedZip, proxyUrl, triggerDownloadVia } from "@/lib/download";
import { buildHistoryEntry } from "@/lib/history";
import { applyPattern, DEFAULT_PATTERN } from "@/lib/filename-pattern";
import { useDownloadHistory } from "@/hooks/use-download-history";
import { PageShell } from "@/components/site/PageShell";
import { PlatformRouteLinks } from "@/components/site/PlatformRouteLinks";
import BackToHome from "@/components/site/BackToHome";
import { resolveInputUrl } from "@/lib/url-resolution";
import { History } from "@/components/site/History";

type InstagramMediaItem = {
  url: string;
  thumbnail: string | null;
  type: "image" | "video";
  filename: string;
  functionName?: string;
};

type InstagramResult = {
  sourceType: "reel" | "post" | "story";
  caption: string | null;
  username: string | null;
  profilePic: string | null;
  items: InstagramMediaItem[];
};

type Mode = "reel" | "post" | "story";

type QueueStatus = "queued" | "downloading" | "done" | "error";
type QueueItem = { filename: string; status: QueueStatus; error?: string };

const sourceLabel: Record<Mode, string> = {
  reel: "Reel",
  post: "Post",
  story: "Story",
};

const MODES: { id: Mode; label: string; description: string; icon: typeof Film; pathFragment: string; placeholder: string; allowedTypes: InstagramMediaItem["type"][] }[] = [
  { id: "reel", label: "Reel", description: "Single video", icon: Film, pathFragment: "/reel/", placeholder: "https://www.instagram.com/reel/...", allowedTypes: ["video"] },
  { id: "post", label: "Post", description: "Image or carousel", icon: PlaySquare, pathFragment: "/p/", placeholder: "https://www.instagram.com/p/...", allowedTypes: ["image", "video"] },
  { id: "story", label: "Story", description: "Image or video", icon: ImageIcon, pathFragment: "/stories/", placeholder: "https://www.instagram.com/stories/username/...", allowedTypes: ["image", "video"] },
];

const detectMode = (value: string): Mode | null => {
  const v = value.trim().toLowerCase();
  if (v.includes("/reel/")) return "reel";
  if (v.includes("/stories/")) return "story";
  if (v.includes("/p/")) return "post";
  return null;
};

const Instagram = () => {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("reel");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InstagramResult | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueRunning, setQueueRunning] = useState(false);
  const [zipRunning, setZipRunning] = useState(false);
  const [customFilename, setCustomFilename] = useState<string>("");
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [selectedQualities, setSelectedQualities] = useState<Record<string, string>>({});
  const { add } = useDownloadHistory();
  const buildAudioFilename = (item: InstagramMediaItem, index: number) => {
    const base = customFilename.trim() || "instagram-download";
    const suffix = result && result.items.length > 1 ? `-${index + 1}` : "";
    const safeBase = base.replace(/[/\\?%*:|"<>. ]/g, "_");
    return `${safeBase}${suffix}.mp3`;
  };

  const activeMode = MODES.find((m) => m.id === mode)!;

  const itemCounts = useMemo(() => {
    if (!result) return { images: 0, videos: 0 };
    return result.items.reduce(
      (acc, item) => {
        if (item.type === "image") acc.images += 1;
        if (item.type === "video") acc.videos += 1;
        return acc;
      },
      { images: 0, videos: 0 },
    );
  }, [result]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error(
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-foreground text-sm">No URL entered</span>
          <span className="text-xs text-muted-foreground font-medium opacity-80">
            Paste an Instagram {activeMode.label.toLowerCase()} URL to get started
          </span>
        </div>
      );
      return;
    }
    const resolvedInput = await resolveInputUrl(trimmed);
    const detected = detectMode(resolvedInput.url);
    if (!detected) {
      toast.error(
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-foreground text-sm">Not an Instagram URL</span>
          <span className="text-xs text-muted-foreground font-medium opacity-80">
            Expected: instagram.com/p/…, instagram.com/reel/…, or instagram.com/stories/…
          </span>
        </div>
      );
      return;
    }
    if (detected !== mode) {
      toast.error(
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-foreground text-sm">Incorrect Instagram Mode</span>
          <span className="text-xs text-muted-foreground font-medium opacity-80">
            That looks like a {sourceLabel[detected]} link. Switch the mode to {sourceLabel[detected]} or paste a {activeMode.label} URL.
          </span>
        </div>
      );
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const payload = await invokePublicFunction<any>("instagram-download", {
        url: resolvedInput.url,
      });
      const filteredItems = (payload.items || []).filter((item: any) => activeMode.allowedTypes.includes(item.type));
      if (filteredItems.length === 0) {
        throw new Error(`No ${activeMode.label.toLowerCase()} media found at this link`);
      }
      
      const parsedUsername = payload.username || payload.author || payload.owner || null;
      const parsedCaption = payload.caption || payload.title || payload.desc || payload.description || null;

      setResult({ ...payload, username: parsedUsername, caption: parsedCaption, sourceType: mode, items: filteredItems });
      setQueue([]);
      add(buildHistoryEntry(resolvedInput.url, {
        platform: "instagram",
        sourceType: mode,
        title: payload.caption ?? `${activeMode.label} download`,
        caption: payload.caption,
        username: payload.username,
        authorName: payload.username,
        profilePic: payload.profilePic,
        cover: filteredItems[0]?.thumbnail ?? null,
        items: filteredItems.map((item, index) => ({
          id: `${mode}-${index}`,
          type: item.type,
          title: item.filename,
          thumbnail: item.thumbnail,
          downloads: [
            {
              label: item.type === "video" ? "Video" : "Image",
              url: item.url,
              filename: item.filename,
              functionName: item.functionName || "instagram-download",
            },
          ],
        })),
      }));
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
            {resolvedInput.resolved ? `TinyURL resolved and ${activeMode.label.toLowerCase()} is ready` : `${activeMode.label} ready to download`}
          </span>
        </div>
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch Instagram media";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const downloadOne = async (fileUrl: string, filename: string) => {
    const isYtDlp = fileUrl.startsWith("ytdlp:");
    const proxied = proxyUrl(fileUrl, filename, isYtDlp ? "youtube-download" : "instagram-download");
    const res = await fetch(proxied);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const buildFilename = (item: InstagramMediaItem, index: number) => {
    const base = customFilename.trim() || "instagram-download";
    // Detect extension from URL or fallback
    let ext = "mp4";
    try {
      const urlObj = new URL(item.url);
      const pathname = urlObj.pathname;
      const parsedExt = pathname.split(".").pop();
      if (parsedExt && ["mp4", "jpg", "jpeg", "png", "webp"].includes(parsedExt.toLowerCase())) {
        ext = parsedExt.toLowerCase();
      } else {
        ext = item.type === "video" ? "mp4" : "jpg";
      }
    } catch {
      ext = item.type === "video" ? "mp4" : "jpg";
    }
    const suffix = result && result.items.length > 1 ? `-${index + 1}` : "";
    const safeBase = base.replace(/[/\\?%*:|"<>. ]/g, "_");
    return `${safeBase}${suffix}.${ext}`;
  };

  const handleDownloadAll = async () => {
    if (!result || queueRunning) return;
    const items = result.items;
    const named = items.map((item, i) => buildFilename(item, i));
    setQueue(named.map((filename) => ({ filename, status: "queued" })));
    setQueueRunning(true);

    let completed = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const filename = named[i];
      setQueue((prev) => prev.map((q, idx) => (idx === i ? { ...q, status: "downloading" } : q)));
      try {
        await downloadOne(item.url, filename);
        completed += 1;
        setQueue((prev) => prev.map((q, idx) => (idx === i ? { ...q, status: "done" } : q)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Download failed";
        setQueue((prev) => prev.map((q, idx) => (idx === i ? { ...q, status: "error", error: msg } : q)));
      }
    }

    setQueueRunning(false);
    if (completed === items.length) toast.success(`Downloaded ${completed} file${completed === 1 ? "" : "s"}`);
    else toast.warning(`Downloaded ${completed} of ${items.length}. Some failed.`);
  };

  const handleDownloadZip = async () => {
    if (!result || zipRunning || queueRunning) return;
    const items = result.items;
    const named = items.map((item, i) => ({
      url: item.url,
      filename: buildFilename(item, i),
      functionName: item.functionName || (item.url.startsWith("ytdlp:") ? "youtube-download" : "instagram-download"),
    }));
    const baseName = `${result.username ?? "instagram"}-${result.sourceType}`;
    setQueue(named.map(({ filename }) => ({ filename, status: "queued" })));
    setZipRunning(true);
    try {
      await downloadMixedZip(named, baseName, "instagram-download", (done, _total, current) => {
        setQueue((prev) =>
          prev.map((q) => {
            if (q.filename === current) {
              return { ...q, status: done >= prev.findIndex((x) => x.filename === current) + 1 ? "done" : "downloading" };
            }
            return q;
          }),
        );
      });
      setQueue((prev) => prev.map((q) => ({ ...q, status: "done" })));
    } catch {
      setQueue((prev) => prev.map((q) => (q.status === "done" ? q : { ...q, status: "error" })));
    } finally {
      setZipRunning(false);
    }
  };

  const totalQueue = queue.length;
  const finishedCount = queue.filter((q) => q.status === "done" || q.status === "error").length;
  const progressPct = totalQueue ? Math.round((finishedCount / totalQueue) * 100) : 0;
  const currentDownloading = queue.find((q) => q.status === "downloading");
  const busy = queueRunning || zipRunning;

  return (
    <PageShell>
      <main className="relative overflow-hidden bg-background">
        <div className="absolute inset-0 -z-10 bg-gradient-soft" />
        <div className="absolute -top-24 left-1/2 -z-10 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

        <div className="container py-16 md:py-24">
          <div className="mx-auto max-w-4xl">
            <BackToHome />

            <div className="mt-8">
              <section>
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur">
                  <InstagramIcon className="h-3.5 w-3.5 text-primary" />
                  Instagram downloader
                </span>
                <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
                  Download Instagram <span className="text-gradient">reels, images, and stories</span>
                </h1>
              <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
                Paste a public Instagram URL to fetch downloadable media for reels, posts, carousel images, and stories.
              </p>

              <div className="mt-8">
                <PlatformRouteLinks current="instagram" compact />
              </div>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2" role="tablist" aria-label="Instagram download mode">
                {MODES.map((m) => {
                  const Icon = m.icon;
                  const active = m.id === mode;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => { setMode(m.id); setResult(null); }}
                      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
                        active
                          ? "border-primary bg-primary/10 shadow-soft"
                          : "border-border bg-background/70 hover:border-primary/40"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-sm font-semibold">{m.label}</span>
                      <span className="text-xs text-muted-foreground">{m.description}</span>
                    </button>
                  );
                })}
              </div>

              <form onSubmit={handleSubmit} className="mt-4">
                <Card className="flex flex-col gap-3 p-3 shadow-elegant sm:flex-row sm:items-center">
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder={activeMode.placeholder}
                    className="h-12 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
                    disabled={loading}
                  />
                  <Button type="submit" size="lg" disabled={loading} className="h-12 bg-gradient-hero px-8 text-base font-semibold shadow-elegant">
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Fetching...
                      </>
                    ) : (
                      <>
                        <Download className="h-5 w-5" />
                        Get {activeMode.label.toLowerCase()}
                      </>
                    )}
                  </Button>
                </Card>
                <p className="mt-2 text-xs text-muted-foreground">
                  Expecting a URL containing <code className="rounded bg-muted px-1 py-0.5">{activeMode.pathFragment}</code>
                </p>
              </form>
            </section>
          </div>

          {loading && (
            <Card className="mx-auto mt-10 max-w-4xl p-6 shadow-elegant" aria-busy="true" aria-live="polite">
              <div className="grid gap-6 md:grid-cols-[220px_1fr]">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <div className="space-y-4">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Skeleton className="h-28 w-full rounded-lg" />
                    <Skeleton className="h-28 w-full rounded-lg" />
                  </div>
                  <Skeleton className="h-11 w-full" />
                </div>
              </div>
            </Card>
          )}

          {result && !loading && (
            <Card className="mx-auto mt-10 max-w-3xl shadow-elegant">
              <div className="grid gap-6 p-6 md:grid-cols-[200px_1fr]">
                {/* Large Thumbnail Column */}
                <div className="relative mx-auto aspect-[9/16] w-full max-w-[200px] overflow-hidden rounded-lg bg-muted border border-border bg-secondary/40">
                  {result.items[0]?.thumbnail ? (
                    <img
                      src={proxyUrl(result.items[0].thumbnail, "thumbnail.jpg", "instagram-download")}
                      alt={`${sourceLabel[result.sourceType]} preview`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <InstagramIcon className="h-8 w-8 opacity-50" />
                    </div>
                  )}
                </div>

                {/* Content Column */}
                <div className="flex flex-col">
                  <div className="flex items-center gap-3">
                    {result.profilePic && (
                      <img src={proxyUrl(result.profilePic, "profile.jpg", "instagram-download")} alt={result.username || "User"} className="h-10 w-10 rounded-full" loading="lazy" />
                    )}
                    <div>
                      {result.username && (
                        <p className="font-semibold text-base">@{result.username}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span className="rounded-full border border-border bg-background px-2 py-0.5 shadow-sm">{sourceLabel[result.sourceType]}</span>
                        {itemCounts.videos > 0 && <span>{itemCounts.videos} video{itemCounts.videos === 1 ? "" : "s"}</span>}
                        {itemCounts.images > 0 && <span>{itemCounts.images} image{itemCounts.images === 1 ? "" : "s"}</span>}
                      </div>
                    </div>
                  </div>
                  
                  {result.caption && (
                    <p className="mt-4 line-clamp-3 text-sm text-foreground/90">{result.caption}</p>
                  )}

                  {/* Settings and Single Download section */}
                  {result.items.length === 1 && (
                    <div className="mt-6 flex flex-col gap-4">
                      <div className="rounded-md border border-border bg-background/60 p-3">
                        <label className="block text-xs font-semibold text-foreground flex items-center gap-1.5" htmlFor="ig-pattern-single">
                          Custom Filename <span className="text-red-500 font-bold">*</span>
                        </label>
                        <Input
                          id="ig-pattern-single"
                          value={customFilename}
                          onChange={(e) => setCustomFilename(e.target.value)}
                          placeholder="Type a custom name for your video..."
                          disabled={queueRunning}
                          className="mt-1.5 h-9 text-xs border-primary/20 focus-visible:ring-primary/20"
                        />
                        <p className="mt-1 truncate text-[10px] text-muted-foreground flex items-center justify-between">
                          <span>Preview: <span className="font-mono text-foreground">{buildFilename(result.items[0], 0)}</span></span>
                          {!customFilename.trim() && <span className="text-red-500 font-medium">⚠️ Name is required</span>}
                        </p>
                      </div>

                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                          <div className="relative w-full sm:w-auto flex-1">
                            <button
                              type="button"
                              onClick={() => setOpenDropdownId(openDropdownId === 'single' ? null : 'single')}
                              className="w-full h-10 px-4 flex items-center justify-between gap-2 rounded-md border border-primary/20 bg-background/60 backdrop-blur-md text-sm font-semibold shadow-sm hover:border-primary/40 hover:bg-secondary/20 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 cursor-pointer text-foreground"
                              disabled={busy || !customFilename.trim()}
                            >
                              <span>{selectedQualities['single'] || `HD Quality (Original)`}</span>
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground transition-transform duration-200" style={{ transform: openDropdownId === 'single' ? 'rotate(180deg)' : 'none' }}>
                                <path d="m6 9 6 6 6-6"/>
                              </svg>
                            </button>
                            
                            {openDropdownId === 'single' && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setOpenDropdownId(null)} />
                                <div className="absolute left-0 mt-1 w-full overflow-y-auto rounded-lg border border-primary/10 bg-background/95 backdrop-blur-xl p-1 shadow-2xl z-20 animate-in fade-in slide-in-from-top-2 duration-200">
                                  {[{ label: "HD Quality (Original)" }].map((dl, idx) => (
                                    <button
                                      key={idx}
                                      type="button"
                                      className="w-full flex items-center justify-between px-3 py-2 text-left text-sm font-semibold rounded-md hover:bg-primary/10 hover:text-primary transition-colors text-foreground"
                                      onClick={() => {
                                        setSelectedQualities(prev => ({ ...prev, 'single': dl.label }));
                                        setOpenDropdownId(null);
                                      }}
                                    >
                                      <span>{dl.label}</span>
                                      {(selectedQualities['single'] || "HD Quality (Original)") === dl.label && <Check className="h-4 w-4 text-primary" />}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                          <Button
                            size="lg"
                            onClick={() => triggerDownloadVia(result.items[0].functionName || (result.items[0].url.startsWith("ytdlp:") ? "youtube-download" : "instagram-download"), result.items[0].url, buildFilename(result.items[0], 0))}
                            className="bg-gradient-hero w-full sm:w-auto h-10 px-8"
                            disabled={busy || !customFilename.trim()}
                          >
                            <Download className="h-4 w-4 mr-2" /> Download Video
                          </Button>
                        </div>

                        {result.items[0].type === "video" && (
                          <Button
                            size="lg"
                            variant="outline"
                            onClick={() => {
                              const audioFilename = buildAudioFilename(result.items[0], 0);
                              const isYtDlp = result.items[0].url.startsWith("ytdlp:");
                              void triggerDownloadVia(
                                isYtDlp ? "youtube-download" : "instagram-download",
                                result.items[0].url,
                                audioFilename
                              );
                            }}
                            className="w-full h-10 px-8 border-primary/20 hover:border-primary/40 hover:bg-secondary/20 flex items-center justify-center gap-2"
                            disabled={busy || !customFilename.trim()}
                          >
                            <Music className="h-4 w-4 text-primary" />
                            Download Audio (MP3)
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Multiple Items section */}
                  {result.items.length > 1 && (
                    <div className="mt-6">
                  <div className="mt-3 rounded-md border border-border bg-background/60 p-3">
                    <label className="block text-xs font-semibold text-foreground flex items-center gap-1.5" htmlFor="ig-pattern">
                      Custom Filename <span className="text-red-500 font-bold">*</span>
                    </label>
                    <Input
                      id="ig-pattern"
                      value={customFilename}
                      onChange={(e) => setCustomFilename(e.target.value)}
                      placeholder="Type a custom name for your files..."
                      disabled={queueRunning}
                      className="mt-1.5 h-9 text-xs border-primary/20 focus-visible:ring-primary/20"
                    />
                    <p className="mt-1.5 truncate text-[10px] text-muted-foreground flex items-center justify-between">
                      <span>Preview: <span className="font-mono text-foreground">{buildFilename(result.items[0], 0)}</span></span>
                      {!customFilename.trim() && <span className="text-red-500 font-medium">⚠️ Name is required</span>}
                    </p>
                  </div>
                  <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                    {result.items.map((item, index) => {
                      const status = queue[index]?.status;
                      const displayName = queue[index]?.filename ?? buildFilename(item, index);
                      return (
                        <li key={`${item.filename}-${index}`} className="flex items-center gap-3 px-3 py-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                            {item.type === "video" ? <Video className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                          </div>
                          <span className="min-w-0 flex-1 truncate text-xs">{displayName}</span>
                          {status === "queued" && <span className="text-[10px] text-muted-foreground">Queued</span>}
                          {status === "downloading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                          {status === "done" && <Check className="h-3.5 w-3.5 text-primary" />}
                          {status === "error" && <X className="h-3.5 w-3.5 text-destructive" />}
                          <div className="flex items-center gap-2">
                            <div className="relative hidden sm:block">
                              <button
                                type="button"
                                onClick={() => setOpenDropdownId(openDropdownId === index.toString() ? null : index.toString())}
                                className="h-8 px-2 flex items-center justify-between gap-2 rounded-md border border-primary/20 bg-background/60 backdrop-blur-md text-[10px] font-semibold shadow-sm hover:border-primary/40 hover:bg-secondary/20 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 cursor-pointer text-foreground min-w-[130px]"
                                disabled={busy}
                              >
                                <span>{selectedQualities[index.toString()] || `HD Quality`}</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground transition-transform duration-200" style={{ transform: openDropdownId === index.toString() ? 'rotate(180deg)' : 'none' }}>
                                  <path d="m6 9 6 6 6-6"/>
                                </svg>
                              </button>
                              
                              {openDropdownId === index.toString() && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setOpenDropdownId(null)} />
                                  <div className="absolute right-0 mt-1 w-full min-w-[150px] overflow-y-auto rounded-lg border border-primary/10 bg-background/95 backdrop-blur-xl p-1 shadow-2xl z-20 animate-in fade-in slide-in-from-top-2 duration-200">
                                    {[{ label: "HD Quality" }].map((dl, idx) => (
                                      <button
                                        key={idx}
                                        type="button"
                                        className="w-full flex items-center justify-between px-2 py-1.5 text-left text-[10px] font-semibold rounded-md hover:bg-primary/10 hover:text-primary transition-colors text-foreground"
                                        onClick={() => {
                                          setSelectedQualities(prev => ({ ...prev, [index.toString()]: dl.label }));
                                          setOpenDropdownId(null);
                                        }}
                                      >
                                        <span>{dl.label}</span>
                                        {(selectedQualities[index.toString()] || "HD Quality") === dl.label && <Check className="h-3 w-3 text-primary" />}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                             <Button
                               size="sm"
                               variant="ghost"
                               disabled={busy || !customFilename.trim()}
                               onClick={() => triggerDownloadVia(item.functionName || (item.url.startsWith("ytdlp:") ? "youtube-download" : "instagram-download"), item.url, buildFilename(item, index))}
                               className="h-8 px-2 bg-gradient-hero text-white hover:text-white"
                             >
                               <Download className="h-3.5 w-3.5 sm:mr-1" />
                               <span className="hidden sm:inline text-[10px]">Download Video</span>
                             </Button>

                             {item.type === "video" && (
                               <Button
                                 size="sm"
                                 variant="outline"
                                 disabled={busy || !customFilename.trim()}
                                 onClick={() => {
                                   const audioFilename = buildAudioFilename(item, index);
                                   const isYtDlp = item.url.startsWith("ytdlp:");
                                   void triggerDownloadVia(
                                     isYtDlp ? "youtube-download" : "instagram-download",
                                     item.url,
                                     audioFilename
                                   );
                                 }}
                                 className="h-8 px-2 border-primary/20 hover:border-primary/40 text-foreground flex items-center gap-1"
                               >
                                 <Music className="h-3.5 w-3.5 sm:mr-1 text-primary" />
                                 <span className="hidden sm:inline text-[10px]">Audio</span>
                               </Button>
                             )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {totalQueue > 0 && (
                    <div className="mt-3 space-y-1.5" aria-live="polite">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {busy
                            ? zipRunning
                              ? `Zipping ${currentDownloading?.filename ?? "..."}`
                              : `Downloading ${currentDownloading?.filename ?? "..."}`
                            : finishedCount === totalQueue
                              ? "All downloads finished"
                              : "Paused"}
                        </span>
                        <span>{finishedCount}/{totalQueue}</span>
                      </div>
                      <Progress value={progressPct} className="h-2" />
                    </div>
                  )}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Button onClick={handleDownloadAll} size="sm" disabled={busy || !customFilename.trim()} className="bg-gradient-hero">
                      {queueRunning ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Downloading {finishedCount + 1}/{totalQueue}</>
                      ) : (
                        <><Images className="h-4 w-4" /> Download all</>
                      )}
                    </Button>
                    <Button onClick={handleDownloadZip} size="sm" variant="outline" disabled={busy || !customFilename.trim()}>
                      {zipRunning ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Zipping...</>
                      ) : (
                        <><FileArchive className="h-4 w-4" /> Download all as ZIP</>
                      )}
                    </Button>
                  </div>
                </div>
              )}
                </div> {/* End Content Column */}
              </div> {/* End Grid */}
            </Card>
          )}
        </div>
      </div>
    </main>
    <History />
    </PageShell>
  );
};

export default Instagram;
