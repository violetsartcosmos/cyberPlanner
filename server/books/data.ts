import { link, lstat, realpath, unlink } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { getDatabase } from "../db/client";
import type { Prisma } from "../generated/prisma/client";
import { isWikipediaDetails, validBookPosition, type LibraryBook, type WikipediaDetails } from "../../shared/planner/books";
import { findBook, type LibraryName } from "./library";

async function ensureBook(root: string, library: LibraryName, path: string): Promise<LibraryBook> {
  const book = await findBook(root, path, library);
  if (!book) throw new Error("Book not found.");
  return book;
}

async function getSavedBook(tx: Prisma.TransactionClient, library: LibraryName, path: string, book?: LibraryBook) {
  const record = await tx.book.upsert({
    where: { library_path: { library, path } },
    create: { library, path, storagePath: path },
    update: {},
  });
  return { ...book, record };
}

async function ensureSavedBook(root: string, library: LibraryName, path: string) {
  const book = await ensureBook(root, library, path);
  const record = await getDatabase().book.upsert({
    where: { library_path: { library, path } },
    create: { library, path, storagePath: path },
    update: {},
  });
  return { book: { ...book, id: record.id, storagePath: record.storagePath }, record };
}

async function lockBookIds(tx: Prisma.TransactionClient, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    const key = JSON.stringify(["book-progress", id]);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}

export async function getSavedWikipedia(root: string, library: LibraryName, path: string): Promise<WikipediaDetails | null> {
  await ensureBook(root, library, path);
  const saved = await getDatabase().book.findUnique({
    where: { library_path: { library, path } },
    select: { wikipedia: true, cover: true },
  });
  if (!saved || saved.wikipedia === null) return null;
  if (!isWikipediaDetails(saved.wikipedia)) throw new Error("Saved book details are invalid.");
  return {
    ...saved.wikipedia,
    image: saved.wikipedia.image ? { ...saved.wikipedia.image, cached: !!saved.cover } : null,
  };
}

function wikipediaJson(details: WikipediaDetails): Prisma.InputJsonObject {
  return {
    url: details.url,
    description: details.description,
    ...(details.sections ? { sections: details.sections.map(({ title, level, text }) => ({ title, level, text })) } : {}),
    image: details.image ? {
      url: details.image.url, page: details.image.page, title: details.image.title,
      author: details.image.author, license: details.image.license,
    } : null,
  };
}

export async function saveWikipedia(root: string, library: LibraryName, path: string, details: WikipediaDetails, cover: Uint8Array | null, coverType: string | null) {
  const { record } = await ensureSavedBook(root, library, path);
  const image = cover ? Uint8Array.from(cover) : null;
  await getDatabase().book.update({
    where: { id: record.id },
    data: { wikipedia: wikipediaJson(details), cover: image, coverType },
  });
}

export async function savedCover(root: string, library: LibraryName, path: string) {
  await ensureBook(root, library, path);
  return getDatabase().book.findUnique({ where: { library_path: { library, path } }, select: { cover: true, coverType: true } });
}

