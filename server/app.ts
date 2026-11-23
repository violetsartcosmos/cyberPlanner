import { Hono, type Context, type MiddlewareHandler } from "hono";
import { csrf } from "hono/csrf";
import { serveStatic } from "@hono/node-server/serve-static";
import { redirect } from "react-router";
import { beginGoogleAuthorization, completeGoogleAuthorization, endSession } from "./auth/service";
import { handlePlannerAction } from "./planner/dispatch";
import { getPlannerPage } from "./planner/page";
import { getSignedInEmail } from "./auth/service";
import { getCalendarData, validCalendarRange } from "./google/calendar";
import { audiobookDirectory, bookResponse, libraryDirectory, listBooks } from "./books/library";
import { addBookmark, addStoragePaths, getChapters, getProgress, getSavedWikipedia, listBookmarks, removeBookmark, renameBook, savedCover, saveProgress, saveWikipedia } from "./books/data";
import type { LibraryName } from "./books/library";
import { isWikipediaDetails, validBookPosition, type WikipediaDetails } from "../shared/planner/books";

type BookLibrary = { name: LibraryName; root: string };
type CalendarQuery = { start: string; end: string };
type AppEnvironment = {
  Variables: {
    bookLibrary: BookLibrary;
    bookPath: string;
    bookmarkId: string;
    calendarQuery: CalendarQuery;
  };
};
type ParsedInput<T> = { input: T } | { error: string };
type CoverRequest = { data: string; type: string };
type BookDetailsRequest = {
  path: string;
  details: WikipediaDetails;
  library?: LibraryName;
  cover?: CoverRequest | null;
};
type ProgressRequest = { path: string; position: string; revision: number; library?: LibraryName };
type BookmarkRequest = { path: string; position: string; label: string; library?: LibraryName };
type RenameRequest = { path: string; title: string; library?: LibraryName };
type BookDetailsInput = {
  path: string;
  details: WikipediaDetails;
  library: BookLibrary;
  cover: Uint8Array | null;
  coverType: string | null;
};
type ProgressInput = { path: string; position: string; revision: number; library: BookLibrary };
type BookmarkInput = { path: string; position: string; label: string; library: BookLibrary };
type RenameInput = { path: string; title: string; library: BookLibrary };
const INVALID_LIBRARY = "Invalid library.";

export const app = new Hono<AppEnvironment>();

app.use("/api/*", csrf());
app.use("/auth/*", csrf());

/** Selects a configured book library, defaulting to ebooks when omitted. */
function librarySelection(value: unknown): BookLibrary | null {
  if (value === undefined || value === "ebooks") return { name: "ebooks", root: libraryDirectory };
  if (value === "audiblebooks") return { name: "audiblebooks", root: audiobookDirectory };
  return null;
}

/** Prevents API responses from being cached unless a route sets a stricter policy. */
const noStore: MiddlewareHandler<AppEnvironment> = async (context, next) => {
  await next();
  if (!context.res.headers.has("Cache-Control")) context.header("Cache-Control", "no-store");
};

/** Rejects requests without an active session for the configured account. */
const requireSignIn: MiddlewareHandler<AppEnvironment> = async (context, next) => {
  if (!(await getSignedInEmail(context.req.raw))) {
    return context.json({ error: "Sign in with your configured Google account first." }, 401);
  }
  await next();
};

/** Validates shared book query parameters and exposes their typed values. */
const requireBookQuery: MiddlewareHandler<AppEnvironment> = async (context, next) => {
  const library = librarySelection(context.req.query("library"));
  if (!library) return context.json({ error: INVALID_LIBRARY }, 400);
  const path = context.req.query("path");
  if (!path || path.length > 2048) return context.json({ error: "Invalid book." }, 400);
  context.set("bookLibrary", library);
  context.set("bookPath", path);
  await next();
};

/** Validates and exposes the bookmark ID required by the delete route. */
const requireBookmarkId: MiddlewareHandler<AppEnvironment> = async (context, next) => {
  const id = context.req.query("id");
  if (!id || id.length > 100) return context.json({ error: "Invalid bookmark." }, 400);
  context.set("bookmarkId", id);
  await next();
};

