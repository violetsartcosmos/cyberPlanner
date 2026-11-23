import { useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import type { LibraryBook } from "../../../shared/planner/books";
import { bookUrl } from "./book-url";

export function AudioPlayer({ book, onClose }: { book: LibraryBook; onClose: () => void }) {
  const storageKey = `cyberplanner-audiobook:${book.path}`;
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
  const lastSaved = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);

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
    if (position.seconds > 0 && Number.isFinite(audio.duration) && position.seconds < audio.duration) {
      audio.currentTime = position.seconds;
    }
  }

  function closePlayer() {
    if (audioRef.current) savePosition(audioRef.current, true);
    onClose();
  }

  return (
    <section className="panel library-audio-player" aria-label={`Listening to ${book.title}`}>
      <div className="library-reader-heading">
        <h2>{book.title}</h2>
        <button type="button" onClick={closePlayer}>Back to library</button>
      </div>
      <p>Listening position is saved in this browser on this device.</p>
      <audio
        controls
        ref={audioRef}
        preload="metadata"
        src={bookUrl(book)}
        onLoadedMetadata={restorePosition}
        onTimeUpdate={(event) => savePosition(event.currentTarget)}
        onPause={(event) => savePosition(event.currentTarget, true)}
        onSeeked={(event) => savePosition(event.currentTarget, true)}
        onEnded={(event) => savePosition(event.currentTarget, true)}
        onError={() => setError("Could not play this audiobook. It may be incomplete, protected, or unsupported by this browser.")}
      >
        Your browser does not support audio playback.
      </audio>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
