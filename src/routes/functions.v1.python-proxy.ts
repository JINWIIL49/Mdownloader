import { createFileRoute } from "@tanstack/react-router";

function getPythonBackendUrl(request?: Request): string | null {
  let envUrl = "";
  try {
    envUrl = (globalThis as any).VITE_PY_BACKEND_URL || 
             (import.meta.env ? (import.meta.env.VITE_PY_BACKEND_URL as string) : "") || 
             (typeof process !== 'undefined' && process.env ? process.env.VITE_PY_BACKEND_URL : "") ||
             (globalThis as any).process?.env?.VITE_PY_BACKEND_URL || "";
  } catch (e) {}

  if (envUrl && typeof envUrl === 'string' && envUrl.trim().startsWith('http')) {
    return envUrl.trim().replace(/\/$/, "");
  }

  // Fallback to local python backend process on port 8001
  return "http://127.0.0.1:8001";
}

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/functions/v1/python-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const urlParams = new URL(request.url).searchParams;
        const targetPath = urlParams.get("path");

        if (!targetPath) return jsonError("Path ('path') parameter is required");

        const pyBackend = getPythonBackendUrl(request);
        if (!pyBackend) return jsonError("Python backend is not configured or not available in this environment", 503);
        const targetUrl = `${pyBackend}/${targetPath.replace(/^\//, "")}`;

        try {
          const upstreamHeaders = new Headers();
          const range = request.headers.get("range");
          if (range) upstreamHeaders.set("Range", range);

          const response = await fetch(targetUrl, {
            headers: upstreamHeaders,
            redirect: "follow",
            signal: request.signal,
          });

          const outHeaders = new Headers();
          const passthrough = [
            "content-type",
            "content-length",
            "content-range",
            "accept-ranges",
            "cache-control",
          ];
          for (const h of passthrough) {
            const v = response.headers.get(h);
            if (v) outHeaders.set(h, v);
          }

          // Expose standard CORS headers
          outHeaders.set("Access-Control-Allow-Origin", "*");
          outHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range");

          return new Response(response.body, {
            status: response.status,
            headers: outHeaders,
          });
        } catch (e: any) {
          console.error("Python GET proxy error:", e);
          return jsonError(`Failed to reach backend: ${e.message}`, 502);
        }
      },
      POST: async ({ request }) => {
        const urlParams = new URL(request.url).searchParams;
        const targetPath = urlParams.get("path");

        if (!targetPath) return jsonError("Path ('path') parameter is required");

        const pyBackend = getPythonBackendUrl(request);
        if (!pyBackend) return jsonError("Python backend is not configured or not available in this environment", 503);
        const targetUrl = `${pyBackend}/${targetPath.replace(/^\//, "")}`;

        try {
          const contentType = request.headers.get("content-type") || "application/json";
          const bodyText = await request.text();

          const response = await fetch(targetUrl, {
            method: "POST",
            headers: {
              "Content-Type": contentType,
            },
            body: bodyText,
            redirect: "follow",
            signal: request.signal,
          });

          const resText = await response.text();
          return new Response(resText, {
            status: response.status,
            headers: {
              "Content-Type": response.headers.get("content-type") || "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (e: any) {
          console.error("Python POST proxy error:", e);
          return jsonError(`Failed to reach backend: ${e.message}`, 502);
        }
      },
    },
  },
});
