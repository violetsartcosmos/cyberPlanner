import { ChevronRight, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { dailyQuests } from "../../../shared/planner/definitions";
import { weekdays } from "../../../shared/planner/utils";
import type { ReactNode } from "react";

export function WeeklyProtocolPanel({ selected, weekday }: { selected: string; weekday: number }) {
  const weekItems: ReactNode[] = [];
  for (let index = 0; index < dailyQuests.length; index += 1) {
    const day = dailyQuests[index];
    weekItems.push(
      <div key={day.title} className={index === weekday ? "active-weekday" : ""}>
        <span>{weekdays[index].toUpperCase()}</span>
        <strong>{day.title}</strong>
        <b>{index === weekday && <ChevronRight aria-hidden="true" size={12} />}</b>
      </div>,
    );
  }

  return (
    <section className="panel week-panel" id="weekly">
      <Link className="section-label section-link" to={`/calendar?date=${selected}#weekly`}>
        <span>02 / WEEKLY PROTOCOL</span>
        <Sparkles aria-hidden="true" size={12} />
      </Link>
      <h2>Every day has a mission.</h2>
      <p>Small steps, one day at a time.</p>
      <div className="week-list">
        {weekItems}
      </div>
    </section>
  );
}
