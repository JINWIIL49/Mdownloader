import { Camera, Clapperboard, MessageSquare } from "lucide-react";
import { PageShell } from "@/components/site/PageShell";
import { MediaDownloaderPage, type DownloaderMode } from "@/components/site/MediaDownloaderPage";

const matchesTweet = (value: string) =>
  /https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/\d+/i.test(value);

const modes: DownloaderMode[] = [
  {
    id: "post",
    label: "Post",
    description: "Tweet URLs with mixed public media",
    icon: MessageSquare,
    placeholder: "https://x.com/{user}/status/...",
    expectedHint: "x.com/.../status/... or twitter.com/.../status/...",
    matches: matchesTweet,
  },
  {
    id: "video",
    label: "Video",
    description: "MP4 quality variants from tweets",
    icon: Clapperboard,
    placeholder: "https://x.com/{user}/status/...",
    expectedHint: "x.com/.../status/... or twitter.com/.../status/...",
    matches: matchesTweet,
  },
  {
    id: "image",
    label: "Image",
    description: "Original image assets from tweets",
    icon: Camera,
    placeholder: "https://x.com/{user}/status/...",
    expectedHint: "x.com/.../status/... or twitter.com/.../status/...",
    matches: matchesTweet,
  },
];

const Twitter = () => (
  <PageShell>
    <MediaDownloaderPage
    platform="twitter"
    functionName="twitter-download"
    badge="X / Twitter downloader"
    title="Download X / Twitter videos and images from public post URLs"
    description="Paste a public tweet URL to fetch MP4 variants, original images, and thumbnail assets."
    modes={modes}
    defaultMode="post"
    />
  </PageShell>
);

export default Twitter;