/** Validates a calendar date range before passing it to the route handler. */
const requireCalendarQuery: MiddlewareHandler<AppEnvironment> = async (context, next) => {
  const start = context.req.query("start");
  const end = context.req.query("end");
  if (!start || !end || !validCalendarRange(start, end)) {
    return context.json({ error: "Invalid calendar date range." }, 400);
  }
  context.set("calendarQuery", { start, end });
  await next();
};

/** Logs a server-side failure and returns its route-specific error message. */
function reportServerError(
  context: Context<AppEnvironment>,
  error: unknown,
  logMessage: string,
  responseMessage = logMessage,
) {
  console.error(logMessage, error);
  return context.json({ error: responseMessage }, 500);
}

/** Narrows parsed JSON to a non-array object whose fields can be validated. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown, maxLength = Infinity, trim = false): value is string {
  return isString(value) && (trim ? value.trim().length > 0 : value.length > 0) && value.length <= maxLength;
}

function isProgressRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 2147483647;
}

function isCoverRequest(value: unknown): value is CoverRequest {
  return isRecord(value) && isString(value.data) && isString(value.type) &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(value.data) && value.data.length <= 7_000_000;
}

/** Reads bounded JSON and turns a runtime-validated request into its typed form. */
async function parseJsonRequest<T>(
  context: Context<AppEnvironment>,
  maxLength: number,
  invalidMessage: string,
  tooLargeMessage: string,
  parse: (value: unknown) => ParsedInput<T>,
): Promise<ParsedInput<T>> {
  const body = await context.req.text();
  if (body.length > maxLength) return { error: tooLargeMessage };
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return { error: invalidMessage };
  }
  return parse(value);
}

function parseBookDetailsInput(value: unknown): ParsedInput<BookDetailsInput> {
  if (isRecord(value) && isNonEmptyString(value.path) && isWikipediaDetails(value.details)) {
    const library = librarySelection(value.library);
    if (library) {
      if (value.cover == null || isCoverRequest(value.cover)) {
        const request: BookDetailsRequest = {
          path: value.path,
          details: value.details,
          library: library.name,
          ...(value.cover === undefined ? {} : { cover: value.cover }),
        };
        let cover: Uint8Array | null = null;
        let coverType: string | null = null;
        if (request.cover != null) {
          const candidate = Buffer.from(request.cover.data, "base64");
          if (hasImageSignature(candidate, request.cover.type) &&
              candidate.length <= 5 * 1024 * 1024 && value.details.image) {
            cover = candidate;
            coverType = request.cover.type;
          } else {
            return { error: "Invalid cover image." };
          }
        }
        if (value.details.image && cover === null) {
          return { error: "The cover could not be saved for offline use." };
        }
        return { input: { path: request.path, details: request.details, library, cover, coverType } };
      }
      return { error: "Invalid cover image." };
    }
    return { error: INVALID_LIBRARY };
  }
  return { error: "Invalid book details." };
}

function parseProgressInput(value: unknown): ParsedInput<ProgressInput> {
  if (isRecord(value) && isNonEmptyString(value.path, 2048) &&
      isProgressRevision(value.revision) && value.position !== undefined) {
    const library = librarySelection(value.library);
    if (library) {
      const format = value.path.toLowerCase().endsWith(".epub") ? "epub" :
        value.path.toLowerCase().endsWith(".m4b") ? "m4b" : "pdf";
      if (validBookPosition(format, value.position)) {
        const request: ProgressRequest = {
          path: value.path,
          position: value.position,
          revision: value.revision,
          library: library.name,
        };
        return { input: { path: request.path, position: request.position, revision: request.revision, library } };
      }
      return { error: "Invalid book position." };
    }
    return { error: INVALID_LIBRARY };
  }
  return { error: "Invalid progress." };
}

function parseBookmarkInput(value: unknown): ParsedInput<BookmarkInput> {
  if (isRecord(value) && isString(value.path) && isNonEmptyString(value.position, 2048) &&
      isNonEmptyString(value.label, 200, true)) {
    const library = librarySelection(value.library);
    if (library) {
      const request: BookmarkRequest = {
        path: value.path,
        position: value.position,
        label: value.label,
        library: library.name,
      };
      return { input: { path: request.path, position: request.position, label: request.label.trim(), library } };
    }
    return { error: INVALID_LIBRARY };
  }
  return { error: "Invalid bookmark." };
}

