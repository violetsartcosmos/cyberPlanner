import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  addDays,
  dateKey,
  dayProgress,
  monthDates,
  weekdays,
  weekDates,
} from "../../../shared/planner/utils";

type MissionCalendarProps = {
  date: Date;
  selected: string;
  today: string;
  checks: Record<string, string[]>;
  onSelect: (date: string) => void;
  onToday: () => void;
};

export function MissionCalendar({
  date,
  selected,
  today,
  checks,
  onSelect,
  onToday,
}: MissionCalendarProps) {
  const [view, setView] = useState<"week" | "month">("month");

  useEffect(() => {
    if (window.matchMedia("(max-width: 700px)").matches) setView("week");
  }, []);

  const days = view === "week" ? weekDates(date) : monthDates(date);
  const start = days[0];
  const end = days[6];
  const formatShort = (day: Date) =>
    day.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const range =
    view === "week"
      ? `${formatShort(start)}${start.getFullYear() !== end.getFullYear() ? `, ${start.getFullYear()}` : ""} – ${formatShort(end)}, ${end.getFullYear()}`
      : date.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function navigate(amount: number) {
    const next =
      view === "week"
        ? addDays(date, amount * 7)
        : new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
    onSelect(dateKey(next));
  }

  return (
    <section className="panel calendar-panel">
      <div className="section-label">
        <span>01 / NAVIGATION</span>
        <Sparkles aria-hidden="true" size={12} />
      </div>
      <div className="calendar-title">
        <div>
          <p className="eyebrow">YOUR TIMELINE</p>
          <h2>Mission calendar</h2>
        </div>
        <CalendarDays className="calendar-symbol" aria-hidden="true" />
      </div>
      <div className="calendar-views" role="group" aria-label="Calendar view">
        <button
          type="button"
          aria-pressed={view === "week"}
          onClick={() => setView("week")}
        >
          Week
        </button>
        <button
          type="button"
          aria-pressed={view === "month"}
          onClick={() => setView("month")}
        >
          Month
        </button>
      </div>
      <div className="month-nav">
        <button
          className="icon-button"
          type="button"
          onClick={() => navigate(-1)}
          aria-label={`Previous ${view}`}
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </button>
        <strong aria-live="polite">{range}</strong>
        <button
          className="icon-button"
          type="button"
          onClick={() => navigate(1)}
          aria-label={`Next ${view}`}
        >
          <ChevronRight aria-hidden="true" size={16} />
        </button>
      </div>
      {view === "month" && (
        <div className="calendar-grid weekday-labels">
          {weekdays.map((day) => (
            <span key={day}>{day.slice(0, 1)}</span>
          ))}
        </div>
      )}
      <div className={`calendar-grid ${view === "week" ? "week-dates" : ""}`}>
        {days.map((day) => {
          const key = dateKey(day);
          const progress = dayProgress(day, checks[key] ?? []);
          const label = day.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          });
          return (
            <button
              key={key}
              type="button"
              className={`calendar-day ${view === "month" && day.getMonth() !== date.getMonth() ? "outside" : ""} ${key === selected ? "selected" : ""} ${key === today ? "is-today" : ""} ${progress.completed ? "has-progress" : ""}`}
              onClick={() => onSelect(key)}
              aria-label={`${label}, ${progress.completed} of ${progress.total} tasks complete`}
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
            </button>
          );
        })}
      </div>
      <button className="today-button" type="button" onClick={onToday}>
        <ArrowUpRight aria-hidden="true" size={12} /> BACK TO TODAY
      </button>
    </section>
  );
}
