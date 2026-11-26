import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import type { CalendarData } from "../../../../shared/planner/types";

/** HTTP feedback from Google operations, including Gmail search summaries. */
export type GoogleActionResult = {
  status: number;
  message?: string;
  error?: string;
  emails?: { id: string; subject: string; from: string; snippet: string }[];
};

/** Calendar range read feedback. */
export type CalendarReadResult = { status: number; error?: string; data?: CalendarData; range?: string };

/**
 * Synchronizes Google tasks through their dedicated resource endpoint.
 * @param args - The POST request and selected date parameter.
 * @returns The HTTP status and synchronization notification or API error.
 */
export async function syncGoogleTasksAction({ request, params }: ActionFunctionArgs): Promise<GoogleActionResult> {
  const response = await fetch(`/api/google/tasks/sync/${encodeURIComponent(params.date as string)}`, {
    method: "POST", signal: request.signal,
  });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  const { message } = await response.json() as { message: string };
  return { status: response.status, message };
}

/**
 * Searches Gmail using a GET form and the user's search query.
 * @param args - The loader request containing the query search parameter.
 * @returns The HTTP status and email summaries or API error.
 */
export async function gmailMessagesLoader({ request }: LoaderFunctionArgs): Promise<GoogleActionResult> {
  const query = new URL(request.url).searchParams.get("query") ?? "";
  const response = await fetch(`/api/google/gmail/messages?${new URLSearchParams({ query })}`, { signal: request.signal });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  const { emails } = await response.json() as Pick<GoogleActionResult, "emails">;
  return { status: response.status, emails };
}

/**
 * Imports one email as a task on the selected date.
 * @param args - The POST request and message ID and date parameters.
 * @returns The HTTP status and import notification or API error.
 */
export async function importGmailAction({ request, params }: ActionFunctionArgs): Promise<GoogleActionResult> {
  const response = await fetch(`/api/google/gmail/messages/${encodeURIComponent(params.id as string)}/tasks/${encodeURIComponent(params.date as string)}`, {
    method: "POST", signal: request.signal,
  });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  const { message } = await response.json() as { message: string };
  return { status: response.status, message };
}

/**
 * Loads calendar events for the visible date range.
 * @param args - The loader request containing start and end search parameters.
 * @returns The HTTP status and calendar data or API error.
 */
export async function calendarLoader({ request }: LoaderFunctionArgs): Promise<CalendarReadResult> {
  const range = new URL(request.url).search;
  const response = await fetch(`/api/calendar${range}`, { signal: request.signal });
  if (!response.ok) return { status: response.status, range, error: (await response.json() as { error: string }).error };
  return { status: response.status, range, data: await response.json() as CalendarData };
}

/**
 * Creates an event from normalized UTC or all-day form fields.
 * @param args - The calendar ID parameter and POST event form.
 * @returns The HTTP status and creation notification or API error.
 */
export async function createCalendarEventAction({ request, params }: ActionFunctionArgs): Promise<GoogleActionResult> {
  const form = await request.formData();
  const allDay = form.get("allDay");
  const response = await fetch(`/api/calendar/${encodeURIComponent(params.calendarId as string)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: form.get("title"), start: form.get("start"), end: form.get("end"),
      allDay: allDay === "true", etag: "",
      startTimeZone: form.get("startTimeZone"), endTimeZone: form.get("endTimeZone"),
    }),
    signal: request.signal,
  });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  const { message } = await response.json() as { message: string };
  return { status: response.status, message };
}

/**
 * Updates one occurrence while preserving Google conditional-update metadata.
 * @param args - The calendar and event ID parameters and PATCH event form.
 * @returns The HTTP status and update notification or API error.
 */
export async function updateCalendarEventAction({ request, params }: ActionFunctionArgs): Promise<GoogleActionResult> {
  const form = await request.formData();
  const allDay = form.get("allDay");
  const response = await fetch(`/api/calendar/${encodeURIComponent(params.calendarId as string)}/events/${encodeURIComponent(params.id as string)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: form.get("title"), start: form.get("start"), end: form.get("end"),
      allDay: allDay === "true", etag: form.get("etag"),
      startTimeZone: form.get("startTimeZone"), endTimeZone: form.get("endTimeZone"),
    }),
    signal: request.signal,
  });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  const { message } = await response.json() as { message: string };
  return { status: response.status, message };
}
