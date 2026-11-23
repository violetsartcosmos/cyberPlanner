import { useEffect, useRef, useState } from "react";
import { ReactReader } from "react-reader";
import { ArrowRight, BookOpen, Headphones, Search } from "lucide-react";
import type { LibraryBook } from "../../../shared/planner/books";
import { BookDetails } from "./book-details";
import { bookUrl } from "./book-url";
import { AudioPlayer } from "./audio-player";
import { useEmbeddedDetails } from "./use-embedded-details";

function BookCover({ book, index, onClick }: { book: LibraryBook; index: number; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const { embedded, error } = useEmbeddedDetails(book, visible);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "100px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <button ref={ref} type="button" className={`library-book-cover library-book-cover-${index % 5}`} onClick={onClick} aria-label={`View details for ${book.title}`} title={error ? `Cover unavailable: ${error}` : undefined}>
      {embedded?.cover
        ? <img src={embedded.cover} alt="" />
        : <>
          <span>{error ? "COVER UNAVAILABLE" : book.format === "m4b" ? "AUDIOBOOK" : "YOUR LIBRARY"}</span>
          <strong>{book.title}</strong>
          {book.format === "m4b" ? <Headphones size={22} aria-hidden="true" /> : <BookOpen size={22} aria-hidden="true" />}
        </>}
    </button>
  );
}

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
  const [filter, setFilter] = useState<"all" | "ebooks" | "audio">("all");
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

  const filtered = books?.filter((book) =>
    book.path.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
    (filter === "all" || (filter === "audio" ? book.format === "m4b" : book.format !== "m4b")),
  );
  const featured = filtered?.[0];
  return (
    <section className="panel library-panel">
      <div className="library-heading">
        <div>
          <p className="library-kicker"><span /> YOUR PERSONAL LIBRARY</p>
          <h2>Good books.<br /><em>Brighter minds.</em></h2>
          <p>A little space to read, listen, and get lost in a good story.</p>
        </div>
        <label className="library-search">
          <Search size={18} aria-hidden="true" />
          <span className="library-visually-hidden">Search books</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or folder" />
        </label>
      </div>
      <div className="library-filters" aria-label="Filter library">
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All books</button>
        <button type="button" aria-pressed={filter === "ebooks"} onClick={() => setFilter("ebooks")}>Ebooks</button>
        <button type="button" aria-pressed={filter === "audio"} onClick={() => setFilter("audio")}>Audiobooks</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!books && !error && <p>Loading library...</p>}
      {books && books.length === 0 && <p>No books found. Add EPUBs or PDFs to ebooks, or M4B files to audiblebooks, and refresh this page.</p>}
      {books && books.length > 0 && filtered?.length === 0 && <p>No books match your search and filter.</p>}
      {featured && (
        <div className="library-feature">
          <div className="library-feature-copy">
            <p className="library-kicker">A LITTLE SOMETHING FOR YOU</p>
            <h3>Make time<br />for a good book.</h3>
            <p>Your next escape is already on your shelf.</p>
            <button type="button" onClick={() => setDetailsBook(featured)}>
              Explore this book <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
          <div className="library-feature-art" aria-hidden="true">
            <div className="library-feature-book">
              <span>{featured.format === "m4b" ? "LISTEN & DISCOVER" : "READ & DISCOVER"}</span>
              <strong>{featured.title}</strong>
              <BookOpen size={26} />
            </div>
          </div>
          <div className="library-feature-caption"><span>FROM YOUR COLLECTION</span><strong>{featured.title}</strong></div>
        </div>
      )}
      {filtered && filtered.length > 0 && (
        <>
        <div className="library-shelf-heading">
          <div><p className="library-kicker">YOUR COLLECTION</p><h3>On your bookshelf</h3></div>
          <span>{filtered.length} {filtered.length === 1 ? "book" : "books"}</span>
        </div>
        <ul className="library-list">
          {filtered.map((book, index) => (
            <li key={`${book.library ?? "ebooks"}:${book.path}`}>
              <BookCover book={book} index={index} onClick={() => setDetailsBook(book)} />
              <strong className="library-book-title">{book.title}</strong>
              <small>{book.format.toUpperCase()} {book.path.includes("/") ? `· ${book.path.slice(0, book.path.lastIndexOf("/"))}` : ""}</small>
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
        </>
      )}
    </section>
  );
}
