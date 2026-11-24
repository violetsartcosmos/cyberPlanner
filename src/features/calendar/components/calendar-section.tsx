import { useNavigate } from "react-router";
import { MissionCalendar } from "./mission-calendar";
import type { RoutineTask } from "../../../../shared/planner/routines";

type CalendarSectionProps = {
  date: Date;
  selected: string;
  today: string;
  checks: Record<string, string[]>;
  routines: RoutineTask[];
  journalDates: string[];
  googleEnabled: boolean;
  onSelect: (date: string) => void;
  onToday: () => void;
};

export function CalendarSection({
  date, selected, today, checks, routines, journalDates, googleEnabled,
  onSelect, onToday,
}: CalendarSectionProps) {
  const navigate = useNavigate();

  function openJournal() {
    navigate(`/journal?date=${selected}`);
  }

  return (
    <>
      <MissionCalendar
        date={date}
        selected={selected}
        today={today}
        checks={checks}
        routines={routines}
        journalDates={journalDates}
        onSelect={onSelect}
        onToday={onToday}
        onAddJournal={openJournal}
        googleEnabled={googleEnabled}
      />
    </>
  );
}
