import type { BookProgress } from "../../../../shared/planner/books";
import type { ProgressQueue } from "../hooks/use-book-progress";
import { useNotification } from "@/components/notifications";

export function ProgressStatus({ error, conflict, saving, pendingPosition, queue, onUseDatabase }: {
  error: string; conflict: BookProgress | null; saving: boolean; pendingPosition: string | null;
  queue: ProgressQueue | null; onUseDatabase: (progress: BookProgress) => void;
}) {
  useNotification(error);
  useNotification(conflict
    ? `Progress changed elsewhere. Your position: ${pendingPosition}. Database position: ${conflict.position ?? "(empty)"} (revision ${conflict.revision}).`
    : "");
  return <>
    {saving && <p role="status">Saving progress...</p>}
    {!saving && pendingPosition !== null && !error && !conflict && <p role="status">Progress waiting to save.</p>}
    {error && <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => { void queue?.retry(); }}>Retry progress save</button>}
    {conflict && <div>
      <p>Your position: {pendingPosition}. Database position: {conflict.position ?? "(empty)"} (revision {conflict.revision}).</p>
      <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => { void queue?.keepMine(); }}>Save my position</button>
      <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => { queue?.useDatabase(); onUseDatabase(conflict); }}>Use database position</button>
    </div>}
  </>;
}
