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

export async function renameErrorMessage(response: Response): Promise<string> {
  if (response.headers.get("content-type")?.includes("application/json")) {
    try {
      const data: unknown = await response.json();
      if (typeof data === "object" && data !== null && "error" in data && typeof data.error === "string") {
        return data.error;
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  if (response.status === 404) return "Rename API not found. Restart the server to load the latest version.";
  return `Could not rename the file (HTTP ${response.status}).`;
}
