import { useEffect, useRef, useState } from "react";
import type { BookProgress, LibraryBook } from "../../../../shared/planner/books";
import { loadProgress, writeProgress } from "../services/progress-api";

type State = { progress: BookProgress | null; error: string; conflict: BookProgress | null; saving: boolean; pendingPosition: string | null };

export class ProgressQueue {
  state: State = { progress: null, error: "", conflict: null, saving: false, pendingPosition: null };
  private pending: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<boolean> | null = null;

  constructor(private book: LibraryBook, private notify: (state: State) => void) {}

  private update(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.notify(this.state);
  }

  async load() {
    try { this.update({ progress: await loadProgress(this.book), error: "", conflict: null }); }
    catch (error) { this.update({ error: error instanceof Error ? error.message : "Could not load progress." }); }
  }

  enqueue(position: string) {
    if (!this.state.progress) return;
    this.pending = position;
    this.update({ pendingPosition: position });
    if (!this.timer && !this.state.conflict && !this.state.error) {
      this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, 5000);
    }
  }

  flush(): Promise<boolean> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.running) return this.running;
    if (!this.state.progress || this.state.conflict || this.state.error) return Promise.resolve(false);
    this.running = this.save().finally(() => { this.running = null; });
    return this.running;
  }

  private async save(): Promise<boolean> {
    this.update({ saving: true });
    try {
      while (this.pending !== null && this.state.progress) {
        const position = this.pending;
        const result = await writeProgress(this.book, position, this.state.progress.revision);
        if (result.conflict && result.progress.position !== position) {
          this.update({ conflict: result.progress });
          return false;
        }
        this.update({ progress: result.progress });
        if (this.pending === position) {
          this.pending = null;
          this.update({ pendingPosition: null });
        }
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
    this.pending = null;
    this.update({ progress: this.state.conflict, conflict: null, error: "", pendingPosition: null });
  }
}

export function useBookProgress(book: LibraryBook) {
  const [state, setState] = useState<State>({ progress: null, error: "", conflict: null, saving: false, pendingPosition: null });
  const queue = useRef<ProgressQueue | null>(null);
  useEffect(() => {
    let active = true;
    const current = new ProgressQueue(book, (next) => { if (active) setState(next); });
    queue.current = current;
    void current.load();
    const flush = () => { void current.flush(); };
    window.addEventListener("pagehide", flush);
    return () => {
      active = false;
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [book.path, book.library]);
  return { ...state, queue };
}
