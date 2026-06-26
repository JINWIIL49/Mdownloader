import { createFileRoute } from "@tanstack/react-router";

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/functions/v1/instagram-download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Proxy simple file downloads (used for images, direct media URLs)
        const urlParams = new URL(request.url).searchParams;
        const targetUrl = urlParams.get("file");
        if (!targetUrl) return jsonError("URL ('file') is required");

        try {
          const upstream = await fetch(targetUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "*/*",
            },
          });
          const responseHeaders = new Headers(upstream.headers);
          responseHeaders.set("Access-Control-Allow-Origin", "*");
          return new Response(upstream.body, {
            status: upstream.status,
            headers: responseHeaders,
          });
        } catch (err: any) {
          return jsonError(`Proxy failed: ${err.message}`, 502);
        }
      },
      POST: async ({ request }) => {
        let body: { url?: string };
        try {
          body = await request.json();
        } catch {
          return jsonError("Invalid JSON body");
        }

        const inputUrl = (body.url ?? "").trim();
        if (!inputUrl) return jsonError("Missing 'url'");

        // Use the Supabase edge function which handles Instagram API access
        try {
          const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kZWFpenp3aWpibmFyenFybGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTI5NjksImV4cCI6MjA5MjM4ODk2OX0.QqjYI5_Zzr7jTceLxH7lWY5nJGBHOLoS3WkNQ5Lgpdo";
          const backupRes = await fetch("https://mdeaizzwijbnarzqrlbh.supabase.co/functions/v1/instagram-download", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${key}`
            },
            body: JSON.stringify({ url: inputUrl })
          });

          if (!backupRes.ok) {
            const errText = await backupRes.text().catch(() => `HTTP ${backupRes.status}`);
            throw new Error(`Instagram service returned status ${backupRes.status}: ${errText}`);
          }

          const payload = await backupRes.json();
          return Response.json(payload);
        } catch (error: any) {
          console.error("Instagram download failed:", error);
          return jsonError(error.message || "Failed to download Instagram media", 502);
        }
      },
    },
  },
});
