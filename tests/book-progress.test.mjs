import assert from "node:assert/strict";
import test from "node:test";
import { validBookPosition } from "../shared/planner/books.ts";
import { ProgressQueue } from "../src/features/books/hooks/use-book-progress.ts";
import { audioPositionToSave, restoredAudioSeconds } from "../src/features/books/utils/audio-progress.ts";

const book = { path: "New.epub", title: "New", format: "epub" };
const cfi = "epubcfi(/6/2!/4/2)";

test("audio restore rejects invalid or out-of-range positions and ignores startup events", () => {
  assert.equal(restoredAudioSeconds("42.5", 100), 42.5);
  assert.equal(restoredAudioSeconds(null, 100), 0);
  assert.equal(restoredAudioSeconds("100", 100), null);
  assert.equal(restoredAudioSeconds("", 100), null);
  assert.equal(audioPositionToSave({ currentTime: 0, ended: false }, false), null);
  assert.equal(audioPositionToSave({ currentTime: 42.5, ended: false }, true), "42.5");
  assert.equal(audioPositionToSave({ currentTime: 100, ended: true }, true), "0");
});

test("book positions are validated for each format", () => {
  assert.equal(validBookPosition("m4b", "0"), true);
  assert.equal(validBookPosition("m4b", "Infinity"), false);
  assert.equal(validBookPosition("pdf", "0"), false);
  assert.equal(validBookPosition("epub", ""), false);
});

test("serialized saves retry uncertain responses and surface real conflicts", async (t) => {
  let remote = { position: cfi, revision: 1 };
  let failAfterCommit = true;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    if (options?.method !== "PUT") return Response.json(remote);
    calls++;
    const input = JSON.parse(options.body);
    if (input.revision !== remote.revision) return Response.json(remote, { status: 409 });
    remote = { position: input.position, revision: remote.revision + 1 };
    if (failAfterCommit) { failAfterCommit = false; throw new Error("connection lost"); }
    return Response.json(remote);
  });
  const queue = new ProgressQueue(book, () => {});
  await queue.load();
  queue.enqueue("epubcfi(/6/4)");
  assert.equal(await queue.flush(), false);
  assert.match(queue.state.error, /connection lost/);
  await queue.retry();
  assert.equal(queue.state.conflict, null);
  assert.equal(queue.state.progress.revision, 2);
  remote = { position: "epubcfi(/6/8)", revision: 3 };
  queue.enqueue("epubcfi(/6/6)");
  assert.equal(await queue.flush(), false);
  assert.equal(queue.state.conflict.position, "epubcfi(/6/8)");
  await queue.keepMine();
  assert.equal(remote.position, "epubcfi(/6/6)");
  assert.equal(remote.revision, 4);
  assert.equal(calls, 4);
});

test("in-flight updates are serialized and the latest position is saved", async (t) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let remote = { position: null, revision: 0 };
  const writes = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    if (options?.method !== "PUT") return Response.json(remote);
    const input = JSON.parse(options.body);
    writes.push(input);
    if (writes.length === 1) await gate;
    assert.equal(input.revision, remote.revision);
    remote = { position: input.position, revision: remote.revision + 1 };
    return Response.json(remote);
  });
  const queue = new ProgressQueue(book, () => {});
  await queue.load();
  queue.enqueue(cfi);
  const saving = queue.flush();
  queue.enqueue("epubcfi(/6/4)");
  release();
  assert.equal(await saving, true);
  assert.deepEqual(writes.map(({ revision }) => revision), [0, 1]);
  assert.equal(remote.position, "epubcfi(/6/4)");
  await queue.flush();
});
