import { useEffect, useState } from "react";
import type { BookBookmark, LibraryBook } from "../../../../shared/planner/books";
import { bookQuery } from "../utils/book-url";

export function useBookmarks(book: LibraryBook) {
  const { path, library } = book;
  const [bookmarks, setBookmarks] = useState<BookBookmark[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(function loadBookmarks() {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/books/bookmarks?${bookQuery({ path, library })}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Could not load bookmarks (${response.status}).`);
        setBookmarks(await response.json() as BookBookmark[]);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load bookmarks.");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [path, library]);

  async function add(position: string, label: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/books/bookmarks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: book.path, library: book.library, position, label }),
      });
      if (!response.ok) throw new Error(`Could not save bookmark (${response.status}).`);
      const bookmark = await response.json() as BookBookmark;
      setBookmarks((current) => [...current, bookmark]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save bookmark.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      const query = bookQuery(book);
      query.set("id", id);
      const response = await fetch(`/api/books/bookmarks?${query}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`Could not remove bookmark (${response.status}).`);
      setBookmarks((current) => current.filter((bookmark) => bookmark.id !== id));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not remove bookmark.");
    } finally {
      setBusy(false);
    }
  }

  return { bookmarks, add, remove, error, busy };
}
