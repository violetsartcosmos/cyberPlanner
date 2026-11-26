import { isValidDateKey } from "../../shared/planner/utils";
import type { ActionHandler } from "../planner/dispatch";
import { importGmailMessage, searchGmail, syncGoogleTasks } from "./service";
import { getGoogleCalendarClient } from "./service";
import { calendarWriteError, saveCalendarEvent } from "./calendar";

export const googleFormActions = {
  /**
   * Adapts the legacy event form to the shared calendar validation and write operation.
   * @param form - The calendar identity, timing and conditional-update fields.
   * @returns Legacy notification feedback for creation or an occurrence update.
   */
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
    const input = {
      title: title as string, start: start as string, end: end as string,
      etag: etag as string, allDay: allDay === "true",
      startTimeZone: startTimeZone as string, endTimeZone: endTimeZone as string,
    };
    const error = calendarWriteError(eventId as string, input);
    if (error) return { ok: false, error };
    await saveCalendarEvent(await getGoogleCalendarClient(), calendarId as string, eventId as string,
      input.etag, input.title, input.start, input.end, input.allDay, input.startTimeZone, input.endTimeZone);
    return { ok: true, message: eventId ? "Google Calendar event updated." : "Google Calendar event created." };
  },
  async sync_google_tasks(form) {
    const date = form.get("date") as string;
    if (!isValidDateKey(date)) {
      return { ok: false, error: "That planner date is invalid." };
    }
    const count = await syncGoogleTasks(date);
    return { ok: true, message: `Google Tasks sync complete. ${count} records checked.` };
  },
  async search_gmail(form) {
    const value = form.get("query");
    const query = (value as string).trim();
    if (!query) {
      return { ok: false, error: "Enter a Gmail search query." };
    }
    return { ok: true, emails: await searchGmail(query) };
  },
  async import_gmail(form) {
    const date = form.get("date") as string;
    const messageId = form.get("messageId") as string;
    if (!messageId || !isValidDateKey(date)) {
      return { ok: false, error: "Choose an email and planner date first." };
    }
    const created = await importGmailMessage(messageId, date);
    return {
      ok: true,
      message: created ? "Email added as a task." : "That email is already in your planner.",
    };
  },
} satisfies Record<string, ActionHandler>;
