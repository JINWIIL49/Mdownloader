import { FolderDown } from "lucide-react";
import { PageShell } from "@/components/site/PageShell";
import { MediaDownloaderPage, type DownloaderMode } from "@/components/site/MediaDownloaderPage";
import { History } from "@/components/site/History";

const matchesMediaFire = (value: string) =>
  /https?:\/\/(?:www\.)?mediafire\.com\//i.test(value);

const modes: DownloaderMode[] = [
  {
    id: "file",
    label: "File",
    description: "Public file sharing pages",
    icon: FolderDown,
    placeholder: "https://www.mediafire.com/file/...",
    expectedHint: "mediafire.com/file/.../file",
    matches: matchesMediaFire,
  },
];

const MediaFire = () => (
  <PageShell>
    <MediaDownloaderPage
      platform="mediafire"
      functionName="mediafire-download"
      badge="MediaFire downloader"
      title="Download public MediaFire files"
      description="Paste a public MediaFire link to fetch the direct download link and download safely."
      modes={modes}
      defaultMode="file"
    />
    <History />
  </PageShell>
);

export default MediaFire;
