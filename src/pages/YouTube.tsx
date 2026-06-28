import { Film, List, Music, PlaySquare } from "lucide-react";
  import { PageShell } from "@/components/site/PageShell";
  import { MediaDownloaderPage, type DownloaderMode } from "@/components/site/MediaDownloaderPage";
  import { History } from "@/components/site/History";

  const matchesYouTube = (value: string) => {
    // Pure playlist URLs (no video ID) must only match the playlist mode
    if (/youtube\.com\/playlist\?/i.test(value)) return false;
    return (
      /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(value) ||
      /(?:v=|v\/|vi\/|youtu\.be\/|embed\/|shorts\/|live\/)[\w-]{11}/.test(value)
    );
  };

  const matchesPlaylist = (value: string) =>
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:playlist\?(?:.*&)?list=|watch\?(?:.*&)?list=)[\w-]+/i.test(value);

  const modes: DownloaderMode[] = [
    {
      id: "video",
      label: "Video",
      description: "Standard YouTube videos",
      icon: Film,
      placeholder: "https://www.youtube.com/watch?v=...",
      expectedHint: "youtube.com/watch?v=... or youtu.be/...",
      matches: matchesYouTube,
    },
    {
      id: "short",
      label: "Short",
      description: "YouTube Shorts",
      icon: PlaySquare,
      placeholder: "https://www.youtube.com/shorts/...",
      expectedHint: "youtube.com/shorts/...",
      matches: matchesYouTube,
    },
    {
      id: "audio",
      label: "Audio",
      description: "Download as MP3 / M4A",
      icon: Music,
      placeholder: "https://www.youtube.com/watch?v=...",
      expectedHint: "Any youtube.com or youtu.be link",
      matches: matchesYouTube,
    },
    {
      id: "playlist",
      label: "Playlist",
      description: "Full playlists (up to 50 videos)",
      icon: List,
      placeholder: "https://www.youtube.com/playlist?list=...",
      expectedHint: "youtube.com/playlist?list=...",
      matches: matchesPlaylist,
    },
  ];

  const YouTube = () => (
    <PageShell>
      <MediaDownloaderPage
        platform="youtube"
        functionName="youtube-download"
        badge="YouTube downloader"
        title="Download YouTube videos, Shorts, audio & playlists"
        description="Paste any YouTube link to fetch downloadable video, audio, or playlist files."
        modes={modes}
        defaultMode="video"
      />
      <History />
    </PageShell>
  );

  export default YouTube;
  