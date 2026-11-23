import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { backupBooks, findSevenZip } from "../scripts/backup-books.mjs";

let sevenZip;
try {
  sevenZip = findSevenZip();
} catch {
  console.log("Skipping archive round-trip test: 7-Zip is not installed.");
}

test("dated snapshots preserve nested and hidden files without overwriting earlier archives", { skip: !sevenZip }, async () => {
  const temp = await mkdtemp(join(tmpdir(), "cyberplanner-archive-"));
  try {
    const source = join(temp, "ebooks");
    const destination = join(temp, "backups");
    await mkdir(join(source, "nested"), { recursive: true });
    await writeFile(join(source, "nested", "book.epub"), "book");
    await writeFile(join(source, ".hidden"), "metadata");
    await assert.rejects(() => backupBooks(source, join(source, "backups"), sevenZip), /outside/);
    const first = await backupBooks(source, destination, sevenZip);
    await writeFile(join(source, "nested", "book.epub"), "updated book");
    const second = await backupBooks(source, destination, sevenZip);
    assert.notEqual(first.path, second.path);
    assert.ok(first.bytes > 0);
    const extracted = join(temp, "restored");
    await mkdir(extracted);
    const result = spawnSync(sevenZip, ["x", "-bso0", `-o${extracted}`, first.path]);
    assert.equal(result.status, 0, result.stderr?.toString());
    assert.equal(await readFile(join(extracted, "ebooks", "nested", "book.epub"), "utf8"), "book");
    assert.equal(await readFile(join(extracted, "ebooks", ".hidden"), "utf8"), "metadata");
    const updated = join(temp, "updated");
    await mkdir(updated);
    const secondResult = spawnSync(sevenZip, ["x", "-bso0", `-o${updated}`, second.path]);
    assert.equal(secondResult.status, 0, secondResult.stderr?.toString());
    assert.equal(await readFile(join(updated, "ebooks", "nested", "book.epub"), "utf8"), "updated book");
    const audiobookSource = join(temp, "audiblebooks");
    await mkdir(audiobookSource);
    await writeFile(join(audiobookSource, "audio.m4b"), "audio");
    await writeFile(join(audiobookSource, "protected.aaxc"), "protected");
    const audioArchive = await backupBooks(audiobookSource, destination, sevenZip);
    assert.match(audioArchive.path, /audiblebooks-.*\.7z$/);
    const audioRestore = join(temp, "audio-restored");
    await mkdir(audioRestore);
    const audioResult = spawnSync(sevenZip, ["x", "-bso0", `-o${audioRestore}`, audioArchive.path]);
    assert.equal(audioResult.status, 0, audioResult.stderr?.toString());
    assert.equal(await readFile(join(audioRestore, "audiblebooks", "audio.m4b"), "utf8"), "audio");
    assert.equal(await readFile(join(audioRestore, "audiblebooks", "protected.aaxc"), "utf8"), "protected");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
