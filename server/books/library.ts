import { createReadStream } from "node:fs";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import type { LibraryBook } from "../../shared/planner/books";

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
  return books.sort((firstBook, secondBook) => firstBook.title.localeCompare(secondBook.title) || firstBook.path.localeCompare(secondBook.path));
}

export async function findBook(root: string, path: string, library: LibraryName = "ebooks"): Promise<LibraryBook | null> {
  const format = formatOf(path, library);
  const parts = path.split("/");
  if (!format || parts.some((part) => !part || part === "." || part === ".." || part.includes("\\") || part.includes("\0") || (process.platform === "win32" && part.includes(":")))) return null;
  const rootPath = resolve(root);
  const withinRoot = relative(rootPath, resolve(rootPath, ...parts));
  if (!withinRoot || withinRoot === ".." || withinRoot.startsWith(`..${sep}`) || isAbsolute(withinRoot)) return null;
  try {
    let current = rootPath;
    for (let index = 0; index < parts.length; index += 1) {
      current = resolve(current, parts[index]);
      const entry = await lstat(current);
      if (index === parts.length - 1 ? !entry.isFile() : !entry.isDirectory()) return null;
    }
    if (relative(await realpath(rootPath), await realpath(current)).split(sep).join("/") !== path) return null;
    const name = parts[parts.length - 1];
    return {
      path, title: name.slice(0, -extname(name).length), format,
      ...(library === "audiblebooks" ? { library } : {}),
    };
  } catch (error) {
    if (isMissing(error) || (error instanceof Error && "code" in error && error.code === "ENOTDIR")) return null;
    throw error;
  }
}

export async function bookResponse(root: string, path: string, range: string | null | undefined, library: LibraryName = "ebooks"): Promise<Response> {
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
