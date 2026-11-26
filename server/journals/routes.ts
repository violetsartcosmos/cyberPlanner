import { Hono } from "hono";
import { isValidDateKey } from "../../shared/planner/utils";
import { noStore, reportServerError, requireSignIn } from "../http";
import { dateString } from "../db/client";
import { Prisma } from "../generated/prisma/client";
import { createJournal, deleteJournal, getJournal, listJournalDates, saveJournal } from "./service";

export const journalRoutes = new Hono();

journalRoutes.get("/", noStore, requireSignIn, async (context) => {
  try {
    const journals = await listJournalDates();
    return context.json(journals.map((journal) => ({ date: dateString(journal.day) })));
  } catch (error) {
    return reportServerError(context, error, "Could not load journals.");
  }
});

journalRoutes.post("/", noStore, requireSignIn, async (context) => {
  const { date, content } = await context.req.json<{ date: string; content?: string }>();
  if (!isValidDateKey(date)) return context.json({ error: "That planner date is invalid." }, 400);
  try {
    const journal = await createJournal(date, content);
    return context.json({ date, content: journal.content }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return context.json({ error: "A journal entry already exists for that date." }, 409);
    }
    return reportServerError(context, error, "Could not create journal.");
  }
});

journalRoutes.get("/:date", noStore, requireSignIn, async (context) => {
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

journalRoutes.put("/:date", noStore, requireSignIn, async (context) => {
  const date = context.req.param("date");
  if (!isValidDateKey(date)) return context.json({ error: "That planner date is invalid." }, 400);
  const { content } = await context.req.json<{ content: string }>();
  try {
    await saveJournal(date, content);
    return context.json({ date, content });
  } catch (error) {
    return reportServerError(context, error, "Could not save journal.");
  }
});

journalRoutes.delete("/:date", noStore, requireSignIn, async (context) => {
  const date = context.req.param("date");
  if (!isValidDateKey(date)) return context.json({ error: "That planner date is invalid." }, 400);
  try {
    if (!(await deleteJournal(date))) return context.json({ error: "Journal not found." }, 404);
    return context.body(null, 204);
  } catch (error) {
    return reportServerError(context, error, "Could not delete journal.");
  }
});
