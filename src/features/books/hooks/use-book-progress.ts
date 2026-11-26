import { useCallback, useEffect, useRef, useState } from "react";
import { useInterval } from "@mantine/hooks";
import type { BookProgress, LibraryBook } from "../../../../shared/planner/books";
import { loadProgress, writeProgress } from "../services/progress-api";

type State = { progress: BookProgress | null; error: string; conflict: BookProgress | null; saving: boolean; pendingPosition: string | null };

export class ProgressQueue {
  state: State = { progress: null, error: "", conflict: null, saving: false, pendingPosition: null };
  private running: Promise<boolean> | null = null;

  constructor(private book: Pick<LibraryBook, "path" | "library">, private notify: (state: State) => void) {}

  private update(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.notify(this.state);
  }

  async load() {
    try { this.update({ progress: await loadProgress(this.book), error: "", conflict: null }); }
    catch (error) { this.update({ error: error instanceof Error ? error.message : "Could not load progress." }); }
  }

  /**
   * Keeps the latest position while a write is pending.
   * @param position - The reader position to save.
   * @returns Nothing; the hook schedules the write.
   */
  enqueue(position: string) {
    if (!this.state.progress) return;
    this.update({ pendingPosition: position });
  }

  /**
   * Joins an in-flight save or starts one for the pending position.
   * @returns Whether the queued positions were saved.
   */
  flush(): Promise<boolean> {
    if (this.running) return this.running;
    if (!this.state.progress || this.state.pendingPosition === null || this.state.conflict || this.state.error) return Promise.resolve(false);
    this.running = this.save().finally(() => { this.running = null; });
    return this.running;
  }

  /**
   * Serializes pending writes and pauses on conflicting database progress.
   * @returns Whether all queued positions were saved.
   */
  private async save(): Promise<boolean> {
    this.update({ saving: true });
    try {
      while (this.state.pendingPosition !== null && this.state.progress) {
        const position = this.state.pendingPosition;
        const result = await writeProgress(this.book, position, this.state.progress.revision);
        if (result.status === 409 && result.progress.position !== position) {
          this.update({ conflict: result.progress });
          return false;
        }
        this.update({
          progress: result.progress,
          pendingPosition: this.state.pendingPosition === position ? null : this.state.pendingPosition,
        });
      }
      return true;
    } catch (error) {
      this.update({ error: error instanceof Error ? error.message : "Could not save progress." });
      return false;
    } finally { this.update({ saving: false }); }
  }

  async retry() {
    if (!this.state.progress) return this.load();
    this.update({ error: "" });
    await this.flush();
  }

  async keepMine() {
    if (!this.state.conflict) return;
    this.update({ progress: this.state.conflict, conflict: null, error: "" });
    await this.flush();
  }

  useDatabase() {
    if (!this.state.conflict) return;
    this.update({ progress: this.state.conflict, conflict: null, error: "", pendingPosition: null });
  }
}

/**
 * Saves pending reader positions periodically and when leaving the page.
 * @param book - The library book whose revisioned progress is saved.
 * @returns Progress, recovery feedback and the write queue.
 */
export function useBookProgress(book: LibraryBook) {
  const { path, library } = book;
  const [state, setState] = useState<State>({ progress: null, error: "", conflict: null, saving: false, pendingPosition: null });
  const queue = useRef<ProgressQueue | null>(null);
  const savePending = useCallback(() => { void queue.current?.flush(); }, []);
  useInterval(savePending, 5000, { autoInvoke: true });
  useEffect(() => {
    let active = true;
    const current = new ProgressQueue({ path, library }, (next) => { if (active) setState(next); });
    queue.current = current;
    setState(current.state);
    void current.load();
    const flush = () => { void current.flush(); };
    window.addEventListener("pagehide", flush);
    return () => {
      active = false;
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [path, library]);
  return { ...state, queue };
}
