import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { serveStatic } from "@hono/node-server/serve-static";
import { redirect } from "react-router";
import { beginGoogleAuthorization, completeGoogleAuthorization, endSession } from "./auth/service";
import { handlePlannerAction } from "./planner/dispatch";
import { getPlannerPage } from "./planner/page";
import { getSignedInEmail } from "./auth/service";
import { getCalendarData, validCalendarRange } from "./google/calendar";
import { audiobookDirectory, bookResponse, libraryDirectory, listBooks } from "./books/library";
import { addBookmark, addStoragePaths, getChapters, getSavedWikipedia, listBookmarks, removeBookmark, renameBook, savedCover, saveWikipedia } from "./books/data";
import type { LibraryName } from "./books/library";
import { isWikipediaDetails } from "../shared/planner/books";

export const app = new Hono();

app.use("/api/*", csrf());
app.use("/auth/*", csrf());

function librarySelection(value: unknown): { name: LibraryName; root: string } | null {
  if (value === undefined || value === "ebooks") return { name: "ebooks", root: libraryDirectory };
  if (value === "audiblebooks") return { name: "audiblebooks", root: audiobookDirectory };
  return null;
}

app.get("/api/books", async (context) => {
  context.header("Cache-Control", "no-store");
  if (!(await getSignedInEmail(context.req.raw))) {
    return context.json({ error: "Sign in with your configured Google account first." }, 401);
  }
  try {
    const [books, audiobooks] = await Promise.all([
      listBooks(libraryDirectory),
      listBooks(audiobookDirectory, "audiblebooks"),
    ]);
    return context.json(await addStoragePaths([...books, ...audiobooks].sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path))));
  } catch (error) {
    console.error("Could not load ebook library.", error);
    return context.json({ error: "Could not load the ebook library." }, 500);
  }
});

app.get("/api/books/file", async (context) => {
  if (!(await getSignedInEmail(context.req.raw))) {
    return context.json({ error: "Sign in with your configured Google account first." }, 401);
  }
  const library = librarySelection(context.req.query("library"));
  if (!library) return context.json({ error: "Invalid library." }, 400);
  try {
    return await bookResponse(library.root, context.req.query("path") ?? "", context.req.header("range") ?? null, library.name);
  } catch (error) {
    console.error("Could not open ebook.", error);
    return context.json({ error: "Could not open the book." }, 500);
  }
});

app.get("/api/books/details", async (context) => {
  context.header("Cache-Control", "no-store");
  if (!(await getSignedInEmail(context.req.raw))) {
    return context.json({ error: "Sign in with your configured Google account first." }, 401);
  }
  const library = librarySelection(context.req.query("library"));
  if (!library) return context.json({ error: "Invalid library." }, 400);
  try {
    return context.json(await getSavedWikipedia(library.root, library.name, context.req.query("path") ?? ""));
  } catch (error) {
    console.error("Could not load book details.", error);
    return context.json({ error: "Could not load book details." }, 500);
  }
});

