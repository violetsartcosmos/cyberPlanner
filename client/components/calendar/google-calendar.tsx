import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { CalendarData, CalendarEvent, GoogleCalendar, PlannerActionResult } from "../../../shared/planner/types";
import { addDays, dateKey, monthDates, parseDate } from "../../../shared/planner/utils";

type CalendarState = {
  key: string;
  data: CalendarData | null;
  error: string;
};

function midnight(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function useGoogleCalendar(enabled: boolean, date: Date) {
  const first = addDays(monthDates(date)[0], -1);
  const start = midnight(first).toISOString();
  const end = midnight(addDays(first, 44)).toISOString();
  const key = `${start}/${end}`;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<CalendarState>({ key: "", data: null, error: "" });

  useEffect(function loadCalendar() {
    if (!enabled) return;
    const controller = new AbortController();
    setState({ key, data: null, error: "" });
    async function load() {
      try {
        const query = new URLSearchParams({ start, end });
        const response = await fetch(`/api/calendar?${query}`, { signal: controller.signal });
        const result = await response.json() as CalendarData | { error: string };
        if (!response.ok || "error" in result) {
          throw new Error("error" in result ? result.error : `Calendar request failed (${response.status}).`);
        }
        setState({ key, data: result, error: "" });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ key, data: null, error: error instanceof Error ? error.message : "Could not load Google Calendar." });
      }
    }
    void load();
    return () => controller.abort();
  }, [enabled, start, end, key, revision]);

  return {
    data: enabled && state.key === key ? state.data : null,
    error: enabled && state.key === key ? state.error : "",
    loading: enabled && (state.key !== key || (!state.data && !state.error)),
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

type EventEditorProps = {
  selected: string;
  calendars: GoogleCalendar[];
  event: CalendarEvent | null;
  onCancel: () => void;
  onSaved: (message: string) => void;
};

export function EventEditor({ selected, calendars, event, onCancel, onSaved }: EventEditorProps) {
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const writable = calendars.filter((calendar) => calendar.writable);
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

  async function submit(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    const form = new FormData(eventForm.currentTarget);
    const startValue = form.get("start");
    const endValue = form.get("end");
    if (typeof startValue !== "string" || typeof endValue !== "string" || !startValue || !endValue) {
      setError("Enter a start and end.");
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
        setError("Enter valid local times.");
        return;
      }
      const unchangedStart = event && !event.allDay && normalizedLocalTime(startValue) === localDateTime(event.start);
      const unchangedEnd = event && !event.allDay && normalizedLocalTime(endValue) === localDateTime(event.end);
      form.set("start", unchangedStart ? new Date(event.start).toISOString() : from.toISOString());
      form.set("end", unchangedEnd ? new Date(event.end).toISOString() : to.toISOString());
    }
    form.set("allDay", String(allDay));
    form.set("intent", "save_calendar_event");
    form.set("eventId", event?.id ?? "");
    form.set("etag", event?.etag ?? "");
    form.set("startTimeZone", !allDay && event && !event.allDay ? event.startTimeZone ?? "" : "");
    form.set("endTimeZone", !allDay && event && !event.allDay ? event.endTimeZone ?? "" : "");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/planner", { method: "POST", body: form });
      if (!response.ok) throw new Error(`Could not save event (${response.status}).`);
      const result = await response.json() as PlannerActionResult;
      if (!result.ok) throw new Error(result.error || "Could not save event.");
      onSaved(result.message || "Event saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save event.");
      setBusy(false);
    }
  }

  return (
    <form className="calendar-event-form" onSubmit={submit}>
      <h3>{event ? "Edit event" : "New event"}</h3>
      {event?.recurring && <p>Changes apply only to this occurrence.</p>}
      <label>Calendar
        {event ? (
          <><span>{event.calendarName}</span><input type="hidden" name="calendarId" value={event.calendarId} /></>
        ) : (
          <select name="calendarId" required defaultValue={writable[0]?.id ?? ""}>
            {writable.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
          </select>
        )}
      </label>
      <label>Title<input name="title" defaultValue={event?.title ?? ""} maxLength={1024} required /></label>
      <label className="calendar-all-day">
        <input type="checkbox" checked={allDay} onChange={(change) => changeAllDay(change.target.checked)} />
        All day
      </label>
      <label>Start
        <input name="start" type={allDay ? "date" : "datetime-local"} step={allDay ? undefined : "0.001"} value={allDay ? dayStart : timedStart} onChange={(change) => allDay ? setDayStart(change.target.value) : setTimedStart(change.target.value)} required />
      </label>
      <label>{allDay ? "Last day" : "End"}
        <input name="end" type={allDay ? "date" : "datetime-local"} step={allDay ? undefined : "0.001"} value={allDay ? dayEnd : timedEnd} onChange={(change) => allDay ? setDayEnd(change.target.value) : setTimedEnd(change.target.value)} required />
      </label>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="calendar-event-actions">
        <button className="google-action" type="submit" disabled={busy}>{busy ? "SAVING..." : "SAVE EVENT"}</button>
        <button className="google-action" type="button" disabled={busy} onClick={onCancel}>CANCEL</button>
      </div>
    </form>
  );
}
