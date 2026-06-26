import { 
  Youtube, 
  ArrowRight
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/site/PageShell";
import { PLATFORM_CONFIGS } from "@/lib/platforms";

const YouTube = () => {
  const activePlatforms = PLATFORM_CONFIGS.filter(
    (platform) => platform.key !== "youtube"
  );

  return (
    <PageShell>
      <section className="relative overflow-hidden py-16 md:py-24">
        {/* Background Gradients */}
        <div className="absolute inset-0 -z-10 bg-gradient-soft" />
        <div className="absolute -top-24 left-1/2 -z-10 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-destructive/10 blur-3xl animate-pulse" />

        <div className="container max-w-4xl">
          <div className="mx-auto text-center">
            {/* Status Badge */}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/5 px-4 py-1.5 text-xs font-semibold text-destructive shadow-sm backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-ping" />
              Service Temporarily Paused
            </span>

            {/* Pulsing YouTube Icon with glow */}
            <div className="relative mx-auto mt-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10 text-destructive shadow-[0_0_50px_rgba(239,68,68,0.2)]">
              <Youtube className="h-10 w-10 animate-pulse" />
            </div>

            <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">
              YouTube Downloader is Paused
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
              Due to recent YouTube anti-bot signature updates, direct YouTube downloads are temporarily paused for maintenance. Our development team is actively working on a bypass solver.
            </p>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground/80 font-medium">
              We appreciate your patience! In the meantime, all other downloaders remain 100% active and running.
            </p>
          </div>

          {/* Alternative Downloaders Grid */}
          <div className="mt-16">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h2 className="text-lg font-bold">Try Alternative Working Tools</h2>
                <p className="text-xs text-muted-foreground">Select any active downloader below to continue.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {activePlatforms.map((platform) => {
                const Icon = platform.icon;
                return (
                  <Link key={platform.key} to={platform.route} className="group">
                    <Card className="h-full border-border bg-background/50 p-5 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:bg-background/80 hover:shadow-elegant">
                      <div className="flex items-center justify-between gap-3">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-card text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                          <Icon className="h-5 w-5" />
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                      </div>
                      <h3 className="mt-4 text-sm font-semibold">{platform.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{platform.blurb}</p>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
};

export default YouTube;
