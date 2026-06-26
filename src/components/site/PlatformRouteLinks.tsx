import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { MEDIA_PLATFORM_CONFIGS, PLATFORM_CONFIGS } from "@/lib/platforms";
import type { PlatformKey } from "@/lib/media";

type PlatformRouteLinksProps = {
  current?: PlatformKey;
  includeTinyUrl?: boolean;
  compact?: boolean;
};

export const PlatformRouteLinks = ({
  current,
  includeTinyUrl = true,
  compact = false,
}: PlatformRouteLinksProps) => {
  const platforms = includeTinyUrl ? PLATFORM_CONFIGS : MEDIA_PLATFORM_CONFIGS;

  return (
    <div className={`grid gap-3 ${compact ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"}`}>
      {platforms
        .filter((platform) => platform.key !== current)
        .map((platform) => {
          const Icon = platform.icon;
          return (
            <Link key={platform.key} to={platform.route}>
              <Card className="h-full border-border bg-background/80 p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-elegant">
                <div className="flex items-start justify-between gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-card text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-sm font-semibold flex items-center gap-1.5">
                  {platform.name}
                  {platform.paused && (
                    <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-destructive border border-destructive/20">
                      Paused
                    </span>
                  )}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">{platform.blurb}</p>
              </Card>
            </Link>
          );
        })}
    </div>
  );
};
