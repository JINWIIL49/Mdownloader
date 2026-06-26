import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const faqs = [
  { q: "Is MDounloader free to use?", a: "Yes. The downloader pages are available without an account. The Pro page only affects the app's local daily limit system." },
  { q: "Do I need to install an app?", a: "No. MDounloader runs in your browser on desktop and mobile devices." },
  { q: "Can I paste TinyURL links into media pages?", a: "Yes. The backend resolves TinyURL links before validating the final platform URL." },
  { q: "Why do some links fail?", a: "Private, removed, region-locked, or platform-protected posts can fail even when the URL format looks correct." },
  { q: "Can I download playlists or batches?", a: "Yes, when the page returns multiple items you can download them one by one, queue the primary files, or package them into a ZIP." },
  { q: "Where are files stored?", a: "Files download to your device. The app keeps only a browser-local history of links and download actions." },
];

export const FAQ = () => (
  <section id="faq" className="py-16 md:py-24">
    <div className="container">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Frequently asked questions</h2>
        <p className="mt-4 text-muted-foreground">A quick read on how the multi-platform setup behaves.</p>
      </div>
      <div className="mx-auto mt-10 max-w-2xl">
        <Accordion type="single" collapsible className="rounded-2xl border bg-card px-6 shadow-soft">
          {faqs.map((faq, index) => (
            <AccordionItem key={index} value={`item-${index}`} className="last:border-b-0">
              <AccordionTrigger className="text-left text-base font-medium">{faq.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  </section>
);
