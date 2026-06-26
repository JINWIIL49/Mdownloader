import { ClipboardPaste, Download, Link2 } from "lucide-react";

const steps = [
  { icon: Link2, title: "Copy a public link", desc: "Grab the exact post, reel, story, playlist, or short-link URL you want to process." },
  { icon: ClipboardPaste, title: "Open the right page", desc: "Choose the matching platform page and paste the link into the mode that fits." },
  { icon: Download, title: "Choose the file", desc: "Download one item, batch the primary files, or package them into a ZIP when the source supports it." },
];

export const HowItWorks = () => (
  <section id="how" className="bg-secondary/40 py-16 md:py-24">
    <div className="container">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
        <p className="mt-4 text-muted-foreground">Three quick steps from public URL to downloadable file.</p>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {steps.map((step, index) => (
          <div key={step.title} className="relative rounded-2xl border bg-card p-8 text-center shadow-soft">
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gradient-hero px-4 py-1 text-sm font-bold text-primary-foreground shadow-elegant">
              Step {index + 1}
            </span>
            <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-card text-primary">
              <step.icon className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{step.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
