import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { serveStatic } from "@hono/node-server/serve-static";
import { redirect } from "react-router";
import { beginGoogleAuthorization, completeGoogleAuthorization, endSession } from "./auth/service";
import { handlePlannerAction } from "./planner/dispatch";
import { getPlannerPage } from "./planner/page";
import { getSignedInEmail } from "./auth/service";
import { getCalendarData, validCalendarRange } from "./google/calendar";
import { audiobookDirectory, bookResponse, getBookDetails, libraryDirectory, listBooks, saveBookDetails } from "./books/library";
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
    return context.json([...books, ...audiobooks].sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path)));
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
    return context.json(await getBookDetails(library.root, context.req.query("path") ?? "", library.name));
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
  if (body.length > 20000) return context.json({ error: "Book details are too large." }, 400);
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
  try {
    await saveBookDetails(library.root, input.path, input.details, library.name);
    return context.json({ ok: true });
  } catch (error) {
    console.error("Could not save book details.", error);
    return context.json({ error: "Could not save book details." }, 500);
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
