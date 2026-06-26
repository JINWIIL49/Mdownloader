import { FileArchive, History as HistoryIcon, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDownloadHistory } from "@/hooks/use-download-history";
import { downloadMixedZip, downloadProxyOptionsFromMedia, triggerDownloadVia } from "@/lib/download";
import type { HistoryAction, HistoryEntry } from "@/lib/media";

const timeAgo = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const runAction = (action: HistoryAction) => {
  if (action.kind === "file") {
    return triggerDownloadVia(
      action.asset.functionName,
      action.asset.url,
      action.asset.filename,
      downloadProxyOptionsFromMedia(action.asset),
    );
  }
  return downloadMixedZip(action.items, action.baseName, action.functionName);
};

const ItemActions = ({ item }: { item: HistoryEntry }) => {
  const visibleActions = item.actions.slice(0, 3);
  if (visibleActions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {visibleActions.map((action, index) => (
        <Button
          key={`${item.id}-${index}`}
          size="sm"
          variant={action.kind === "zip" || index === 0 ? "default" : "outline"}
          onClick={() => void runAction(action)}
          className={action.kind === "zip" || index === 0 ? "bg-gradient-hero" : undefined}
        >
          {action.kind === "zip" ? <FileArchive className="h-3.5 w-3.5" /> : null}
          {action.label}
        </Button>
      ))}
    </div>
  );
};

export const History = () => {
  const { items, remove, clear } = useDownloadHistory();
  if (items.length === 0) return null;

  return (
    <section id="history" className="container py-12 md:py-16">
      <div className="mb-6 flex flex-col items-center text-center gap-2">
        <div className="flex items-center gap-2">
          <HistoryIcon className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-bold">Recent downloads</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{items.length}</span>
        </div>
        <div>
          <Button variant="ghost" size="sm" onClick={clear}>
            <Trash2 className="h-4 w-4" /> Clear all
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Saved locally in your browser. Re-download any file or ZIP later.
        </p>
      </div>
      {/* Marquee: single-row horizontal scroller with duplicated items for seamless loop */}
      <div className="relative overflow-hidden py-4 marquee">
        <div className="animate-marquee flex gap-3 items-stretch">
          {items.concat(items).map((item, idx) => (
            <div key={`${item.id}-${idx}`} className="flex-shrink-0 w-64 sm:w-72 md:w-80">
              <Card className="group relative overflow-hidden p-3 shadow-soft transition-shadow hover:shadow-elegant">
                <button
                  type="button"
                  aria-label="Remove from history"
                  onClick={() => remove(item.id)}
                  className="absolute right-2 top-2 z-10 rounded-full bg-background/80 p-1 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="flex gap-3">
                  {item.cover && (
                    <img
                      src={item.cover}
                      alt={item.title}
                      loading="lazy"
                      className="h-24 w-16 flex-shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {item.platform}
                      </span>
                      <span className="text-xs text-muted-foreground">{timeAgo(item.savedAt)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm font-medium">{item.title}</p>
                    {(item.creator.handle || item.creator.name) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.creator.handle ? `@${item.creator.handle}` : item.creator.name}
                      </p>
                    )}
                    {item.summary && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.summary}</p>
                    )}
                    <div className="mt-2">
                      <ItemActions item={item} />
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
