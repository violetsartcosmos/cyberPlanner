import { Hono, type MiddlewareHandler } from "hono";
import { audiobookDirectory, bookResponse, libraryDirectory, listBooks, type LibraryName } from "./library";
import {
  addBookmark, attachBookIds, getChapters, getProgress, getSavedWikipedia, listBookmarks, removeBookmark,
  renameBook, savedCover, saveProgress, saveWikipedia,
} from "./data";
import { isWikipediaDetails, type WikipediaDetails } from "../../shared/planner/books";
import { noStore, reportServerError, requireSignIn } from "../http";

type BookLibrary = { name: LibraryName; root: string };
type BookEnvironment = {
  Variables: {
    bookLibrary: BookLibrary;
    bookPath: string;
  };
};
const INVALID_LIBRARY = "Invalid library.";

export const bookRoutes = new Hono<BookEnvironment>();

function librarySelection(value: unknown): BookLibrary | null {
  if (value === undefined || value === "ebooks") return { name: "ebooks", root: libraryDirectory };
  if (value === "audiblebooks") return { name: "audiblebooks", root: audiobookDirectory };
  return null;
}

const requireBookQuery: MiddlewareHandler<BookEnvironment> = async (context, next) => {
  const library = librarySelection(context.req.query("library"));
  if (!library) return context.json({ error: INVALID_LIBRARY }, 400);
  const path = context.req.query("path");
  if (!path || path.length > 2048) return context.json({ error: "Invalid book." }, 400);
  context.set("bookLibrary", library);
  context.set("bookPath", path);
  await next();
};

function hasImageSignature(bytes: Uint8Array, type: string): boolean {
  switch (type) {
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case "image/gif": {
      const signature = Buffer.from(bytes.subarray(0, 6)).toString("ascii");
      return signature === "GIF87a" || signature === "GIF89a";
    }
    case "image/webp":
      return Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
        Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP";
    default:
      return false;
  }
}

bookRoutes.get("/", noStore, requireSignIn, async (context) => {
  try {
    const [books, audiobooks] = await Promise.all([
      listBooks(libraryDirectory),
      listBooks(audiobookDirectory, "audiblebooks"),
    ]);
    return context.json(await attachBookIds([...books, ...audiobooks].sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path))));
  } catch (error) {
    return reportServerError(context, error, "Could not load ebook library.", "Could not load the ebook library.");
  }
});

bookRoutes.get("/file", noStore, requireSignIn, requireBookQuery, async (context) => {
  const library = context.get("bookLibrary");
  const path = context.get("bookPath");
  try {
    return await bookResponse(library.root, path, context.req.header("range"), library.name);
  } catch (error) {
    return reportServerError(context, error, "Could not open ebook.", "Could not open the book.");
  }
});

bookRoutes.get("/details", noStore, requireSignIn, requireBookQuery, async (context) => {
  const { name, root } = context.get("bookLibrary");
  try {
    return context.json(await getSavedWikipedia(root, name, context.get("bookPath")));
  } catch (error) {
    return reportServerError(context, error, "Could not load book details.");
  }
});

bookRoutes.post("/details", noStore, requireSignIn, async (context) => {
  const { path, details, library: name, cover: image } = await context.req.json<{
    path: string; details: WikipediaDetails; library?: LibraryName; cover?: { data: string; type: string } | null;
  }>();
  if (!path || !isWikipediaDetails(details)) return context.json({ error: "Invalid book details." }, 400);
  const library = librarySelection(name);
  if (!library) return context.json({ error: INVALID_LIBRARY }, 400);
  let cover: Uint8Array | null = null;
  let coverType: string | null = null;
  if (image) {
    const bytes = Buffer.from(image.data, "base64");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(image.data) || !hasImageSignature(bytes, image.type) || !details.image) {
      return context.json({ error: "Invalid cover image." }, 400);
    }
    cover = bytes;
    coverType = image.type;
  }
  if (details.image && !cover) return context.json({ error: "The cover could not be saved for offline use." }, 400);
  try {
    await saveWikipedia(library.root, library.name, path, details, cover, coverType);
    return context.json({ ok: true });
  } catch (error) {
    return reportServerError(context, error, "Could not save book details.");
  }
});

