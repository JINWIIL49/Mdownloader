import { useCallback, useEffect, useState } from "react";
import type { HistoryEntry } from "@/lib/media";
import { normalizeHistoryEntry } from "@/lib/history";

const KEY = "mdownloader:history";
const MAX = 20;

const read = (): HistoryEntry[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeHistoryEntry).filter((item): item is HistoryEntry => Boolean(item));
  } catch {
    return [];
  }
};

export const useDownloadHistory = () => {
  const [items, setItems] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setItems(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setItems(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = (next: HistoryEntry[]) => {
    setItems(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* quota exceeded — ignore */
    }
  };

  const add = useCallback((item: Omit<HistoryEntry, "id" | "savedAt">) => {
    const base = item.creator.handle || item.platform || "download";
    const next: HistoryEntry = { ...item, id: `${base}-${Date.now()}`, savedAt: Date.now() };
    const filtered = read().filter((h) => h.url !== item.url);
    const updated = [next, ...filtered].slice(0, MAX);
    persist(updated);
  }, []);

  const remove = useCallback((id: string) => {
    persist(read().filter((h) => h.id !== id));
  }, []);

  const clear = useCallback(() => persist([]), []);

  return { items, add, remove, clear };
};
