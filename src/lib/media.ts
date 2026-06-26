export type PlatformKey =
  | "tiktok"
  | "instagram"
  | "facebook"
  | "youtube"
  | "twitter"
  | "linkedin"
  | "tinyurl"
  | "background-remover"
  | "mediafire"
  | "spotify";

export type MediaKind = "video" | "image" | "audio" | "thumbnail" | "link";
export type MergeStrategy = "mux-mp4";

export type MediaDownload = {
  label: string;
  url: string;
  filename: string;
  functionName: string;
  mimeType?: string | null;
  quality?: string | null;
  mergeStrategy?: MergeStrategy | null;
  mergeAudioUrl?: string | null;
};

export type MediaItem = {
  id: string;
  type: MediaKind;
  title: string;
  description?: string | null;
  thumbnail: string | null;
  downloads: MediaDownload[];
};

export type MediaResult = {
  platform: PlatformKey;
  sourceType: string;
  title: string | null;
  caption: string | null;
  username: string | null;
  authorName: string | null;
  profilePic: string | null;
  cover: string | null;
  items: MediaItem[];
  resolvedUrl?: string | null;
};

export type HistoryFileAction = {
  kind: "file";
  label: string;
  asset: MediaDownload;
};

export type HistoryZipAction = {
  kind: "zip";
  label: string;
  baseName: string;
  functionName: string;
  items: MediaDownload[];
};

export type HistoryAction = HistoryFileAction | HistoryZipAction;

export type HistoryCreator = {
  name: string | null;
  handle: string | null;
  avatar: string | null;
};

export type HistoryEntry = {
  id: string;
  platform: PlatformKey;
  url: string;
  title: string;
  cover: string | null;
  creator: HistoryCreator;
  summary: string | null;
  actions: HistoryAction[];
  savedAt: number;
};
