import { Facebook as FacebookIcon, Film, Image as ImageIcon, PlaySquare } from "lucide-react";
import { PageShell } from "@/components/site/PageShell";
import { MediaDownloaderPage, type DownloaderMode } from "@/components/site/MediaDownloaderPage";

const matchesFacebook = (value: string) =>
  /https?:\/\/(?:www\.)?(?:facebook\.com|fb\.watch)\//i.test(value);

const modes: DownloaderMode[] = [
  {
    id: "reel",
    label: "Reel",
    description: "Short-form public videos",
    icon: Film,
    placeholder: "https://www.facebook.com/reel/...",
    expectedHint: "facebook.com/reel/... or fb.watch/...",
    matches: matchesFacebook,
  },
  {
    id: "video",
    label: "Video",
    description: "Public watch or video links",
    icon: FacebookIcon,
    placeholder: "https://www.facebook.com/watch/?v=...",
    expectedHint: "facebook.com/watch or /videos/...",
    matches: matchesFacebook,
  },
  {
    id: "post",
    label: "Post",
    description: "Posts with images or mixed media",
    icon: PlaySquare,
    placeholder: "https://www.facebook.com/{page}/posts/...",
    expectedHint: "facebook.com/.../posts/... or photo links",
    matches: matchesFacebook,
  },
  {
    id: "story",
    label: "Story",
    description: "Public story links when available",
    icon: ImageIcon,
    placeholder: "https://www.facebook.com/stories/...",
    expectedHint: "facebook.com/stories/...",
    matches: matchesFacebook,
  },
];

const Facebook = () => (
  <PageShell>
    <MediaDownloaderPage
    platform="facebook"
    functionName="facebook-download"
    badge="Facebook downloader"
    title="Download Facebook reels, videos, posts, images, and stories"
    description="Paste a public Facebook link to fetch downloadable media and direct file variants."
    modes={modes}
    defaultMode="video"
    />
  </PageShell>
);

export default Facebook;
