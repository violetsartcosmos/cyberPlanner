import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  addDays,
  dateKey,
  dayProgress,
  formatShortDate,
  monthDates,
  weekdays,
  weekDates,
} from "../../../../shared/planner/utils";
import type { CalendarEvent } from "../../../../shared/planner/types";
import { EventEditor, eventHour, eventOccursOnDate, eventTime, useGoogleCalendar } from "./google-calendar";

type MissionCalendarProps = {
  date: Date;
  selected: string;
  today: string;
  checks: Record<string, string[]>;
  journalDates: string[];
  onSelect: (date: string) => void;
  onToday: () => void;
  onAddJournal: () => void;
  journalOpen: boolean;
  googleEnabled: boolean;
};

export function MissionCalendar({
  date,
  selected,
  today,
  checks,
  journalDates,
  onSelect,
  onToday,
  onAddJournal,
  journalOpen,
  googleEnabled,
}: MissionCalendarProps) {
  const [view, setView] = useState<"day" | "week" | "month">("month");
  const [editing, setEditing] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventMessage, setEventMessage] = useState("");
  const googleCalendar = useGoogleCalendar(googleEnabled, date);

  useEffect(function resetEventEditor() {
    setEditing(false);
    setEditingEvent(null);
    setEventMessage("");
  }, [selected]);

  useEffect(function syncCompactCalendarView() {
    if (window.matchMedia("(max-width: 700px)").matches) setView("week");
  }, []);

  const days = view === "day" ? [date] : view === "week" ? weekDates(date) : monthDates(date);
  const start = days[0];
  const end = days[6];
  const range =
    view === "day"
      ? date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : view === "week"
      ? `${formatShortDate(start)}${start.getFullYear() !== end.getFullYear() ? `, ${start.getFullYear()}` : ""} – ${formatShortDate(end)}, ${end.getFullYear()}`
      : date.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function showDay() {
    setView("day");
  }

  function showWeek() {
    setView("week");
  }

  function showMonth() {
    setView("month");
  }

  function navigatePrevious() {
    navigate(-1);
  }

  function navigateNext() {
    navigate(1);
  }

  function createDaySelectionHandler(key: string) {
    return function handleDaySelection() {
      onSelect(key);
    };
  }

  const weekdayLabels: ReactNode[] = [];
  for (const day of weekdays) {
    weekdayLabels.push(<span key={day}>{day.slice(0, 1)}</span>);
  }

  const calendarDays: ReactNode[] = [];
  for (const day of days) {
    const key = dateKey(day);
    const progress = dayProgress(day, checks[key] ?? []);
    const eventCount = googleCalendar.data?.events.filter((event) => eventOccursOnDate(event, day)).length ?? 0;
    const label = day.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    calendarDays.push(
      <button
        key={key}
        type="button"
        className={`calendar-day ${view === "month" && day.getMonth() !== date.getMonth() ? "outside" : ""} ${key === selected ? "selected" : ""} ${key === today ? "is-today" : ""} ${progress.completed ? "has-progress" : ""} ${journalDates.includes(key) ? "has-journal" : ""}`}
        onClick={createDaySelectionHandler(key)}
        aria-label={`${label}, ${progress.completed} of ${progress.total} tasks complete${journalDates.includes(key) ? ", journal entry" : ""}${eventCount ? `, ${eventCount} calendar ${eventCount === 1 ? "event" : "events"}` : ""}`}
        aria-pressed={key === selected}
      >
        {view !== "month" && (
          <span className="week-day-name">
            {weekdays[(day.getDay() + 6) % 7]}
          </span>
        )}
        <span>{day.getDate()}</span>
        {view !== "month" && (
          <span className="week-day-progress">
            {progress.completed}/{progress.total}
          </span>
        )}
        {eventCount > 0 && <span className="calendar-event-count">{eventCount} event{eventCount === 1 ? "" : "s"}</span>}
      </button>,
    );
  }

  const selectedEvents = (googleCalendar.data?.events ?? [])
    .filter((event) => eventOccursOnDate(event, date))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));

  function showEvent(event: CalendarEvent) {
    const content = <><strong>{event.title}</strong><span>{eventTime(event)} · {event.calendarName}</span></>;
    if (!event.editable) return <div className="calendar-event" key={`${event.calendarId}:${event.id}`}>{content}</div>;
    return (
      <button className="calendar-event" type="button" key={`${event.calendarId}:${event.id}`} onClick={() => {
        setEditingEvent(event);
        setEditing(true);
        setEventMessage("");
      }}>
        {content}<span>EDIT</span>
      </button>
    );
  }

  const hours: ReactNode[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const label = `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
    hours.push(
      <li className="day-hour" key={hour}>
        <span>{label}</span>
        <div className="day-hour-events">
          {selectedEvents.filter((event) => !event.allDay && eventHour(event, date) === hour).map(showEvent)}
        </div>
      </li>,
    );
  }
  function navigate(amount: number) {
    const next =
      view === "day"
        ? addDays(date, amount)
        : view === "week"
        ? addDays(date, amount * 7)
        : new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
    onSelect(dateKey(next));
  }

  return (
    <section className="panel calendar-panel">
      <Link className="calendar-title section-heading-link" to={`/calendar?date=${selected}`}>
        <div>
          <p className="eyebrow">YOUR TIMELINE</p>
          <h2>Mission calendar</h2>
        </div>
        <CalendarDays className="calendar-symbol" aria-hidden="true" />
      </Link>
      <div className="calendar-views" role="group" aria-label="Calendar view">
        <button
          type="button"
          aria-pressed={view === "day"}
          onClick={showDay}
        >
          Day
        </button>
        <button
          type="button"
          aria-pressed={view === "week"}
          onClick={showWeek}
        >
          Week
        </button>
        <button
          type="button"
          aria-pressed={view === "month"}
          onClick={showMonth}
        >
          Month
        </button>
      </div>
      <div className="month-nav">
        <button
          className="icon-button"
          type="button"
          onClick={navigatePrevious}
          aria-label={`Previous ${view}`}
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </button>
        <div className="month-heading">
          <strong aria-live="polite">{range}</strong>
          <button type="button" className="calendar-today" onClick={onToday}>Today</button>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={navigateNext}
          aria-label={`Next ${view}`}
        >
          <ChevronRight aria-hidden="true" size={16} />
        </button>
      </div>
      {view === "month" && (
        <div className="calendar-grid weekday-labels">
          {weekdayLabels}
        </div>
      )}
      {view === "day" ? (
        <>
          {selectedEvents.some((event) => event.allDay) && (
            <div className="calendar-all-day-events">
              <strong>ALL DAY</strong>
              {selectedEvents.filter((event) => event.allDay).map(showEvent)}
            </div>
          )}
          <div className="day-timeline" role="region" aria-label={`Hourly timeline for ${range}`} tabIndex={0}>
            <ol>{hours}</ol>
          </div>
        </>
      ) : (
        <>
          <div className={`calendar-grid ${view === "week" ? "week-dates" : ""}`}>
            {calendarDays}
          </div>
          <p className="calendar-legend"><span aria-hidden="true" /> JOURNAL ENTRY</p>
        </>
      )}
      {googleEnabled && (
        <div className="google-calendar-events">
          <div className="calendar-event-heading">
            <strong>GOOGLE CALENDAR</strong>
            <div>
              <button type="button" className="calendar-today" onClick={googleCalendar.refresh}>Refresh</button>
              <button type="button" className="calendar-today" disabled={!googleCalendar.data?.calendars.some((calendar) => calendar.writable)} onClick={() => {
                setEditingEvent(null);
                setEditing(true);
                setEventMessage("");
              }}>Add event</button>
            </div>
          </div>
          {googleCalendar.loading && <p className="inline-status" role="status">Loading Google Calendar...</p>}
          {googleCalendar.error && <p className="inline-error" role="alert">{googleCalendar.error} <a href="/auth/google">Reconnect Google</a></p>}
          {googleCalendar.data && googleCalendar.data.unavailableCalendars.length > 0 && (
            <p className="inline-status">Event details unavailable for free/busy-only calendars: {googleCalendar.data.unavailableCalendars.join(", ")}.</p>
          )}
          {googleCalendar.data && !googleCalendar.data.calendars.some((calendar) => calendar.writable) && (
            <p className="inline-status">No writable Google calendars are available for creating events.</p>
          )}
          {googleCalendar.data && view !== "day" && (
            <div className="calendar-selected-events">
              <p>{selectedEvents.length ? `Events for ${formatShortDate(date)}` : `No events for ${formatShortDate(date)}.`}</p>
              {selectedEvents.map(showEvent)}
            </div>
          )}
          {eventMessage && <p className="inline-status" role="status">{eventMessage}</p>}
          {editing && googleCalendar.data && (
            <EventEditor
              key={editingEvent ? `${editingEvent.calendarId}:${editingEvent.id}` : `new:${selected}`}
              selected={selected}
              calendars={googleCalendar.data.calendars}
              event={editingEvent}
              onCancel={() => setEditing(false)}
              onSaved={(message) => {
                setEditing(false);
                setEventMessage(message);
                googleCalendar.refresh();
              }}
            />
          )}
        </div>
      )}
      <button className="today-button" type="button" onClick={onAddJournal} aria-expanded={journalOpen} aria-controls={journalOpen ? "journal" : undefined}>
        ADD JOURNAL
      </button>
    </section>
  );
}
