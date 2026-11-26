import { useEffect, useRef, useState } from "react";
import { useBlocker, useFetcher, useLoaderData } from "react-router";
import { useDebouncedValue, useWindowEvent } from "@mantine/hooks";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { PartialBlock } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { parseDate } from "../../shared/planner/utils";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";
import { useActionNotifications, useNotification } from "@/components/notifications";
import type { JournalActionResult } from "@/features/planner/services/journal-actions";
import { journalLoader } from "@/features/planner/services/journal-actions";

/**
 * Restores the editor's saved blocks or a legacy plain-text paragraph.
 * @param value - The existing entry content.
 * @returns Initial editor blocks, or no initial content for an empty entry.
 */
function initialBlocks(value: string): PartialBlock[] | undefined {
  if (!value) return undefined;
  if (!value.startsWith("[")) return [{ type: "paragraph", content: value }];
  return JSON.parse(value) as PartialBlock[];
}

/**
 * Creates an empty journal before exposing its editor.
 * @param props - The date identifying the new entry.
 * @returns The explicit creation form.
 */
function NewJournalEntry({ date }: { date: string }) {
  const createFetcher = useFetcher<JournalActionResult>();
  useActionNotifications(createFetcher);
  return (
    <article className="journal-entry">
      <h2>{parseDate(date).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      })}</h2>
      <p>No entry yet.</p>
      <createFetcher.Form method="post" action="/journal/entries">
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="content" value="" />
        <button type="submit" className="btn btn-outline-primary btn-sm" disabled={createFetcher.state !== "idle"}>
          {createFetcher.state !== "idle" ? "Creating..." : "Create entry"}
        </button>
      </createFetcher.Form>
    </article>
  );
}

/**
 * Autosaves an existing journal by its date ID without creating or retrying entries.
 * @param props - The saved entry's identity and initial content.
 * @returns The editor and a separate confirmed-deletion form.
 */
function JournalEntry({ entryDate, content }: { entryDate: string; content: string }) {
  const dateLabel = parseDate(entryDate).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const [draft, setDraft] = useState(content);
  const [debouncedDraft] = useDebouncedValue(draft, 800);
  const editor = useCreateBlockNote({
    initialContent: initialBlocks(draft),
    domAttributes: { editor: { "aria-label": `Journal entry for ${dateLabel}` } },
  });
  const [saved, setSaved] = useState(content);
  const saveFetcher = useFetcher<JournalActionResult>();
  const deleteFetcher = useFetcher<JournalActionResult>();
  const submittedContent = useRef<string | null>(null);
  const saving = saveFetcher.state !== "idle";
  const deleting = deleteFetcher.state !== "idle";
  useNotification(saveFetcher.state === "idle" ? saveFetcher.data?.error : "");
  useActionNotifications(deleteFetcher);
  const dirty = draft !== saved || saving || deleting;
  const blocker = useBlocker(dirty);
  const { submit } = saveFetcher;

  useEffect(function finishSave() {
    if (!saving && saveFetcher.data && submittedContent.current !== null &&
        saveFetcher.data.status >= 200 && saveFetcher.data.status < 300) {
      setSaved(submittedContent.current);
    }
  }, [saving, saveFetcher.data]);

  useEffect(function saveChanges() {
    if (saving || deleting || debouncedDraft === saved || debouncedDraft === submittedContent.current) return;
    submittedContent.current = debouncedDraft;
    submit({ content: debouncedDraft }, { method: "put", action: `/journal/entries/${entryDate}` });
  }, [debouncedDraft, saved, saving, deleting, entryDate, submit]);

  useEffect(function continueAfterSaving() {
    if (blocker.state === "blocked" && !dirty) blocker.proceed();
  }, [blocker, dirty]);

  useWindowEvent("beforeunload", (event) => {
    if (dirty) event.preventDefault();
  });

  return (
    <article className="journal-entry">
      <div className="journal-entry-heading">
        <h2>{dateLabel}</h2>
        <span role="status">{deleting ? "Deleting..." : saving ? "Saving..." : dirty ? "Unsaved changes" : "Saved"}</span>
      </div>
      <deleteFetcher.Form method="delete" action={`/journal/entries/${entryDate}`} onSubmit={(event) => {
        if (!window.confirm("Delete this journal entry? This cannot be undone.")) event.preventDefault();
      }}>
        <button type="submit" className="btn btn-outline-danger btn-sm" disabled={dirty}>Delete entry</button>
      </deleteFetcher.Form>
      <p className="journal-hint">Write freely. Type / for blocks and formatting.</p>
      <div className="journal-editor">
        <BlockNoteView editor={editor} theme="dark"
          onChange={() => setDraft(editor.isEmpty ? "" : JSON.stringify(editor.document))} editable={!deleting} />
      </div>
      {blocker.state === "blocked" && (
        <div className="journal-navigation-warning">
          <p>{saving ? "Saving your changes before leaving..." : "Leave without saving your changes?"}</p>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => blocker.reset()}>Stay</button>
          <button type="button" className="btn btn-outline-danger btn-sm" disabled={saving || deleting}
            onClick={() => blocker.proceed()}>Discard changes</button>
        </div>
      )}
    </article>
  );
}

/**
 * Browses saved journals using selected-date resource reads.
 * @returns The date browser and an explicit new-entry form or existing-entry editor.
 */
export default function JournalPage() {
  const { selected, onSelectDate } = usePlannerContext();
  const journal = useLoaderData<typeof journalLoader>();
  const entries = journal.dates ?? [];
  const entry = journal.entry?.date === selected ? journal.entry : null;
  const error = journal.error ?? "";
  useNotification(error);

  return (
    <div className="journal-layout">
      <aside className="journal-browser" aria-label="Browse journal entries">
        <label htmlFor="journal-date">Choose a date</label>
        <input id="journal-date" className="form-control" type="date" value={selected}
          onChange={(event) => {
            if (event.target.value) onSelectDate(event.target.value);
          }} />
        <h2>Entries</h2>
        {entries.length === 0 ? <p>{!entry && !error ? "Loading entries..." : "No entries yet."}</p> : (
          <ul>
            {entries.map((date) => (
              <li key={date}>
                <button type="button" aria-current={date === selected ? "date" : undefined}
                  onClick={() => onSelectDate(date)}>
                  {parseDate(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      {error ? (
        <p>Could not load journal entries.</p>
      ) : entry ? (
        entry.exists
          ? <JournalEntry key={entry.date} entryDate={entry.date} content={entry.content} />
          : <NewJournalEntry key={entry.date} date={entry.date} />
      ) : <p role="status">Loading journal...</p>}
    </div>
  );
}
