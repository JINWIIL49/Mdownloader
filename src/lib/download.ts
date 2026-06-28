import React from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import type { MediaDownload, MergeStrategy } from "@/lib/media";
import { publicFunctionBase } from "@/lib/public-functions";

const functionBase = (functionName: string) => `${publicFunctionBase(functionName)}/functions/v1/${functionName}`;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const loadLamejs = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).lamejs) {
      resolve((window as any).lamejs);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js";
    script.onload = () => resolve((window as any).lamejs);
    script.onerror = () => reject(new Error("Failed to load MP3 encoder library"));
    document.body.appendChild(script);
  });
};

type DownloadProxyOptions = {
  mergeStrategy?: MergeStrategy | null;
  mergeAudioUrl?: string | null;
  quality?: string | null;
};

let cachedLocalPyBackend: string | null = null;
let lastCheckTime = 0;
let configuredBackendUrl: string | null = null;
let configFetched = false;

export const checkLocalPythonBackend = async (): Promise<string | null> => {
  const now = Date.now();
  if (now - lastCheckTime < 5000) {
    return cachedLocalPyBackend;
  }
  lastCheckTime = now;

  // 1. Try current origin first (e.g. when served as a unified web app in production)
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000); // 5s timeout to tolerate cloud cold-starts/throttling
    const res = await fetch(`${window.location.origin}/health`, { signal: controller.signal });
    clearTimeout(id);
    if (res.ok) {
      const data = await res.json();
      if (data && (data.ok === true || data.status === "ok")) {
        cachedLocalPyBackend = window.location.origin;
        return cachedLocalPyBackend;
      }
    }
  } catch (e) {}

  if (!configFetched) {
    try {
      const res = await fetch("/functions/v1/youtube-download?action=config");
      if (res.ok) {
        const data = await res.json();
        configuredBackendUrl = data.pyBackendUrl || null;
      }
    } catch (e) {
      console.warn("Failed to fetch backend config:", e);
    }
    configFetched = true;
  }

  if (configuredBackendUrl) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${configuredBackendUrl}/health`, { signal: controller.signal });
      clearTimeout(id);
      if (res.ok) {
        const data = await res.json();
        if (data && (data.ok === true || data.status === "ok")) {
          cachedLocalPyBackend = configuredBackendUrl;
          return cachedLocalPyBackend;
        }
      }
    } catch (e) {
      console.warn(`Configured backend health check failed for ${configuredBackendUrl}:`, e);
    }
  }

  // 4. Try environment variable VITE_PY_BACKEND_URL (checking both localhost and 127.0.0.1)
  const envBackendUrl = import.meta.env.VITE_PY_BACKEND_URL;
  if (envBackendUrl) {
    const urlsToTry = [envBackendUrl];
    if (envBackendUrl.includes("localhost")) {
      urlsToTry.push(envBackendUrl.replace("localhost", "127.0.0.1"));
    }
    for (const url of urlsToTry) {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${url}/health`, { signal: controller.signal });
        clearTimeout(id);
        if (res.ok) {
          const data = await res.json();
          if (data && (data.ok === true || data.status === "ok")) {
            console.log(`[Backend Detection] Found active VITE_PY_BACKEND_URL at: ${url}`);
            cachedLocalPyBackend = url;
            return cachedLocalPyBackend;
          }
        }
      } catch (e) {}
    }
  }

  // 5. Fallback to localhost / 127.0.0.1 checks on ports 8000 and 8001
  for (const host of ["127.0.0.1", "localhost"]) {
    for (const port of ["8000", "8001"]) {
      const url = `http://${host}:${port}`;
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${url}/health`, { signal: controller.signal });
        clearTimeout(id);
        if (res.ok) {
          const data = await res.json();
          if (data && (data.ok === true || data.status === "ok")) {
            console.log(`[Backend Detection] Found active local fallback backend at: ${url}`);
            cachedLocalPyBackend = url;
            return cachedLocalPyBackend;
          }
        }
      } catch (e) {}
    }
  }

  console.warn("[Backend Detection] No active local Python backend detected.");
  cachedLocalPyBackend = null;
  return null;
};

export const proxyUrl = (
  fileUrl: string,
  filename: string,
  functionName = "tiktok-download",
  options?: DownloadProxyOptions,
  localPyBackendUrl?: string | null,
) => {
  const params = new URLSearchParams({
    file: fileUrl,
    filename,
  });

  if (options?.mergeStrategy === "mux-mp4" && options.mergeAudioUrl) {
    params.set("merge", options.mergeStrategy);
    params.set("audio", options.mergeAudioUrl);
  }

  const hasBackend = !!localPyBackendUrl;

  if (functionName === "youtube-download" && hasBackend) {
    return `${localPyBackendUrl}/youtube/download?${params.toString()}`;
  }
  if (functionName === "spotify-download") {
    if (fileUrl.startsWith("http")) {
      return fileUrl;
    }
    if (hasBackend) {
      return `${localPyBackendUrl}/spotify/download?${params.toString()}`;
    }
  }
  if (functionName === "mediafire-download" && localPyBackendUrl) {
    return `${localPyBackendUrl}/mediafire/download?${params.toString()}`;
  }

  return `${functionBase(functionName)}?${params.toString()}`;
};

const fetchWithRetry = async (url: string, init?: RequestInit, attempts = 3) => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(url, init);
      if (!RETRYABLE_STATUSES.has(res.status) || attempt === attempts - 1) {
        return res;
      }
      await res.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error("Download request failed");
      if (attempt === attempts - 1) break;
    }

    await sleep(400 * (attempt + 1));
  }

  throw lastError ?? new Error("Download request failed");
};

const clickDownloadLink = (href: string, filename: string) => {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const readDownloadError = async (res: Response) => {
  try {
    const payload = await res.clone().json() as { error?: string };
    if (payload?.error) return payload.error;
  } catch {
    // Ignore JSON parsing errors and fall back to status text.
  }

  return `Download failed (${res.status})`;
};

const ensureDownloadReady = async (
  functionName: string,
  fileUrl: string,
  filename: string,
  options?: DownloadProxyOptions,
) => {
  const localPy = await checkLocalPythonBackend();
  const proxied = proxyUrl(fileUrl, filename, functionName, options, localPy);
  const res = await fetchWithRetry(proxied, {
    method: (options?.mergeAudioUrl && !localPy) ? "HEAD" : "GET",
    headers: {
      Accept: "*/*",
    },
  });
  if (!res.ok) throw new Error(await readDownloadError(res));
  await res.body?.cancel().catch(() => undefined);
  return proxied;
};

export const downloadFileVia = async (
  functionName: string,
  fileUrl: string,
  filename: string,
  options?: DownloadProxyOptions,
  signal?: AbortSignal,
) => {
  const localPy = await checkLocalPythonBackend();
  const proxied = proxyUrl(fileUrl, filename, functionName, options, localPy);
  const res = await fetchWithRetry(proxied, {
    headers: {
      Accept: "*/*",
    },
    signal,
  });
  if (!res.ok) throw new Error(await readDownloadError(res));
  const contentType = res.headers.get("Content-Type") || "";
  if (contentType.toLowerCase().includes("text/html")) {
    throw new Error("Server returned HTML page instead of file.");
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  clickDownloadLink(objectUrl, filename);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

// ─── Native-download helper (continues when tab is minimized) ───────────────
function nativeBrowserDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── Background-Fetch (Service Worker level) download ─────────────────────
async function bgFetchDownload(
  proxied: string,
  filename: string,
): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    if (!('backgroundFetch' in reg)) return false;

    const id = `ssv-dl-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Tell SW which filename this id belongs to
    if (reg.active) {
      reg.active.postMessage({ type: 'BG_FETCH_META', id, filename });
    }

    await (reg as any).backgroundFetch.fetch(id, [proxied], {
      title: `Downloading ${filename}`,
      icons: [{ src: '/favicon.ico', sizes: '64x64', type: 'image/x-icon' }],
      downloadTotal: 0,
    });

    // Listen for SW completing the fetch and serve it
    return new Promise<boolean>(resolve => {
      const handler = (event: MessageEvent) => {
        const { type, id: doneId, filename: doneFilename } = event.data || {};
        if (type === 'BG_FETCH_DONE' && doneId === id) {
          navigator.serviceWorker.removeEventListener('message', handler);
          // Retrieve from SW cache and trigger save dialog
          fetch(`/sw-dl/${id}`)
            .then(r => r.blob())
            .then(blob => {
              const objectUrl = URL.createObjectURL(blob);
              clickDownloadLink(objectUrl, doneFilename || filename);
              setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
              resolve(true);
            })
            .catch(() => resolve(false));
        } else if (type === 'BG_FETCH_FAIL' && doneId === id) {
          navigator.serviceWorker.removeEventListener('message', handler);
          resolve(false);
        }
      };
      navigator.serviceWorker.addEventListener('message', handler);
      // Timeout after 30 min
      setTimeout(() => {
        navigator.serviceWorker.removeEventListener('message', handler);
        resolve(false);
      }, 30 * 60 * 1000);
    });
  } catch {
    return false;
  }
}

