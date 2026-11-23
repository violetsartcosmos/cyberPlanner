import { useEffect, useState } from "react";
import type { LibraryBook } from "../../../../shared/planner/books";
import { bookUrl } from "../utils/book-url";

type EmbeddedDetails = {
  author: string;
  description: string;
  cover: string | null;
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function useEmbeddedDetails(book: LibraryBook, enabled = true) {
  const [embedded, setEmbedded] = useState<EmbeddedDetails | null>(null);
  const [error, setError] = useState("");

  useEffect(function loadEmbedded() {
    if (!enabled) {
      setEmbedded(null);
      setError("");
      return;
    }
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
          if (active) setEmbedded({
            author: typeof metadata.Author === "string" ? metadata.Author : "",
            description: typeof metadata.Subject === "string" ? metadata.Subject : "",
            cover: canvas.toDataURL("image/png"),
          });
        } else {
          setEmbedded({ author: "", description: "", cover: null });
        }
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setError(error instanceof Error ? error.message : "Could not read the book's embedded details.");
        }
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
      cleanup();
    };
  }, [book, enabled]);

  return { embedded, error };
}
