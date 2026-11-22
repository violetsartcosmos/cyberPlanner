import type { calendar_v3 } from "googleapis";
import type { CalendarData, CalendarEvent, GoogleCalendar } from "../../shared/planner/types";
import { getGoogleCalendarClient } from "./service";

export async function listCalendarData(
  calendar: calendar_v3.Calendar,
  timeMin: string,
  timeMax: string,
): Promise<CalendarData> {
  const calendars: GoogleCalendar[] = [];
  const unavailableCalendars: string[] = [];
  let pageToken: string | undefined;
  do {
    const response = await calendar.calendarList.list({ maxResults: 250, showHidden: true, pageToken });
    for (const item of response.data.items ?? []) {
      if (!item.id) continue;
      const name = item.summaryOverride || item.summary || item.id;
      if (item.accessRole !== "reader" && item.accessRole !== "writer" && item.accessRole !== "owner") {
        unavailableCalendars.push(name);
        continue;
      }
      calendars.push({
        id: item.id,
        name,
        writable: item.accessRole === "owner" || item.accessRole === "writer",
      });
    }
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  const events: CalendarEvent[] = [];
  for (const source of calendars) {
    let eventPageToken: string | undefined;
    do {
      const response = await calendar.events.list({
        calendarId: source.id,
        timeMin,
        timeMax,
        singleEvents: true,
        maxResults: 2500,
        pageToken: eventPageToken,
      });
      for (const event of response.data.items ?? []) {
        if (event.status === "cancelled") continue;
        const allDay = Boolean(event.start?.date);
        const start = allDay ? event.start?.date : event.start?.dateTime;
        const end = allDay ? event.end?.date : event.end?.dateTime;
        if (!event.id || !event.etag || !start || !end) {
          throw new Error(`Google returned an incomplete event in ${source.name}.`);
        }
        events.push({
          id: event.id,
          calendarId: source.id,
          calendarName: source.name,
          title: event.summary || "(Untitled event)",
          start,
          end,
          allDay,
          editable: source.writable && (!event.eventType || event.eventType === "default"),
          etag: event.etag,
          recurring: Boolean(event.recurringEventId),
          startTimeZone: event.start?.timeZone ?? null,
          endTimeZone: event.end?.timeZone ?? null,
        });
      }
      eventPageToken = response.data.nextPageToken ?? undefined;
    } while (eventPageToken);
  }
  return { calendars, events, unavailableCalendars };
}

export async function saveCalendarEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
  etag: string,
  title: string,
  start: string,
  end: string,
  allDay: boolean,
  startTimeZone: string,
  endTimeZone: string,
) {
  const requestBody = {
    summary: title.trim(),
    start: allDay ? { date: start } : { dateTime: start, ...(startTimeZone && { timeZone: startTimeZone }) },
    end: allDay ? { date: end } : { dateTime: end, ...(endTimeZone && { timeZone: endTimeZone }) },
  };
  try {
    if (eventId) {
      await calendar.events.patch(
        { calendarId, eventId, requestBody },
        { headers: { "If-Match": etag } },
      );
    } else {
      await calendar.events.insert({ calendarId, requestBody });
    }
  } catch (error) {
    if (error instanceof Error && "response" in error &&
        typeof error.response === "object" && error.response !== null &&
        "status" in error.response && error.response.status === 412) {
      throw new Error("This event changed in Google Calendar. Refresh and try again.");
    }
    throw error;
  }
}

export async function getCalendarData(timeMin: string, timeMax: string) {
  return listCalendarData(await getGoogleCalendarClient(), timeMin, timeMax);
}

export function validCalendarRange(start: string, end: string) {
  const zoned = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const from = Date.parse(start);
  const to = Date.parse(end);
  return zoned.test(start) && zoned.test(end) && Number.isFinite(from) &&
    Number.isFinite(to) && new Date(from).toISOString() === start && new Date(to).toISOString() === end &&
    to > from && to - from <= 45 * 24 * 60 * 60 * 1000;
}
