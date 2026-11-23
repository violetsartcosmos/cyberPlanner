import { useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { BookmarkPlus, Headphones, ListMusic, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from "lucide-react";
import type { LibraryBook } from "../../../shared/planner/books";
import { bookCoverUrl, bookQuery, bookUrl } from "./book-url";
import { useBookmarks } from "./use-bookmarks";
import { useSavedWikipedia } from "./use-saved-wikipedia";

type Chapter = { title: string; start: number };

function formatTime(seconds: number) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const remainder = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}

export function AudioPlayer({ book, onClose }: { book: LibraryBook; onClose: () => void }) {
  const storageKey = `cyberplanner-audiobook:${book.storagePath ?? book.path}`;
  const [position] = useState<{ seconds: number; error: string }>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === null) return { seconds: 0, error: "" };
      const seconds = Number(saved);
      if (!Number.isFinite(seconds) || seconds < 0) {
        return { seconds: 0, error: "Saved listening position is invalid." };
      }
      return { seconds, error: "" };
    } catch {
      return { seconds: 0, error: "Listening position could not be loaded from this browser." };
    }
  });
  const [error, setError] = useState(position.error);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterError, setChapterError] = useState("");
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showChapters, setShowChapters] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [imageError, setImageError] = useState(false);
  const lastSaved = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { bookmarks, add, remove, error: bookmarkError, busy } = useBookmarks(book);
  const { wiki, error: wikiError } = useSavedWikipedia(book);
  const cover = wiki?.image && !imageError ? (wiki.image.cached ? bookCoverUrl(book) : wiki.image.url) : null;

  useEffect(function loadChapters() {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/books/chapters?${bookQuery(book)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Could not load chapters (${response.status}).`);
        setChapters(await response.json() as Chapter[]);
      } catch (error) {
        if (!controller.signal.aborted) setChapterError(error instanceof Error ? error.message : "Could not load chapters.");
      }
    }
    void load();
    return () => controller.abort();
  }, [book.path, book.library]);

  function savePosition(audio: HTMLAudioElement, force = false) {
    if (!force && Date.now() - lastSaved.current < 5000) return;
    if (!Number.isFinite(audio.currentTime)) return;
    try {
      localStorage.setItem(storageKey, String(audio.ended ? 0 : audio.currentTime));
      lastSaved.current = Date.now();
    } catch {
      setError("Listening position could not be saved in this browser.");
    }
  }

  function restorePosition(event: SyntheticEvent<HTMLAudioElement>) {
    const audio = event.currentTarget;
    setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    if (position.seconds > 0 && Number.isFinite(audio.duration) && position.seconds < audio.duration) {
      audio.currentTime = position.seconds;
    }
  }

  function saveFinalPosition(event: SyntheticEvent<HTMLAudioElement>) {
    savePosition(event.currentTarget, true);
  }

  function closePlayer() {
    if (audioRef.current) savePosition(audioRef.current, true);
    onClose();
  }

  function seek(seconds: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(seconds, audio.duration));
    setCurrent(audio.currentTime);
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) audio.pause();
    else {
      try { await audio.play(); }
      catch { setError("Could not play this audiobook."); }
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
    <section className="panel library-audio-player" aria-label={`Listening to ${book.title}`}>
      <div className="library-reader-heading">
        <button type="button" onClick={closePlayer}>Back to library</button>
        <span className="library-kicker">YOUR AUDIO LIBRARY</span>
      </div>
      <div className="library-audio-main">
        <div className="library-audio-art">{cover ? <img src={cover} alt={`Cover of ${book.title}`} referrerPolicy={wiki?.image?.cached ? undefined : "no-referrer"} onError={() => setImageError(true)} /> : <Headphones size={54} strokeWidth={1.2} aria-hidden="true" />}</div>
        <p className="library-kicker">NOW LISTENING</p>
        <h2>{book.title}</h2>
        {chapterIndex >= 0 && <p>{chapters[chapterIndex].title}</p>}
        <label className="sr-only" htmlFor="audio-progress">Playback position</label>
        <input id="audio-progress" className="library-audio-progress" type="range" min={0} max={duration || 0} step="0.1" value={Math.min(current, duration)} onChange={(event) => seek(Number(event.target.value))} disabled={!duration} />
        <div className="library-audio-times"><span>{formatTime(current)}</span><span>{formatTime(Math.max(0, duration - current))} left</span><span>{formatTime(duration)}</span></div>
        <div className="library-audio-controls">
          <button type="button" aria-label="Previous chapter" disabled={!chapters.length || chapterIndex < 0} onClick={() => seek(chapters[current - chapters[chapterIndex].start > 3 ? chapterIndex : Math.max(0, chapterIndex - 1)].start)}><SkipBack /></button>
          <button type="button" aria-label="Back 30 seconds" onClick={() => seek(current - 30)}><RotateCcw /><span>30</span></button>
          <button type="button" className="library-audio-play" aria-label={playing ? "Pause" : "Play"} onClick={() => { void togglePlayback(); }}>{playing ? <Pause /> : <Play />}</button>
          <button type="button" aria-label="Forward 30 seconds" onClick={() => seek(current + 30)}><RotateCw /><span>30</span></button>
          <button type="button" aria-label="Next chapter" disabled={chapterIndex + 1 >= chapters.length} onClick={() => seek(chapters[chapterIndex + 1].start)}><SkipForward /></button>
        </div>
        <div className="library-audio-actions">
          <button type="button" onClick={changeSpeed}><strong>{speed}x</strong><span>Speed</span></button>
          <button type="button" aria-expanded={showChapters} onClick={() => setShowChapters(!showChapters)}><ListMusic /><span>Chapters</span></button>
          <button type="button" disabled={busy || !duration} onClick={() => { void add(String(current), formatTime(current)); setShowBookmarks(true); }}><BookmarkPlus /><span>Add bookmark</span></button>
        </div>
        {showChapters && <div className="library-audio-list"><h3>Chapters</h3>{chapters.length ? <ul>{chapters.map((chapter, index) => <li key={`${chapter.start}-${index}`}><button type="button" onClick={() => seek(chapter.start)}>{chapter.title} · {formatTime(chapter.start)}</button></li>)}</ul> : <p>No chapters available.</p>}</div>}
        <div className="library-bookmarks">
          <button type="button" aria-expanded={showBookmarks} onClick={() => setShowBookmarks(!showBookmarks)}>Bookmarks ({bookmarks.length})</button>
          {showBookmarks && <ul>{bookmarks.map((bookmark) => <li key={bookmark.id}><button type="button" onClick={() => seek(Number(bookmark.position))}>{bookmark.label}</button><button type="button" disabled={busy} onClick={() => { void remove(bookmark.id); }} aria-label={`Remove ${bookmark.label}`}>Remove</button></li>)}</ul>}
        </div>
      </div>
      <audio
        ref={audioRef}
        preload="metadata"
        src={bookUrl(book)}
        onLoadedMetadata={restorePosition}
        onTimeUpdate={(event) => { setCurrent(event.currentTarget.currentTime); savePosition(event.currentTarget); }}
        onPlay={() => setPlaying(true)}
        onPause={(event) => { setPlaying(false); saveFinalPosition(event); }}
        onSeeked={saveFinalPosition}
        onEnded={(event) => { setPlaying(false); saveFinalPosition(event); }}
        onError={() => setError("Could not play this audiobook. It may be incomplete, protected, or unsupported by this browser.")}
      >
        Your browser does not support audio playback.
      </audio>
      {error && <p role="alert">{error}</p>}
      {chapterError && <p role="alert">{chapterError}</p>}
      {bookmarkError && <p role="alert">{bookmarkError}</p>}
      {wikiError && <p role="alert">{wikiError}</p>}
      {imageError && <p role="alert">Could not load the cover.</p>}
    </section>
  );
}