export const triggerDownloadVia = async (
  functionName: string,
  fileUrl: string,
  filename: string,
  options?: DownloadProxyOptions,
) => {
  let progressInterval: any = null;
  let visibilityHandler: (() => void) | null = null;
  let maxPollTimer: any = null;

  try {
    const toastStartTime = Date.now();
    const localPyRaw = await checkLocalPythonBackend();
    const isLocal = !!localPyRaw;
    const localPy = localPyRaw;
    const proxied = proxyUrl(fileUrl, filename, functionName, options, localPy);

    const isYoutube = (functionName === 'youtube-download' || (functionName === 'spotify-download' && !fileUrl.startsWith('http'))) && isLocal;
    const isAudio =
      filename.toLowerCase().endsWith('.mp3') ||
      filename.toLowerCase().endsWith('.m4a') ||
      filename.toLowerCase().endsWith('.webm') ||
      filename.toLowerCase().endsWith('.wav') ||
      (options?.quality && String(options.quality).toLowerCase().includes('audio'));

    const formatQualityLabel = (qualityStr: any): string => {
      if (!qualityStr) return 'High Quality Video';
      const clean = String(qualityStr).toLowerCase();
      const match = clean.match(/(\d+)/);
      const num = match ? parseInt(match[1]) : 0;
      if (num >= 2160) return `4K Ultra HD (${num}p)`;
      if (num >= 1440) return `2K QHD (${num}p)`;
      if (num >= 1080) return `Full HD (${num}p)`;
      if (num >= 720)  return `HD (${num}p)`;
      if (num >= 480)  return `SD (${num}p)`;
      if (num > 0)     return `Low Quality (${num}p)`;
      if (clean.includes('hd')) return 'HD Video';
      return String(qualityStr);
    };

    const isImage =
      filename.toLowerCase().endsWith('.jpg') ||
      filename.toLowerCase().endsWith('.jpeg') ||
      filename.toLowerCase().endsWith('.png') ||
      filename.toLowerCase().endsWith('.webp');

    const streamLabel = isYoutube
      ? (isAudio ? 'Processing Audio Stream' : 'Processing Video Stream')
      : (isImage ? 'Downloading Image File' : (isAudio ? 'Downloading Audio File' : 'Downloading Video File'));

    const qualityLabel = isYoutube
      ? (isAudio ? (options?.quality || 'High Quality MP3') : formatQualityLabel(options?.quality))
      : (options?.quality || (isImage ? 'Original Image' : 'Original Quality'));

    const makeToastNode = (label: string, statusText: string, qualityText: string, progressPct = 0) =>
      React.createElement(
        'div',
        { className: 'flex flex-col gap-0.5 min-w-[240px]' },
        React.createElement(
          'span',
          { className: 'font-semibold text-foreground flex items-center gap-2' },
          React.createElement(
            'span',
            { className: 'relative flex h-2 w-2 shrink-0' },
            React.createElement('span', { className: 'animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75' }),
            React.createElement('span', { className: 'relative inline-flex rounded-full h-2 w-2 bg-red-500' }),
          ),
          label,
        ),
        // Status text: tabular-nums keeps digit widths fixed → no layout shift
        React.createElement('span', { className: 'text-xs text-muted-foreground font-medium mt-0.5 tabular-nums' }, statusText),
        // Thin progress bar
        React.createElement(
          'div',
          { className: 'w-full bg-muted rounded-full h-1 mt-1 overflow-hidden' },
          React.createElement('div', {
            className: 'h-1 rounded-full bg-primary transition-all duration-500',
            style: { width: `${Math.max(2, progressPct)}%` },
          }),
        ),
        React.createElement('span', { className: 'text-xs text-primary font-semibold mt-0.5' }, qualityText),
      );

    // ── YouTube: fetch-stream download with client-side progress tracking.
    //   Uses AbortController so Cancel truly stops the connection immediately —
    //   no delayed native-browser download that keeps going after cancel.
    if (isYoutube) {
      let serverDone = false;
      let userCancelled = false;
      const controller = new AbortController();
      // Track highest yt-dlp server progress seen (never go backwards)
      let highestPct = 0;

      // Extract video_id from the ytdlp: URI for server-side cancel
      const videoIdMatch = fileUrl.match(/ytdlp:([\w-]{11}):/);
      const videoId = videoIdMatch ? videoIdMatch[1] : null;

      const stopPolling = () => {
        if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
        if (maxPollTimer)     { clearTimeout(maxPollTimer);      maxPollTimer = null; }
        if (visibilityHandler) {
          document.removeEventListener('visibilitychange', visibilityHandler);
          visibilityHandler = null;
        }
      };

      const cancelDownload = async () => {
        if (userCancelled) return;
        userCancelled = true;
        controller.abort();
        stopPolling();
        // Tell the backend to kill the yt-dlp process
        try {
          const endpoint = functionName === 'spotify-download' ? 'spotify' : 'youtube';
          const cancelUrl = localPy
            ? `${localPy}/${endpoint}/cancel`
            : `/functions/v1/${functionName}`;
          await fetch(cancelUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'cancel', video_id: videoId, filename }),
          }).catch(() => {});
        } catch { /* ignore */ }
        toast.dismiss(filename);
        toast.error('Download cancelled', { id: filename });
      };

      const finishToast = async () => {
        if (userCancelled) return;
        serverDone = true;
        stopPolling();

        const elapsed = Date.now() - toastStartTime;
        if (elapsed < 1500) {
          await sleep(1500 - elapsed);
        }

        toast.dismiss(filename);
        toast.success(
          React.createElement(
            'div',
            { className: 'flex flex-col gap-1' },
            React.createElement(
              'div',
              { className: 'flex items-center gap-2' },
              React.createElement('span', { className: 'font-semibold text-foreground text-sm' }, 'File saved to Downloads folder'),
              React.createElement(
                'span',
                { className: 'px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold text-[9px] uppercase tracking-wider border border-emerald-500/20' },
                'Saved',
              ),
            ),
            React.createElement(
              'span',
              { className: 'text-xs text-muted-foreground font-medium truncate max-w-[260px] opacity-80' },
              filename,
            ),
          ),
          { duration: 8000 },
        );
      };

      const cancelAction = {
        label: 'Cancel',
        onClick: () => { void cancelDownload(); }
      };

      const showServerProgress = (serverPercent: number, downloadedBytes: number, totalBytes: number, speedBytes = 0) => {
        if (serverDone || userCancelled) return;
        const effectivePct = Math.max(serverPercent, highestPct);
        highestPct = effectivePct;

        const speedStr = speedBytes > 0
          ? ` · ${speedBytes >= 1024 * 1024
              ? `${(speedBytes / (1024 * 1024)).toFixed(1)} MB/s`
              : `${(speedBytes / 1024).toFixed(0)} KB/s`}`
          : '';

        let statusText = `Processing on server… ${effectivePct}%${speedStr}`;
        if (effectivePct >= 99) {
          statusText = 'Merging audio & video… almost there!';
        } else if (totalBytes > 0 && downloadedBytes > 0) {
          const doneMB  = (downloadedBytes / (1024 * 1024)).toFixed(1);
          const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
          statusText = `Downloading… ${effectivePct}%${speedStr} (${doneMB} / ${totalMB} MB)`;
        } else if (totalBytes === 0 && downloadedBytes > 0) {
          const doneMB  = (downloadedBytes / (1024 * 1024)).toFixed(1);
          // totalBytes = 0 means no Content-Length (size unknown), not necessarily a live stream
          statusText = `Downloading… ${effectivePct}%${speedStr} (${doneMB} MB)`;
        }
        toast(makeToastNode(streamLabel, statusText, qualityLabel, effectivePct), {
          id: filename,
          duration: Infinity,
          action: cancelAction,
        });
      };

      toast(
        makeToastNode(streamLabel, 'Starting server processing…', qualityLabel, 2),
        { id: filename, duration: Infinity, action: cancelAction },
      );

      // ── Poll server-side yt-dlp progress every 1s while the video is being processed
      const doPoll = async () => {
        if (serverDone || userCancelled) return;
        try {
          const endpoint = functionName === 'spotify-download' ? 'spotify' : 'youtube';
          const progressUrl = localPy
            ? `${localPy}/${endpoint}/progress?filename=${encodeURIComponent(filename)}`
            : `/functions/v1/${functionName}?action=progress&filename=${encodeURIComponent(filename)}`;
          const r = await fetch(progressUrl);
          if (!r.ok) return;
          const data = await r.json();
          const pct: number = data.progress ?? 0;
          showServerProgress(pct, data.downloaded_bytes ?? 0, data.total_bytes ?? 0, data.speed ?? 0);
        } catch {
          /* network blip – keep polling */
        }
      };

      progressInterval = setInterval(doPoll, 1000);
      visibilityHandler = () => {
        if (document.visibilityState === 'visible') void doPoll();
      };
      document.addEventListener('visibilitychange', visibilityHandler);

      // Safety timeout – clear everything after 30 minutes
      maxPollTimer = setTimeout(() => {
        stopPolling();
        if (!serverDone && !userCancelled) toast.dismiss(filename);
      }, 30 * 60 * 1000);

      // ── Trigger the actual download via fetch stream (NOT native <a> click).
      //   This lets the AbortController cancel it immediately — the browser
      //   will NOT start a separate download when the user clicks Cancel.
      try {
        let res = await fetchWithRetry(proxied, {
          headers: { Accept: '*/*' },
          signal: controller.signal,
        });

        if (userCancelled) return;

        // Fallback to Serverless Worker download if the Python backend download fails (e.g. returns 500 bot blocks)
        if (!res.ok && localPy) {
          console.warn(`Python backend download failed with status ${res.status}. Falling back to serverless Worker downloader...`);
          const workerProxied = proxyUrl(fileUrl, filename, functionName, options, null);
          res = await fetchWithRetry(workerProxied, {
            headers: { Accept: '*/*' },
            signal: controller.signal,
          });
        }

        if (!res.ok) throw new Error(await readDownloadError(res));

        const contentType = res.headers.get('Content-Type') || '';
        if (contentType.toLowerCase().includes('text/html')) {
          throw new Error('Server returned HTML page instead of file. The downloader may be blocked or misconfigured.');
        }

        // Switch from yt-dlp polling to byte-level transfer progress
        stopPolling();

        const contentLength = res.headers.get('Content-Length');
        const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
        let receivedBytes = 0;
        const chunks: Uint8Array[] = [];
        const reader = res.body?.getReader();

        if (reader) {
          while (true) {
            if (userCancelled) { await reader.cancel(); return; }
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              receivedBytes += value.length;
              const pct = totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : highestPct;
              const doneMB = (receivedBytes / (1024 * 1024)).toFixed(1);
              const totalMBStr = totalBytes > 0 ? ` / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB` : ' MB';
              toast(makeToastNode(streamLabel, `Saving to browser… ${pct}% (${doneMB}${totalMBStr})`, qualityLabel, pct), {
                id: filename,
                duration: Infinity,
                action: cancelAction,
              });
            }
          }
        } else {
          const blob = await res.blob();
          chunks.push(new Uint8Array(await blob.arrayBuffer()));
          receivedBytes = chunks[0].length;
        }

        if (userCancelled) return;

        // Assemble blob and trigger save dialog
        const concatenated = new Uint8Array(receivedBytes);
        let offset = 0;
        for (const chunk of chunks) { concatenated.set(chunk, offset); offset += chunk.length; }
        const blob = new Blob([concatenated], { type: res.headers.get('Content-Type') || 'video/mp4' });
        const objectUrl = URL.createObjectURL(blob);
        clickDownloadLink(objectUrl, filename);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

        await finishToast();
      } catch (fetchErr) {
        if (userCancelled) return;
        if (fetchErr instanceof Error && fetchErr.name === 'AbortError') return;
        stopPolling();
        const msg = fetchErr instanceof Error ? fetchErr.message : 'Download failed';
        toast.error(msg, { id: filename });
      }

      return;
    }

    // ── Non-YouTube: fast CDN links → standard blob approach with progress ──
    const controller = new AbortController();
    const cancelAction = {
      label: 'Cancel',
      onClick: () => {
        controller.abort();
        toast.dismiss(filename);
        toast.error('Download cancelled', { id: filename });
      },
    };

    toast(
      makeToastNode(streamLabel, 'Starting download…', qualityLabel, 2),
      { id: filename, duration: Infinity, action: cancelAction }
    );

    const res = await fetchWithRetry(proxied, { headers: { Accept: '*/*' }, signal: controller.signal });
    if (!res.ok) throw new Error(await readDownloadError(res));

    const contentType = res.headers.get('Content-Type') || '';
    if (contentType.toLowerCase().includes('text/html')) {
      throw new Error('Server returned HTML page instead of file. The downloader may be blocked or misconfigured.');
    }

    const contentLengthHeader = res.headers.get('Content-Length');
    const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
    let receivedBytes = 0;
    const chunks: Uint8Array[] = [];
    const reader = res.body?.getReader();
    let blob: Blob;
    let buffer: ArrayBuffer;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedBytes += value.length;
          
          const pct = totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 0;
          const doneMB = (receivedBytes / (1024 * 1024)).toFixed(1);
          const totalMBStr = totalBytes > 0 ? ` / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB` : ' MB';
          
          const statusText = totalBytes > 0
            ? `Downloading… ${pct}% (${doneMB}${totalMBStr})`
            : `Downloading… ${doneMB}${totalMBStr}`;

          toast(
            makeToastNode(streamLabel, statusText, qualityLabel, pct),
            { id: filename, duration: Infinity, action: cancelAction }
          );
        }
      }
      const concatenated = new Uint8Array(receivedBytes);
      let offset = 0;
      for (const chunk of chunks) { concatenated.set(chunk, offset); offset += chunk.length; }
      buffer = concatenated.buffer;
    } else {
      buffer = await res.arrayBuffer();
    }

    if (contentType.toLowerCase().startsWith('video/') && filename.toLowerCase().endsWith('.mp3')) {
      toast(
        makeToastNode(streamLabel, 'Decoding audio track in browser…', qualityLabel, 96),
        { id: filename, duration: Infinity, action: cancelAction }
      );
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioCtx.decodeAudioData(buffer);
      } catch (err) {
        throw new Error("Could not decode audio from this video format. Make sure the video contains audio.");
      } finally {
        await audioCtx.close();
      }
      
      toast(
        makeToastNode(streamLabel, 'Loading MP3 encoder…', qualityLabel, 98),
        { id: filename, duration: Infinity, action: cancelAction }
      );
      const lamejs = await loadLamejs();
      
      const numOfChan = audioBuffer.numberOfChannels;
      const mp3encoder = new lamejs.Mp3Encoder(numOfChan, audioBuffer.sampleRate, 192); // 192kbps
      const mp3Data: any[] = [];
      
      let lastToastTime = 0;
      const updateEncodingToast = (currentOffset: number, totalSamples: number, currentData: any[]) => {
        const now = Date.now();
        if (now - lastToastTime > 150 || currentOffset >= totalSamples - 1152) {
          lastToastTime = now;
          const pct = Math.min(99, 96 + Math.round((currentOffset / totalSamples) * 3));
          const encodedBytes = currentData.reduce((acc, chunk) => acc + chunk.length, 0);
          const doneMB = (encodedBytes / (1024 * 1024)).toFixed(1);
          toast(
            makeToastNode(streamLabel, `Encoding to high-quality MP3… ${pct}% (${doneMB} MB)`, qualityLabel, pct),
            { id: filename, duration: Infinity, action: cancelAction }
          );
        }
      };

      if (numOfChan === 2) {
        const left = new Int16Array(audioBuffer.length);
        const right = new Int16Array(audioBuffer.length);
        const leftChan = audioBuffer.getChannelData(0);
        const rightChan = audioBuffer.getChannelData(1);
        for (let i = 0; i < audioBuffer.length; i++) {
          left[i] = Math.max(-1, Math.min(1, leftChan[i])) * 32767;
          right[i] = Math.max(-1, Math.min(1, rightChan[i])) * 32767;
        }
        
        const sampleBlockSize = 1152;
        for (let i = 0; i < audioBuffer.length; i += sampleBlockSize) {
          const leftChunk = left.subarray(i, i + sampleBlockSize);
          const rightChunk = right.subarray(i, i + sampleBlockSize);
          const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
          if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
          }
          updateEncodingToast(i, audioBuffer.length, mp3Data);
        }
      } else {
        const mono = new Int16Array(audioBuffer.length);
        const monoChan = audioBuffer.getChannelData(0);
        for (let i = 0; i < audioBuffer.length; i++) {
          mono[i] = Math.max(-1, Math.min(1, monoChan[i])) * 32767;
        }
        
        const sampleBlockSize = 1152;
        for (let i = 0; i < audioBuffer.length; i += sampleBlockSize) {
          const monoChunk = mono.subarray(i, i + sampleBlockSize);
          const mp3buf = mp3encoder.encodeMono(monoChunk);
          if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
          }
          updateEncodingToast(i, audioBuffer.length, mp3Data);
        }
      }
      
      const mp3buf = mp3encoder.flush();
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
      
      blob = new Blob(mp3Data, { type: 'audio/mp3' });
    } else {
      blob = new Blob([buffer], { type: contentType || 'application/octet-stream' });
    }

    const objectUrl = URL.createObjectURL(blob);
    clickDownloadLink(objectUrl, filename);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

    const elapsed = Date.now() - toastStartTime;
    if (elapsed < 1500) {
      await sleep(1500 - elapsed);
    }

    toast.dismiss(filename);
    toast.success(
      React.createElement(
        'div',
        { className: 'flex flex-col gap-1' },
        React.createElement(
          'div',
          { className: 'flex items-center gap-2' },
          React.createElement('span', { className: 'font-semibold text-foreground text-sm' }, 'File saved to Downloads folder'),
          React.createElement(
            'span',
            { className: 'px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold text-[9px] uppercase tracking-wider border border-emerald-500/20' },
            'Saved',
          ),
        ),
        React.createElement(
          'span',
          { className: 'text-xs text-muted-foreground font-medium truncate max-w-[260px] opacity-80' },
          filename,
        ),
      ),
      { duration: 8000 },
    );
  } catch (err) {
    if (progressInterval)   clearInterval(progressInterval);
    if (maxPollTimer)       clearTimeout(maxPollTimer);
    if (visibilityHandler)  document.removeEventListener('visibilitychange', visibilityHandler);
    if (err instanceof Error && err.name === 'AbortError') return;
    const msg = err instanceof Error ? err.message : 'Download failed';
    toast.error(msg, { id: filename });
  }
};

