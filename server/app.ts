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
import { addBookmark, attachBookIds, getChapters, getProgress, getSavedWikipedia, listBookmarks, removeBookmark, renameBook, savedCover, saveProgress, saveWikipedia } from "./books/data";
import type { LibraryName } from "./books/library";
import { isWikipediaDetails, type WikipediaDetails } from "../shared/planner/books";
import { isValidDateKey } from "../shared/planner/utils";
import { getJournal, getPlannerTasks, getRoutineCompletions, savePlannerJournal, setBuiltinTaskCompletion, updateRoutineKind } from "./planner/service";
import { updateExternalCompletion } from "./planner/actions";
import { acceptTemplate, completeQuest, createQuest, deleteQuest, getQuest, listAchievements, listQuests, listQuestTemplates, saveAchievement, updateQuest, type AchievementInput, type QuestInput } from "./gamification/service";
import { getDatabase } from "./db/client";
import { loadRoutines, routineId } from "./planner/routines";
import { getTherapyPlan, setTherapyCompletion } from "./planner/therapy";
import { routineKinds } from "../shared/planner/routines";
import { getPointsSummary, redeemReward } from "./points/service";
import { rewards } from "../shared/planner/definitions";

type BookLibrary = { name: LibraryName; root: string };
type CalendarQuery = { start: string; end: string };
type AppEnvironment = {
  Variables: {
    bookLibrary: BookLibrary;
    bookPath: string;
    calendarQuery: CalendarQuery;
  };
};
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
    return context.json(await attachBookIds([...books, ...audiobooks].sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path))));
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

