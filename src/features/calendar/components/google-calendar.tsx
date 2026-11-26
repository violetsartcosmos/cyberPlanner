import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useFetcher } from "react-router";
import type { CalendarEvent, GoogleCalendar } from "../../../../shared/planner/types";
import { addDays, dateKey, monthDates, parseDate } from "../../../../shared/planner/utils";
import { useActionNotifications, useNotification } from "@/components/notifications";
import type { CalendarReadResult, GoogleActionResult } from "../services/google-actions";

function midnight(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Loads only the visible calendar range using a cancellable resource loader.
 * @param enabled - Whether Google calendar reads are enabled on this page.
 * @param date - The selected date defining the visible range.
 * @returns Calendar data, load feedback and a refresh callback.
 */
export function useGoogleCalendar(enabled: boolean, date: Date) {
  const first = addDays(monthDates(date)[0], -1);
  const start = midnight(first).toISOString();
  const end = midnight(addDays(first, 44)).toISOString();
  const range = `?${new URLSearchParams({ start, end })}`;
  const [revision, setRevision] = useState(0);
  const fetcher = useFetcher<CalendarReadResult>();
  const { load } = fetcher;

  useEffect(function loadCalendar() {
    if (!enabled) return;
    void load(`/calendar/events${range}`);
  }, [enabled, range, revision, load]);

  return {
    data: enabled && fetcher.state === "idle" && fetcher.data?.range === range ? fetcher.data.data ?? null : null,
    error: enabled && fetcher.data?.range === range ? fetcher.data.error ?? "" : "",
    loading: enabled && (fetcher.state !== "idle" || fetcher.data?.range !== range),
    refresh: () => setRevision((value) => value + 1),
  };
}

export function eventOccursOnDate(event: CalendarEvent, day: Date) {
  if (event.allDay) {
    const key = dateKey(day);
    return event.start <= key && event.end > key;
  }
  const start = midnight(day).getTime();
  const end = midnight(addDays(day, 1)).getTime();
  return Date.parse(event.start) < end && Date.parse(event.end) > start;
}

export function eventHour(event: CalendarEvent, day: Date) {
  const start = new Date(event.start);
  return start.getTime() < midnight(day).getTime() ? 0 : start.getHours();
}

export function eventTime(event: CalendarEvent) {
  if (event.allDay) return "All day";
  const options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const start = new Date(event.start);
  const end = new Date(event.end);
  const endLabel = dateKey(start) === dateKey(end)
    ? end.toLocaleTimeString("en-US", options)
    : end.toLocaleString("en-US", { month: "short", day: "numeric", ...options });
  return `${start.toLocaleTimeString("en-US", options)} – ${endLabel}`;
}

function localDateTime(value: string) {
  const date = new Date(value);
  return `${dateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

function normalizedLocalTime(value: string) {
  if (value.length === 16) return `${value}:00.000`;
  if (value.length === 19) return `${value}.000`;
  return value.padEnd(23, "0");
}

/** Event identity, visible calendars and editor navigation callbacks. */
type EventEditorProps = {
  selected: string;
  calendars: GoogleCalendar[];
  event: CalendarEvent | null;
  onCancel: () => void;
  onSaved: (message: string) => void;
};

/**
 * Edits Google events while preserving local-time conversion and occurrence metadata.
 * @param props - The selected date, writable calendars, event and close callbacks.
 * @returns The event form with method-based resource submission.
 */
export function EventEditor({ selected, calendars, event, onCancel, onSaved }: EventEditorProps) {
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const fetcher = useFetcher<GoogleActionResult>();
  const busy = fetcher.state !== "idle";
  const pending = useRef(false);
  useActionNotifications(fetcher);
  const notify = useNotification();
  const writable = calendars.filter((calendar) => calendar.writable);
  const [calendarId, setCalendarId] = useState(event?.calendarId ?? writable[0]?.id ?? "");
  const action = event
    ? `/calendar/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}`
    : `/calendar/${encodeURIComponent(calendarId)}/events`;
  const start = event ? (event.allDay ? event.start : localDateTime(event.start)) : `${selected}T09:00`;
  const end = event ? (event.allDay ? dateKey(addDays(parseDate(event.end), -1)) : localDateTime(event.end)) : `${selected}T10:00`;
  const [timedStart, setTimedStart] = useState(start.length === 10 ? `${start}T09:00` : start);
  const [timedEnd, setTimedEnd] = useState(end.length === 10 ? `${end}T10:00` : end);
  const [dayStart, setDayStart] = useState(start.slice(0, 10));
  const [dayEnd, setDayEnd] = useState(end.slice(0, 10));

  function changeAllDay(checked: boolean) {
    if (checked) {
      setDayStart(timedStart.slice(0, 10));
      setDayEnd(timedEnd.slice(0, 10));
    } else {
      setTimedStart(`${dayStart}${timedStart.slice(10)}`);
      setTimedEnd(`${dayEnd}${timedEnd.slice(10)}`);
    }
    setAllDay(checked);
  }

  useEffect(function finishEventWrite() {
    if (fetcher.state !== "idle" || !fetcher.data || !pending.current) return;
    pending.current = false;
    if (fetcher.data.status >= 200 && fetcher.data.status < 300) onSaved(fetcher.data.message as string);
  }, [fetcher.state, fetcher.data, onSaved]);

  /**
   * Normalizes the user's local times before submitting a calendar resource form.
   * @param eventForm - The form event containing start and end values.
   * @returns Nothing; validation errors notify without submitting.
   */
  function submit(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    const form = new FormData(eventForm.currentTarget);
    const startValue = form.get("start");
    const endValue = form.get("end");
    if (typeof startValue !== "string" || typeof endValue !== "string" || !startValue || !endValue) {
      notify("Enter a start and end.");
      return;
    }
    if (allDay) {
      form.set("end", dateKey(addDays(parseDate(endValue), 1)));
    } else {
      const from = new Date(startValue);
      const to = new Date(endValue);
      if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) ||
          localDateTime(from.toISOString()) !== normalizedLocalTime(startValue) ||
          localDateTime(to.toISOString()) !== normalizedLocalTime(endValue)) {
        notify("Enter valid local times.");
        return;
      }
      const unchangedStart = event && !event.allDay && normalizedLocalTime(startValue) === localDateTime(event.start);
      const unchangedEnd = event && !event.allDay && normalizedLocalTime(endValue) === localDateTime(event.end);
      form.set("start", unchangedStart ? new Date(event.start).toISOString() : from.toISOString());
      form.set("end", unchangedEnd ? new Date(event.end).toISOString() : to.toISOString());
    }
    form.set("allDay", String(allDay));
    form.set("etag", event?.etag ?? "");
    form.set("startTimeZone", !allDay && event && !event.allDay ? event.startTimeZone ?? "" : "");
    form.set("endTimeZone", !allDay && event && !event.allDay ? event.endTimeZone ?? "" : "");
    pending.current = true;
    fetcher.submit(form, { method: event ? "patch" : "post", action });
  }

  return (
    <fetcher.Form method={event ? "patch" : "post"} action={action} className="calendar-event-form" onSubmit={submit}>
      <h3>{event ? "Edit event" : "New event"}</h3>
      {event?.recurring && <p>Changes apply only to this occurrence.</p>}
      <label>Calendar
        {event ? (
          <span>{event.calendarName}</span>
        ) : (
          <select className="form-select" required value={calendarId} onChange={(change) => setCalendarId(change.target.value)}>
            {writable.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
          </select>
        )}
      </label>
      <label>Title<input className="form-control" name="title" defaultValue={event?.title ?? ""} required /></label>
      <label className="calendar-all-day">
        <input className="form-check-input" type="checkbox" checked={allDay} onChange={(change) => changeAllDay(change.target.checked)} />
        All day
      </label>
      <label>Start
        <input className="form-control" name="start" type={allDay ? "date" : "datetime-local"} step={allDay ? undefined : "0.001"} value={allDay ? dayStart : timedStart} onChange={(change) => allDay ? setDayStart(change.target.value) : setTimedStart(change.target.value)} required />
      </label>
      <label>{allDay ? "Last day" : "End"}
        <input className="form-control" name="end" type={allDay ? "date" : "datetime-local"} step={allDay ? undefined : "0.001"} value={allDay ? dayEnd : timedEnd} onChange={(change) => allDay ? setDayEnd(change.target.value) : setTimedEnd(change.target.value)} required />
      </label>
      <div className="calendar-event-actions">
        <button className="btn btn-outline-primary btn-sm rounded-pill" type="submit" disabled={busy}>{busy ? "SAVING..." : "SAVE EVENT"}</button>
        <button className="btn btn-outline-primary btn-sm rounded-pill" type="button" disabled={busy} onClick={onCancel}>CANCEL</button>
      </div>
    </fetcher.Form>
  );
}