export const triggerDownload = async (fileUrl: string, filename: string) =>
  triggerDownloadVia("tiktok-download", fileUrl, filename);

export const downloadSlideshowZip = async (images: string[], baseName: string) => {
  const id = `zip-${baseName}`;
  try {
    toast.loading(`Packaging ${images.length} images...`, { id });
    const zip = new JSZip();
    const folder = zip.folder(baseName) ?? zip;
    await Promise.all(
      images.map(async (imgUrl, idx) => {
        const res = await fetchWithRetry(proxyUrl(imgUrl, `${idx + 1}.jpg`), {
          headers: {
            Accept: "*/*",
          },
        });
        if (!res.ok) throw new Error(await readDownloadError(res));
        const blob = await res.blob();
        folder.file(`${String(idx + 1).padStart(2, "0")}.jpg`, blob);
      }),
    );
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const objectUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${baseName}-images.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    toast.dismiss(id);
    toast.success(
      React.createElement(
        "div",
        { className: "flex flex-col gap-1" },
        React.createElement(
          "div",
          { className: "flex items-center gap-2" },
          React.createElement(
            "span",
            { className: "font-semibold text-foreground text-sm" },
            "File saved to Downloads folder"
          ),
          React.createElement(
            "span",
            { className: "px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold text-[9px] uppercase tracking-wider border border-emerald-500/20" },
            "Saved"
          )
        ),
        React.createElement(
          "span",
          { className: "text-xs text-muted-foreground font-medium truncate max-w-[260px] opacity-80" },
          `${baseName}-images.zip`
        )
      ),
      {
        duration: 8000,
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ZIP failed";
    toast.error(msg, { id });
  }
};

export type ZipItem = {
  url: string;
  filename: string;
  functionName?: string;
  mergeStrategy?: MergeStrategy | null;
  mergeAudioUrl?: string | null;
};

export const downloadMixedZip = async (
  items: ZipItem[],
  baseName: string,
  defaultFunctionName = "tiktok-download",
  onProgress?: (done: number, total: number, current: string) => void,
  signal?: AbortSignal,
  onCancel?: () => void,
) => {
  const id = `zip-${baseName}`;

  const showToast = (message: string) =>
    toast(message, {
      id,
      duration: Infinity,
      ...(onCancel
        ? {
            action: {
              label: "Cancel",
              onClick: () => {
                onCancel();
                toast.error("ZIP cancelled", { id });
              },
            },
          }
        : {}),
    });

  try {
    const localPy = await checkLocalPythonBackend();
    showToast(`Packaging ${items.length} files...`);
    const zip = new JSZip();
    const folder = zip.folder(baseName) ?? zip;
    let done = 0;
    const failed: string[] = [];
    const ITEM_TIMEOUT_MS = 3 * 60 * 1000;
    const CONCURRENCY = 4;

    // Download up to CONCURRENCY tracks at the same time.
    const downloadItem = async (item: ZipItem): Promise<{ filename: string; blob: Blob | null }> => {
      if (signal?.aborted) throw new Error("Download cancelled");
      const itemController = new AbortController();
      const timeoutId = setTimeout(() => itemController.abort(), ITEM_TIMEOUT_MS);
      const onUserCancel = () => itemController.abort();
      signal?.addEventListener("abort", onUserCancel);
      try {
        const res = await fetchWithRetry(
          proxyUrl(item.url, item.filename, item.functionName || defaultFunctionName, item, localPy),
          { headers: { Accept: "*/*" }, signal: itemController.signal },
        );
        if (!res.ok) return { filename: item.filename, blob: null };
        const blob = await res.blob();
        return { filename: item.filename, blob };
      } catch {
        if (signal?.aborted) throw new Error("Download cancelled");
        return { filename: item.filename, blob: null };
      } finally {
        clearTimeout(timeoutId);
        signal?.removeEventListener("abort", onUserCancel);
      }
    };

    // Process in waves of CONCURRENCY, updating the toast as each wave finishes.
    for (let i = 0; i < items.length; i += CONCURRENCY) {
      if (signal?.aborted) throw new Error("Download cancelled");
      const batch = items.slice(i, i + CONCURRENCY);
      showToast(`Downloading ${Math.min(i + CONCURRENCY, items.length)}/${items.length} tracks...`);
      const results = await Promise.all(batch.map(downloadItem));
      for (const { filename, blob } of results) {
        if (blob) {
          folder.file(filename, blob);
        } else {
          failed.push(filename);
        }
        done += 1;
        onProgress?.(done, items.length, filename);
      }
    }

    const succeeded = items.length - failed.length;
    if (succeeded === 0) {
      throw new Error(`All ${items.length} files failed to download. They may be unavailable or restricted.`);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const objectUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${baseName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    toast.dismiss(id);

    const successMsg = failed.length > 0
      ? `${succeeded} of ${items.length} files saved — ${failed.length} skipped (unavailable)`
      : "File saved to Downloads folder";

    toast.success(
      React.createElement(
        "div",
        { className: "flex flex-col gap-1" },
        React.createElement(
          "div",
          { className: "flex items-center gap-2" },
          React.createElement(
            "span",
            { className: "font-semibold text-foreground text-sm" },
            successMsg
          ),
          React.createElement(
            "span",
            { className: "px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold text-[9px] uppercase tracking-wider border border-emerald-500/20" },
            "Saved"
          )
        ),
        React.createElement(
          "span",
          { className: "text-xs text-muted-foreground font-medium truncate max-w-[260px] opacity-80" },
          `${baseName}.zip`
        )
      ),
      {
        duration: 8000,
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ZIP failed";
    if (msg !== "Download cancelled") toast.error(msg, { id });
    throw err;
  }
};

export const downloadProxyOptionsFromMedia = (download: Pick<MediaDownload, "mergeStrategy" | "mergeAudioUrl" | "label" | "quality">): DownloadProxyOptions => ({
  mergeStrategy: download.mergeStrategy ?? null,
  mergeAudioUrl: download.mergeAudioUrl ?? null,
  quality: download.quality || download.label || null,
});
