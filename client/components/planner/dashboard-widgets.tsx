import { ArrowUpRight, ChevronRight, Heart, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { dailyQuests } from "../../../shared/planner/definitions";
import { weekdays } from "../../../shared/planner/utils";

type WeeklyProtocolPanelProps = {
  selected: string;
  weekday: number;
};

export function WeeklyProtocolPanel({ selected, weekday }: WeeklyProtocolPanelProps) {
  return (
    <section className="panel week-panel">
      <Link className="section-label section-link" to={`/weekly?date=${selected}`}>
        <span>02 / WEEKLY PROTOCOL</span>
        <Sparkles aria-hidden="true" size={12} />
      </Link>
      <h2>Every day has a mission.</h2>
      <p>Small steps, one day at a time.</p>
      <div className="week-list">
        {dailyQuests.map((day, index) => (
          <div
            key={day.title}
            className={index === weekday ? "active-weekday" : ""}
          >
            <span>{weekdays[index].toUpperCase()}</span>
            <strong>{day.title}</strong>
            <b>
              {index === weekday ? (
                <ChevronRight aria-hidden="true" size={12} />
              ) : null}
            </b>
          </div>
        ))}
      </div>
    </section>
  );
}

type ReminderPanelProps = {
  selected: string;
};

export function ReminderPanel({ selected }: ReminderPanelProps) {
  return (
    <section className="panel motivation-panel">
      <Link className="section-label section-link" to={`/reminder?date=${selected}`}>
        <span>03 / A LITTLE REMINDER</span>
        <Sparkles aria-hidden="true" size={12} />
      </Link>
      <Heart
        className="motivation-heart"
        aria-hidden="true"
        fill="currentColor"
        size={40}
      />
      <h2>
        You're doing
        <br />
        <em>amazing.</em>
      </h2>
      <p>
        Showing up for yourself is the real win. Keep going, one quest
        at a time.
      </p>
      <div className="motivation-bottom">
        SELF-KINDNESS IS A SUPERPOWER
        <ArrowUpRight aria-hidden="true" size={12} />
      </div>
    </section>
  );
}

type DailyProgressPanelProps = {
  selected: string;
  completed: number;
  total: number;
  percent: number;
  points: number;
};

export function DailyProgressPanel({
  selected,
  completed,
  total,
  percent,
  points,
}: DailyProgressPanelProps) {
  return (
    <section className="progress-panel">
      <div>
        <Link className="eyebrow section-heading-link" to={`/progress?date=${selected}`}>DAILY PROGRESS</Link>
        <strong>
          {completed}
          <span> / {total} TASKS COMPLETE</span>
        </strong>
      </div>
      <div className="progress-main">
        <div className="progress-label">
          <span>YOUR MOMENTUM</span>
          <b>{percent}%</b>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Daily quest completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div style={{ width: `${percent}%` }} />
        </div>
      </div>
      <div className="xp-total">
        <Sparkles aria-hidden="true" size={22} />
        <div>
          <strong>{points} PTS</strong>
          <small>EARNED THIS DAY</small>
        </div>
      </div>
    </section>
  );
}