export async function listBookmarks(root: string, library: LibraryName, path: string) {
  await ensureBook(root, library, path);
  const record = await getDatabase().book.findUnique({ where: { library_path: { library, path } }, select: { id: true } });
  if (!record) return [];
  return getDatabase().bookmark.findMany({
    where: { bookId: record.id },
    select: { id: true, position: true, label: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function addBookmark(root: string, library: LibraryName, path: string, position: string, label: string) {
  const { book, record } = await ensureSavedBook(root, library, path);
  if (book.format === "pdf") throw new Error("Bookmarks are available for EPUBs and audiobooks.");
  if (book.format === "m4b" && (!Number.isFinite(Number(position)) || Number(position) < 0)) throw new Error("Invalid audiobook position.");
  const db = getDatabase();
  return db.bookmark.create({
    data: { bookId: record.id, position, label },
    select: { id: true, position: true, label: true, createdAt: true },
  });
}

export async function removeBookmark(root: string, library: LibraryName, path: string, id: string) {
  const { record } = await ensureSavedBook(root, library, path);
  const result = await getDatabase().bookmark.deleteMany({ where: { id, bookId: record.id } });
  if (!result.count) throw new Error("Bookmark not found.");
}

export async function attachBookIds(books: LibraryBook[]): Promise<LibraryBook[]> {
  const db = getDatabase();
  return Promise.all(books.map(async (book) => {
    const record = await db.book.upsert({
      where: { library_path: { library: book.library ?? "ebooks", path: book.path } },
      create: { library: book.library ?? "ebooks", path: book.path, storagePath: book.path },
      update: {},
    });
    return { ...book, id: record.id, storagePath: record.storagePath };
  }));
}

export async function getProgress(root: string, library: LibraryName, path: string) {
  const book = await ensureBook(root, library, path);
  if (book.format === "pdf") throw new Error("Progress is unavailable for PDFs.");
  const saved = await getDatabase().book.findUnique({ where: { library_path: { library, path } }, select: { progress: true, revision: true } });
  return { position: saved?.progress ?? null, revision: saved?.revision ?? 0 };
}

export async function saveProgress(root: string, library: LibraryName, path: string, position: string, revision: number) {
  const db = getDatabase();
  return db.$transaction(async (tx) => {
    const { book, record } = await ensureSavedBook(root, library, path);
    await lockBookIds(tx, [record.id]);
    if (!validBookPosition(book.format, position)) throw new Error("Invalid book position.");
    const result = await tx.book.updateMany({
      where: { id: record.id, revision },
      data: { progress: position, revision: { increment: 1 } },
    });
    if (!result.count) {
      const current = await tx.book.findUniqueOrThrow({ where: { id: record.id }, select: { progress: true, revision: true } });
      return { conflict: true as const, progress: { position: current.progress, revision: current.revision } };
    }
    return { conflict: false as const, progress: { position, revision: revision + 1 } };
  });
}

export async function renameBook(root: string, library: LibraryName, path: string, title: string): Promise<LibraryBook> {
  const { book, record } = await ensureSavedBook(root, library, path);
  const trimmed = title.trim();
  if (!trimmed || trimmed.length > 200 || /[<>:"/\\|?*\x00-\x1f]/.test(trimmed) ||
      /[. ]$/.test(trimmed) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(trimmed)) {
    throw new Error("Enter a valid filename without an extension.");
  }

  const extension = extname(path);
  const separator = path.lastIndexOf("/");
  const nextPath = `${separator < 0 ? "" : path.slice(0, separator + 1)}${trimmed}${extension}`;
  if (nextPath === path) return book;
  if (process.platform === "win32" && nextPath.toLowerCase() === path.toLowerCase()) {
    throw new Error("To change only capitalization on Windows, first rename the file to a different name.");
  }
  const rootPath = await realpath(root);
  const original = resolve(rootPath, ...path.split("/"));
  const parent = await realpath(resolve(original, ".."));
  const within = relative(rootPath, parent);
  if (within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within) || !(await lstat(original)).isFile()) {
    throw new Error("Book not found.");
  }
  const target = resolve(parent, `${trimmed}${extension}`);
  const db = getDatabase();
  let targetCreated = false;
  let originalRemoved = false;
  try {
    const saved = await db.$transaction(async (tx) => {
      await lockBookIds(tx, [record.id]);
      if (await tx.book.findUnique({ where: { library_path: { library, path: nextPath } } })) {
        throw new Error("The new filename already has saved book data.");
      }
      await link(original, target);
      targetCreated = true;
      await tx.book.update({ where: { id: record.id }, data: { path: nextPath, storagePath: nextPath } });
      await unlink(original);
      originalRemoved = true;
      return {};
    });
    return { ...book, path: nextPath, storagePath: nextPath, title: trimmed, ...saved };
  } catch (error) {
    if (originalRemoved) await link(target, original);
    if (targetCreated) await unlink(target);
    throw error;
  }
}

export async function getChapters(root: string, library: LibraryName, path: string) {
  const book = await ensureBook(root, library, path);
  if (book.format !== "m4b") throw new Error("Chapters are available for audiobooks.");
  const rootPath = await realpath(root);
  const file = await realpath(resolve(rootPath, ...path.split("/")));
  const within = relative(rootPath, file);
  if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) throw new Error("Book not found.");
  const { parseFile } = await import("music-metadata");
  const metadata = await parseFile(file, { includeChapters: true, skipCovers: true });
  return (metadata.format.chapters ?? []).map((chapter, index) => ({
    title: chapter.title || `Chapter ${index + 1}`,
    start: chapter.start / (chapter.timeScale ?? 1),
  })).filter((chapter) => Number.isFinite(chapter.start) && chapter.start >= 0);
}
