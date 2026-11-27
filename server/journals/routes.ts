import { Hono } from "hono";
import { validator } from "hono/validator";
import { requireSignIn } from "../http";
import { dateString } from "../db/client";
import { Prisma } from "../generated/prisma/client";
import {
  createJournal, deleteJournal, getJournal, listJournals, listJournalDatesWithContent, saveJournal,
} from "./service";

/** Journal collection and dated-entry HTTP routes. */
export const journalRoutes = new Hono();

/**
 * Checks that a journal date is a real YYYY-MM-DD calendar date.
 * @param value - The journal date supplied to a route.
 * @returns Whether the date is valid.
 */
export function isValidJournalDate(value: string): boolean {
  return /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T00:00:00.000Z`).toJSON()?.slice(0, 10) === value;
}

journalRoutes.get("/", requireSignIn, async (context) => {
  const journals = await listJournals();
  return context.json(journals.map((journal) => ({ date: dateString(journal.day), content: journal.content })));
});

journalRoutes.get("/markers", requireSignIn, async (context) => {
  const dates = await listJournalDatesWithContent();
  return context.json(dates.map((journal) => ({ date: dateString(journal.day) })));
});

journalRoutes.post("/", requireSignIn, validator("json", (body) => body), async (context) => {
  const { date, content } = context.req.valid("json") as { date: string; content?: string };
  if (!isValidJournalDate(date)) return context.json({ error: "That planner date is invalid." }, 400);
  if (content !== undefined && typeof content !== "string") {
    return context.json({ error: "Journal content must be a string." }, 422);
  }
  try {
    const journal = await createJournal(date, content);
    return context.json({ date, content: journal.content }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return context.json({ error: "A journal entry already exists for that date." }, 409);
    }
    throw error;
  }
});

journalRoutes.get("/:date", requireSignIn, async (context) => {
  const date = context.req.param("date");
  if (!isValidJournalDate(date)) return context.json({ error: "That planner date is invalid." }, 400);
  const journal = await getJournal(date);
  if (!journal) return context.json({ error: "Journal not found." }, 404);
  return context.json({ date, content: journal.content });
});

journalRoutes.put("/:date", requireSignIn, validator("json", (body) => body), async (context) => {
  const date = context.req.param("date");
  if (!isValidJournalDate(date)) return context.json({ error: "That planner date is invalid." }, 400);
  const { content } = context.req.valid("json") as { content: string };
  if (typeof content !== "string") return context.json({ error: "Journal content must be a string." }, 422);
  await saveJournal(date, content);
  return context.json({ date, content });
});

journalRoutes.delete("/:date", requireSignIn, async (context) => {
  const date = context.req.param("date");
  if (!isValidJournalDate(date)) return context.json({ error: "That planner date is invalid." }, 400);
  if (!(await deleteJournal(date))) return context.json({ error: "Journal not found." }, 404);
  return context.body(null, 204);
});
