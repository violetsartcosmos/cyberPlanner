import { useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { useFetcher } from "react-router";
import { BookmarkPlus, Headphones, ListMusic, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from "lucide-react";
import type { LibraryBook } from "../../../../shared/planner/books";
import { bookCoverUrl, bookUrl } from "../utils/book-url";
import { useBookmarks } from "../hooks/use-bookmarks";
import { useSavedWikipedia } from "../hooks/use-saved-wikipedia";
import { useBookProgress } from "../hooks/use-book-progress";
import { ProgressStatus } from "./progress-status";
import { audioPositionToSave, restoredAudioSeconds } from "../utils/audio-progress";
import { useNotification } from "@/components/notifications";
import type { BookReadResult } from "../services/book-actions";

function formatTime(seconds: number) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const remainder = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}

/**
 * Plays an audiobook with resource bookmarks, chapters and recoverable progress.
 * @param props - The selected book and reader close callback.
 * @returns The player controls and saved-position feedback.
 */
export function AudioPlayer({ book, onClose }: { book: LibraryBook; onClose: () => void }) {
  const { path, library } = book;
  const { progress, error: progressError, conflict, saving, pendingPosition, queue } = useBookProgress(book);
  const [restoreError, setRestoreError] = useState("");
  const chapterReader = useFetcher<BookReadResult>();
  const { load } = chapterReader;
  const chapters = chapterReader.data?.chapters ?? [];
  useNotification(chapterReader.data?.error);
  const notify = useNotification();
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showChapters, setShowChapters] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [imageError, setImageError] = useState(false);
  const restored = useRef(false);
  const restoringSeek = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { bookmarks, add, remove, error: bookmarkError, busy } = useBookmarks(book);
  const { wiki, error: wikiError } = useSavedWikipedia(book);
  const cover = wiki?.image && !imageError ? (wiki.image.cached ? bookCoverUrl(book) : wiki.image.url) : null;
  useNotification(bookmarkError);
  useNotification(wikiError);
  useNotification(imageError ? "Could not load the cover." : "");
  useNotification(restoreError);

  useEffect(function loadChapters() {
    void load(`/books/${library ?? "ebooks"}/${encodeURIComponent(path)}/chapters`);
  }, [path, library, load]);

  function savePosition(audio: HTMLAudioElement, force = false) {
    const position = audioPositionToSave(audio, restored.current);
    if (position === null) return;
    queue.current?.enqueue(position);
    if (force) void queue.current?.flush();
  }

  function applyPosition(audio: HTMLAudioElement, position: string | null) {
    restored.current = false;
    const seconds = restoredAudioSeconds(position, audio.duration);
    if (seconds === null) {
      setRestoreError("The saved position cannot be restored for this audiobook. Start from the beginning only if you want to replace it.");
      return;
    }
    setRestoreError("");
    if (audio.currentTime !== seconds) {
      restoringSeek.current = true;
      audio.currentTime = seconds;
    } else restored.current = true;
    setCurrent(seconds);
  }

  function restorePosition(event: SyntheticEvent<HTMLAudioElement>) {
    const audio = event.currentTarget;
    setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    if (progress) applyPosition(audio, progress.position);
  }

  function saveFinalPosition(event: SyntheticEvent<HTMLAudioElement>) {
    savePosition(event.currentTarget, true);
  }

  async function closePlayer() {
    if (audioRef.current) savePosition(audioRef.current);
    if (!progress || !queue.current || await queue.current.flush()) onClose();
  }

  function seek(seconds: number) {
    const audio = audioRef.current;
    if (!audio || !restored.current || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(seconds, audio.duration));
    setCurrent(audio.currentTime);
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !restored.current) return;
    if (!audio.paused) audio.pause();
    else {
      try { await audio.play(); }
      catch { notify("Could not play this audiobook."); }
    }
  }

  function changeSpeed() {
    const rates = [1, 1.25, 1.5, 1.75, 2, 0.75];
    const next = rates[(rates.indexOf(speed) + 1) % rates.length];
    if (audioRef.current) audioRef.current.playbackRate = next;
    setSpeed(next);
  }

  let chapterIndex = -1;
  for (let index = 0; index < chapters.length; index++) {
    if (chapters[index].start <= current) chapterIndex = index;
  }

  return (
    <section className="card p-3 library-audio-player" aria-label={`Listening to ${book.title}`}>
      <div className="library-reader-heading">
        <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => { void closePlayer(); }}>Back to library</button>
        <span className="library-kicker">YOUR AUDIO LIBRARY</span>
      </div>
      <div className="library-audio-main">
        <div className="library-audio-art">{cover ? <img src={cover} alt={`Cover of ${book.title}`} referrerPolicy={wiki?.image?.cached ? undefined : "no-referrer"} onError={() => setImageError(true)} /> : <Headphones size={54} strokeWidth={1.2} aria-hidden="true" />}</div>
        <p className="library-kicker">NOW LISTENING</p>
        <h2>{book.title}</h2>
        {chapterIndex >= 0 && <p>{chapters[chapterIndex].title}</p>}
        <label className="visually-hidden" htmlFor="audio-progress">Playback position</label>
        <input id="audio-progress" className="form-range library-audio-progress" type="range" min={0} max={duration || 0} step="0.1" value={Math.min(current, duration)} onChange={(event) => seek(Number(event.target.value))} disabled={!duration} />
        <div className="library-audio-times"><span>{formatTime(current)}</span><span>{formatTime(Math.max(0, duration - current))} left</span><span>{formatTime(duration)}</span></div>
        <div className="library-audio-controls">
          <button className="btn btn-outline-secondary btn-sm" type="button" aria-label="Previous chapter" disabled={!chapters.length || chapterIndex < 0} onClick={() => seek(chapters[current - chapters[chapterIndex].start > 3 ? chapterIndex : Math.max(0, chapterIndex - 1)].start)}><SkipBack /></button>
          <button className="btn btn-outline-secondary btn-sm" type="button" aria-label="Back 30 seconds" onClick={() => seek(current - 30)}><RotateCcw /><span>30</span></button>
          <button type="button" className="btn btn-primary library-audio-play" aria-label={playing ? "Pause" : "Play"} onClick={() => { void togglePlayback(); }}>{playing ? <Pause /> : <Play />}</button>
          <button className="btn btn-outline-secondary btn-sm" type="button" aria-label="Forward 30 seconds" onClick={() => seek(current + 30)}><RotateCw /><span>30</span></button>
          <button className="btn btn-outline-secondary btn-sm" type="button" aria-label="Next chapter" disabled={chapterIndex + 1 >= chapters.length} onClick={() => seek(chapters[chapterIndex + 1].start)}><SkipForward /></button>
        </div>
        <div className="library-audio-actions">
          <button className="btn btn-outline-secondary btn-sm" type="button" onClick={changeSpeed}><strong>{speed}x</strong><span>Speed</span></button>
          <button className="btn btn-outline-secondary btn-sm" type="button" aria-expanded={showChapters} onClick={() => setShowChapters((current) => !current)}><ListMusic /><span>Chapters</span></button>
          <button className="btn btn-outline-secondary btn-sm" type="button" disabled={busy || !duration} onClick={() => { void add(String(current), formatTime(current)); setShowBookmarks(true); }}><BookmarkPlus /><span>Add bookmark</span></button>
        </div>
        {showChapters && <div className="library-audio-list"><h3>Chapters</h3>{chapters.length ? <ul>{chapters.map((chapter, index) => <li key={`${chapter.start}-${index}`}><button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => seek(chapter.start)}>{chapter.title} · {formatTime(chapter.start)}</button></li>)}</ul> : <p>No chapters available.</p>}</div>}
        <div className="library-bookmarks">
          <button className="btn btn-outline-secondary btn-sm" type="button" aria-expanded={showBookmarks} onClick={() => setShowBookmarks((current) => !current)}>Bookmarks ({bookmarks.length})</button>
          {showBookmarks && <ul>{bookmarks.map((bookmark) => <li key={bookmark.id}><button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => seek(Number(bookmark.position))}>{bookmark.label}</button><button className="btn btn-outline-secondary btn-sm" type="button" disabled={busy} onClick={() => { void remove(bookmark.id); }} aria-label={`Remove ${bookmark.label}`}>Remove</button></li>)}</ul>}
        </div>
      </div>
      {progress && <audio
        ref={audioRef}
        preload="metadata"
        src={bookUrl(book)}
        onLoadedMetadata={restorePosition}
        onTimeUpdate={(event) => { setCurrent(event.currentTarget.currentTime); savePosition(event.currentTarget); }}
        onPlay={() => setPlaying(true)}
        onPause={(event) => { setPlaying(false); saveFinalPosition(event); }}
        onSeeked={(event) => {
          if (restoringSeek.current) { restoringSeek.current = false; restored.current = true; return; }
          saveFinalPosition(event);
        }}
        onEnded={(event) => { setPlaying(false); saveFinalPosition(event); }}
        onError={() => notify("Could not play this audiobook. It may be incomplete, protected, or unsupported by this browser.")}
      >
        Your browser does not support audio playback.
      </audio>}
      {restoreError && <div>
        <p>Starting from the beginning will replace the saved position.</p>
        <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => {
          setRestoreError("");
          restoringSeek.current = false;
          restored.current = true;
          if (audioRef.current) { audioRef.current.currentTime = 0; setCurrent(0); queue.current?.enqueue("0"); }
        }}>Start from beginning</button>
      </div>}
      <ProgressStatus error={progressError} conflict={conflict} saving={saving} pendingPosition={pendingPosition} queue={queue.current} onUseDatabase={(value) => { if (audioRef.current) { restored.current = false; audioRef.current.pause(); applyPosition(audioRef.current, value.position); } }} />
    </section>
  );
}