app.post("/api/books/details", async (context) => {
  context.header("Cache-Control", "no-store");
  if (!(await getSignedInEmail(context.req.raw))) {
    return context.json({ error: "Sign in with your configured Google account first." }, 401);
  }
  const body = await context.req.text();
  if (body.length > 8_000_000) return context.json({ error: "Book details are too large." }, 400);
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return context.json({ error: "Invalid book details." }, 400);
  }
  if (typeof input !== "object" || input === null || !("path" in input) || typeof input.path !== "string" ||
      !("details" in input) || !isWikipediaDetails(input.details)) {
    return context.json({ error: "Invalid book details." }, 400);
  }
  const library = librarySelection("library" in input ? input.library : undefined);
  if (!library) return context.json({ error: "Invalid library." }, 400);
  let cover: Uint8Array | null = null;
  let coverType: string | null = null;
  if ("cover" in input && input.cover !== null) {
    if (typeof input.cover !== "object" || input.cover === null ||
        !("data" in input.cover) || typeof input.cover.data !== "string" ||
        !("type" in input.cover) || typeof input.cover.type !== "string" ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(input.cover.data) || input.cover.data.length > 7_000_000) {
      return context.json({ error: "Invalid cover image." }, 400);
    }
    cover = Buffer.from(input.cover.data, "base64");
    coverType = input.cover.type;
    const bytes = cover;
    const matches = coverType === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : coverType === "image/png" ? bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index]) && bytes.length >= 8
        : coverType === "image/gif" ? Buffer.from(bytes.slice(0, 6)).toString("ascii") === "GIF87a" || Buffer.from(bytes.slice(0, 6)).toString("ascii") === "GIF89a"
          : coverType === "image/webp" ? Buffer.from(bytes.slice(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.slice(8, 12)).toString("ascii") === "WEBP"
            : false;
    if (!matches || bytes.length > 5 * 1024 * 1024 || !input.details.image) return context.json({ error: "Invalid cover image." }, 400);
  }
  if (input.details.image && !cover) return context.json({ error: "The cover could not be saved for offline use." }, 400);
  try {
    await saveWikipedia(library.root, library.name, input.path, input.details, cover, coverType);
    return context.json({ ok: true });
  } catch (error) {
    console.error("Could not save book details.", error);
    return context.json({ error: "Could not save book details." }, 500);
  }
});

