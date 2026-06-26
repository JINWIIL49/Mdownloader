import { Disc3, Heart, ListMusic, Music } from "lucide-react";
import { PageShell } from "@/components/site/PageShell";
import { MediaDownloaderPage, type DownloaderMode } from "@/components/site/MediaDownloaderPage";
import { History } from "@/components/site/History";

const matchesTrack = (value: string) =>
  /(?:spotify:track:|https?:\/\/open\.spotify\.com\/(?:[a-zA-Z]{2,5}\/)?track\/)/i.test(value);

const matchesAlbum = (value: string) =>
  /https?:\/\/open\.spotify\.com\/(?:[a-zA-Z]{2,5}\/)?album\//i.test(value);

/** Matches both /playlist/ and /collection/tracks (Liked Songs) */
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
    // no infoEndpointOverride — uses default spotify/info path
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

const Spotify = () => (
  <PageShell>
    <MediaDownloaderPage
      platform="spotify"
      functionName="spotify-download"
      badge="Spotify downloader"
      title="Download Spotify tracks as MP3"
      description="Paste any public Spotify track, album, or playlist link — including Liked Songs — to download high-quality MP3s with embedded cover art."
      modes={modes}
      defaultMode="track"
    />
    <History />
  </PageShell>
);

export default Spotify;
