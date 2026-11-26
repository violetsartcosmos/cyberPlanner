import { Hono } from "hono";
import { noStore, reportServerError, requireSignIn } from "../http";
import { calendarWriteError, getCalendarData, saveCalendarEvent, validCalendarRange, type CalendarEventInput } from "./calendar";
import { getGoogleCalendarClient, importGmailMessage, searchGmail, syncGoogleTasks } from "./service";
import { isValidDateKey } from "../../shared/planner/utils";

export const googleRoutes = new Hono();

googleRoutes.get("/calendar", noStore, requireSignIn, async (context) => {
  const start = context.req.query("start");
  const end = context.req.query("end");
  if (!start || !end || !validCalendarRange(start, end)) {
    return context.json({ error: "Invalid calendar date range." }, 400);
  }
  try {
    return context.json(await getCalendarData(start, end));
  } catch (error) {
    console.error("Google Calendar load failed.", error);
    return context.json({ error: "Could not load Google Calendar. Check that the Calendar API is enabled and reconnect Google to grant calendar access." }, 502);
  }
});

/**
 * POST creates an event in the specified Google calendar.
 * Input: calendar ID parameter and validated JSON event fields.
 * Output: status 201 with a creation notification, or an HTTP error.
 */
googleRoutes.post("/calendar/:calendarId/events", noStore, requireSignIn, async (context) => {
  const calendarId = context.req.param("calendarId");
  const input = await context.req.json<CalendarEventInput>();
  const error = calendarWriteError("", input);
  if (error) return context.json({ error }, 400);
  try {
    await saveCalendarEvent(await getGoogleCalendarClient(), calendarId, "", input.etag,
      input.title, input.start, input.end, input.allDay, input.startTimeZone, input.endTimeZone);
    return context.json({ message: "Google Calendar event created." }, 201);
  } catch (error) {
    return reportServerError(context, error, "Could not create Google Calendar event.");
  }
});

/**
 * PATCH updates one event occurrence with its existing Google etag.
 * Input: calendar and event ID parameters and JSON event fields.
 * Output: an update notification, or an HTTP error including conflicts.
 */
googleRoutes.patch("/calendar/:calendarId/events/:id", noStore, requireSignIn, async (context) => {
  const { calendarId, id } = context.req.param();
  const input = await context.req.json<CalendarEventInput>();
  const error = calendarWriteError(id, input);
  if (error) return context.json({ error }, 400);
  try {
    await saveCalendarEvent(await getGoogleCalendarClient(), calendarId, id, input.etag,
      input.title, input.start, input.end, input.allDay, input.startTimeZone, input.endTimeZone);
    return context.json({ message: "Google Calendar event updated." });
  } catch (error) {
    if (error instanceof Error && error.message === "This event changed in Google Calendar. Refresh and try again.") {
      return context.json({ error: error.message }, 409);
    }
    return reportServerError(context, error, "Could not update Google Calendar event.");
  }
});

/**
 * POST synchronizes Google tasks for a selected planner date.
 * Input: date parameter in YYYY-MM-DD format.
 * Output: the checked-record count and synchronization notification.
 */
googleRoutes.post("/google/tasks/sync/:date", noStore, requireSignIn, async (context) => {
  const date = context.req.param("date");
  if (!isValidDateKey(date)) return context.json({ error: "That planner date is invalid." }, 400);
  try {
    const count = await syncGoogleTasks(date);
    return context.json({ count, message: `Google Tasks sync complete. ${count} records checked.` });
  } catch (error) {
    return reportServerError(context, error, "Could not synchronize Google Tasks.");
  }
});

/**
 * GET searches Gmail without storing message bodies.
 * Input: the query search parameter.
 * Output: message summaries for individual task imports.
 */
googleRoutes.get("/google/gmail/messages", noStore, requireSignIn, async (context) => {
  const query = context.req.query("query")?.trim();
  if (!query) return context.json({ error: "Enter a Gmail search query." }, 400);
  try {
    return context.json({ emails: await searchGmail(query) });
  } catch (error) {
    return reportServerError(context, error, "Could not search Gmail.");
  }
});

/**
 * POST imports a chosen email as a task for a planner date.
 * Input: message ID and date parameters.
 * Output: status 201 when created, or 200 when already imported.
 */
googleRoutes.post("/google/gmail/messages/:id/tasks/:date", noStore, requireSignIn, async (context) => {
  const { id, date } = context.req.param();
  if (!isValidDateKey(date)) return context.json({ error: "Choose a valid planner date first." }, 400);
  try {
    const created = await importGmailMessage(id, date);
    return context.json({ message: created ? "Email added as a task." : "That email is already in your planner." }, created ? 201 : 200);
  } catch (error) {
    return reportServerError(context, error, "Could not import Gmail task.");
  }
});
