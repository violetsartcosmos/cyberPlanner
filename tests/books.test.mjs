import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BookAction } from "../client/components/books/book-action.tsx";
import { matchesLibraryFilter, renameErrorMessage, shuffleBooks } from "../client/components/books/library-utils.ts";
import { commonsFileTitle, parseWikipediaExtract, wikipediaImageReference } from "../client/components/books/wikipedia-utils.ts";
import { isWikipediaDetails, MAX_WIKIPEDIA_TEXT_LENGTH } from "../shared/planner/books.ts";
import { bookResponse, getBookDetails, listBooks, saveBookDetails } from "../server/books/library.ts";

test("Wikipedia extracts preserve introductory paragraphs and nested sections", () => {
  assert.deepEqual(parseWikipediaExtract("First paragraph.\n\nSecond paragraph.\n\n== History ==\n\nPast.\n\n=== Origins ===\n\nDetails.\n\n== Legacy ==\n\nLater."), {
    description: "First paragraph.\n\nSecond paragraph.",
    sections: [
      { title: "History", level: 2, text: "Past." },
      { title: "Origins", level: 3, text: "Details." },
      { title: "Legacy", level: 2, text: "Later." },
    ],
  });
  assert.deepEqual(parseWikipediaExtract("Only an introduction."), { description: "Only an introduction.", sections: [] });
});

test("Commons file pages and image links resolve to file titles", () => {
  assert.equal(commonsFileTitle("https://commons.wikimedia.org/wiki/File:Example%20image.jpg"), "File:Example image.jpg");
  assert.equal(commonsFileTitle("https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg"), "File:Example.jpg");
  assert.equal(commonsFileTitle("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Example.jpg/600px-Example.jpg"), "File:Example.jpg");
  for (const url of ["https://example.com/image.jpg", "https://commons.wikimedia.org/wiki/File:", "https://upload.wikimedia.org/wikipedia/en/a/ab/Example.jpg", "https://user@commons.wikimedia.org/wiki/File:Example.jpg"]) {
    assert.throws(() => commonsFileTitle(url), /Wikimedia Commons/);
  }
});

test("Wikipedia media viewer links resolve to their local image file", () => {
  assert.deepEqual(wikipediaImageReference("https://en.wikipedia.org/wiki/Example#/media/File:Example_cover.jpg"), {
    origin: "https://en.wikipedia.org", title: "File:Example_cover.jpg",
  });
  assert.deepEqual(wikipediaImageReference("https://upload.wikimedia.org/wikipedia/en/a/ab/Example.jpg"), {
    origin: "https://en.wikipedia.org", title: "File:Example.jpg",
  });
  assert.throws(() => wikipediaImageReference("https://en.wikipedia.org.evil.test/wiki/File:Example.jpg"), /Wikipedia or Wikimedia/);
});

test("Wikipedia details validate section data and retain legacy imports", () => {
  const legacy = { url: "https://en.wikipedia.org/wiki/Example", description: "Introduction", image: null };
  assert.equal(isWikipediaDetails(legacy), true);
  const withSections = { ...legacy, sections: [{ title: "History", level: 2, text: "Past" }] };
  assert.equal(isWikipediaDetails(withSections), true);
  assert.equal(isWikipediaDetails({ ...withSections, sections: [{ title: "History", level: 7, text: "Past" }] }), false);
  assert.equal(isWikipediaDetails({ ...withSections, sections: [{ title: "History", level: 2, text: "x".repeat(MAX_WIKIPEDIA_TEXT_LENGTH) }] }), false);
});

test("featured order is shuffled independently of shelf order", (t) => {
  const books = [
    { path: "A.epub", title: "A", format: "epub" },
    { path: "B.pdf", title: "B", format: "pdf" },
    { path: "C.m4b", title: "C", format: "m4b", library: "audiblebooks" },
  ];
  let rolls = [];
  t.mock.method(Math, "random", () => rolls.shift());

  const orders = new Set();
  for (const first of [0, 1 / 3, 2 / 3]) {
    for (const second of [0, 0.5]) {
      rolls = [first, second];
      const shuffled = shuffleBooks(books);
      orders.add(shuffled.map((book) => book.title).join(""));
      assert.deepEqual(books.map((book) => book.title), ["A", "B", "C"]);
    }
  }
  assert.equal(orders.size, 6);
  assert.deepEqual(shuffleBooks([]), []);
  assert.deepEqual(shuffleBooks([books[0]]), [books[0]]);
});

test("featured selection and shelf use the same search and format filter", () => {
  const books = [
    { path: "Fiction/Star.epub", title: "Star", format: "epub" },
    { path: "Fiction/Star.m4b", title: "Star audio", format: "m4b", library: "audiblebooks" },
    { path: "Other.pdf", title: "Other", format: "pdf" },
  ];
  const featuredOrder = [books[2], books[1], books[0]];
  const matches = (book) => matchesLibraryFilter(book, "FICTION", "ebooks");
  assert.deepEqual(books.filter(matches), [books[0]]);
  assert.equal(featuredOrder.find(matches), books[0]);
  assert.equal(featuredOrder.find((book) => matchesLibraryFilter(book, "star", "audio")), books[1]);
  assert.equal(featuredOrder.find((book) => matchesLibraryFilter(book, "missing", "all")), undefined);
});

test("book actions preserve format-specific labels and PDF links", () => {
  const render = (book, epubLabel) => renderToStaticMarkup(
    React.createElement(BookAction, { book, onRead() {}, epubLabel }),
  );
  assert.match(render({ path: "A.epub", title: "A", format: "epub" }), />Read<\/button>/);
  assert.match(render({ path: "A.epub", title: "A", format: "epub" }, "Read EPUB"), />Read EPUB<\/button>/);
  assert.match(render({ path: "A.m4b", title: "A", format: "m4b" }), />Listen<\/button>/);
  assert.match(render({ path: "A.pdf", title: "A", format: "pdf" }), /href="\/api\/books\/file\?path=A.pdf"[^>]*>Open PDF<\/a>/);
});

test("rename failures report server errors and stale API responses", async () => {
  assert.equal(await renameErrorMessage(new Response("404 Not Found", { status: 404 })),
    "Rename API not found. Restart the server to load the latest version.");
  assert.equal(await renameErrorMessage(Response.json({ error: "A file with that name already exists." }, { status: 409 })),
    "A file with that name already exists.");
  assert.equal(await renameErrorMessage(new Response("bad json", { status: 500, headers: { "Content-Type": "application/json" } })),
    "Could not rename the file (HTTP 500).");
});

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
    const sectioned = { ...details, sections: [{ title: "History", level: 2, text: "A section of the article." }] };
    await saveBookDetails(root, "Guide.pdf", sectioned);
    assert.deepEqual(await getBookDetails(root, "Guide.pdf"), sectioned);
    await saveBookDetails(root, "Guide.pdf", details);
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
