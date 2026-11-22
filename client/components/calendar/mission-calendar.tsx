import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  addDays,
  dateKey,
  dayProgress,
  formatShortDate,
  monthDates,
  weekdays,
  weekDates,
} from "../../../shared/planner/utils";

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
}: MissionCalendarProps) {
  const [view, setView] = useState<"week" | "month">("month");

  useEffect(function syncCompactCalendarView() {
    if (window.matchMedia("(max-width: 700px)").matches) setView("week");
  }, []);

  const days = view === "week" ? weekDates(date) : monthDates(date);
  const start = days[0];
  const end = days[6];
  const range =
    view === "week"
      ? `${formatShortDate(start)}${start.getFullYear() !== end.getFullYear() ? `, ${start.getFullYear()}` : ""} – ${formatShortDate(end)}, ${end.getFullYear()}`
      : date.toLocaleDateString("en-US", { month: "long", year: "numeric" });

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
        aria-label={`${label}, ${progress.completed} of ${progress.total} tasks complete${journalDates.includes(key) ? ", journal entry" : ""}`}
        aria-pressed={key === selected}
      >
        {view === "week" && (
          <span className="week-day-name">
            {weekdays[(day.getDay() + 6) % 7]}
          </span>
        )}
        <span>{day.getDate()}</span>
        {view === "week" && (
          <span className="week-day-progress">
            {progress.completed}/{progress.total}
          </span>
        )}
      </button>,
    );
  }

  function navigate(amount: number) {
    const next =
      view === "week"
        ? addDays(date, amount * 7)
        : new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
    onSelect(dateKey(next));
  }

  return (
    <section className="panel calendar-panel">
      <Link className="section-label section-link" to={`/calendar?date=${selected}`}>
        <span>01 / CALENDAR</span>
        <Sparkles aria-hidden="true" size={12} />
      </Link>
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
      <div className={`calendar-grid ${view === "week" ? "week-dates" : ""}`}>
      </div>
      <p className="calendar-legend"><span aria-hidden="true" /> JOURNAL ENTRY</p>
      <button className="today-button" type="button" onClick={onAddJournal} aria-expanded={journalOpen} aria-controls={journalOpen ? "journal" : undefined}>
        ADD JOURNAL
      </button>
    </section>
  );
}
