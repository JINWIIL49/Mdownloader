import type { MediaDownload, MediaItem, MediaKind, MediaResult, PlatformKey } from "@/lib/media";

type RawDownload = {
  type?: string | null;
  url?: string | null;
  filename?: string | null;
  quality?: string | null;
  bitrate?: string | number | null;
  codec?: string | null;
  itag?: string | number | null;
};

type RawMediaPayload = {
  platform?: string;
  mode?: string;
  title?: string | null;
  author?: string | null;
  authorName?: string | null;
  username?: string | null;
  thumbnail?: string | null;
  cover?: string | null;
  sourceUrl?: string | null;
  resolvedUrl?: string | null;
  media?: RawDownload[];
  items?: unknown[];
};

const kindFromType = (value: string | null | undefined): MediaKind => {
  const type = (value ?? "").toLowerCase();
  if (type.includes("audio")) return "audio";
  if (type.includes("image") || type.includes("thumbnail")) return "image";
  if (type.includes("link")) return "link";
  return "video";
};

const labelFromEntry = (entry: RawDownload, fallbackKind: MediaKind) => {
  if (entry.quality) return entry.quality;
  if (fallbackKind === "audio") {
    return entry.bitrate ? `${entry.bitrate} audio` : "Audio";
  }
  if (fallbackKind === "image") return "Thumbnail";
  return entry.filename || "Download";
};

const descriptionFromEntry = (entry: RawDownload) => {
  const parts = [entry.quality, entry.codec, entry.bitrate ? `${entry.bitrate}` : null].filter(Boolean);
  return parts.length ? parts.join(" • ") : null;
};

const normalizeDownloads = (
  entries: RawDownload[],
  fallbackPlatform: PlatformKey,
  videoId?: string | null,
): MediaItem[] => {
  const validEntries = entries.filter((entry): entry is RawDownload & { url: string; filename: string } => Boolean(entry?.url && entry?.filename));
  
  // Group by kind (video, audio, image) so quality variants appear in a dropdown
  const grouped = new Map<MediaKind, (RawDownload & { url: string; filename: string })[]>();
  validEntries.forEach((entry) => {
    const kind = kindFromType(entry.type);
    if (!grouped.has(kind)) grouped.set(kind, []);
    grouped.get(kind)!.push(entry);
  });

  return Array.from(grouped.entries()).map(([kind, groupEntries], index) => {
    const downloads: MediaDownload[] = groupEntries.map((entry) => {
      let url = entry.url;
      if (fallbackPlatform === "youtube" && videoId && url && url.startsWith("http")) {
        try {
          const u = new URL(url);
          u.searchParams.set("videoId", videoId);
          url = u.toString();
        } catch {}
      }
      return {
        label: labelFromEntry(entry, kind),
        url,
        filename: entry.filename,
        functionName: fallbackPlatform === "youtube" 
          ? "youtube-download" 
          : fallbackPlatform === "spotify"
            ? "spotify-download"
            : fallbackPlatform === "mediafire"
              ? "mediafire-download"
              : "tiktok-download",
        quality: entry.quality ?? null,
        mimeType: entry.type ?? null,
      };
    });

    // Sort downloads by quality (assuming higher quality string or bitrate is better, simple fallback to keep best first if possible)
    if (fallbackPlatform !== "spotify") {
      downloads.reverse();
    }

    return {
      id: `${fallbackPlatform}-${kind}-${index}`,
      type: kind,
      title: downloads[0]?.label || "Media",
      description: descriptionFromEntry(groupEntries[0]),
      thumbnail: null,
      downloads,
    } satisfies MediaItem;
  });
};

const isMediaItemLike = (value: unknown): value is MediaItem => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<MediaItem>;
  return typeof item.id === "string" && Array.isArray(item.downloads);
};

export const normalizeEdgeMediaResult = <T extends RawMediaPayload>(
  payload: T,
  fallbackPlatform: PlatformKey,
): MediaResult => {
  if (Array.isArray(payload.items) && payload.items.every(isMediaItemLike)) {
    return {
      platform: fallbackPlatform,
      sourceType: payload.mode ?? payload.platform ?? fallbackPlatform,
      title: payload.title ?? null,
      caption: null,
      username: payload.username ?? null,
      authorName: payload.authorName ?? payload.author ?? null,
      profilePic: null,
      cover: payload.cover ?? payload.thumbnail ?? null,
      items: payload.items,
      resolvedUrl: payload.resolvedUrl ?? payload.sourceUrl ?? null,
    };
  }

  const rawMedia = Array.isArray(payload.media) ? payload.media : [];
  const videoId = payload.videoId ?? payload.id ?? null;

  return {
    platform: fallbackPlatform,
    sourceType: payload.mode ?? payload.platform ?? fallbackPlatform,
    title: payload.title ?? null,
    caption: null,
    username: payload.username ?? null,
    authorName: payload.authorName ?? payload.author ?? null,
    profilePic: null,
    cover: payload.cover ?? payload.thumbnail ?? null,
    items: normalizeDownloads(rawMedia, fallbackPlatform, videoId),
    resolvedUrl: payload.resolvedUrl ?? payload.sourceUrl ?? null,
  };
};