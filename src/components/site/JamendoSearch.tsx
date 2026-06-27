import { useState } from "react";
import { Search, Download, Music, ExternalLink, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type JamendoTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  audio: string;
  download_url: string;
  duration: number;
  license: string;
};

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function JamendoSearch() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [tracks, setTracks] = useState<JamendoTrack[]>([]);
  const [searched, setSearched] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [preview, setPreview] = useState<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    setTracks([]);
    try {
      const res = await fetch("/jamendo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Search failed" }));
        throw new Error(err.detail || "Search failed");
      }
      const data = await res.json();
      setTracks(data.tracks || []);
    } catch (e: any) {
      toast.error(e.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = (track: JamendoTrack) => {
    if (playingId === track.id) {
      preview?.pause();
      setPlayingId(null);
      setPreview(null);
      return;
    }
    preview?.pause();
    const audio = new Audio(track.audio);
    audio.play();
    audio.onended = () => { setPlayingId(null); setPreview(null); };
    setPreview(audio);
    setPlayingId(track.id);
  };

  const handleDownload = async (track: JamendoTrack) => {
    if (!track.download_url) {
      toast.error("No download URL for this track");
      return;
    }
    setDownloading(track.id);
    try {
      const res = await fetch(track.download_url);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${track.artist} - ${track.title}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Download started!");
    } catch (e: any) {
      toast.error("Download failed — try right-clicking and Save As");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium px-3 py-1 rounded-full">
          <Music className="w-3 h-3" />
          Free &amp; Legal Music
        </div>
        <h2 className="text-2xl font-bold">Search Free Music</h2>
        <p className="text-muted-foreground text-sm">
          Millions of Creative Commons tracks from Jamendo — free to download &amp; share
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search by song, artist, or album..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          className="flex-1"
        />
        <Button onClick={search} disabled={loading || !query.trim()}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          <span className="ml-2 hidden sm:inline">Search</span>
        </Button>
      </div>

      {loading && (
        <div className="text-center py-10 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          <p>Searching Jamendo...</p>
        </div>
      )}

      {!loading && searched && tracks.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <Music className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No tracks found. Try a different search term.</p>
        </div>
      )}

      {tracks.length > 0 && (
        <div className="space-y-3">
          {tracks.map((track) => (
            <Card key={track.id} className="p-3">
              <div className="flex items-center gap-3">
                <img
                  src={track.cover || "/placeholder.svg"}
                  alt={track.title}
                  className="w-12 h-12 rounded object-cover flex-shrink-0 bg-muted"
                  onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{track.title}</p>
                  <p className="text-muted-foreground text-xs truncate">{track.artist}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {track.duration > 0 && (
                      <span className="text-xs text-muted-foreground">{formatDuration(track.duration)}</span>
                    )}
                    <Badge variant="secondary" className="text-xs py-0 px-1.5">CC Licensed</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {track.audio && (
                    <Button
                      size="sm"
                      variant={playingId === track.id ? "default" : "outline"}
                      className="h-8 w-8 p-0"
                      onClick={() => handlePreview(track)}
                      title="Preview"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {track.license && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => window.open(track.license, "_blank")}
                      title="License info"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="h-8 gap-1"
                    onClick={() => handleDownload(track)}
                    disabled={downloading === track.id}
                  >
                    {downloading === track.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Download className="w-3.5 h-3.5" />}
                    <span className="text-xs">MP3</span>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
