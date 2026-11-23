import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { BookOpen } from "lucide-react";
import { useFetcher } from "react-router";
import type { PlannerActionResult } from "../../../../shared/planner/types";

type JournalEditorProps = {
  selected: string;
  journal: string;
};

export function JournalEditor({ selected, journal: savedJournal }: JournalEditorProps) {
  const fetcher = useFetcher<PlannerActionResult>();
  const [journal, setJournal] = useState(savedJournal);

  useEffect(function syncSavedJournal() {
    setJournal(savedJournal);
  }, [selected, savedJournal]);

  function handleJournalChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setJournal(event.target.value);
  }

  return (
    <section className="panel notes-panel journal-panel" id="journal">
      <div className="section-label">
        <span>YOUR JOURNAL</span>
        <BookOpen aria-hidden="true" size={14} />
      </div>
      <p className="eyebrow">A MOMENT FOR YOU</p>
      <h2>Make space to reflect.</h2>
      <p className="journal-date">{new Date(`${selected}T12:00:00`).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      })}</p>
      <p className="journal-prompt">What is on your mind today? Capture a thought, a win, or anything you want to remember.</p>
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="save_journal" />
        <input type="hidden" name="date" value={selected} />
        <label className="sr-only" htmlFor="journal-entry">Journal entry for {selected}</label>
        <textarea
          id="journal-entry"
          name="journal"
          placeholder="Start writing here..."
          value={journal}
          maxLength={10_000}
          disabled={fetcher.state !== "idle"}
          onChange={handleJournalChange}
        />
        <button className="google-action" type="submit" disabled={fetcher.state !== "idle"}>
          {fetcher.state === "idle" ? "SAVE JOURNAL" : "SAVING..."}
        </button>
      </fetcher.Form>
      {fetcher.data?.message && <p className="inline-status" role="status">{fetcher.data.message}</p>}
      {fetcher.data?.error && <p className="inline-error" role="alert">{fetcher.data.error}</p>}
    </section>
  );
}
