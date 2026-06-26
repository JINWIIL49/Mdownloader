import { Link } from "react-router-dom";
import { FAQ } from "@/components/site/FAQ";
import { Features } from "@/components/site/Features";
import { History } from "@/components/site/History";
import { HowItWorks } from "@/components/site/HowItWorks";
import { PageShell } from "@/components/site/PageShell";
import { PlatformRouteLinks } from "@/components/site/PlatformRouteLinks";
import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <PageShell>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-soft" />
        <div className="absolute -top-24 left-1/2 -z-10 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="container py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur">
              MDounloader
            </span>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-3xl md:text-6xl">
              One place to download public social media videos, images, audio, playlists, and short links
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Open a dedicated downloader for TikTok, Instagram, Facebook, YouTube, X, LinkedIn, or TinyURL tools.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="bg-gradient-hero shadow-elegant">
                <Link to="/tiktok">Start with TikTok</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/tinyurl">Open TinyURL tools</Link>
              </Button>
            </div>
          </div>

          <div className="mx-auto mt-12 max-w-6xl">
            <PlatformRouteLinks />
          </div>
        </div>
      </section>

      <History />
      <Features />
      <HowItWorks />
      <FAQ />
    </PageShell>
  );
};

export default Index;
