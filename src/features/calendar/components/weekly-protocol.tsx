import { ChevronRight, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { weekdays } from "../../../../shared/planner/utils";
import { routineGroupFor, routineWeekday, type RoutineGroup } from "../../../../shared/planner/routines";
import type { ReactNode } from "react";

export function WeeklyProtocolPanel({ selected, weekday, routineGroups }: {
  selected: string;
  weekday: number;
  routineGroups: RoutineGroup[];
}) {
  const weekItems: ReactNode[] = [];
  for (let index = 0; index < weekdays.length; index += 1) {
    const group = routineGroupFor(routineGroups, routineWeekday(index));
    weekItems.push(
      <div key={index} className={index === weekday ? "active-weekday" : ""}>
        <span>{weekdays[index].toUpperCase()}</span>
        <strong>{group?.title ?? ""}</strong>
        <b>{index === weekday && <ChevronRight aria-hidden="true" size={12} />}</b>
      </div>,
    );
  }

  return (
    <section className="card p-3 week-panel" id="weekly">
      <Link className="section-label section-link" to={`/calendar?date=${selected}#weekly`}>
        <span>02 / WEEKLY PROTOCOL</span>
        <Sparkles aria-hidden="true" size={12} />
      </Link>
      <h2 className="h5">Every day has a mission.</h2>
      <p>Small steps, one day at a time.</p>
      <div className="week-list">
        {weekItems}
      </div>
    </section>
  );
}
