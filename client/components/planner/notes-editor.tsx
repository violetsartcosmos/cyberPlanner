import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useFetcher } from "react-router";
import { Pencil } from "lucide-react";
import type { PlannerActionResult } from "../../../shared/planner/types";

type NotesEditorProps = {
  selected: string;
  note: string;
};

export function NotesEditor({ selected, note: savedNote }: NotesEditorProps) {
  const fetcher = useFetcher<PlannerActionResult>();
  const [note, setNote] = useState(savedNote);

  useEffect(function syncSavedNote() {
    setNote(savedNote);
  }, [selected, savedNote]);

  function handleNoteChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setNote(event.target.value);
  }

  return (
    <section className="panel notes-panel">
      <Link className="section-label section-link" to={`/notes?date=${selected}`}>
        <span>06 / BRAIN DUMP</span>
        <Pencil aria-hidden="true" size={12} />
      </Link>
      <h2>Notes to self.</h2>
      <label className="sr-only" htmlFor="notes">
        Notes for {selected}
      </label>
      <textarea
        id="notes"
        placeholder="What's on your mind?"
        value={note}
        maxLength={10_000}
        onChange={handleNoteChange}
      />
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="save_note" />
        <input type="hidden" name="date" value={selected} />
        <input type="hidden" name="note" value={note} />
        <button
          className="google-action"
          type="submit"
          disabled={fetcher.state !== "idle"}
        >
          SAVE NOTE
        </button>
      </fetcher.Form>
      {fetcher.data?.message && (
        <p className="inline-status">{fetcher.data.message}</p>
      )}
      {fetcher.data?.error && (
        <p className="inline-error" role="alert">
          {fetcher.data.error}
        </p>
      )}
      <p>SAVED TO YOUR PLANNER</p>
    </section>
  );
}
