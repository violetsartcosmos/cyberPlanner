import { useEffect, useState } from "react";
import { JournalEditor } from "./journal-editor";
import { MissionCalendar } from "./mission-calendar";

type CalendarSectionProps = {
  date: Date;
  selected: string;
  today: string;
  checks: Record<string, string[]>;
  journalDates: string[];
  showJournal: boolean;
  journal: string;
  onSelect: (date: string) => void;
  onToday: () => void;
};

export function CalendarSection({
  date, selected, today, checks, journalDates, showJournal, journal,
  onSelect, onToday,
}: CalendarSectionProps) {
  const [journalOpen, setJournalOpen] = useState(showJournal);

  useEffect(() => {
    if (showJournal) setJournalOpen(true);
  }, [showJournal]);

  useEffect(() => {
    if (journalOpen) document.getElementById("journal-entry")?.focus();
  }, [journalOpen, selected]);

  return (
    <>
      <MissionCalendar
        date={date}
        selected={selected}
        today={today}
        checks={checks}
        journalDates={journalDates}
        onSelect={onSelect}
        onToday={onToday}
        onAddJournal={() => {
          if (journalOpen) document.getElementById("journal-entry")?.focus();
          else setJournalOpen(true);
        }}
        journalOpen={journalOpen}
      />
      {journalOpen && (
        <JournalEditor key={selected} selected={selected} journal={journal} />
      )}
    </>
  );
}
