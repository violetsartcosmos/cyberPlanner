import { useCallback, useEffect, useState } from "react";
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

function JournalEntry({ selected, journal, initialExists, onSaved, onDeleted }: {
  selected: string;
  journal: string;
  initialExists: boolean;
  onSaved: () => void;
  onDeleted: () => void;
}) {
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
  const [deleting, setDeleting] = useState(false);
  const [exists, setExists] = useState(initialExists);
  const [error, setError] = useState("");
  useNotification(error);
  const revalidator = useRevalidator();
  const dirty = draft !== saved || saving || deleting;
  const blocker = useBlocker(dirty);

  const saveEntry = useCallback(async (content: string) => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(exists ? `/api/journals/${encodeURIComponent(selected)}` : "/api/journals", {
        method: exists ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exists ? { content } : { date: selected, content }),
      });
      if (!response.ok) {
        let message = `Could not save the journal (${response.status}).`;
        if (response.headers.get("Content-Type")?.includes("application/json")) {
          const result = await response.json() as { error?: string };
          message = result.error ?? message;
        }
        throw new Error(message);
      }
      setSaved(content);
      setExists(true);
      onSaved();
      revalidator.revalidate();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not save the journal.";
      setError(`${message} Your changes have not been saved.`);
    } finally {
      setSaving(false);
    }
  }, [exists, selected, onSaved, revalidator]);

  useEffect(function warnBeforeLeaving() {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  useEffect(function saveChanges() {
    if (draft === saved || saving || deleting || error) return;
    const timer = window.setTimeout(() => saveEntry(draft), blocker.state === "blocked" ? 0 : 800);
    return () => window.clearTimeout(timer);
  }, [draft, saved, saving, deleting, error, saveEntry, blocker.state]);

  useEffect(function continueAfterSaving() {
    if (blocker.state === "blocked" && !dirty && !error) blocker.proceed();
  }, [blocker, dirty, error]);

  function handleChange() {
    setDraft(editor.isEmpty ? "" : JSON.stringify(editor.document));
    setError("");
  }

  async function handleDelete() {
    if (!window.confirm("Delete this journal entry? This cannot be undone.")) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/journals/${encodeURIComponent(selected)}`, { method: "DELETE" });
      if (!response.ok) {
        let message = `Could not delete the journal (${response.status}).`;
        if (response.headers.get("Content-Type")?.includes("application/json")) {
          const result = await response.json() as { error?: string };
          message = result.error ?? message;
        }
        throw new Error(message);
      }
      onDeleted();
      revalidator.revalidate();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete the journal.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <article className="journal-entry">
      <div className="journal-entry-heading">
        <h2>{dateLabel}</h2>
        <span role="status">{deleting ? "Deleting..." : saving ? "Saving..." : dirty ? "Unsaved changes" : exists ? "Saved" : "No entry yet"}</span>
      </div>
      {exists ? (
        <button type="button" className="btn btn-outline-danger btn-sm" disabled={dirty} onClick={handleDelete}>Delete entry</button>
      ) : (
        <button type="button" className="btn btn-outline-primary btn-sm" disabled={saving} onClick={() => saveEntry(draft)}>Create entry</button>
      )}
      <p className="journal-hint">Write freely. Type / for blocks and formatting.</p>
      <div className="journal-editor">
        <BlockNoteView editor={editor} theme="dark" onChange={handleChange} editable={!deleting} />
      </div>
      {error && draft !== saved && (
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
  const { selected, onSelectDate } = usePlannerContext();
  const [entries, setEntries] = useState<string[]>([]);
  const [entry, setEntry] = useState<{ date: string; content: string; exists: boolean } | null>(null);
  const [entryVersion, setEntryVersion] = useState(0);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  useNotification(error);

  useEffect(function loadEntries() {
    const controller = new AbortController();
    setEntry(null);
    setError("");
    async function load() {
      try {
        const [listResponse, entryResponse] = await Promise.all([
          fetch("/api/journals", { signal: controller.signal }),
          fetch(`/api/journals/${encodeURIComponent(selected)}`, { signal: controller.signal }),
        ]);
        if (!listResponse.ok) throw new Error(`Could not load journals (${listResponse.status}).`);
        if (!entryResponse.ok && entryResponse.status !== 404) {
          throw new Error(`Could not load the journal (${entryResponse.status}).`);
        }
        const list = await listResponse.json() as { date: string }[];
        const journal = entryResponse.status === 404 ? null : await entryResponse.json() as { content: string };
        if (controller.signal.aborted) return;
        setEntries(list.map((item) => item.date));
        setEntry({ date: selected, content: journal?.content ?? "", exists: journal !== null });
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Could not load journals.");
      }
    }
    void load();
    return () => controller.abort();
  }, [selected, reload]);

  const handleSaved = useCallback(() => {
    setEntries((previous) => [...new Set([...previous, selected])].sort().reverse());
  }, [selected]);

  const handleDeleted = useCallback(() => {
    setEntries((previous) => previous.filter((date) => date !== selected));
    setEntry({ date: selected, content: "", exists: false });
    setEntryVersion((previous) => previous + 1);
  }, [selected]);

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
        <div>
          <p>Could not load journal entries.</p>
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setReload((previous) => previous + 1)}>Retry loading</button>
        </div>
      ) : entry?.date === selected ? (
        <JournalEntry key={`${selected}:${entryVersion}`} selected={selected} journal={entry.content}
          initialExists={entry.exists} onSaved={handleSaved} onDeleted={handleDeleted} />
      ) : <p role="status">Loading journal...</p>}
    </div>
  );
}
