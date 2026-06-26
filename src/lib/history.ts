import type { HistoryAction, HistoryEntry, MediaDownload, MediaResult, PlatformKey } from "@/lib/media";

const takePrimaryDownloads = (result: MediaResult): MediaDownload[] =>
  result.items
    .map((item) => item.downloads[0])
    .filter((download): download is MediaDownload => Boolean(download));

export const buildHistoryEntry = (sourceUrl: string, result: MediaResult): Omit<HistoryEntry, "id" | "savedAt"> => {
  const actions: HistoryAction[] = [];

  for (const item of result.items) {
    for (const download of item.downloads) {
      actions.push({
        kind: "file",
        label: result.items.length === 1 ? download.label : `${item.title}: ${download.label}`,
        asset: download,
      });
    }
  }

  const primaryDownloads = takePrimaryDownloads(result);
  const zipFunctionName = primaryDownloads[0]?.functionName;
  if (
    primaryDownloads.length > 1
    && zipFunctionName
    && primaryDownloads.every((item) => item.functionName === zipFunctionName && !item.mergeAudioUrl)
  ) {
    actions.unshift({
      kind: "zip",
      label: "Download all as ZIP",
      baseName: `${result.username ?? result.authorName ?? result.platform}-${result.sourceType}`.replace(/\s+/g, "-").toLowerCase(),
      functionName: zipFunctionName,
      items: primaryDownloads,
    });
  }

  return {
    platform: result.platform,
    url: sourceUrl,
    title: result.title ?? `${result.platform} download`,
    cover: result.cover ?? result.items[0]?.thumbnail ?? null,
    creator: {
      name: result.authorName,
      handle: result.username,
      avatar: result.profilePic,
    },
    summary: result.caption ?? null,
    actions,
  };
};

type LegacyTikTokHistory = {
  id: string;
  url: string;
  title: string;
  cover: string | null;
  author: { nickname: string; unique_id: string; avatar: string | null };
  type: "video" | "slideshow";
  images?: string[];
  downloads: {
    no_watermark: string | null;
    no_watermark_hd: string | null;
    watermark: string | null;
    music: string | null;
  };
  savedAt: number;
};

const fileAction = (label: string, url: string, filename: string): HistoryAction => ({
  kind: "file",
  label,
  asset: {
    label,
    url,
    filename,
    functionName: "tiktok-download",
  },
});

const asLegacyHistory = (entry: LegacyTikTokHistory): HistoryEntry => {
  const base = entry.author.unique_id || "tiktok";
  const actions: HistoryAction[] = [];

  if (entry.type === "slideshow" && entry.images?.length) {
    actions.push({
      kind: "zip",
      label: "Download all as ZIP",
      baseName: `${base}-images`,
      functionName: "tiktok-download",
      items: entry.images.map((image, index) => ({
        label: `Image ${index + 1}`,
        url: image,
        filename: `${String(index + 1).padStart(2, "0")}.jpg`,
        functionName: "tiktok-download",
      })),
    });
  }

  if (entry.downloads.no_watermark_hd) {
    actions.push(fileAction("HD video", entry.downloads.no_watermark_hd, `${base}-hd.mp4`));
  }
  if (entry.downloads.no_watermark) {
    actions.push(fileAction("Video", entry.downloads.no_watermark, `${base}.mp4`));
  }
  if (entry.downloads.watermark) {
    actions.push(fileAction("With watermark", entry.downloads.watermark, `${base}-wm.mp4`));
  }
  if (entry.downloads.music) {
    actions.push(fileAction("Audio", entry.downloads.music, `${base}.mp3`));
  }

  return {
    id: entry.id,
    platform: "tiktok",
    url: entry.url,
    title: entry.title,
    cover: entry.cover,
    creator: {
      name: entry.author.nickname,
      handle: entry.author.unique_id,
      avatar: entry.author.avatar,
    },
    summary: null,
    actions,
    savedAt: entry.savedAt,
  };
};

export const normalizeHistoryEntry = (raw: unknown): HistoryEntry | null => {
  if (!raw || typeof raw !== "object") return null;

  const value = raw as Partial<HistoryEntry> & Partial<LegacyTikTokHistory>;
  if (Array.isArray(value.actions) && typeof value.id === "string" && typeof value.url === "string") {
    return value as HistoryEntry;
  }

  if (value.author && value.downloads && typeof value.id === "string" && typeof value.url === "string") {
    return asLegacyHistory(value as LegacyTikTokHistory);
  }

  return null;
};

export const isPlatformKey = (value: string): value is PlatformKey =>
  ["tiktok", "instagram", "facebook", "youtube", "twitter", "linkedin", "tinyurl"].includes(value);
