import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import type { LibraryBook, WikipediaDetails } from "../../../../shared/planner/books";
import type { BookReadResult } from "../services/book-actions";

/**
 * Loads a book's saved article, retaining lazy cover loading.
 * @param book - The library book whose metadata is requested.
 * @param enabled - Whether the cover or details are currently visible.
 * @returns Saved metadata, its local update callback and request feedback.
 */
export function useSavedWikipedia(book: LibraryBook, enabled = true) {
  const url = `/books/${book.library ?? "ebooks"}/${encodeURIComponent(book.path)}/details`;
  const fetcher = useFetcher<BookReadResult>();
  const { load } = fetcher;
  const [wiki, setWiki] = useState<WikipediaDetails | null>(null);

  useEffect(function loadSavedDetails() {
    if (enabled) void load(url);
  }, [url, enabled, load]);

  useEffect(function applySavedDetails() {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.error) setWiki(fetcher.data.wiki ?? null);
  }, [fetcher.state, fetcher.data]);

  return { wiki, setWiki, error: fetcher.data?.error ?? "", ready: fetcher.state === "idle" && !!fetcher.data && !fetcher.data.error };
}
