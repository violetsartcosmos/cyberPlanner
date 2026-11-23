import { useNavigate } from "react-router";
import { MissionCalendar } from "./mission-calendar";

type CalendarSectionProps = {
  date: Date;
  selected: string;
  today: string;
  checks: Record<string, string[]>;
  journalDates: string[];
  googleEnabled: boolean;
  onSelect: (date: string) => void;
  onToday: () => void;
};

export function CalendarSection({
  date, selected, today, checks, journalDates, googleEnabled,
  onSelect, onToday,
}: CalendarSectionProps) {
  const navigate = useNavigate();

  function openJournal() {
    navigate(`/journal?date=${selected}`);
  }

  function selectCalendarDate(next: string) {
    onSelect(next);
  }

  return (
    <>
      <MissionCalendar
        date={date}
        selected={selected}
        today={today}
        checks={checks}
        journalDates={journalDates}
        onSelect={selectCalendarDate}
        onToday={onToday}
        onAddJournal={openJournal}
        googleEnabled={googleEnabled}
      />
    </>
  );
}
