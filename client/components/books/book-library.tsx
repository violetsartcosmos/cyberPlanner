import { useEffect, useRef, useState } from "react";
import { ReactReader } from "react-reader";
import { ArrowRight, BookOpen, Headphones, Search } from "lucide-react";
import type { LibraryBook } from "../../../shared/planner/books";
import { BookDetails } from "./book-details";
import { BookAction } from "./book-action";
import { bookCoverUrl, bookUrl } from "./book-url";
import { AudioPlayer } from "./audio-player";
import { matchesLibraryFilter, shuffleBooks, type LibraryFilter } from "./library-utils";
import { useEmbeddedDetails } from "./use-embedded-details";
import { useSavedWikipedia } from "./use-saved-wikipedia";
import { useBookmarks } from "./use-bookmarks";
import { useBookProgress } from "./use-book-progress";
import { ProgressStatus } from "./progress-status";

function BookCover({ book, index, onClick }: { book: LibraryBook; index: number; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const { embedded, error } = useEmbeddedDetails(book, visible);
  const { wiki, error: wikiError } = useSavedWikipedia(book, visible);
  const [failedWikiImage, setFailedWikiImage] = useState("");
  const wikiCover = wiki?.image && wiki.image.url !== failedWikiImage ? wiki.image : null;
  const cover = wikiCover ? (wikiCover.cached ? bookCoverUrl(book) : wikiCover.url) : embedded?.cover;
  const coverError = wikiError || (wiki?.image && !wikiCover ? "Wikipedia cover could not be loaded." : error);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "100px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <button ref={ref} type="button" className={`library-book-cover library-book-cover-${index % 5}`} onClick={onClick} aria-label={`View details for ${book.title}`} title={coverError ? `Cover unavailable: ${coverError}` : undefined}>
      {cover
        ? <img src={cover} alt="" referrerPolicy={wikiCover ? "no-referrer" : undefined} onError={wikiCover ? () => setFailedWikiImage(wikiCover.url) : undefined} />
        : <>
          <span>{coverError ? "COVER UNAVAILABLE" : book.format === "m4b" ? "AUDIOBOOK" : "YOUR LIBRARY"}</span>
          <strong>{book.title}</strong>
          {book.format === "m4b" ? <Headphones size={22} aria-hidden="true" /> : <BookOpen size={22} aria-hidden="true" />}
        </>}
    </button>
  );
}

function EpubReader({ book, onClose }: { book: LibraryBook; onClose: () => void }) {
  const { progress, error, conflict, saving, pendingPosition, queue } = useBookProgress(book);
  const [location, setLocation] = useState<string | number | null>(null);
  const displayed = useRef(false);
  const interacted = useRef(false);
  const { bookmarks, add, remove, error: bookmarkError, busy } = useBookmarks(book);

  useEffect(() => {
    if (progress && location === null) setLocation(progress.position ?? 0);
  }, [progress, location]);

  useEffect(() => {
    function onKeyUp(event: KeyboardEvent) {
      if (displayed.current && (event.key === "ArrowLeft" || event.key === "ArrowRight")) interacted.current = true;
    }
    document.addEventListener("keyup", onKeyUp);
    return () => document.removeEventListener("keyup", onKeyUp);
  }, []);

  function locationChanged(next: string) {
    if (!interacted.current) {
      if (progress?.position === null) setLocation(next);
      return;
    }
    setLocation(next);
    queue.current?.enqueue(next);
  }

  async function closeReader() {
    if (!progress || !queue.current || await queue.current.flush()) onClose();
  }

  return (
    <section className="panel library-reader" aria-label={`Reading ${book.title}`}>
      <div className="library-reader-heading">
        <h2>{book.title}</h2>
        <button type="button" onClick={() => { void closeReader(); }}>Back to library</button>
      </div>
      <ProgressStatus error={error} conflict={conflict} saving={saving} pendingPosition={pendingPosition} queue={queue.current} onUseDatabase={(value) => { interacted.current = false; setLocation(value.position ?? 0); }} />
      <div className="library-bookmarks">
        <button type="button" disabled={busy || typeof location !== "string"} onClick={() => { void add(String(location), `Bookmark ${bookmarks.length + 1}`); }}>Add bookmark</button>
        {bookmarkError && <p role="alert">{bookmarkError}</p>}
        {bookmarks.length > 0 && <details><summary>Bookmarks ({bookmarks.length})</summary><ul>{bookmarks.map((bookmark) => (
          <li key={bookmark.id}><button type="button" disabled={!progress || location === null} onClick={() => { interacted.current = true; setLocation(bookmark.position); queue.current?.enqueue(bookmark.position); }}>{bookmark.label}</button><button type="button" disabled={busy} onClick={() => { void remove(bookmark.id); }} aria-label={`Remove ${bookmark.label}`}>Remove</button></li>
        ))}</ul></details>}
      </div>
      <div className="library-reader-view" onPointerDownCapture={() => { if (displayed.current) interacted.current = true; }} onKeyDownCapture={() => { if (displayed.current) interacted.current = true; }}>
        {location !== null &&
        <ReactReader
          url={bookUrl(book)}
          location={location}
          locationChanged={locationChanged}
          getRendition={(rendition) => {
            rendition.on("displayed", () => { displayed.current = true; });
            rendition.on("keyup", () => { if (displayed.current) interacted.current = true; });
            rendition.on("click", () => { if (displayed.current) interacted.current = true; });
          }}
          epubInitOptions={{ openAs: "epub" }}
          errorView={<p role="alert">Could not open this EPUB. It may be damaged or DRM-protected.</p>}
        />}
      </div>
    </section>
  );
}

export function BookLibrary() {
  const [library, setLibrary] = useState<{ books: LibraryBook[]; featuredOrder: LibraryBook[] } | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [selected, setSelected] = useState<LibraryBook | null>(null);
  const [detailsBook, setDetailsBook] = useState<LibraryBook | null>(null);

  useEffect(function loadLibrary() {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/books", { signal: controller.signal });
        if (!response.ok) throw new Error(`Could not load the library (${response.status}).`);
        const books = await response.json() as LibraryBook[];
        if (controller.signal.aborted) return;
        setLibrary({ books, featuredOrder: shuffleBooks(books) });
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
    return <BookDetails key={detailsBook.path} book={detailsBook} onClose={() => setDetailsBook(null)} onRead={() => setSelected(detailsBook)} onRenamed={(renamed) => {
      setLibrary((current) => current && {
        books: current.books.map((book) => book === detailsBook ? renamed : book),
        featuredOrder: current.featuredOrder.map((book) => book === detailsBook ? renamed : book),
      });
      setDetailsBook(renamed);
    }} />;
  }

  function matchesFilter(book: LibraryBook) {
    return matchesLibraryFilter(book, query, filter);
  }

  const books = library?.books;
  const filtered = books?.filter(matchesFilter);
  const featured = library?.featuredOrder.find(matchesFilter);
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
                <BookAction book={book} onRead={() => setSelected(book)} />
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
