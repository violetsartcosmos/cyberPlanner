import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { isWikipediaDetails, isWikipediaUrl, type LibraryBook, type WikipediaDetails } from "../../../shared/planner/books";
import { bookQuery, bookUrl } from "./book-url";

type EmbeddedDetails = {
  author: string;
  description: string;
  cover: string | null;
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function firstPage(data: unknown): Record<string, unknown> {
  const pages = record(record(data).query).pages;
  return Array.isArray(pages) ? record(pages[0]) : {};
}

function cleanAttribution(value: unknown) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = string(value).replace(/<[^>]*>/g, "");
  return textarea.value.trim().slice(0, 1000);
}

async function wikiRequest(url: URL) {
  url.searchParams.set("origin", "*");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  const response = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error(`Wikipedia request failed (${response.status}).`);
  const data: unknown = await response.json();
  if (record(data).error) throw new Error("Wikipedia could not find that article.");
  return firstPage(data);
}

async function loadWikipedia(url: string): Promise<{ details: WikipediaDetails; notice: string }> {
  if (!isWikipediaUrl(url)) throw new Error("Enter a Wikipedia article URL starting with https://.");
  const article = new URL(url);
  const title = decodeURIComponent(article.pathname.slice("/wiki/".length));
  if (!title) throw new Error("Enter a Wikipedia article URL.");
  article.search = "";
  article.hash = "";
  const api = new URL("/w/api.php", article.origin);
  api.search = new URLSearchParams({
    action: "query", prop: "extracts|pageimages", explaintext: "1",
    exintro: "1", piprop: "name", titles: title,
  }).toString();
  const page = await wikiRequest(api);
  if (page.missing) throw new Error("Wikipedia could not find that article.");
  const description = string(page.extract).slice(0, 10000);
  const imageName = string(page.pageimage);
  let image: WikipediaDetails["image"] = null;
  let notice = "";
  if (imageName) {
    try {
      const commons = new URL("https://commons.wikimedia.org/w/api.php");
      commons.search = new URLSearchParams({
        action: "query", prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "256",
        titles: `File:${imageName}`,
      }).toString();
      const file = await wikiRequest(commons);
      const info = Array.isArray(file.imageinfo) ? record(file.imageinfo[0]) : {};
      const metadata = record(info.extmetadata);
      const candidate = {
        url: string(info.thumburl),
        page: string(info.descriptionurl),
        title: string(file.title),
        author: cleanAttribution(record(metadata.Artist).value),
        license: cleanAttribution(record(metadata.LicenseShortName).value),
      };
      if (isWikipediaDetails({ url: article.href, description, image: candidate })) image = candidate;
    } catch (error) {
      notice = `The article was imported, but its Commons image could not be checked: ${error instanceof Error ? error.message : "request failed"}`;
    }
  }
  return { details: { url: article.href, description, image }, notice };
}

