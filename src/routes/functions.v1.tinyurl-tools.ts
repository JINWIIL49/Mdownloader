import { createFileRoute } from "@tanstack/react-router";

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/functions/v1/tinyurl-tools")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { action?: string; url?: string; provider?: string };
        try {
          body = await request.json();
        } catch {
          return jsonError("Invalid JSON body");
        }

        const action = body.action || "resolve";
        const targetUrl = (body.url ?? "").trim();
        const provider = body.provider || "tinyurl";

        if (!targetUrl) return jsonError("URL is required");

        try {
          if (action === "resolve") {
            let currentUrl = targetUrl;
            let hops = 0;
            const maxHops = 5;

            while (hops < maxHops) {
              const res = await fetch(currentUrl, {
                method: "HEAD",
                redirect: "manual",
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                },
              });

              const loc = res.headers.get("location");
              if (loc) {
                currentUrl = loc.startsWith("http") ? loc : new URL(loc, currentUrl).toString();
                hops++;
              } else {
                break;
              }
            }

            return Response.json({ resolvedUrl: currentUrl });
          } else if (action === "shorten") {
            let shortUrl = "";
            let errorMsg = "";

            const headers = {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            };

                        // 1. Try selected provider first
            try {
              if (provider === "v.gd" || provider === "v-gd") {
                const apiRes = await fetch(`https://v.gd/create.php?format=json&url=${encodeURIComponent(targetUrl)}`, { headers });
                if (!apiRes.ok) {
                  const errText = await apiRes.text();
                  throw new Error(`v.gd request failed: ${apiRes.status} ${errText}`);
                }
                const text = await apiRes.text();
                if (text.startsWith("Error")) {
                  throw new Error(text);
                }
                const data = JSON.parse(text);
                if (data.shorturl) shortUrl = data.shorturl;
                else if (data.errormessage) throw new Error(data.errormessage);
              } else if (provider === "da.gd" || provider === "da-gd") {
                const apiRes = await fetch(`https://da.gd/s?url=${encodeURIComponent(targetUrl)}`, { headers });
                if (apiRes.ok) {
                  const text = await apiRes.text();
                  if (text && text.startsWith("http")) shortUrl = text.trim();
                }
              } else if (provider === "cleanuri") {
                const apiRes = await fetch("https://cleanuri.com/api/v1/shorten", {
                  method: "POST",
                  headers: {
                    ...headers,
                    "Content-Type": "application/x-www-form-urlencoded",
                  },
                  body: `url=${encodeURIComponent(targetUrl)}`,
                });
                if (apiRes.ok) {
                  const data = await apiRes.json();
                  if (data.result_url) shortUrl = data.result_url;
                }
              } else if (provider === "ulvis") {
                const apiRes = await fetch(`https://ulvis.net/API/write/get?url=${encodeURIComponent(targetUrl)}&type=json`, { headers });
                if (apiRes.ok) {
                  const data = await apiRes.json();
                  if (data.success && data.data && data.data.url) shortUrl = data.data.url;
                }
              }
            } catch (err: any) {
              console.warn(`${provider} shortening failed, initiating fallback chain:`, err.message);
              errorMsg = err.message;
            }

            let fellBack = false;

            // 2. Fallback to TinyURL if selected provider failed (or TinyURL is selected)
            if (!shortUrl) {
              try {
                const apiRes = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(targetUrl)}`, { headers });
                if (apiRes.ok) {
                  const text = await apiRes.text();
                  if (text && text.startsWith("http")) {
                    shortUrl = text.trim();
                    if (provider !== "tinyurl") {
                      fellBack = true;
                    }
                  }
                }
              } catch (fallbackErr: any) {
                console.warn("TinyURL fallback failed:", fallbackErr.message);
              }
            }

            // 3. Fallback to da.gd if TinyURL failed
            if (!shortUrl) {
              try {
                const apiRes = await fetch(`https://da.gd/s?url=${encodeURIComponent(targetUrl)}`, { headers });
                if (apiRes.ok) {
                  const text = await apiRes.text();
                  if (text && text.startsWith("http")) {
                    shortUrl = text.trim();
                    fellBack = true;
                  }
                }
              } catch (daFallbackErr: any) {
                console.warn("da.gd fallback failed:", daFallbackErr.message);
              }
            }

            // 4. Fallback to cleanuri if da.gd failed
            if (!shortUrl) {
              try {
                const apiRes = await fetch("https://cleanuri.com/api/v1/shorten", {
                  method: "POST",
                  headers: {
                    ...headers,
                    "Content-Type": "application/x-www-form-urlencoded",
                  },
                  body: `url=${encodeURIComponent(targetUrl)}`,
                });
                if (apiRes.ok) {
                  const data = await apiRes.json();
                  if (data.result_url) {
                    shortUrl = data.result_url;
                    fellBack = true;
                  }
                }
              } catch (cleanFallbackErr: any) {
                console.warn("CleanURI fallback failed:", cleanFallbackErr.message);
              }
            }

            if (!shortUrl) {
              throw new Error(errorMsg || "Failed to shorten link with selected provider and all fallbacks");
            }

            return Response.json({ shortUrl, fellBack, originalProvider: provider });
          } else {
            return jsonError("Invalid action");
          }
        } catch (error: any) {
          console.error("TinyURL tool error:", error);
          return jsonError(error.message || "Operation failed", 502);
        }
      },
    },
  },
});