function parseRenameInput(value: unknown): ParsedInput<RenameInput> {
  if (isRecord(value) && isString(value.path) && isString(value.title)) {
    const library = librarySelection(value.library);
    if (library) {
      const request: RenameRequest = {
        path: value.path,
        title: value.title,
        library: library.name,
      };
      return { input: { path: request.path, title: request.title, library } };
    }
    return { error: INVALID_LIBRARY };
  }
  return { error: "Invalid filename." };
}

/** Confirms that uploaded cover bytes match one of the supported image formats. */
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

// Lists the signed-in user's ebook and audiobook libraries.
app.get("/api/books", noStore, requireSignIn, async (context) => {
  try {
    const [books, audiobooks] = await Promise.all([
      listBooks(libraryDirectory),
      listBooks(audiobookDirectory, "audiblebooks"),
    ]);
    return context.json(await addStoragePaths([...books, ...audiobooks].sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path))));
  } catch (error) {
    return reportServerError(context, error, "Could not load ebook library.", "Could not load the ebook library.");
  }
});

// Streams a selected book, including support for byte-range requests.
app.get("/api/books/file", noStore, requireSignIn, requireBookQuery, async (context) => {
  const library = context.get("bookLibrary");
  const path = context.get("bookPath");
  try {
    return await bookResponse(library.root, path, context.req.header("range"), library.name);
  } catch (error) {
    return reportServerError(context, error, "Could not open ebook.", "Could not open the book.");
  }
});

// Returns saved Wikipedia details for a selected book.
app.get("/api/books/details", noStore, requireSignIn, requireBookQuery, async (context) => {
  const library = context.get("bookLibrary");
  const path = context.get("bookPath");
  try {
    return context.json(await getSavedWikipedia(library.root, library.name, path));
  } catch (error) {
    return reportServerError(context, error, "Could not load book details.");
  }
});

// Saves validated Wikipedia details and an optional cached cover image.
app.post("/api/books/details", noStore, requireSignIn, async (context) => {
  const result = await parseJsonRequest(context, 8_000_000, "Invalid book details.", "Book details are too large.", parseBookDetailsInput);
  if ("error" in result) return context.json({ error: result.error }, 400);
  const { path, details, library, cover, coverType } = result.input;
  try {
    await saveWikipedia(library.root, library.name, path, details, cover, coverType);
    return context.json({ ok: true });
  } catch (error) {
    return reportServerError(context, error, "Could not save book details.");
  }
});

