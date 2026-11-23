import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bookResponse, getBookDetails, listBooks, saveBookDetails } from "../server/books/library.ts";

test("library lists nested EPUBs and PDFs and serves only valid book paths", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cyberplanner-books-"));
  const root = join(temp, "ebooks");
  try {
    await mkdir(join(root, "shelf"), { recursive: true });
    await writeFile(join(root, "shelf", "Example.EPUB"), "epub content");
    await writeFile(join(root, "Guide.pdf"), "0123456789");
    await writeFile(join(root, "cover.png"), "image");
    await writeFile(join(temp, "outside.pdf"), "private");

    assert.deepEqual(await listBooks(root), [
      { path: "shelf/Example.EPUB", title: "Example", format: "epub" },
      { path: "Guide.pdf", title: "Guide", format: "pdf" },
    ]);
    assert.deepEqual(await listBooks(join(temp, "missing")), []);

    const epub = await bookResponse(root, "shelf/Example.EPUB", null);
    assert.equal(epub.status, 200);
    assert.equal(epub.headers.get("content-type"), "application/epub+zip");
    assert.equal(await epub.text(), "epub content");
    const pdf = await bookResponse(root, "Guide.pdf", "bytes=2-5");
    assert.equal(pdf.status, 206);
    assert.equal(pdf.headers.get("content-range"), "bytes 2-5/10");
    assert.equal(await pdf.text(), "2345");
    const suffix = await bookResponse(root, "Guide.pdf", "bytes=-3");
    assert.equal(await suffix.text(), "789");
    assert.equal((await bookResponse(root, "Guide.pdf", "bytes=20-30")).status, 416);
    assert.equal((await bookResponse(root, "../outside.pdf", null)).status, 404);
    assert.equal((await bookResponse(root, "shelf\\..\\outside.pdf", null)).status, 404);
    assert.equal((await bookResponse(root, "cover.png", null)).status, 404);
    assert.equal((await bookResponse(root, "missing.epub", null)).status, 404);

    const details = {
      url: "https://en.wikipedia.org/wiki/Example",
      description: "An example description.",
      image: {
        url: "https://upload.wikimedia.org/example.jpg",
        page: "https://commons.wikimedia.org/wiki/File:Example.jpg",
        title: "Example", author: "Example author", license: "CC BY 4.0",
      },
    };
    assert.equal(await getBookDetails(root, "Guide.pdf"), null);
    await saveBookDetails(root, "Guide.pdf", details);
    assert.deepEqual(await getBookDetails(root, "Guide.pdf"), details);
    const thumbnail = { ...details, image: { ...details.image, url: "https://thumb.wikimedia.org/example.jpg" } };
    await saveBookDetails(root, "shelf/Example.EPUB", thumbnail);
    assert.deepEqual(await getBookDetails(root, "shelf/Example.EPUB"), thumbnail);
    await assert.rejects(() => saveBookDetails(root, "../outside.pdf", details), /Book not found/);
    await assert.rejects(() => saveBookDetails(root, "Guide.pdf", { ...details, url: "https://example.com/wiki/Example" }), /Invalid/);
    await assert.rejects(() => saveBookDetails(root, "Guide.pdf", { ...details, image: { ...details.image, url: "https://example.com/image.jpg" } }), /Invalid/);
    assert.deepEqual(await getBookDetails(root, "Guide.pdf"), details);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("audiobooks are listed separately, streamed by range, and keep their own details", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cyberplanner-audiobooks-"));
  const root = join(temp, "audiblebooks");
  try {
    await mkdir(join(root, "shelf"), { recursive: true });
    await writeFile(join(root, "shelf", "Example.M4B"), "0123456789");
    await writeFile(join(root, "protected.aaxc"), "protected");
    await writeFile(join(root, "other.pdf"), "not an audiobook");
    assert.deepEqual(await listBooks(root, "audiblebooks"), [
      { path: "shelf/Example.M4B", title: "Example", format: "m4b", library: "audiblebooks" },
    ]);
    assert.deepEqual(await listBooks(root), [
      { path: "other.pdf", title: "other", format: "pdf" },
    ]);
    const audio = await bookResponse(root, "shelf/Example.M4B", "bytes=3-5", "audiblebooks");
    assert.equal(audio.status, 206);
    assert.equal(audio.headers.get("content-type"), "audio/mp4");
    assert.equal(audio.headers.get("content-range"), "bytes 3-5/10");
    assert.equal(await audio.text(), "345");
    assert.equal((await bookResponse(root, "protected.aaxc", null, "audiblebooks")).status, 404);
    assert.equal((await bookResponse(root, "../other.m4b", null, "audiblebooks")).status, 404);
    assert.equal((await bookResponse(root, "shelf/Example.M4B", null)).status, 404);

    const details = { url: "https://en.wikipedia.org/wiki/Example", description: "An audiobook.", image: null };
    await saveBookDetails(root, "shelf/Example.M4B", details, "audiblebooks");
    assert.deepEqual(await getBookDetails(root, "shelf/Example.M4B", "audiblebooks"), details);
    await assert.rejects(() => getBookDetails(root, "shelf/Example.M4B"), /Book not found/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
