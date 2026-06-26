import { BriefcaseBusiness, Image as ImageIcon, PlaySquare, Music } from "lucide-react";
import { PageShell } from "@/components/site/PageShell";
import { MediaDownloaderPage, type DownloaderMode } from "@/components/site/MediaDownloaderPage";

const matchesLinkedIn = (value: string) =>
  /https?:\/\/(?:www\.)?linkedin\.com\/(?:posts\/|feed\/update\/)/i.test(value);

const modes: DownloaderMode[] = [
  {
    id: "post",
    label: "Post",
    description: "Public LinkedIn feed posts",
    icon: BriefcaseBusiness,
    placeholder: "https://www.linkedin.com/posts/...",
    expectedHint: "linkedin.com/posts/... or linkedin.com/feed/update/...",
    matches: matchesLinkedIn,
  },
  {
    id: "video",
    label: "Video",
    description: "Native public LinkedIn videos",
    icon: PlaySquare,
    placeholder: "https://www.linkedin.com/feed/update/...",
    expectedHint: "linkedin.com/posts/... or linkedin.com/feed/update/...",
    matches: matchesLinkedIn,
  },
  {
    id: "audio",
    label: "Audio",
    description: "Extract high-quality audio tracks",
    icon: Music,
    placeholder: "https://www.linkedin.com/posts/...",
    expectedHint: "linkedin.com/posts/... or linkedin.com/feed/update/...",
    matches: matchesLinkedIn,
  },
  {
    id: "image",
    label: "Image",
    description: "Public post images and previews",
    icon: ImageIcon,
    placeholder: "https://www.linkedin.com/posts/...",
    expectedHint: "linkedin.com/posts/... or linkedin.com/feed/update/...",
    matches: matchesLinkedIn,
  },
];

const LinkedIn = () => (
  <PageShell>
    <MediaDownloaderPage
    platform="linkedin"
    functionName="linkedin-download"
    badge="LinkedIn downloader"
    title="Download public LinkedIn post videos and images"
    description="Paste a public LinkedIn post URL to extract native video files, images, and preview assets when available."
    modes={modes}
    defaultMode="post"
    />
  </PageShell>
);

export default LinkedIn;
