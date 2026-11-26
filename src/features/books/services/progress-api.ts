import type { BookProgress, LibraryBook } from "../../../../shared/planner/books";
import { bookQuery } from "../utils/book-url";

/**
 * Loads the stored reader position and optimistic-concurrency revision.
 * @param book - The library and persisted book path.
 * @returns The progress stored by the resource API.
 */
export async function loadProgress(book: Pick<LibraryBook, "path" | "library">): Promise<BookProgress> {
  const response = await fetch(`/api/books/progress?${bookQuery(book)}`, { cache: "no-store" });
  if (!response.ok) throw new Error((await response.json() as { error: string }).error);
  return await response.json() as BookProgress;
}

/**
 * Saves reader progress with its revision and permits page-exit flushing.
 * @param book - The library and persisted book path.
 * @param position - The EPUB location or audio position.
 * @param revision - The revision on which this write is based.
 * @returns The HTTP status and saved or conflicting database progress.
 */
export async function writeProgress(book: Pick<LibraryBook, "path" | "library">, position: string, revision: number): Promise<{ status: number; progress: BookProgress }> {
  const response = await fetch("/api/books/progress", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ library: book.library ?? "ebooks", path: book.path, position, revision }),
    keepalive: true,
  });
  if (!response.ok && response.status !== 409) throw new Error((await response.json() as { error: string }).error);
  return { status: response.status, progress: await response.json() as BookProgress };
}
