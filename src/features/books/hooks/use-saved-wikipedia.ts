import { useEffect, useState } from "react";
import { isWikipediaDetails, type LibraryBook, type WikipediaDetails } from "../../../../shared/planner/books";
import { bookQuery } from "../utils/book-url";

export function useSavedWikipedia(book: LibraryBook, enabled = true) {
  const { path, library } = book;
  const [wiki, setWiki] = useState<WikipediaDetails | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(function loadSavedDetails() {
    if (!enabled) return;
    const controller = new AbortController();
    setReady(false);
    setError("");
    async function load() {
      try {
        const response = await fetch(`/api/books/details?${bookQuery({ path, library })}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Could not load saved Wikipedia details (${response.status}).`);
        const data: unknown = await response.json();
        if (data !== null && !isWikipediaDetails(data)) throw new Error("Saved Wikipedia details are invalid.");
        setWiki(data);
        setReady(true);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load saved details.");
      }
    }
    void load();
    return () => controller.abort();
  }, [path, library, enabled]);

  return { wiki, setWiki, error, setError, ready };
}
