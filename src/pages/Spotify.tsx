import { useState } from "react";
import { Disc3, Heart, ListMusic, Music, Rss } from "lucide-react";
import { PageShell } from "@/components/site/PageShell";
import { MediaDownloaderPage, type DownloaderMode } from "@/components/site/MediaDownloaderPage";
import { History } from "@/components/site/History";
import JamendoSearch from "@/components/site/JamendoSearch";
import PodcastDownloader from "@/components/site/PodcastDownloader";
import { cn } from "@/lib/utils";

const matchesTrack = (value: string) =>
  /(?:spotify:track:|https?:\/\/open\.spotify\.com\/(?:[a-zA-Z]{2,5}\/)?track\/)/i.test(value);

const matchesAlbum = (value: string) =>
  /https?:\/\/open\.spotify\.com\/(?:[a-zA-Z]{2,5}\/)?album\//i.test(value);

const matchesPlaylist = (value: string) =>
  /https?:\/\/open\.spotify\.com\/(?:[a-zA-Z]{2,5}\/)?playlist\//i.test(value) ||
  /https?:\/\/open\.spotify\.com\/collection\/tracks/i.test(value);

const modes: DownloaderMode[] = [
  {
    id: "track",
    label: "Track",
    description: "Single Spotify song URL",
    icon: Music,
    placeholder: "https://open.spotify.com/track/...",
    expectedHint: "open.spotify.com/track/ID",
    matches: matchesTrack,
  },
  {
    id: "album",
    label: "Album",
    description: "Full Spotify album download",
    icon: Disc3,
    placeholder: "https://open.spotify.com/album/...",
    expectedHint: "open.spotify.com/album/ID",
    matches: matchesAlbum,
    infoEndpointOverride: "spotify/collection-info",
  },
  {
    id: "playlist",
    label: "Playlist",
    description: "Playlist or Liked Songs",
    icon: ListMusic,
    placeholder: "https://open.spotify.com/playlist/...",
    expectedHint: "open.spotify.com/playlist/ID",
    matches: matchesPlaylist,
    infoEndpointOverride: "spotify/collection-info",
  },
];

type Tab = "spotify" | "freemusic" | "podcast";

const tabs: { id: Tab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: "spotify", label: "Spotify", icon: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  )},
  { id: "freemusic", label: "Free Music", icon: Music },
  { id: "podcast", label: "Podcast", icon: Rss },
];

const Spotify = () => {
  const [activeTab, setActiveTab] = useState<Tab>("spotify");

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit mb-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                  activeTab === tab.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "spotify" && (
        <MediaDownloaderPage
          platform="spotify"
          functionName="spotify-download"
          badge="Spotify downloader"
          title="Download Spotify tracks as MP3"
          description="Paste any public Spotify track, album, or playlist link to download high-quality MP3s with embedded cover art."
          modes={modes}
          defaultMode="track"
        />
      )}

      {activeTab === "freemusic" && (
        <div className="max-w-4xl mx-auto px-4 py-6">
          <JamendoSearch />
        </div>
      )}

      {activeTab === "podcast" && (
        <div className="max-w-4xl mx-auto px-4 py-6">
          <PodcastDownloader />
        </div>
      )}

      <History />
    </PageShell>
  );
};

export default Spotify;
