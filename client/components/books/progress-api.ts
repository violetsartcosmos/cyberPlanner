import type { BookProgress, LibraryBook } from "../../../shared/planner/books";
import { bookQuery } from "./book-url";

function isProgress(value: unknown): value is BookProgress {
  return typeof value === "object" && value !== null && "position" in value &&
    (value.position === null || typeof value.position === "string") &&
    "revision" in value && typeof value.revision === "number" && Number.isInteger(value.revision) && value.revision >= 0;
}

export async function loadProgress(book: LibraryBook): Promise<BookProgress> {
  const response = await fetch(`/api/books/progress?${bookQuery(book)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load progress (${response.status}).`);
  const value: unknown = await response.json();
  if (!isProgress(value)) throw new Error("The server returned invalid progress.");
  return value;
}

export async function writeProgress(book: LibraryBook, position: string, revision: number): Promise<{ progress: BookProgress; conflict: boolean }> {
  const response = await fetch("/api/books/progress", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ library: book.library ?? "ebooks", path: book.path, position, revision }),
    keepalive: true,
  });
  if (!response.ok && response.status !== 409) throw new Error(`Could not save progress (${response.status}).`);
  const value: unknown = await response.json();
  if (!isProgress(value)) throw new Error("The server returned invalid progress.");
  return { progress: value, conflict: response.status === 409 };
}
