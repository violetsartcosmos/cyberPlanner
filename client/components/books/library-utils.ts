import type { LibraryBook } from "../../../shared/planner/books";

export type LibraryFilter = "all" | "ebooks" | "audio";

export function shuffleBooks(books: readonly LibraryBook[]): LibraryBook[] {
  const shuffled = [...books];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function matchesLibraryFilter(book: LibraryBook, query: string, filter: LibraryFilter): boolean {
  return book.path.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
    (filter === "all" || (filter === "audio" ? book.format === "m4b" : book.format !== "m4b"));
}
