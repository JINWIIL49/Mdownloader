import { useState } from "react";
import { Copy, Link2, Loader2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/site/PageShell";
import { PlatformRouteLinks } from "@/components/site/PlatformRouteLinks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { invokePublicFunction } from "@/lib/public-functions";

const TinyUrl = () => {
  const [value, setValue] = useState("");
  const [resolveLoading, setResolveLoading] = useState(false);
  const [shortenLoading, setShortenLoading] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("tinyurl");

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const callTinyUrlTool = async (action: "resolve" | "shorten") => {
    const trimmed = value.trim();
    if (!trimmed) {
      toast.error(
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-foreground text-sm">No URL entered</span>
          <span className="text-xs text-muted-foreground font-medium opacity-80">
            Paste a URL to shorten or resolve
          </span>
        </div>
      );
      return;
    }

    const isUrl = /^https?:\/\/\S+/i.test(trimmed);
    if (!isUrl) {
      toast.error(
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-foreground text-sm">Invalid URL format</span>
          <span className="text-xs text-muted-foreground font-medium opacity-80">
            Expected: https://example.com/...
          </span>
        </div>
      );
      return;
    }

    if (action === "resolve") setResolveLoading(true);
    else setShortenLoading(true);

    try {
      const payloadBody: any = { action, url: trimmed };
      if (action === "shorten") payloadBody.provider = provider;
      const data = await invokePublicFunction<any>("tinyurl-tools", payloadBody);
      if (data?.error) throw new Error(data.error);

      if (action === "resolve") {
        setResolvedUrl(data?.resolvedUrl ?? null);
        toast.success("Short link resolved");
      } else {
        setShortUrl(data?.shortUrl ?? null);
        if (data?.fellBack) {
          toast.warning(`${data.originalProvider} is offline or blocked this URL. Safely created a TinyURL link instead!`);
        } else {
          toast.success("Short link created");
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "TinyURL request failed";
      toast.error(msg);
    } finally {
      if (action === "resolve") setResolveLoading(false);
      else setShortenLoading(false);
    }
  };

  return (
    <PageShell>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-soft" />
        <div className="absolute -top-24 left-1/2 -z-10 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="container py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur">
              TinyURL tools
            </span>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
              Resolve Short URLs and create new short links
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Expand a TinyURL before sending it into another downloader, or make a new short link from any public URL.
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-5xl">
            <PlatformRouteLinks current="tinyurl" compact />
          </div>

          <div className="mx-auto mt-8 max-w-3xl">
                <Card className="p-4 shadow-elegant">
                  <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Paste a TinyURL or long URL here..."
                    className="h-12 text-base"
                  />
                  <div className="mt-3 flex items-center gap-3">
                    <label className="text-xs text-muted-foreground">Shortener</label>
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      className="rounded-md border border-border bg-background/60 px-3 py-1 text-sm"
                    >
                      <option value="tinyurl">TinyURL</option>
                      <option value="v.gd">v.gd</option>
                      <option value="da.gd">da.gd</option>
                      <option value="cleanuri">CleanURI</option>
                      <option value="ulvis">Ulvis</option>
                    </select>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Button
                      onClick={() => void callTinyUrlTool("resolve")}
                      disabled={resolveLoading || shortenLoading}
                      className="bg-gradient-hero"
                    >
                      {resolveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                        Resolve Short URL
                    </Button>
                    <Button
                      onClick={() => void callTinyUrlTool("shorten")}
                      disabled={resolveLoading || shortenLoading}
                      variant="outline"
                    >
                      {shortenLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                      Create short URL
                    </Button>
                  </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Card className="border-border bg-background/60 p-4">
                  <p className="text-xs font-medium text-muted-foreground">Resolved URL</p>
                  <p className="mt-2 break-all text-sm">{resolvedUrl ?? "Nothing resolved yet."}</p>
                  {resolvedUrl && (
                    <Button size="sm" variant="ghost" className="mt-3" onClick={() => void copyText(resolvedUrl)}>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                  )}
                </Card>
                <Card className="border-border bg-background/60 p-4">
                  <p className="text-xs font-medium text-muted-foreground">Short URL</p>
                  <p className="mt-2 break-all text-sm">{shortUrl ?? "Nothing shortened yet."}</p>
                  {shortUrl && (
                    <Button size="sm" variant="ghost" className="mt-3" onClick={() => void copyText(shortUrl)}>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                  )}
                </Card>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </PageShell>
  );
};

export default TinyUrl;
