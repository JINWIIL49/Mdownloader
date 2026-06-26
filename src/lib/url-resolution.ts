import { invokePublicFunction } from "@/lib/public-functions";

export const isTinyUrl = (value: string) =>
  /https?:\/\/(?:www\.)?(?:tinyurl\.com|tiny\.one)\//i.test(value);

export const resolveInputUrl = async (value: string) => {
  const trimmed = value.trim();
  if (!isTinyUrl(trimmed)) {
    return { url: trimmed, resolved: false };
  }

  const data = await invokePublicFunction<{ resolvedUrl?: string }>("tinyurl-tools", {
    action: "resolve",
    url: trimmed,
  });

  return {
    url: data?.resolvedUrl ?? trimmed,
    resolved: true,
  };
};
