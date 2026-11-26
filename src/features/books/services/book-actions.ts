import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import type { BookBookmark, LibraryBook, WikipediaDetails } from "../../../../shared/planner/books";

/** Book operation feedback with the renamed file or saved article when needed. */
export type BookActionResult = {
  status: number;
  error?: string;
  message?: string;
  book?: LibraryBook;
  wiki?: WikipediaDetails;
};

/** Saved book metadata returned by resource loaders. */
export type BookReadResult = {
  status: number;
  error?: string;
  books?: LibraryBook[];
  bookmarks?: BookBookmark[];
  wiki?: WikipediaDetails | null;
  chapters?: { title: string; start: number }[];
};

/**
 * Lists the existing book libraries.
 * @param args - The cancellable loader request.
 * @returns The HTTP status and library contents or API error.
 */
export async function booksLoader({ request }: LoaderFunctionArgs): Promise<BookReadResult> {
  const response = await fetch("/api/books", { signal: request.signal });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  return { status: response.status, books: await response.json() as LibraryBook[] };
}

/**
 * Reads saved Wikipedia details for a book without changing its API contract.
 * @param args - The library and book path parameters and cancellable request.
 * @returns The HTTP status and saved article or API error.
 */
export async function bookDetailsLoader({ request, params }: LoaderFunctionArgs): Promise<BookReadResult> {
  const query = new URLSearchParams({ library: params.library as string, path: params.path as string });
  const response = await fetch(`/api/books/details?${query}`, { signal: request.signal });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  return { status: response.status, wiki: await response.json() as WikipediaDetails | null };
}

/**
 * Saves the article and downloaded cover prepared by the Wikipedia import form.
 * @param args - The book identity parameters and serialized article/cover form fields.
 * @returns The HTTP status and cached article or API error.
 */
export async function saveBookDetailsAction({ request, params }: ActionFunctionArgs): Promise<BookActionResult> {
  const form = await request.formData();
  const details = JSON.parse(form.get("details") as string) as WikipediaDetails;
  const cover = JSON.parse(form.get("cover") as string) as { type: string; data: string } | null;
  const response = await fetch("/api/books/details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: params.path, library: params.library, details, cover }),
    signal: request.signal,
  });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  return { status: response.status, wiki: { ...details, image: details.image ? { ...details.image, cached: true } : null } };
}

/**
 * Renames a book through the existing file-rename domain operation.
 * @param args - The library and book path parameters and new title form field.
 * @returns The HTTP status and renamed book or API error.
 */
export async function renameBookAction({ request, params }: ActionFunctionArgs): Promise<BookActionResult> {
  const form = await request.formData();
  const response = await fetch("/api/books/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: params.path, library: params.library, title: form.get("title") }),
    signal: request.signal,
  });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  return { status: response.status, book: await response.json() as LibraryBook };
}

/**
 * Lists bookmarks for one book.
 * @param args - The library and path parameters and cancellable request.
 * @returns The HTTP status and bookmarks or API error.
 */
export async function bookmarksLoader({ request, params }: LoaderFunctionArgs): Promise<BookReadResult> {
  const query = new URLSearchParams({ library: params.library as string, path: params.path as string });
  const response = await fetch(`/api/books/bookmarks?${query}`, { signal: request.signal });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  return { status: response.status, bookmarks: await response.json() as BookBookmark[] };
}

/**
 * Loads audiobook chapter markers from the existing book endpoint.
 * @param args - The library and path parameters and cancellable request.
 * @returns The HTTP status and chapter markers or API error.
 */
export async function chaptersLoader({ request, params }: LoaderFunctionArgs): Promise<BookReadResult> {
  const query = new URLSearchParams({ library: params.library as string, path: params.path as string });
  const response = await fetch(`/api/books/chapters?${query}`, { signal: request.signal });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  return { status: response.status, chapters: await response.json() as { title: string; start: number }[] };
}

/**
 * Adds a bookmark using the book identity from the resource URL.
 * @param args - The library and path parameters and bookmark position/label fields.
 * @returns The HTTP status and save notification or API error.
 */
export async function createBookmarkAction({ request, params }: ActionFunctionArgs): Promise<BookActionResult> {
  const form = await request.formData();
  const response = await fetch("/api/books/bookmarks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ library: params.library, path: params.path, position: form.get("position"), label: form.get("label") }),
    signal: request.signal,
  });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  return { status: response.status, message: "Bookmark saved." };
}

/**
 * Removes a bookmark using its resource ID.
 * @param args - The library, path and bookmark ID parameters and DELETE request.
 * @returns The HTTP status and removal notification or API error.
 */
export async function deleteBookmarkAction({ request, params }: ActionFunctionArgs): Promise<BookActionResult> {
  const query = new URLSearchParams({ library: params.library as string, path: params.path as string, id: params.id as string });
  const response = await fetch(`/api/books/bookmarks?${query}`, { method: "DELETE", signal: request.signal });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  return { status: response.status, message: "Bookmark removed." };
}
