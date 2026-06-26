import server from "../dist/server/server.js";

// We do NOT export config.runtime = "edge" here.
// This allows Vercel to run this as a standard Node.js Serverless Function
// which fully supports fs, path, child_process, os, stream, etc.

export default async function handler(req, res) {
  try {
    // 1. Convert Node.js http.IncomingMessage (req) to Web Request
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const url = `${protocol}://${host}${req.url}`;

    // Safety check: If the path has a static asset extension, do not let the SSR server
    // render HTML for it (which would cause a browser syntax error/white screen).
    // Instead, return a clean 404.
    const pathname = req.url.split("?")[0];
    if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|mp4|webm|json|xml)$/i.test(pathname)) {
      res.statusCode = 404;
      res.setHeader("content-type", "text/plain");
      res.end(`Asset not found: ${pathname}`);
      return;
    }

    let body = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
      if (typeof req.body === "string") {
        body = req.body;
      } else if (req.body && typeof req.body === "object") {
        if (Buffer.isBuffer(req.body)) {
          body = req.body;
        } else {
          body = JSON.stringify(req.body);
        }
      } else {
        // Read raw body stream
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }
    }

    const webRequest = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: body,
    });

    // 2. Call our SSR server's fetch method
    const webResponse = await server.fetch(webRequest);

    // 3. Write Web Response back to Node.js http.ServerResponse (res)
    res.statusCode = webResponse.status;
    res.statusMessage = webResponse.statusText;

    webResponse.headers.forEach((value, key) => {
      // Avoid duplicate or content-encoding headers that node handles automatically
      if (key.toLowerCase() !== "transfer-encoding") {
        res.setHeader(key, value);
      }
    });

    if (webResponse.body) {
      const reader = webResponse.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (error) {
    console.error("Error in SSR Node handler:", error);
    res.statusCode = 500;
    res.end("SSR Server Error");
  }
}
