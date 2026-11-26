import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useFetcher } from "react-router";
import { ExternalLink } from "lucide-react";
import { isWikipediaDetails, isWikipediaUrl, MAX_WIKIPEDIA_TEXT_LENGTH, type LibraryBook, type WikipediaDetails } from "../../../../shared/planner/books";
import { BookAction } from "./book-action";
import { wikipediaImageReference, parseWikipediaExtract } from "../utils/wikipedia-utils";
import { bookCoverUrl } from "../utils/book-url";
import { useEmbeddedDetails } from "../hooks/use-embedded-details";
import { useSavedWikipedia } from "../hooks/use-saved-wikipedia";
import { useActionNotifications, useNotification } from "@/components/notifications";
import type { BookActionResult } from "../services/book-actions";

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

async function loadWikiImage(reference: { origin: string; title: string }, articleUrl: string): Promise<NonNullable<WikipediaDetails["image"]>> {
  const commons = new URL("/w/api.php", reference.origin);
  commons.search = new URLSearchParams({
    action: "query", prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "600",
    redirects: "1", titles: reference.title,
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
  if (!/^(?:cc\s*(?:by(?:-sa)?|0)|public domain|pd\b)/i.test(candidate.license)) {
    throw new Error("This image is not freely licensed for reuse outside Wikipedia.");
  }
  if (!isWikipediaDetails({ url: articleUrl, description: "", image: candidate })) {
    throw new Error("The Wikimedia image or its author and license could not be verified.");
  }
  return candidate;
}

async function loadWikipedia(url: string, imageUrl: string): Promise<{ details: WikipediaDetails; notice: string }> {
  if (!isWikipediaUrl(url)) throw new Error("Enter a Wikipedia article URL starting with https://.");
  const chosenImage = imageUrl ? wikipediaImageReference(imageUrl) : null;
  const article = new URL(url);
  const title = decodeURIComponent(article.pathname.slice("/wiki/".length));
  if (!title) throw new Error("Enter a Wikipedia article URL.");
  article.search = "";
  article.hash = "";
  const api = new URL("/w/api.php", article.origin);
  api.search = new URLSearchParams({
    action: "query", prop: "extracts|pageimages", explaintext: "1",
    exsectionformat: "wiki", piprop: "name", redirects: "1", titles: title,
  }).toString();
  const page = await wikiRequest(api);
  if (page.missing) throw new Error("Wikipedia could not find that article.");
  if (typeof page.extract !== "string") throw new Error("Wikipedia did not return article text.");
  if (page.extract.length > MAX_WIKIPEDIA_TEXT_LENGTH) {
    throw new Error("This article is too long to save. Choose a shorter article.");
  }
  const { description, sections } = parseWikipediaExtract(page.extract);
  const imageName = chosenImage || (string(page.pageimage) ? { origin: article.origin, title: `File:${string(page.pageimage)}` } : null);
  let image: WikipediaDetails["image"] = null;
  let notice = "";
  if (imageName) {
    try {
      image = await loadWikiImage(imageName, article.href);
    } catch (error) {
      if (chosenImage) throw error;
      notice = `Article imported without a cover: ${error instanceof Error ? error.message : "image request failed"}`;
    }
  }
  const details = { url: article.href, description, sections, image };
  if (!isWikipediaDetails(details)) throw new Error("This article has too many or unusually long sections to save.");
  return { details, notice };
}

async function cacheCover(url: string): Promise<{ type: string; data: string }> {
  const response = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error(`Could not download the cover (${response.status}).`);
  const blob = await response.blob();
  if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(blob.type)) {
    throw new Error("Cover must be a JPEG, PNG, GIF or WebP.");
  }
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the cover image."));
    reader.onload = () => {
      if (typeof reader.result !== "string") reject(new Error("Could not read the cover image."));
      else resolve(reader.result.slice(reader.result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
  return { type: blob.type, data };
}

function ArticleText({ text }: { text: string }) {
  return <>{text.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</>;
}

function articleHistory(url: string) {
  const history = new URL(url);
  history.search = "?action=history";
  history.hash = "";
  return history.href;
}

/**
 * Displays book metadata and submits filename and article changes to resource actions.
 * @param props - The selected book and navigation/update callbacks.
 * @returns The metadata panel, import form and filename controls.
 */
export function BookDetails({ book, onClose, onRead, onRenamed }: {
  book: LibraryBook;
  onClose: () => void;
  onRead: () => void;
  onRenamed: (book: LibraryBook) => void;
}) {
  const { embedded, error: embeddedError } = useEmbeddedDetails(book);
  const { wiki, setWiki, error: wikiError, ready: wikiReady } = useSavedWikipedia(book);
  const notify = useNotification();
  const [wikiUrlDraft, setWikiUrl] = useState<string | null>(null);
  const [wikiImageUrlDraft, setWikiImageUrl] = useState<string | null>(null);
  const wikiFetcher = useFetcher<BookActionResult>();
  const renameFetcher = useFetcher<BookActionResult>();
  useActionNotifications(wikiFetcher);
  useActionNotifications(renameFetcher);
  const [preparing, setPreparing] = useState(false);
  const busy = preparing || wikiFetcher.state !== "idle";
  const renaming = renameFetcher.state !== "idle";
  const pendingWiki = useRef<{ notice: string } | null>(null);
  const pendingRename = useRef(false);
  const [failedWikiImage, setFailedWikiImage] = useState("");
  const [title, setTitle] = useState(book.title);
  useNotification(wikiError);
  useNotification(embeddedError ? `Could not load embedded details: ${embeddedError}` : "");
  useNotification(wiki?.image && failedWikiImage === wiki.image.url ? "The Wikipedia cover could not be loaded." : "");

  const wikiUrl = wikiUrlDraft ?? wiki?.url ?? "";
  const wikiImageUrl = wikiImageUrlDraft ?? wiki?.image?.page ?? "";
  const resourceUrl = `/books/${book.library ?? "ebooks"}/${encodeURIComponent(book.path)}`;

  useEffect(function finishWikipediaSave() {
    if (wikiFetcher.state !== "idle" || !wikiFetcher.data || !pendingWiki.current) return;
    const pending = pendingWiki.current;
    pendingWiki.current = null;
    if (wikiFetcher.data.wiki) {
      setWiki(wikiFetcher.data.wiki);
      setWikiUrl(null);
      setWikiImageUrl(null);
      if (pending.notice) notify(pending.notice, "notice");
      setFailedWikiImage("");
    }
  }, [wikiFetcher.state, wikiFetcher.data, setWiki, notify]);

  useEffect(function finishRename() {
    if (renameFetcher.state !== "idle" || !renameFetcher.data || !pendingRename.current) return;
    pendingRename.current = false;
    if (renameFetcher.data.book) onRenamed(renameFetcher.data.book);
  }, [renameFetcher.state, renameFetcher.data, onRenamed]);

  /**
   * Prepares licensed Wikipedia metadata before submitting it to the book action.
   * @param event - The article import form event.
   * @returns A promise resolving once preparation has submitted or reported an error.
   */
  async function importWikipedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPreparing(true);
    try {
      const { details, notice } = await loadWikipedia(wikiUrl.trim(), wikiImageUrl.trim());
      const cover = details.image ? await cacheCover(details.image.url) : null;
      pendingWiki.current = { notice };
      wikiFetcher.submit({ details: JSON.stringify(details), cover: JSON.stringify(cover) }, {
        method: "post", action: `${resourceUrl}/details`,
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not import Wikipedia details.");
    } finally {
      setPreparing(false);
    }
  }

  const wikiCover = wiki?.image && wiki.image.url !== failedWikiImage ? wiki.image : null;
  const cover = wikiCover ? (wikiCover.cached ? bookCoverUrl(book) : wikiCover.url) : embedded?.cover;

  return (
    <section className="card p-3 library-details">
      <div className="library-reader-heading">
        <button className="btn btn-outline-secondary btn-sm" type="button" onClick={onClose}>Back to library</button>
        <span className="library-kicker">{book.format.toUpperCase()} · YOUR COLLECTION</span>
      </div>
      <div className="library-detail-content">
        <div className="library-cover-frame">
          {cover
            ? <img className="library-cover" src={cover} alt={wikiCover ? wikiCover.title : `Cover or first page of ${book.title}`} referrerPolicy={wikiCover ? "no-referrer" : undefined} onError={wikiCover ? () => setFailedWikiImage(wikiCover.url) : undefined} />
            : <div className="library-cover library-cover-placeholder"><span>{book.format.toUpperCase()}</span><strong>{book.title}</strong></div>}
          {wiki?.image && <p className="library-cover-credit">{wiki.image.author} · {wiki.image.license} · <a href={wiki.image.page} aria-label="Image source" title="Image source" target="_blank" rel="noopener noreferrer"><ExternalLink size={13} aria-hidden="true" /></a></p>}
        </div>
        <div>
          <p className="library-kicker">A CLOSER LOOK</p>
          <h2>{book.title}</h2>
          {embedded?.author && <p><strong>Author:</strong> {embedded.author}</p>}
          {embedded?.description && <p>{embedded.description}</p>}
          {!embedded && !embeddedError && <p>Loading book details...</p>}
          {embedded && !embedded.description && <p>{book.format === "m4b" ? "Embedded audiobook descriptions and covers are not available here." : "No description is embedded in this book."}</p>}
          <BookAction book={book} onRead={onRead} epubLabel="Read EPUB" />
          <renameFetcher.Form method="post" action={`${resourceUrl}/rename`} className="library-rename" onSubmit={() => { pendingRename.current = true; }}>
            <label htmlFor="book-title">Filename</label>
            <div><input className="form-control" id="book-title" name="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required /> <button className="btn btn-outline-secondary btn-sm" type="submit" disabled={renaming || busy || title.trim() === book.title}>{renaming ? "Renaming..." : "Rename"}</button></div>
          </renameFetcher.Form>
        </div>
      </div>
      {wiki && (
        <section className="library-wikipedia-result" aria-label="Wikipedia article">
          <div className="library-article-heading">
            <p className="library-kicker">FROM WIKIPEDIA</p>
            <h3>Description</h3>
          </div>
          {wiki.description ? <ArticleText text={wiki.description} /> : <p>No introduction was available for this article.</p>}
          {wiki.sections && wiki.sections.length > 0 && (
            <div className="library-article-sections">
              <h3>Article sections</h3>
              {wiki.sections.map((section, index) => (
                <details className={`library-article-section library-article-section--level-${section.level}`} key={index}>
                  <summary>{section.title}</summary>
                  {section.text ? <ArticleText text={section.text} /> : <p>No text was available for this section.</p>}
                </details>
              ))}
            </div>
          )}
          <p className="library-article-source">
            <a href={articleHistory(wiki.url)} aria-label="Wikipedia source and contributors" title="Wikipedia source and contributors" target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true" /></a> ·
            {" "}<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>
          </p>
        </section>
      )}
      <wikiFetcher.Form method="post" action={`${resourceUrl}/details`} className="library-wikipedia" onSubmit={(event) => { void importWikipedia(event); }}>
        <h3>Wikipedia</h3>
        <p>Import an article and optional cover image.</p>
        <label htmlFor="wiki-url">Wikipedia article URL</label>
        <div>
          <input className="form-control" id="wiki-url" type="url" required disabled={!wikiReady} value={wikiUrl} onChange={(event) => setWikiUrl(event.target.value)} placeholder="https://en.wikipedia.org/wiki/..." />
        </div>
        <label htmlFor="wiki-image-url">Wikipedia image URL (optional)</label>
        <div>
          <input className="form-control" id="wiki-image-url" type="url" disabled={!wikiReady} value={wikiImageUrl} onChange={(event) => setWikiImageUrl(event.target.value)} placeholder="https://commons.wikimedia.org/wiki/File:..." />
        </div>
        <button className="btn btn-outline-secondary btn-sm" type="submit" disabled={busy || renaming || !wikiReady}>{busy ? "Importing..." : "Import"}</button>
      </wikiFetcher.Form>
    </section>
  );
}
