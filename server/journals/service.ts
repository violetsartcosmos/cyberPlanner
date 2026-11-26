import { databaseDate, getDatabase } from "../db/client";

export async function saveJournal(date: string, content: string) {
  const day = databaseDate(date);
  await getDatabase().journal.upsert({
    where: { day },
    create: { day, content },
    update: { content },
  });
}

export async function getJournal(date: string) {
  return getDatabase().journal.findUnique({
    where: { day: databaseDate(date) },
    select: { content: true },
  });
}

export async function listJournals() {
  return getDatabase().journal.findMany();
}

export async function listJournalDates() {
  return getDatabase().journal.findMany({
    select: { day: true },
    orderBy: { day: "desc" },
  });
}

export async function createJournal(date: string, content?: string) {
  return getDatabase().journal.create({
    data: { day: databaseDate(date), content },
  });
}

export async function deleteJournal(date: string) {
  const result = await getDatabase().journal.deleteMany({
    where: { day: databaseDate(date) },
  });
  return result.count === 1;
}
