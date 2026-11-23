import type { BookProgress } from "../../../../shared/planner/books";
import type { ProgressQueue } from "../hooks/use-book-progress";

export function ProgressStatus({ error, conflict, saving, pendingPosition, queue, onUseDatabase }: {
  error: string; conflict: BookProgress | null; saving: boolean; pendingPosition: string | null;
  queue: ProgressQueue | null; onUseDatabase: (progress: BookProgress) => void;
}) {
  return <>
    {saving && <p role="status">Saving progress...</p>}
    {!saving && pendingPosition !== null && !error && !conflict && <p role="status">Progress waiting to save.</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => { void queue?.retry(); }}>Retry</button></p>}
    {conflict && <div role="alert">
      <p>Progress changed elsewhere. Your position: {pendingPosition}. Database position: {conflict.position ?? "(empty)"} (revision {conflict.revision}).</p>
      <button type="button" onClick={() => { void queue?.keepMine(); }}>Save my position</button>
      <button type="button" onClick={() => { queue?.useDatabase(); onUseDatabase(conflict); }}>Use database position</button>
    </div>}
  </>;
}
