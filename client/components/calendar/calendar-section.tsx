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
  googleEnabled: boolean;
  onSelect: (date: string) => void;
  onToday: () => void;
};

export function CalendarSection({
  date, selected, today, checks, journalDates, showJournal, journal, googleEnabled,
  onSelect, onToday,
}: CalendarSectionProps) {
  const [journalOpen, setJournalOpen] = useState(showJournal);

  useEffect(function syncJournalOpen() {
    if (showJournal) setJournalOpen(true);
  }, [showJournal]);

  useEffect(function focusJournalEntry() {
    if (journalOpen) document.getElementById("journal-entry")?.focus();
  }, [journalOpen, selected]);

  function openJournal() {
    if (journalOpen) document.getElementById("journal-entry")?.focus();
    else setJournalOpen(true);
  }

  function selectCalendarDate(next: string) {
    setJournalOpen(false);
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
        journalOpen={journalOpen}
        googleEnabled={googleEnabled}
      />
      {journalOpen && (
        <JournalEditor key={selected} selected={selected} journal={journal} />
      )}
    </>
  );
}
