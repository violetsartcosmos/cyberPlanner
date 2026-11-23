import type { LibraryBook } from "../../../shared/planner/books";

export function bookUrl(book: LibraryBook) {
  return `/api/books/file?${bookQuery(book)}`;
}

export function bookQuery(book: LibraryBook) {
  return new URLSearchParams({ path: book.path, ...(book.library ? { library: book.library } : {}) });
}

export function bookCoverUrl(book: LibraryBook) {
  return `/api/books/cover?${bookQuery(book)}`;
}