app.get("/api/books/cover", async (context) => {
  context.header("Cache-Control", "private, no-store");
  if (!(await getSignedInEmail(context.req.raw))) return context.json({ error: "Sign in first." }, 401);
  const library = librarySelection(context.req.query("library"));
  if (!library) return context.json({ error: "Invalid library." }, 400);
  try {
    const image = await savedCover(library.root, library.name, context.req.query("path") ?? "");
    if (!image?.cover || !image.coverType) return context.json({ error: "Cover not found." }, 404);
    return new Response(new Blob([Uint8Array.from(image.cover)], { type: image.coverType }), {
      headers: { "Content-Type": image.coverType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    console.error("Could not load book cover.", error);
    return context.json({ error: "Could not load book cover." }, 500);
  }
});

app.get("/api/books/bookmarks", async (context) => {
  context.header("Cache-Control", "no-store");
  if (!(await getSignedInEmail(context.req.raw))) return context.json({ error: "Sign in first." }, 401);
  const library = librarySelection(context.req.query("library"));
  if (!library) return context.json({ error: "Invalid library." }, 400);
  try {
    return context.json(await listBookmarks(library.root, library.name, context.req.query("path") ?? ""));
  } catch (error) {
    console.error("Could not load bookmarks.", error);
    return context.json({ error: "Could not load bookmarks." }, 500);
  }
});

app.post("/api/books/bookmarks", async (context) => {
  if (!(await getSignedInEmail(context.req.raw))) return context.json({ error: "Sign in first." }, 401);
  const body = await context.req.text();
  if (body.length > 5000) return context.json({ error: "Invalid bookmark." }, 400);
  let input: unknown;
  try { input = JSON.parse(body); } catch { return context.json({ error: "Invalid bookmark." }, 400); }
  if (typeof input !== "object" || input === null || !("path" in input) || typeof input.path !== "string" ||
      !("position" in input) || typeof input.position !== "string" || !input.position || input.position.length > 2048 ||
      !("label" in input) || typeof input.label !== "string" || !input.label.trim() || input.label.length > 200) {
    return context.json({ error: "Invalid bookmark." }, 400);
  }
  const library = librarySelection("library" in input ? input.library : undefined);
  if (!library) return context.json({ error: "Invalid library." }, 400);
  try {
    return context.json(await addBookmark(library.root, library.name, input.path, input.position, input.label.trim()));
  } catch (error) {
    console.error("Could not save bookmark.", error);
    return context.json({ error: "Could not save bookmark." }, 500);
  }
});

app.delete("/api/books/bookmarks", async (context) => {
  if (!(await getSignedInEmail(context.req.raw))) return context.json({ error: "Sign in first." }, 401);
  const library = librarySelection(context.req.query("library"));
  if (!library) return context.json({ error: "Invalid library." }, 400);
  const id = context.req.query("id") ?? "";
  if (!id || id.length > 100) return context.json({ error: "Invalid bookmark." }, 400);
  try {
    await removeBookmark(library.root, library.name, context.req.query("path") ?? "", id);
    return context.json({ ok: true });
  } catch (error) {
    console.error("Could not remove bookmark.", error);
    return context.json({ error: "Could not remove bookmark." }, 500);
  }
});

app.get("/api/books/chapters", async (context) => {
  if (!(await getSignedInEmail(context.req.raw))) return context.json({ error: "Sign in first." }, 401);
  const library = librarySelection(context.req.query("library"));
  if (!library) return context.json({ error: "Invalid library." }, 400);
  try {
    return context.json(await getChapters(library.root, library.name, context.req.query("path") ?? ""));
  } catch (error) {
    console.error("Could not load chapters.", error);
    return context.json({ error: "Could not load chapters." }, 500);
  }
});

app.post("/api/books/rename", async (context) => {
  if (!(await getSignedInEmail(context.req.raw))) return context.json({ error: "Sign in first." }, 401);
  const body = await context.req.text();
  if (body.length > 5000) return context.json({ error: "Invalid filename." }, 400);
  let input: unknown;
  try { input = JSON.parse(body); } catch { return context.json({ error: "Invalid filename." }, 400); }
  if (typeof input !== "object" || input === null || !("path" in input) || typeof input.path !== "string" ||
      !("title" in input) || typeof input.title !== "string") return context.json({ error: "Invalid filename." }, 400);
  const library = librarySelection("library" in input ? input.library : undefined);
  if (!library) return context.json({ error: "Invalid library." }, 400);
  try {
    return context.json(await renameBook(library.root, library.name, input.path, input.title));
  } catch (error) {
    console.error("Could not rename book.", error);
    if (error instanceof Error && "code" in error && error.code === "EEXIST") return context.json({ error: "A file with that name already exists." }, 409);
    if (error instanceof Error && /^(Enter a valid filename|The new filename already has saved book data|To change only capitalization)/.test(error.message)) return context.json({ error: error.message }, 400);
    return context.json({ error: "Could not rename book." }, 500);
  }
});

app.get("/api/planner", async (context) => {
  context.header("Cache-Control", "no-store");
  return context.json(await getPlannerPage(context.req.raw));
});

app.post("/api/planner", async (context) => {
  context.header("Cache-Control", "no-store");
  return context.json(await handlePlannerAction(context.req.raw));
});

app.get("/api/calendar", async (context) => {
  context.header("Cache-Control", "no-store");
  if (!(await getSignedInEmail(context.req.raw))) {
    return context.json({ error: "Sign in with your configured Google account first." }, 401);
  }
  const start = context.req.query("start") ?? "";
  const end = context.req.query("end") ?? "";
  if (!validCalendarRange(start, end)) {
    return context.json({ error: "Invalid calendar date range." }, 400);
  }
  try {
    return context.json(await getCalendarData(start, end));
  } catch {
    console.error("Google Calendar load failed.");
    return context.json({ error: "Could not load Google Calendar. Check that the Calendar API is enabled and reconnect Google to grant calendar access." }, 502);
  }
});

app.get("/auth/google", () => beginGoogleAuthorization());
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
app.post("/auth/logout", (context) => endSession(context.req.raw));

app.all("/api/*", (context) => context.notFound());
app.all("/auth/*", (context) => context.notFound());
if (process.env.NODE_ENV === "production") {
  app.get("*", serveStatic({ root: "./build/client" }));
  app.get("*", serveStatic({ path: "./build/client/index.html" }));
}
