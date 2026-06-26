import { useCallback, useEffect, useState } from "react";

const KEY = "mdownloader:downloads";
export const FREE_DAILY_LIMIT = 6;

interface Usage {
  date: string; // YYYY-MM-DD
  count: number;
}

const today = () => new Date().toISOString().slice(0, 10);

const read = (): Usage => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { date: today(), count: 0 };
    const parsed = JSON.parse(raw) as Usage;
    if (parsed.date !== today()) return { date: today(), count: 0 };
    return parsed;
  } catch {
    return { date: today(), count: 0 };
  }
};

export const useDownloadLimit = (isPro: boolean) => {
  const [usage, setUsage] = useState<Usage>(() => read());

  useEffect(() => {
    setUsage(read());
  }, []);

  const remaining = isPro ? Infinity : Math.max(0, FREE_DAILY_LIMIT - usage.count);
  const canDownload = isPro || remaining > 0;

  const increment = useCallback(() => {
    if (isPro) return;
    const current = read();
    const next: Usage = { date: today(), count: current.count + 1 };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch { /* ignore */ }
    setUsage(next);
  }, [isPro]);

  return { remaining, canDownload, used: usage.count, limit: FREE_DAILY_LIMIT, increment };
};
