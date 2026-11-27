import assert from "node:assert/strict";
import test from "node:test";
import { isValidJournalDate } from "../server/journals/routes.ts";

test("journal dates accept real YYYY-MM-DD dates", () => {
  for (const input of [
    "2024-02-29", "0001-01-01", "0099-01-01", "9999-12-31",
  ]) {
    assert.equal(isValidJournalDate(input), true, input);
  }
});

test("journal dates reject invalid calendar dates and other formats", () => {
  for (const input of [
    "2023-02-29", "2024-02-30", "0000-01-01", "20240229",
    "2020-W01-1", "2020W011", "2020-1-01", "2020-01-01T00:00:00",
  ]) {
    assert.equal(isValidJournalDate(input), false, input);
  }
});
