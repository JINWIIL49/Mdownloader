import { Card } from "@/components/ui/card";
import { Gift, Globe, ShieldCheck, Smartphone, Sparkles, Zap } from "lucide-react";

const features = [
  { icon: Zap, title: "Fast fetch", desc: "Open a public link and get file variants in seconds." },
  { icon: ShieldCheck, title: "Proxy downloads", desc: "Downloads stream through platform-aware proxy rules instead of raw cross-origin links." },
  { icon: Sparkles, title: "Multi-format", desc: "Video, image, audio, playlist, and thumbnail workflows live in one app." },
  { icon: Smartphone, title: "Works everywhere", desc: "Browser-based flows for mobile, desktop, and tablet." },
  { icon: Gift, title: "Free core tools", desc: "No sign-up required for the main downloader pages." },
  { icon: Globe, title: "Short-link aware", desc: "TinyURL links can be expanded before media validation runs." },
];

export const Features = () => (
  <section id="features" className="py-16 md:py-24">
    <div className="container">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Why MDounloader?</h2>
        <p className="mt-4 text-muted-foreground">A single toolkit for public media extraction across the platforms you asked for.</p>
      </div>
      <div className="mt-12 mx-auto max-w-6xl grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 justify-items-center">
        {features.map((feature) => (
          <Card key={feature.title} className="group p-6 transition-all hover:-translate-y-1 hover:shadow-elegant w-full max-w-md">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-card text-primary">
              <feature.icon className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{feature.desc}</p>
          </Card>
        ))}
      </div>
    </div>
  </section>
);
