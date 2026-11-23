import type { LibraryBook } from "../../../../shared/planner/books";
import { bookUrl } from "../utils/book-url";

export function BookAction({ book, onRead, epubLabel = "Read" }: {
  book: LibraryBook;
  onRead: () => void;
  epubLabel?: string;
}) {
  if (book.format === "pdf") {
    return <a href={bookUrl(book)} target="_blank" rel="noopener noreferrer">Open PDF</a>;
  }
  return <button className="btn btn-outline-secondary btn-sm" type="button" onClick={onRead}>{book.format === "m4b" ? "Listen" : epubLabel}</button>;
}
