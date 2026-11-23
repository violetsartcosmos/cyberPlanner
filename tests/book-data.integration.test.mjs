import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getDatabase } from "../server/db/client.ts";
import { addBookmark, addStoragePaths, getSavedWikipedia, listBookmarks, removeBookmark, renameBook, savedCover, saveWikipedia } from "../server/books/data.ts";
import { saveBookDetails } from "../server/books/library.ts";

test("book data survives migration, renaming and bookmark changes", async () => {
  if (!process.env.TEST_DATABASE_URL && process.env.BOOK_DATA_TEST_ALLOW_SHARED !== "1") {
    throw new Error("Set TEST_DATABASE_URL or explicitly approve BOOK_DATA_TEST_ALLOW_SHARED=1.");
  }
  if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const prefix = `cyberplanner-test-${randomUUID()}`;
  const original = `${prefix}.m4b`;
  const renamedTitle = `${prefix} Apollyon (Left Behind Series 05)`;
  const renamed = `${renamedTitle}.m4b`;
  const collision = `${prefix}-existing.m4b`;
  const root = await mkdtemp(join(tmpdir(), "cyberplanner-book-data-"));
  const db = getDatabase();
  try {
    await writeFile(join(root, original), "test audio");
    const legacy = { url: "https://en.wikipedia.org/wiki/Example", description: "Legacy text", image: null };
    await saveBookDetails(root, original, legacy, "audiblebooks");
    assert.deepEqual(await getSavedWikipedia(root, "audiblebooks", original), legacy);

    const image = { url: "https://upload.wikimedia.org/example.jpg", page: "https://commons.wikimedia.org/wiki/File:Example.jpg", title: "Example", author: "Author", license: "CC BY 4.0" };
    const details = { ...legacy, image, sections: [{ title: "History", level: 2, text: "Text" }] };
    const cover = Uint8Array.from([255, 216, 255, 1, 2]);
    await saveWikipedia(root, "audiblebooks", original, details, cover, "image/jpeg");
    assert.equal((await getSavedWikipedia(root, "audiblebooks", original)).image.cached, true);
    const bookmark = await addBookmark(root, "audiblebooks", original, "42.5", "00:42");

    await writeFile(join(root, collision), "existing");
    await assert.rejects(() => renameBook(root, "audiblebooks", original, `${prefix}-existing`));
    assert.equal(await readFile(join(root, collision), "utf8"), "existing");
    await assert.rejects(() => renameBook(root, "audiblebooks", original, "../unsafe"), /valid filename/);
    if (process.platform === "win32") {
      await assert.rejects(() => renameBook(root, "audiblebooks", original, prefix.toUpperCase()), /capitalization/);
      assert.equal(await readFile(join(root, original), "utf8"), "test audio");
    }
    const updated = await renameBook(root, "audiblebooks", original, renamedTitle);
    assert.equal(updated.path, renamed);
    assert.equal(updated.storagePath, original);
    assert.equal(await readFile(join(root, renamed), "utf8"), "test audio");
    await assert.rejects(() => readFile(join(root, original)), { code: "ENOENT" });
    assert.equal((await listBookmarks(root, "audiblebooks", renamed))[0].id, bookmark.id);
    assert.deepEqual(Array.from((await savedCover(root, "audiblebooks", renamed)).cover), Array.from(cover));
    assert.equal((await getSavedWikipedia(root, "audiblebooks", renamed)).description, "Legacy text");
    assert.equal((await addStoragePaths([updated]))[0].storagePath, original);
    await removeBookmark(root, "audiblebooks", renamed, bookmark.id);
    assert.deepEqual(await listBookmarks(root, "audiblebooks", renamed), []);
  } finally {
    await db.bookData.deleteMany({ where: { library: "audiblebooks", path: { in: [original, renamed, collision] } } });
    await db.$disconnect();
    await rm(root, { recursive: true, force: true });
  }
});
