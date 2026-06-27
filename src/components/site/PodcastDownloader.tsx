import { useState } from "react";
import { Rss, Download, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Episode = {
  title: string;
  description: string;
  date: string;
  audio_url: string;
  duration: string;
  filename: string;
};

type PodcastInfo = {
  title: string;
  description: string;
  image: string;
  episodes: Episode[];
  episode_count: number;
};

export default function PodcastDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [podcast, setPodcast] = useState<PodcastInfo | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchPodcast = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setPodcast(null);
    try {
      const res = await fetch("/podcast/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to fetch podcast" }));
        throw new Error(err.detail || "Failed to fetch podcast");
      }
      const data = await res.json();
      setPodcast(data);
    } catch (e: any) {
      toast.error(e.message || "Failed to fetch podcast");
    } finally {
      setLoading(false);
    }
  };

  const downloadEpisode = async (episode: Episode) => {
    setDownloading(episode.audio_url);
    try {
      const res = await fetch(episode.audio_url);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = episode.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      toast.success("Download started!");
    } catch {
      const a = document.createElement("a");
      a.href = episode.audio_url;
      a.download = episode.filename;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setDownloading(null);
    }
  };

  const visibleEpisodes = podcast
    ? expanded ? podcast.episodes : podcast.episodes.slice(0, 5)
    : [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-medium px-3 py-1 rounded-full">
          <Rss className="w-3 h-3" />
          Podcast RSS
        </div>
        <h2 className="text-2xl font-bold">Download Podcast Episodes</h2>
        <p className="text-muted-foreground text-sm">
          Paste any podcast RSS feed URL to browse and download episodes
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="https://feeds.example.com/podcast.rss"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchPodcast()}
          className="flex-1"
        />
        <Button onClick={fetchPodcast} disabled={loading || !url.trim()}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rss className="w-4 h-4" />}
          <span className="ml-2 hidden sm:inline">Load</span>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Tip: Find your podcast's RSS URL at{" "}
        <a href="https://podcastindex.org" target="_blank" rel="noopener" className="underline">podcastindex.org</a>
        {" "}or in your podcast app's share settings
      </p>

      {loading && (
        <div className="text-center py-10 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          <p>Loading podcast feed...</p>
        </div>
      )}

      {podcast && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex gap-4">
              {podcast.image && (
                <img
                  src={podcast.image}
                  alt={podcast.title}
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg leading-tight">{podcast.title}</h3>
                {podcast.description && (
                  <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{podcast.description}</p>
                )}
                <Badge variant="secondary" className="mt-2 text-xs">
                  {podcast.episode_count} episode{podcast.episode_count !== 1 ? "s" : ""}
                </Badge>
              </div>
            </div>
          </Card>

          <div className="space-y-2">
            {visibleEpisodes.map((ep, i) => (
              <Card key={i} className="p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-tight">{ep.title}</p>
                    {ep.date && (
                      <p className="text-xs text-muted-foreground mt-0.5">{ep.date}</p>
                    )}
                    {ep.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ep.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {ep.duration && (
                      <span className="text-xs text-muted-foreground hidden sm:block">{ep.duration}</span>
                    )}
                    <Button
                      size="sm"
                      className="h-8 gap-1"
                      onClick={() => downloadEpisode(ep)}
                      disabled={downloading === ep.audio_url}
                    >
                      {downloading === ep.audio_url
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Download className="w-3.5 h-3.5" />}
                      <span className="text-xs">Download</span>
                    </Button>
                  </div>
                </div>
              </Card>
            ))}

            {podcast.episodes.length > 5 && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <><ChevronUp className="w-4 h-4 mr-2" />Show less</>
                ) : (
                  <><ChevronDown className="w-4 h-4 mr-2" />Show all {podcast.episodes.length} episodes</>
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
