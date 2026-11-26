import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { dateKey, isValidDateKey } from "../../../../shared/planner/utils";

/** Journal write feedback; successful writes do not require response bodies. */
export type JournalActionResult = { status: number; message?: string; error?: string };

/** Resource reads used by the page-owned journal browser loader. */
export type JournalReadResult = {
  status: number;
  error?: string;
  dates?: string[];
  entry?: { date: string; content: string; exists: boolean };
};

/** Non-empty journal dates displayed as calendar markers. */
export type JournalMarkerResult = {
  status: number;
  error?: string;
  journalDates?: string[];
};

/**
 * Loads the saved dates and journal entry for the selected query date.
 * @param args - The dated journal request and its cancellation signal.
 * @returns Journal browser data or the API's HTTP error.
 */
export async function journalLoader({ request }: LoaderFunctionArgs): Promise<JournalReadResult> {
  const requestedDate = new URL(request.url).searchParams.get("date");
  const selected = requestedDate && isValidDateKey(requestedDate) ? requestedDate : dateKey(new Date());
  const [listResponse, entryResponse] = await Promise.all([
    fetch("/api/journals", { signal: request.signal }),
    fetch(`/api/journals/${encodeURIComponent(selected)}`, { signal: request.signal }),
  ]);
  if (!listResponse.ok) return { status: listResponse.status, error: (await listResponse.json() as { error: string }).error };
  if (!entryResponse.ok && entryResponse.status !== 404) {
    return { status: entryResponse.status, error: (await entryResponse.json() as { error: string }).error };
  }
  const dates = await listResponse.json() as { date: string }[];
  const entry = entryResponse.status === 404 ? null : await entryResponse.json() as { content: string };
  return {
    status: 200,
    dates: dates.map((item) => item.date),
    entry: { date: selected, content: entry?.content ?? "", exists: entry !== null },
  };
}

/**
 * Loads the non-empty dates used to mark journal activity on calendars.
 * @param args - The cancellable calendar/dashboard loader request.
 * @returns Non-empty journal dates or the API's HTTP error.
 */
export async function journalMarkersLoader({ request }: LoaderFunctionArgs): Promise<JournalMarkerResult> {
  const response = await fetch("/api/journals/markers", { signal: request.signal });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  const journals = await response.json() as { date: string }[];
  return { status: response.status, journalDates: journals.map((journal) => journal.date) };
}

/**
 * Creates a journal from its date and content form fields.
 * @param args - The POST request to the journal collection.
 * @returns The HTTP status and notification or API error.
 */
export async function createJournalAction({ request }: ActionFunctionArgs): Promise<JournalActionResult> {
  const form = await request.formData();
  const response = await fetch("/api/journals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: form.get("date"), content: form.get("content") }),
    signal: request.signal,
  });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  return { status: response.status, message: "Journal created." };
}

/**
 * Saves or deletes the journal identified by its date.
 * @param args - The dated resource URL and PUT content or DELETE request.
 * @returns The HTTP status and operation notification or API error.
 */
export async function journalResourceAction({ request, params }: ActionFunctionArgs): Promise<JournalActionResult> {
  switch (request.method) {
    case "PUT": {
      const form = await request.formData();
      const response = await fetch(`/api/journals/${encodeURIComponent(params.date as string)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: form.get("content") }),
        signal: request.signal,
      });
      if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
      return { status: response.status, message: "Journal saved." };
    }
    case "DELETE": {
      const response = await fetch(`/api/journals/${encodeURIComponent(params.date as string)}`, {
        method: "DELETE",
        signal: request.signal,
      });
      if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
      return { status: response.status, message: "Journal deleted." };
    }
    default:
      return { status: 405, error: "Method not allowed." };
  }
}
