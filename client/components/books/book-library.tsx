import { useEffect, useState } from "react";
import { ReactReader } from "react-reader";
import type { LibraryBook } from "../../../shared/planner/books";
import { BookDetails } from "./book-details";
import { bookUrl } from "./book-url";
import { AudioPlayer } from "./audio-player";

function EpubReader({ book, onClose }: { book: LibraryBook; onClose: () => void }) {
  const storageKey = `cyberplanner-book:${book.path}`;
  const [position, setPosition] = useState<{ location: string | number; error: string }>(() => {
    try {
      return { location: localStorage.getItem(storageKey) ?? 0, error: "" };
    } catch {
      return { location: 0, error: "Reading position could not be loaded from this browser." };
    }
  });

  function locationChanged(next: string) {
    try {
      localStorage.setItem(storageKey, next);
      setPosition({ location: next, error: "" });
    } catch {
      setPosition({ location: next, error: "Reading position could not be saved in this browser." });
    }
  }

  return (
    <section className="panel library-reader" aria-label={`Reading ${book.title}`}>
      <div className="library-reader-heading">
        <h2>{book.title}</h2>
        <button type="button" onClick={onClose}>Back to library</button>
      </div>
      {position.error && <p role="alert">{position.error}</p>}
      <div className="library-reader-view">
        <ReactReader
          url={bookUrl(book)}
          location={position.location}
          locationChanged={locationChanged}
          epubInitOptions={{ openAs: "epub" }}
          errorView={<p role="alert">Could not open this EPUB. It may be damaged or DRM-protected.</p>}
        />
      </div>
    </section>
  );
}

export function BookLibrary() {
  const [books, setBooks] = useState<LibraryBook[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LibraryBook | null>(null);
  const [detailsBook, setDetailsBook] = useState<LibraryBook | null>(null);

  useEffect(function loadLibrary() {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/books", { signal: controller.signal });
        if (!response.ok) throw new Error(`Could not load the library (${response.status}).`);
        setBooks(await response.json() as LibraryBook[]);
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : "Could not load the library.");
        }
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  if (selected) {
    if (selected.format === "m4b") {
      return <AudioPlayer key={selected.path} book={selected} onClose={() => setSelected(null)} />;
    }
    return <EpubReader key={selected.path} book={selected} onClose={() => setSelected(null)} />;
  }
  if (detailsBook) {
    return <BookDetails key={detailsBook.path} book={detailsBook} onClose={() => setDetailsBook(null)} onRead={() => setSelected(detailsBook)} />;
  }

  const filtered = books?.filter((book) => book.path.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return (
    <section className="panel library-panel">
      <div className="library-heading">
        <div>
          <p className="eyebrow accent">YOUR READING SPACE</p>
          <h2>Bookshelf</h2>
          <p>Read EPUBs, open PDFs, or listen to compatible M4B audiobooks.</p>
        </div>
        <label>
          <span>Search books</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title or folder" />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {!books && !error && <p>Loading library...</p>}
      {books && books.length === 0 && <p>No books found. Add EPUBs or PDFs to ebooks, or M4B files to audiblebooks, and refresh this page.</p>}
      {books && books.length > 0 && filtered?.length === 0 && <p>No books match your search.</p>}
      {filtered && filtered.length > 0 && (
        <ul className="library-list">
          {filtered.map((book) => (
            <li key={`${book.library ?? "ebooks"}:${book.path}`}>
              <div>
                <strong>{book.title}</strong>
                <small>{book.library === "audiblebooks" ? "Audiobooks" : "Ebooks"}{book.path.includes("/") ? ` / ${book.path.slice(0, book.path.lastIndexOf("/"))}` : ""} · {book.format.toUpperCase()}</small>
              </div>
              <div className="library-book-actions">
                {book.format === "epub"
                  ? <button type="button" onClick={() => setSelected(book)}>Read</button>
                  : book.format === "m4b"
                    ? <button type="button" onClick={() => setSelected(book)}>Listen</button>
                    : <a href={bookUrl(book)} target="_blank" rel="noopener noreferrer">Open PDF</a>}
                <button type="button" onClick={() => setDetailsBook(book)}>Details</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
