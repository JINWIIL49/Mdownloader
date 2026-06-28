import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Check,
  Download,
  FileArchive,
  Image as ImageIcon,
  Loader2,
  Music,
  Video,
  X,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { buildHistoryEntry } from "@/lib/history";
import { downloadFileVia, downloadMixedZip, downloadProxyOptionsFromMedia, triggerDownloadVia, checkLocalPythonBackend } from "@/lib/download";
import { normalizeEdgeMediaResult } from "@/lib/edge-media-normalizer";
import { applyPattern, DEFAULT_PATTERN, splitExt } from "@/lib/filename-pattern";
import type { MediaDownload, MediaItem, MediaResult, PlatformKey } from "@/lib/media";
import { invokePublicFunction } from "@/lib/public-functions";
import { useDownloadHistory } from "@/hooks/use-download-history";
import { PlatformRouteLinks } from "@/components/site/PlatformRouteLinks";
import { resolveInputUrl } from "@/lib/url-resolution";

type QueueStatus = "queued" | "downloading" | "done" | "error";
type QueueItem = { filename: string; status: QueueStatus; error?: string };

export type DownloaderMode = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  placeholder: string;
  expectedHint: string;
  matches: (value: string) => boolean;
  /** Optional override: direct path on the Python backend (e.g. "spotify/collection-info"). */
  infoEndpointOverride?: string;
};

type MediaDownloaderPageProps = {
  platform: PlatformKey;
  functionName: string;
  badge: string;
  title: string;
  description: string;
  modes: DownloaderMode[];
  defaultMode?: string;
};

const isTinyUrlInput = (value: string) => /https?:\/\/(?:www\.)?(tinyurl\.com|tiny\.one)\//i.test(value);

const readInvokeErrorMessage = async (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload?.error) return payload.error;
      } catch {
        try {
          const text = await context.clone().text();
          if (text) return text;
        } catch {
          // Ignore response parsing issues and fall back to the error message.
        }
      }
    }
  }

  return error instanceof Error ? error.message : fallback;
};