bookRoutes.get("/cover", noStore, requireSignIn, requireBookQuery, async (context) => {
  context.header("Cache-Control", "private, no-store");
  const { name, root } = context.get("bookLibrary");
  try {
    const image = await savedCover(root, name, context.get("bookPath"));
    if (!image?.cover || !image.coverType) return context.json({ error: "Cover not found." }, 404);
    return new Response(new Blob([Uint8Array.from(image.cover)], { type: image.coverType }), {
      headers: { "Content-Type": image.coverType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return reportServerError(context, error, "Could not load book cover.");
  }
});

bookRoutes.get("/bookmarks", noStore, requireSignIn, requireBookQuery, async (context) => {
  const { name, root } = context.get("bookLibrary");
  try {
    return context.json(await listBookmarks(root, name, context.get("bookPath")));
  } catch (error) {
    return reportServerError(context, error, "Could not load bookmarks.");
  }
});

bookRoutes.get("/progress", noStore, requireSignIn, requireBookQuery, async (context) => {
  const { name, root } = context.get("bookLibrary");
  try {
    return context.json(await getProgress(root, name, context.get("bookPath")));
  } catch (error) {
    if (error instanceof Error && error.message === "Book not found.") return context.json({ error: error.message }, 404);
    if (error instanceof Error && error.message === "Progress is unavailable for PDFs.") return context.json({ error: error.message }, 400);
    return reportServerError(context, error, "Could not load book progress.");
  }
});

bookRoutes.put("/progress", noStore, requireSignIn, async (context) => {
  const { path, position, revision, library: name } = await context.req.json<{
    path: string; position: string; revision: number; library?: LibraryName;
  }>();
  const library = librarySelection(name);
  if (!library) return context.json({ error: INVALID_LIBRARY }, 400);
  if (!path || path.length > 2048 || !Number.isInteger(revision) || revision < 0 || revision >= 2147483647) {
    return context.json({ error: "Invalid progress." }, 400);
  }
  try {
    const saved = await saveProgress(library.root, library.name, path, position, revision);
    return saved.conflict ? context.json(saved.progress, 409) : context.json(saved.progress);
  } catch (error) {
    if (error instanceof Error && error.message === "Book not found.") return context.json({ error: error.message }, 404);
    if (error instanceof Error && error.message === "Invalid book position.") return context.json({ error: error.message }, 400);
    return reportServerError(context, error, "Could not save book progress.");
  }
});

bookRoutes.post("/bookmarks", noStore, requireSignIn, async (context) => {
  const { path, position, label, library: name } = await context.req.json<{
    path: string; position: string; label: string; library?: LibraryName;
  }>();
  const library = librarySelection(name);
  if (!library) return context.json({ error: INVALID_LIBRARY }, 400);
  if (!position || position.length > 2048 || !label.trim() || label.length > 200) {
    return context.json({ error: "Invalid bookmark." }, 400);
  }
  try {
    return context.json(await addBookmark(library.root, library.name, path, position, label.trim()));
  } catch (error) {
    return reportServerError(context, error, "Could not save bookmark.");
  }
});

bookRoutes.delete("/bookmarks", noStore, requireSignIn, requireBookQuery, async (context) => {
  const { name, root } = context.get("bookLibrary");
  const id = context.req.query("id");
  if (!id || id.length > 100) return context.json({ error: "Invalid bookmark." }, 400);
  try {
    await removeBookmark(root, name, context.get("bookPath"), id);
    return context.json({ ok: true });
  } catch (error) {
    return reportServerError(context, error, "Could not remove bookmark.");
  }
});

bookRoutes.get("/chapters", noStore, requireSignIn, requireBookQuery, async (context) => {
  const { name, root } = context.get("bookLibrary");
  try {
    return context.json(await getChapters(root, name, context.get("bookPath")));
  } catch (error) {
    return reportServerError(context, error, "Could not load chapters.");
  }
});

bookRoutes.post("/rename", noStore, requireSignIn, async (context) => {
  const { path, title, library: name } = await context.req.json<{
    path: string; title: string; library?: LibraryName;
  }>();
  const library = librarySelection(name);
  if (!library) return context.json({ error: INVALID_LIBRARY }, 400);
  try {
    return context.json(await renameBook(library.root, library.name, path, title));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") return context.json({ error: "A file with that name already exists." }, 409);
    if (error instanceof Error && /^(Enter a valid filename|The new filename already has saved book data|To change only capitalization)/.test(error.message)) return context.json({ error: error.message }, 400);
    return reportServerError(context, error, "Could not rename book.");
  }
});
