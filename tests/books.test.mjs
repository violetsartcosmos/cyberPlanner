import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bookResponse, listBooks } from "../server/books/library.ts";

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
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
