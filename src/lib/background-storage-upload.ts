import { supabase } from "@/integrations/supabase/client";

const bucket = import.meta.env.VITE_SUPABASE_UPLOADS_BUCKET ?? "uploads";

/**
 * Uploads a file directly to Supabase Storage from the browser (no base64 in JSON).
 * Required for large videos — Edge Functions reject multi‑MB JSON bodies.
 */
export async function uploadBackgroundFilePublic(file: File): Promise<string> {
  const sanitized = file.name.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-");
  const path = `background-uploads/${Date.now()}-${Math.random().toString(36).slice(2)}-${sanitized}`;
  // Some browsers omit or misreport MIME for GIFs; derive a safe content type.
  const isGifByName = /\.gif$/i.test(file.name);
  const contentType = file.type || (isGifByName ? "image/gif" : undefined);

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
