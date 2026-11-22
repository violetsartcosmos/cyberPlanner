import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { Pencil } from "lucide-react";
import type { PlannerActionResult } from "../../../shared/planner/types";

type NotesEditorProps = {
  selected: string;
  note: string;
};

export function NotesEditor({ selected, note: savedNote }: NotesEditorProps) {
  const fetcher = useFetcher<PlannerActionResult>();
  const [note, setNote] = useState(savedNote);

  useEffect(() => {
    setNote(savedNote);
  }, [selected, savedNote]);

  return (
    <section className="panel notes-panel">
      <div className="section-label">
        <span>06 / BRAIN DUMP</span>
        <Pencil aria-hidden="true" size={12} />
      </div>
      <h2>Notes to self.</h2>
      <label className="sr-only" htmlFor="notes">
        Notes for {selected}
      </label>
      <textarea
        id="notes"
        placeholder="What's on your mind?"
        value={note}
        maxLength={10_000}
        onChange={(event) => setNote(event.target.value)}
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
