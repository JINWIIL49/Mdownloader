import type { LucideIcon } from "lucide-react";
import {
  BriefcaseBusiness,
  Facebook,
  FolderDown,
  Image as ImageIcon,
  Instagram,
  Link2,
  Music,
  Play,
  Twitter,
  Youtube,
} from "lucide-react";
import type { PlatformKey } from "@/lib/media";

export type PlatformConfig = {
  key: PlatformKey;
  name: string;
  route: string;
  blurb: string;
  icon: LucideIcon;
  paused?: boolean;
};

export const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    key: "tiktok",
    name: "TikTok",
    route: "/tiktok",
    blurb: "No-watermark video, HD, audio, and slideshow support.",
    icon: Play,
  },
  {
    key: "instagram",
    name: "Instagram",
    route: "/instagram",
    blurb: "Reels, posts, carousel images, and stories.",
    icon: Instagram,
  },
  {
    key: "facebook",
    name: "Facebook",
    route: "/facebook",
    blurb: "Public reels, videos, posts, images, and stories.",
    icon: Facebook,
  },
  {
    key: "youtube",
    name: "YouTube",
    route: "/youtube",
    blurb: "Videos, Shorts, audio, playlists, and thumbnails.",
    icon: Youtube,
    paused: true,
  },
  {
    key: "twitter",
    name: "X / Twitter",
    route: "/twitter",
    blurb: "Tweet videos, images, and direct media variants.",
    icon: Twitter,
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    route: "/linkedin",
    blurb: "Public posts with video and image extraction.",
    icon: BriefcaseBusiness,
  },
  {
    key: "background-remover",
    name: "Background Remover",
    route: "/background-remover",
    blurb: "Remove image backgrounds and download transparent PNGs.",
    icon: ImageIcon,
  },
  {
    key: "mediafire",
    name: "MediaFire",
    route: "/mediafire",
    blurb: "Direct download links for public file sharing pages.",
    icon: FolderDown,
  },
  {
    key: "spotify",
    name: "Spotify",
    route: "/spotify",
    blurb: "Download tracks, albums, and playlists as MP3 with embedded cover art.",
    icon: Music,
  },
];

export const MEDIA_PLATFORM_CONFIGS = PLATFORM_CONFIGS.filter((platform) => platform.key !== "tinyurl");

export const platformByKey = (key: PlatformKey) =>
  PLATFORM_CONFIGS.find((platform) => platform.key === key);

export const thumbnailIcon = ImageIcon;
