import { databaseDate, getDatabase } from "../db/client";

/**
 * Creates or replaces a journal entry for a date.
 * @param date - The journal date in YYYY-MM-DD format.
 * @param content - The saved journal document.
 * @returns Nothing after the entry is persisted.
 */
export async function saveJournal(date: string, content: string) {
  const day = databaseDate(date);
  await getDatabase().journal.upsert({
    where: { day },
    create: { day, content },
    update: { content },
  });
}

/**
 * Reads one journal entry by date.
 * @param date - The journal date in YYYY-MM-DD format.
 * @returns The entry content, or null when no entry exists.
 */
export async function getJournal(date: string) {
  return getDatabase().journal.findUnique({
    where: { day: databaseDate(date) },
    select: { content: true },
  });
}

/**
 * Lists saved journals, including explicitly created empty entries.
 * @returns Journal dates and content in newest-first order.
 */
export async function listJournals() {
  return getDatabase().journal.findMany({
    select: { day: true, content: true },
    orderBy: { day: "desc" },
  });
}

/**
 * Lists dates whose journal contains non-empty entry content.
 * @returns Newest-first non-empty journal dates for calendar markers.
 */
export async function listJournalDatesWithContent() {
  return getDatabase().journal.findMany({
    where: { content: { not: "" } },
    select: { day: true },
    orderBy: { day: "desc" },
  });
}

/**
 * Creates a journal entry without replacing an existing date.
 * @param date - The journal date in YYYY-MM-DD format.
 * @param content - The optional initial journal document.
 * @returns The created journal entry.
 */
export async function createJournal(date: string, content?: string) {
  return getDatabase().journal.create({
    data: { day: databaseDate(date), content },
  });
}

/**
 * Deletes a journal entry by date.
 * @param date - The journal date in YYYY-MM-DD format.
 * @returns True when an entry was deleted, otherwise false.
 */
export async function deleteJournal(date: string) {
  const result = await getDatabase().journal.deleteMany({
    where: { day: databaseDate(date) },
  });
  return result.count === 1;
}
