import { isValidDateKey } from "../../shared/planner/utils";
import type { ActionHandler } from "../planner/dispatch";
import { importGmailMessage, searchGmail, syncGoogleTasks } from "./service";
import { getGoogleCalendarClient } from "./service";
import { saveCalendarEvent } from "./calendar";

function isUtcTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

export const googleFormActions = {
  async save_calendar_event(form) {
    const calendarId = form.get("calendarId");
    const eventId = form.get("eventId");
    const etag = form.get("etag");
    const title = form.get("title");
    const start = form.get("start");
    const end = form.get("end");
    const allDay = form.get("allDay");
    const startTimeZone = form.get("startTimeZone");
    const endTimeZone = form.get("endTimeZone");
    if (typeof calendarId !== "string" || !calendarId || calendarId.length > 1024 ||
        typeof eventId !== "string" || eventId.length > 1024 ||
        typeof etag !== "string" || etag.length > 1024 || (eventId && !etag) ||
        typeof title !== "string" || !title.trim() || title.length > 1024 ||
        typeof start !== "string" || typeof end !== "string" ||
        typeof startTimeZone !== "string" || startTimeZone.length > 255 ||
        typeof endTimeZone !== "string" || endTimeZone.length > 255 ||
        (allDay !== "true" && allDay !== "false")) {
      return { ok: false, error: "Enter a calendar, title, and valid event details." };
    }
    if (allDay === "true"
      ? !isValidDateKey(start) || !isValidDateKey(end) || end <= start
      : !isUtcTimestamp(start) || !isUtcTimestamp(end) || Date.parse(end) <= Date.parse(start)) {
      return { ok: false, error: "The event end must be after its valid start." };
    }
    await saveCalendarEvent(await getGoogleCalendarClient(), calendarId, eventId, etag, title, start, end, allDay === "true", startTimeZone, endTimeZone);
    return { ok: true, message: eventId ? "Google Calendar event updated." : "Google Calendar event created." };
  },
  async sync_google_tasks(form) {
    const date = form.get("date");
    if (typeof date !== "string" || !isValidDateKey(date)) {
      return { ok: false, error: "That planner date is invalid." };
    }
    const count = await syncGoogleTasks(date);
    return { ok: true, message: `Google Tasks sync complete. ${count} records checked.` };
  },
  async search_gmail(form) {
    const value = form.get("query");
    if (typeof value !== "string") {
      return { ok: false, error: "Enter a Gmail search query (up to 256 characters)." };
    }
    const query = value.trim();
    if (!query || query.length > 256) {
      return { ok: false, error: "Enter a Gmail search query (up to 256 characters)." };
    }
    return { ok: true, emails: await searchGmail(query) };
  },
  async import_gmail(form) {
    const date = form.get("date");
    const messageId = form.get("messageId");
    if (typeof messageId !== "string" || !messageId || messageId.length > 512 ||
        typeof date !== "string" || !isValidDateKey(date)) {
      return { ok: false, error: "Choose an email and planner date first." };
    }
    const created = await importGmailMessage(messageId, date);
    return {
      ok: true,
      message: created ? "Email added as a task." : "That email is already in your planner.",
    };
  },
} satisfies Record<string, ActionHandler>;
