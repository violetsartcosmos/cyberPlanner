import { useEffect, useState } from "react";
import type { LibraryBook } from "../../../../shared/planner/books";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import { bookUrl } from "../utils/book-url";

type EmbeddedDetails = {
  author: string;
  description: string;
  cover: string | null;
};

/**
 * Parses embedded EPUB/PDF metadata and releases browser parsing resources.
 * @param book - The library file to read and parse.
 * @param enabled - Whether the details or lazy cover are visible.
 * @returns Parsed metadata and any download or parser error.
 */
export function useEmbeddedDetails(book: LibraryBook, enabled = true) {
  const [embedded, setEmbedded] = useState<EmbeddedDetails | null>(null);
  const [error, setError] = useState("");

  useEffect(function loadEmbedded() {
    setEmbedded(null);
    setError("");
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    let pdfTask: PDFDocumentLoadingTask | undefined;
    async function load() {
      try {
        if (book.format === "epub") {
          const response = await fetch(bookUrl(book), { signal: controller.signal });
          if (!response.ok) throw new Error((await response.json() as { error: string }).error);
          const buffer = await response.arrayBuffer();
          const { default: epub } = await import("epubjs");
          const publication = epub(buffer);
          try {
            await publication.ready;
            const metadata = await publication.loaded.metadata;
            const coverPath = await publication.loaded.cover;
            // The data URL survives destruction of the EPUB archive.
            const cover = coverPath ? await publication.archive.getBase64(coverPath) : null;
            if (active) setEmbedded({ author: metadata.creator, description: metadata.description, cover });
          } finally {
            publication.destroy();
          }
        } else if (book.format === "pdf") {
          const [pdfjs, worker] = await Promise.all([
            import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
          ]);
          pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
          const task = pdfjs.getDocument({ url: bookUrl(book), disableAutoFetch: true, disableStream: true });
          pdfTask = task;
          try {
            const pdf = await task.promise;
            const metadata = (await pdf.getMetadata()).info as { Author?: string; Subject?: string };
            const page = await pdf.getPage(1);
            const initial = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: Math.min(220 / initial.width, 320 / initial.height) });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({ canvas, viewport }).promise;
            if (active) setEmbedded({
              author: metadata.Author ?? "",
              description: metadata.Subject ?? "",
              cover: canvas.toDataURL("image/png"),
            });
          } finally {
            await task.destroy();
          }
        } else {
          setEmbedded({ author: "", description: "", cover: null });
        }
      } catch (error) {
        if (active) {
          setError(error instanceof Error ? error.message : "Could not read the book's embedded details.");
        }
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
      void pdfTask?.destroy();
    };
  }, [book, enabled]);

  return { embedded, error };
}
