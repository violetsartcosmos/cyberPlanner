import { createReadStream } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { isWikipediaDetails, type LibraryBook, type WikipediaDetails } from "../../shared/planner/books";

export const libraryDirectory = resolve("ebooks");
export const audiobookDirectory = resolve("audiblebooks");
export type LibraryName = "ebooks" | "audiblebooks";

function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function formatOf(path: string, library: LibraryName): LibraryBook["format"] | null {
  const extension = extname(path).toLowerCase();
  if (library === "audiblebooks") return extension === ".m4b" ? "m4b" : null;
  return extension === ".epub" ? "epub" : extension === ".pdf" ? "pdf" : null;
}

export async function listBooks(root: string, library: LibraryName = "ebooks"): Promise<LibraryBook[]> {
  const books: LibraryBook[] = [];
  async function visit(directory: string, prefix: string) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (directory === root && isMissing(error)) return;
      throw error;
    }
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await visit(resolve(directory, entry.name), path);
      } else if (entry.isFile()) {
        const format = formatOf(entry.name, library);
        if (format) books.push({
          path, title: entry.name.slice(0, -extname(entry.name).length), format,
          ...(library === "audiblebooks" ? { library } : {}),
        });
      }
    }
  }
  await visit(root, "");
  return books.sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path));
}

function detailsFile(root: string, path: string) {
  return resolve(root, ".cyberplanner-metadata", `${createHash("sha256").update(path).digest("hex")}.json`);
}

export async function getBookDetails(root: string, path: string, library: LibraryName = "ebooks"): Promise<WikipediaDetails | null> {
  if (!(await listBooks(root, library)).some((book) => book.path === path)) throw new Error("Book not found.");
  try {
    const details: unknown = JSON.parse(await readFile(detailsFile(root, path), "utf8"));
    if (!isWikipediaDetails(details)) throw new Error("Saved book details are invalid.");
    return details;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export async function saveBookDetails(root: string, path: string, details: WikipediaDetails, library: LibraryName = "ebooks") {
  if (!isWikipediaDetails(details)) throw new Error("Invalid book details.");
  if (!(await listBooks(root, library)).some((book) => book.path === path)) throw new Error("Book not found.");
  const file = detailsFile(root, path);
  const directory = resolve(root, ".cyberplanner-metadata");
  await mkdir(directory, { recursive: true });
  const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(details), { encoding: "utf8", flag: "wx" });
    await rename(temporary, file);
  } finally {
    try {
      await unlink(temporary);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
}

export async function bookResponse(root: string, path: string, range: string | null, library: LibraryName = "ebooks"): Promise<Response> {
  const format = formatOf(path, library);
  const parts = path.split("/");
  if (!format || parts.some((part) => !part || part === "." || part === ".." || part.includes("\\") || part.includes("\0"))) {
    return new Response("Book not found.", { status: 404 });
  }
  try {
    const rootPath = await realpath(root);
    const filePath = await realpath(resolve(rootPath, ...parts));
    const withinRoot = relative(rootPath, filePath);
    if (!withinRoot || withinRoot === ".." || withinRoot.startsWith(`..${sep}`) || isAbsolute(withinRoot)) {
      return new Response("Book not found.", { status: 404 });
    }
    const file = await stat(filePath);
    if (!file.isFile()) return new Response("Book not found.", { status: 404 });
    let start = 0;
    let end = file.size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]) || file.size === 0) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
      }
      if (match[1]) {
        start = Number(match[1]);
        if (match[2]) end = Math.min(Number(match[2]), end);
      } else {
        start = Math.max(0, file.size - Number(match[2]));
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
      }
    }
    const headers = new Headers({
      "Content-Type": format === "epub" ? "application/epub+zip" : format === "pdf" ? "application/pdf" : "audio/mp4",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
      "Content-Length": String(file.size === 0 ? 0 : end - start + 1),
    });
    if (range) headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);
    const body = file.size === 0 ? null : Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream<Uint8Array>;
    return new Response(body, { status: range ? 206 : 200, headers });
  } catch (error) {
    if (isMissing(error)) return new Response("Book not found.", { status: 404 });
    throw error;
  }
}
