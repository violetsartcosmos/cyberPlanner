import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useFetcher } from "react-router";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import type { PlannerActionResult } from "../../../shared/planner/types";
import { addDays, dateKey, isValidDateKey, parseDate } from "../../../shared/planner/utils";

type NotesEditorProps = {
  selected: string;
  note: string;
  onSelect: (date: string) => void;
};

export function NotesEditor({ selected, note: savedNote, onSelect }: NotesEditorProps) {
  const fetcher = useFetcher<PlannerActionResult>();
  const [note, setNote] = useState(savedNote);
  const [direction, setDirection] = useState<"previous" | "next">("next");
  const [submittedDate, setSubmittedDate] = useState("");

  useEffect(function syncSavedNote() {
    setNote(savedNote);
  }, [selected, savedNote]);

  function handleNoteChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setNote(event.target.value);
  }

  const previous = dateKey(addDays(parseDate(selected), -1));
  const next = dateKey(addDays(parseDate(selected), 1));
  const busy = fetcher.state !== "idle";

  function turnPage(date: string, pageDirection: "previous" | "next") {
    if (note !== savedNote && !window.confirm("Discard your unsaved changes to this note?")) return;
    setDirection(pageDirection);
    onSelect(date);
  }

  return (
    <section className="panel notes-panel notes-book">
      <Link className="section-label section-link" to={`/notes?date=${selected}`}>
        <span>06 / BRAIN DUMP</span>
        <Pencil aria-hidden="true" size={12} />
      </Link>
      <div className="notes-book-heading">
        <div>
          <p className="eyebrow">A LITTLE SPACE FOR YOUR THOUGHTS</p>
          <h2>Notes to self.</h2>
          <p>One page, one day, whatever is on your mind.</p>
        </div>
        <img src="/witchynotessingle.png" alt="" aria-hidden="true" />
      </div>
      <div className="notes-book-pages">
        <div className={`notes-book-page notes-book-page--${direction}`} key={selected}>
          <p className="notes-book-date" aria-live="polite">
            {parseDate(selected).toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric", year: "numeric",
            })}
          </p>
          <label className="sr-only" htmlFor="notes">
            Notes for {selected}
          </label>
          <textarea
            id="notes"
            placeholder="What's on your mind?"
            value={note}
            maxLength={10_000}
            disabled={busy}
            onChange={handleNoteChange}
          />
          <fetcher.Form method="post" onSubmit={() => setSubmittedDate(selected)}>
            <input type="hidden" name="intent" value="save_note" />
            <input type="hidden" name="date" value={selected} />
            <input type="hidden" name="note" value={note} />
            <button className="google-action" type="submit" disabled={busy}>
              {busy ? "SAVING..." : "SAVE NOTE"}
            </button>
          </fetcher.Form>
          {submittedDate === selected && fetcher.data?.message && (
            <p className="inline-status" role="status">{fetcher.data.message}</p>
          )}
          {submittedDate === selected && fetcher.data?.error && (
            <p className="inline-error" role="alert">{fetcher.data.error}</p>
          )}
        </div>
      </div>
      <nav className="notes-book-navigation" aria-label="Note pages">
        <button type="button" disabled={busy || !isValidDateKey(previous)} onClick={() => turnPage(previous, "previous")}>
          <ChevronLeft aria-hidden="true" size={16} /> PREVIOUS DAY
        </button>
        <span>DAY BY DAY</span>
        <button type="button" disabled={busy || !isValidDateKey(next)} onClick={() => turnPage(next, "next")}>
          NEXT DAY <ChevronRight aria-hidden="true" size={16} />
        </button>
      </nav>
      <p>SAVED TO YOUR PLANNER</p>
    </section>
  );
}