// Returns a saved cover with a private, non-cacheable response.
app.get("/api/books/cover", noStore, requireSignIn, requireBookQuery, async (context) => {
  context.header("Cache-Control", "private, no-store");
  const library = context.get("bookLibrary");
  const path = context.get("bookPath");
  try {
    const image = await savedCover(library.root, library.name, path);
    if (!image?.cover || !image.coverType) return context.json({ error: "Cover not found." }, 404);
    return new Response(new Blob([Uint8Array.from(image.cover)], { type: image.coverType }), {
      headers: { "Content-Type": image.coverType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return reportServerError(context, error, "Could not load book cover.");
  }
});

// Lists saved reading bookmarks for a selected book.
app.get("/api/books/bookmarks", noStore, requireSignIn, requireBookQuery, async (context) => {
  const library = context.get("bookLibrary");
  const path = context.get("bookPath");
  try {
    return context.json(await listBookmarks(library.root, library.name, path));
  } catch (error) {
    return reportServerError(context, error, "Could not load bookmarks.");
  }
});

// Returns the saved reading position for a selected book.
app.get("/api/books/progress", noStore, requireSignIn, requireBookQuery, async (context) => {
  const library = context.get("bookLibrary");
  const path = context.get("bookPath");
  try {
    return context.json(await getProgress(library.root, library.name, path));
  } catch (error) {
    if (error instanceof Error && error.message === "Book not found.") return context.json({ error: error.message }, 404);
    if (error instanceof Error && error.message === "Progress is unavailable for PDFs.") return context.json({ error: error.message }, 400);
    return reportServerError(context, error, "Could not load book progress.");
  }
});

// Saves a validated reading position using revision-based conflict detection.
app.put("/api/books/progress", noStore, requireSignIn, async (context) => {
  const result = await parseJsonRequest(context, 10_000, "Invalid progress.", "Invalid progress.", parseProgressInput);
  if ("error" in result) return context.json({ error: result.error }, 400);
  const { path, position, revision, library } = result.input;
  try {
    const saved = await saveProgress(library.root, library.name, path, position, revision);
    return saved.conflict ? context.json(saved.progress, 409) : context.json(saved.progress);
  } catch (error) {
    if (error instanceof Error && error.message === "Book not found.") return context.json({ error: error.message }, 404);
    if (error instanceof Error && error.message === "Invalid book position.") return context.json({ error: error.message }, 400);
    return reportServerError(context, error, "Could not save book progress.");
  }
});

// Adds a validated bookmark to a selected book.
app.post("/api/books/bookmarks", noStore, requireSignIn, async (context) => {
  const result = await parseJsonRequest(context, 5_000, "Invalid bookmark.", "Invalid bookmark.", parseBookmarkInput);
  if ("error" in result) return context.json({ error: result.error }, 400);
  const { path, position, label, library } = result.input;
  try {
    return context.json(await addBookmark(library.root, library.name, path, position, label));
  } catch (error) {
    return reportServerError(context, error, "Could not save bookmark.");
  }
});

// Removes a bookmark from a selected book.
app.delete("/api/books/bookmarks", noStore, requireSignIn, requireBookQuery, requireBookmarkId, async (context) => {
  const library = context.get("bookLibrary");
  const path = context.get("bookPath");
  const id = context.get("bookmarkId");
  try {
    await removeBookmark(library.root, library.name, path, id);
    return context.json({ ok: true });
  } catch (error) {
    return reportServerError(context, error, "Could not remove bookmark.");
  }
});

// Returns the chapter list for a selected book.
app.get("/api/books/chapters", noStore, requireSignIn, requireBookQuery, async (context) => {
  const library = context.get("bookLibrary");
  const path = context.get("bookPath");
  try {
    return context.json(await getChapters(library.root, library.name, path));
  } catch (error) {
    return reportServerError(context, error, "Could not load chapters.");
  }
});

// Renames a book while preserving its saved planner data.
app.post("/api/books/rename", noStore, requireSignIn, async (context) => {
  const result = await parseJsonRequest(context, 5_000, "Invalid filename.", "Invalid filename.", parseRenameInput);
  if ("error" in result) return context.json({ error: result.error }, 400);
  const { path, title, library } = result.input;
  try {
    return context.json(await renameBook(library.root, library.name, path, title));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") return context.json({ error: "A file with that name already exists." }, 409);
    if (error instanceof Error && /^(Enter a valid filename|The new filename already has saved book data|To change only capitalization)/.test(error.message)) return context.json({ error: error.message }, 400);
    return reportServerError(context, error, "Could not rename book.");
  }
});

// Loads planner data for the current request.
app.get("/api/planner", noStore, async (context) => {
  return context.json(await getPlannerPage(context.req.raw));
});

// Validates and dispatches a planner action.
app.post("/api/planner", noStore, async (context) => {
  return context.json(await handlePlannerAction(context.req.raw));
});

// Returns events for a validated date range from Google Calendar.
app.get("/api/calendar", noStore, requireSignIn, requireCalendarQuery, async (context) => {
  const { start, end } = context.get("calendarQuery");
  try {
    return context.json(await getCalendarData(start, end));
  } catch {
    console.error("Google Calendar load failed.");
    return context.json({ error: "Could not load Google Calendar. Check that the Calendar API is enabled and reconnect Google to grant calendar access." }, 502);
  }
});

// Starts the configured Google OAuth flow.
app.get("/auth/google", () => beginGoogleAuthorization());
// Completes OAuth and redirects rejected authorization responses to the app.
app.get("/auth/callback", async (context) => {
  try {
    return await completeGoogleAuthorization(context.req.raw);
  } catch (error) {
    if (error instanceof Response) {
      const message = (await error.text()).slice(0, 240);
      return redirect(`/?authError=${encodeURIComponent(message)}`);
    }
    throw error;
  }
});
// Ends the current signed-in session.
app.post("/auth/logout", (context) => endSession(context.req.raw));

app.all("/api/*", (context) => context.notFound());
app.all("/auth/*", (context) => context.notFound());
if (process.env.NODE_ENV === "production") {
  app.get("*", serveStatic({ root: "./build/client" }));
  app.get("*", serveStatic({ path: "./build/client/index.html" }));
}