// Adds a validated bookmark to a selected book.
app.post("/api/books/bookmarks", noStore, requireSignIn, async (context) => {
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

// Removes a bookmark from a selected book.
app.delete("/api/books/bookmarks", noStore, requireSignIn, requireBookQuery, async (context) => {
  const library = context.get("bookLibrary");
  const path = context.get("bookPath");
  const id = context.req.query("id");
  if (!id || id.length > 100) return context.json({ error: "Invalid bookmark." }, 400);
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
  const { path, title, library: name } = await context.req.json<{ path: string; title: string; library?: LibraryName }>();
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

// Resource routes below are separate from /api/planner, but use the same data
// and services. `noStore` prevents caching; `requireSignIn` checks the session.
// The /api/* CSRF middleware above also applies to requests that change data.

// GET reads the journal for a date; an unsaved date returns 404.
app.get("/api/journals/:date", noStore, requireSignIn, async (context) => {
  const date = context.req.param("date");
  if (!isValidDateKey(date)) return context.json({ error: "That planner date is invalid." }, 400);
  try {
    const journal = await getJournal(date);
    if (!journal) return context.json({ error: "Journal not found." }, 404);
    return context.json({ date, content: journal.content });
  } catch (error) {
    return reportServerError(context, error, "Could not load journal.");
  }
});

// PUT creates the journal or replaces its content for that date.
app.put("/api/journals/:date", noStore, requireSignIn, async (context) => {
  const date = context.req.param("date");
  if (!isValidDateKey(date)) return context.json({ error: "That planner date is invalid." }, 400);
  const { content } = await context.req.json<{ content: string }>();
  try {
    await savePlannerJournal(date, content);
    return context.json({ date, content });
  } catch (error) {
    return reportServerError(context, error, "Could not save journal.");
  }
});

// GET lists quests that have not been soft-deleted.
app.get("/api/quests", noStore, requireSignIn, async (context) => {
  try {
    return context.json(await listQuests());
  } catch (error) {
    return reportServerError(context, error, "Could not load quests.");
  }
});

// GET finds one active quest by ID; a missing or deleted quest returns 404.
app.get("/api/quests/:id", noStore, requireSignIn, async (context) => {
  try {
    const quest = await getQuest(context.req.param("id"));
    if (!quest) return context.json({ error: "That quest no longer exists." }, 404);
    return context.json(quest);
  } catch (error) {
    return reportServerError(context, error, "Could not load quest.");
  }
});

// POST validates a complete quest, creates it, and returns it with status 201.
app.post("/api/quests", noStore, requireSignIn, async (context) => {
  const input = await context.req.json<QuestInput>();
  try {
    return context.json(await createQuest(input), 201);
  } catch (error) {
    return reportServerError(context, error, "Could not create quest.");
  }
});

// PATCH changes only the supplied fields; fields not sent remain unchanged.
app.patch("/api/quests/:id", noStore, requireSignIn, async (context) => {
  const input = await context.req.json<Partial<QuestInput>>();
  try {
    return context.json(await updateQuest(context.req.param("id"), input));
  } catch (error) {
    if (error instanceof Error && error.message === "Provide at least one quest field.") {
      return context.json({ error: error.message }, 400);
    }
    if (error instanceof Error && error.message === "That quest no longer exists.") {
      return context.json({ error: error.message }, 404);
    }
    return reportServerError(context, error, "Could not update quest.");
  }
});

// DELETE hides the quest rather than removing its history or earned points.
// Status 204 means the delete succeeded and there is no response body.
app.delete("/api/quests/:id", noStore, requireSignIn, async (context) => {
  try {
    await deleteQuest(context.req.param("id"));
    return context.body(null, 204);
  } catch (error) {
    if (error instanceof Error && error.message === "That quest no longer exists.") {
      return context.json({ error: error.message }, 404);
    }
    return reportServerError(context, error, "Could not delete quest.");
  }
});

// Completing a quest is an action, not a generic field update: the service
// records completion and awards points together. Repeating it returns 409.
app.post("/api/quests/:id/complete", noStore, requireSignIn, async (context) => {
  try {
    await completeQuest(context.req.param("id"));
    return context.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "That quest no longer exists.") {
      return context.json({ error: error.message }, 404);
    }
    if (error instanceof Error && error.message === "That quest is already complete.") {
      return context.json({ error: error.message }, 409);
    }
    return reportServerError(context, error, "Could not complete quest.");
  }
});

// Accepting a template creates a quest; an already accepted template returns 409.
app.post("/api/quest-templates/:id/accept", noStore, requireSignIn, async (context) => {
  try {
    await acceptTemplate(context.req.param("id"));
    return context.json({ ok: true }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "That quest template no longer exists.") {
      return context.json({ error: error.message }, 404);
    }
    if (error instanceof Error && error.message === "That quest is already in your quest list.") {
      return context.json({ error: error.message }, 409);
    }
    return reportServerError(context, error, "Could not accept quest.");
  }
});

// GET returns routine definitions and their weekday groups.
app.get("/api/routines", noStore, requireSignIn, async (context) => {
  try {
    return context.json(await loadRoutines(getDatabase()));
  } catch (error) {
    return reportServerError(context, error, "Could not load routines.");
  }
});

// GET returns the IDs checked on the date in the query string.
app.get("/api/routines/completions", noStore, requireSignIn, async (context) => {
  const date = context.req.query("date");
  if (!date || !isValidDateKey(date)) return context.json({ error: "That planner date is invalid." }, 400);
  try {
    return context.json({ date, taskIds: await getRoutineCompletions(date) });
  } catch (error) {
    return reportServerError(context, error, "Could not load routine completions.");
  }
});

// PATCH changes the kind; the service sets the matching point value.
app.patch("/api/routines/:id", noStore, requireSignIn, async (context) => {
  const id = routineId(context.req.param("id"));
  if (id === null) return context.json({ error: "That routine is invalid." }, 400);
  const input = await context.req.json<{ kind: string }>();
  const kind = routineKinds.find((item) => item === input.kind);
  if (!kind) return context.json({ error: "That routine type is invalid." }, 400);
  try {
    if (!(await updateRoutineKind(id, kind))) {
      return context.json({ error: "That routine no longer exists." }, 404);
    }
    return context.json({ id, kind });
  } catch (error) {
    return reportServerError(context, error, "Could not update routine.");
  }
});

// PUT sets a dated check to true or false. The service validates the weekday,
// awards points at most once, and refreshes achievements in its transaction.
app.put("/api/routines/:id/completions/:date", noStore, requireSignIn, async (context) => {
  const id = context.req.param("id");
  const date = context.req.param("date");
  if (routineId(id) === null || !isValidDateKey(date)) {
    return context.json({ error: "That planner task is invalid." }, 400);
  }
  const { completed } = await context.req.json<{ completed: boolean }>();
  if (completed !== true && completed !== false) return context.json({ error: "That task state is invalid." }, 400);
  try {
    return context.json({ date, taskId: id, completed,
      ...await setBuiltinTaskCompletion(date, id, completed) });
  } catch (error) {
    if (error instanceof Error && error.message === "That planner task is invalid.") {
      return context.json({ error: error.message }, 404);
    }
    return reportServerError(context, error, "Could not update routine completion.");
  }
});

// GET returns sessions, exercise details, and completion states for one date.
app.get("/api/therapy/sessions", noStore, requireSignIn, async (context) => {
  const date = context.req.query("date");
  if (!date || !isValidDateKey(date)) return context.json({ error: "That planner date is invalid." }, 400);
  try {
    return context.json(await getTherapyPlan(date));
  } catch (error) {
    return reportServerError(context, error, "Could not load therapy sessions.");
  }
});

// PUT sets an exercise check. The service verifies the session assignment and
// manages points and achievements; unchecking does not reverse earned points.
app.put("/api/therapy/sessions/:sessionId/exercises/:exerciseId/completions/:date", noStore, requireSignIn, async (context) => {
  const { sessionId, exerciseId, date } = context.req.param();
  if (!isValidDateKey(date) || !/^[a-z0-9_-]+$/.test(sessionId) || !/^[a-z0-9_-]+$/.test(exerciseId)) {
    return context.json({ error: "That physical therapy exercise or state is invalid." }, 400);
  }
  const { completed } = await context.req.json<{ completed: boolean }>();
  if (completed !== true && completed !== false) return context.json({ error: "That task state is invalid." }, 400);
  try {
    return context.json({ date, sessionId, exerciseId, completed,
      ...await setTherapyCompletion(date, sessionId, exerciseId, completed) });
  } catch (error) {
    if (error instanceof Error && error.message === "That physical therapy exercise is invalid.") {
      return context.json({ error: error.message }, 404);
    }
    return reportServerError(context, error, "Could not update therapy completion.");
  }
});

// GET reads stored achievements without recalculating their progress.
app.get("/api/achievements", noStore, requireSignIn, async (context) => {
  try {
    return context.json(await listAchievements());
  } catch (error) {
    return reportServerError(context, error, "Could not load achievements.");
  }
});

// POST validates and creates an achievement, then returns its refreshed state.
app.post("/api/achievements", noStore, requireSignIn, async (context) => {
  const input = await context.req.json<AchievementInput>();
  try {
    return context.json(await saveAchievement(null, input), 201);
  } catch (error) {
    if (error instanceof Error && error.message === "Choose a valid routine task.") {
      return context.json({ error: error.message }, 400);
    }
    return reportServerError(context, error, "Could not create achievement.");
  }
});

// GET lists available quest definitions; accepting one uses the action above.
app.get("/api/quest-templates", noStore, requireSignIn, async (context) => {
  try {
    return context.json(await listQuestTemplates());
  } catch (error) {
    return reportServerError(context, error, "Could not load quest templates.");
  }
});

// GET lists active synced tasks due on the selected date or with no due date.
app.get("/api/external-tasks", noStore, requireSignIn, async (context) => {
  const date = context.req.query("date");
  if (!date || !isValidDateKey(date)) return context.json({ error: "That planner date is invalid." }, 400);
  try {
    return context.json(await getPlannerTasks(date));
  } catch (error) {
    return reportServerError(context, error, "Could not load synced tasks.");
  }
});

// PUT updates a Gmail or Google task. Google tasks are updated remotely first;
// the shared action then records the local state and any point award.
app.put("/api/external-tasks/:source/:id/completion", noStore, requireSignIn, async (context) => {
  const { source, id } = context.req.param();
  const { date, completed } = await context.req.json<{ date: string; completed: boolean }>();
  if ((source !== "google" && source !== "gmail") || !id || !isValidDateKey(date) ||
      (completed !== true && completed !== false)) {
    return context.json({ error: "That synced task is invalid." }, 400);
  }
  try {
    if (!(await updateExternalCompletion(source, id, completed, date))) {
      return context.json({ error: "That synced task no longer exists." }, 404);
    }
    return context.json({ source, id, date, completed });
  } catch (error) {
    if (error instanceof Error && error.message === "That synced task no longer exists.") {
      return context.json({ error: error.message }, 404);
    }
    return reportServerError(context, error, "Could not update synced task.");
  }
});

// GET summarizes the ledger balance, the selected day's earnings, and history.
app.get("/api/points", noStore, requireSignIn, async (context) => {
  const date = context.req.query("date");
  if (!date || !isValidDateKey(date)) return context.json({ error: "That planner date is invalid." }, 400);
  try {
    return context.json(await getPointsSummary(date));
  } catch (error) {
    return reportServerError(context, error, "Could not load points.");
  }
});

// GET exposes the server's predefined rewards and prices.
app.get("/api/rewards", noStore, requireSignIn, (context) => context.json(rewards));

// POST spends points using the server's price, not a price sent by the client.
// The service checks the balance and records the spend in one transaction.
app.post("/api/rewards/:id/redemptions", noStore, requireSignIn, async (context) => {
  const reward = rewards.find((item) => item.id === context.req.param("id"));
  if (!reward) return context.json({ error: "That reward is not available." }, 404);
  try {
    const result = await redeemReward({ id: reward.id, name: reward.title, cost: reward.cost });
    if (!result.redeemed) {
      return context.json({ error: `You need ${reward.cost - result.balance} more points for ${reward.title}.` }, 409);
    }
    return context.json({ rewardId: reward.id, balance: result.balance }, 201);
  } catch (error) {
    return reportServerError(context, error, "Could not redeem reward.");
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
