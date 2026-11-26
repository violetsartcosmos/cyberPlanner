import assert from "node:assert/strict";
import test from "node:test";
import { Common } from "googleapis";
import { calendarWriteError, listCalendarData, saveCalendarEvent, validCalendarRange } from "../server/google/calendar.ts";
import { eventHour, eventOccursOnDate } from "../src/features/calendar/components/google-calendar.tsx";
import { parseDate } from "../shared/planner/utils.ts";

test("calendar loads all pages and distinguishes writable, read-only and free-busy calendars", async () => {
  const calls = [];
  const client = {
    calendarList: { list: async ({ pageToken }) => pageToken
      ? { data: { items: [{ id: "busy", summary: "Busy", accessRole: "freeBusyReader" }] } }
      : { data: { items: [
        { id: "work", summary: "Work", accessRole: "owner" },
        { id: "shared", summary: "Shared", accessRole: "reader" },
      ], nextPageToken: "next" } } },
    events: { list: async (args) => {
      calls.push(args);
      if (args.calendarId === "shared") return { data: { items: [
        { id: "all-day", etag: '"2"', summary: "Holiday", start: { date: "2026-11-22" }, end: { date: "2026-11-24" } },
      ] } };
      return args.pageToken
        ? { data: { items: [{ id: "cancelled", status: "cancelled" }] } }
        : { data: { items: [
          { id: "meeting", etag: '"1"', summary: "Meeting", recurringEventId: "series", start: { dateTime: "2026-11-22T09:00:00Z" }, end: { dateTime: "2026-11-22T10:00:00Z" } },
        ], nextPageToken: "next-events" } };
    } },
  };
  const result = await listCalendarData(client, "2026-11-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z");
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.singleEvents));
  assert.deepEqual(result.unavailableCalendars, ["Busy"]);
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].editable, true);
  assert.equal(result.events[0].recurring, true);
  assert.equal(result.events[1].editable, false);
  assert.equal(result.events[1].allDay, true);
});

test("event writes preserve unrelated fields and use conditional updates", async () => {
  const calls = [];
  const client = { events: {
    insert: async (params) => calls.push(["insert", params]),
    patch: async (params, options) => calls.push(["patch", params, options]),
  } };
  await saveCalendarEvent(client, "cal", "", "", " New ", "2026-11-22", "2026-11-23", true, "", "");
  await saveCalendarEvent(client, "cal", "instance", '"etag"', "Updated", "2026-11-22T09:00:00.000Z", "2026-11-22T10:00:00.000Z", false, "America/Chicago", "America/Chicago");
  assert.deepEqual(calls[0][1].requestBody, { summary: "New", start: { date: "2026-11-22" }, end: { date: "2026-11-23" } });
  assert.deepEqual(calls[1][1].requestBody, { summary: "Updated", start: { dateTime: "2026-11-22T09:00:00.000Z", timeZone: "America/Chicago" }, end: { dateTime: "2026-11-22T10:00:00.000Z", timeZone: "America/Chicago" } });
  assert.deepEqual(calls[1][2], { headers: { "If-Match": '"etag"' } });
  const conflict = { events: { patch: async () => {
    throw new Common.GaxiosError("Precondition Failed", {}, new Response(null, { status: 412 }));
  } } };
  await assert.rejects(saveCalendarEvent(conflict, "cal", "instance", '"etag"', "Updated", "2026-11-22", "2026-11-23", true, "", ""), /changed in Google Calendar/);
});

test("calendar write checks concern event timing and update revisions, not field types or lengths", () => {
  const input = {
    title: "x".repeat(1025), start: "2026-11-22T09:00:00-06:00", end: "2026-11-22T10:00:00-06:00",
    allDay: false, etag: "x".repeat(1025), startTimeZone: "", endTimeZone: "",
  };
  assert.equal(calendarWriteError("instance", input), null);
  assert.match(calendarWriteError("instance", { ...input, etag: "" }), /Refresh/);
  assert.match(calendarWriteError("", { ...input, end: input.start }), /end must be after/);
  assert.match(calendarWriteError("", { ...input, start: "invalid" }), /valid start/);
});

test("calendar ranges and event placement respect exclusive end dates", () => {
  assert.equal(validCalendarRange("2026-11-01T00:00:00.000Z", "2026-12-15T00:00:00.000Z"), true);
  assert.equal(validCalendarRange("2026-02-30T00:00:00.000Z", "2026-03-10T00:00:00.000Z"), false);
  assert.equal(validCalendarRange("2026-11-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"), false);
  const allDay = { allDay: true, start: "2026-11-22", end: "2026-11-24" };
  assert.equal(eventOccursOnDate(allDay, parseDate("2026-11-23")), true);
  assert.equal(eventOccursOnDate(allDay, parseDate("2026-11-24")), false);
  const start = new Date(2026, 10, 22, 23, 0).toISOString();
  const end = new Date(2026, 10, 23, 1, 0).toISOString();
  const timed = { allDay: false, start, end };
  assert.equal(eventOccursOnDate(timed, parseDate("2026-11-22")), true);
  assert.equal(eventOccursOnDate(timed, parseDate("2026-11-23")), true);
  assert.equal(eventOccursOnDate(timed, parseDate("2026-11-24")), false);
  assert.equal(eventHour(timed, parseDate("2026-11-23")), 0);
});
