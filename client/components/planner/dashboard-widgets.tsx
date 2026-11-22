import { Sparkles } from "lucide-react";
import { Link } from "react-router";

const affirmations = [
  "You are enough, exactly as you are.",
  "Small steps are still progress.",
  "You deserve kindness, especially from yourself.",
  "Showing up for yourself is a win.",
  "You are allowed to grow at your own pace.",
  "Your effort matters, even on difficult days.",
  "You can begin again whenever you need to.",
  "You are worthy of rest and care.",
  "One quest at a time is enough.",
  "You bring something special to this world.",
  "Your progress does not have to be perfect.",
  "You are stronger than you think.",
] as const;

export function DailyAffirmation({ today }: { today: string }) {
  const seed = Array.from(today).reduce(
    (hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0,
    2166136261,
  );
  return (
    <div className="intro-tag">
      <Sparkles aria-hidden="true" size={14} /> DAILY AFFIRMATION
      <small>{affirmations[seed % affirmations.length]}</small>
    </div>
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