export function BookDetails({ book, onClose, onRead }: {
  book: LibraryBook;
  onClose: () => void;
  onRead: () => void;
}) {
  const [embedded, setEmbedded] = useState<EmbeddedDetails | null>(null);
  const [embeddedError, setEmbeddedError] = useState("");
  const [wiki, setWiki] = useState<WikipediaDetails | null>(null);
  const [wikiUrl, setWikiUrl] = useState("");
  const [wikiError, setWikiError] = useState("");
  const [wikiNotice, setWikiNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [wikiReady, setWikiReady] = useState(false);

  useEffect(function loadEmbedded() {
    const controller = new AbortController();
    let active = true;
    let cleanup = () => {};
    async function load() {
      try {
        if (book.format === "epub") {
          const response = await fetch(bookUrl(book), { signal: controller.signal });
          if (!response.ok) throw new Error(`Book request failed (${response.status}).`);
          const buffer = await response.arrayBuffer();
          const { default: epub } = await import("epubjs");
          if (!active) return;
          const publication = epub(buffer);
          let settled = false;
          cleanup = () => { if (settled) publication.destroy(); };
          try {
            await publication.ready;
            const metadata = await publication.loaded.metadata;
            const cover = await publication.coverUrl();
            if (active) setEmbedded({ author: metadata.creator, description: metadata.description, cover });
          } finally {
            settled = true;
            if (!active) publication.destroy();
          }
        } else if (book.format === "pdf") {
          const [pdfjs, worker] = await Promise.all([
            import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
          ]);
          if (!active) return;
          pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
          const task = pdfjs.getDocument({ url: bookUrl(book), disableAutoFetch: true, disableStream: true });
          cleanup = () => { void task.destroy(); };
          const pdf = await task.promise;
          const metadata = record((await pdf.getMetadata()).info);
          const page = await pdf.getPage(1);
          const initial = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(220 / initial.width, 320 / initial.height) });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, viewport }).promise;
          if (active) setEmbedded({ author: string(metadata.Author), description: string(metadata.Subject), cover: canvas.toDataURL("image/png") });
        } else {
          setEmbedded({ author: "", description: "", cover: null });
        }
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setEmbeddedError(error instanceof Error ? error.message : "Could not read the book's embedded details.");
        }
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
      cleanup();
    };
  }, [book]);

  useEffect(function loadSavedDetails() {
    const controller = new AbortController();
    async function load() {
      try {
        const query = bookQuery(book);
        const response = await fetch(`/api/books/details?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Could not load saved Wikipedia details (${response.status}).`);
        const data: unknown = await response.json();
        if (data !== null && !isWikipediaDetails(data)) throw new Error("Saved Wikipedia details are invalid.");
        setWiki(data);
        setWikiUrl(data?.url ?? "");
        setWikiReady(true);
      } catch (error) {
        if (!controller.signal.aborted) setWikiError(error instanceof Error ? error.message : "Could not load saved details.");
      }
    }
    void load();
    return () => controller.abort();
  }, [book.path, book.library]);

  async function importWikipedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setWikiError("");
    setWikiNotice("");
    try {
      const { details, notice } = await loadWikipedia(wikiUrl.trim());
      const response = await fetch("/api/books/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: book.path, library: book.library, details }),
      });
      if (!response.ok) throw new Error(`Could not save Wikipedia details (${response.status}).`);
      setWiki(details);
      setWikiUrl(details.url);
      setWikiNotice(notice);
    } catch (error) {
      setWikiError(error instanceof Error ? error.message : "Could not import Wikipedia details.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel library-details">
      <div className="library-reader-heading">
        <h2>{book.title}</h2>
        <button type="button" onClick={onClose}>Back to library</button>
      </div>
      <div className="library-detail-content">
        {embedded?.cover
          ? <img className="library-cover" src={embedded.cover} alt={`Cover or first page of ${book.title}`} />
          : <div className="library-cover library-cover-placeholder">{book.format.toUpperCase()}</div>}
        <div>
          {embedded?.author && <p><strong>Author:</strong> {embedded.author}</p>}
          {embedded?.description && <p>{embedded.description}</p>}
          {!embedded && !embeddedError && <p>Loading book details...</p>}
          {embedded && !embedded.description && <p>{book.format === "m4b" ? "Embedded audiobook descriptions and covers are not available here." : "No description is embedded in this book."}</p>}
          {embeddedError && <p role="alert">Could not load embedded details: {embeddedError}</p>}
          {book.format === "epub"
            ? <button type="button" onClick={onRead}>Read EPUB</button>
            : book.format === "m4b"
              ? <button type="button" onClick={onRead}>Listen</button>
              : <a href={bookUrl(book)} target="_blank" rel="noopener noreferrer">Open PDF</a>}
        </div>
      </div>
      <form className="library-wikipedia" onSubmit={(event) => { void importWikipedia(event); }}>
        <h3>Wikipedia reference</h3>
        <p>Paste an article link to import its introduction and, when available, a credited Wikimedia Commons image. Only the article you choose is requested from Wikipedia.</p>
        <label htmlFor="wiki-url">Wikipedia article URL</label>
        <div>
          <input id="wiki-url" type="url" required disabled={!wikiReady} value={wikiUrl} onChange={(event) => setWikiUrl(event.target.value)} placeholder="https://en.wikipedia.org/wiki/..." />
          <button type="submit" disabled={busy || !wikiReady}>{busy ? "Importing..." : "Import"}</button>
        </div>
        {wikiError && <p role="alert">{wikiError}</p>}
        {wikiNotice && <p role="status">{wikiNotice}</p>}
      </form>
      {wiki && (
        <div className="library-wikipedia-result">
          {wiki.description ? <p>{wiki.description}</p> : <p>No introduction was available for this article.</p>}
          <p>Source: <a href={wiki.url} target="_blank" rel="noopener noreferrer">Wikipedia article</a> (CC BY-SA).</p>
          {wiki.image ? (
            <figure>
              <img src={wiki.image.url} alt={wiki.image.title} referrerPolicy="no-referrer" />
              <figcaption>{wiki.image.author} · {wiki.image.license} · <a href={wiki.image.page} target="_blank" rel="noopener noreferrer">Image source and license</a></figcaption>
            </figure>
          ) : <p>No suitably credited Wikimedia Commons image was available.</p>}
        </div>
      )}
    </section>
  );
}
