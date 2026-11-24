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

async function lockBookPaths(tx: Prisma.TransactionClient, library: LibraryName, paths: string[]) {
  for (const path of [...new Set(paths)].sort()) {
    const key = JSON.stringify(["book-progress", library, path]);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}

export async function getSavedWikipedia(root: string, library: LibraryName, path: string): Promise<WikipediaDetails | null> {
  await ensureBook(root, library, path);
  const record = await getDatabase().bookData.findUnique({
    where: { library_path: { library, path } },
    select: { wikipedia: true, cover: true },
  });
  if (!record || record.wikipedia === null) return null;
  if (!isWikipediaDetails(record.wikipedia)) throw new Error("Saved book details are invalid.");
  return {
    ...record.wikipedia,
    image: record.wikipedia.image ? { ...record.wikipedia.image, cached: !!record.cover } : null,
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
  await ensureBook(root, library, path);
  const image = cover ? Uint8Array.from(cover) : null;
  await getDatabase().bookData.upsert({
    where: { library_path: { library, path } },
    create: { library, path, storagePath: path, wikipedia: wikipediaJson(details), cover: image, coverType },
    update: { wikipedia: wikipediaJson(details), cover: image, coverType },
  });
}

export async function savedCover(root: string, library: LibraryName, path: string) {
  await ensureBook(root, library, path);
  return getDatabase().bookData.findUnique({ where: { library_path: { library, path } }, select: { cover: true, coverType: true } });
}

export async function listBookmarks(root: string, library: LibraryName, path: string) {
  await ensureBook(root, library, path);
  return getDatabase().bookBookmark.findMany({
    where: { library, path },
    select: { id: true, position: true, label: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function addBookmark(root: string, library: LibraryName, path: string, position: string, label: string) {
  const book = await ensureBook(root, library, path);
  if (book.format === "pdf") throw new Error("Bookmarks are available for EPUBs and audiobooks.");
  if (book.format === "m4b" && (!Number.isFinite(Number(position)) || Number(position) < 0)) throw new Error("Invalid audiobook position.");
  const db = getDatabase();
  await db.bookData.upsert({
    where: { library_path: { library, path } },
    create: { library, path, storagePath: path },
    update: {},
  });
  return db.bookBookmark.create({
    data: { library, path, position, label },
    select: { id: true, position: true, label: true, createdAt: true },
  });
}

export async function removeBookmark(root: string, library: LibraryName, path: string, id: string) {
  await ensureBook(root, library, path);
  const result = await getDatabase().bookBookmark.deleteMany({ where: { id, library, path } });
  if (!result.count) throw new Error("Bookmark not found.");
}

export async function addStoragePaths(books: LibraryBook[]): Promise<LibraryBook[]> {
  const records = await getDatabase().bookData.findMany({ select: { library: true, path: true, storagePath: true } });
  const paths = new Map(records.map((record) => [`${record.library}:${record.path}`, record.storagePath]));
  return books.map((book) => {
    const storagePath = paths.get(`${book.library ?? "ebooks"}:${book.path}`);
    return storagePath && storagePath !== book.path ? { ...book, storagePath } : book;
  });
}

export async function getProgress(root: string, library: LibraryName, path: string) {
  const book = await ensureBook(root, library, path);
  if (book.format === "pdf") throw new Error("Progress is unavailable for PDFs.");
  const record = await getDatabase().bookData.findUnique({ where: { library_path: { library, path } }, select: { progress: true, revision: true } });
  return { position: record?.progress ?? null, revision: record?.revision ?? 0 };
}

export async function saveProgress(root: string, library: LibraryName, path: string, position: string, revision: number) {
  const db = getDatabase();
  return db.$transaction(async (tx) => {
    await lockBookPaths(tx, library, [path]);
    const book = await ensureBook(root, library, path);
    if (!validBookPosition(book.format, position)) throw new Error("Invalid book position.");
    await tx.bookData.createMany({ data: [{ library, path, storagePath: path }], skipDuplicates: true });
    const result = await tx.bookData.updateMany({
      where: { library, path, revision },
      data: { progress: position, revision: { increment: 1 } },
    });
    if (!result.count) {
      const current = await tx.bookData.findUniqueOrThrow({ where: { library_path: { library, path } }, select: { progress: true, revision: true } });
      return { conflict: true as const, progress: { position: current.progress, revision: current.revision } };
    }
    return { conflict: false as const, progress: { position, revision: revision + 1 } };
  });
}

export async function renameBook(root: string, library: LibraryName, path: string, title: string): Promise<LibraryBook> {
  const book = await ensureBook(root, library, path);
  const trimmed = title.trim();
  if (!trimmed || trimmed.length > 200 || /[<>:"/\\|?*\x00-\x1f]/.test(trimmed) ||
      /[. ]$/.test(trimmed) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(trimmed)) {
    throw new Error("Enter a valid filename without an extension.");
  }

  const extension = extname(path);
  const separator = path.lastIndexOf("/");
  const nextPath = `${separator < 0 ? "" : path.slice(0, separator + 1)}${trimmed}${extension}`;
  if (nextPath === path) return (await addStoragePaths([book]))[0];
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
      await lockBookPaths(tx, library, [path, nextPath]);
      if (await tx.bookData.findUnique({ where: { library_path: { library, path: nextPath } } })) {
        throw new Error("The new filename already has saved book data.");
      }
      await link(original, target);
      targetCreated = true;
      const current = await tx.bookData.upsert({
        where: { library_path: { library, path } },
        create: { library, path, storagePath: path },
        update: {},
      });
      await tx.bookData.update({ where: { library_path: { library, path } }, data: { path: nextPath } });
      await unlink(original);
      originalRemoved = true;
      return { storagePath: current.storagePath };
    });
    return { ...book, path: nextPath, title: trimmed, ...saved };
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