export const MediaDownloaderPage = ({
  platform,
  functionName,
  badge,
  title,
  description,
  modes,
  defaultMode,
}: MediaDownloaderPageProps) => {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState(defaultMode ?? modes[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MediaResult | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedDownloads, setSelectedDownloads] = useState<Record<string, MediaDownload>>({});
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [selectedSingleDownloads, setSelectedSingleDownloads] = useState<Record<string, MediaDownload>>({});
  const [activeBackendUrl, setActiveBackendUrl] = useState<string | null>(null);
  const [checkingBackend, setCheckingBackend] = useState<boolean>(true);

  useEffect(() => {
    if (platform !== "youtube") return;
    
    let active = true;
    const checkBackend = async () => {
      try {
        const pyUrl = await checkLocalPythonBackend();
        if (active) {
          setActiveBackendUrl(pyUrl);
          setCheckingBackend(false);
        }
      } catch {
        if (active) {
          setActiveBackendUrl(null);
          setCheckingBackend(false);
        }
      }
    };

    void checkBackend();
    const interval = setInterval(checkBackend, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [platform]);

  useEffect(() => {
    if (result?.items) {
      const initial: Record<string, MediaDownload> = {};
      const initialSingle: Record<string, MediaDownload> = {};
      result.items.forEach((item) => {
        if (item.downloads?.[0]) {
          initial[item.id] = item.downloads[0];
          initialSingle[item.id] = item.downloads[0];
        }
      });
      setSelectedDownloads(initial);
      setSelectedSingleDownloads(initialSingle);
    } else {
      setSelectedDownloads({});
      setSelectedSingleDownloads({});
    }
  }, [result]);

  const [queueRunning, setQueueRunning] = useState(false);
  const [zipRunning, setZipRunning] = useState(false);
  const [pattern, setPattern] = useState<string>(DEFAULT_PATTERN);
  const { add } = useDownloadHistory();

  const activeMode = modes.find((item) => item.id === mode) ?? modes[0];
  const detectModeFromUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isTinyUrlInput(trimmed)) return null;

    if (activeMode.id === "audio") {
      return activeMode;
    }

    return modes.find((item) => item.id !== "audio" && item.matches(trimmed)) ?? modes.find((item) => item.matches(trimmed)) ?? null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error(
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-foreground text-sm">No URL entered</span>
          <span className="text-xs text-muted-foreground font-medium opacity-80">
            Paste a {badge.toLowerCase()} URL to get started
          </span>
        </div>
      );
      return;
    }

    const detectedMode = detectModeFromUrl(trimmed);
    const submitMode = detectedMode?.id ?? activeMode.id;

    if (!isTinyUrlInput(trimmed) && !detectedMode && !activeMode.matches(trimmed)) {
      // Platform-specific wrong URL messages
      const platformMessages: Record<string, { title: string; hint: string }> = {
        youtube: {
          title: "Not a YouTube URL",
          hint: `Expected: youtube.com/watch?v=…, youtu.be/…, or youtube.com/shorts/…`,
        },
        instagram: {
          title: "Not an Instagram URL",
          hint: `Expected: instagram.com/p/…, instagram.com/reel/…, or instagram.com/stories/…`,
        },
        facebook: {
          title: "Not a Facebook URL",
          hint: `Expected: facebook.com/watch?v=… or fb.watch/…`,
        },
        linkedin: {
          title: "Not a LinkedIn URL",
          hint: `Expected: linkedin.com/posts/… or linkedin.com/feed/update/…`,
        },
        twitter: {
          title: "Not an X / Twitter URL",
          hint: `Expected: x.com/… or twitter.com/…/status/…`,
        },
        tiktok: {
          title: "Not a TikTok URL",
          hint: `Expected: tiktok.com/@user/video/… or vm.tiktok.com/…`,
        },
      };
      const msg = platformMessages[platform] ?? {
        title: "Wrong URL format",
        hint: `Expected: ${activeMode.expectedHint}`,
      };
      toast.error(
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-foreground text-sm">{msg.title}</span>
          <span className="text-xs text-muted-foreground font-medium opacity-80">{msg.hint}</span>
        </div>
      );
      return;
    }

    if (detectedMode && detectedMode.id !== activeMode.id) {
      setMode(detectedMode.id);
    }

    setLoading(true);
    setResult(null);
    setQueue([]);

    try {
      const resolvedInput = await resolveInputUrl(trimmed);
      const requestBody: Record<string, unknown> = {
        url: resolvedInput.url,
        mode: submitMode,
      };

      let payload: Record<string, unknown> | null = null;
      const localPy = await checkLocalPythonBackend();
      const isLocalPyPlatform = ["youtube-download", "spotify-download", "mediafire-download"].includes(functionName);
      if (isLocalPyPlatform && localPy) {
        let clientError = false;
        try {
          // Use the mode's override endpoint if provided (e.g. spotify/collection-info for albums/playlists)
          const defaultEndpoint = functionName === "youtube-download" ? "youtube" : (functionName === "spotify-download" ? "spotify" : "mediafire");
          const defaultPath = `${defaultEndpoint}/info`;
          // Use the detected mode's override first, then active mode's, then the default endpoint
          const infoPath = detectedMode?.infoEndpointOverride ?? activeMode.infoEndpointOverride ?? defaultPath;
          console.log(`Fetching ${infoPath} directly from local Python backend...`);
          const res = await fetch(`${localPy}/${infoPath}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          });
          if (res.ok) {
            payload = await res.json();
          } else if (res.status >= 400 && res.status < 500) {
            // 4xx = the backend knows the answer (not found, private, etc.)
            // Surface it directly — don't fall back to the serverless worker,
            // which returns a misleading generic 404 for anything it doesn't handle.
            clientError = true;
            const errData = await res.json().catch(() => ({}));
            throw new Error((errData as any).detail || `Error ${res.status}`);
          } else {
            console.warn(`Local Python backend info failed with status ${res.status}. Falling back to Worker-side resolution.`);
          }
        } catch (e: any) {
          // Re-throw 4xx errors so the user sees the real message.
          // Only swallow genuine network / 5xx failures and fall back to the worker.
          if (clientError) throw e;
          console.warn("Local Python backend info request failed. Falling back to Worker-side resolution:", e.message);
        }
      }

      if (!payload) {
        // Albums/playlists use the dedicated collection-info POST endpoint
        const fallbackFunctionName =
          functionName === "spotify-download" && activeMode.infoEndpointOverride === "spotify/collection-info"
            ? "spotify-collection-info"
            : functionName;
        payload = await invokePublicFunction<Record<string, unknown>>(fallbackFunctionName, requestBody);
      }

      const normalized = normalizeEdgeMediaResult(payload, platform);
      if (!normalized.items?.length) throw new Error("No downloadable media found");
      setResult(normalized);
      add(buildHistoryEntry(resolvedInput.url, normalized));
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
            {resolvedInput.resolved ? `TinyURL resolved and ${badge.toLowerCase()} media is ready` : `${badge} media ready to download`}
          </span>
        </div>
      );
    } catch (err) {
      const msg = await readInvokeErrorMessage(err, `Failed to fetch ${badge} media`);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const buildFilename = (item: MediaItem, download: MediaDownload, itemIndex: number) => {
    // MediaFire (and similar direct-file platforms) already provide the correct
    // filename in download.filename — use it as-is instead of applying the
    // social-media pattern which would produce "mediafire - Direct Download.pdf".
    if (platform === "mediafire" && download.filename) {
      return download.filename;
    }

    const titleLower = (item.title || "").toLowerCase();
    const isGenericTitle =
      !item.title ||
      [
        "audio",
        "video",
        "image",
        "link",
        "media",
        "thumbnail",
        "download",
        "full mp3 audio",
        "30s track preview",
      ].includes(titleLower) ||
      titleLower.startsWith("audio") ||
      titleLower.startsWith("video") ||
      titleLower.startsWith("download");

    // For audio tracks, item.description holds the artist name (e.g. "Offset, Metro Boomin").
    // Prefer that over the collection/channel owner so the pattern
    // "{username} - {title}" yields "Artist - Song" instead of "playlistOwner - Song".
    // But skip it when the description is just a generic quality label like "Full MP3 Audio".
    const GENERIC_DESCRIPTIONS = [
      "audio", "video", "image", "link", "media", "thumbnail", "download",
      "full mp3 audio", "30s track preview",
    ];
    const descLower = (item.description || "").toLowerCase();
    const isGenericDescription =
      !item.description ||
      GENERIC_DESCRIPTIONS.includes(descLower) ||
      descLower.startsWith("audio") ||
      descLower.startsWith("video") ||
      descLower.startsWith("download");

    const usernameToken =
      item.type === "audio" && item.description && !isGenericDescription
        ? item.description
        : (result?.username ?? result?.authorName ?? platform);

    const filename = applyPattern(pattern || DEFAULT_PATTERN, {
      username: usernameToken,
      type: item.type,
      index: itemIndex + 1,
      total: result?.items.length,
      original: download.filename,
      title: (isGenericTitle ? result?.title : item.title) || result?.title || "media",
    });

    const qualityStr = download.quality != null ? String(download.quality) : "";
    const isPreview =
      download.label.toLowerCase().includes("preview") ||
      qualityStr.toLowerCase().includes("preview") ||
      download.filename.toLowerCase().includes("preview");

    let finalFilename = filename;
    if (isPreview && !finalFilename.toLowerCase().includes("preview")) {
      const { base, ext } = splitExt(finalFilename);
      finalFilename = ext ? `${base} (Preview).${ext}` : `${finalFilename} (Preview)`;
    }

    // Only append "p" for purely numeric quality values (e.g. "1080" → "1080p").
    // Text labels like "Direct Download" or "Download MP3" must not get a "p" suffix.
    const quality = /^\d+$/.test(qualityStr) ? `${qualityStr}p` : qualityStr;
    const isAudio = download.label.toLowerCase().includes("audio");
    if (!quality || isAudio || finalFilename.toLowerCase().includes(quality.toLowerCase())) {
      return finalFilename;
    }

    const { base, ext } = splitExt(finalFilename);
    return ext ? `${base} - ${quality}.${ext}` : `${finalFilename} - ${quality}`;
  };

  const primaryDownloads = useMemo(
    () =>
      (result?.items ?? [])
        .map((item, index) => {
          const isPlaylistMode = activeMode.id === "playlist";
          const selected = isPlaylistMode ? (selectedDownloads[item.id] ?? item.downloads[0]) : item.downloads[0];
          if (!selected) return null;
          return {
            download: selected,
            item,
            filename: buildFilename(item, selected, index),
          };
        })
        .filter((entry): entry is { download: MediaDownload; item: MediaItem; filename: string } => Boolean(entry)),
    [result, pattern, selectedDownloads],
  );

  const supportsBatchPrimaryDownloads = useMemo(
    () => primaryDownloads.every((entry) => !entry.download.mergeAudioUrl),
    [primaryDownloads],
  );

  const handleDownloadAll = async () => {
    if (queueRunning || !primaryDownloads.length || !supportsBatchPrimaryDownloads) return;
    setQueue(primaryDownloads.map((entry) => ({ filename: entry.filename, status: "queued" })));
    setQueueRunning(true);

    const toastStartTime = Date.now();
    const controller = new AbortController();
    const toastId = toast.loading(`Starting download of ${primaryDownloads.length} files...`, {
      action: {
        label: "Cancel",
        onClick: () => {
          controller.abort();
          setQueueRunning(false);
          toast.error("Downloads cancelled", { id: toastId });
        }
      }
    });

    let completed = 0;
    for (let index = 0; index < primaryDownloads.length; index += 1) {
      if (controller.signal.aborted) break;
      const entry = primaryDownloads[index];
      setQueue((prev) => prev.map((item, queueIndex) => (queueIndex === index ? { ...item, status: "downloading" } : item)));
      toast.loading(`Downloading ${index + 1}/${primaryDownloads.length}: ${entry.filename}`, { id: toastId });
      try {
        await downloadFileVia(
          entry.download.functionName || functionName,
          entry.download.url,
          entry.filename,
          downloadProxyOptionsFromMedia(entry.download),
          controller.signal
        );
        completed += 1;
        setQueue((prev) => prev.map((item, queueIndex) => (queueIndex === index ? { ...item, status: "done" } : item)));
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") break;
        const msg = err instanceof Error ? err.message : "Download failed";
        setQueue((prev) => prev.map((item, queueIndex) => (queueIndex === index ? { ...item, status: "error", error: msg } : item)));
      }
    }

    if (!controller.signal.aborted) {
      setQueueRunning(false);
      if (completed === primaryDownloads.length) {
        const elapsed = Date.now() - toastStartTime;
        if (elapsed < 1500) {
          await new Promise((r) => setTimeout(r, 1500 - elapsed));
        }
        toast.dismiss(toastId);
        toast.success(
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground text-sm">Files saved to Downloads folder</span>
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold text-[9px] uppercase tracking-wider border border-emerald-500/20">Saved</span>
            </div>
            <span className="text-xs text-muted-foreground font-medium opacity-80">Downloaded {completed} file{completed === 1 ? "" : "s"} successfully</span>
          </div>,
          { duration: 8000 }
        );
      } else {
        toast.dismiss(toastId);
        toast.error(
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-destructive text-sm">Batch Download Incomplete</span>
            <span className="text-xs text-muted-foreground font-medium opacity-80">Downloaded {completed} of {primaryDownloads.length} files. Some failed.</span>
          </div>,
          { duration: 5000 }
        );
      }
    }
  };

  const handleDownloadZip = async () => {
    if (zipRunning || queueRunning || !primaryDownloads.length || !supportsBatchPrimaryDownloads) return;

    setQueue(primaryDownloads.map((entry) => ({ filename: entry.filename, status: "queued" })));
    setZipRunning(true);
    const controller = new AbortController();

    const cancelZip = () => {
      controller.abort();
      setZipRunning(false);
      setQueue((prev) => prev.map((item) => (item.status === "done" ? item : { ...item, status: "error" })));
    };

    try {
      await downloadMixedZip(
        primaryDownloads.map((entry) => ({
          url: entry.download.url,
          filename: entry.filename,
          functionName: entry.download.functionName,
          ...downloadProxyOptionsFromMedia(entry.download),
        })),
        `${result?.title ?? result?.username ?? result?.authorName ?? platform}`,
        functionName,
        (done, _total, current) => {
          setQueue((prev) =>
            prev.map((item) => {
              if (item.filename === current) {
                return { ...item, status: done === 0 ? "downloading" : "done" };
              }
              return item;
            }),
          );
        },
        controller.signal,
        cancelZip,
      );
      setQueue((prev) => prev.map((item) => ({ ...item, status: "done" })));
    } catch (err) {
      if (err instanceof Error && (err.name === "AbortError" || err.message === "Download cancelled")) return;
      setQueue((prev) => prev.map((item) => (item.status === "done" ? item : { ...item, status: "error" })));
    } finally {
      setZipRunning(false);
    }
  };

  const totalQueue = queue.length;
  const finishedCount = queue.filter((item) => item.status === "done" || item.status === "error").length;
  const progressPct = totalQueue ? Math.round((finishedCount / totalQueue) * 100) : 0;
  const currentDownloading = queue.find((item) => item.status === "downloading");
  const busy = queueRunning || zipRunning;

  return (
    <section className="relative">
      <div className="absolute inset-0 -z-10 bg-gradient-soft" />
      <div className="absolute -top-24 left-1/2 -z-10 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

      <div className="container py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur">
              {badge}
            </span>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">{description}</p>
          </div>

          <div className="mx-auto mt-8 max-w-5xl">
            <PlatformRouteLinks current={platform} compact />
          </div>

          <div className="mt-8 grid gap-3 grid-cols-2 xl:grid-cols-4" role="tablist" aria-label={`${badge} download modes`}>
            {modes.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeMode.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setMode(item.id);
                    setResult(null);
                    setQueue([]);
                  }}
                  className={`mode-anim flex min-h-[104px] flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-primary bg-primary/10 shadow-soft"
                      : "border-border bg-background/70 hover:border-primary/40"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="text-sm font-semibold animate-slide-x">{item.label}</span>
                  <span className="text-xs text-muted-foreground animate-slide-x">{item.description}</span>
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="mt-4">
            <Card className="flex flex-col gap-3 p-3 shadow-elegant sm:flex-row sm:items-center">
              <Input
                value={url}
                onChange={(e) => {
                  const nextUrl = e.target.value;
                  setUrl(nextUrl);

                  const detectedMode = detectModeFromUrl(nextUrl);
                  if (detectedMode && detectedMode.id !== activeMode.id) {
                    setMode(detectedMode.id);
                  }
                }}
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
              Expecting a URL matching <code className="rounded bg-muted px-1 py-0.5">{activeMode.expectedHint}</code>
            </p>
            {platform === "youtube" && (
              <div className="mt-3 flex items-center gap-2 text-xs">
                {checkingBackend ? (
                  <div className="flex items-center gap-1.5 text-muted-foreground animate-pulse">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-muted-foreground opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-muted-foreground"></span>
                    </span>
                    Checking Python backend status...
                  </div>
                ) : activeBackendUrl ? (
                  <div className="flex items-center gap-1.5 text-emerald-500 font-medium bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    {activeBackendUrl.includes("localhost") || activeBackendUrl.includes("127.0.0.1") ? (
                      "Local Python Backend: Connected (1080p Full HD merging enabled)"
                    ) : (
                      `Cloud Python Backend: Connected (${activeBackendUrl.replace(/^https?:\/\//, "")})`
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-amber-500 font-medium bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                    Serverless Mode: Python backend not detected (progressive qualities only). Start local or deploy cloud backend to unlock HD merges.
                  </div>
                )}
              </div>
            )}
          </form>

          {loading && (
            <Card className="mx-auto mt-10 max-w-4xl p-6 shadow-elegant" aria-busy="true" aria-live="polite">
              <div className="grid gap-6 md:grid-cols-[220px_1fr]">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <div className="space-y-4">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <div className="grid grid-cols-2 gap-3">
                    <Skeleton className="h-28 w-full rounded-lg" />
                    <Skeleton className="h-28 w-full rounded-lg" />
                  </div>
                  <Skeleton className="h-11 w-full" />
                </div>
              </div>
            </Card>
          )}

          {result && !loading && (
            <Card className="mx-auto mt-6 max-w-4xl p-4 shadow-elegant">
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-secondary/40">
                  {(result.cover || result.items[0]?.thumbnail) ? (
                    <img
                      src={result.cover ?? result.items[0]?.thumbnail ?? ""}
                      alt={result.title ?? badge}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border bg-background px-2 py-0.5">{result.sourceType}</span>
                    {result.resolvedUrl && result.resolvedUrl !== url.trim() && (
                      <span className="rounded-full border border-border bg-background px-2 py-0.5">Resolved via TinyURL</span>
                    )}
                    <span>{result.items.length} item{result.items.length === 1 ? "" : "s"}</span>
                  </div>
                  {(result.username || result.authorName) && (
                    <p className="mt-1 truncate text-sm font-semibold">
                      {result.username ? `@${result.username}` : result.authorName}
                    </p>
                  )}
                  {result.title && (
                    <p className="mt-0.5 line-clamp-1 text-sm">{result.title}</p>
                  )}
                  {result.caption && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{result.caption}</p>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-md border border-border bg-background/60 p-3">
                <label className="block text-xs font-medium text-muted-foreground" htmlFor={`${platform}-pattern`}>
                  Filename pattern
                </label>
                <Input
                  id={`${platform}-pattern`}
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder={DEFAULT_PATTERN}
                  disabled={busy}
                  className="mt-1 h-9 text-xs"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Tokens: <code>{"{username}"}</code> <code>{"{type}"}</code> <code>{"{index}"}</code> <code>{"{index2}"}</code> <code>{"{ext}"}</code> <code>{"{original}"}</code> <code>{"{title}"}</code>
                </p>
                {result.items[0]?.downloads[0] && (
                  <p className="mt-1 truncate text-[10px] text-muted-foreground">
                    Preview: <span className="font-mono text-foreground">{buildFilename(result.items[0], result.items[0].downloads[0], 0)}</span>
                  </p>
                )}
              </div>

              <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                {result.items.map((item, itemIndex) => {
                  const queueStatus = queue[itemIndex]?.status;
                  const primaryDownload = item.downloads[0];
                  return (
                    <li key={item.id} className="px-3 py-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                          {item.type === "video" ? <Video className="h-4 w-4" /> : item.type === "audio" ? <Music className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">{item.title}</p>
                            {queueStatus === "downloading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                            {queueStatus === "done" && <Check className="h-3.5 w-3.5 text-primary" />}
                            {queueStatus === "error" && <X className="h-3.5 w-3.5 text-destructive" />}
                          </div>
                          {item.description && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                          )}
                          {primaryDownload && (
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              Primary file: {buildFilename(item, primaryDownload, itemIndex)}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-2">
                             {/* Show quality dropdown when multiple video options exist */}
                             {item.downloads.filter(d => !d.label.toLowerCase().includes("audio")).length > 1 ? (
                               activeMode.id === "playlist" ? (
                                 <div className="flex flex-wrap gap-2 items-center">
                                   <div className="relative">
                                      <button
                                        type="button"
                                        onClick={() => setOpenDropdownId(openDropdownId === item.id ? null : item.id)}
                                        className="h-9 px-3 flex items-center justify-between gap-2 rounded-md border border-primary/20 bg-background/60 backdrop-blur-md text-sm font-semibold shadow-sm hover:border-primary/40 hover:bg-secondary/20 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 cursor-pointer text-foreground min-w-[170px]"
                                        disabled={busy}
                                      >
                                        <span>{(selectedDownloads[item.id] ?? item.downloads[0])?.label || "🎬 Select Quality"}</span>
                                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" style={{ transform: openDropdownId === item.id ? 'rotate(180deg)' : 'none' }} />
                                      </button>
                                      
                                      {openDropdownId === item.id && (
                                        <>
                                          <div className="fixed inset-0 z-10" onClick={() => setOpenDropdownId(null)} />
                                          <div className="absolute left-0 mt-1 w-full min-w-[200px] max-h-[300px] overflow-y-auto rounded-lg border border-primary/10 bg-background/95 backdrop-blur-xl p-1 shadow-2xl z-20 animate-in fade-in slide-in-from-top-2 duration-200">
                                            {item.downloads.filter(d => !d.label.toLowerCase().includes("audio")).map((dl, idx) => (
                                              <button
                                                key={idx}
                                                type="button"
                                                className="w-full flex items-center justify-between px-3 py-2 text-left text-sm font-semibold rounded-md hover:bg-primary/10 hover:text-primary transition-colors text-foreground"
                                                onClick={() => {
                                                  setSelectedDownloads(prev => ({
                                                    ...prev,
                                                    [item.id]: dl
                                                  }));
                                                  setOpenDropdownId(null);
                                                }}
                                              >
                                                <span>{dl.label}</span>
                                                {(selectedDownloads[item.id]?.label || item.downloads[0]?.label) === dl.label && <Check className="h-4 w-4 text-primary" />}
                                              </button>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                   <Button
                                     size="sm"
                                     className="bg-gradient-hero"
                                     disabled={busy}
                                     onClick={() => {
                                       const dl = selectedDownloads[item.id] || item.downloads[0];
                                       if (dl) {
                                         void triggerDownloadVia(
                                           dl.functionName,
                                           dl.url,
                                           buildFilename(item, dl, itemIndex),
                                           downloadProxyOptionsFromMedia(dl)
                                         );
                                       }
                                     }}
                                   >
                                     <Download className="h-3.5 w-3.5 mr-1" />
                                     {item.type === "audio" ? "Download MP3" : item.type === "image" ? "Download Image" : item.type === "link" ? "Download File" : "Download Video"}
                                   </Button>
                                   {item.downloads.find(d => d.label.toLowerCase().includes("audio")) && (
                                     <Button
                                       size="sm"
                                       variant="outline"
                                       disabled={busy}
                                       onClick={() => {
                                         const dl = item.downloads.find(d => d.label.toLowerCase().includes("audio"))!;
                                         void triggerDownloadVia(
                                           dl.functionName,
                                           dl.url,
                                           buildFilename(item, dl, itemIndex),
                                           downloadProxyOptionsFromMedia(dl)
                                         );
                                       }}
                                     >
                                       <Music className="h-3.5 w-3.5 mr-1" />
                                       Audio
                                     </Button>
                                   )}
                                 </div>
                               ) : (
                                 <div className="flex flex-wrap gap-2 items-center">
                                   <div className="relative">
                                      <button
                                        type="button"
                                        onClick={() => setOpenDropdownId(openDropdownId === item.id ? null : item.id)}
                                        className="h-9 px-3 flex items-center justify-between gap-2 rounded-md border border-primary/20 bg-background/60 backdrop-blur-md text-sm font-semibold shadow-sm hover:border-primary/40 hover:bg-secondary/20 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 cursor-pointer text-foreground min-w-[170px]"
                                        disabled={busy}
                                      >
                                        <span>{(selectedSingleDownloads[item.id] ?? item.downloads[0])?.label || "🎬 Select Quality"}</span>
                                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" style={{ transform: openDropdownId === item.id ? 'rotate(180deg)' : 'none' }} />
                                      </button>
                                      
                                      {openDropdownId === item.id && (
                                        <>
                                          <div className="fixed inset-0 z-10" onClick={() => setOpenDropdownId(null)} />
                                          <div className="absolute left-0 mt-1 w-full min-w-[200px] max-h-[300px] overflow-y-auto rounded-lg border border-primary/10 bg-background/95 backdrop-blur-xl p-1 shadow-2xl z-20 animate-in fade-in slide-in-from-top-2 duration-200">
                                            {item.downloads.filter(d => !d.label.toLowerCase().includes("audio")).map((dl, idx) => (
                                              <button
                                                key={idx}
                                                type="button"
                                                className="w-full flex items-center justify-between px-3 py-2 text-left text-sm font-semibold rounded-md hover:bg-primary/10 hover:text-primary transition-colors text-foreground"
                                                onClick={() => {
                                                  setSelectedSingleDownloads(prev => ({
                                                    ...prev,
                                                    [item.id]: dl
                                                  }));
                                                  setOpenDropdownId(null);
                                                }}
                                              >
                                                <span>{dl.label}</span>
                                                {(selectedSingleDownloads[item.id]?.label || item.downloads[0]?.label) === dl.label && <Check className="h-4 w-4 text-primary" />}
                                              </button>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                   <Button
                                     size="sm"
                                     className="bg-gradient-hero"
                                     disabled={busy}
                                     onClick={() => {
                                       const dl = selectedSingleDownloads[item.id] ?? item.downloads[0];
                                       if (dl) {
                                         const fname = buildFilename(item, dl, itemIndex);
                                         void triggerDownloadVia(
                                           dl.functionName,
                                           dl.url,
                                           fname,
                                           downloadProxyOptionsFromMedia(dl)
                                         );
                                       }
                                     }}
                                   >
                                     <Download className="h-3.5 w-3.5 mr-1" />
                                     {item.type === "audio" ? "Download MP3" : item.type === "image" ? "Download Image" : item.type === "link" ? "Download File" : "Download Video"}
                                   </Button>
                                   {item.downloads.find(d => d.label.toLowerCase().includes("audio")) && (
                                     <Button
                                       size="sm"
                                       variant="outline"
                                       disabled={busy}
                                       onClick={() => {
                                         const dl = item.downloads.find(d => d.label.toLowerCase().includes("audio"))!;
                                         void triggerDownloadVia(
                                           dl.functionName,
                                           dl.url,
                                           buildFilename(item, dl, itemIndex),
                                           downloadProxyOptionsFromMedia(dl)
                                         );
                                       }}
                                     >
                                       <Music className="h-3.5 w-3.5 mr-1" />
                                       Audio
                                     </Button>
                                   )}
                                 </div>
                               )
                            ) : (
                              item.downloads.map((download, downloadIndex) => (
                                <Button
                                  key={`${item.id}-${downloadIndex}`}
                                  size="sm"
                                  variant={downloadIndex === 0 ? "default" : "outline"}
                                  className={downloadIndex === 0 ? "bg-gradient-hero" : undefined}
                                  disabled={busy}
                                  onClick={() =>
                                    void triggerDownloadVia(
                                      download.functionName,
                                      download.url,
                                      buildFilename(item, download, itemIndex),
                                      downloadProxyOptionsFromMedia(download),
                                    )}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  {download.label}
                                </Button>
                              ))
                            )}
                          </div>
                        </div>
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
                          ? `Zipping ${currentDownloading?.filename ?? "files"}`
                          : `Downloading ${currentDownloading?.filename ?? "files"}`
                        : finishedCount === totalQueue
                          ? "All downloads finished"
                          : "Paused"}
                    </span>
                    <span>{finishedCount}/{totalQueue}</span>
                  </div>
                  <Progress value={progressPct} className="h-2" />
                </div>
              )}

              {primaryDownloads.length > 1 && supportsBatchPrimaryDownloads && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button onClick={handleDownloadAll} size="sm" disabled={busy} className="bg-gradient-hero">
                    {queueRunning ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Downloading...</>
                    ) : (
                      <><Download className="h-4 w-4" /> Download all</>
                    )}
                  </Button>
                  <Button onClick={handleDownloadZip} size="sm" variant="outline" disabled={busy}>
                    {zipRunning ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Zipping...</>
                    ) : (
                      <><FileArchive className="h-4 w-4" /> Download all as ZIP</>
                    )}
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </section>
  );
};
