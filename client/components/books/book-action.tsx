import type { LibraryBook } from "../../../shared/planner/books";
import { bookUrl } from "./book-url";

export function BookAction({ book, onRead, epubLabel = "Read" }: {
  book: LibraryBook;
  onRead: () => void;
  epubLabel?: string;
}) {
  if (book.format === "pdf") {
    return <a href={bookUrl(book)} target="_blank" rel="noopener noreferrer">Open PDF</a>;
  }
  return <button type="button" onClick={onRead}>{book.format === "m4b" ? "Listen" : epubLabel}</button>;
}
