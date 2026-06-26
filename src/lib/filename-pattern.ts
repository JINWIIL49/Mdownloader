// Apply a custom filename pattern with tokens.
// Supported tokens: {username}, {type}, {index}, {index2}, {ext}, {original}
// Index is 1-based. {index2} pads to 2 digits.

export type PatternContext = {
  username?: string | null;
  type?: string | null; // e.g. "video", "image", "audio", "reel"
  index?: number;
  total?: number;
  original: string; // original filename (with extension)
  title?: string | null; // actual media title
};

const sanitize = (value: string) =>
  value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "file";

export const splitExt = (filename: string): { base: string; ext: string } => {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return { base: filename, ext: "" };
  return { base: filename.slice(0, dot), ext: filename.slice(dot + 1) };
};

export const applyPattern = (pattern: string, ctx: PatternContext): string => {
  const { base: origBase, ext: origExt } = splitExt(ctx.original);
  
  const isAudio = ctx.type === "audio" || (origExt && ["m4a", "webm", "wav", "mp3", "ogg", "aac", "flac"].includes(origExt.toLowerCase()));
  const extToUse = isAudio ? "mp3" : (origExt || "bin");
  const actualOrigExt = isAudio ? "mp3" : origExt;

  const replacements: Record<string, string> = {
    "{username}": ctx.username ? sanitize(ctx.username) : "user",
    "{type}": ctx.type ? sanitize(ctx.type) : "media",
    "{index}": String(ctx.index ?? 1),
    "{index2}": String(ctx.index ?? 1).padStart(2, "0"),
    "{ext}": extToUse,
    "{original}": sanitize(origBase),
    "{title}": ctx.title ? sanitize(ctx.title) : "title",
  };

  let out = pattern;
  for (const [key, val] of Object.entries(replacements)) {
    out = out.split(key).join(val);
  }

  // Ensure extension present
  const { ext } = splitExt(out);
  if (!ext && actualOrigExt) out = `${out}.${actualOrigExt}`;
  
  // Ensure all audio files strictly end with .mp3
  if (isAudio && !out.toLowerCase().endsWith(".mp3")) {
    const { base } = splitExt(out);
    out = `${base}.mp3`;
  }
  
  return sanitize(out);
};

export const DEFAULT_PATTERN = "{username} - {title}.{ext}";
