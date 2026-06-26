import { GIFEncoder, quantize, applyPalette } from "gifenc";

/** Max dimension sent to remove.bg after raster resize. */
export const MAX_REMOVE_BG_EDGE = 1600;

/** GIF input larger than this uses first-frame / trimmed blob path (Edge JSON body limits). */
export const LARGE_GIF_BYTES = 4 * 1024 * 1024;

/** Only the first N bytes of a GIF are kept client-side (truncated stream may still decode early frames). */
export const MAX_GIF_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Browsers often omit or misreport MIME on GIFs; use extension + preview data URL too. */
export function shouldTreatAsGif(file: File, previewDataUrl: string | null): boolean {
  if (file.type === "image/gif") return true;
  if (/\.gif$/i.test(file.name)) return true;
  if (previewDataUrl?.startsWith("data:image/gif")) return true;
  return false;
}

/** remove.bg returns PNG (sometimes labeled oddly); accept PNG/WebP raster cutouts for GIF encoding. */
export function isRasterCutoutDataUrl(url: string): boolean {
  return /^data:image\/(png|webp)\b/i.test(url);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}

/** Raster image / GIF (first decoded frame) → downscaled JPEG data URL. `src` may be a blob URL or data URL. */
export async function rasterToJpegDataUrl(src: string, maxEdge = MAX_REMOVE_BG_EDGE, quality = 0.88): Promise<string> {
  const img = await loadImage(src);
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/jpeg", quality);
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Single-frame transparent GIF from a PNG data URL (e.g. remove.bg output).
 */
export async function pngDataUrlToTransparentGifDataUrl(pngDataUrl: string): Promise<string> {
  const img = await loadImage(pngDataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);

  const palette = quantize(data, 256, {
    format: "rgba4444",
    oneBitAlpha: true,
    clearAlpha: true,
    clearAlphaThreshold: 128,
    clearAlphaColor: 0x000000,
  });
  const index = applyPalette(data, palette, "rgba4444");

  let transparentIndex = 0;
  let hasTransparency = false;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    if (Array.isArray(p) && p.length >= 4 && p[3] === 0) {
      transparentIndex = i;
      hasTransparency = true;
      break;
    }
  }

  const gif = GIFEncoder();
  gif.writeFrame(index, w, h, {
    palette,
    transparent: hasTransparency,
    transparentIndex,
    delay: 0,
  });
  gif.finish();
  return `data:image/gif;base64,${bytesToBase64(gif.bytes())}`;
}

/**
 * Sample one frame from a video file (browser-local). remove.bg has no video API;
 * we remove the background of a representative frame.
 */
export async function videoFrameToJpegDataUrl(
  file: File,
  maxEdge = MAX_REMOVE_BG_EDGE,
  seekRatio = 0.12,
): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.crossOrigin = "anonymous";
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not load video"));
    });

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Video has no duration");
    }

    const t = Math.min(duration * seekRatio, Math.max(0.05, duration - 0.05));
    video.currentTime = t;

    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Could not seek video"));
    });

    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) throw new Error("Could not read video dimensions");

    const scale = Math.min(1, maxEdge / Math.max(vw, vh));
    const cw = Math.max(1, Math.round(vw * scale));
    const ch = Math.max(1, Math.round(vh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(video, 0, 0, cw, ch);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}
