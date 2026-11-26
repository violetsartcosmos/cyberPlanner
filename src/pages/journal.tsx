import { useEffect, useState } from "react";
import { useBlocker, useRevalidator } from "react-router";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { PartialBlock } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { parseDate } from "../../shared/planner/utils";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";
import { useNotification } from "@/components/notifications";

function initialBlocks(value: string): PartialBlock[] | undefined {
  if (!value) return undefined;
  if (!value.startsWith("[")) return [{ type: "paragraph", content: value }];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((block) =>
    typeof block === "object" && block !== null && typeof block.type === "string"
  )) {
    throw new Error("The saved journal entry is invalid.");
  }
  return parsed;
}

function JournalEntry({ selected, journal }: { selected: string; journal: string }) {
  const dateLabel = parseDate(selected).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const editor = useCreateBlockNote({
    initialContent: initialBlocks(journal),
    domAttributes: { editor: { "aria-label": `Journal entry for ${dateLabel}` } },
  });
  const [draft, setDraft] = useState(journal);
  const [saved, setSaved] = useState(journal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useNotification(error ? `${error} Your changes have not been saved.` : "");
  const revalidator = useRevalidator();
  const dirty = draft !== saved || saving;
  const blocker = useBlocker(dirty);

  useEffect(function warnBeforeLeaving() {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  useEffect(function saveChanges() {
    if (draft === saved || saving || error) return;
    const timer = window.setTimeout(async () => {
      setSaving(true);
      try {
        const response = await fetch(`/api/journals/${encodeURIComponent(selected)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: draft }),
        });
        if (!response.ok) {
          let message = `Could not save the journal (${response.status}).`;
          if (response.headers.get("Content-Type")?.includes("application/json")) {
            const result = await response.json() as { error?: string };
            message = result.error ?? message;
          }
          throw new Error(message);
        }
        setSaved(draft);
        revalidator.revalidate();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not save the journal.");
      } finally {
        setSaving(false);
      }
    }, blocker.state === "blocked" ? 0 : 800);
    return () => window.clearTimeout(timer);
  }, [draft, saved, saving, error, selected, blocker.state, revalidator]);

  useEffect(function continueAfterSaving() {
    if (blocker.state === "blocked" && !dirty && !error) blocker.proceed();
  }, [blocker, dirty, error]);

  function handleChange() {
    setDraft(editor.isEmpty ? "" : JSON.stringify(editor.document));
    setError("");
  }

  return (
    <article className="journal-entry">
      <div className="journal-entry-heading">
        <h2>{dateLabel}</h2>
        <span role="status">{saving ? "Saving..." : dirty ? "Unsaved changes" : "Saved"}</span>
      </div>
      <p className="journal-hint">Write freely. Type / for blocks and formatting.</p>
      <div className="journal-editor">
        <BlockNoteView editor={editor} theme="dark" onChange={handleChange} />
      </div>
      {error && (
        <div>
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setError("")}>Retry saving</button>
        </div>
      )}
      {blocker.state === "blocked" && error && (
        <div className="journal-navigation-warning">
          <p>Save your changes before leaving, or discard them.</p>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => blocker.reset()}>Stay</button>
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => blocker.proceed()}>Discard changes</button>
        </div>
      )}
    </article>
  );
}

export default function JournalPage() {
  const { page, selected, onSelectDate } = usePlannerContext();
  const entries = [...page.journalDates].sort().reverse();

  return (
    <div className="journal-layout">
      <aside className="journal-browser" aria-label="Browse journal entries">
        <label htmlFor="journal-date">Choose a date</label>
        <input id="journal-date" className="form-control" type="date" value={selected}
          onChange={(event) => {
            if (event.target.value) onSelectDate(event.target.value);
          }} />
        <h2>Entries</h2>
        {entries.length === 0 ? <p>No entries yet.</p> : (
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
      <JournalEntry key={selected} selected={selected} journal={page.journal} />
    </div>
  );
}
