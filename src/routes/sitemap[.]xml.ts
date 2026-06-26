import { createFileRoute } from "@tanstack/react-router";
import { PLATFORM_CONFIGS } from "@/lib/platforms";

const BASE_URL = "https://id-preview--23291082-42ef-4504-b0e3-2939f38ff038.lovable.app";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const STATIC_ENTRIES: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/pro", changefreq: "monthly", priority: "0.5" },
];

const PLATFORM_HINTS: Record<string, { changefreq: SitemapEntry["changefreq"]; priority: string }> = {
  tiktok: { changefreq: "weekly", priority: "0.9" },
  youtube: { changefreq: "weekly", priority: "0.9" },
  instagram: { changefreq: "weekly", priority: "0.9" },
  facebook: { changefreq: "weekly", priority: "0.8" },
  twitter: { changefreq: "weekly", priority: "0.8" },
  linkedin: { changefreq: "weekly", priority: "0.8" },
  tinyurl: { changefreq: "weekly", priority: "0.7" },
  "background-remover": { changefreq: "weekly", priority: "0.7" },
};

function buildEntries(): SitemapEntry[] {
  const seen = new Set<string>();
  const all: SitemapEntry[] = [];
  for (const entry of STATIC_ENTRIES) {
    if (seen.has(entry.path)) continue;
    seen.add(entry.path);
    all.push(entry);
  }
  for (const p of PLATFORM_CONFIGS) {
    if (seen.has(p.route)) continue;
    seen.add(p.route);
    const hint = PLATFORM_HINTS[p.key] ?? { changefreq: "weekly" as const, priority: "0.7" };
    all.push({ path: p.route, changefreq: hint.changefreq, priority: hint.priority });
  }
  return all;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries = buildEntries();
        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );
        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
